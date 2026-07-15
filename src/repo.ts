// Local-filesystem implementation of the core RepoAccess interface —
// the "local agent" shape. A CI-checkout implementation is identical;
// a GitHub-API implementation can replace it later. Read-only, always.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { GitCommit, GrepMatch, RepoAccess } from "./core/types.js";

const IGNORED_DIRS = new Set([".git", ".build", "DerivedData", "node_modules", "Pods", ".swiftpm", "dist"]);
const SOURCE_EXTENSIONS = [".swift", ".strings", ".xcstrings", ".stringsdict", ".ts", ".sql", ".md", ".plist", ".json", ".yml", ".yaml"];

export function localRepoAccess(repoRoot: string): RepoAccess {
  const safePath = (path: string): string => {
    const full = join(repoRoot, path);
    if (relative(repoRoot, full).startsWith("..")) throw new Error(`Path escapes repo: ${path}`);
    return full;
  };

  return {
    listFiles(): string[] {
      const files: string[] = [];
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) walk(join(dir, entry.name));
          } else if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
            files.push(relative(repoRoot, join(dir, entry.name)));
          }
        }
      };
      walk(repoRoot);
      return files.sort();
    },

    grep(pattern: string, isRegex: boolean, maxMatches = 60): GrepMatch[] {
      let regex: RegExp;
      try {
        regex = isRegex ? new RegExp(pattern, "i") : new RegExp(escapeRegex(pattern), "i");
      } catch {
        regex = new RegExp(escapeRegex(pattern), "i");
      }

      const matches: GrepMatch[] = [];
      for (const file of this.listFiles()) {
        const full = join(repoRoot, file);
        if (statSync(full).size > 2_000_000) continue;
        const lines = readFileSync(full, "utf8").split("\n");
        for (const [i, text] of lines.entries()) {
          if (regex.test(text)) {
            matches.push({ file, line: i + 1, text: text.trim().slice(0, 240) });
            if (matches.length >= maxMatches) return matches;
          }
        }
      }
      return matches;
    },

    readFile(path: string, startLine?: number, endLine?: number): string {
      const lines = readFileSync(safePath(path), "utf8").split("\n");
      const from = Math.max(1, startLine ?? 1);
      const to = Math.min(lines.length, endLine ?? from + 199);
      return lines
        .slice(from - 1, to)
        .map((text, i) => `${from + i}\t${text}`)
        .join("\n");
    },

    fileExists(path: string): boolean {
      try {
        return existsSync(safePath(path)) && statSync(safePath(path)).isFile();
      } catch {
        return false;
      }
    },

    lineCount(path: string): number | null {
      try {
        return readFileSync(safePath(path), "utf8").split("\n").length;
      } catch {
        return null;
      }
    },

    // Git-backed evidence layers. All degrade to []/null/false on non-git
    // directories (fixture repos, tarball checkouts) — the layers just stay
    // inactive there.
    history(paths: string[], limit = 20): GitCommit[] {
      const lines = git(repoRoot, [
        "log",
        `-n${Math.min(limit, 100)}`,
        "--format=%h\t%as\t%s",
        "--",
        ...paths.map((p) => relative(repoRoot, safePath(p))),
      ]);
      if (lines === null) return [];
      return lines
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [sha = "", date = "", ...subject] = line.split("\t");
          return { sha, date, subject: subject.join("\t") };
        });
    },

    resolveBuild(build: string): string | null {
      if (!/^[\w.-]+$/.test(build)) return null;
      const tags = git(repoRoot, ["tag", "--list", `*${build}*`])?.split("\n").filter(Boolean) ?? [];
      // Only trust an unambiguous mapping.
      if (tags.length !== 1) return null;
      return git(repoRoot, ["rev-list", "-n1", tags[0]!]);
    },

    isAncestor(ancestor: string, descendant: string): boolean {
      if (!/^[0-9a-f]{4,40}$/i.test(ancestor) || !/^[0-9a-f]{4,40}$/i.test(descendant)) return false;
      try {
        execFileSync("git", ["-C", repoRoot, "merge-base", "--is-ancestor", ancestor, descendant], {
          stdio: "ignore",
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}

function git(repoRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    }).trim();
  } catch {
    return null;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
