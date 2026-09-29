/** Short-lived in-memory storage for WebAuthn challenges (single-instance app). */
export class ChallengeStore {
  private readonly items = new Map<string, { challenge: string; expiresAt: number }>();

  constructor(private readonly ttlMs = 5 * 60_000) {}

  set(key: string, challenge: string): void {
    this.prune();
    this.items.set(key, { challenge, expiresAt: Date.now() + this.ttlMs });
  }

  /** Returns the challenge and forgets it, so each challenge can be used only once. */
  take(key: string): string | null {
    const item = this.items.get(key);
    this.items.delete(key);
    if (!item || item.expiresAt < Date.now()) return null;
    return item.challenge;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, item] of this.items) if (item.expiresAt < now) this.items.delete(key);
  }
}
