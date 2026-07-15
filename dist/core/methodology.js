// The methodology bundle SHAPE + the renderer. The bundle carries prompt
// templates, structured-output schemas, tool descriptions and defaults as one
// versioned, serialisable object. The action fetches a bundle from the Triagepad
// brain at runtime (GET /v1/methodology) and passes it into the pipeline; the
// prompt CONTENT itself is served by the brain and is not part of this package.
// Assembly logic (which fragment goes where) stays CODE in triage.ts/localise.ts.
/** Minimal {{key}} interpolation; unknown keys render as empty strings. */
export function render(template, vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}
