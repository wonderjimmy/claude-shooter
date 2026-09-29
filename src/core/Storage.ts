const PREFIX = 'claude-shooter:';

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T;
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    return { ...fallback, ...(parsed as Partial<T>) };
  } catch {
    return fallback;
  }
}

export function loadRaw(key: string): string | null {
  try { return localStorage.getItem(PREFIX + key); } catch { return null; }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch { /* private mode / quota */ }
}
