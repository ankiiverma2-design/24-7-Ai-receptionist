/**
 * HubSpot CRM adapter (private app token or OAuth access/refresh).
 */
import { env } from '../../config/env.ts';
import type { CrmContact, CrmCredentials, CrmProvider, CrmUpsertResult } from './types.ts';

const HUBSPOT = 'https://api.hubapi.com';

export function buildHubSpotAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.hubspotClientId,
    redirect_uri: env.hubspotRedirectUri,
    scope: 'crm.objects.contacts.write crm.objects.contacts.read',
    state,
  });
  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeHubSpotCode(code: string): Promise<{ refreshToken: string; accessToken: string }> {
  const res = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.hubspotClientId,
      client_secret: env.hubspotClientSecret,
      redirect_uri: env.hubspotRedirectUri,
      code,
    }).toString(),
  });
  if (!res.ok) throw new Error(`HubSpot token exchange ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { refresh_token: string; access_token: string };
  return { refreshToken: data.refresh_token, accessToken: data.access_token };
}

async function bearer(creds: CrmCredentials): Promise<string> {
  if (creds.accessToken) return creds.accessToken;
  if (creds.privateAppToken) return creds.privateAppToken;
  if (creds.refreshToken) {
    const res = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: env.hubspotClientId,
        client_secret: env.hubspotClientSecret,
        refresh_token: creds.refreshToken,
      }).toString(),
    });
    if (!res.ok) throw new Error(`HubSpot token refresh ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }
  throw new Error('HubSpot credentials missing (accessToken, privateAppToken, or refreshToken)');
}

function splitName(name?: string): { firstname?: string; lastname?: string } {
  if (!name) return {};
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstname: parts[0] };
  return { firstname: parts[0], lastname: parts.slice(1).join(' ') };
}

export class HubSpotCrmProvider implements CrmProvider {
  readonly name = 'hubspot';

  async upsertContact(creds: CrmCredentials, contact: CrmContact): Promise<CrmUpsertResult> {
    const token = await bearer(creds);
    const { firstname, lastname } = splitName(contact.name);
    const properties: Record<string, string> = {};
    if (firstname) properties.firstname = firstname;
    if (lastname) properties.lastname = lastname;
    if (contact.email) properties.email = contact.email;
    if (contact.phone) properties.phone = contact.phone;
    if (contact.service) properties.hs_lead_status = 'NEW';
    properties.voxdesk_intent = contact.intent ?? '';
    properties.voxdesk_service = contact.service ?? '';
    properties.voxdesk_score = String(contact.score ?? '');
    properties.voxdesk_source = contact.source ?? 'voxdesk';

    const idProp = contact.email ? 'email' : contact.phone ? 'phone' : undefined;
    const idValue = contact.email || contact.phone;
    if (idProp && idValue) {
      const patch = await fetch(
        `${HUBSPOT}/crm/v3/objects/contacts/${encodeURIComponent(idValue)}?idProperty=${idProp}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ properties }),
        },
      );
      if (patch.ok) {
        const data = (await patch.json()) as { id: string };
        return { externalId: data.id, created: false };
      }
      if (patch.status !== 404) {
        throw new Error(`HubSpot contact patch ${patch.status}: ${await patch.text()}`);
      }
    }

    const create = await fetch(`${HUBSPOT}/crm/v3/objects/contacts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties }),
    });
    if (!create.ok) throw new Error(`HubSpot contact create ${create.status}: ${await create.text()}`);
    const data = (await create.json()) as { id: string };
    return { externalId: data.id, created: true };
  }
}

export const hubspotCrm = new HubSpotCrmProvider();
