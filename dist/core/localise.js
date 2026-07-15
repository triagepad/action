// Localisation core: real bugs -> ranked candidates + mode-aware fix prompts.
// Per bug, a small read-only agent loop over the customer repo (RepoAccess),
// then: validation gate on every candidate, needs-decision detection, and
// the mode envelopes. Non-bug tickets are skipped EXPLICITLY with a reason —
// the FixesOutput contract never silently drops a ticket.
import { render } from "./methodology.js";
import { buildPrompts } from "./modes.js";
import { verifyCandidate } from "./validate.js";
const MAX_TOOL_TURNS = 16;
const MAX_CRASH_LOG_CHARS = 15_000;
// Tool input schemas are structural (code); the descriptions are methodology.
function buildTools(repo, m) {
    const tools = [
        {
            name: "grep",
            description: m.toolDescriptions.grep,
            input_schema: {
                type: "object",
                properties: {
                    pattern: { type: "string", description: "Substring or regex to search for" },
                    isRegex: { type: "boolean", description: "Treat pattern as a regex (default false)" },
                },
                required: ["pattern"],
            },
        },
        {
            name: "read_file",
            description: m.toolDescriptions.readFile,
            input_schema: {
                type: "object",
                properties: {
                    path: { type: "string", description: "Path relative to the repo root" },
                    startLine: { type: "integer" },
                    endLine: { type: "integer" },
                },
                required: ["path"],
            },
        },
    ];
    if (repo.history) {
        tools.push({
            name: "git_log",
            description: m.toolDescriptions.gitLog,
            input_schema: {
                type: "object",
                properties: {
                    paths: { type: "array", items: { type: "string" }, description: "Repo-relative paths (empty = whole repo)" },
                    limit: { type: "integer", description: "Max commits, default 20" },
                },
                required: ["paths"],
            },
        });
    }
    return tools;
}
/**
 * Deterministic routing of one agent result — the same defensive boundary as
 * the validation gate. Layered evidence, biased hard against false positives
 * (a missed fixed-detection is a cheap re-triage; a false "fixed" buries a
 * real bug):
 *
 *   A) code at HEAD is authoritative: defect-absent (+reason) => fixed;
 *      defect-present => NOT fixed no matter what tracker/history/build say.
 *   B+C) with codeAtHead inconclusive, fixed only when the build→commit
 *      mapping exists, the cited fix sha is a descendant of the tester's
 *      build commit, AND git-history evidence corroborates.
 *   D) tracker hints never flip a ticket by themselves.
 *
 * Precedence: fixed > needs-decision (a stale report must not wait for a
 * decision or trigger a fix run).
 */
export function routeLocalisation(bug, parsed, repo) {
    const stale = parsed.staleAssessment;
    const codeReason = stale.codeReason?.trim() ?? "";
    const resolvedBy = stale.resolvedBy?.trim() || null;
    // Layer A — authoritative.
    if (stale.codeAtHead === "defect-absent" && codeReason.length > 0) {
        return {
            kind: "fixed",
            ticket: { ticketId: bug.id, reason: codeReason, resolvedBy, evidenceSource: "code" },
        };
    }
    // Layers B+C — only when code is inconclusive (defect-present vetoes everything).
    if (stale.codeAtHead === "inconclusive") {
        const historyEvidence = stale.historyEvidence?.trim() ?? "";
        const buildSha = bug.build ? (repo.resolveBuild?.(bug.build) ?? null) : null;
        const citedSha = resolvedBy?.match(/\b[0-9a-f]{7,40}\b/i)?.[0] ?? null;
        if (buildSha &&
            citedSha &&
            historyEvidence.length > 0 &&
            repo.isAncestor?.(buildSha, citedSha) === true) {
            return {
                kind: "fixed",
                ticket: {
                    ticketId: bug.id,
                    reason: `fix landed after the tester's build ${bug.build}: ${historyEvidence}`,
                    resolvedBy,
                    evidenceSource: "build-and-history",
                },
            };
        }
    }
    // Validation gate — the model never fills verification itself.
    const candidates = parsed.candidates.map((c) => ({
        ...c,
        verification: verifyCandidate(repo, c),
    }));
    const validationPassed = candidates[0]?.verification.status === "verified";
    return {
        kind: "processed",
        fix: {
            ticketId: bug.id,
            candidates,
            overallConfidence: validationPassed ? parsed.overallConfidence : "low",
            validationPassed,
            needsDecision: parsed.needsDecision,
            promptBody: parsed.promptBody,
            prompts: buildPrompts(parsed.promptBody, parsed.needsDecision),
            explanation: parsed.explanation,
        },
    };
}
export async function localiseTickets(opts) {
    const log = opts.log ?? (() => { });
    const output = {
        version: 1,
        generatedAt: new Date().toISOString(),
        processed: [],
        skipped: [],
        fixed: [],
    };
    const fileTree = opts.repo.listFiles();
    for (const ticket of opts.tickets) {
        if (!ticket.isRealBug) {
            output.skipped.push({
                ticketId: ticket.id,
                reason: `category "${ticket.category}" is not a bug — nothing to localise`,
            });
            log(`${ticket.id}: skipped (${ticket.category})`);
            continue;
        }
        log(`${ticket.id}: ${ticket.title}`);
        const parsed = await localiseBug(opts, ticket, fileTree);
        const route = routeLocalisation(ticket, parsed, opts.repo);
        if (route.kind === "fixed") {
            output.fixed.push(route.ticket);
            log(`${ticket.id}: already fixed${route.ticket.resolvedBy ? ` (${route.ticket.resolvedBy})` : ""}`);
        }
        else {
            output.processed.push(route.fix);
        }
    }
    return output;
}
async function localiseBug(opts, bug, fileTree) {
    const crashBytes = bug.crashLogPath ? opts.readAttachment(bug.crashLogPath) : null;
    const crashLog = crashBytes ? crashBytes.toString("utf8").slice(0, MAX_CRASH_LOG_CHARS) : null;
    const m = opts.methodology;
    // Layer B context: only when the repo can map the tester's build to a commit.
    const buildSha = bug.build ? (opts.repo.resolveBuild?.(bug.build) ?? null) : null;
    const layerB = buildSha
        ? render(m.prompts.localiseLayerB, {
            buildLine: render(m.prompts.localiseBuildLine, { build: bug.build, sha: buildSha }),
        })
        : "";
    const messages = [
        {
            role: "user",
            content: render(m.prompts.localiseAgent, {
                appContext: opts.appContext,
                layerB,
                layerC: opts.repo.history ? m.prompts.localiseLayerC : "",
                ticket: JSON.stringify(bug, null, 2),
                crashSection: crashLog ? render(m.prompts.localiseCrashSection, { crashLog }) : "",
                fileTree: fileTree.join("\n"),
            }),
        },
    ];
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
        const res = await opts.client.messages.create({
            model: opts.models.triage,
            max_tokens: 4096,
            tools: buildTools(opts.repo, m),
            messages,
        });
        messages.push({ role: "assistant", content: res.content });
        if (res.stop_reason !== "tool_use")
            break;
        const results = [];
        for (const block of res.content) {
            if (block.type !== "tool_use")
                continue;
            results.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: runTool(opts.repo, block.name, block.input),
            });
        }
        messages.push({ role: "user", content: results });
    }
    // Final turn: force the structured result (no tools, JSON schema).
    messages.push({ role: "user", content: m.prompts.localiseFinal });
    const final = await opts.client.messages.create({
        model: opts.models.triage,
        max_tokens: 4096,
        output_config: { format: { type: "json_schema", schema: m.schemas.localisation } },
        messages,
    });
    const text = final.content.find((b) => b.type === "text");
    if (!text || text.type !== "text")
        throw new Error(`No final answer for ${bug.id}`);
    return JSON.parse(text.text);
}
function runTool(repo, name, input) {
    try {
        if (name === "grep") {
            const matches = repo.grep(String(input.pattern ?? ""), input.isRegex === true);
            if (matches.length === 0)
                return "No matches.";
            return matches.map((m) => `${m.file}:${m.line}: ${m.text}`).join("\n");
        }
        if (name === "read_file") {
            return repo.readFile(String(input.path ?? ""), input.startLine, input.endLine);
        }
        if (name === "git_log" && repo.history) {
            const commits = repo.history(Array.isArray(input.paths) ? input.paths.map(String) : [], input.limit ?? 20);
            if (commits.length === 0)
                return "No history available for these paths.";
            return commits.map((c) => `${c.sha} ${c.date} ${c.subject}`).join("\n");
        }
        return `Unknown tool: ${name}`;
    }
    catch (err) {
        return `Tool error: ${err.message}`;
    }
}
