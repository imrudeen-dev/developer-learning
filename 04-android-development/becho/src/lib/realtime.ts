export function uniqueChannelTopic(base: string): string {
  return `${base}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
}