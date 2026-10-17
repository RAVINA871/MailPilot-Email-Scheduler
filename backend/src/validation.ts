import { z } from "zod";
export const campaignSchema = z.object({
  name: z.string().trim().min(1, "Campaign name is required").max(120),
  subject: z.string().trim().min(1, "Subject is required").max(250),
  body: z.string().trim().min(1, "Email body is required").max(100000),
  startAt: z.coerce.date({ invalid_type_error: "Start time is invalid", required_error: "Start time is required" }),
  delaySeconds: z.coerce.number({ invalid_type_error: "Delay must be a number" }).int("Delay must be a whole number").min(0).max(86400),
  hourlyLimit: z.coerce.number({ invalid_type_error: "Hourly limit must be a number" }).int("Hourly limit must be a whole number").min(1, "Hourly limit must be at least 1").max(100000),
});
export type CampaignInput = z.infer<typeof campaignSchema>;
