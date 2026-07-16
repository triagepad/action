import { type FixContextResponse, type MethodologyResponse, type PendingResponse, type ResultsReport, type TicketExecution } from "../brain-api/schema.js";
export declare class BrainClient {
    private readonly baseUrl;
    private readonly apiKey;
    private readonly fetchImpl;
    constructor(baseUrl: string, apiKey: string, fetchImpl?: typeof fetch);
    private call;
    methodology(): Promise<MethodologyResponse>;
    pending(): Promise<PendingResponse>;
    /**
     * Per-ticket fix path (M9): fetch a single ticket + its stored FixPrompt and
     * the chosen output mode. Metadata only — the brain never returns repo content.
     */
    fixContext(ticketId: string): Promise<FixContextResponse>;
    /** Atomically reserve `count` ticket numbers; returns the first (race-free). */
    reserveTicketNumbers(count: number): Promise<number>;
    postResults(report: ResultsReport): Promise<void>;
    /**
     * Per-ticket fix path (M9): report the single run for an existing ticket. Uses
     * a dedicated endpoint rather than /v1/results because the ticket's feedback is
     * already processed (original triage) — the batch replay guard would reject it.
     */
    reportExecution(ticketId: string, execution: TicketExecution): Promise<void>;
}
