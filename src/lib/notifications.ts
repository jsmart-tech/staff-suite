import { createAdminClient } from '@/lib/supabase/admin';

export type NotificationInput = {
  actorId?: string;
  recipientIds: string[];
  type: string;
  title: string;
  body: string;
  href: string;
  entityType?: string;
  entityId?: string;
  eventKey: string;
};

export async function createNotifications(input: NotificationInput) {
  const recipientIds = [...new Set(input.recipientIds)]
    .filter(recipientId => recipientId && recipientId !== input.actorId);
  if (!recipientIds.length) return { created: 0 };

  const admin = createAdminClient();
  const { error } = await admin.from('notifications').upsert(
    recipientIds.map(recipientId => ({
      recipient_id: recipientId,
      actor_id: input.actorId || null,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href,
      entity_type: input.entityType || null,
      entity_id: input.entityId || null,
      event_key: input.eventKey,
    })),
    { onConflict: 'recipient_id,event_key', ignoreDuplicates: true }
  );

  if (error) throw new Error(`Unable to create notifications: ${error.message}`);
  return { created: recipientIds.length };
}
