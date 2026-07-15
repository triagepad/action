import type { FixesOutput, FixPrompt, TriagedTicket } from "../core/index.js";
export type FixMode = "plan" | "pr" | "autofix";
export type Confidence = "high" | "medium" | "low";
/** How to surface feature-requests. Both are visible; default opens a backlog issue. */
export type FeatureRequestMode = "issue" | "report";
export interface RouteConfig {
    mode: FixMode;
    minConfidence: Confidence;
    featureRequests: FeatureRequestMode;
}
export type PlannedAction = {
    kind: "open-pr";
    ticket: TriagedTicket;
    fix: FixPrompt;
    autoMerge: boolean;
} | {
    kind: "plan-issue";
    ticket: TriagedTicket;
    fix: FixPrompt;
} | {
    kind: "decision-issue";
    ticket: TriagedTicket;
    fix: FixPrompt;
} | {
    kind: "feature-issue";
    ticket: TriagedTicket;
    reason: string;
} | {
    kind: "report-fixed";
    ticket: TriagedTicket;
    reason: string;
    resolvedBy: string | null;
    evidenceSource: string | null;
} | {
    kind: "report-skip";
    ticket: TriagedTicket;
    reason: string;
} | {
    kind: "report-not-eligible";
    ticket: TriagedTicket;
    fix: FixPrompt;
    reason: string;
};
export declare function routeForCi(tickets: TriagedTicket[], fixes: FixesOutput, config: RouteConfig): PlannedAction[];
/** Hidden marker embedded in PR/issue bodies so reruns can recognise handled feedback. */
export declare function feedbackMarkers(ticket: TriagedTicket): string;
/** Markdown body shared by PRs and issues: ticket, candidates, explanation, original feedback. */
export declare function ticketBody(ticket: TriagedTicket, fix: FixPrompt): string;
/**
 * Backlog issue for a feature-request: the tester's own words + a pointer to
 * the screenshot, plus the triaged summary. Never a fix — a product decision.
 */
export declare function featureIssueBody(ticket: TriagedTicket, opts?: {
    testerText?: string | null;
    screenshotRef?: string | null;
}): string;
export declare function decisionIssueBody(ticket: TriagedTicket, fix: FixPrompt): string;
