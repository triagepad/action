// Pure CI routing: FixesOutput + tickets + action config -> planned actions.
// No IO, no gh, no model — unit-testable. The gates mirror the contract:
//   - needs-decision  => decision issue, NEVER a PR
//   - fixed/stale     => reported, never actioned
//   - skipped / low confidence / validation-failed => explicit report lines
// Nothing is ever silently dropped: every ticket produces exactly one action.
const CONFIDENCE_RANK = { low: 1, medium: 2, high: 3 };
export function routeForCi(tickets, fixes, config) {
    const actions = [];
    for (const ticket of tickets) {
        const skip = fixes.skipped.find((s) => s.ticketId === ticket.id);
        if (skip) {
            // Feature-requests are not bugs (so not localised → skipped by the core),
            // but they must still be SURFACED — never silently lost. Default: a
            // labeled backlog issue; report-only when configured.
            if (ticket.category === "feature-request" && config.featureRequests === "issue") {
                actions.push({ kind: "feature-issue", ticket, reason: skip.reason });
            }
            else {
                actions.push({ kind: "report-skip", ticket, reason: skip.reason });
            }
            continue;
        }
        const fixed = (fixes.fixed ?? []).find((f) => f.ticketId === ticket.id);
        if (fixed) {
            actions.push({
                kind: "report-fixed",
                ticket,
                reason: fixed.reason,
                resolvedBy: fixed.resolvedBy,
                evidenceSource: fixed.evidenceSource ?? null,
            });
            continue;
        }
        const fix = fixes.processed.find((f) => f.ticketId === ticket.id);
        if (!fix) {
            // Contract violation upstream would be the only way here — still never silent.
            actions.push({ kind: "report-skip", ticket, reason: "no localisation result in fixes.json" });
            continue;
        }
        if (fix.needsDecision.required) {
            actions.push({ kind: "decision-issue", ticket, fix });
            continue;
        }
        if (!fix.validationPassed) {
            actions.push({ kind: "report-not-eligible", ticket, fix, reason: "validation gate failed on the top candidate" });
            continue;
        }
        if (CONFIDENCE_RANK[fix.overallConfidence] < CONFIDENCE_RANK[config.minConfidence]) {
            actions.push({
                kind: "report-not-eligible",
                ticket,
                fix,
                reason: `overall confidence ${fix.overallConfidence} below threshold ${config.minConfidence}`,
            });
            continue;
        }
        if (config.mode === "plan") {
            actions.push({ kind: "plan-issue", ticket, fix });
        }
        else {
            actions.push({ kind: "open-pr", ticket, fix, autoMerge: config.mode === "autofix" });
        }
    }
    return actions;
}
/** Hidden marker embedded in PR/issue bodies so reruns can recognise handled feedback. */
export function feedbackMarkers(ticket) {
    return ticket.feedbackIds.map((id) => `<!-- triagepad:feedback:${id} -->`).join("\n");
}
/** Markdown body shared by PRs and issues: ticket, candidates, explanation, original feedback. */
export function ticketBody(ticket, fix) {
    return [
        `**Category:** ${ticket.category} · **Severity:** ${ticket.severity} · ` +
            `**Confidence:** ${fix.overallConfidence} · **Validation:** ${fix.validationPassed ? "passed" : "failed"} · ` +
            `**Reports:** ${ticket.feedbackIds.length}`,
        "",
        `### What happened`,
        ticket.whatHappened,
        "",
        `### Likely repro`,
        ...ticket.likelyRepro.map((s, i) => `${i + 1}. ${s}`),
        "",
        `### Ranked candidates`,
        "",
        `| # | File | Line | Confidence | Signal | Verification |`,
        `|---|------|------|------------|--------|--------------|`,
        ...fix.candidates.map((c, i) => `| ${i + 1} | \`${c.file}\` | ${c.line ?? "–"} | ${c.confidence.toFixed(2)} | ${c.signal} | ${c.verification.status} |`),
        "",
        `### Explanation`,
        fix.explanation,
        "",
        feedbackMarkers(ticket),
        "",
        `_Opened by Triagepad from TestFlight feedback (${ticket.feedbackIds.join(", ")})._`,
    ].join("\n");
}
/**
 * Backlog issue for a feature-request: the tester's own words + a pointer to
 * the screenshot, plus the triaged summary. Never a fix — a product decision.
 */
export function featureIssueBody(ticket, opts) {
    return [
        `Tester feature-request, surfaced by Triagepad — not a bug, not auto-fixed.`,
        "",
        ...(opts?.testerText ? [`### Tester said`, `> ${opts.testerText.replace(/\n/g, "\n> ")}`, ""] : []),
        `### Triaged summary`,
        ticket.whatHappened,
        "",
        `- **Area:** ${ticket.affectedArea}`,
        `- **Device:** ${ticket.device ?? "?"} · iOS ${ticket.osVersion ?? "?"} · build ${ticket.build ?? "?"}`,
        ...(opts?.screenshotRef ? [`- **Screenshot:** ${opts.screenshotRef}`] : []),
        "",
        feedbackMarkers(ticket),
        "",
        `_Surfaced by Triagepad from TestFlight feedback (${ticket.feedbackIds.join(", ")})._`,
    ].join("\n");
}
export function decisionIssueBody(ticket, fix) {
    return [
        `This ticket needs a human decision before any fix is dispatched — it will never auto-apply.`,
        "",
        `**Why:** ${fix.needsDecision.reason ?? "see options"}`,
        "",
        `### Options`,
        ...fix.needsDecision.options.map((o) => `- **${o.label}** — ${o.tradeoff}`),
        "",
        `### How to proceed`,
        `Pick an option, then either re-run the workflow after resolving, or use the Triagepad MCP ` +
            `\`get_fix_prompt\` with \`decision\` set to the chosen option and run the fix locally.`,
        "",
        ticketBody(ticket, fix),
    ].join("\n");
}
