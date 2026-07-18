import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { recordAccountConnected } from "@/lib/store";
import { logger } from "@/lib/logger";
import { WebhookEventSchema } from "@/lib/validation";

/**
 * Server-to-server webhook from Post for Me. Configure this URL
 * (https://yourdomain.com/api/webhooks/postforme) in the Post for Me
 * dashboard and subscribe to `social.account.created` at minimum.
 *
 * This route is intentionally excluded from Clerk auth in middleware.ts —
 * Post for Me calls it directly, there's no logged-in browser session.
 * Instead we verify the payload signature. Check the exact header name /
 * scheme Post for Me shows you in Project Settings > Webhooks and adjust
 * `verifySignature` below to match — this is a standard HMAC-SHA256
 * implementation as a safe default.
 */
function verifySignature(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.POSTFORME_WEBHOOK_SECRET;
  // Fail closed: a server-to-server webhook must be configured with a
  // signing secret. Without it we refuse to process the request rather
  // than blindly trusting the payload.
  if (!secret) {
    logger.error("POSTFORME_WEBHOOK_SECRET is not configured");
    return false;
  }
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signatureHeader)
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-postforme-signature");

  if (!verifySignature(rawBody, signature)) {
    logger.warn("Invalid or missing webhook signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    logger.warn("Webhook payload was not valid JSON");
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const event = WebhookEventSchema.safeParse(parsed);
  if (!event.success) {
    // Unknown/unsupported event type — acknowledge so Post for Me doesn't
    // retry, but don't process it.
    logger.info("Ignoring unsupported webhook event", {
      type: (parsed as { type?: string })?.type,
    });
    return NextResponse.json({ received: true });
  }

  if (event.data.type === "social.account.created") {
    const { id, platform, external_id } = event.data.data;
    await recordAccountConnected({
      userId: external_id,
      accountId: id,
      platform,
    });
    logger.info("Account connected via webhook", {
      userId: external_id,
      accountId: id,
      platform,
    });
  }

  return NextResponse.json({ received: true });
}

