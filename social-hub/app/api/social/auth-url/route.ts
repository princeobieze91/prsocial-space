import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAuthUrl } from "@/lib/postforme";
import { logger } from "@/lib/logger";
import { AuthUrlSchema } from "@/lib/validation";
import { createRateLimiter, withRateLimit } from "@/lib/ratelimit";

const limiter = createRateLimiter(20, 60_000);

// [ Call Post for Me Auth URL Endpoint ]
// The frontend hits this route after the user clicks "Connect X account".
// We stamp the request with external_id = Clerk userId so the account we
// get back is scoped to this user (see lib/postforme.ts + Post for Me's
// "Multi-User Applications" guide).
export async function POST(req: NextRequest) {
  return withRateLimit(req, async () => {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const body = await req.json();
      const validation = AuthUrlSchema.safeParse(body);

      if (!validation.success) {
        logger.warn("Validation failed", { errors: validation.error.flatten() });
        return NextResponse.json(
          { error: "Validation failed", details: validation.error.flatten() },
          { status: 400 }
        );
      }

      const { platform } = validation.data;
      const appUrl = process.env.APP_URL ?? req.nextUrl.origin;

      // LinkedIn on Quickstart requires connection_type "organization",
      // Instagram requires an explicit connection_type too — see Post for
      // Me's Account Connections troubleshooting guide.
      const platformData: Record<string, unknown> | undefined =
        platform === "linkedin"
          ? { linkedin: { connection_type: "organization" } }
          : platform === "instagram"
          ? { instagram: { connection_type: "instagram" } }
          : undefined;

      const { url } = await createAuthUrl({
        platform,
        externalId: userId,
        redirectUrlOverride: `${appUrl}/api/social/callback`,
        platformData,
        permissions: ["posts", "feeds"],
      });

      logger.info("Auth URL created", { userId, platform });
      return NextResponse.json({ url });
    } catch (err) {
      logger.error("Failed to create auth URL", { error: err, userId });
      return NextResponse.json(
        { error: "Failed to create auth URL" },
        { status: 502 }
      );
    }
  }, limiter);
}
