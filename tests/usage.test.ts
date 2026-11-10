import { test } from "node:test";
import assert from "node:assert/strict";
import { BrainClient, usageReport } from "../src/action/brain.js";
import { zUsageReport } from "../src/brain-api/schema.js";
import { localiseTickets } from "../src/core/localise.js";
import { BATCH, cacheHitRate, UsageMeter } from "../src/core/usage.js";
import { bug, methodology, repo, scriptedClient, usage } from "./helpers.js";

test("meter prices input, output, cache read (0.1x) and cache write (1.25x)", () => {
  const m = new UsageMeter();
  m.add("claude-opus-4-8", usage(1_000_000, 0, 0, 0), "TP-1");
  m.add("claude-opus-4-8", usage(0, 1_000_000, 1_000_000, 1_000_000), "TP-1");
  const t = m.ticket("TP-1");
  assert.equal(t.requests, 2);
  // $5 input + $25 output + $0.50 read + $6.25 write
  assert.ok(Math.abs(t.costUsd! - 36.75) < 1e-9);
  assert.equal(cacheHitRate(t), 1_000_000 / 3_000_000);
});

test("an unknown model yields cost null, never a guess", () => {
  const m = new UsageMeter();
  m.add("claude-future-9", usage(10, 10), BATCH);
  m.add("claude-haiku-4-5", usage(10, 10), "TP-1");
  assert.equal(m.batch().costUsd, null);
  assert.equal(m.total().costUsd, null);
  assert.notEqual(m.ticket("TP-1").costUsd, null);
});

test("localisation records every messages.create call against its ticket", async () => {
  const { client, requests } = scriptedClient(2);
  const meter = new UsageMeter();
  await localiseTickets({
    client,
    models: { triage: "claude-opus-4-8" },
    methodology: methodology(),
    tickets: [bug("TP-1"), bug("TP-2"), bug("TP-3", { isRealBug: false, category: "praise" })],
    repo: repo(),
    readAttachment: () => null,
    appContext: "Stopa",
    usage: meter,
  });
  assert.equal(meter.total().requests, requests.length);
  assert.equal(meter.ticket("TP-1").requests, 4);
  assert.equal(meter.ticket("TP-2").requests, 4);
  assert.equal(meter.ticket("TP-3").requests, 0, "skipped tickets cost nothing");
  assert.ok(meter.ticket("TP-1").cacheReadTokens > 0);
});

test("usage report is closed: ids, model names and numbers only", () => {
  const m = new UsageMeter();
  m.add("claude-opus-4-8", usage(), "TP-1");
  const report = usageReport("run-1", m, ["TP-1", "TP-9"]);
  assert.deepEqual(report.tickets.map((t) => t.ticketId), ["TP-1"]);
  zUsageReport.parse(report);
  assert.throws(() => zUsageReport.parse({ ...report, fileTree: "App/A.swift" }), /nrecognized/);
  assert.throws(() =>
    zUsageReport.parse({ ...report, total: { ...report.total, note: "App/A.swift" } }),
  );
});

test("postUsage is best-effort: a brain without the route never fails the run", async () => {
  const calls: string[] = [];
  const notFound = (async (url: string) => {
    calls.push(String(url));
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  const brain = new BrainClient("https://brain.test", "k", notFound);
  const logs: string[] = [];
  const ok = await brain.postUsage(usageReport("r", new UsageMeter(), []), (l) => logs.push(l));
  assert.equal(ok, false);
  assert.deepEqual(calls, ["https://brain.test/v1/usage"]);
  assert.match(logs[0]!, /404/);
});
