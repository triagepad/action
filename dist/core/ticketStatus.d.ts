import type { FixPrompt, FixedTicket, SkippedTicket, TriagedTicket } from "./types.js";
export type TicketStatus = "new" | "triaged" | "needs-decision" | "pr-open" | "merged" | "fixed-stale" | "feature-request" | "dropped";
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
    executions: {
        outcome: string;
        url: string | null;
    }[];
    actions: TicketActionInputs;
}
export declare function deriveTicketStatus(i: TicketStatusInput): TicketStatus;
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
export declare function dispatchEligibility(fix: FixPrompt | null, mode: FixMode, decided: boolean): Eligibility;
