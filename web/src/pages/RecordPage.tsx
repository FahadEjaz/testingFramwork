import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveRecording, startRecording, stopRecording } from '../api';
import { useAuth } from '../auth/AuthContext';
import { formatLocator } from '../lib/runStatus';
import type { RecordedAction } from '../types';
import styles from './RecordPage.module.css';

type Step = 'url' | 'recording' | 'preview';

const SPECIAL_KEYS: Record<string, number> = {
  Enter: 13,
  Tab: 9,
  Backspace: 8,
  Escape: 27,
  ArrowLeft: 37,
  ArrowRight: 39,
};

export function RecordPage() {
  const { credentials } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('url');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 1280, height: 800 });
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  async function handleStart(event: FormEvent) {
    event.preventDefault();
    if (!credentials) return;
    setError(null);
    setStarting(true);
    try {
      const { sessionId: id, wsPath } = await startRecording(credentials, url);
      setSessionId(id);
      connectSocket(wsPath);
      setStep('recording');
    } catch {
      setError('Could not start a recording session — check the URL and try again.');
    } finally {
      setStarting(false);
    }
  }

  function connectSocket(wsPath: string) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}${wsPath}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type !== 'frame') return;
      setFrameSize({ width: message.width, height: message.height });
      drawFrame(message.data, message.width, message.height);
    };

    ws.onopen = () => {
      hiddenInputRef.current?.focus();
    };
  }

  function drawFrame(base64Data: string, width: number, height: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
    };
    img.src = `data:image/jpeg;base64,${base64Data}`;
  }

  function sendMouse(kind: 'mousePressed' | 'mouseReleased', clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    const ws = wsRef.current;
    if (!canvas || !ws || ws.readyState !== WebSocket.OPEN) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * frameSize.width;
    const y = ((clientY - rect.top) / rect.height) * frameSize.height;
    ws.send(JSON.stringify({ kind: 'mouse', type: kind, x, y }));
  }

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    hiddenInputRef.current?.focus();
    sendMouse('mousePressed', e.clientX, e.clientY);
  }

  function handleCanvasMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    sendMouse('mouseReleased', e.clientX, e.clientY);
  }

  function handleHiddenKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const vk = SPECIAL_KEYS[e.key];
    if (!vk) return;
    e.preventDefault();
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ kind: 'key', type: 'keyDown', key: e.key, code: e.key, windowsVirtualKeyCode: vk }));
    ws.send(JSON.stringify({ kind: 'key', type: 'keyUp', key: e.key, code: e.key, windowsVirtualKeyCode: vk }));
  }

  function handleHiddenInput(e: React.FormEvent<HTMLInputElement>) {
    const native = e.nativeEvent as InputEvent;
    const ws = wsRef.current;
    const target = e.target as HTMLInputElement;
    if (native.data && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ kind: 'text', text: native.data }));
    }
    target.value = '';
  }

  async function handleStop() {
    if (!credentials || !sessionId) return;
    const { actions: recorded } = await stopRecording(credentials, sessionId);
    setActions(recorded);
    setStep('preview');
    wsRef.current?.close();
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!credentials || !sessionId || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const test = await saveRecording(credentials, sessionId, name.trim());
      navigate(`/tests/${test.id}`);
    } catch {
      setError('Could not save this recording — try a different name.');
    } finally {
      setSaving(false);
    }
  }

  if (step === 'url') {
    return (
      <div>
        <h1>New Recording</h1>
        <form className={styles.urlForm} onSubmit={handleStart}>
          <div className={styles.field}>
            <label htmlFor="record-url">URL to record</label>
            <input
              id="record-url"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
              required
            />
          </div>
          <button className={styles.startButton} type="submit" disabled={starting}>
            {starting ? 'Starting…' : 'Start Recording'}
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </form>
      </div>
    );
  }

  if (step === 'recording') {
    return (
      <div>
        <div className={styles.recordingHeader}>
          <div>
            <h1>Recording</h1>
            <div className={styles.recordingUrl}>{url}</div>
          </div>
          <button className={styles.stopButton} onClick={handleStop} type="button">
            ■ Stop Recording
          </button>
        </div>

        <div className={styles.canvasWrap}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            width={frameSize.width}
            height={frameSize.height}
            onMouseDown={handleCanvasMouseDown}
            onMouseUp={handleCanvasMouseUp}
          />
        </div>
        <input
          ref={hiddenInputRef}
          className={styles.hiddenInput}
          onKeyDown={handleHiddenKeyDown}
          onInput={handleHiddenInput}
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>
    );
  }

  return (
    <div>
      <h1>Review recording</h1>
      <div className={styles.preview}>
        <div className={styles.previewList}>
          {actions.length === 0 && <div className={styles.previewRow}>No actions were recorded.</div>}
          {actions.map((action, i) => (
            <div className={styles.previewRow} key={i}>
              <span className={styles.previewType}>{action.type}</span> {formatLocator(action.candidates[0])}
              {action.type !== 'click' ? ` → "${action.value}"` : ''}
            </div>
          ))}
        </div>

        <form className={styles.saveRow} onSubmit={handleSave}>
          <input
            placeholder="Name this test"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
          <button className={styles.saveButton} type="submit" disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save Test'}
          </button>
        </form>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}
