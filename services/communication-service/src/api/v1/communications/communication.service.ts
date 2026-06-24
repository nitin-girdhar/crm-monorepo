import { config } from '../../../config/index.js';
import { BadRequestError } from '../../../lib/errors.js';
import * as emailProvider from '../../../lib/providers/email.provider.js';
import * as whatsappProvider from '../../../lib/providers/whatsapp.provider.js';
import type {
  SendEmailInput,
  SendWhatsAppTextInput,
  SendWhatsAppTemplateInput,
  SendCommunicationInput,
} from './communication.schema.js';

// ── Types ───────────────────────────────────────────────────────────────────

interface ChannelResult {
  channel: 'email' | 'whatsapp';
  success: boolean;
  data?: unknown;
  error?: string;
}

interface AuthContext {
  org_id: string;
  user_id: string;
  role: string;
  tenant_id: string;
}

// ── Status ──────────────────────────────────────────────────────────────────

export function getStatus() {
  return {
    email: { configured: config.isEmailConfigured },
    whatsapp: { configured: config.isWhatsAppConfigured },
  };
}

// ── Email ───────────────────────────────────────────────────────────────────

export async function sendEmail(_ctx: AuthContext, input: SendEmailInput) {
  if (!config.isEmailConfigured) {
    throw new BadRequestError('Email service is not configured');
  }

  const emailInput: emailProvider.SendEmailInput = {
    to: input.email_addresses,
    subject: input.subject,
    body: input.body,
  };
  if (input.html) emailInput.html = input.html;
  if (input.cc) emailInput.cc = input.cc;
  if (input.bcc) emailInput.bcc = input.bcc;

  const result = await emailProvider.sendEmail(emailInput);

  return {
    results: [{ channel: 'email' as const, success: true, data: result }],
  };
}

// ── WhatsApp Text ───────────────────────────────────────────────────────────

export async function sendWhatsAppText(_ctx: AuthContext, input: SendWhatsAppTextInput) {
  if (!config.isWhatsAppConfigured) {
    throw new BadRequestError('WhatsApp service is not configured');
  }

  const results = [];
  for (const phone of input.phone_numbers) {
    const { countryCode, phoneNumber } = whatsappProvider.cleanPhoneNumber(phone);
    try {
      const response = await whatsappProvider.sendTextMessage({
        phoneNumber,
        countryCode,
        message: input.message,
      });
      results.push({ phoneNumber: phone, success: true, data: response });
    } catch (err) {
      results.push({
        phoneNumber: phone,
        success: false,
        error: (err as Error).message,
      });
    }
  }

  return {
    results: [{ channel: 'whatsapp' as const, success: true, data: { messages: results } }],
  };
}

// ── WhatsApp Template ───────────────────────────────────────────────────────

function buildTemplateObj(input: { template_name: string; language_code: string; header_values?: string[] | undefined; body_values?: string[] | undefined; button_values?: Record<string, string[]> | undefined }) {
  const t: whatsappProvider.SendTemplateInput['template'] = {
    name: input.template_name,
    languageCode: input.language_code,
  };
  if (input.header_values) t.headerValues = input.header_values;
  if (input.body_values) t.bodyValues = input.body_values;
  if (input.button_values) t.buttonValues = input.button_values;
  return t;
}

export async function sendWhatsAppTemplate(_ctx: AuthContext, input: SendWhatsAppTemplateInput) {
  if (!config.isWhatsAppConfigured) {
    throw new BadRequestError('WhatsApp service is not configured');
  }

  const results = [];
  for (const phone of input.phone_numbers) {
    const { countryCode, phoneNumber } = whatsappProvider.cleanPhoneNumber(phone);
    try {
      const response = await whatsappProvider.sendTemplateMessage({
        phoneNumber,
        countryCode,
        template: buildTemplateObj(input),
      });
      results.push({ phoneNumber: phone, success: true, data: response });
    } catch (err) {
      results.push({
        phoneNumber: phone,
        success: false,
        error: (err as Error).message,
      });
    }
  }

  return {
    results: [{ channel: 'whatsapp' as const, success: true, data: { messages: results } }],
  };
}

// ── Multi-Channel Send ──────────────────────────────────────────────────────

export async function send(_ctx: AuthContext, input: SendCommunicationInput) {
  const results: ChannelResult[] = [];

  // Email channel
  if (input.email_addresses?.length) {
    if (!config.isEmailConfigured) {
      results.push({ channel: 'email', success: false, error: 'Email service is not configured' });
    } else {
      try {
        const emailInput: emailProvider.SendEmailInput = {
          to: input.email_addresses,
          subject: input.subject!,
          body: input.body!,
        };
        if (input.html) emailInput.html = input.html;
        if (input.cc) emailInput.cc = input.cc;
        if (input.bcc) emailInput.bcc = input.bcc;

        const emailResult = await emailProvider.sendEmail(emailInput);
        results.push({ channel: 'email', success: true, data: emailResult });
      } catch (err) {
        results.push({ channel: 'email', success: false, error: (err as Error).message });
      }
    }
  }

  // WhatsApp channel
  if (input.phone_numbers?.length) {
    if (!config.isWhatsAppConfigured) {
      results.push({ channel: 'whatsapp', success: false, error: 'WhatsApp service is not configured' });
    } else {
      try {
        const messageResults = [];
        for (const phone of input.phone_numbers) {
          const { countryCode, phoneNumber } = whatsappProvider.cleanPhoneNumber(phone);
          try {
            let response: whatsappProvider.InteraktApiResponse;

            if (input.template_name) {
              response = await whatsappProvider.sendTemplateMessage({
                phoneNumber,
                countryCode,
                template: buildTemplateObj({
                  template_name: input.template_name,
                  language_code: input.language_code,
                  header_values: input.header_values,
                  body_values: input.body_values,
                  button_values: input.button_values,
                }),
              });
            } else {
              response = await whatsappProvider.sendTextMessage({
                phoneNumber,
                countryCode,
                message: input.message!,
              });
            }

            messageResults.push({ phoneNumber: phone, success: true, data: response });
          } catch (err) {
            messageResults.push({
              phoneNumber: phone,
              success: false,
              error: (err as Error).message,
            });
          }
        }
        results.push({ channel: 'whatsapp', success: true, data: { messages: messageResults } });
      } catch (err) {
        results.push({ channel: 'whatsapp', success: false, error: (err as Error).message });
      }
    }
  }

  const allFailed = results.every((r) => !r.success);
  if (allFailed) {
    throw new BadRequestError('All communication channels failed', results);
  }

  return { results };
}
