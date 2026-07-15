// The one shared ticket state machine. Status is DERIVED (never stored as a
// second source of truth) from the fix disposition + executions + the human
// action inputs, so the CI-driven path (/v1/results) and the dashboard-driven
// path (dismiss/decision/dispatch) can never diverge — each only records its
// own inputs and this function derives the same status for both.

import type { FixPrompt, FixedTicket, SkippedTicket, TriagedTicket } from "./types.js";

export type TicketStatus =
  | "new"
  | "triaged"
  | "needs-decision"
  | "pr-open"
  | "merged"
  | "fixed-stale"
  | "feature-request"
  | "dropped";

export type FixMode = "plan" | "pr" | "autofix";

/** Human-action inputs the dashboard records; the CI path leaves them null. */
export interface TicketActionInputs {
  dismissedAt: string | null;
  decisionOption: number | null;
  dispatchedMode: FixMode | null;
}

export interface TicketStatusInput {
  ticket: Pick<TriagedTicket, "category">;
  fix: FixPrompt | null;
  skipped: SkippedTicket | null;
  fixed: FixedTicket | null;
  executions: { outcome: string; url: string | null }[];
  actions: TicketActionInputs;
}

/** A real Triagepad fix PR — a /pull/ URL or an explicit "PR opened". NOT an
 * issue (feature-request backlog / decision / plan issues all say "…opened" too). */
function isFixPrExecution(e: { outcome: string; url: string | null }): boolean {
  if (e.url && /\/pull\/\d+/.test(e.url)) return true;
  return /\bpr opened\b/i.test(e.outcome);
}
function isMergedExecution(e: { outcome: string; url: string | null }): boolean {
  // "merged" only appears in a genuine merge outcome — fixed/stale says "already
  // fixed by PR #N" and feature/decision/plan issues say "…issue opened".
  return /\bmerged\b/i.test(e.outcome);
}

export function deriveTicketStatus(i: TicketStatusInput): TicketStatus {
  if (i.actions.dismissedAt) return "dropped";
  // Disposition classifies FIRST: a feature-request's backlog issue is not a PR,
  // and a fixed/stale detection is terminal — so neither is ever read as pr-open.
  if (i.skipped) return i.ticket.category === "feature-request" ? "feature-request" : "new";
  if (i.fixed) return "fixed-stale";
  // Only genuine fix PRs count as pr-open/merged (real /pull/ execution), never issues.
  if (i.executions.some(isMergedExecution)) return "merged";
  if (i.executions.some(isFixPrExecution)) return "pr-open";
  // Optimistic: a dispatched pr/autofix shows as pr-open until the run reports back.
  if (i.actions.dispatchedMode === "pr" || i.actions.dispatchedMode === "autofix") return "pr-open";
  if (i.fix?.needsDecision.required && i.actions.decisionOption === null) return "needs-decision";
  if (i.fix) return "triaged";
  return "new";
}

export interface Eligibility {
  ok: boolean;
  reason?: string;
}

/**
 * Server-side enforcement of what a mode may do — the UI cannot click past this.
 * `plan` is always allowed. `pr`/`autofix` are refused for a not-localised ticket,
 * a failed validation, or (crucially) a needs-decision ticket that hasn't been
 * decided; `autofix` is additionally refused whenever the contract forbade it
 * (prompts.autofix === null for schema/design/needs-decision changes).
 */
export function dispatchEligibility(
  fix: FixPrompt | null,
  mode: FixMode,
  decided: boolean,
): Eligibility {
  if (mode === "plan") return { ok: true };
  if (!fix) return { ok: false, reason: "ticket is not localised — nothing to dispatch" };
  if (!fix.validationPassed) return { ok: false, reason: "the localisation did not pass validation" };
  if (fix.needsDecision.required && !decided) {
    return { ok: false, reason: "this ticket needs a decision before a PR or auto-fix" };
  }
  if (mode === "autofix" && fix.prompts.autofix === null) {
    return { ok: false, reason: "auto-fix is not permitted for this ticket (schema/design/needs-decision)" };
  }
  return { ok: true };
}
