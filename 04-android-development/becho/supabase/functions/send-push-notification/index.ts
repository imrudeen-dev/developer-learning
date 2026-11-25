import { createClient } from 'npm:@supabase/supabase-js@2';

interface NotificationRecord {
  id?: string;
  recipient_id?: string;
  actor_id?: string | null;
  notification_type?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown> | null;
}

interface WebhookPayload {
  type?: string;
  table?: string;
  schema?: string;
  record?: NotificationRecord | null;
}

interface ExpoPushTicket {
  status?: string;
  details?: { error?: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
    console.error('[Becho push] Required server secrets are not configured.');
    return new Response('Push service is not configured', { status: 500 });
  }
  if (request.headers.get('x-becho-webhook-secret') !== webhookSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const payload = (await request.json()) as WebhookPayload;
    const notification = payload.record;
    if (
      payload.type !== 'INSERT' ||
      payload.table !== 'notifications' ||
      payload.schema !== 'public' ||
      !notification?.recipient_id ||
      !notification.title ||
      !notification.body ||
      !notification.notification_type
    ) {
      return new Response('Invalid notification webhook payload', { status: 400 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: tokenRows, error: tokenError } = await admin
      .from('device_push_tokens')
      .select('expo_push_token')
      .eq('user_id', notification.recipient_id);
    if (tokenError) throw tokenError;

    const tokens = (tokenRows ?? [])
      .map((row) => row.expo_push_token)
      .filter((token): token is string => typeof token === 'string' && token.length > 0);
    if (tokens.length === 0) {
      return Response.json({ sent: 0 });
    }

    const notificationData = isRecord(notification.data) ? notification.data : {};
    const data = {
      ...notificationData,
      notification_id: notification.id,
      notification_type: notification.notification_type,
      actor_id: notification.actor_id,
    };
    const invalidTokens: string[] = [];

    for (let offset = 0; offset < tokens.length; offset += 100) {
      const batch = tokens.slice(offset, offset + 100);
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          batch.map((token) => ({
            to: token,
            title: notification.title,
            body: notification.body,
            sound: 'default',
            priority: 'high',
            channelId: 'default',
            data,
          }))
        ),
      });
      if (!response.ok) {
        console.error('[Becho push] Expo Push Service returned HTTP', response.status);
        return new Response('Push delivery failed', { status: 502 });
      }

      const result = (await response.json()) as { data?: ExpoPushTicket[] };
      result.data?.forEach((ticket, index) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          invalidTokens.push(batch[index]);
        }
      });
    }

    if (invalidTokens.length > 0) {
      const { error: cleanupError } = await admin
        .from('device_push_tokens')
        .delete()
        .eq('user_id', notification.recipient_id)
        .in('expo_push_token', invalidTokens);
      if (cleanupError) {
        console.error('[Becho push] Could not remove expired device tokens:', cleanupError);
      }
    }

    return Response.json({ sent: tokens.length - invalidTokens.length });
  } catch (error) {
    console.error('[Becho push] Notification dispatch failed:', error);
    return new Response('Notification dispatch failed', { status: 500 });
  }
});
