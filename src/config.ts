// Config and secrets. Values come from .env (git-ignored) / process.env.
// Never print or log the private key or API keys.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

export interface Config {
  asc: {
    issuerId: string;
    keyId: string;
    /** Path to the .p8 private key (git-ignored). The key itself is only ever read at signing time. */
    privateKeyPath: string;
    /** In-memory .p8 PEM (per-account creds from Vault). Preferred over privateKeyPath when set. */
    privateKeyPem?: string;
    appId: string;
  };
  /** How many recent feedback items to pull. */
  feedbackLimit: number;
  /** Local read-only clone of the Stopa source, for code localisation. */
  stopaRepoPath: string;
  /** One sentence about the app, fed to the triage/localisation prompts. */
  appContext: string;
  anthropicApiKey: string;
  models: {
    /** Cheap model for classify/dedupe. */
    classify: string;
    /** Strong model for triage report + fix prompt (vision on screenshots). */
    triage: string;
  };
  out: {
    root: string;
    raw: string;
    tickets: string;
    fixes: string;
    reportFile: string;
  };
  server: {
    port: number;
    /** Legacy single-tenant file-store directory — read only by the one-shot Supabase migration. */
    dataDir: string;
    /** Postgres connection string (Supabase). The multi-tenant store lives here. */
    databaseUrl: string | null;
    /**
     * PR1 bridge: the single global TRIAGEPAD_API_KEY resolves to this account.
     * Removed in PR2 when per-account api_keys land.
     */
    primaryAccountId: string | null;
    /** Shared secret for ASC webhook HMAC; webhook endpoint is disabled when null. */
    webhookSecret: string | null;
    /** Fallback pull cadence; 0 disables the scheduler. */
    pullIntervalMinutes: number;
    /** Enable the transit-only Anthropic inference proxy (managed tier). */
    managedInference: boolean;
    /** Privileged token for platform-plane provisioning (POST /v1/accounts). Never a per-account key. */
    adminToken: string | null;
    /** The brain's own public base URL — used to register per-account ASC webhooks (/webhook/asc/<id>). */
    publicUrl: string | null;
    notify: {
      /** Resend API key; notifications log to stderr when null. */
      resendApiKey: string | null;
      to: string | null;
      from: string;
    };
    /** Keep running the local triage pipeline alongside dispatch (default true). */
    localIngest: boolean;
  };
}

/** Minimal .env loader (KEY=value, # comments) — avoids a dotenv dependency. */
function loadDotenv(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key && process.env[key] === undefined) {
      process.env[key] = value ?? "";
    }
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name} — fill .env from .env.example`);
  }
  return value;
}

function optional(name: string): string {
  return process.env[name] ?? "";
}

export interface LoadConfigOptions {
  /**
   * "cli" (default) hard-requires every var the local pipeline needs.
   * "server" is tolerant: the brain never touches the repo and, in its default
   * posture, never calls Anthropic — so STOPA_REPO_PATH / ANTHROPIC_API_KEY /
   * incomplete ASC creds degrade features instead of crashing the process.
   */
  context?: "cli" | "server";
}

export function loadConfig(opts: LoadConfigOptions = {}): Config {
  const server = opts.context === "server";
  const req = server ? optional : required;
  const root = resolve(import.meta.dirname, "..");
  loadDotenv(resolve(root, ".env"));

  // Container deploys can't mount a key file — materialise the .p8 (mode 600)
  // from base64 or raw PEM content into a path, before path resolution.
  if (!process.env.ASC_PRIVATE_KEY_PATH) {
    const raw = process.env.ASC_PRIVATE_KEY_B64
      ? Buffer.from(process.env.ASC_PRIVATE_KEY_B64, "base64")
      : process.env.ASC_PRIVATE_KEY
        ? Buffer.from(process.env.ASC_PRIVATE_KEY, "utf8")
        : null;
    if (raw) {
      const keyPath = resolve(tmpdir(), `asc-key-${process.pid}.p8`);
      writeFileSync(keyPath, raw, { mode: 0o600 });
      process.env.ASC_PRIVATE_KEY_PATH = keyPath;
    }
  }
  const keyPathEnv = server ? optional("ASC_PRIVATE_KEY_PATH") : required("ASC_PRIVATE_KEY_PATH");

  const outRoot = resolve(root, "out");
  return {
    asc: {
      issuerId: req("ASC_ISSUER_ID"),
      keyId: req("ASC_KEY_ID"),
      privateKeyPath: keyPathEnv ? resolve(root, keyPathEnv) : "",
      appId: req("ASC_APP_ID"),
    },
    feedbackLimit: Number(process.env.FEEDBACK_LIMIT ?? 25),
    stopaRepoPath: req("STOPA_REPO_PATH"),
    appContext:
      process.env.APP_CONTEXT ??
      '"Stopa", an iOS workout/activity-tracking app (SwiftUI iOS app under ios/, backend under backend/)',
    anthropicApiKey: req("ANTHROPIC_API_KEY"),
    models: {
      classify: process.env.CLASSIFY_MODEL ?? "claude-haiku-4-5",
      triage: process.env.TRIAGE_MODEL ?? "claude-opus-4-8",
    },
    out: {
      root: outRoot,
      raw: resolve(outRoot, "raw"),
      tickets: resolve(outRoot, "tickets"),
      fixes: resolve(outRoot, "fixes"),
      reportFile: resolve(outRoot, "report.md"),
    },
    server: {
      port: Number(process.env.PORT ?? 8787),
      dataDir: resolve(root, process.env.DATA_DIR ?? "data"),
      databaseUrl: process.env.DATABASE_URL || null,
      primaryAccountId: process.env.PRIMARY_ACCOUNT_ID || null,
      webhookSecret: process.env.ASC_WEBHOOK_SECRET || null,
      pullIntervalMinutes: Number(process.env.PULL_INTERVAL_MINUTES ?? 30),
      managedInference: process.env.MANAGED_INFERENCE === "1",
      adminToken: process.env.BRAIN_ADMIN_TOKEN || null,
      publicUrl: process.env.BRAIN_PUBLIC_URL || null,
      notify: {
        resendApiKey: process.env.RESEND_API_KEY || null,
        to: process.env.NOTIFY_EMAIL_TO || null,
        from: process.env.NOTIFY_EMAIL_FROM ?? "Triagepad <triagepad@resend.dev>",
      },
      // Production posture (final runtime shape): the brain stores feedback and
      // dispatches CI; the model pipeline runs in the customer's runner.
      // Opt back into local triage (dev) with LOCAL_INGEST=1.
      localIngest: process.env.LOCAL_INGEST === "1",
    },
  };
}
