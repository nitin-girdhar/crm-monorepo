import { eq } from 'drizzle-orm';
import { withServiceTx } from '@crm/db';
import { leadStageTable, leadSourcesTable, marketingLeadsTable } from '@crm/db/schema';
import { BadRequestError } from '../../../lib/errors.js';

export interface WebhookLeadData {
  org_id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  city?: string;
  source?: string;
  campaign_id?: string;
  [key: string]: unknown;
}

export async function createWebhookLead(data: WebhookLeadData) {
  if (!data.org_id) throw new BadRequestError('org_id is required');

  return withServiceTx(async (tx) => {
    const [defaultStage] = await tx
      .select({ id: leadStageTable.id })
      .from(leadStageTable)
      .where(eq(leadStageTable.name, 'new'))
      .limit(1);
    if (!defaultStage) throw new Error('Lead stage "new" not found');

    let sourceId: string | null = null;
    if (data.source) {
      const [src] = await tx
        .select({ id: leadSourcesTable.id })
        .from(leadSourcesTable)
        .where(eq(leadSourcesTable.name, String(data.source)))
        .limit(1);
      sourceId = src?.id ?? null;
    }

    const campaignId = data.campaign_id ? String(data.campaign_id) : null;

    const [inserted] = await tx
      .insert(marketingLeadsTable)
      .values({
        orgId: data.org_id,
        firstName: String(data.first_name ?? ''),
        lastName: String(data.last_name ?? ''),
        phone: data.phone ? String(data.phone) : null,
        email: data.email ? String(data.email) : null,
        city: data.city ? String(data.city) : null,
        stageId: defaultStage.id,
        sourceId,
        campaignId,
        rawWebhookData: data as Record<string, unknown>,
      })
      .returning({ id: marketingLeadsTable.id });

    return inserted!;
  });
}
