// Single shared login (REQUIREMENTS.md 4 — no per-tenant accounts): one username/password pair,
// held in sessionStorage so a refresh doesn't force re-login but closing the tab does.
export interface Credentials {
  username: string;
  password: string;
}

const STORAGE_KEY = 'test-console.credentials';

export function loadCredentials(): Credentials | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

export function saveCredentials(credentials: Credentials): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
}

export function clearCredentials(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function authHeader(credentials: Credentials): string {
  return `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
}
