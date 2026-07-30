// Typed client for the Phase 4 backend API. Every call attaches the stored shared-login
// credentials; a 401 means they're stale/wrong, which the caller surfaces by logging out.
import type { Credentials } from './auth/credentials';
import { authHeader } from './auth/credentials';
import type { PendingFix, PendingFixStatus, RecordedAction, Run, TestCase } from './types';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(credentials: Credentials, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      Authorization: authHeader(credentials),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : res.statusText;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export function checkCredentials(credentials: Credentials): Promise<void> {
  return request<void>(credentials, '/api/tests');
}

export function listTests(credentials: Credentials): Promise<TestCase[]> {
  return request<TestCase[]>(credentials, '/api/tests');
}

export function createTest(credentials: Credentials, input: { name: string; specPath: string }): Promise<TestCase> {
  return request<TestCase>(credentials, '/api/tests', { method: 'POST', body: JSON.stringify(input) });
}

export function renameTest(credentials: Credentials, id: string, name: string): Promise<TestCase> {
  return request<TestCase>(credentials, `/api/tests/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
}

export function deleteTest(credentials: Credentials, id: string): Promise<void> {
  return request<void>(credentials, `/api/tests/${id}`, { method: 'DELETE' });
}

export function triggerRun(credentials: Credentials, testId: string): Promise<Run> {
  return request<Run>(credentials, `/api/tests/${testId}/runs`, { method: 'POST' });
}

export function listRunsForTest(credentials: Credentials, testId: string): Promise<Run[]> {
  return request<Run[]>(credentials, `/api/tests/${testId}/runs`);
}

export function listPendingFixes(credentials: Credentials, status?: PendingFixStatus): Promise<PendingFix[]> {
  const query = status ? `?status=${status}` : '';
  return request<PendingFix[]>(credentials, `/api/pending-fixes${query}`);
}

export function updatePendingFix(
  credentials: Credentials,
  id: string,
  status: Extract<PendingFixStatus, 'approved' | 'rejected'>
): Promise<PendingFix> {
  return request<PendingFix>(credentials, `/api/pending-fixes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function startRecording(credentials: Credentials, url: string): Promise<{ sessionId: string; wsPath: string }> {
  return request(credentials, '/api/recordings', { method: 'POST', body: JSON.stringify({ url }) });
}

export function stopRecording(credentials: Credentials, sessionId: string): Promise<{ actions: RecordedAction[] }> {
  return request(credentials, `/api/recordings/${sessionId}/stop`, { method: 'POST' });
}

export function saveRecording(credentials: Credentials, sessionId: string, name: string): Promise<TestCase> {
  return request<TestCase>(credentials, `/api/recordings/${sessionId}/save`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}
