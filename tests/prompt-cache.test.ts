import { test } from "node:test";
import assert from "node:assert/strict";
import { localiseTickets } from "../src/core/localise.js";
import { render } from "../src/core/methodology.js";
import { splitLocalisePrompt } from "../src/core/promptCache.js";
import { breakpoints, bug, methodology, repo, scriptedClient, TEMPLATE } from "./helpers.js";

const vars = {
  appContext: "Stopa, an iOS app",
  layerB: "B) BUILD MAPPING: build 42 -> abc1234\n",
  layerC: "C) GIT HISTORY.\n",
  ticket: '{\n  "id": "TP-1"\n}',
  crashSection: "## Crash log (truncated)\n```\nframe 0 $& $1\n```\n\n",
  fileTree: "App/A.swift\nApp/B.swift",
};

const sortedLines = (s: string) => s.split("\n").filter((l) => l.trim()).sort();

test("split keeps the template's text, only reordered: shared prefix first, ticket last", () => {
  const { shared, ticket } = splitLocalisePrompt(TEMPLATE, vars);
  assert.ok(shared);
  // Same content as the single-block render — nothing added, nothing lost.
  assert.deepEqual(sortedLines(shared + "\n" + ticket), sortedLines(render(TEMPLATE, vars)));
  // Per-ticket values never leak into the shared prefix.
  assert.ok(!shared.includes("TP-1") && !shared.includes("frame 0") && !shared.includes("BUILD MAPPING"));
  assert.ok(shared.includes("C) GIT HISTORY.") && shared.includes("App/B.swift") && shared.includes("## Repo file tree"));
  assert.ok(ticket.startsWith("## Ticket\n"));
  assert.ok(ticket.includes("frame 0 $& $1"), "replacement patterns in values are inserted literally");
  assert.ok(ticket.endsWith("B) BUILD MAPPING: build 42 -> abc1234"));
});

test("shared prefix is byte-identical across tickets", () => {
  const a = splitLocalisePrompt(TEMPLATE, vars);
  const b = splitLocalisePrompt(TEMPLATE, { ...vars, layerB: "", ticket: '{"id":"TP-2"}', crashSection: "" });
  assert.equal(a.shared, b.shared);
  assert.notEqual(a.ticket, b.ticket);
});

test("an unexpected template shape falls back to the original single block", () => {
  const odd = "{{fileTree}}\n{{crashSection}} between {{appContext}} {{ticket}}";
  const { shared, ticket } = splitLocalisePrompt(odd, vars);
  assert.equal(shared, null);
  assert.equal(ticket, render(odd, vars));
});

test("loop: <=4 breakpoints per request, moving tail on the latest tool results, final call keeps only the shared one", async () => {
  const { client, requests } = scriptedClient(2);
  await localiseTickets({
    client,
    models: { triage: "claude-opus-4-8" },
    methodology: methodology(),
    tickets: [bug("TP-1"), bug("TP-2")],
    repo: repo(),
    readAttachment: () => null,
    appContext: "Stopa",
  });
  // Per ticket: 2 tool turns + 1 end_turn + 1 final = 4 requests.
  assert.equal(requests.length, 8);
  for (const r of requests) assert.ok(breakpoints(r).length <= 4);

  const [t1, t2, t3, f1, u1] = requests;
  assert.deepEqual(breakpoints(t1!), ["0.0", "0.1"]);
  assert.deepEqual(breakpoints(t2!), ["0.0", "0.1", "2.0"]);
  assert.deepEqual(breakpoints(t3!), ["0.0", "0.1", "4.0"]);
  assert.deepEqual(breakpoints(f1!), ["0.0"]);
  // Tools identical on every loop turn (they render first in the prefix).
  assert.deepEqual(t1!.tools, t3!.tools);
  // Next ticket starts with the same shared block -> a cache read.
  const first = (r: typeof t1) => (r!.messages[0]!.content as { text: string }[])[0]!.text;
  assert.equal(first(t1), first(u1));
});
