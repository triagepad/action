// ASC REST client for the TestFlight beta-feedback endpoints.
// Endpoints verified against Apple's docs (Getting beta feedback):
//   GET /v1/apps/{id}/betaFeedbackScreenshotSubmissions
//   GET /v1/apps/{id}/betaFeedbackCrashSubmissions
//   GET /v1/betaFeedbackCrashSubmissions/{id}/crashLog  -> { attributes: { logText } }

import type { Config } from "../config.js";
import { makeAscToken } from "./auth.js";

const BASE_URL = "https://api.appstoreconnect.apple.com";

/** JSON:API resource as returned by ASC — kept loose on purpose; raw payloads are saved as-is. */
export interface AscResource {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { type: string; id: string } | null }>;
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
export class AscError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "AscError";
  }
}

/** Build a client from explicit per-account creds (from Vault or the onboarding
 * form) — no app id needed for listing apps / validating credentials. */
export function ascClientFromCreds(creds: { issuerId: string; keyId: string; privateKeyPem: string }): AscClient {
  return new AscClient({
    asc: { issuerId: creds.issuerId, keyId: creds.keyId, privateKeyPem: creds.privateKeyPem, privateKeyPath: "", appId: "" },
  });
}

export class AscClient {
  private token: string | null = null;
  private tokenIssuedAt = 0;

  // Only the `asc` slice is used — accepting a Pick keeps the per-account creds
  // path (no full Config) working alongside the CLI's full-config instantiation.
  constructor(private readonly config: Pick<Config, "asc">) {}

  /** Reuse the JWT for ~8 minutes, then re-sign (TTL is 10 min). */
  private getToken(): string {
    const age = Date.now() - this.tokenIssuedAt;
    if (!this.token || age > 8 * 60 * 1000) {
      this.token = makeAscToken(this.config.asc);
      this.tokenIssuedAt = Date.now();
    }
    return this.token;
  }

  private async get(path: string, params?: Record<string, string>): Promise<unknown> {
    const url = new URL(path, BASE_URL);
    for (const [k, v] of Object.entries(params ?? {})) {
      url.searchParams.set(k, v);
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.getToken()}` },
    });
    const body = await res.text();
    if (!res.ok) {
      throw new AscError(`ASC ${res.status} on GET ${url.pathname}: ${body.slice(0, 2000)}`, res.status);
    }
    return JSON.parse(body);
  }

  /**
   * List the account's TestFlight apps — the "validate credentials by listing
   * apps" step of onboarding. A 401/403 here (surfaced as an AscError) means the
   * submitted creds are wrong; the caller turns that into a clear message.
   */
  async listApps(limit = 200): Promise<AscApp[]> {
    const res = (await this.get("/v1/apps", {
      limit: String(Math.min(limit, 200)),
      sort: "name",
      "fields[apps]": "name,bundleId",
    })) as AscListResponse;
    return res.data.map((a) => ({
      ascAppId: a.id,
      name: (a.attributes?.name as string | undefined) ?? null,
      bundleId: (a.attributes?.bundleId as string | undefined) ?? null,
    }));
  }

  /** Most recent screenshot feedback, newest first, with build + tester included. */
  async listScreenshotFeedback(limit: number): Promise<AscListResponse> {
    return (await this.get(
      `/v1/apps/${this.config.asc.appId}/betaFeedbackScreenshotSubmissions`,
      {
        sort: "-createdDate",
        limit: String(Math.min(limit, 200)),
        include: "build,tester",
        "fields[builds]": "version,preReleaseVersion",
      },
    )) as AscListResponse;
  }

  /** Most recent crash feedback, newest first, with build + tester included. */
  async listCrashFeedback(limit: number): Promise<AscListResponse> {
    return (await this.get(
      `/v1/apps/${this.config.asc.appId}/betaFeedbackCrashSubmissions`,
      {
        sort: "-createdDate",
        limit: String(Math.min(limit, 200)),
        include: "build,tester",
        "fields[builds]": "version,preReleaseVersion",
      },
    )) as AscListResponse;
  }

  /** Raw crashLog response for one crash submission ({ data: { attributes: { logText } } }). */
  async getCrashLog(submissionId: string): Promise<unknown> {
    return this.get(`/v1/betaFeedbackCrashSubmissions/${submissionId}/crashLog`);
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(new URL(path, BASE_URL), {
      method: "POST",
      headers: { Authorization: `Bearer ${this.getToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new AscError(`ASC ${res.status} on POST ${path}: ${text.slice(0, 2000)}`, res.status);
    return text ? JSON.parse(text) : {};
  }

  /** The app's existing webhooks — used to make registration idempotent. */
  async listWebhooks(appId: string): Promise<{ id: string; url: string | null; enabled: boolean }[]> {
    const res = (await this.get(`/v1/apps/${appId}/webhooks`, { limit: "200" })) as AscListResponse;
    return res.data.map((w) => ({
      id: w.id,
      url: (w.attributes?.url as string | undefined) ?? null,
      enabled: (w.attributes?.enabled as boolean | undefined) ?? false,
    }));
  }

  /** Register a beta-feedback webhook. Returns the new webhook id. */
  async createWebhook(input: { appId: string; url: string; secret: string; name?: string }): Promise<{ id: string }> {
    const body = (await this.post("/v1/webhooks", {
      data: {
        type: "webhooks",
        attributes: {
          name: input.name ?? "triagepad",
          url: input.url,
          secret: input.secret,
          enabled: true,
          eventTypes: ["BETA_FEEDBACK_SCREENSHOT_SUBMISSION_CREATED", "BETA_FEEDBACK_CRASH_SUBMISSION_CREATED"],
        },
        relationships: { app: { data: { type: "apps", id: input.appId } } },
      },
    })) as { data: { id: string } };
    return { id: body.data.id };
  }

  /** Download a screenshot from its pre-signed URL (no ASC auth on the asset CDN). */
  async downloadAsset(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Asset download failed ${res.status}: ${url.split("?")[0]}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
