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
export interface LoadConfigOptions {
    /**
     * "cli" (default) hard-requires every var the local pipeline needs.
     * "server" is tolerant: the brain never touches the repo and, in its default
     * posture, never calls Anthropic — so STOPA_REPO_PATH / ANTHROPIC_API_KEY /
     * incomplete ASC creds degrade features instead of crashing the process.
     */
    context?: "cli" | "server";
}
export declare function loadConfig(opts?: LoadConfigOptions): Config;
