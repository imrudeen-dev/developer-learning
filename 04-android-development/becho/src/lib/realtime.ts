import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Unique channel topic so React Strict Mode remounts never collide
 * with a still-subscribed channel of the same name.
 */
export function uniqueChannelTopic(base: string): string {
  return `${base}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Remove any existing channels whose topic starts with `prefix`
 * (including older unique suffixes). Safe to call before subscribe.
 */
export function removeChannelsByPrefix(
  client: SupabaseClient = supabase,
  prefix: string
): void {
  try {
    for (const channel of client.getChannels()) {
      const topic = (channel as RealtimeChannel & { topic?: string }).topic ?? '';
      // Supabase prefixes topics with "realtime:" internally in some versions.
      const normalized = topic.replace(/^realtime:/, '');
      if (normalized === prefix || normalized.startsWith(`${prefix}:`)) {
        void client.removeChannel(channel);
      }
    }
  } catch (error) {
    console.warn('[Becho] Could not prune realtime channels:', error);
  }
}

type PostgresChangeFilter = {
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  schema?: string;
  table: string;
  filter?: string;
};

/**
 * Create a channel, attach ALL postgres_changes handlers, then subscribe once.
 * Never call .on() after .subscribe() — that is what triggers:
 * "cannot add postgres_changes callbacks after subscribe()".
 */
export function subscribePostgresChanges(
  baseTopic: string,
  handlers: Array<{
    filter: PostgresChangeFilter;
    callback: (payload: {
      new: Record<string, unknown>;
      old: Record<string, unknown>;
      eventType: string;
    }) => void;
  }>,
  client: SupabaseClient = supabase
): RealtimeChannel {
  removeChannelsByPrefix(client, baseTopic);

  const topic = uniqueChannelTopic(baseTopic);
  let channel = client.channel(topic);

  for (const handler of handlers) {
    channel = channel.on(
      'postgres_changes',
      {
        event: handler.filter.event,
        schema: handler.filter.schema ?? 'public',
        table: handler.filter.table,
        ...(handler.filter.filter ? { filter: handler.filter.filter } : {}),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler.callback as any
    );
  }

  channel.subscribe((status, err) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn(`[Becho] Realtime channel ${topic} status=${status}`, err);
    }
  });

  return channel;
}

export function cleanupChannel(
  channel: RealtimeChannel | null | undefined,
  client: SupabaseClient = supabase
): void {
  if (!channel) return;
  try {
    void client.removeChannel(channel);
  } catch (error) {
    console.warn('[Becho] Could not remove realtime channel:', error);
  }
}
