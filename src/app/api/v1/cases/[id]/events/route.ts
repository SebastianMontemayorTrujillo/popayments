import type { NextRequest } from 'next/server';
import { errorResponse, response } from '@/shared/errors';
import { authenticated } from '@/shared/session';
import { database } from '@/shared/database';
import { getCase } from '@/modules/payment-workflow/cases';

interface EventRow { at: Date; kind: string; details: unknown }
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await authenticated(request);
    const { id } = await context.params;
    await getCase(id);
    const found = await database().query<EventRow>(`SELECT at,kind,details FROM (
      SELECT e.created_at AS at, 'AGENT_TOOL:' || e.name AS kind,
        jsonb_build_object('arguments',e.arguments,'result',e.result,'durationMs',e.duration_ms) AS details
        FROM agent_tool_events e JOIN agent_runs r ON r.id=e.run_id WHERE r.case_id=$1
      UNION ALL
      SELECT e.observed_at AS at, 'REAP:' || e.status AS kind,
        jsonb_build_object('checkoutId',e.checkout_id,'orderId',e.order_id,'finalAmount',e.final_amount) AS details
        FROM payment_status_events e JOIN payment_intents i ON i.id=e.payment_intent_id WHERE i.case_id=$1
      UNION ALL
      SELECT a.created_at AS at, a.action AS kind, COALESCE(a.details,'{}'::jsonb) AS details
        FROM audit_events a WHERE a.entity_id IN
          (SELECT id FROM purchase_authorizations WHERE case_id=$1 UNION SELECT id FROM payment_decisions WHERE case_id=$1
           UNION SELECT id FROM payment_reviews WHERE case_id=$1)
    ) history ORDER BY at DESC LIMIT 100`, [id]);
    return response(found.rows.map((row) => ({ at: row.at.toISOString(), kind: row.kind, details: row.details })));
  } catch (error) { return errorResponse(error); }
}
