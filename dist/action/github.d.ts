import type { PlannedAction } from "./route.js";
import type { UsageMeter } from "../core/usage.js";
export interface ExecutorConfig {
    repoDir: string;
    githubToken: string;
    anthropicApiKey: string;
    /** Claude Code tool allowlist for the fix agent; no arbitrary bash by default. */
    agentAllowedTools: string;
    /** Bounds for the headless fix agent (claude -p). Defaults: see agentLimits(). */
    agent?: Partial<AgentLimits>;
    /** Receives the fix agent's self-reported usage + cost, bucketed per ticket. */
    usage?: UsageMeter;
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
export interface AgentLimits {
    /** Model for the fix agent. Default: the localisation (triage) model. */
    model: string;
    /** Claude Code --max-turns. */
    maxTurns: number;
    /** Wall-clock limit for one fix agent run, milliseconds. */
    timeoutMs: number;
}
export declare const DEFAULT_AGENT_MAX_TURNS = 40;
export declare const DEFAULT_AGENT_TIMEOUT_MINUTES = 20;
/** Resolve the fix-agent bounds; explicit config wins, then env, then defaults. */
export declare function agentLimits(given: Partial<AgentLimits> | undefined, fallbackModel: string, env?: NodeJS.ProcessEnv): AgentLimits;
export declare function executeActions(cfg: ExecutorConfig, actions: PlannedAction[]): Promise<ExecutionResult[]>;
/** argv for the headless fix agent — bounded model, turns (the wall clock is the sh() timeout). */
export declare function agentArgs(prompt: string, allowedTools: string, limits: AgentLimits): string[];
export interface AgentResult {
    subtype?: string;
    is_error?: boolean;
    num_turns?: number;
    total_cost_usd?: number;
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
    };
}
/** The final JSON object of `claude -p --output-format json`; null when absent/unparseable. */
export declare function parseAgentResult(stdout: string): AgentResult | null;
/** The no-silent-drops surface in CI: every ticket + its outcome, always. */
export declare function writeStepSummary(results: ExecutionResult[], actions: PlannedAction[]): void;
