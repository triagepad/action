// Thin-action side of the brain API. Every request AND response is validated
// against the shared closed schemas — the client cannot even construct a
// payload carrying repo content (invariant, client side). The only data that
// flows up is the ResultsReport metadata; methodology/config/feedback flow down.
import { zFixContextResponse, zMethodologyResponse, zPendingResponse, zReserveResponse, zResultsReport, } from "../brain-api/schema.js";
export class BrainClient {
    baseUrl;
    apiKey;
    fetchImpl;
    constructor(baseUrl, apiKey, fetchImpl = fetch) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.fetchImpl = fetchImpl;
    }
    async call(path, init) {
        const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
            ...init,
            headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        });
        const body = await res.text();
        if (!res.ok) {
            throw new Error(`brain ${res.status} on ${path}: ${body.slice(0, 500)}`);
        }
        return JSON.parse(body);
    }
    async methodology() {
        return zMethodologyResponse.parse(await this.call("/v1/methodology"));
    }
    async pending() {
        return zPendingResponse.parse(await this.call("/v1/feedback/pending"));
    }
    /**
     * Per-ticket fix path (M9): fetch a single ticket + its stored FixPrompt and
     * the chosen output mode. Metadata only — the brain never returns repo content.
     */
    async fixContext(ticketId) {
        return zFixContextResponse.parse(await this.call(`/v1/tickets/${encodeURIComponent(ticketId)}/fix-context`));
    }
    /** Atomically reserve `count` ticket numbers; returns the first (race-free). */
    async reserveTicketNumbers(count) {
        const body = zReserveResponse.parse(await this.call("/v1/tickets/reserve", { method: "POST", body: JSON.stringify({ count }) }));
        return body.start;
    }
    async postResults(report) {
        // Validate on the way OUT too — a malformed/smuggling payload never leaves the runner.
        const body = zResultsReport.parse(report);
        await this.call("/v1/results", { method: "POST", body: JSON.stringify(body) });
    }
}
