import { z } from "zod";

export const levelLinkSchema = z.object({
  link: z.string().url("Please enter a valid URL").refine(
    (v) => v.includes("grabvr.quest"),
    "Link must be from grabvr.quest"
  ),
});

export type LevelLink = z.infer<typeof levelLinkSchema>;

export const levelInfoSchema = z.object({
  id: z.string(),
  ts: z.string(),
  title: z.string(),
  creators: z.array(z.string()),
  dataKey: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  description: z.string().optional(),
  complexity: z.number().optional(),
  maxCheckpoint: z.number().optional(),
  verified: z.boolean().optional(),
  averageRating: z.number().optional(),
  ratingCount: z.number().optional(),
});

export type LevelInfo = z.infer<typeof levelInfoSchema>;
