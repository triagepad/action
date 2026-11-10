// Prompt-cache layout for the localisation agent.
//
// The brain-owned `localiseAgent` template interleaves run-wide content (app
// context, instructions, layer C, the repo file tree — ~25k tokens on a real
// iOS repo) with per-ticket content (layer B, the ticket JSON, the crash log).
// Rendered as one text block, nothing is shared between tickets and the whole
// thing is re-billed at full price on every turn of the tool loop.
//
// splitLocalisePrompt() renders the SAME template with the SAME values, then
// reorders it into two text blocks:
//   1. shared  — identical for every ticket of a run (and across runs while the
//                repo tree is unchanged): cache breakpoint #1
//   2. ticket  — the per-ticket segment, moved after the tree: breakpoint #2
// The text is byte-for-byte the template's own text, only reordered; nothing is
// added or removed. If the template does not have the expected shape (the brain
// changed it), we fall back to the original single block — still cached
// turn-to-turn within the ticket, never broken.
//
// Breakpoint budget (max 4 per request): shared, ticket, moving tail = 3.

import type Anthropic from "@anthropic-ai/sdk";
import { render } from "./methodology.js";

export const EPHEMERAL = { type: "ephemeral" } as const;

const S_LAYER_B = "\u0000TP:layerB\u0000";
const S_TICKET = "\u0000TP:ticket\u0000";
const S_CRASH = "\u0000TP:crash\u0000";

export interface LocalisePromptVars {
  appContext: string;
  layerB: string;
  layerC: string;
  ticket: string;
  crashSection: string;
  fileTree: string;
}

export interface LocalisePromptBlocks {
  /** Run-wide prefix. Null when the template could not be split (fallback). */
  shared: string | null;
  /** Per-ticket content (or, in the fallback, the whole rendered prompt). */
  ticket: string;
}

export function splitLocalisePrompt(template: string, vars: LocalisePromptVars): LocalisePromptBlocks {
  const fallback = (): LocalisePromptBlocks => ({ shared: null, ticket: render(template, { ...vars }) });

  const withSentinels = render(template, {
    ...vars,
    layerB: S_LAYER_B,
    ticket: S_TICKET,
    crashSection: S_CRASH,
  });
  const once = (s: string) => withSentinels.indexOf(s) !== -1 && withSentinels.indexOf(s) === withSentinels.lastIndexOf(s);
  if (!once(S_TICKET) || !once(S_CRASH)) return fallback();
  // Defensive: a value must never contain a sentinel (they carry NUL bytes).
  if (Object.values(vars).some((v) => v.includes("\u0000TP:"))) return fallback();

  const iTicket = withSentinels.indexOf(S_TICKET);
  const iCrash = withSentinels.indexOf(S_CRASH);
  if (iCrash < iTicket) return fallback();

  // The ticket segment starts at the line holding {{ticket}}; when that
  // placeholder opens a line under a markdown heading ("## Ticket\n{{ticket}}"),
  // the heading belongs to the segment too.
  let segStart = withSentinels.lastIndexOf("\n", iTicket - 1) + 1;
  if (segStart === iTicket && segStart > 0) {
    const prevStart = withSentinels.lastIndexOf("\n", segStart - 2) + 1;
    if (withSentinels.startsWith("#", prevStart)) segStart = prevStart;
  }
  const segEnd = iCrash + S_CRASH.length;
  const segment = withSentinels.slice(segStart, segEnd);
  // Nothing run-wide may sit between ticket and crash log except whitespace.
  const between = withSentinels.slice(iTicket + S_TICKET.length, iCrash);
  if (between.trim().length > 0) return fallback();

  let shared = withSentinels.slice(0, segStart) + withSentinels.slice(segEnd);
  let ticketText = segment;
  // Layer B is per-ticket (the tester's build): lift it out of the shared
  // prefix and append it to the ticket block. (A template without {{layerB}}
  // never rendered it — nothing to move.)
  if (withSentinels.includes(S_LAYER_B) && !once(S_LAYER_B)) return fallback();
  let liftedLayerB = "";
  if (shared.includes(S_LAYER_B)) {
    shared = shared.replace(S_LAYER_B, "");
    liftedLayerB = vars.layerB.trimEnd();
  }
  ticketText = ticketText
    .replace(S_LAYER_B, () => vars.layerB)
    .replace(S_TICKET, () => vars.ticket)
    .replace(S_CRASH, () => vars.crashSection)
    .trimEnd();
  if (liftedLayerB) ticketText += `\n\n${liftedLayerB}`;

  return { shared: shared.trimEnd() + "\n", ticket: ticketText };
}

/** The first user message: shared prefix + ticket, each with a breakpoint. */
export function localiseFirstMessage(blocks: LocalisePromptBlocks): Anthropic.MessageParam {
  const content: Anthropic.TextBlockParam[] = [];
  if (blocks.shared !== null) content.push({ type: "text", text: blocks.shared, cache_control: EPHEMERAL });
  content.push({ type: "text", text: blocks.ticket, cache_control: EPHEMERAL });
  return { role: "user", content };
}

/**
 * Move the incremental-history breakpoint to the last block of the newest
 * user message (the latest tool results). Older markers on tool_result
 * blocks are removed — a marker is not part of the cached bytes, so moving
 * it never invalidates anything, and it keeps us under the 4-breakpoint cap.
 * The two markers on the first message (shared, ticket) are left alone.
 */
export function moveTailBreakpoint(messages: Anthropic.MessageParam[]): void {
  for (let i = 1; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.role !== "user" || typeof m.content === "string") continue;
    for (const block of m.content) {
      if ("cache_control" in block && block.cache_control) delete block.cache_control;
    }
  }
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || typeof last.content === "string" || messages.length === 1) return;
  const tail = last.content[last.content.length - 1];
  if (tail && (tail.type === "tool_result" || tail.type === "text")) tail.cache_control = EPHEMERAL;
}

/** Drop every marker except the shared-prefix one (for a request whose tail cannot be reused). */
export function keepOnlySharedBreakpoint(messages: Anthropic.MessageParam[], hasShared: boolean): void {
  messages.forEach((m, i) => {
    if (typeof m.content === "string") return;
    m.content.forEach((block, j) => {
      if (!("cache_control" in block) || !block.cache_control) return;
      if (hasShared && i === 0 && j === 0) return;
      delete block.cache_control;
    });
  });
}
