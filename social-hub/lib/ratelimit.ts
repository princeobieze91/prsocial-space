import { NextRequest, NextResponse } from "next/server";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

// In-memory fallback — suitable for single-instance deployments.
// For multi-instance (serverless) deployments, configure UPSTASH_REDIS_REST_URL
// and UPSTASH_REDIS_REST_TOKEN in your environment.
const rateLimitMap = new Map<string, RateLimitEntry>();

// Clean up expired entries every 60 seconds to prevent memory leaks.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now >= entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 60_000);

type RateLimiter = {
  limit(identifier: string): Promise<{
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
  }>;
};

export function createRateLimiter(requests: number, windowMs: number): RateLimiter {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // Use Upstash Redis if configured (production recommendation)
  if (upstashUrl && upstashToken) {
    return createUpstashLimiter(requests, windowMs, upstashUrl, upstashToken);
  }

  // Fall back to in-memory limiter
  return createMemoryLimiter(requests, windowMs);
}

function createMemoryLimiter(requests: number, windowMs: number): RateLimiter {
  return {
    async limit(identifier: string) {
      const now = Date.now();
      const entry = rateLimitMap.get(identifier);

      if (entry && now < entry.resetAt) {
        if (entry.count >= requests) {
          return {
            success: false,
            limit: requests,
            remaining: 0,
            reset: entry.resetAt,
          };
        }
        entry.count += 1;
        return {
          success: true,
          limit: requests,
          remaining: requests - entry.count,
          reset: entry.resetAt,
        };
      }

      rateLimitMap.set(identifier, {
        count: 1,
        resetAt: now + windowMs,
      });

      return {
        success: true,
        limit: requests,
        remaining: requests - 1,
        reset: now + windowMs,
      };
    },
  };
}

function createUpstashLimiter(
  requests: number,
  windowMs: number,
  url: string,
  token: string
): RateLimiter {
  const windowSeconds = Math.ceil(windowMs / 1000);

  return {
    async limit(identifier: string) {
      try {
        const res = await fetch(`${url}/lua`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            script: `
              local key = KEYS[1]
              local limit = tonumber(ARGV[1])
              local window = tonumber(ARGV[2])
              local now = tonumber(ARGV[3])
              local current = redis.call("INCR", key)
              if current == 1 then
                redis.call("PEXPIRE", key, window)
              end
              local ttl = redis.call("PTTL", key)
              return {current, ttl}
            `,
            keys: [`ratelimit:${identifier}`],
            args: [requests.toString(), (windowMs).toString(), Date.now().toString()],
          }),
          signal: AbortSignal.timeout(2000),
        });

        if (!res.ok) {
          // Upstash was configured but is unreachable: fail closed so the
          // limiter can't be silently bypassed.
          console.error("Rate limiter Redis unavailable, denying request");
          return {
            success: false,
            limit: requests,
            remaining: 0,
            reset: Date.now() + windowMs,
          };
        }

        const data = await res.json();
        const current = data.result[0] as number;
        const ttl = data.result[1] as number;
        const remaining = Math.max(0, requests - current);

        return {
          success: current <= requests,
          limit: requests,
          remaining,
          reset: Date.now() + ttl,
        };
      } catch {
        // Upstash was configured but errored: fail closed.
        console.error("Rate limiter error, denying request");
        return {
          success: false,
          limit: requests,
          remaining: 0,
          reset: Date.now() + windowMs,
        };
      }
    },
  };
}

export async function withRateLimit(
  req: NextRequest,
  handler: () => Promise<NextResponse>,
  limiter: ReturnType<typeof createRateLimiter>
): Promise<NextResponse> {
  const ip =
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "anonymous";

  const { success, limit, remaining, reset } = await limiter.limit(ip);

  const response = success
    ? await handler()
    : NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );

  response.headers.set("X-RateLimit-Limit", limit.toString());
  response.headers.set("X-RateLimit-Remaining", remaining.toString());
  response.headers.set("X-RateLimit-Reset", Math.ceil(reset / 1000).toString());

  return response;
}
