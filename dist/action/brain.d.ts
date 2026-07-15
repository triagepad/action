import { type MethodologyResponse, type PendingResponse, type ResultsReport } from "../brain-api/schema.js";
export declare class BrainClient {
    private readonly baseUrl;
    private readonly apiKey;
    private readonly fetchImpl;
    constructor(baseUrl: string, apiKey: string, fetchImpl?: typeof fetch);
    private call;
    methodology(): Promise<MethodologyResponse>;
    pending(): Promise<PendingResponse>;
    /** Atomically reserve `count` ticket numbers; returns the first (race-free). */
    reserveTicketNumbers(count: number): Promise<number>;
    postResults(report: ResultsReport): Promise<void>;
}
