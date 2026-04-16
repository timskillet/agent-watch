const counters = new Map<string, number>();

export function nextSequence(sessionId: string): number {
  const current = counters.get(sessionId) ?? 0;
  const next = current + 1;
  counters.set(sessionId, next);
  return next;
}

export function evictSession(sessionId: string): void {
  counters.delete(sessionId);
}

export function resetSequences(): void {
  counters.clear();
}
