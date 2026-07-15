// The brain API wire contract — shared by the thin action (client) and the
// brain server. Every schema is CLOSED (strictObject): unknown keys are
// rejected on both sides. This is the structural enforcement of the
// source-never-leaves invariant: the results surface has no field that could
// carry a repo tree or file blobs — candidates are {file, line, …} metadata,
// and the only free-text fields are ticket content (which may naturally
// contain small excerpts). Version the contract alongside fixes.json v1.

import { z } from "zod";

// --- building blocks mirroring src/core/types.ts ---

export const zTicketCategory = z.enum(["crash", "ui", "perf", "copy", "feature-request", "praise"]);
export const zTicketSeverity = z.enum(["critical", "high", "medium", "low"]);
export const zConfidence = z.enum(["high", "medium", "low"]);

export const zTriagedTicket = z.strictObject({
  id: z.string().max(64),
  feedbackIds: z.array(z.string().max(128)).max(50),
  title: z.string().max(300),
  whatHappened: z.string().max(8_000),
  likelyRepro: z.array(z.string().max(1_000)).max(20),
  affectedArea: z.string().max(300),
  severity: zTicketSeverity,
  category: zTicketCategory,
  isRealBug: z.boolean(),
  device: z.string().max(100).nullable(),
  osVersion: z.string().max(100).nullable(),
  appVersion: z.string().max(100).nullable(),
  build: z.string().max(100).nullable(),
  screenshotPath: z.string().max(500).nullable(),
  crashLogPath: z.string().max(500).nullable(),
});

export const zCandidate = z.strictObject({
  file: z.string().max(500),
  symbol: z.string().max(300).nullable(),
  line: z.number().int().nullable(),
  confidence: z.number().min(0).max(1),
  signal: z.enum(["crash-stack", "string-literal", "identifier"]),
  rationale: z.string().max(4_000),
  verification: z.strictObject({
    status: z.enum(["verified", "file-missing", "line-out-of-range", "symbol-not-found"]),
    detail: z.string().max(1_000).nullable(),
  }),
});

export const zNeedsDecision = z.strictObject({
  required: z.boolean(),
  reason: z.string().max(4_000).nullable(),
  options: z.array(z.strictObject({ label: z.string().max(300), tradeoff: z.string().max(2_000) })).max(10),
});

export const zFixPrompt = z.strictObject({
  ticketId: z.string().max(64),
  candidates: z.array(zCandidate).max(10),
  overallConfidence: zConfidence,
  validationPassed: z.boolean(),
  needsDecision: zNeedsDecision,
  // Ticket content: may naturally contain small code excerpts. Size-capped —
  // a repo tree cannot fit, and there is no other place to put one.
  promptBody: z.string().max(20_000),
  prompts: z.strictObject({
    plan: z.string().max(24_000),
    pr: z.string().max(24_000),
    autofix: z.string().max(24_000).nullable(),
  }),
  explanation: z.string().max(4_000),
});

export const zSkippedTicket = z.strictObject({
  ticketId: z.string().max(64),
  reason: z.string().max(2_000),
});

export const zFixedTicket = z.strictObject({
  ticketId: z.string().max(64),
  reason: z.string().max(4_000),
  resolvedBy: z.string().max(300).nullable(),
  evidenceSource: z.enum(["code", "build-and-history"]).optional(),
});

export const zFixesOutput = z.strictObject({
  version: z.literal(1),
  generatedAt: z.string().max(40),
  processed: z.array(zFixPrompt).max(100),
  skipped: z.array(zSkippedTicket).max(100),
  fixed: z.array(zFixedTicket).max(100),
});

export const zFeedbackItem = z.strictObject({
  id: z.string().max(128),
  type: z.enum(["screenshot", "crash"]),
  text: z.string().max(10_000).nullable(),
  screenshotPath: z.string().max(500).nullable(),
  crashLogPath: z.string().max(500).nullable(),
  device: z.string().max(100).nullable(),
  osVersion: z.string().max(100).nullable(),
  appVersion: z.string().max(100).nullable(),
  build: z.string().max(100).nullable(),
  locale: z.string().max(50).nullable(),
  createdAt: z.string().max(40).nullable(),
});

// --- requests / responses ---

/** POST /v1/results — everything the CI run reports back. Metadata only. */
export const zResultsReport = z.strictObject({
  runId: z.string().max(128),
  feedbackIds: z.array(z.string().max(128)).min(1).max(200),
  /**
   * Feedback metadata for items the brain has not stored yet (the asc
   * self-test path, where CI pulled directly from ASC). Empty when the
   * feedback came from GET /v1/feedback/pending.
   */
  feedbackItems: z.array(zFeedbackItem).max(200),
  tickets: z.array(zTriagedTicket).max(100),
  fixes: zFixesOutput,
  executions: z.array(
    z.strictObject({
      ticketId: z.string().max(64),
      outcome: z.string().max(500),
      url: z.string().max(500).nullable(),
    }),
  ).max(100),
});
export type ResultsReport = z.infer<typeof zResultsReport>;

/** GET /v1/feedback/pending */
export const zPendingResponse = z.strictObject({
  items: z.array(zFeedbackItem).max(200),
  /** All feedback ids ever resulted — the asc self-test path dedupes against this. */
  processedFeedbackIds: z.array(z.string().max(128)).max(10_000),
  /** attachment key -> base64 content (screenshots, crash logs) */
  attachments: z.record(z.string(), z.string()),
  /** Advisory only — ticket numbers are assigned atomically via POST /v1/tickets/reserve. */
  nextTicketNumber: z.number().int().min(1),
});
export type PendingResponse = z.infer<typeof zPendingResponse>;

/** POST /v1/tickets/reserve — atomically reserve a block of ticket numbers. */
export const zReserveRequest = z.strictObject({ count: z.number().int().min(0).max(1000) });
export const zReserveResponse = z.strictObject({ start: z.number().int().min(1), count: z.number().int().min(0) });
export type ReserveResponse = z.infer<typeof zReserveResponse>;

/** GET /v1/methodology — bundle is validated structurally, content is opaque. */
export const zMethodologyResponse = z.strictObject({
  methodology: z.strictObject({
    version: z.literal(1),
    prompts: z.record(z.string(), z.string()),
    schemas: z.record(z.string(), z.record(z.string(), z.unknown())),
    toolDescriptions: z.record(z.string(), z.string()),
    defaults: z.strictObject({
      models: z.strictObject({ classify: z.string(), triage: z.string() }),
      minConfidence: zConfidence,
    }),
  }),
  config: z.strictObject({
    models: z.strictObject({ classify: z.string(), triage: z.string() }),
    minConfidence: zConfidence,
    defaultMode: z.enum(["plan", "pr", "autofix"]),
    appContext: z.string().max(1_000),
  }),
});
export type MethodologyResponse = z.infer<typeof zMethodologyResponse>;
