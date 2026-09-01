/**
 * Builds the system instructions handed to the realtime model for a call,
 * composed from the agent definition. Keeping this separate makes the prompt
 * behavior easy to tune and test.
 */
import type { Agent } from '../core/types.ts';
import { languageName } from '../i18n/languages.ts';

export function buildInstructions(agent: Agent): string {
  const def = agent.definition;
  const langs = def.languages.map(languageName).join(', ');
  const services = def.booking.services.join(', ') || 'general services';
  const questions = def.qualifyingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n');

  return [
    def.persona,
    '',
    'CONVERSATION RULES:',
    `- Detect the language the caller speaks and respond in that language. Supported: ${langs}. If they switch languages mid-call, switch with them.`,
    '- Keep responses short and natural for a phone call. One question at a time.',
    '- Never invent facts about the business. Use the lookup_faq tool for factual questions; if it returns no answer, say you are not certain and offer to take a message or transfer.',
    '- As soon as you learn the caller name, phone, email, intent, or requested service, call capture_lead to save it.',
    def.booking.enabled
      ? `- To schedule, call get_availability, offer a couple of options, then call book_appointment after the caller confirms. Services: ${services}. To move an existing booking, call reschedule_appointment; to drop it, call cancel_appointment.`
      : '- Appointment booking is disabled for this agent; take a message instead.',
    '- If the caller is upset, has an emergency, or asks for a person, call request_human.',
    '',
    questions ? `QUALIFYING QUESTIONS to work in naturally:\n${questions}` : '',
    '',
    `Begin by greeting the caller: "${def.greeting}"`,
  ]
    .filter(Boolean)
    .join('\n');
}
