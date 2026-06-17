// Minimal JWT payload decode (no verification — that's the server's job). Used only
// to read `exp` for proactive refresh scheduling (Gap #1, frontend-only handling).
interface JwtPayload {
  sub?: string;
  role?: string;
  customerId?: string | null;
  jti?: string;
  exp?: number; // seconds since epoch
  iat?: number;
}

// atob is provided by the RN/Hermes runtime and typed via the DOM lib in Expo's base
// tsconfig, so no local declaration is needed.
function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(''),
  );
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    return JSON.parse(base64UrlDecode(part)) as JwtPayload;
  } catch {
    return null;
  }
}

// Expiry in ms (or null if absent). 0/negative remaining ⇒ expired.
export function tokenExpiryMs(token: string): number | null {
  const payload = decodeJwt(token);
  return payload?.exp ? payload.exp * 1000 : null;
}

export function isTokenExpired(token: string, nowMs: number = Date.now()): boolean {
  const exp = tokenExpiryMs(token);
  return exp === null ? false : nowMs >= exp;
}
