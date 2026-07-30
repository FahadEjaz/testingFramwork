// Mirrors the shapes server/src/storage/*.ts and server/src/runner.ts return. Kept as a plain
// hand-maintained copy rather than a shared package — the two sides are simple JSON shapes and
// live in separate npm packages (server/ is CommonJS run directly by Node, web/ is an ESM/
// bundler-mode Vite app), so a shared workspace package would be more machinery than the size
// of this contract justifies right now.
export interface TestCase {
  id: string;
  name: string;
  specPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface RunStats {
  expected: number;
  unexpected: number;
  flaky: number;
  skipped: number;
  duration: number;
}

export interface HealingEvent {
  spec: string;
  elementKey: string;
  oldPrimary: unknown;
  newPrimary: unknown;
  fallbackIndex: number;
  timestamp: string;
}

export interface Run {
  id: string;
  testId: string;
  status: 'passed' | 'failed';
  stats: RunStats;
  healed: boolean;
  healingEvents: HealingEvent[];
  startedAt: string;
  finishedAt: string;
  reportAvailable: boolean;
}

export type PendingFixSource = 'fallback' | 'ai';
export type PendingFixStatus = 'pending' | 'approved' | 'rejected';

export interface PendingFix {
  id: string;
  testId: string;
  spec: string;
  elementKey: string;
  oldPrimary: unknown;
  newPrimary: unknown;
  fallbackIndex: number;
  source: PendingFixSource;
  status: PendingFixStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LocatorCandidate {
  strategy: 'role' | 'testId' | 'css' | 'text' | 'label' | 'placeholder';
  role?: string;
  name?: string;
  value?: string;
}

export interface RecordedAction {
  type: 'click' | 'fill' | 'selectOption';
  url: string;
  candidates: LocatorCandidate[];
  value?: string;
}
