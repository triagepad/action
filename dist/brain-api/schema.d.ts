import { z } from "zod";
export declare const zTicketCategory: z.ZodEnum<{
    crash: "crash";
    ui: "ui";
    perf: "perf";
    copy: "copy";
    "feature-request": "feature-request";
    praise: "praise";
}>;
export declare const zTicketSeverity: z.ZodEnum<{
    critical: "critical";
    high: "high";
    medium: "medium";
    low: "low";
}>;
export declare const zConfidence: z.ZodEnum<{
    high: "high";
    medium: "medium";
    low: "low";
}>;
export declare const zTriagedTicket: z.ZodObject<{
    id: z.ZodString;
    feedbackIds: z.ZodArray<z.ZodString>;
    title: z.ZodString;
    whatHappened: z.ZodString;
    likelyRepro: z.ZodArray<z.ZodString>;
    affectedArea: z.ZodString;
    severity: z.ZodEnum<{
        critical: "critical";
        high: "high";
        medium: "medium";
        low: "low";
    }>;
    category: z.ZodEnum<{
        crash: "crash";
        ui: "ui";
        perf: "perf";
        copy: "copy";
        "feature-request": "feature-request";
        praise: "praise";
    }>;
    isRealBug: z.ZodBoolean;
    device: z.ZodNullable<z.ZodString>;
    osVersion: z.ZodNullable<z.ZodString>;
    appVersion: z.ZodNullable<z.ZodString>;
    build: z.ZodNullable<z.ZodString>;
    screenshotPath: z.ZodNullable<z.ZodString>;
    crashLogPath: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export declare const zCandidate: z.ZodObject<{
    file: z.ZodString;
    symbol: z.ZodNullable<z.ZodString>;
    line: z.ZodNullable<z.ZodNumber>;
    confidence: z.ZodNumber;
    signal: z.ZodEnum<{
        "crash-stack": "crash-stack";
        "string-literal": "string-literal";
        identifier: "identifier";
    }>;
    rationale: z.ZodString;
    verification: z.ZodObject<{
        status: z.ZodEnum<{
            verified: "verified";
            "file-missing": "file-missing";
            "line-out-of-range": "line-out-of-range";
            "symbol-not-found": "symbol-not-found";
        }>;
        detail: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>;
export declare const zNeedsDecision: z.ZodObject<{
    required: z.ZodBoolean;
    reason: z.ZodNullable<z.ZodString>;
    options: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        tradeoff: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const zFixPrompt: z.ZodObject<{
    ticketId: z.ZodString;
    candidates: z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        symbol: z.ZodNullable<z.ZodString>;
        line: z.ZodNullable<z.ZodNumber>;
        confidence: z.ZodNumber;
        signal: z.ZodEnum<{
            "crash-stack": "crash-stack";
            "string-literal": "string-literal";
            identifier: "identifier";
        }>;
        rationale: z.ZodString;
        verification: z.ZodObject<{
            status: z.ZodEnum<{
                verified: "verified";
                "file-missing": "file-missing";
                "line-out-of-range": "line-out-of-range";
                "symbol-not-found": "symbol-not-found";
            }>;
            detail: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>;
    }, z.core.$strict>>;
    overallConfidence: z.ZodEnum<{
        high: "high";
        medium: "medium";
        low: "low";
    }>;
    validationPassed: z.ZodBoolean;
    needsDecision: z.ZodObject<{
        required: z.ZodBoolean;
        reason: z.ZodNullable<z.ZodString>;
        options: z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            tradeoff: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    promptBody: z.ZodString;
    prompts: z.ZodObject<{
        plan: z.ZodString;
        pr: z.ZodString;
        autofix: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
    explanation: z.ZodString;
}, z.core.$strict>;
export declare const zSkippedTicket: z.ZodObject<{
    ticketId: z.ZodString;
    reason: z.ZodString;
}, z.core.$strict>;
export declare const zFixedTicket: z.ZodObject<{
    ticketId: z.ZodString;
    reason: z.ZodString;
    resolvedBy: z.ZodNullable<z.ZodString>;
    evidenceSource: z.ZodOptional<z.ZodEnum<{
        code: "code";
        "build-and-history": "build-and-history";
    }>>;
}, z.core.$strict>;
export declare const zFixesOutput: z.ZodObject<{
    version: z.ZodLiteral<1>;
    generatedAt: z.ZodString;
    processed: z.ZodArray<z.ZodObject<{
        ticketId: z.ZodString;
        candidates: z.ZodArray<z.ZodObject<{
            file: z.ZodString;
            symbol: z.ZodNullable<z.ZodString>;
            line: z.ZodNullable<z.ZodNumber>;
            confidence: z.ZodNumber;
            signal: z.ZodEnum<{
                "crash-stack": "crash-stack";
                "string-literal": "string-literal";
                identifier: "identifier";
            }>;
            rationale: z.ZodString;
            verification: z.ZodObject<{
                status: z.ZodEnum<{
                    verified: "verified";
                    "file-missing": "file-missing";
                    "line-out-of-range": "line-out-of-range";
                    "symbol-not-found": "symbol-not-found";
                }>;
                detail: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>;
        }, z.core.$strict>>;
        overallConfidence: z.ZodEnum<{
            high: "high";
            medium: "medium";
            low: "low";
        }>;
        validationPassed: z.ZodBoolean;
        needsDecision: z.ZodObject<{
            required: z.ZodBoolean;
            reason: z.ZodNullable<z.ZodString>;
            options: z.ZodArray<z.ZodObject<{
                label: z.ZodString;
                tradeoff: z.ZodString;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        promptBody: z.ZodString;
        prompts: z.ZodObject<{
            plan: z.ZodString;
            pr: z.ZodString;
            autofix: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>;
        explanation: z.ZodString;
    }, z.core.$strict>>;
    skipped: z.ZodArray<z.ZodObject<{
        ticketId: z.ZodString;
        reason: z.ZodString;
    }, z.core.$strict>>;
    fixed: z.ZodArray<z.ZodObject<{
        ticketId: z.ZodString;
        reason: z.ZodString;
        resolvedBy: z.ZodNullable<z.ZodString>;
        evidenceSource: z.ZodOptional<z.ZodEnum<{
            code: "code";
            "build-and-history": "build-and-history";
        }>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const zFeedbackItem: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
        screenshot: "screenshot";
        crash: "crash";
    }>;
    text: z.ZodNullable<z.ZodString>;
    screenshotPath: z.ZodNullable<z.ZodString>;
    crashLogPath: z.ZodNullable<z.ZodString>;
    device: z.ZodNullable<z.ZodString>;
    osVersion: z.ZodNullable<z.ZodString>;
    appVersion: z.ZodNullable<z.ZodString>;
    build: z.ZodNullable<z.ZodString>;
    locale: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
/** POST /v1/results — everything the CI run reports back. Metadata only. */
export declare const zResultsReport: z.ZodObject<{
    runId: z.ZodString;
    feedbackIds: z.ZodArray<z.ZodString>;
    feedbackItems: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<{
            screenshot: "screenshot";
            crash: "crash";
        }>;
        text: z.ZodNullable<z.ZodString>;
        screenshotPath: z.ZodNullable<z.ZodString>;
        crashLogPath: z.ZodNullable<z.ZodString>;
        device: z.ZodNullable<z.ZodString>;
        osVersion: z.ZodNullable<z.ZodString>;
        appVersion: z.ZodNullable<z.ZodString>;
        build: z.ZodNullable<z.ZodString>;
        locale: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
    tickets: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        feedbackIds: z.ZodArray<z.ZodString>;
        title: z.ZodString;
        whatHappened: z.ZodString;
        likelyRepro: z.ZodArray<z.ZodString>;
        affectedArea: z.ZodString;
        severity: z.ZodEnum<{
            critical: "critical";
            high: "high";
            medium: "medium";
            low: "low";
        }>;
        category: z.ZodEnum<{
            crash: "crash";
            ui: "ui";
            perf: "perf";
            copy: "copy";
            "feature-request": "feature-request";
            praise: "praise";
        }>;
        isRealBug: z.ZodBoolean;
        device: z.ZodNullable<z.ZodString>;
        osVersion: z.ZodNullable<z.ZodString>;
        appVersion: z.ZodNullable<z.ZodString>;
        build: z.ZodNullable<z.ZodString>;
        screenshotPath: z.ZodNullable<z.ZodString>;
        crashLogPath: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
    fixes: z.ZodObject<{
        version: z.ZodLiteral<1>;
        generatedAt: z.ZodString;
        processed: z.ZodArray<z.ZodObject<{
            ticketId: z.ZodString;
            candidates: z.ZodArray<z.ZodObject<{
                file: z.ZodString;
                symbol: z.ZodNullable<z.ZodString>;
                line: z.ZodNullable<z.ZodNumber>;
                confidence: z.ZodNumber;
                signal: z.ZodEnum<{
                    "crash-stack": "crash-stack";
                    "string-literal": "string-literal";
                    identifier: "identifier";
                }>;
                rationale: z.ZodString;
                verification: z.ZodObject<{
                    status: z.ZodEnum<{
                        verified: "verified";
                        "file-missing": "file-missing";
                        "line-out-of-range": "line-out-of-range";
                        "symbol-not-found": "symbol-not-found";
                    }>;
                    detail: z.ZodNullable<z.ZodString>;
                }, z.core.$strict>;
            }, z.core.$strict>>;
            overallConfidence: z.ZodEnum<{
                high: "high";
                medium: "medium";
                low: "low";
            }>;
            validationPassed: z.ZodBoolean;
            needsDecision: z.ZodObject<{
                required: z.ZodBoolean;
                reason: z.ZodNullable<z.ZodString>;
                options: z.ZodArray<z.ZodObject<{
                    label: z.ZodString;
                    tradeoff: z.ZodString;
                }, z.core.$strict>>;
            }, z.core.$strict>;
            promptBody: z.ZodString;
            prompts: z.ZodObject<{
                plan: z.ZodString;
                pr: z.ZodString;
                autofix: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>;
            explanation: z.ZodString;
        }, z.core.$strict>>;
        skipped: z.ZodArray<z.ZodObject<{
            ticketId: z.ZodString;
            reason: z.ZodString;
        }, z.core.$strict>>;
        fixed: z.ZodArray<z.ZodObject<{
            ticketId: z.ZodString;
            reason: z.ZodString;
            resolvedBy: z.ZodNullable<z.ZodString>;
            evidenceSource: z.ZodOptional<z.ZodEnum<{
                code: "code";
                "build-and-history": "build-and-history";
            }>>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    executions: z.ZodArray<z.ZodObject<{
        ticketId: z.ZodString;
        outcome: z.ZodString;
        url: z.ZodNullable<z.ZodString>;
        runId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        prUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        status: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type ResultsReport = z.infer<typeof zResultsReport>;
/**
 * GET /v1/tickets/:id/fix-context — the per-ticket fix path (M9). The CI action
 * fetches a single ticket + its stored FixPrompt (metadata only — no repo tree)
 * and the chosen output mode, then localises/executes exactly that one ticket.
 */
export declare const zFixContextResponse: z.ZodObject<{
    ticket: z.ZodObject<{
        id: z.ZodString;
        feedbackIds: z.ZodArray<z.ZodString>;
        title: z.ZodString;
        whatHappened: z.ZodString;
        likelyRepro: z.ZodArray<z.ZodString>;
        affectedArea: z.ZodString;
        severity: z.ZodEnum<{
            critical: "critical";
            high: "high";
            medium: "medium";
            low: "low";
        }>;
        category: z.ZodEnum<{
            crash: "crash";
            ui: "ui";
            perf: "perf";
            copy: "copy";
            "feature-request": "feature-request";
            praise: "praise";
        }>;
        isRealBug: z.ZodBoolean;
        device: z.ZodNullable<z.ZodString>;
        osVersion: z.ZodNullable<z.ZodString>;
        appVersion: z.ZodNullable<z.ZodString>;
        build: z.ZodNullable<z.ZodString>;
        screenshotPath: z.ZodNullable<z.ZodString>;
        crashLogPath: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
    fix: z.ZodNullable<z.ZodObject<{
        ticketId: z.ZodString;
        candidates: z.ZodArray<z.ZodObject<{
            file: z.ZodString;
            symbol: z.ZodNullable<z.ZodString>;
            line: z.ZodNullable<z.ZodNumber>;
            confidence: z.ZodNumber;
            signal: z.ZodEnum<{
                "crash-stack": "crash-stack";
                "string-literal": "string-literal";
                identifier: "identifier";
            }>;
            rationale: z.ZodString;
            verification: z.ZodObject<{
                status: z.ZodEnum<{
                    verified: "verified";
                    "file-missing": "file-missing";
                    "line-out-of-range": "line-out-of-range";
                    "symbol-not-found": "symbol-not-found";
                }>;
                detail: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>;
        }, z.core.$strict>>;
        overallConfidence: z.ZodEnum<{
            high: "high";
            medium: "medium";
            low: "low";
        }>;
        validationPassed: z.ZodBoolean;
        needsDecision: z.ZodObject<{
            required: z.ZodBoolean;
            reason: z.ZodNullable<z.ZodString>;
            options: z.ZodArray<z.ZodObject<{
                label: z.ZodString;
                tradeoff: z.ZodString;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        promptBody: z.ZodString;
        prompts: z.ZodObject<{
            plan: z.ZodString;
            pr: z.ZodString;
            autofix: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>;
        explanation: z.ZodString;
    }, z.core.$strict>>;
    mode: z.ZodEnum<{
        plan: "plan";
        pr: "pr";
        autofix: "autofix";
    }>;
}, z.core.$strict>;
export type FixContextResponse = z.infer<typeof zFixContextResponse>;
/** GET /v1/feedback/pending */
export declare const zPendingResponse: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<{
            screenshot: "screenshot";
            crash: "crash";
        }>;
        text: z.ZodNullable<z.ZodString>;
        screenshotPath: z.ZodNullable<z.ZodString>;
        crashLogPath: z.ZodNullable<z.ZodString>;
        device: z.ZodNullable<z.ZodString>;
        osVersion: z.ZodNullable<z.ZodString>;
        appVersion: z.ZodNullable<z.ZodString>;
        build: z.ZodNullable<z.ZodString>;
        locale: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
    processedFeedbackIds: z.ZodArray<z.ZodString>;
    attachments: z.ZodRecord<z.ZodString, z.ZodString>;
    nextTicketNumber: z.ZodNumber;
}, z.core.$strict>;
export type PendingResponse = z.infer<typeof zPendingResponse>;
/** POST /v1/tickets/reserve — atomically reserve a block of ticket numbers. */
export declare const zReserveRequest: z.ZodObject<{
    count: z.ZodNumber;
}, z.core.$strict>;
export declare const zReserveResponse: z.ZodObject<{
    start: z.ZodNumber;
    count: z.ZodNumber;
}, z.core.$strict>;
export type ReserveResponse = z.infer<typeof zReserveResponse>;
/** GET /v1/methodology — bundle is validated structurally, content is opaque. */
export declare const zMethodologyResponse: z.ZodObject<{
    methodology: z.ZodObject<{
        version: z.ZodLiteral<1>;
        prompts: z.ZodRecord<z.ZodString, z.ZodString>;
        schemas: z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        toolDescriptions: z.ZodRecord<z.ZodString, z.ZodString>;
        defaults: z.ZodObject<{
            models: z.ZodObject<{
                classify: z.ZodString;
                triage: z.ZodString;
            }, z.core.$strict>;
            minConfidence: z.ZodEnum<{
                high: "high";
                medium: "medium";
                low: "low";
            }>;
        }, z.core.$strict>;
    }, z.core.$strict>;
    config: z.ZodObject<{
        models: z.ZodObject<{
            classify: z.ZodString;
            triage: z.ZodString;
        }, z.core.$strict>;
        minConfidence: z.ZodEnum<{
            high: "high";
            medium: "medium";
            low: "low";
        }>;
        defaultMode: z.ZodEnum<{
            plan: "plan";
            pr: "pr";
            autofix: "autofix";
        }>;
        appContext: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>;
export type MethodologyResponse = z.infer<typeof zMethodologyResponse>;
