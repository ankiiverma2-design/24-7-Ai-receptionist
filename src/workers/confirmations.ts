/**
 * Confirmation worker.
 *
 * Sends SMS/email when appointments are booked, rescheduled, or cancelled.
 * Never blocks the call path — subscribed to the event bus.
 */
import { eventBus } from '../core/events.ts';
import { store } from '../core/store.ts';
import { logger } from '../core/logger.ts';
import { sendEmail, sendSms } from '../providers/messaging/index.ts';
import { nowIso } from '../core/ids.ts';
import type { Appointment, PlatformEvent } from '../core/types.ts';

function formatWhen(apt: Appointment): string {
  try {
    return new Date(apt.startsAt).toLocaleString('en-US', { timeZone: apt.timezone });
  } catch {
    return apt.startsAt;
  }
}

function copy(apt: Appointment, kind: 'booked' | 'rescheduled' | 'cancelled'): { subject: string; body: string } {
  const when = formatWhen(apt);
  if (kind === 'cancelled') {
    return {
      subject: `Appointment cancelled: ${apt.service}`,
      body: `Your ${apt.service} appointment on ${when} has been cancelled. Reply if you need a new time.`,
    };
  }
  if (kind === 'rescheduled') {
    return {
      subject: `Appointment rescheduled: ${apt.service}`,
      body: `Your ${apt.service} appointment was moved to ${when} (${apt.timezone}).`,
    };
  }
  return {
    subject: `Appointment confirmed: ${apt.service}`,
    body: `You're booked for ${apt.service} on ${when} (${apt.timezone}).`,
  };
}

async function notify(apt: Appointment, kind: 'booked' | 'rescheduled' | 'cancelled'): Promise<void> {
  const { subject, body } = copy(apt, kind);
  if (apt.attendeePhone) await sendSms(apt.attendeePhone, body);
  if (apt.attendeeEmail) await sendEmail(apt.attendeeEmail, subject, body);
  store.appointments.update(apt.id, { confirmationSentAt: nowIso() });
}

export function startConfirmationWorker(): void {
  const handler = (kind: 'booked' | 'rescheduled' | 'cancelled') => (event: PlatformEvent) => {
    const apt = event.payload as Appointment;
    void notify(apt, kind).catch((e) =>
      logger.warn('Appointment confirmation failed', { appointmentId: apt.id, error: (e as Error).message }),
    );
  };
  eventBus.on('appointment.booked', handler('booked'));
  eventBus.on('appointment.rescheduled', handler('rescheduled'));
  eventBus.on('appointment.cancelled', handler('cancelled'));
  logger.info('Confirmation worker started');
}
