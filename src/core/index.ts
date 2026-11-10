// Public surface of the transplantable core.
// Consumers: the local CLI today; the MCP server and CI runner next.

export * from "./types.js";
export {
  deriveTicketStatus,
  dispatchEligibility,
  type TicketStatus,
  type TicketActionInputs,
  type TicketStatusInput,
  type Eligibility,
} from "./ticketStatus.js";
export { render, type MethodologyBundle } from "./methodology.js";
export { triageFeedback, type TriageOptions } from "./triage.js";
export {
  localiseTickets,
  routeLocalisation,
  type LocaliseOptions,
  type LocalisationAgentResult,
  type LocalisationRoute,
  type StaleAssessment,
} from "./localise.js";
export { UsageMeter, BATCH, cacheHitRate, priceOf, MODEL_PRICES, type TokenTotals } from "./usage.js";
export {
  precheckFixedRoute,
  headSha,
  PRECHECK_MAX_TOOL_TURNS,
  type StalePrecheckOptions,
} from "./staleCheck.js";
export { ledgerKey, relabel, type LedgerEntry, type LocalisationLedger } from "./ledger.js";
export { verifyCandidate } from "./validate.js";
export { buildPrompts } from "./modes.js";
