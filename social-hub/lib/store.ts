import "server-only";
import { getSupabaseAdmin } from "./supabase";
import { logger } from "./logger";

export interface PostRecord {
  id: string;
  user_id: string;
  caption: string;
  social_account_ids: string[];
  media_urls?: string[] | null;
  scheduled_at?: string | null;
  status: string;
  created_at: string;
}

export interface ConnectedAccountEvent {
  user_id: string;
  account_id: string;
  platform: string;
  received_at: string;
}

export async function recordPost(record: {
  id: string;
  user_id: string;
  caption: string;
  social_account_ids: string[];
  media_urls?: string[];
  scheduled_at?: string;
  status: string;
}) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("posts")
    .insert({
      id: record.id,
      user_id: record.user_id,
      caption: record.caption,
      social_account_ids: record.social_account_ids,
      media_urls: record.media_urls ?? null,
      scheduled_at: record.scheduled_at ?? null,
      status: record.status,
    })
    .select()
    .single();

  if (error) {
    logger.error("Failed to record post", { error, record });
    throw new Error(`Failed to record post: ${error.message}`);
  }

  logger.info("Post recorded", { postId: data.id, userId: data.user_id });
  return data as PostRecord;
}

export async function listPostsForUser(userId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("posts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Failed to list posts", { error, userId });
    throw new Error(`Failed to list posts: ${error.message}`);
  }

  return (data ?? []) as PostRecord[];
}

export async function recordAccountConnected(entry: {
  userId: string;
  accountId: string;
  platform: string;
}) {
  const supabaseAdmin = getSupabaseAdmin();
  // Upsert on (user_id, account_id) so duplicate webhook deliveries don't
  // create repeat rows.
  const { data, error } = await supabaseAdmin
    .from("connected_account_events")
    .upsert(
      {
        user_id: entry.userId,
        account_id: entry.accountId,
        platform: entry.platform,
      },
      { onConflict: "user_id,account_id" }
    )
    .select()
    .single();

  if (error) {
    logger.error("Failed to record account connected", { error, entry });
    throw new Error(`Failed to record account: ${error.message}`);
  }

  logger.info("Account connected recorded", {
    userId: entry.userId,
    accountId: entry.accountId,
    platform: entry.platform,
  });
  return data as ConnectedAccountEvent;
}
