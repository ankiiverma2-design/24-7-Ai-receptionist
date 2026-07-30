/**
 * Tool registry.
 *
 * Maps the platform skills to function-calling tool definitions the realtime
 * model can invoke, and dispatches tool calls to the skill implementations.
 * The orchestrator owns the call session and passes it in as context.
 */
import type { RealtimeTool } from '../providers/voice/types.ts';
import type { Agent, Call } from '../core/types.ts';
import { store } from '../core/store.ts';
import { nowIso } from '../core/ids.ts';
import { getAvailability, bookAppointment } from './booking.ts';
import { searchKnowledgeBase } from './knowledgeBase.ts';
import { captureLead } from './leadCapture.ts';
import { decideEscalation } from './routing.ts';

export interface ToolContext {
  agent: Agent;
  call: Call;
}

/** Build the tool list offered to the model for a given agent. */
export function buildTools(agent: Agent): RealtimeTool[] {
  const tools: RealtimeTool[] = [
    {
      name: 'lookup_faq',
      description:
        'Answer a caller question using the business knowledge base. Call this before answering factual questions about the business.',
      parameters: {
        type: 'object',
        properties: { question: { type: 'string', description: "The caller's question" } },
        required: ['question'],
      },
    },
    {
      name: 'capture_lead',
      description:
        'Save or update the caller as a lead with any details gathered so far. Call this whenever you learn the caller name, contact info, intent, or requested service.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          intent: { type: 'string' },
          service: { type: 'string' },
        },
      },
    },
    {
      name: 'request_human',
      description:
        'Escalate to a human (transfer or take a message) when the caller is upset, has an emergency, or explicitly asks for a person.',
      parameters: {
        type: 'object',
        properties: { reason: { type: 'string' } },
        required: ['reason'],
      },
    },
  ];

  if (agent.definition.booking.enabled) {
    tools.push(
      {
        name: 'get_availability',
        description: 'Get available appointment time slots to offer the caller.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'book_appointment',
        description: 'Book an appointment once the caller confirms a time and service.',
        parameters: {
          type: 'object',
          properties: {
            service: { type: 'string', description: 'The service being booked' },
            startsAt: { type: 'string', description: 'ISO 8601 start time from get_availability' },
          },
          required: ['service', 'startsAt'],
        },
      },
    );
  }

  return tools;
}

/** Dispatch a tool call from the model. Returns a JSON-serializable result. */
export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const { agent, call } = ctx;

  switch (name) {
    case 'lookup_faq': {
      const match = searchKnowledgeBase(
        String(args.question ?? ''),
        agent.definition.knowledgeBase,
      );
      return match
        ? { found: true, answer: match.entry.answer }
        : { found: false, note: 'No confident match. Offer to take a message or transfer.' };
    }

    case 'capture_lead': {
      const lead = captureLead({
        agent,
        callId: call.id,
        name: args.name as string | undefined,
        phone: args.phone as string | undefined,
        email: args.email as string | undefined,
        intent: args.intent as string | undefined,
        service: args.service as string | undefined,
      });
      // Persist captured fields onto the call record too.
      const fields: Record<string, string> = { ...call.capturedFields };
      for (const k of ['name', 'phone', 'email', 'intent', 'service'] as const) {
        if (args[k]) fields[k] = String(args[k]);
      }
      store.calls.update(call.id, { capturedFields: fields });
      return { saved: true, leadId: lead.id, score: lead.score };
    }

    case 'get_availability': {
      const slots = await getAvailability(agent);
      return { slots: slots.slice(0, 6) };
    }

    case 'book_appointment': {
      const lead = store.leads.find((l) => l.callId === call.id);
      const result = await bookAppointment({
        agent,
        callId: call.id,
        leadId: lead?.id,
        service: String(args.service ?? agent.definition.booking.services[0] ?? 'Appointment'),
        startsAt: String(args.startsAt),
        attendeeEmail: lead?.email,
        attendeeName: lead?.name,
      });
      if (!result.ok || !result.appointment) {
        return {
          booked: false,
          note: 'The calendar could not be reached. Take the caller\'s details and promise a callback to confirm.',
        };
      }
      store.calls.update(call.id, { outcome: 'booked' });
      return {
        booked: true,
        appointmentId: result.appointment.id,
        startsAt: result.appointment.startsAt,
        link: result.htmlLink,
      };
    }

    case 'request_human': {
      const decision = decideEscalation(agent);
      store.calls.update(call.id, {
        outcome: decision.action === 'transfer' ? 'transferred' : 'voicemail',
        transcript: [
          ...call.transcript,
          { role: 'system', text: `Escalation: ${decision.reason}`, at: nowIso() },
        ],
      });
      return decision;
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
