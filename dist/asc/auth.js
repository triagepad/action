// App Store Connect API auth: JWT signed ES256 with the .p8 private key.
// Header: { alg: ES256, kid, typ: JWT }
// Payload: { iss: issuerId, iat, exp (short), aud: "appstoreconnect-v1" }
// Uses node:crypto only. The key never leaves this module and is never logged.
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
const TOKEN_TTL_SECONDS = 10 * 60; // Apple allows max 20 min; keep it short.
function b64url(input) {
    return Buffer.from(input).toString("base64url");
}
export function makeAscToken(asc) {
    // Per-account creds arrive as an in-memory PEM (from Vault); the CLI/dev path
    // reads the .p8 from disk. The key is never logged.
    const pem = asc.privateKeyPem || readFileSync(asc.privateKeyPath, "utf8");
    const key = createPrivateKey(pem);
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "ES256", kid: asc.keyId, typ: "JWT" };
    const payload = {
        iss: asc.issuerId,
        iat: now,
        exp: now + TOKEN_TTL_SECONDS,
        aud: "appstoreconnect-v1",
    };
    const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    // JWT ES256 requires the raw r||s signature (ieee-p1363), not DER.
    const signature = sign("sha256", Buffer.from(signingInput), {
        key,
        dsaEncoding: "ieee-p1363",
    });
    return `${signingInput}.${signature.toString("base64url")}`;
}
