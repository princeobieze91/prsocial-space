import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { listSocialAccounts } from "@/lib/postforme";
import { logger } from "@/lib/logger";
import { createRateLimiter, withRateLimit } from "@/lib/ratelimit";

const limiter = createRateLimiter(60, 60_000);

// GET /api/social/accounts — accounts belonging to the current Clerk user.
export async function GET(req: NextRequest) {
  return withRateLimit(req, async () => {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const { data } = await listSocialAccounts(userId);
      return NextResponse.json({ accounts: data });
    } catch (err) {
      logger.error("Failed to load accounts", { error: err, userId });
      return NextResponse.json(
        { error: "Failed to load accounts" },
        { status: 502 }
      );
    }
  }, limiter);
}
