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
}
export declare function executeActions(cfg: ExecutorConfig, actions: PlannedAction[]): Promise<ExecutionResult[]>;
/** The no-silent-drops surface in CI: every ticket + its outcome, always. */
export declare function writeStepSummary(results: ExecutionResult[], actions: PlannedAction[]): void;
