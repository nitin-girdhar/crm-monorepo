import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../../config/index.js';

export interface SendEmailInput {
  to: string[];
  subject: string;
  body: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
}

export interface SendEmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }
  return transporter;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const transport = getTransporter();

  const htmlContent = input.html ?? input.body.replace(/\n/g, '<br>');

  const from = config.smtp.fromName
    ? `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`
    : config.smtp.fromEmail;

  const result = await transport.sendMail({
    from,
    to: input.to.join(', '),
    subject: input.subject,
    text: input.body,
    html: htmlContent,
    ...(input.cc?.length ? { cc: input.cc.join(', ') } : {}),
    ...(input.bcc?.length ? { bcc: input.bcc.join(', ') } : {}),
  });

  return {
    messageId: result.messageId,
    accepted: result.accepted as string[],
    rejected: result.rejected as string[],
  };
}
