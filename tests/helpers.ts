// Shared test doubles: a scripted Anthropic client that records every request,
// a tiny in-memory repo, and a methodology bundle whose localiseAgent template
// has the same placeholder SHAPE as the brain's (the real prompt content is
// brain-owned and never lives in this public repo).

import type Anthropic from "@anthropic-ai/sdk";
import type { MethodologyBundle } from "../src/core/methodology.js";
import type { RepoAccess, TriagedTicket } from "../src/core/types.js";

export const TEMPLATE =
  `You are localising a bug in {{appContext}}. Use the tools.\n\n` +
  `Evidence layers:\nA) CODE AT HEAD.\n{{layerB}}{{layerC}}D) TRACKER hints.\n\n` +
  `## Ticket\n{{ticket}}\n\n` +
  `{{crashSection}}` +
  `## Repo file tree\n{{fileTree}}`;

export function methodology(template = TEMPLATE): MethodologyBundle {
  return {
    version: 1,
    prompts: {
      cluster: "",
      ticket: "",
      ticketScreenshotNote: "",
      ticketCrashSection: "",
      localiseAgent: template,
      localiseLayerB: "B) BUILD MAPPING: {{buildLine}}\n",
      localiseBuildLine: "build {{build}} -> {{sha}}",
      localiseLayerC: "C) GIT HISTORY.\n",
      localiseCrashSection: "## Crash log (truncated)\n```\n{{crashLog}}\n```\n\n",
      localiseFinal: "Final answer as JSON.",
    },
    schemas: { cluster: {}, ticket: {}, localisation: { type: "object" } },
    toolDescriptions: { grep: "grep", readFile: "read", gitLog: "log" },
    defaults: { models: { classify: "claude-haiku-4-5", triage: "claude-opus-4-8" }, minConfidence: "high" },
  };
}

export function bug(id: string, extra: Partial<TriagedTicket> = {}): TriagedTicket {
  return {
    id,
    feedbackIds: [`fb-${id}`],
    title: `Bug ${id}`,
    whatHappened: "Tapping Save does nothing",
    likelyRepro: ["Open composer", "Tap Save"],
    affectedArea: "Composer",
    severity: "high",
    category: "ui",
    isRealBug: true,
    device: null,
    osVersion: null,
    appVersion: null,
    build: null,
    screenshotPath: null,
    crashLogPath: null,
    ...extra,
  };
}

export function repo(overrides: Partial<RepoAccess> = {}): RepoAccess {
  return {
    listFiles: () => ["App/Composer.swift", "App/Save.swift", "README.md"],
    grep: () => [{ file: "App/Composer.swift", line: 10, text: "func save()" }],
    readFile: () => "10\tfunc save() {}",
    fileExists: (p) => p.startsWith("App/"),
    lineCount: () => 100,
    ...overrides,
  };
}

export const FINAL_JSON = JSON.stringify({
  candidates: [
    { file: "App/Composer.swift", symbol: "save", line: 10, confidence: 0.8, signal: "identifier", rationale: "r" },
  ],
  overallConfidence: "high",
  staleAssessment: { codeAtHead: "defect-present", codeReason: null, historyEvidence: null, trackerHint: null, resolvedBy: null },
  needsDecision: { required: false, reason: null, options: [] },
  promptBody: "Fix save()",
  explanation: "e",
});

export function usage(input = 100, output = 20, read = 0, write = 0): Anthropic.Usage {
  return {
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: read,
    cache_creation_input_tokens: write,
  } as Anthropic.Usage;
}

/**
 * Scripted client: every request is deep-cloned into `requests` (the loop
 * mutates its message array between calls). Tool turns reply with one grep
 * call, `toolTurns` times per ticket; then end_turn; the JSON-format call
 * returns FINAL_JSON.
 */
export function scriptedClient(toolTurns = 2) {
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let turnInTicket = 0;
  const client = {
    messages: {
      create: async (params: Anthropic.MessageCreateParamsNonStreaming) => {
        requests.push(structuredClone(params));
        if (params.output_config?.format) {
          turnInTicket = 0;
          return { content: [{ type: "text", text: FINAL_JSON }], stop_reason: "end_turn", usage: usage(50, 300, 900, 0) };
        }
        if (turnInTicket < toolTurns) {
          turnInTicket++;
          return {
            content: [{ type: "tool_use", id: `tu_${requests.length}`, name: "grep", input: { pattern: "save" } }],
            stop_reason: "tool_use",
            usage: usage(10, 40, 1000, 200),
          };
        }
        return { content: [{ type: "text", text: "DONE" }], stop_reason: "end_turn", usage: usage(10, 5, 1200, 0) };
      },
    },
  };
  return { client: client as unknown as Anthropic, requests };
}

export function breakpoints(req: Anthropic.MessageCreateParamsNonStreaming): string[] {
  const where: string[] = [];
  req.messages.forEach((m, i) => {
    if (typeof m.content === "string") return;
    m.content.forEach((b, j) => {
      if ("cache_control" in b && b.cache_control) where.push(`${i}.${j}`);
    });
  });
  return where;
}
