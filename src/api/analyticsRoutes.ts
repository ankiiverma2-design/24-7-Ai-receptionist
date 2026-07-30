/**
 * Analytics + usage API routes.
 *
 * Aggregates calls, leads, and appointments into the metrics a dashboard needs,
 * and exposes current billing-period usage against plan limits.
 */
import { Router, json, type Ctx } from '../server/http.ts';
import { store } from '../core/store.ts';
import { getUsageSummary } from '../billing/usage.ts';
import { languageName } from '../i18n/languages.ts';

function analyticsSummary(orgId: string) {
  const calls = store.calls.list(orgId);
  const completed = calls.filter((c) => c.endedAt);
  const booked = calls.filter((c) => c.outcome === 'booked').length;
  const transferred = calls.filter((c) => c.outcome === 'transferred').length;
  const leads = store.leads.list(orgId);
  const qualified = leads.filter((l) => (l.score ?? 0) >= 60).length;
  const appointments = store.appointments.list(orgId);

  const totalDuration = completed.reduce((a, c) => a + (c.durationSec ?? 0), 0);
  const avgDuration = completed.length ? Math.round(totalDuration / completed.length) : 0;

  // Language mix.
  const langMix: Record<string, number> = {};
  for (const c of calls) {
    if (!c.language) continue;
    const name = languageName(c.language);
    langMix[name] = (langMix[name] ?? 0) + 1;
  }

  // Sentiment mix.
  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  for (const c of completed) if (c.sentiment) sentiment[c.sentiment]++;

  const totalCalls = calls.length;
  return {
    totals: {
      calls: totalCalls,
      completed: completed.length,
      leads: leads.length,
      qualifiedLeads: qualified,
      appointments: appointments.length,
    },
    rates: {
      bookingRate: totalCalls ? +(booked / totalCalls).toFixed(3) : 0,
      qualificationRate: leads.length ? +(qualified / leads.length).toFixed(3) : 0,
      transferRate: totalCalls ? +(transferred / totalCalls).toFixed(3) : 0,
      containmentRate: totalCalls ? +(1 - transferred / totalCalls).toFixed(3) : 0,
    },
    avgCallDurationSec: avgDuration,
    languageMix: langMix,
    sentiment,
  };
}

export function registerAnalyticsRoutes(r: Router): void {
  r.get('/api/analytics/summary', (c: Ctx) =>
    json(c.res, 200, analyticsSummary(c.orgId)),
  );

  r.get('/api/usage', (c: Ctx) => {
    const org = store.organizations.get(c.orgId);
    if (!org) return json(c.res, 200, { period: null, note: 'No organization' });
    return json(c.res, 200, getUsageSummary(org));
  });
}
