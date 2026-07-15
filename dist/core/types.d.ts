/** One normalised piece of TestFlight feedback (pull output). */
export interface FeedbackItem {
    /** ASC resource id of the feedback submission. */
    id: string;
    type: "screenshot" | "crash";
    /** Tester's comment text, if any. */
    text: string | null;
    /** Opaque attachment key resolved by the caller's readAttachment. */
    screenshotPath: string | null;
    crashLogPath: string | null;
    device: string | null;
    osVersion: string | null;
    appVersion: string | null;
    build: string | null;
    locale: string | null;
    createdAt: string | null;
}
export type TicketCategory = "crash" | "ui" | "perf" | "copy" | "feature-request" | "praise";
export type TicketSeverity = "critical" | "high" | "medium" | "low";
/** One triaged ticket, possibly covering a dedup cluster of feedback items. */
export interface TriagedTicket {
    id: string;
    /** FeedbackItem ids this ticket covers (>1 = dedup cluster). */
    feedbackIds: string[];
    title: string;
    whatHappened: string;
    likelyRepro: string[];
    affectedArea: string;
    severity: TicketSeverity;
    category: TicketCategory;
    /** True for crash/ui/perf/copy — the tickets localisation processes. */
    isRealBug: boolean;
    device: string | null;
    osVersion: string | null;
    appVersion: string | null;
    build: string | null;
    screenshotPath: string | null;
    crashLogPath: string | null;
}
/** Which signal produced a localisation candidate, strongest first. */
export type LocalisationSignal = "crash-stack" | "string-literal" | "identifier";
/** Result of the programmatic validation gate on one candidate. */
export interface CandidateVerification {
    status: "verified" | "file-missing" | "line-out-of-range" | "symbol-not-found";
    detail: string | null;
}
/** One ranked candidate location in the customer repo. */
export interface LocalisationCandidate {
    /** Path relative to the repo root. */
    file: string;
    symbol: string | null;
    line: number | null;
    /** 0–1; never a single confident guess when unsure. */
    confidence: number;
    signal: LocalisationSignal;
    rationale: string;
    /** Filled by the validation gate, never by the model. */
    verification: CandidateVerification;
}
/** A choice the user must make before the fix may be dispatched. */
export interface DecisionOption {
    label: string;
    tradeoff: string;
}
/** Needs-decision is a first-class state: schema/design tickets never auto-dispatch. */
export interface NeedsDecision {
    required: boolean;
    reason: string | null;
    options: DecisionOption[];
}
/** How the fix prompt is enveloped for the code agent. */
export type FixMode = "plan" | "pr" | "autofix";
/** Localisation + fix output for one real bug. */
export interface FixPrompt {
    ticketId: string;
    /** Ranked, highest confidence first. */
    candidates: LocalisationCandidate[];
    /** Honest overall confidence in the top candidate. */
    overallConfidence: "high" | "medium" | "low";
    /** True when the top candidate passed the validation gate. */
    validationPassed: boolean;
    needsDecision: NeedsDecision;
    /**
     * The raw fix content (no mode envelope). Consumers re-envelope it, e.g.
     * to append a user's decision and rebuild the autofix prompt.
     */
    promptBody: string;
    /**
     * Mode-aware envelopes around the same fix content.
     * autofix is null when needsDecision.required — the contract itself
     * forbids silently auto-applying schema/design changes.
     */
    prompts: {
        plan: string;
        pr: string;
        autofix: string | null;
    };
    /** Plain-language explanation for a human. */
    explanation: string;
}
/** A ticket the pipeline deliberately did not localise — never a silent drop. */
export interface SkippedTicket {
    ticketId: string;
    reason: string;
}
/** Which evidence layer produced a fixed verdict. Code at HEAD is the authoritative layer. */
export type FixedEvidenceSource = "code" | "build-and-history";
/**
 * A stale report: the defect is already resolved at repo HEAD (tester was on
 * an older build). Labeled outcome — no decision wait, no fix run, no drop.
 */
export interface FixedTicket {
    ticketId: string;
    reason: string;
    /** Commit / PR reference when determinable from repo evidence, e.g. "PR #255 (1d5199c)". */
    resolvedBy: string | null;
    /**
     * The layer that produced the verdict: "code" (defect demonstrably absent at
     * HEAD — layer A) or "build-and-history" (build→commit mapping + git-history
     * corroboration — layers B+C). Tracker files are hints only and never appear
     * here. Absent on entries written before this field existed.
     */
    evidenceSource?: FixedEvidenceSource;
}
/**
 * The machine contract consumed by MCP / CI / code agents. `.md` files are views.
 * Every ticket lands in exactly one of processed | skipped | fixed.
 * `fixed` was added additively; readers must default it to [] on older files.
 */
export interface FixesOutput {
    version: 1;
    generatedAt: string;
    processed: FixPrompt[];
    skipped: SkippedTicket[];
    fixed: FixedTicket[];
}
export interface GitCommit {
    sha: string;
    date: string;
    subject: string;
}
/**
 * Read-only access to the customer repo; implementations: local fs, CI checkout, …
 * The git-backed members are optional: plain directories (no .git), tarball
 * checkouts etc. simply don't provide them and the evidence layers that need
 * them stay inactive.
 */
export interface RepoAccess {
    listFiles(): string[];
    grep(pattern: string, isRegex: boolean, maxMatches?: number): GrepMatch[];
    /** Slice of one file with 1-based line numbers prepended. */
    readFile(path: string, startLine?: number, endLine?: number): string;
    fileExists(path: string): boolean;
    /** Total lines, or null when unreadable. */
    lineCount(path: string): number | null;
    /** Recent commits touching the given paths (whole repo when empty), newest first. */
    history?(paths: string[], limit?: number): GitCommit[];
    /** Map an app build number to a commit sha (git tag / build manifest); null when unknown. */
    resolveBuild?(build: string): string | null;
    /** True when `ancestor` is an ancestor of `descendant` (both shas must exist). */
    isAncestor?(ancestor: string, descendant: string): boolean;
}
export interface GrepMatch {
    file: string;
    line: number;
    text: string;
}
