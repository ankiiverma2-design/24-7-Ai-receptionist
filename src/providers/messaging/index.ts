/**
 * Messaging adapters: Twilio SMS + Resend email, with a log-only fallback so
 * confirmations never fail the booking path.
 */
import { env, hasTwilio, hasResend } from '../../config/env.ts';
import { logger } from '../../core/logger.ts';
import type { Message, MessagingProvider } from './types.ts';

export class LogMessagingProvider implements MessagingProvider {
  readonly name = 'log';
  async sendSms(msg: Message): Promise<void> {
    logger.info('SMS (log provider)', { to: msg.to, body: msg.body.slice(0, 120) });
  }
  async sendEmail(msg: Message): Promise<void> {
    logger.info('Email (log provider)', { to: msg.to, subject: msg.subject });
  }
}

export class TwilioSmsProvider implements MessagingProvider {
  readonly name = 'twilio_sms';
  async sendSms(msg: Message): Promise<void> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages.json`;
    const auth = Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: msg.to,
        From: env.twilioCallerId,
        Body: msg.body,
      }).toString(),
    });
    if (!res.ok) throw new Error(`Twilio SMS ${res.status}: ${await res.text()}`);
  }
}

export class ResendEmailProvider implements MessagingProvider {
  readonly name = 'resend';
  async sendEmail(msg: Message): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.emailFrom,
        to: [msg.to],
        subject: msg.subject ?? 'VoxDesk',
        text: msg.body,
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

const logProvider = new LogMessagingProvider();
const smsProvider = new TwilioSmsProvider();
const emailProvider = new ResendEmailProvider();

export async function sendSms(to: string, body: string): Promise<void> {
  try {
    if (hasTwilio() && env.twilioCallerId) await smsProvider.sendSms({ to, body });
    else await logProvider.sendSms({ to, body });
  } catch (e) {
    logger.warn('SMS send failed; falling back to log', { error: (e as Error).message });
    await logProvider.sendSms({ to, body });
  }
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  try {
    if (hasResend()) await emailProvider.sendEmail({ to, subject, body });
    else await logProvider.sendEmail({ to, subject, body });
  } catch (e) {
    logger.warn('Email send failed; falling back to log', { error: (e as Error).message });
    await logProvider.sendEmail({ to, subject, body });
  }
}

export { logProvider };
export type { MessagingProvider, Message } from './types.ts';
