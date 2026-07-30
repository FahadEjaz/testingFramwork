// One server-side headless Playwright browser per recording session (Phase 6 — see PLAN.md).
// Streams itself out via CDP screencast frames and accepts CDP input events back in, while the
// injected recorderScript reports every click/fill as a candidate-locator action. No AI
// anywhere on this path — this is the same deterministic engine as every other phase, just
// driven live instead of by a spec file.
import type { LocatorCandidate } from './codegen';

const { chromium } = require('@playwright/test');

export interface RecordedAction {
  type: 'click' | 'fill' | 'selectOption';
  url: string;
  candidates: LocatorCandidate[];
  value?: string;
}

export type SessionStatus = 'starting' | 'live' | 'stopped';

const VIEWPORT = { width: 1280, height: 800 };

function requireRecorderScriptSource(): string {
  return require('./recorderScript.ts').getRecorderScriptSource();
}

class RecordingSession {
  readonly id: string;
  readonly startUrl: string;
  status: SessionStatus = 'starting';
  lastActivityAt: number;

  private browser: any;
  private context: any;
  private page: any;
  private cdp: any;
  private actions: RecordedAction[] = [];
  private onFrame?: (frame: { data: string; width: number; height: number }) => void;
  // The session starts recording (and navigating) as soon as start() is called, which is
  // always before a client has had a chance to open the websocket and call onFrameReceived —
  // any frames emitted in that gap would otherwise be silently dropped. Buffering the latest
  // one and replaying it to a newly-attached listener means a client that connects late still
  // sees the current page instead of a blank canvas until the next repaint.
  private lastFrame?: { data: string; width: number; height: number };

  constructor(id: string, startUrl: string, now: number) {
    this.id = id;
    this.startUrl = startUrl;
    this.lastActivityAt = now;
  }

  onFrameReceived(fn: (frame: { data: string; width: number; height: number }) => void): void {
    this.onFrame = fn;
    if (this.lastFrame) fn(this.lastFrame);
  }

  async start(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({ viewport: VIEWPORT });
    this.page = await this.context.newPage();

    // Order matters: the binding must exist before the init script's first run, and the init
    // script must be registered before the first navigation.
    await this.page.exposeBinding('__recordAction__', (_source: unknown, action: RecordedAction) => {
      this.actions.push(action);
      this.lastActivityAt = Date.now();
    });
    await this.page.addInitScript(requireRecorderScriptSource());

    this.cdp = await this.context.newCDPSession(this.page);
    await this.cdp.send('Page.enable');
    this.cdp.on('Page.screencastFrame', async (event: any) => {
      const frame = {
        data: event.data,
        width: event.metadata.deviceWidth,
        height: event.metadata.deviceHeight,
      };
      this.lastFrame = frame;
      this.onFrame?.(frame);
      try {
        await this.cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId });
      } catch {
        // session may already be tearing down — a missed ack just means one dropped frame.
      }
    });

    // Screencast starts before the initial navigation so the user sees the page load happen
    // rather than joining after it's already rendered — and so a static/unchanging page still
    // produces at least one frame (the navigation's own paint), instead of zero.
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 60,
      maxWidth: VIEWPORT.width,
      maxHeight: VIEWPORT.height,
      everyNthFrame: 1,
    });
    await this.page.goto(this.startUrl);
    this.status = 'live';
  }

  async dispatchMouseEvent(params: { type: string; x: number; y: number; button?: string }): Promise<void> {
    this.lastActivityAt = Date.now();
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: params.type,
      x: params.x,
      y: params.y,
      button: params.button ?? 'left',
      clickCount: params.type === 'mousePressed' ? 1 : 0,
    });
  }

  async dispatchKeyEvent(params: Record<string, unknown>): Promise<void> {
    this.lastActivityAt = Date.now();
    await this.cdp.send('Input.dispatchKeyEvent', params);
  }

  async insertText(text: string): Promise<void> {
    this.lastActivityAt = Date.now();
    await this.cdp.send('Input.insertText', { text });
  }

  getActions(): RecordedAction[] {
    return this.actions;
  }

  async stop(): Promise<RecordedAction[]> {
    if (this.status === 'stopped') return this.actions;
    this.status = 'stopped';
    try {
      await this.cdp?.send('Page.stopScreencast');
    } catch {
      // already gone — fine, we're closing the browser next anyway.
    }
    await this.browser?.close();
    return this.actions;
  }
}

module.exports = { RecordingSession };
