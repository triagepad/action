import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { localiseTickets, type LocalisationAgentResult } from "../src/core/localise.js";
import { precheckFixedRoute } from "../src/core/staleCheck.js";
import { bug, FINAL_JSON, methodology, repo } from "./helpers.js";

const HEAD = "aaaaaaa";
// Commit graph: build111 -> fee1234 -> HEAD; "dead999" exists nowhere.
const ancestors: Record<string, string[]> = {
  bbbb111: ["bbbb111"],
  fee1234: ["bbbb111", "fee1234"],
  [HEAD]: ["bbbb111", "fee1234", HEAD],
};
const gitRepo = repo({
  history: () => [{ sha: HEAD, date: "2026-11-10", subject: "head" }],
  resolveBuild: (b) => (b === "111" ? "bbbb111" : null),
  isAncestor: (a, d) => ancestors[d]?.includes(a) ?? false,
});

function parsed(stale: Partial<LocalisationAgentResult["staleAssessment"]>): LocalisationAgentResult {
  const base = JSON.parse(FINAL_JSON) as LocalisationAgentResult;
  return { ...base, staleAssessment: { ...base.staleAssessment, ...stale } };
}

const absent = { codeAtHead: "defect-absent" as const, codeReason: "guard at Foo.swift:12" };

test("gate: defect-absent + cited sha reachable from HEAD and newer than the build -> fixed", () => {
  const r = precheckFixedRoute(bug("TP-1", { build: "111" }), parsed({ ...absent, resolvedBy: "PR #591 (fee1234)" }), gitRepo);
  assert.ok(r);
  assert.equal(r.evidenceSource, "code");
  assert.equal(r.resolvedBy, "PR #591 (fee1234)");
  assert.match(r.reason, /pre-check: fee1234 verified/);
});

test("gate falls through to the full loop on every weaker signal", () => {
  const t = bug("TP-1", { build: "111" });
  const cases: [string, LocalisationAgentResult | null][] = [
    ["no result", null],
    ["defect-present", parsed({ codeAtHead: "defect-present", codeReason: "x", resolvedBy: "fee1234" })],
    ["inconclusive", parsed({ codeAtHead: "inconclusive", codeReason: "x", resolvedBy: "fee1234" })],
    ["empty reason", parsed({ codeAtHead: "defect-absent", codeReason: " ", resolvedBy: "fee1234" })],
    ["no sha cited", parsed({ ...absent, resolvedBy: "PR #591" })],
    ["sha not in history", parsed({ ...absent, resolvedBy: "dead999" })],
    ["one of two shas unverifiable", parsed({ ...absent, resolvedBy: "fee1234, dead999" })],
    ["fix already inside the tester's build", parsed({ ...absent, resolvedBy: "bbbb111" })],
  ];
  for (const [name, p] of cases) assert.equal(precheckFixedRoute(t, p, gitRepo), null, name);
  // No git at all -> never short-circuits.
  assert.equal(precheckFixedRoute(t, parsed({ ...absent, resolvedBy: "fee1234" }), repo()), null);
});

/** Client whose final answer depends on the model: the cheap one says "fixed by <sha>". */
function twoModelClient(cheapResolvedBy: string | null) {
  const models: string[] = [];
  const client = {
    messages: {
      create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
        models.push(p.model);
        if (!p.output_config?.format) return { content: [{ type: "text", text: "DONE" }], stop_reason: "end_turn", usage: {} };
        const answer =
          p.model === "cheap"
            ? parsed({ ...absent, resolvedBy: cheapResolvedBy })
            : parsed({ codeAtHead: "defect-present", codeReason: null });
        return { content: [{ type: "text", text: JSON.stringify(answer) }], stop_reason: "end_turn", usage: {} };
      },
    },
  };
  return { client: client as unknown as Anthropic, models };
}

const run = (client: Anthropic, precheck: boolean) =>
  localiseTickets({
    client,
    models: { triage: "strong" },
    methodology: methodology(),
    tickets: [bug("TP-1", { build: "111" })],
    repo: gitRepo,
    readAttachment: () => null,
    appContext: "Stopa",
    stalePrecheck: precheck ? { model: "cheap" } : undefined,
  });

test("pre-check verified -> the strong model is never called; same fixed output shape", async () => {
  const { client, models } = twoModelClient("fee1234");
  const out = await run(client, true);
  assert.deepEqual(new Set(models), new Set(["cheap"]));
  assert.equal(out.fixed.length, 1);
  assert.equal(out.processed.length, 0);
  assert.deepEqual(Object.keys(out.fixed[0]!).sort(), ["evidenceSource", "reason", "resolvedBy", "ticketId"]);
});

test("pre-check unverifiable -> full strong loop decides (defect-present wins)", async () => {
  const { client, models } = twoModelClient("dead999");
  const out = await run(client, true);
  assert.ok(models.includes("strong"));
  assert.equal(out.fixed.length, 0);
  assert.equal(out.processed.length, 1);
});

test("off by default: no cheap pass at all", async () => {
  const { client, models } = twoModelClient("fee1234");
  await run(client, false);
  assert.ok(!models.includes("cheap"));
});
