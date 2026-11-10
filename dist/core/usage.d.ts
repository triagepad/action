import type Anthropic from "@anthropic-ai/sdk";
export interface TokenTotals {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    requests: number;
    /** USD at list price; null when any contributing model has no known price. */
    costUsd: number | null;
}
/** USD per million tokens. Cache write = 5-minute TTL (1.25x input). */
interface Price {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
}
/** List prices (Anthropic first-party API). Unknown model -> cost null, never a guess. */
export declare const MODEL_PRICES: Record<string, Price>;
export declare function priceOf(model: string): Price | null;
/** Bucket for calls that serve the whole batch (clustering), not one ticket. */
export declare const BATCH = "__batch__";
export declare class UsageMeter {
    private readonly buckets;
    private readonly byModel;
    add(model: string, usage: Anthropic.Usage | null | undefined, bucket?: string): void;
    /**
     * Add totals measured elsewhere (claude -p reports its own usage and cost,
     * including subagents) instead of pricing them here.
     */
    addMeasured(model: string, measured: Omit<TokenTotals, "requests"> & {
        requests?: number;
    }, bucket?: string): void;
    /** Re-key a bucket (tickets get their final id after triage numbering). */
    rename(from: string, to: string): void;
    ticket(id: string): TokenTotals;
    tickets(): Record<string, TokenTotals>;
    batch(): TokenTotals;
    models(): Record<string, TokenTotals>;
    total(): TokenTotals;
}
/** Share of prompt tokens served from cache: read / (input + read + write). */
export declare function cacheHitRate(t: TokenTotals): number;
export {};
