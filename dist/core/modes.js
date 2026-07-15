// Mode-aware envelopes around one fix-prompt body.
// The content is the same; only the contract with the code agent changes.
// Pure configuration — no model calls.
export function buildPrompts(body, needsDecision) {
    const decisionNote = needsDecision.required
        ? `\n\nIMPORTANT — this ticket needs a human decision first: ${needsDecision.reason ?? "see options"}.\n` +
            needsDecision.options.map((o) => `- ${o.label}: ${o.tradeoff}`).join("\n") +
            `\nDo not pick an option yourself; the chosen option will be appended to this prompt.`
        : "";
    return {
        plan: `PLAN ONLY — do not modify any files.\n\n${body}${decisionNote}\n\n` +
            `Deliverable: a concrete implementation plan — approach, exact files to touch, risks, ` +
            `and how the fix will be verified. Stop after the plan and wait for approval.`,
        pr: `Implement this fix on a new branch and open a pull request — do not merge it.\n\n${body}${decisionNote}\n\n` +
            `Requirements: include regression tests, keep the change minimal, and describe the root cause ` +
            `and verification in the PR body.`,
        autofix: needsDecision.required
            ? null
            : `Apply this fix directly.\n\n${body}\n\n` +
                `Requirements: include regression tests, run the affected test suite, and report the outcome ` +
                `faithfully — if tests fail, say so with the output.`,
    };
}
