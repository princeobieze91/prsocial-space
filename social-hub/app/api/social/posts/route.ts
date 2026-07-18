import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSocialPost, listSocialAccounts } from "@/lib/postforme";
import { recordPost, listPostsForUser } from "@/lib/store";
import { logger } from "@/lib/logger";
import { CreatePostSchema } from "@/lib/validation";
import { createRateLimiter, withRateLimit } from "@/lib/ratelimit";

const limiter = createRateLimiter(30, 60_000);

export async function GET(req: NextRequest) {
  return withRateLimit(req, async () => {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const posts = await listPostsForUser(userId);
      return NextResponse.json({ posts });
    } catch (err) {
      logger.error("Failed to list posts", { error: err, userId });
      return NextResponse.json(
        { error: "Failed to load posts" },
        { status: 502 }
      );
    }
  }, limiter);
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, async () => {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const body = await req.json();
      const validation = CreatePostSchema.safeParse(body);

      if (!validation.success) {
        logger.warn("Validation failed", { errors: validation.error.flatten() });
        return NextResponse.json(
          { error: "Validation failed", details: validation.error.flatten() },
          { status: 400 }
        );
      }

      const { caption, socialAccountIds, mediaUrls, scheduledAt } = validation.data;

      const { data: ownedAccounts } = await listSocialAccounts(userId);
      const ownedIds = new Set(ownedAccounts.map((a) => a.id));
      const unauthorized = socialAccountIds.filter((id) => !ownedIds.has(id));
      if (unauthorized.length) {
        logger.warn("Unauthorized account access", { userId, unauthorized });
        return NextResponse.json(
          { error: `Not your accounts: ${unauthorized.join(", ")}` },
          { status: 403 }
        );
      }

      const result = await createSocialPost({
        caption,
        socialAccountIds,
        mediaUrls,
        scheduledAt,
      });

      await recordPost({
        id: result.id,
        user_id: userId,
        caption,
        social_account_ids: socialAccountIds,
        media_urls: mediaUrls,
        scheduled_at: scheduledAt,
        status: result.status,
      });

      logger.info("Post created successfully", { postId: result.id, userId });
      return NextResponse.json(result);
    } catch (err) {
      logger.error("Failed to create post", { error: err, userId });
      return NextResponse.json({ error: "Failed to create post" }, { status: 502 });
    }
  }, limiter);
}
