import type { Config } from "../config.js";
/** JSON:API resource as returned by ASC — kept loose on purpose; raw payloads are saved as-is. */
export interface AscResource {
    type: string;
    id: string;
    attributes?: Record<string, unknown>;
    relationships?: Record<string, {
        data?: {
            type: string;
            id: string;
        } | null;
    }>;
}
export interface AscListResponse {
    data: AscResource[];
    included?: AscResource[];
    links?: Record<string, unknown>;
    meta?: Record<string, unknown>;
}
/** One TestFlight app, flattened for the onboarding picker. */
export interface AscApp {
    ascAppId: string;
    name: string | null;
    bundleId: string | null;
}
/** Carries the ASC HTTP status so callers can distinguish auth failures (401/403 =
 * bad creds → a clear onboarding error) from other faults, never a generic 500. */
export declare class AscError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
/** Build a client from explicit per-account creds (from Vault or the onboarding
 * form) — no app id needed for listing apps / validating credentials. */
export declare function ascClientFromCreds(creds: {
    issuerId: string;
    keyId: string;
    privateKeyPem: string;
}): AscClient;
export declare class AscClient {
    private readonly config;
    private token;
    private tokenIssuedAt;
    constructor(config: Pick<Config, "asc">);
    /** Reuse the JWT for ~8 minutes, then re-sign (TTL is 10 min). */
    private getToken;
    private get;
    /**
     * List the account's TestFlight apps — the "validate credentials by listing
     * apps" step of onboarding. A 401/403 here (surfaced as an AscError) means the
     * submitted creds are wrong; the caller turns that into a clear message.
     */
    listApps(limit?: number): Promise<AscApp[]>;
    /** Most recent screenshot feedback, newest first, with build + tester included. */
    listScreenshotFeedback(limit: number): Promise<AscListResponse>;
    /** Most recent crash feedback, newest first, with build + tester included. */
    listCrashFeedback(limit: number): Promise<AscListResponse>;
    /** Raw crashLog response for one crash submission ({ data: { attributes: { logText } } }). */
    getCrashLog(submissionId: string): Promise<unknown>;
    private post;
    /** The app's existing webhooks — used to make registration idempotent. */
    listWebhooks(appId: string): Promise<{
        id: string;
        url: string | null;
        enabled: boolean;
    }[]>;
    /** Register a beta-feedback webhook. Returns the new webhook id. */
    createWebhook(input: {
        appId: string;
        url: string;
        secret: string;
        name?: string;
    }): Promise<{
        id: string;
    }>;
    /** Download a screenshot from its pre-signed URL (no ASC auth on the asset CDN). */
    downloadAsset(url: string): Promise<Buffer>;
}
