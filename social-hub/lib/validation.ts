import { z } from "zod";

export const CreatePostSchema = z.object({
  caption: z.string().min(1, "Caption is required").max(5000, "Caption is too long"),
  socialAccountIds: z.array(z.string().min(1)).min(1, "At least one account is required"),
  mediaUrls: z.array(z.string().url("Invalid media URL")).optional(),
  scheduledAt: z.iso.datetime().optional(),
});

export const DisconnectAccountSchema = z.object({
  accountId: z.string().min(1, "accountId is required"),
});

export const AuthUrlSchema = z.object({
  platform: z.enum([
    "tiktok",
    "instagram",
    "facebook",
    "x",
    "linkedin",
    "youtube",
    "pinterest",
    "threads",
    "bluesky",
  ]),
});

export type CreatePostInput = z.infer<typeof CreatePostSchema>;
export type DisconnectAccountInput = z.infer<typeof DisconnectAccountSchema>;
export type AuthUrlInput = z.infer<typeof AuthUrlSchema>;

export const WebhookEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("social.account.created"),
    data: z.object({
      id: z.string().min(1),
      platform: z.enum([
        "tiktok",
        "instagram",
        "facebook",
        "x",
        "linkedin",
        "youtube",
        "pinterest",
        "threads",
        "bluesky",
      ]),
      external_id: z.string().min(1),
    }),
  }),
]);

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;
