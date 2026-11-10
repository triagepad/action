import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileLedger } from "../src/action/ledger.js";
import { ledgerKey } from "../src/core/ledger.js";
import { localiseTickets } from "../src/core/localise.js";
import type { RepoAccess, TriagedTicket } from "../src/core/types.js";
import { bug, methodology, repo, scriptedClient } from "./helpers.js";

const atHead = (sha: string): RepoAccess => repo({ history: () => [{ sha, date: "d", subject: "s" }] });

function run(dir: string, tickets: TriagedTicket[], r: RepoAccess) {
  const { client, requests } = scriptedClient(1);
  return localiseTickets({
    client,
    models: { triage: "claude-opus-4-8" },
    methodology: methodology(),
    tickets,
    repo: r,
    readAttachment: () => null,
    appContext: "Stopa",
    ledger: fileLedger(dir),
  }).then((out) => ({ out, requests }));
}

test("same feedback at the same HEAD: the re-dispatch reuses the result under the new ticket id, zero model calls", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tp-ledger-"));
  const first = await run(dir, [bug("ticket-101", { feedbackIds: ["fb-b", "fb-a"] })], atHead("abc1234"));
  assert.ok(first.requests.length > 0);
  // Next dispatch: brain re-sends the same pending feedback, numbering mints a new id.
  const again = await run(dir, [bug("ticket-107", { feedbackIds: ["fb-a", "fb-b"] })], atHead("abc1234"));
  assert.equal(again.requests.length, 0);
  assert.equal(again.out.processed.length, 1);
  assert.equal(again.out.processed[0]!.ticketId, "ticket-107");
  assert.deepEqual(again.out.processed[0]!.candidates, first.out.processed[0]!.candidates);
});

test("a new HEAD, different feedback, or a different model re-runs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tp-ledger-"));
  await run(dir, [bug("t1", { feedbackIds: ["fb-1"] })], atHead("abc1234"));
  assert.ok((await run(dir, [bug("t2", { feedbackIds: ["fb-1"] })], atHead("def5678"))).requests.length > 0);
  assert.ok((await run(dir, [bug("t3", { feedbackIds: ["fb-2"] })], atHead("abc1234"))).requests.length > 0);
  const t = bug("t", { feedbackIds: ["fb-1"] });
  assert.notEqual(ledgerKey(t, "abc1234", "claude-opus-4-8"), ledgerKey(t, "abc1234", "claude-sonnet-5"));
});

test("no git HEAD -> ledger stays inactive (never reuses blindly)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tp-ledger-"));
  await run(dir, [bug("t1")], repo());
  assert.equal(readdirSync(dir).length, 0);
  assert.ok((await run(dir, [bug("t2", { feedbackIds: ["fb-t1"] })], repo())).requests.length > 0);
});

test("a corrupt ledger file reads as a miss", () => {
  const dir = mkdtempSync(join(tmpdir(), "tp-ledger-"));
  const l = fileLedger(dir);
  l.put("k", { kind: "fixed", ticket: { ticketId: "t", reason: "r", resolvedBy: null, evidenceSource: "code" } });
  assert.equal(l.get("k")?.kind, "fixed");
  writeFileSync(join(dir, readdirSync(dir)[0]!), "{not json");
  assert.equal(l.get("k"), null);
});
