import type { LampTone } from '../components/StatusLamp';
import type { Run } from '../types';

export function runLamp(run: Pick<Run, 'status' | 'healed'>): { tone: LampTone; label: string } {
  if (run.status === 'failed') return { tone: 'fail', label: 'Failed' };
  if (run.healed) return { tone: 'healed', label: 'Healed' };
  return { tone: 'pass', label: 'Passed' };
}

export function formatLocator(entry: unknown): string {
  if (!entry || typeof entry !== 'object') return String(entry);
  const e = entry as Record<string, unknown>;
  if (e.strategy === 'role') {
    return e.name ? `role "${e.role}" named "${e.name}"` : `role "${e.role}"`;
  }
  if (typeof e.strategy === 'string' && typeof e.value === 'string') {
    return `${e.strategy} "${e.value}"`;
  }
  return JSON.stringify(entry);
}

export function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
