// Triage core: feedback items -> triaged tickets.
// Two passes to control cost: classify + dedupe/cluster on text + metadata
// (cheap model), then one ticket per cluster with vision (strong model).
// Transport-agnostic: attachments come through the injected readAttachment.
import { render } from "./methodology.js";
const REAL_BUG_CATEGORIES = ["crash", "ui", "perf", "copy"];
const MAX_IMAGES_PER_TICKET = 3;
const MAX_CRASH_LOG_CHARS = 15_000;
export async function triageFeedback(opts) {
    const log = opts.log ?? (() => { });
    if (opts.items.length === 0)
        throw new Error("triageFeedback: no feedback items");
    log(`Clustering ${opts.items.length} items (${opts.models.classify})…`);
    const clusters = await classifyAndCluster(opts);
    log(`→ ${clusters.length} clusters`);
    const first = opts.firstTicketNumber ?? 1;
    const tickets = [];
    for (const [n, cluster] of clusters.entries()) {
        const ticketId = `ticket-${String(first + n).padStart(3, "0")}`;
        log(`Writing ${ticketId} (${cluster.category}, ${cluster.feedbackIds.length} item(s), ${opts.models.triage})…`);
        tickets.push(await writeTicket(opts, ticketId, cluster));
    }
    return tickets;
}
/** Pass 1: cheap model groups items reporting the same thing and assigns a category. */
async function classifyAndCluster(opts) {
    const listing = opts.items.map((i) => ({
        id: i.id,
        type: i.type,
        text: i.text,
        device: i.device,
        osVersion: i.osVersion,
        build: i.build,
        createdAt: i.createdAt,
        hasCrashLog: i.crashLogPath !== null,
    }));
    const res = await opts.client.messages.create({
        model: opts.models.classify,
        max_tokens: 4096,
        output_config: { format: { type: "json_schema", schema: opts.methodology.schemas.cluster } },
        messages: [
            {
                role: "user",
                content: render(opts.methodology.prompts.cluster, {
                    appContext: opts.appContext,
                    items: JSON.stringify(listing, null, 2),
                }),
            },
        ],
    });
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text")
        throw new Error("Classify pass returned no text");
    const parsed = JSON.parse(text.text);
    // Guard against dropped/duplicated ids — fall back to singleton clusters for anything missed.
    const seen = new Set(parsed.clusters.flatMap((c) => c.feedbackIds));
    for (const item of opts.items) {
        if (!seen.has(item.id)) {
            parsed.clusters.push({
                feedbackIds: [item.id],
                category: item.type === "crash" ? "crash" : "ui",
                reason: "not clustered by model; kept as its own ticket",
            });
        }
    }
    return parsed.clusters;
}
/** Pass 2: strong model reads the screenshot(s) + text + metadata and writes the ticket. */
async function writeTicket(opts, ticketId, cluster) {
    const items = cluster.feedbackIds
        .map((id) => opts.items.find((i) => i.id === id))
        .filter((i) => i !== undefined);
    const first = items[0];
    if (!first)
        throw new Error(`Cluster for ${ticketId} has no items`);
    const content = [];
    for (const item of items.filter((i) => i.screenshotPath).slice(0, MAX_IMAGES_PER_TICKET)) {
        const bytes = opts.readAttachment(item.screenshotPath);
        if (!bytes)
            continue;
        content.push({
            type: "image",
            source: { type: "base64", media_type: mediaTypeOf(bytes), data: bytes.toString("base64") },
        });
    }
    const crashItem = items.find((i) => i.crashLogPath);
    const crashBytes = crashItem ? opts.readAttachment(crashItem.crashLogPath) : null;
    const crashLog = crashBytes ? crashBytes.toString("utf8").slice(0, MAX_CRASH_LOG_CHARS) : null;
    const meta = items.map((i) => ({
        id: i.id,
        text: i.text,
        device: i.device,
        osVersion: i.osVersion,
        build: i.build,
        locale: i.locale,
        createdAt: i.createdAt,
    }));
    const m = opts.methodology;
    content.push({
        type: "text",
        text: render(m.prompts.ticket, {
            appContext: opts.appContext,
            category: cluster.category,
            clusterHint: clusterHint(cluster),
            items: JSON.stringify(meta, null, 2),
            screenshotNote: content.length > 0 ? m.prompts.ticketScreenshotNote : "",
            crashSection: crashLog ? render(m.prompts.ticketCrashSection, { crashLog }) : "",
        }),
    });
    const res = await opts.client.messages.create({
        model: opts.models.triage,
        max_tokens: 2048,
        output_config: { format: { type: "json_schema", schema: m.schemas.ticket } },
        messages: [{ role: "user", content }],
    });
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text")
        throw new Error(`Ticket pass returned no text for ${ticketId}`);
    const t = JSON.parse(text.text);
    return {
        id: ticketId,
        feedbackIds: items.map((i) => i.id),
        title: t.title,
        whatHappened: t.whatHappened,
        likelyRepro: t.likelyRepro,
        affectedArea: t.affectedArea,
        severity: cluster.category === "praise" ? "low" : t.severity,
        category: cluster.category,
        isRealBug: REAL_BUG_CATEGORIES.includes(cluster.category),
        device: first.device,
        osVersion: first.osVersion,
        appVersion: first.appVersion,
        build: first.build,
        screenshotPath: items.find((i) => i.screenshotPath)?.screenshotPath ?? null,
        crashLogPath: crashItem?.crashLogPath ?? null,
    };
}
function clusterHint(cluster) {
    return cluster.feedbackIds.length > 1
        ? ` (dedup cluster of ${cluster.feedbackIds.length} reports: ${cluster.reason})`
        : "";
}
/** ASC serves JPEGs with .png names — sniff magic bytes instead of trusting the extension. */
function mediaTypeOf(bytes) {
    return bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : "image/jpeg";
}
