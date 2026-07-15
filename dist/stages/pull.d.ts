import type { Config } from "../config.js";
import type { FeedbackItem } from "../core/index.js";
export declare function runPull(config: Config): Promise<FeedbackItem[]>;
