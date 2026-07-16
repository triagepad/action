import type { PlannedAction } from "./route.js";
export interface ExecutorConfig {
    repoDir: string;
    githubToken: string;
    anthropicApiKey: string;
    /** Claude Code tool allowlist for the fix agent; no arbitrary bash by default. */
    agentAllowedTools: string;
    defaultBranch: string;
    dryRun: boolean;
    log: (message: string) => void;
    /** Raw tester feedback for feature-request issues (id -> text/screenshot). */
    feedbackLookup?: Map<string, {
        text: string | null;
        screenshotPath: string | null;
    }>;
    /** Link to this run's uploaded artifact, for referencing screenshots in issues. */
    runArtifactUrl?: string | null;
}
export interface ExecutionResult {
    ticketId: string;
    outcome: string;
    url: string | null;
    /** M9: the fix PR url when this action opened one (else null). Same as `url` for open-pr. */
    prUrl?: string | null;
    /**
     * M9: coarse status token for live per-run tracking. One of
     * pr-open | merged-armed | no-change | plan | decision | feature | skipped |
     * not-eligible | fixed. `outcome` stays the human/derivation string.
     */
    status?: string | null;
}
export declare function executeActions(cfg: ExecutorConfig, actions: PlannedAction[]): Promise<ExecutionResult[]>;
/** The no-silent-drops surface in CI: every ticket + its outcome, always. */
export declare function writeStepSummary(results: ExecutionResult[], actions: PlannedAction[]): void;
