import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { disconnectSocialAccount, listSocialAccounts } from "@/lib/postforme";
import { logger } from "@/lib/logger";
import { DisconnectAccountSchema } from "@/lib/validation";
import { createRateLimiter, withRateLimit } from "@/lib/ratelimit";

const limiter = createRateLimiter(20, 60_000);

// POST /api/social/disconnect { accountId }
// We never trust an accountId from the client blindly — we re-fetch the
// user's own accounts from Post for Me (scoped by external_id) and only
// disconnect if it actually belongs to them.
export async function POST(req: NextRequest) {
  return withRateLimit(req, async () => {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const body = await req.json();
      const validation = DisconnectAccountSchema.safeParse(body);

      if (!validation.success) {
        logger.warn("Validation failed", { errors: validation.error.flatten() });
        return NextResponse.json(
          { error: "Validation failed", details: validation.error.flatten() },
          { status: 400 }
        );
      }

      const { accountId } = validation.data;

      const { data } = await listSocialAccounts(userId);
      const owns = data.some((a) => a.id === accountId);
      if (!owns) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const result = await disconnectSocialAccount(accountId);
      logger.info("Account disconnected", { userId, accountId });
      return NextResponse.json(result);
    } catch (err) {
      logger.error("Failed to disconnect account", { error: err, userId });
      return NextResponse.json(
        { error: "Failed to disconnect account" },
        { status: 502 }
      );
    }
  }, limiter);
}
