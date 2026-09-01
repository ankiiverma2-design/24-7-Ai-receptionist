/**
 * CRM provider abstraction.
 *
 * Lead/appointment sync goes through this so HubSpot (or later Salesforce,
 * Zoho, GHL) can be swapped without touching the call path. Workers call this
 * asynchronously — never from the realtime loop.
 */

export type CrmCredentials = Record<string, string>;

export interface CrmContact {
  email?: string;
  phone?: string;
  name?: string;
  intent?: string;
  service?: string;
  score?: number;
  source?: string;
  attributes?: Record<string, string>;
}

export interface CrmUpsertResult {
  externalId?: string;
  created: boolean;
}

export interface CrmProvider {
  readonly name: string;
  upsertContact(creds: CrmCredentials, contact: CrmContact): Promise<CrmUpsertResult>;
}
