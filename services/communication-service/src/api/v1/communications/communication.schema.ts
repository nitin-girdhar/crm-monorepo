import { z } from 'zod';

const phoneSchema = z.string().min(8).regex(/^\+?[0-9\s\-()]+$/);

// ── Email ───────────────────────────────────────────────────────────────────

export const sendEmailSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(500),
  body: z.string().min(1, 'Body is required').max(50_000),
  html: z.string().max(100_000).optional(),
  email_addresses: z.array(z.string().email()).min(1).max(50),
  cc: z.array(z.string().email()).max(20).optional(),
  bcc: z.array(z.string().email()).max(20).optional(),
});

export type SendEmailInput = z.infer<typeof sendEmailSchema>;

// ── WhatsApp Text ───────────────────────────────────────────────────────────

export const sendWhatsAppTextSchema = z.object({
  phone_numbers: z.array(phoneSchema).min(1).max(50),
  message: z.string().min(1).max(4096),
});

export type SendWhatsAppTextInput = z.infer<typeof sendWhatsAppTextSchema>;

// ── WhatsApp Template ───────────────────────────────────────────────────────

export const sendWhatsAppTemplateSchema = z.object({
  phone_numbers: z.array(phoneSchema).min(1).max(50),
  template_name: z.string().min(1),
  language_code: z.string().default('en'),
  header_values: z.array(z.string()).optional(),
  body_values: z.array(z.string()).optional(),
  button_values: z.record(z.array(z.string())).optional(),
  media_url: z.string().url().optional(),
});

export type SendWhatsAppTemplateInput = z.infer<typeof sendWhatsAppTemplateSchema>;

// ── Multi-Channel Send ──────────────────────────────────────────────────────

export const sendCommunicationSchema = z.object({
  // Email fields (optional)
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).max(50_000).optional(),
  html: z.string().max(100_000).optional(),
  email_addresses: z.array(z.string().email()).max(50).optional(),
  cc: z.array(z.string().email()).max(20).optional(),
  bcc: z.array(z.string().email()).max(20).optional(),

  // WhatsApp fields (optional)
  phone_numbers: z.array(phoneSchema).max(50).optional(),
  message: z.string().max(4096).optional(),
  template_name: z.string().optional(),
  language_code: z.string().default('en'),
  header_values: z.array(z.string()).optional(),
  body_values: z.array(z.string()).optional(),
  button_values: z.record(z.array(z.string())).optional(),
  media_url: z.string().url().optional(),
}).refine(
  (d) => (d.email_addresses?.length ?? 0) > 0 || (d.phone_numbers?.length ?? 0) > 0,
  { message: 'At least one of email_addresses or phone_numbers is required' },
).refine(
  (d) => {
    if ((d.email_addresses?.length ?? 0) > 0) return Boolean(d.subject && d.body);
    return true;
  },
  { message: 'subject and body are required when sending email' },
).refine(
  (d) => {
    if ((d.phone_numbers?.length ?? 0) > 0) return Boolean(d.message || d.template_name);
    return true;
  },
  { message: 'message or template_name is required when sending WhatsApp' },
);

export type SendCommunicationInput = z.infer<typeof sendCommunicationSchema>;
