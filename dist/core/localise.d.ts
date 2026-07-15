import type Anthropic from "@anthropic-ai/sdk";
import type { FixedTicket, FixesOutput, FixPrompt, LocalisationCandidate, NeedsDecision, RepoAccess, TriagedTicket } from "./types.js";
import { type MethodologyBundle } from "./methodology.js";
export interface LocaliseOptions {
    client: Anthropic;
    models: {
        triage: string;
    };
    /** Prompt templates + schemas — fetched from the Triagepad brain (GET /v1/methodology). */
    methodology: MethodologyBundle;
    tickets: TriagedTicket[];
    repo: RepoAccess;
    /** Resolve an opaque attachment key (crashLogPath) to bytes; null when unavailable. */
    readAttachment: (path: string) => Buffer | null;
    appContext: string;
    log?: (message: string) => void;
}
export interface StaleAssessment {
    /** Layer A — the authoritative verdict about the top candidate location. */
    codeAtHead: "defect-present" | "defect-absent" | "inconclusive";
    codeReason: string | null;
    /** Layer C — git-history corroboration; never a verdict by itself. */
    historyEvidence: string | null;
    /** Layer D — tracker/changelog hint; informational only. */
    trackerHint: string | null;
    resolvedBy: string | null;
}
/** What the agent's final structured turn parses into. */
export interface LocalisationAgentResult {
    candidates: Omit<LocalisationCandidate, "verification">[];
    overallConfidence: FixPrompt["overallConfidence"];
    staleAssessment: StaleAssessment;
    needsDecision: NeedsDecision;
    promptBody: string;
    explanation: string;
}
export type LocalisationRoute = {
    kind: "fixed";
    ticket: FixedTicket;
} | {
    kind: "processed";
    fix: FixPrompt;
};
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
export declare function routeLocalisation(bug: TriagedTicket, parsed: LocalisationAgentResult, repo: RepoAccess): LocalisationRoute;
export declare function localiseTickets(opts: LocaliseOptions): Promise<FixesOutput>;
