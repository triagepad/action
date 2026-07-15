// Public surface of the transplantable core.
// Consumers: the local CLI today; the MCP server and CI runner next.
export * from "./types.js";
export { deriveTicketStatus, dispatchEligibility, } from "./ticketStatus.js";
export { render } from "./methodology.js";
export { triageFeedback } from "./triage.js";
export { localiseTickets, routeLocalisation, } from "./localise.js";
export { verifyCandidate } from "./validate.js";
export { buildPrompts } from "./modes.js";
