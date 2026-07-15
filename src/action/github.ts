// GitHub-side execution of planned actions: branches, the headless code agent,
// PRs, issues, and the step summary. Uses git + the preinstalled `gh` CLI with
// GH_TOKEN set to the GitHub App installation token — PRs/issues are authored
// by the Triagepad App, not a personal token. No secrets are ever echoed.
//
// Hardening:
// - argv-only invocation (execFileSync, no shell string) so model-generated
//   titles/bodies/prompts can never be shell-interpolated or injected.
// - issue/PR bodies pass via --body-file from a temp file, not inline --body.
// - labels are auto-provisioned idempotently and applied best-effort AFTER the
//   issue/PR exists; a label problem is logged and never hard-fails the run.

import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlannedAction } from "./route.js";
import { decisionIssueBody, featureIssueBody, ticketBody } from "./route.js";

export interface ExecutorConfig {
  repoDir: string;
  githubToken: string;
  anthropicApiKey: string;
  /** Claude Code tool allowlist for the fix agent; no arbitrary bash by default. */
  agentAllowedTools: string;
  defaultBranch: string;
  dryRun: boolean;
  log: (message: string) => void;
  /** Raw tester feedback for feature-request issues (id -> text/screenshot). */
  feedbackLookup?: Map<string, { text: string | null; screenshotPath: string | null }>;
  /** Link to this run's uploaded artifact, for referencing screenshots in issues. */
  runArtifactUrl?: string | null;
}

export interface ExecutionResult {
  ticketId: string;
  outcome: string;
  url: string | null;
}

/** Label registry — colour + description are applied idempotently via `gh label create --force`. */
const LABELS = {
  triagepad: { color: "5319e7", description: "Managed by Triagepad" },
  "triagepad:feature-request": { color: "0e8a16", description: "Tester feature-request surfaced by Triagepad" },
  "triagepad:needs-decision": { color: "fbca04", description: "Needs a human decision before any fix is dispatched" },
  autofix: { color: "1d76db", description: "Auto-merge unavailable — merge manually" },
} as const;
type LabelName = keyof typeof LABELS;

function sh(cfg: ExecutorConfig, cmd: string, args: string[], opts?: { env?: Record<string, string> }): string {
  return execFileSync(cmd, args, {
    cwd: cfg.repoDir,
    encoding: "utf8",
    env: { ...process.env, GH_TOKEN: cfg.githubToken, ...opts?.env },
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

/** Write a body to a fresh temp file and return its path (for gh --body-file). */
function bodyFile(text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "triagepad-body-")), "body.md");
  writeFileSync(path, text);
  return path;
}

/**
 * Ensure each label exists (create-or-update, idempotent). Best-effort: a
 * failure (e.g. no label permission on a fresh repo) is logged, not fatal.
 */
function ensureLabels(cfg: ExecutorConfig, names: LabelName[]): void {
  for (const name of names) {
    try {
      sh(cfg, "gh", [
        "label", "create", name,
        "--color", LABELS[name].color,
        "--description", LABELS[name].description,
        "--force",
      ]);
    } catch (err) {
      cfg.log(`label: could not ensure '${name}' (continuing without it): ${errMsg(err)}`);
    }
  }
}

/**
 * Add labels to an already-created issue/PR, best-effort. The issue/PR is never
 * lost to a label problem — creation happens first, unlabeled, and this only
 * decorates it afterwards.
 */
function applyLabels(cfg: ExecutorConfig, kind: "issue" | "pr", ref: string, names: LabelName[]): void {
  if (names.length === 0) return;
  ensureLabels(cfg, names);
  try {
    sh(cfg, "gh", [kind, "edit", ref, "--add-label", names.join(",")]);
  } catch (err) {
    cfg.log(`label: could not apply [${names.join(", ")}] to ${ref} (issue/PR still created): ${errMsg(err)}`);
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message.split("\n")[0]! : String(err);
}

export async function executeActions(cfg: ExecutorConfig, actions: PlannedAction[]): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  for (const action of actions) {
    results.push(await executeOne(cfg, action));
  }
  writeStepSummary(results, actions);
  return results;
}

async function executeOne(cfg: ExecutorConfig, action: PlannedAction): Promise<ExecutionResult> {
  const id = action.ticket.id;
  switch (action.kind) {
    case "report-skip":
      return { ticketId: id, outcome: `skipped — ${action.reason}`, url: null };
    case "report-fixed":
      return {
        ticketId: id,
        outcome:
          `already fixed${action.resolvedBy ? ` by ${action.resolvedBy}` : ""}` +
          `${action.evidenceSource ? ` (via ${action.evidenceSource})` : ""} — stale report, not actioned`,
        url: null,
      };
    case "report-not-eligible":
      return { ticketId: id, outcome: `not dispatched — ${action.reason}`, url: null };
    case "plan-issue":
      return openPlanIssue(cfg, action);
    case "decision-issue":
      return openDecisionIssue(cfg, action);
    case "feature-issue":
      return openFeatureIssue(cfg, action);
    case "open-pr":
      return openFixPr(cfg, action);
  }
}

/** Create an issue unlabeled (never blocked by labels), then decorate best-effort. */
function createIssue(cfg: ExecutorConfig, title: string, body: string, labels: LabelName[]): string {
  const url = sh(cfg, "gh", ["issue", "create", "--title", title, "--body-file", bodyFile(body)]);
  applyLabels(cfg, "issue", url, labels);
  return url;
}

function openPlanIssue(cfg: ExecutorConfig, action: Extract<PlannedAction, { kind: "plan-issue" }>): ExecutionResult {
  const title = `[triagepad][plan] ${action.ticket.id}: ${action.ticket.title}`;
  const body = [
    `Plan mode — no code was changed. Ready-to-run plan prompt below.`,
    "",
    ticketBody(action.ticket, action.fix),
    "",
    "### Plan prompt",
    "```",
    action.fix.prompts.plan,
    "```",
  ].join("\n");
  if (cfg.dryRun) {
    cfg.log(`[dry-run] would open plan issue: ${title}`);
    return { ticketId: action.ticket.id, outcome: "plan issue (dry-run)", url: null };
  }
  const url = createIssue(cfg, title, body, ["triagepad"]);
  return { ticketId: action.ticket.id, outcome: "plan issue opened", url };
}

function openDecisionIssue(cfg: ExecutorConfig, action: Extract<PlannedAction, { kind: "decision-issue" }>): ExecutionResult {
  const title = `[triagepad][decision needed] ${action.ticket.id}: ${action.ticket.title}`;
  const body = decisionIssueBody(action.ticket, action.fix);
  if (cfg.dryRun) {
    cfg.log(`[dry-run] would open decision issue: ${title}`);
    return { ticketId: action.ticket.id, outcome: "decision issue (dry-run), no PR", url: null };
  }
  const url = createIssue(cfg, title, body, ["triagepad", "triagepad:needs-decision"]);
  return { ticketId: action.ticket.id, outcome: "decision issue opened, no PR", url };
}

function openFeatureIssue(cfg: ExecutorConfig, action: Extract<PlannedAction, { kind: "feature-issue" }>): ExecutionResult {
  const { ticket } = action;
  const title = `[triagepad][feature] ${ticket.id}: ${ticket.title}`;
  const first = ticket.feedbackIds[0];
  const fb = first ? cfg.feedbackLookup?.get(first) : undefined;
  const screenshotRef =
    fb?.screenshotPath && cfg.runArtifactUrl
      ? `[in the run artifact \`triagepad-out\`](${cfg.runArtifactUrl}) — \`${fb.screenshotPath}\``
      : (fb?.screenshotPath ?? null);
  const body = featureIssueBody(ticket, { testerText: fb?.text ?? null, screenshotRef });
  if (cfg.dryRun) {
    cfg.log(`[dry-run] would open feature-request backlog issue: ${title}`);
    return { ticketId: ticket.id, outcome: "feature-request issue (dry-run), not auto-fixed", url: null };
  }
  const url = createIssue(cfg, title, body, ["triagepad", "triagepad:feature-request"]);
  return { ticketId: ticket.id, outcome: "feature-request backlog issue opened, not auto-fixed", url };
}

function openFixPr(cfg: ExecutorConfig, action: Extract<PlannedAction, { kind: "open-pr" }>): ExecutionResult {
  const { ticket, fix } = action;
  const branch = `triagepad/${ticket.id}`;
  const title = `[triagepad] ${ticket.id}: ${ticket.title}`;

  if (cfg.dryRun) {
    cfg.log(`[dry-run] would run fix agent + open PR on ${branch}: ${title}${action.autoMerge ? " (auto-merge)" : ""}`);
    return { ticketId: ticket.id, outcome: `PR (dry-run${action.autoMerge ? ", auto-merge" : ""})`, url: null };
  }

  sh(cfg, "git", ["checkout", "-B", branch, `origin/${cfg.defaultBranch}`]);

  // Headless Claude Code applies the fix in the working tree; the Action owns
  // branch/PR mechanics, so the agent gets apply-style instructions. The prompt
  // is passed as a single argv element — never through a shell.
  const agentPrompt =
    `Apply this fix in the current working tree. Do NOT create branches, commits or PRs — ` +
    `the harness handles those. Include regression tests where the repo has a test suite.\n\n${fix.promptBody}`;
  sh(cfg, "claude", ["-p", agentPrompt, "--permission-mode", "acceptEdits", "--allowedTools", cfg.agentAllowedTools], {
    env: { ANTHROPIC_API_KEY: cfg.anthropicApiKey },
  });

  const changed = sh(cfg, "git", ["status", "--porcelain"]);
  if (!changed) {
    sh(cfg, "git", ["checkout", cfg.defaultBranch]);
    return { ticketId: ticket.id, outcome: "agent made no changes — nothing to PR", url: null };
  }

  sh(cfg, "git", ["add", "-A"]);
  sh(cfg, "git", [
    "-c", "user.name=triagepad[bot]",
    "-c", "user.email=triagepad[bot]@users.noreply.github.com",
    "commit", "-m", `${title}\n\nAutomated fix from TestFlight feedback via Triagepad.`,
  ]);
  sh(cfg, "git", ["push", "-f", "origin", branch]);

  const url = sh(cfg, "gh", [
    "pr", "create",
    "--head", branch,
    "--base", cfg.defaultBranch,
    "--title", title,
    "--body-file", bodyFile(ticketBody(ticket, fix)),
  ]);
  applyLabels(cfg, "pr", url, ["triagepad"]);

  let outcome = "PR opened";
  if (action.autoMerge) {
    try {
      sh(cfg, "gh", ["pr", "merge", url, "--squash", "--auto"]);
      outcome = "PR opened, auto-merge armed";
    } catch {
      applyLabels(cfg, "pr", url, ["autofix"]);
      outcome = "PR opened, auto-merge unavailable — labeled autofix";
    }
  }
  sh(cfg, "git", ["checkout", cfg.defaultBranch]);
  return { ticketId: ticket.id, outcome, url };
}

/** The no-silent-drops surface in CI: every ticket + its outcome, always. */
export function writeStepSummary(results: ExecutionResult[], actions: PlannedAction[]): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  const lines = [
    `## Triagepad run`,
    "",
    `| Ticket | Title | Outcome | Link |`,
    `|--------|-------|---------|------|`,
    ...results.map((r) => {
      const action = actions.find((a) => a.ticket.id === r.ticketId);
      return `| ${r.ticketId} | ${action?.ticket.title ?? ""} | ${r.outcome} | ${r.url ?? "–"} |`;
    }),
    "",
  ];
  const text = lines.join("\n");
  if (summaryPath) appendFileSync(summaryPath, text + "\n");
  console.log(text);
}
