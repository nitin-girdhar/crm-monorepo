import { config } from '../../config/index.js';

// ── Interakt API types ──────────────────────────────────────────────────────

export interface SendTemplateInput {
  phoneNumber: string;
  countryCode: string;
  callbackData?: string;
  template: {
    name: string;
    languageCode: string;
    headerValues?: string[];
    bodyValues?: string[];
    buttonValues?: Record<string, string[]>;
  };
}

export interface SendTextInput {
  phoneNumber: string;
  countryCode: string;
  callbackData?: string;
  message: string;
}

export interface SendMediaInput {
  phoneNumber: string;
  countryCode: string;
  callbackData?: string;
  type: 'Image' | 'Document' | 'Video';
  mediaUrl: string;
  caption?: string;
  filename?: string;
}

export interface InteraktApiResponse {
  result: boolean;
  message: string;
  data?: Record<string, unknown>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function cleanPhoneNumber(phone: string): { countryCode: string; phoneNumber: string } {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) {
    const countryCode = cleaned.substring(0, cleaned.length - 10);
    const phoneNumber = cleaned.substring(cleaned.length - 10);
    return { countryCode: countryCode.replace('+', ''), phoneNumber };
  }
  if (cleaned.length === 10) {
    return { countryCode: '91', phoneNumber: cleaned };
  }
  return { countryCode: '', phoneNumber: cleaned };
}

async function interaktRequest(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<InteraktApiResponse> {
  const url = `${config.interakt.baseUrl}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${config.interakt.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json() as InteraktApiResponse;

  if (!response.ok) {
    throw new Error(
      `Interakt API error (${response.status}): ${data.message ?? 'Unknown error'}`,
    );
  }

  return data;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function sendTemplateMessage(input: SendTemplateInput): Promise<InteraktApiResponse> {
  const body: Record<string, unknown> = {
    fullPhoneNumber: `${input.countryCode}${input.phoneNumber}`,
    callbackData: input.callbackData ?? '',
    type: 'Template',
    template: {
      name: input.template.name,
      languageCode: input.template.languageCode,
      ...(input.template.headerValues?.length
        ? { headerValues: input.template.headerValues }
        : {}),
      ...(input.template.bodyValues?.length
        ? { bodyValues: input.template.bodyValues }
        : {}),
      ...(input.template.buttonValues
        ? { buttonValues: input.template.buttonValues }
        : {}),
    },
  };

  return interaktRequest('message/', body);
}

export async function sendTextMessage(input: SendTextInput): Promise<InteraktApiResponse> {
  const body: Record<string, unknown> = {
    fullPhoneNumber: `${input.countryCode}${input.phoneNumber}`,
    callbackData: input.callbackData ?? '',
    type: 'Text',
    data: {
      message: input.message,
    },
  };

  return interaktRequest('message/', body);
}

export async function sendMediaMessage(input: SendMediaInput): Promise<InteraktApiResponse> {
  const mediaData: Record<string, unknown> = {
    mediaUrl: input.mediaUrl,
  };
  if (input.caption) mediaData['caption'] = input.caption;
  if (input.filename) mediaData['filename'] = input.filename;

  const body: Record<string, unknown> = {
    fullPhoneNumber: `${input.countryCode}${input.phoneNumber}`,
    callbackData: input.callbackData ?? '',
    type: input.type,
    data: mediaData,
  };

  return interaktRequest('message/', body);
}

export { cleanPhoneNumber };
