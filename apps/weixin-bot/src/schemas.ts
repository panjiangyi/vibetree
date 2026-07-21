/*
 * schemas.ts — zod request validation.
 */
import { z } from "zod"

export const SendBody = z.object({
  to: z.string().min(1).optional(),
  text: z.string().min(1),
})

export const WebhookBody = z.object({
  url: z.string().url(),
  secret: z.string().optional(),
})

export const LabelBody = z.object({
  label: z.string().trim().min(1).max(60),
})

export const MessagesQuery = z.object({
  user: z.string().min(1).optional(),
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
})

export type SendBodyT = z.infer<typeof SendBody>
export type WebhookBodyT = z.infer<typeof WebhookBody>
export type MessagesQueryT = z.infer<typeof MessagesQuery>
