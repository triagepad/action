import type { LocalisationAgentResult } from "./localise.js";
import type { FixedTicket, RepoAccess, TriagedTicket } from "./types.js";
export declare const PRECHECK_MAX_TOOL_TURNS = 8;
export interface StalePrecheckOptions {
    /** The cheap model (models.classify). */
    model: string;
    /** Tool turns for the cheap pass; default PRECHECK_MAX_TOOL_TURNS. */
    maxTurns?: number;
}
/** HEAD sha via the repo's history, or null when the repo has no git. */
export declare function headSha(repo: RepoAccess): string | null;
/** The strict gate. Returns the fixed verdict, or null to run the full loop. */
export declare function precheckFixedRoute(bug: TriagedTicket, parsed: LocalisationAgentResult | null, repo: RepoAccess): FixedTicket | null;
