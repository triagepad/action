// File-backed localisation ledger for the CI runner. The directory is restored
// from / saved to the GitHub Actions cache by action.yml (key carries the
// commit sha), so a re-dispatch of the same feedback at the same HEAD finds
// the earlier result. One small JSON file per entry; corrupt or unreadable
// entries read as a miss — the ledger can only ever save work, never block it.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LedgerEntry, LocalisationLedger } from "../core/ledger.js";

export function fileLedger(dir: string, log: (m: string) => void = () => {}): LocalisationLedger {
  const file = (key: string) => join(dir, `${createHash("sha256").update(key).digest("hex")}.json`);
  return {
    get(key) {
      const path = file(key);
      if (!existsSync(path)) return null;
      try {
        const entry = JSON.parse(readFileSync(path, "utf8")) as { key?: string; entry?: LedgerEntry };
        return entry.key === key && entry.entry ? entry.entry : null;
      } catch {
        return null;
      }
    },
    put(key, entry) {
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file(key), JSON.stringify({ key, entry }));
      } catch (err) {
        log(`ledger: could not write (${(err as Error).message}) — continuing`);
      }
    },
  };
}
