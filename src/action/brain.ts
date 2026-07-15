// Thin-action side of the brain API. Every request AND response is validated
// against the shared closed schemas — the client cannot even construct a
// payload carrying repo content (invariant, client side). The only data that
// flows up is the ResultsReport metadata; methodology/config/feedback flow down.

import {
  zMethodologyResponse,
  zPendingResponse,
  zReserveResponse,
  zResultsReport,
  type MethodologyResponse,
  type PendingResponse,
  type ResultsReport,
} from "../brain-api/schema.js";

export class BrainClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call(path: string, init?: RequestInit): Promise<unknown> {
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

  async methodology(): Promise<MethodologyResponse> {
    return zMethodologyResponse.parse(await this.call("/v1/methodology"));
  }

  async pending(): Promise<PendingResponse> {
    return zPendingResponse.parse(await this.call("/v1/feedback/pending"));
  }

  /** Atomically reserve `count` ticket numbers; returns the first (race-free). */
  async reserveTicketNumbers(count: number): Promise<number> {
    const body = zReserveResponse.parse(
      await this.call("/v1/tickets/reserve", { method: "POST", body: JSON.stringify({ count }) }),
    );
    return body.start;
  }

  async postResults(report: ResultsReport): Promise<void> {
    // Validate on the way OUT too — a malformed/smuggling payload never leaves the runner.
    const body = zResultsReport.parse(report);
    await this.call("/v1/results", { method: "POST", body: JSON.stringify(body) });
  }
}
