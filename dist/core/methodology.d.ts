export interface MethodologyBundle {
    version: 1;
    prompts: {
        /** {{appContext}}, {{items}} */
        cluster: string;
        /** {{appContext}}, {{category}}, {{clusterHint}}, {{items}}, {{screenshotNote}}, {{crashSection}} */
        ticket: string;
        /** Inserted into {{screenshotNote}} when images are attached. */
        ticketScreenshotNote: string;
        /** {{crashLog}} — inserted into {{crashSection}} when a crash log exists. */
        ticketCrashSection: string;
        /** {{appContext}}, {{layerB}}, {{layerC}}, {{ticket}}, {{crashSection}}, {{fileTree}} */
        localiseAgent: string;
        /** {{buildLine}} — inserted into {{layerB}} when the build resolves to a commit. */
        localiseLayerB: string;
        /** {{build}}, {{sha}} */
        localiseBuildLine: string;
        /** Inserted into {{layerC}} when the repo has git history. */
        localiseLayerC: string;
        /** {{crashLog}} — inserted into {{crashSection}} when a crash log exists. */
        localiseCrashSection: string;
        /** The forced-JSON final turn of the localisation agent. */
        localiseFinal: string;
    };
    schemas: {
        cluster: Record<string, unknown>;
        ticket: Record<string, unknown>;
        localisation: Record<string, unknown>;
    };
    toolDescriptions: {
        grep: string;
        readFile: string;
        gitLog: string;
    };
    defaults: {
        models: {
            classify: string;
            triage: string;
        };
        minConfidence: "high" | "medium" | "low";
    };
}
/** Minimal {{key}} interpolation; unknown keys render as empty strings. */
export declare function render(template: string, vars: Record<string, string | null | undefined>): string;
