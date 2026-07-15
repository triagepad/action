// Stage 1 — Pull (the data premise).
// Pulls screenshot + crash feedback, downloads assets, writes BOTH the raw
// API responses and a normalised FeedbackItem[] under out/raw/, then prints
// a field-presence summary so Peter can judge question 1 directly.
//
// out/raw/
//   screenshot-submissions.json   raw list response, exactly as returned
//   crash-submissions.json        raw list response, exactly as returned
//   crashlogs/{id}.json           raw crashLog response per crash
//   crashlogs/{id}.crash          logText only, for reading/symbolication
//   screenshots/{id}-{n}.png      downloaded screenshot images
//   feedback.json                 normalised FeedbackItem[]

import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Config } from "../config.js";
import type { FeedbackItem } from "../core/index.js";
import { AscClient, type AscListResponse, type AscResource } from "../asc/client.js";

interface ScreenshotImage {
  url: string;
  width?: number;
  height?: number;
  expirationDate?: string;
}

function buildNumberFor(item: AscResource, included: AscResource[]): string | null {
  const buildRef = item.relationships?.build?.data;
  if (!buildRef) return null;
  const build = included.find((r) => r.type === buildRef.type && r.id === buildRef.id);
  return (build?.attributes?.version as string | undefined) ?? null;
}

function str(attrs: Record<string, unknown> | undefined, key: string): string | null {
  const v = attrs?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function runPull(config: Config): Promise<FeedbackItem[]> {
  const client = new AscClient(config);
  const raw = config.out.raw;
  const screenshotsDir = join(raw, "screenshots");
  const crashlogsDir = join(raw, "crashlogs");
  for (const dir of [raw, screenshotsDir, crashlogsDir]) mkdirSync(dir, { recursive: true });

  console.log(`Pulling up to ${config.feedbackLimit} items per feedback type…`);
  const [screens, crashes] = await Promise.all([
    client.listScreenshotFeedback(config.feedbackLimit),
    client.listCrashFeedback(config.feedbackLimit),
  ]);

  writeFileSync(join(raw, "screenshot-submissions.json"), JSON.stringify(screens, null, 2));
  writeFileSync(join(raw, "crash-submissions.json"), JSON.stringify(crashes, null, 2));

  const items: FeedbackItem[] = [];

  items.push(...(await normaliseScreenshots(client, screens, screenshotsDir, config)));
  items.push(...(await normaliseCrashes(client, crashes, crashlogsDir, config)));

  writeFileSync(join(raw, "feedback.json"), JSON.stringify(items, null, 2));

  printSummary(items, config);
  return items;
}

async function normaliseScreenshots(
  client: AscClient,
  res: AscListResponse,
  dir: string,
  config: Config,
): Promise<FeedbackItem[]> {
  const items: FeedbackItem[] = [];
  for (const sub of res.data) {
    const attrs = sub.attributes;
    const images = (attrs?.screenshots as ScreenshotImage[] | undefined) ?? [];
    let screenshotPath: string | null = null;
    for (const [n, image] of images.entries()) {
      try {
        const file = join(dir, `${sub.id}-${n}.png`);
        writeFileSync(file, await client.downloadAsset(image.url));
        // Ticket links point at the first image; the rest sit alongside it.
        screenshotPath ??= relative(config.out.root, file);
      } catch (err) {
        console.warn(`  ! screenshot download failed for ${sub.id}: ${(err as Error).message}`);
      }
    }
    items.push({
      id: sub.id,
      type: "screenshot",
      text: str(attrs, "comment"),
      screenshotPath,
      crashLogPath: null,
      device: str(attrs, "deviceModel"),
      osVersion: str(attrs, "osVersion"),
      appVersion: null, // marketing version needs an extra preReleaseVersion fetch; build number below suffices for the spike
      build: buildNumberFor(sub, res.included ?? []),
      locale: str(attrs, "locale"),
      createdAt: str(attrs, "createdDate"),
    });
  }
  return items;
}

async function normaliseCrashes(
  client: AscClient,
  res: AscListResponse,
  dir: string,
  config: Config,
): Promise<FeedbackItem[]> {
  const items: FeedbackItem[] = [];
  for (const sub of res.data) {
    const attrs = sub.attributes;
    let crashLogPath: string | null = null;
    try {
      const logRes = (await client.getCrashLog(sub.id)) as {
        data?: { attributes?: { logText?: string } };
      };
      writeFileSync(join(dir, `${sub.id}.json`), JSON.stringify(logRes, null, 2));
      const logText = logRes.data?.attributes?.logText;
      if (logText) {
        const file = join(dir, `${sub.id}.crash`);
        writeFileSync(file, logText);
        crashLogPath = relative(config.out.root, file);
      }
    } catch (err) {
      console.warn(`  ! crash log fetch failed for ${sub.id}: ${(err as Error).message}`);
    }
    items.push({
      id: sub.id,
      type: "crash",
      text: str(attrs, "comment"),
      screenshotPath: null,
      crashLogPath,
      device: str(attrs, "deviceModel"),
      osVersion: str(attrs, "osVersion"),
      appVersion: null,
      build: buildNumberFor(sub, res.included ?? []),
      locale: str(attrs, "locale"),
      createdAt: str(attrs, "createdDate"),
    });
  }
  return items;
}

function printSummary(items: FeedbackItem[], config: Config): void {
  const screenshots = items.filter((i) => i.type === "screenshot");
  const crashes = items.filter((i) => i.type === "crash");
  console.log(`\nPulled ${items.length} items: ${screenshots.length} screenshot, ${crashes.length} crash.`);
  console.log(`Raw payloads + assets in ${relative(process.cwd(), config.out.raw)}/\n`);

  const fields = [
    "text",
    "screenshotPath",
    "crashLogPath",
    "device",
    "osVersion",
    "build",
    "locale",
    "createdAt",
  ] as const;

  console.log(["id", "type", ...fields].join("\t"));
  for (const item of items) {
    const presence = fields.map((f) => (item[f] !== null ? "✓" : "–"));
    console.log([item.id.slice(0, 8), item.type, ...presence].join("\t"));
  }

  for (const field of fields) {
    const have = items.filter((i) => i[field] !== null).length;
    console.log(`${field}: ${have}/${items.length}`);
  }
}
