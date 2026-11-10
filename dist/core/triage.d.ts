import type Anthropic from "@anthropic-ai/sdk";
import { type MethodologyBundle } from "./methodology.js";
import type { FeedbackItem, TriagedTicket } from "./types.js";
import { type UsageMeter } from "./usage.js";
export interface TriageOptions {
    client: Anthropic;
    models: {
        classify: string;
        triage: string;
    };
    /** Prompt templates + schemas — fetched from the Triagepad brain (GET /v1/methodology). */
    methodology: MethodologyBundle;
    items: FeedbackItem[];
    /** Resolve an opaque attachment key (screenshotPath/crashLogPath) to bytes; null when unavailable. */
    readAttachment: (path: string) => Buffer | null;
    /** One sentence about the app, e.g. 'Stopa, an iOS workout/activity-tracking app'. */
    appContext: string;
    /** First ticket number to assign (incremental callers pass their counter; default 1). */
    firstTicketNumber?: number;
    log?: (message: string) => void;
    /** Accumulates usage: clustering in the batch bucket, ticket writing per ticket id. */
    usage?: UsageMeter;
}
export declare function triageFeedback(opts: TriageOptions): Promise<TriagedTicket[]>;
