// Thin-action side of the brain API. Every request AND response is validated
// against the shared closed schemas — the client cannot even construct a
// payload carrying repo content (invariant, client side). The only data that
// flows up is the ResultsReport metadata; methodology/config/feedback flow down.

import {
  zFixContextResponse,
  zMethodologyResponse,
  zPendingResponse,
  zReserveResponse,
  zResultsReport,
  zTicketExecution,
  zUsageReport,
  type FixContextResponse,
  type MethodologyResponse,
  type PendingResponse,
  type ResultsReport,
  type TicketExecution,
  type UsageReport,
} from "../brain-api/schema.js";
import type { UsageMeter } from "../core/usage.js";

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

  /**
   * Per-ticket fix path (M9): fetch a single ticket + its stored FixPrompt and
   * the chosen output mode. Metadata only — the brain never returns repo content.
   */
  async fixContext(ticketId: string): Promise<FixContextResponse> {
    return zFixContextResponse.parse(await this.call(`/v1/tickets/${encodeURIComponent(ticketId)}/fix-context`));
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

  /**
   * Per-ticket fix path (M9): report the single run for an existing ticket. Uses
   * a dedicated endpoint rather than /v1/results because the ticket's feedback is
   * already processed (original triage) — the batch replay guard would reject it.
   */
  async reportExecution(ticketId: string, execution: TicketExecution): Promise<void> {
    const body = zTicketExecution.parse(execution);
    await this.call(`/v1/tickets/${encodeURIComponent(ticketId)}/execution`, { method: "POST", body: JSON.stringify(body) });
  }

  /**
   * Report the run's token usage. Best-effort by design: it is sent after the
   * results are safely recorded, and a brain that predates POST /v1/usage
   * (404) or any other failure only costs a log line — never the run.
   */
  async postUsage(report: UsageReport, log: (m: string) => void = () => {}): Promise<boolean> {
    try {
      const body = zUsageReport.parse(report);
      await this.call("/v1/usage", { method: "POST", body: JSON.stringify(body) });
      return true;
    } catch (err) {
      log(`usage: not recorded by the brain (${(err as Error).message.split("\n")[0]})`);
      return false;
    }
  }
}

/** Build the wire report from a meter, limited to the tickets this run reports. */
export function usageReport(runId: string, meter: UsageMeter, ticketIds: string[]): UsageReport {
  const tickets = meter.tickets();
  return {
    runId,
    tickets: ticketIds.filter((id) => id in tickets).map((ticketId) => ({ ticketId, usage: tickets[ticketId]! })),
    batch: meter.batch(),
    byModel: Object.entries(meter.models()).map(([model, usage]) => ({ model, usage })),
    total: meter.total(),
  };
}
