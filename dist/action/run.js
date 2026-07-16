// GitHub Action entry — the THIN action. Runs in the customer's CI runner:
// the repo checkout, the model pipeline and the repo access all stay HERE.
// The brain supplies methodology/config/feedback and receives result
// metadata; it never sees the repo tree (see src/brain-api/schema.ts).
//
// Feedback source:  brain (production: GET /v1/feedback/pending)
//                   asc   (self-test: pull ASC directly in-runner; dedupe
//                          still comes from the brain's processed ids)
// Inference:        byo     customer's ANTHROPIC_API_KEY -> Anthropic directly
//                   managed brain's transit-only proxy as the SDK baseURL
//
// dry_run: no ASC, no Anthropic, no gh, no brain — routes bundled fixtures.
import Anthropic from "@anthropic-ai/sdk";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { localiseTickets, triageFeedback, } from "../core/index.js";
import { localRepoAccess } from "../repo.js";
import { runPull } from "../stages/pull.js";
import { BrainClient } from "./brain.js";
import { executeActions } from "./github.js";
import { routeForCi } from "./route.js";
const ENGINE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
function input(name, fallback) {
    const value = process.env[`INPUT_${name.toUpperCase()}`] ?? fallback;
    if (value === undefined)
        throw new Error(`Missing required action input: ${name}`);
    return value;
}
function optionalInput(name) {
    return process.env[`INPUT_${name.toUpperCase()}`] || null;
}
function log(message) {
    console.error(message);
}
async function main() {
    const dryRun = input("dry_run", "false") === "true";
    const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
    if (dryRun) {
        log("dry_run: routing bundled fixtures — no ASC, no model, no GitHub writes, no brain.");
        const tickets = readJson(join(ENGINE_ROOT, "tests/fixtures/action-dryrun/tickets.json"));
        const fixes = readJson(join(ENGINE_ROOT, "tests/fixtures/action-dryrun/fixes.json"));
        const actions = routeForCi(tickets, fixes, {
            mode: (optionalInput("mode") ?? "pr"),
            minConfidence: (optionalInput("min_confidence") ?? "high"),
            featureRequests: (optionalInput("feature_requests") ?? "issue"),
        });
        await executeActions({
            repoDir: workspace,
            githubToken: "",
            anthropicApiKey: "",
            agentAllowedTools: input("agent_allowed_tools", "Edit,Write,Read,Grep,Glob"),
            defaultBranch: detectDefaultBranch(workspace),
            dryRun: true,
            log,
        }, actions);
        return;
    }
    // --- 1. Authenticate to the brain; fetch methodology + config.
    const brain = new BrainClient(input("brain_url").replace(/\/$/, ""), input("triagepad_api_key"));
    const { methodology, config: brainConfig } = await brain.methodology();
    log(`brain: methodology v${methodology.version} fetched`);
    const mode = (optionalInput("mode") ?? brainConfig.defaultMode);
    const minConfidence = (optionalInput("min_confidence") ?? brainConfig.minConfidence);
    const featureRequests = (optionalInput("feature_requests") ?? "issue");
    const appContext = optionalInput("app_context") ?? brainConfig.appContext;
    const models = {
        classify: optionalInput("classify_model") ?? brainConfig.models.classify,
        triage: optionalInput("triage_model") ?? brainConfig.models.triage,
    };
    // --- 2. Inference: BYO straight to Anthropic, or managed via the brain proxy.
    const inference = input("inference", "byo");
    const client = inference === "managed"
        ? new Anthropic({ baseURL: `${input("brain_url").replace(/\/$/, "")}/v1/inference`, authToken: input("triagepad_api_key") })
        : new Anthropic({ apiKey: input("anthropic_api_key") });
    if (inference === "byo")
        process.env.ANTHROPIC_API_KEY = input("anthropic_api_key");
    // Ambient run identity — the same GitHub Actions run for every execution here,
    // threaded into the report so the brain can link each result to its exact run.
    const runId = process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;
    const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
    const runArtifactUrl = process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
        ? `${server}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null;
    const anthropicApiKey = inference === "byo" ? input("anthropic_api_key") : "";
    const mapExecutions = (results) => results.map((r) => ({
        ticketId: r.ticketId,
        outcome: r.outcome,
        url: r.url,
        runId,
        runUrl: runArtifactUrl,
        prUrl: r.prUrl ?? null,
        status: r.status ?? null,
    }));
    // --- Per-ticket fix path (M9). Triggered by the dashboard's dispatch button,
    // which fires repository_dispatch `triagepad-ticket` with client_payload the
    // workflow forwards as `ticket_id` (+ `mode`). We fetch just this ticket's
    // stored fix from the brain (metadata only — the repo tree never leaves CI),
    // localise-execute exactly it, and report the single run back. No feedback
    // pull / reserve / dedupe — that's the batch path below.
    const ticketId = optionalInput("ticket_id");
    if (ticketId) {
        log(`per-ticket fix: ${ticketId} (mode=${mode})`);
        const { ticket, fix } = await brain.fixContext(ticketId);
        const fixes = {
            version: 1,
            generatedAt: new Date().toISOString(),
            processed: fix ? [fix] : [],
            skipped: [],
            fixed: [],
        };
        const actions = routeForCi([ticket], fixes, { mode, minConfidence, featureRequests });
        const results = await executeActions({
            repoDir: workspace,
            githubToken: input("github_token"),
            anthropicApiKey,
            agentAllowedTools: input("agent_allowed_tools", "Edit,Write,Read,Grep,Glob"),
            defaultBranch: detectDefaultBranch(workspace),
            dryRun: false,
            log,
            runArtifactUrl,
        }, actions);
        // Report via the per-ticket endpoint — NOT /v1/results: the ticket's feedback
        // was already processed by the original triage, so the batch replay guard
        // would reject a results report. routeForCi yields exactly one action here.
        for (const e of mapExecutions(results)) {
            await brain.reportExecution(ticketId, e);
        }
        log(`Done: per-ticket ${ticketId} → ${results.map((r) => r.outcome).join("; ")}`);
        return;
    }
    const outRoot = join(process.env.RUNNER_TEMP ?? tmpdir(), "triagepad-out");
    mkdirSync(join(outRoot, "raw"), { recursive: true });
    // --- 3. Feedback + dedupe/numbering (the brain owns both).
    const pending = await brain.pending();
    const source = input("feedback_source", input("source", "brain"));
    let newItems;
    let selfPulled = false;
    if (source === "asc") {
        // Self-test path: pull ASC directly in the runner — no tunnel needed.
        const pullConfig = ascPullConfig(outRoot, appContext, models);
        const snapshot = await runPull(pullConfig);
        const processed = new Set(pending.processedFeedbackIds);
        const pendingIds = new Set(pending.items.map((i) => i.id));
        newItems = snapshot.filter((i) => !processed.has(i.id) && !pendingIds.has(i.id));
        // Anything the brain already holds as pending is picked up too, from its copy.
        newItems = [...pending.items, ...newItems];
        selfPulled = true;
    }
    else {
        newItems = pending.items;
    }
    // Materialise brain-served attachments so readAttachment resolves them.
    for (const [key, base64] of Object.entries(pending.attachments)) {
        const full = join(outRoot, key);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, Buffer.from(base64, "base64"));
    }
    if (newItems.length === 0) {
        log("No pending feedback.");
        appendSummary(`## Triagepad run\n\nNo pending feedback.\n`);
        return;
    }
    // --- 4. The pipeline, locally, with the brain-served methodology.
    // Reserve ticket numbers atomically (race-free) — an upper bound of one per
    // feedback item; clustering may use fewer, leaving harmless gaps.
    const firstTicketNumber = await brain.reserveTicketNumbers(newItems.length);
    const readAttachment = (path) => {
        const full = join(outRoot, path);
        return existsSync(full) ? readFileSync(full) : null;
    };
    const tickets = await triageFeedback({
        client,
        models,
        methodology: methodology,
        items: newItems,
        appContext,
        firstTicketNumber,
        readAttachment,
        log,
    });
    const fixes = await localiseTickets({
        client,
        models,
        methodology: methodology,
        tickets,
        repo: localRepoAccess(workspace),
        appContext,
        readAttachment,
        log,
    });
    writeFileSync(join(outRoot, "fixes.json"), JSON.stringify(fixes, null, 2));
    // --- 5. Route + execute (PRs via the GitHub App token).
    const actions = routeForCi(tickets, fixes, { mode, minConfidence, featureRequests });
    const feedbackLookup = new Map(newItems.map((i) => [i.id, { text: i.text, screenshotPath: i.screenshotPath }]));
    const results = await executeActions({
        repoDir: workspace,
        githubToken: input("github_token"),
        anthropicApiKey,
        agentAllowedTools: input("agent_allowed_tools", "Edit,Write,Read,Grep,Glob"),
        defaultBranch: detectDefaultBranch(workspace),
        dryRun: false,
        log,
        feedbackLookup,
        runArtifactUrl,
    }, actions);
    // --- 6. Report metadata back (closed schema; no repo content can ride along).
    await brain.postResults({
        runId,
        feedbackIds: newItems.map((i) => i.id),
        feedbackItems: selfPulled ? newItems.filter((i) => !pending.items.some((p) => p.id === i.id)) : [],
        tickets,
        fixes,
        executions: mapExecutions(results),
    });
    log(`Done: ${tickets.length} ticket(s) routed, results reported to the brain.`);
}
/** Config shim for runPull when the self-test pulls ASC directly in the runner. */
function ascPullConfig(outRoot, appContext, models) {
    const keyPath = join(tmpdir(), `asc-key-${process.pid}.p8`);
    writeFileSync(keyPath, input("asc_private_key"), { mode: 0o600 });
    return {
        asc: {
            issuerId: input("asc_issuer_id"),
            keyId: input("asc_key_id"),
            privateKeyPath: keyPath,
            appId: input("asc_app_id"),
        },
        feedbackLimit: Number(input("feedback_limit", "25")),
        stopaRepoPath: process.env.GITHUB_WORKSPACE ?? process.cwd(),
        appContext,
        anthropicApiKey: optionalInput("anthropic_api_key") ?? "",
        models,
        out: {
            root: outRoot,
            raw: join(outRoot, "raw"),
            tickets: join(outRoot, "tickets"),
            fixes: join(outRoot, "fixes"),
            reportFile: join(outRoot, "report.md"),
        },
        server: {}, // unused in CI
    };
}
function detectDefaultBranch(repoDir) {
    try {
        const event = process.env.GITHUB_EVENT_PATH;
        if (event && existsSync(event)) {
            const payload = JSON.parse(readFileSync(event, "utf8"));
            if (payload.repository?.default_branch)
                return payload.repository.default_branch;
        }
    }
    catch {
        /* fall through */
    }
    try {
        const ref = execFileSync("git", ["-C", repoDir, "symbolic-ref", "refs/remotes/origin/HEAD"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        return ref.replace("refs/remotes/origin/", "");
    }
    catch {
        return "main";
    }
}
function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}
function appendSummary(text) {
    const path = process.env.GITHUB_STEP_SUMMARY;
    if (path)
        writeFileSync(path, text, { flag: "a" });
    console.log(text);
}
await main();
