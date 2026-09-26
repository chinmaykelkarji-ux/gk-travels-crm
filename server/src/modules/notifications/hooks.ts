// Wires notifications into modules that must not import this one directly.
import { onMessageFailed } from '../comms/service.js';
import { notify } from './service.js';

onMessageFailed(async (c, error) => {
  const link = c.tripId ? `/trips/${c.tripId}?tab=messages` : c.customerId ? `/customers/${c.customerId}` : null;
  await notify({
    ...(c.userId ? { userIds: [c.userId] } : { roles: ['ADMIN'] }),
    type: 'message_failed', title: `A message to ${c.recipient} was not sent`, body: error, link,
    entityType: 'communication', entityId: c.id, dedupeKey: `message_failed:${c.id}`,
  });
});
