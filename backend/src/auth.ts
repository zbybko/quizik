/**
 * Clerk JWT verification for Cloudflare Workers.
 * Uses the Web Crypto API to verify RS256 JWTs against Clerk's JWKS.
 */

interface JwtPayload {
  sub: string;          // user ID
  email?: string;
  exp: number;
  iat: number;
}

interface JwksKey {
  kid: string;
  n: string;
  e: string;
  kty: string;
  use: string;
  alg: string;
}

// Cache JWKS in memory for the Worker lifetime (resets on cold start)
let cachedJwks: JwksKey[] | null = null;
let jwksCachedAt = 0;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getJwks(clerkDomain: string): Promise<JwksKey[]> {
  if (cachedJwks && Date.now() - jwksCachedAt < JWKS_TTL_MS) {
    return cachedJwks;
  }
  const resp = await fetch(`https://${clerkDomain}/.well-known/jwks.json`);
  const data = await resp.json() as { keys: JwksKey[] };
  cachedJwks = data.keys;
  jwksCachedAt = Date.now();
  return cachedJwks;
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str + "=".repeat((4 - str.length % 4) % 4);
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function verifyClerkJwt(
  token: string,
  clerkDomain: string
): Promise<JwtPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const header = JSON.parse(atob(headerB64.replace(/-/g, "+").replace(/_/g, "/")));
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))) as JwtPayload;

    // Check expiry
    if (payload.exp < Date.now() / 1000) return null;

    const keys = await getJwks(clerkDomain);
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: jwk.alg, use: jwk.use },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sig = base64UrlDecode(sigB64);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data);

    return valid ? payload : null;
  } catch {
    return null;
  }
}

/** Extract and verify Bearer JWT from request. Returns null if missing/invalid. */
export async function extractUser(
  request: Request,
  clerkDomain: string | undefined
): Promise<{ userId: string; email: string } | null> {
  if (!clerkDomain) return null;

  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;

  const token = auth.slice(7).trim();
  const payload = await verifyClerkJwt(token, clerkDomain);
  if (!payload) return null;

  return {
    userId: payload.sub,
    email: payload.email ?? "",
  };
}
