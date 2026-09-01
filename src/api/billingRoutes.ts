/**
 * Billing API (Stripe checkout + portal). Webhook is handled in index.ts
 * because it needs the raw body and Stripe-Signature.
 */
import { Router, json, badRequest, forbidden, type Ctx } from '../server/http.ts';
import { store } from '../core/store.ts';
import { hasRole } from '../auth/service.ts';
import { hasStripe } from '../config/env.ts';
import { PLANS } from '../billing/plans.ts';
import { getUsageSummary } from '../billing/usage.ts';
import {
  createCheckoutSession,
  createPortalSession,
  type PaidPlan,
} from '../providers/billing/stripe.ts';

const PAID: PaidPlan[] = ['starter', 'pro', 'scale'];

export function registerBillingRoutes(r: Router): void {
  r.get('/api/billing/plans', (c: Ctx) => json(c.res, 200, { plans: PLANS, stripe: hasStripe() }));

  r.post('/api/billing/checkout', async (c: Ctx) => {
    if (!hasRole(c.role ?? 'member', 'admin')) return forbidden(c.res);
    if (!hasStripe()) return badRequest(c.res, ['Stripe is not configured. Set STRIPE_SECRET_KEY and price IDs.']);
    const plan = c.body?.plan as PaidPlan;
    if (!PAID.includes(plan)) return badRequest(c.res, ['plan must be starter, pro, or scale']);
    const org = store.organizations.get(c.orgId);
    if (!org) return badRequest(c.res, ['Organization not found']);
    try {
      const session = await createCheckoutSession(org, plan);
      return json(c.res, 200, session);
    } catch (e) {
      return json(c.res, 502, { error: 'stripe_error', message: (e as Error).message });
    }
  });

  r.post('/api/billing/portal', async (c: Ctx) => {
    if (!hasRole(c.role ?? 'member', 'admin')) return forbidden(c.res);
    const org = store.organizations.get(c.orgId);
    if (!org) return badRequest(c.res, ['Organization not found']);
    try {
      const session = await createPortalSession(org);
      return json(c.res, 200, session);
    } catch (e) {
      return json(c.res, 502, { error: 'stripe_error', message: (e as Error).message });
    }
  });

  r.get('/api/billing/status', (c: Ctx) => {
    const org = store.organizations.get(c.orgId);
    if (!org) return json(c.res, 200, { plan: 'trial' });
    return json(c.res, 200, {
      plan: org.plan,
      stripeCustomerId: org.stripeCustomerId ? 'connected' : null,
      usage: getUsageSummary(org),
    });
  });
}
