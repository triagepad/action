// Token + cost accounting for every model call the pipeline makes.
//
// A UsageMeter is passed into triageFeedback / localiseTickets; each
// messages.create result is added with the ticket it belongs to (or the batch,
// for clustering). Totals are what the action reports back to the brain so
// runs.tokens / runs.cost can finally be written. Pure: no env, no I/O.
const p = (input, output, cacheRead = input * 0.1) => ({
    input,
    output,
    cacheRead,
    cacheWrite: input * 1.25,
});
/** List prices (Anthropic first-party API). Unknown model -> cost null, never a guess. */
export const MODEL_PRICES = {
    "claude-opus-4-8": p(5, 25),
    "claude-opus-4-7": p(5, 25),
    "claude-opus-4-6": p(5, 25),
    "claude-opus-5": p(5, 25),
    "claude-opus-5-5": p(4, 20, 0.2),
    "claude-sonnet-5": p(2, 10),
    "claude-sonnet-5-5": p(2, 10, 0.1),
    "claude-sonnet-4-6": p(3, 15),
    "claude-haiku-4-5": p(1, 5),
    "claude-haiku-5-5": p(0.1, 0.5),
};
export function priceOf(model) {
    return MODEL_PRICES[model] ?? MODEL_PRICES[model.replace(/-\d{8}$/, "")] ?? null;
}
const empty = () => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    requests: 0,
    costUsd: 0,
});
/** Bucket for calls that serve the whole batch (clustering), not one ticket. */
export const BATCH = "__batch__";
export class UsageMeter {
    buckets = new Map();
    byModel = new Map();
    add(model, usage, bucket = BATCH) {
        if (!usage)
            return;
        const read = usage.cache_read_input_tokens ?? 0;
        const write = usage.cache_creation_input_tokens ?? 0;
        const price = priceOf(model);
        const cost = price
            ? (usage.input_tokens * price.input +
                usage.output_tokens * price.output +
                read * price.cacheRead +
                write * price.cacheWrite) /
                1_000_000
            : null;
        for (const [map, key] of [
            [this.buckets, bucket],
            [this.byModel, model],
        ]) {
            const t = map.get(key) ?? empty();
            t.inputTokens += usage.input_tokens;
            t.outputTokens += usage.output_tokens;
            t.cacheReadTokens += read;
            t.cacheCreationTokens += write;
            t.requests += 1;
            t.costUsd = t.costUsd === null || cost === null ? null : t.costUsd + cost;
            map.set(key, t);
        }
    }
    /**
     * Add totals measured elsewhere (claude -p reports its own usage and cost,
     * including subagents) instead of pricing them here.
     */
    addMeasured(model, measured, bucket = BATCH) {
        const t = { requests: 1, ...measured };
        this.buckets.set(bucket, merge(this.buckets.get(bucket), t));
        this.byModel.set(model, merge(this.byModel.get(model), t));
    }
    /** Re-key a bucket (tickets get their final id after triage numbering). */
    rename(from, to) {
        const t = this.buckets.get(from);
        if (!t || from === to)
            return;
        this.buckets.delete(from);
        this.buckets.set(to, merge(this.buckets.get(to), t));
    }
    ticket(id) {
        return { ...(this.buckets.get(id) ?? empty()) };
    }
    tickets() {
        const out = {};
        for (const [k, v] of this.buckets)
            if (k !== BATCH)
                out[k] = { ...v };
        return out;
    }
    batch() {
        return this.ticket(BATCH);
    }
    models() {
        return Object.fromEntries([...this.byModel].map(([k, v]) => [k, { ...v }]));
    }
    total() {
        let t = empty();
        for (const v of this.buckets.values())
            t = merge(t, v);
        return t;
    }
}
function merge(a, b) {
    if (!a)
        return { ...b };
    return {
        inputTokens: a.inputTokens + b.inputTokens,
        outputTokens: a.outputTokens + b.outputTokens,
        cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
        cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
        requests: a.requests + b.requests,
        costUsd: a.costUsd === null || b.costUsd === null ? null : a.costUsd + b.costUsd,
    };
}
/** Share of prompt tokens served from cache: read / (input + read + write). */
export function cacheHitRate(t) {
    const prompt = t.inputTokens + t.cacheReadTokens + t.cacheCreationTokens;
    return prompt === 0 ? 0 : t.cacheReadTokens / prompt;
}
