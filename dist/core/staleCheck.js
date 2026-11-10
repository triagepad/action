// Cheap stale-report pre-check (opt-in).
//
// 38 of the brain's localisation runs ended "already fixed — stale report"
// only after the full strong-model loop. The pre-check runs the SAME
// methodology (same prompt, tools, schema) on the cheap classify model with a
// shorter turn budget. It may short-circuit a ticket to the fixed route ONLY
// through a gate stricter than routeLocalisation's layer A:
//
//   1. codeAtHead = defect-absent with a non-empty codeReason (layer A), AND
//   2. resolvedBy cites a commit sha that exists and is an ancestor of HEAD, AND
//   3. when the tester's build maps to a commit, the cited fix is NOT already
//      contained in that build (the fix must have landed after the report).
//
// Anything else — defect-present, inconclusive, no cited sha, a sha the repo
// cannot verify, a parse failure — falls through to the full strong-model
// loop, so a false "fixed" needs the cheap model to cite a real, reachable,
// post-build commit AND be wrong. A missed short-circuit only costs the cheap
// pass; a false "fixed" buries a real bug, so the gate errs one way only.
//
// Off by default: enable it per run once it has been evaluated against the
// historical stale/processed tickets.
export const PRECHECK_MAX_TOOL_TURNS = 8;
/** HEAD sha via the repo's history, or null when the repo has no git. */
export function headSha(repo) {
    return repo.history?.([], 1)[0]?.sha ?? null;
}
/** The strict gate. Returns the fixed verdict, or null to run the full loop. */
export function precheckFixedRoute(bug, parsed, repo) {
    if (!parsed || !repo.isAncestor)
        return null;
    const stale = parsed.staleAssessment;
    const codeReason = stale?.codeReason?.trim() ?? "";
    if (stale?.codeAtHead !== "defect-absent" || codeReason.length === 0)
        return null;
    const resolvedBy = stale.resolvedBy?.trim() || null;
    const cited = [...(resolvedBy ?? "").matchAll(/\b[0-9a-f]{7,40}\b/gi)].map((m) => m[0]);
    if (cited.length === 0)
        return null;
    const head = headSha(repo);
    if (!head)
        return null;
    const buildSha = bug.build ? (repo.resolveBuild?.(bug.build) ?? null) : null;
    // Every cited sha must be reachable from HEAD (no hallucinated or
    // unmerged-branch commits) and, when the build resolves, newer than it.
    const ok = cited.every((sha) => repo.isAncestor(sha, head) && !(buildSha && repo.isAncestor(sha, buildSha)));
    if (!ok)
        return null;
    return {
        ticketId: bug.id,
        reason: `${codeReason} [pre-check: ${cited.join(", ")} verified as ancestor of HEAD]`,
        resolvedBy,
        evidenceSource: "code",
    };
}
