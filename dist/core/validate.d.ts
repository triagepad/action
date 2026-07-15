import type { CandidateVerification, LocalisationCandidate, RepoAccess } from "./types.js";
export declare function verifyCandidate(repo: RepoAccess, candidate: Pick<LocalisationCandidate, "file" | "symbol" | "line">): CandidateVerification;
