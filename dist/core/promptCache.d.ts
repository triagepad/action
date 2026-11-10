import type Anthropic from "@anthropic-ai/sdk";
export declare const EPHEMERAL: {
    readonly type: "ephemeral";
};
export interface LocalisePromptVars {
    appContext: string;
    layerB: string;
    layerC: string;
    ticket: string;
    crashSection: string;
    fileTree: string;
}
export interface LocalisePromptBlocks {
    /** Run-wide prefix. Null when the template could not be split (fallback). */
    shared: string | null;
    /** Per-ticket content (or, in the fallback, the whole rendered prompt). */
    ticket: string;
}
export declare function splitLocalisePrompt(template: string, vars: LocalisePromptVars): LocalisePromptBlocks;
/** The first user message: shared prefix + ticket, each with a breakpoint. */
export declare function localiseFirstMessage(blocks: LocalisePromptBlocks): Anthropic.MessageParam;
/**
 * Move the incremental-history breakpoint to the last block of the newest
 * user message (the latest tool results). Older markers on tool_result
 * blocks are removed — a marker is not part of the cached bytes, so moving
 * it never invalidates anything, and it keeps us under the 4-breakpoint cap.
 * The two markers on the first message (shared, ticket) are left alone.
 */
export declare function moveTailBreakpoint(messages: Anthropic.MessageParam[]): void;
/** Drop every marker except the shared-prefix one (for a request whose tail cannot be reused). */
export declare function keepOnlySharedBreakpoint(messages: Anthropic.MessageParam[], hasShared: boolean): void;
