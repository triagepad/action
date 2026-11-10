import type { FixedTicket, FixPrompt, TriagedTicket } from "./types.js";
export type LedgerEntry = {
    kind: "fixed";
    ticket: FixedTicket;
} | {
    kind: "processed";
    fix: FixPrompt;
};
export interface LocalisationLedger {
    get(key: string): LedgerEntry | null;
    put(key: string, entry: LedgerEntry): void;
}
export declare function ledgerKey(bug: TriagedTicket, headSha: string, model: string): string;
/** A stored entry re-labelled for this run's ticket id (numbers are re-minted per run). */
export declare function relabel(entry: LedgerEntry, ticketId: string): LedgerEntry;
