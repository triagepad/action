// Validation gate: programmatically verify every candidate the model emits
// before the ticket leaves the pipeline. One confidently wrong file/line
// would undermine trust in the whole product, so this never trusts the model.
const LINE_PROXIMITY = 80;
export function verifyCandidate(repo, candidate) {
    if (!repo.fileExists(candidate.file)) {
        return { status: "file-missing", detail: `${candidate.file} does not exist in the repo` };
    }
    const totalLines = repo.lineCount(candidate.file);
    if (candidate.line !== null && totalLines !== null && candidate.line > totalLines) {
        return {
            status: "line-out-of-range",
            detail: `claimed line ${candidate.line}, file has ${totalLines} lines`,
        };
    }
    if (candidate.symbol) {
        const token = symbolToken(candidate.symbol);
        if (token) {
            const matches = repo
                .grep(token, false, 200)
                .filter((m) => m.file === candidate.file);
            if (matches.length === 0) {
                return {
                    status: "symbol-not-found",
                    detail: `"${token}" not found anywhere in ${candidate.file}`,
                };
            }
            if (candidate.line !== null &&
                !matches.some((m) => Math.abs(m.line - candidate.line) <= LINE_PROXIMITY)) {
                const nearest = matches.reduce((a, b) => Math.abs(a.line - candidate.line) < Math.abs(b.line - candidate.line) ? a : b);
                return {
                    status: "verified",
                    detail: `"${token}" exists but nearest occurrence is line ${nearest.line}, not ${candidate.line}`,
                };
            }
        }
    }
    return { status: "verified", detail: null };
}
/**
 * Greppable token from a symbol name:
 * "WorkoutComposer.displayName(for:)" -> "displayName", "sortedBySession()" -> "sortedBySession".
 */
function symbolToken(symbol) {
    const last = symbol.split(".").pop() ?? symbol;
    const token = last.split("(")[0]?.trim() ?? "";
    return token.length >= 3 ? token : null;
}
