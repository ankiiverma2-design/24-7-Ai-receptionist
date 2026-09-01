/**
 * Stripe billing adapter (zero-dependency, fetch-based).
 *
 * Maps platform plans to Stripe Price IDs, creates Checkout + Customer Portal
 * sessions, and verifies webhooks. Plan changes are applied to Organization
 * by the webhook handler — internal limit enforcement stays the source of truth.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.ts';
import { store } from '../../core/store.ts';
import { eventBus } from '../../core/events.ts';
import type { Organization } from '../../core/types.ts';

const STRIPE = 'https://api.stripe.com/v1';

export type PaidPlan = Exclude<Organization['plan'], 'trial'>;

export function priceIdForPlan(plan: PaidPlan): string {
  const map: Record<PaidPlan, string> = {
    starter: env.stripePriceStarter,
    pro: env.stripePricePro,
    scale: env.stripePriceScale,
  };
  return map[plan];
}

export function planForPriceId(priceId: string): Organization['plan'] | undefined {
  if (priceId && priceId === env.stripePriceStarter) return 'starter';
  if (priceId && priceId === env.stripePricePro) return 'pro';
  if (priceId && priceId === env.stripePriceScale) return 'scale';
  return undefined;
}

async function stripeForm(path: string, params: Record<string, string>): Promise<any> {
  if (!env.stripeSecretKey) throw new Error('STRIPE_SECRET_KEY is not configured');
  const res = await fetch(`${STRIPE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path} ${res.status}: ${data.error?.message ?? JSON.stringify(data)}`);
  return data;
}

export async function createCheckoutSession(
  org: Organization,
  plan: PaidPlan,
  opts?: { successUrl?: string; cancelUrl?: string },
): Promise<{ url: string; id: string }> {
  const price = priceIdForPlan(plan);
  if (!price) throw new Error(`No Stripe price configured for plan '${plan}'`);
  const success =
    opts?.successUrl || env.stripeSuccessUrl || `${env.publicBaseUrl}/?billing=success`;
  const cancel = opts?.cancelUrl || env.stripeCancelUrl || `${env.publicBaseUrl}/?billing=cancel`;
  const params: Record<string, string> = {
    mode: 'subscription',
    success_url: success,
    cancel_url: cancel,
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    'metadata[orgId]': org.id,
    'metadata[plan]': plan,
    'subscription_data[metadata][orgId]': org.id,
    'subscription_data[metadata][plan]': plan,
    client_reference_id: org.id,
  };
  if (org.stripeCustomerId) params.customer = org.stripeCustomerId;
  else params['customer_email'] = `${org.id}@billing.voxdesk.local`;
  const session = await stripeForm('/checkout/sessions', params);
  return { url: session.url, id: session.id };
}

export async function createPortalSession(org: Organization): Promise<{ url: string }> {
  if (!org.stripeCustomerId) throw new Error('No Stripe customer on this organization');
  const session = await stripeForm('/billing_portal/sessions', {
    customer: org.stripeCustomerId,
    return_url: env.publicBaseUrl,
  });
  return { url: session.url };
}

/** Verify Stripe-Signature (t=...,v1=...) over the raw body. */
export function verifyStripeSignature(rawBody: string, header: string | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(v1, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function applyPlan(
  orgId: string,
  plan: Organization['plan'],
  extras?: { stripeCustomerId?: string; stripeSubscriptionId?: string },
): Organization | undefined {
  const org = store.organizations.get(orgId);
  if (!org) return undefined;
  const updated = store.organizations.update(orgId, {
    plan,
    ...(extras?.stripeCustomerId ? { stripeCustomerId: extras.stripeCustomerId } : {}),
    ...(extras?.stripeSubscriptionId
      ? { stripeSubscriptionId: extras.stripeSubscriptionId }
      : extras?.stripeSubscriptionId === ''
        ? { stripeSubscriptionId: undefined }
        : {}),
  });
  if (updated) eventBus.publish(orgId, 'billing.updated', { plan, orgId });
  return updated;
}

/** Handle a verified Stripe event object. */
export function handleStripeEvent(event: { type: string; data: { object: any } }): void {
  const obj = event.data?.object ?? {};
  switch (event.type) {
    case 'checkout.session.completed': {
      const orgId = obj.metadata?.orgId || obj.client_reference_id;
      const plan = (obj.metadata?.plan as Organization['plan']) || 'starter';
      if (orgId) {
        applyPlan(orgId, plan, {
          stripeCustomerId: obj.customer,
          stripeSubscriptionId: obj.subscription,
        });
      }
      break;
    }
    case 'customer.subscription.updated': {
      const orgId = obj.metadata?.orgId;
      const priceId = obj.items?.data?.[0]?.price?.id;
      const plan = (obj.metadata?.plan as Organization['plan']) || (priceId ? planForPriceId(priceId) : undefined);
      if (orgId && plan) {
        applyPlan(orgId, plan, { stripeSubscriptionId: obj.id, stripeCustomerId: obj.customer });
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const orgId = obj.metadata?.orgId;
      if (orgId) {
        const org = store.organizations.get(orgId);
        applyPlan(orgId, 'trial', { stripeCustomerId: org?.stripeCustomerId });
        store.organizations.update(orgId, { stripeSubscriptionId: undefined });
      }
      break;
    }
    default:
      break;
  }
}
