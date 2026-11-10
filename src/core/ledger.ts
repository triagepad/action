// Localisation idempotency: the same report at the same HEAD never pays twice.
//
// Measured in the brain DB: tickets are NOT re-localised under the same id —
// every CI run reserves fresh ticket numbers. What repeats is pending feedback
// that is dispatched again before /v1/results lands (a run that crashed, timed
// out or got a 409 replay rejection). So the key is the ticket's stable
// identity — its sorted feedback ids — plus the repo commit and the model:
// a genuinely new HEAD (or a model change) re-runs, a repeated dispatch reuses.
//
// Core only defines the key and the interface; storage is injected (the action
// backs it with files restored from the GitHub Actions cache).

import type { FixedTicket, FixPrompt, TriagedTicket } from "./types.js";

export type LedgerEntry = { kind: "fixed"; ticket: FixedTicket } | { kind: "processed"; fix: FixPrompt };

export interface LocalisationLedger {
  get(key: string): LedgerEntry | null;
  put(key: string, entry: LedgerEntry): void;
}

export function ledgerKey(bug: TriagedTicket, headSha: string, model: string): string {
  return ["v1", headSha, model, ...[...bug.feedbackIds].sort()].join("\u001f");
}

/** A stored entry re-labelled for this run's ticket id (numbers are re-minted per run). */
export function relabel(entry: LedgerEntry, ticketId: string): LedgerEntry {
  return entry.kind === "fixed"
    ? { kind: "fixed", ticket: { ...entry.ticket, ticketId } }
    : { kind: "processed", fix: { ...entry.fix, ticketId } };
}
