export interface WriteAccessConfig {
  remoteWritesEnabled: boolean;
  apiToken?: string;
}

export type WriteAccessDecision =
  | { allowed: true }
  | { allowed: false; status: 401 | 403 | 503; error: string };

export interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export type RateLimitDecision =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; retryAfterSeconds: number; resetAt: number };

const rateLimitGlobal = globalThis as typeof globalThis & {
  __drivelensRateLimits?: Map<string, RateLimitBucket>;
};
const rateLimitBuckets = rateLimitGlobal.__drivelensRateLimits ??= new Map<string, RateLimitBucket>();

function isLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost"
    || normalized === "::1"
    || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function suppliedToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization")?.trim();
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim() || undefined;
  }
  return request.headers.get("x-drivelens-token")?.trim() || undefined;
}

function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function evaluateWriteAccess(
  request: Request,
  config: WriteAccessConfig,
): WriteAccessDecision {
  const hostname = new URL(request.url).hostname;
  if (isLoopback(hostname)) return { allowed: true };
  if (!config.remoteWritesEnabled) {
    return { allowed: false, status: 403, error: "remote_writes_disabled" };
  }

  const expectedToken = config.apiToken?.trim();
  if (!expectedToken) {
    return { allowed: false, status: 503, error: "remote_write_token_not_configured" };
  }
  const actualToken = suppliedToken(request);
  if (!actualToken || !constantTimeEqual(actualToken, expectedToken)) {
    return { allowed: false, status: 401, error: "write_auth_required" };
  }
  return { allowed: true };
}

export function guardWriteRequest(request: Request): Response | null {
  const decision = evaluateWriteAccess(request, {
    remoteWritesEnabled: process.env.DRIVELENS_REMOTE_WRITES_ENABLED === "true",
    apiToken: process.env.DRIVELENS_API_TOKEN,
  });
  if (decision.allowed) return null;
  return Response.json(
    { error: decision.error },
    { status: decision.status, headers: { "Cache-Control": "no-store" } },
  );
}

export function evaluateRateLimit(
  buckets: Map<string, RateLimitBucket>,
  key: string,
  now: number,
  limit: number,
  windowMs: number,
): RateLimitDecision {
  const existing = buckets.get(key);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : existing;
  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      resetAt: bucket.resetAt,
    };
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  return { allowed: true, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

function requestIdentity(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return (forwarded || realIp || new URL(request.url).hostname).slice(0, 80);
}

export function guardRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs = 60_000,
): Response | null {
  const now = Date.now();
  if (rateLimitBuckets.size > 512) {
    for (const [key, bucket] of rateLimitBuckets) {
      if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
    }
  }
  const decision = evaluateRateLimit(
    rateLimitBuckets,
    `${scope}:${requestIdentity(request)}`,
    now,
    limit,
    windowMs,
  );
  if (decision.allowed) return null;
  return Response.json(
    { error: "rate_limit_exceeded", retryAfterSeconds: decision.retryAfterSeconds },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(decision.retryAfterSeconds),
      },
    },
  );
}
