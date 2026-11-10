import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentArgs, agentLimits, executeActions, parseAgentResult, DEFAULT_AGENT_MAX_TURNS } from "../src/action/github.js";
import type { FixPrompt } from "../src/core/types.js";
import { bug } from "./helpers.js";

test("agent limits: explicit config > env > defaults; the model falls back to the triage model", () => {
  assert.deepEqual(agentLimits(undefined, "claude-opus-4-8", {}), {
    model: "claude-opus-4-8",
    maxTurns: DEFAULT_AGENT_MAX_TURNS,
    timeoutMs: 20 * 60_000,
  });
  const env = { TRIAGEPAD_AGENT_MODEL: "m-env", TRIAGEPAD_AGENT_MAX_TURNS: "7", TRIAGEPAD_AGENT_TIMEOUT_MINUTES: "3" };
  assert.deepEqual(agentLimits(undefined, "fallback", env), { model: "m-env", maxTurns: 7, timeoutMs: 180_000 });
  assert.deepEqual(agentLimits({ model: "m-in", maxTurns: 2, timeoutMs: 1000 }, "fallback", env), {
    model: "m-in",
    maxTurns: 2,
    timeoutMs: 1000,
  });
  // Garbage env values are ignored, never NaN.
  assert.equal(agentLimits(undefined, "x", { TRIAGEPAD_AGENT_MAX_TURNS: "lots" }).maxTurns, DEFAULT_AGENT_MAX_TURNS);
});

test("claude -p argv carries --max-turns and --model", () => {
  const args = agentArgs("fix it", "Edit,Read", { model: "claude-opus-4-8", maxTurns: 40, timeoutMs: 1 });
  assert.deepEqual(args.slice(0, 2), ["-p", "fix it"]);
  assert.equal(args[args.indexOf("--max-turns") + 1], "40");
  assert.equal(args[args.indexOf("--model") + 1], "claude-opus-4-8");
  assert.equal(args[args.indexOf("--output-format") + 1], "json");
});

test("agent result parsing tolerates noise and garbage", () => {
  assert.equal(parseAgentResult('log line\n{"subtype":"error_max_turns","is_error":true}')?.subtype, "error_max_turns");
  assert.equal(parseAgentResult('{"subtype":"success","total_cost_usd":0.5}')?.total_cost_usd, 0.5);
  assert.equal(parseAgentResult("not json"), null);
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

async function runWithFakeAgent(script: string, timeoutMs: number) {
  const root = mkdtempSync(join(tmpdir(), "tp-agent-"));
  const remote = join(root, "remote.git");
  const work = join(root, "work");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  execFileSync("git", ["clone", "-q", remote, work]);
  git(work, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
  git(work, "push", "-q", "origin", "HEAD:main");
  const bin = join(root, "bin");
  execFileSync("mkdir", [bin]);
  writeFileSync(join(bin, "claude"), script);
  chmodSync(join(bin, "claude"), 0o755);
  const prevPath = process.env.PATH;
  process.env.PATH = `${bin}:${prevPath}`;
  try {
    const [result] = await executeActions(
      {
        repoDir: work, githubToken: "", anthropicApiKey: "", agentAllowedTools: "Edit",
        agent: { model: "m", maxTurns: 3, timeoutMs }, defaultBranch: "main", dryRun: false, log: () => {},
      },
      [{ kind: "open-pr", ticket: bug("TP-1"), fix: { ticketId: "TP-1", promptBody: "fix" } as FixPrompt, autoMerge: false }],
    );
    return { result: result!, work };
  } finally {
    process.env.PATH = prevPath;
  }
}

test("a run capped by --max-turns that still exits 0 is discarded, not PR'd", async () => {
  const { result, work } = await runWithFakeAgent(
    `#!/bin/sh\necho partial > partial.swift\necho '{"type":"result","subtype":"error_max_turns","is_error":true}'\n`,
    5000,
  );
  assert.equal(result.status, "no-change");
  assert.match(result.outcome, /error_max_turns/);
  assert.ok(!existsSync(join(work, "partial.swift")));
});

test("a fix agent that overruns its timeout is killed, its partial edit discarded, and no PR opens", async () => {
  const root = mkdtempSync(join(tmpdir(), "tp-agent-"));
  const remote = join(root, "remote.git");
  const work = join(root, "work");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  execFileSync("git", ["clone", "-q", remote, work]);
  git(work, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
  git(work, "push", "-q", "origin", "HEAD:main");

  // A fake `claude` that edits a file and then hangs.
  const bin = join(root, "bin");
  execFileSync("mkdir", [bin]);
  writeFileSync(join(bin, "claude"), `#!/bin/sh\necho partial > partial.swift\nsleep 30\n`);
  chmodSync(join(bin, "claude"), 0o755);

  const fix = { ticketId: "TP-1", promptBody: "fix" } as FixPrompt;
  const prevPath = process.env.PATH;
  process.env.PATH = `${bin}:${prevPath}`;
  const started = Date.now();
  try {
    const [result] = await executeActions(
      {
        repoDir: work,
        githubToken: "",
        anthropicApiKey: "",
        agentAllowedTools: "Edit",
        agent: { model: "m", maxTurns: 3, timeoutMs: 700 },
        defaultBranch: "main",
        dryRun: false,
        log: () => {},
      },
      [{ kind: "open-pr", ticket: bug("TP-1"), fix, autoMerge: false }],
    );
    assert.ok(Date.now() - started < 10_000, "the hung agent was killed by the timeout");
    assert.equal(result!.status, "no-change");
    assert.match(result!.outcome, /timed out/);
    assert.equal(result!.prUrl, null);
    assert.ok(!existsSync(join(work, "partial.swift")), "partial edit discarded");
    assert.equal(git(work, "rev-parse", "--abbrev-ref", "HEAD"), "main");
  } finally {
    process.env.PATH = prevPath;
  }
});
