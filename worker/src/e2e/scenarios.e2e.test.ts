// @vitest-environment node
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import { expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  decodeControlFrame,
  encodeControlFrame,
  TAG_ACK,
  TAG_NOTICE,
  TAG_REJECT,
} from '@app/collab/frames';
import { getHistoryYArray, initializeTemplateYDoc, projectDoc } from '@app/collab/schema';
import { commandsFromRevision } from '@app/collab/commands';
import { createDefaultTemplate } from '@app/template/defaultTemplate';
import { TemplateRoomProvider } from '@app/collab/provider';

declare const process: { env: Record<string, string | undefined> };

const url = process.env.SCEN_E2E_URL;
const CONNECT_TIMEOUT_MS = 60_000;
const RUN = Date.now().toString(36);

interface Session {
  ws: WebSocket;
  doc: Y.Doc;
  close: () => void;
}

function connectRoom(room: string): Promise<Session> {
  return new Promise((resolve, reject) => {
    let opened = false;
    const started = Date.now();
    const ws = new WebSocket(`${url}/doc/${room}-${RUN}`);
    ws.binaryType = 'arraybuffer';
    const doc = new Y.Doc();
    const attempt = (): void => {
      if (ws.readyState === WebSocket.OPEN) {
        if (!opened) {
          opened = true;
          resolve({ ws, doc, close: () => ws.close() });
        }
        return;
      }
      if (Date.now() - started > CONNECT_TIMEOUT_MS) {
        reject(new Error('could not connect to wrangler dev'));
        return;
      }
      setTimeout(attempt, 1000);
    };
    ws.addEventListener('open', attempt);
    ws.addEventListener('error', () => {
      if (opened) return;
      if (Date.now() - started > CONNECT_TIMEOUT_MS) reject(new Error('could not connect to wrangler dev'));
    });
    attempt();
  });
}

function sendSyncStep1(ws: WebSocket, doc: Y.Doc): void {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, 0);
  syncProtocol.writeSyncStep1(enc, doc);
  ws.send(encoding.toUint8Array(enc));
}

function sendSyncUpdate(ws: WebSocket, update: Uint8Array): void {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, 0);
  syncProtocol.writeUpdate(enc, update);
  ws.send(encoding.toUint8Array(enc));
}

function bindSyncApplying(ws: WebSocket, doc: Y.Doc): void {
  ws.addEventListener('message', (event) => {
    if (typeof event.data === 'string') return;
    const bytes = new Uint8Array(event.data);
    if (bytes[0] !== 0) return;
    try {
      const replyEncoder = encoding.createEncoder();
      syncProtocol.readSyncMessage(decoding.createDecoder(bytes.subarray(1)), replyEncoder, doc, 'scen-client');
      if (encoding.length(replyEncoder) > 1) {
        const reply = encoding.toUint8Array(replyEncoder);
        const frame = new Uint8Array(1 + reply.length);
        frame[0] = 0;
        frame.set(reply, 1);
        ws.send(frame);
      }
    } catch {
      /* swallow */
    }
  });
}

function sendCommand(ws: WebSocket, commandId: string, command: unknown): void {
  ws.send(encodeControlFrame({ v: 1, commandId, command } as never));
}

function waitForQuiet(ws: WebSocket, quietMs = 800, maxWaitMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => {
      cleanup();
      reject(new Error('timed out waiting for sync traffic'));
    }, maxWaitMs);
    const arm = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        cleanup();
        resolve();
      }, quietMs);
    };
    const onMessage = (): void => arm();
    const cleanup = (): void => {
      clearTimeout(deadline);
      if (timer) clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
    };
    ws.addEventListener('message', onMessage);
    arm();
  });
}

type Payload = {
  type?: string;
  commandId?: string;
  serverSeq?: number;
  errors?: { code: string; message: string }[];
  [key: string]: unknown;
};

interface ControlWait {
  promise: Promise<Payload>;
  seen: Payload[];
  waitersInternal: { pred: (f: Payload) => boolean; resolve: (f: Payload) => void }[];
}

function observeControl(ws: WebSocket): ControlWait {
  const seen: Payload[] = [];
  const waitersInternal: { pred: (f: Payload) => boolean; resolve: (f: Payload) => void }[] = [];
  ws.addEventListener('message', (event) => {
    if (typeof event.data === 'string') return;
    const bytes = new Uint8Array(event.data);
    if (bytes[0] !== TAG_ACK && bytes[0] !== TAG_REJECT && bytes[0] !== TAG_NOTICE) return;
    const decoded = decodeControlFrame(bytes);
    if (!decoded) return;
    const frame = decoded.frame as unknown as Payload;
    seen.push(frame);
    for (let i = waitersInternal.length - 1; i >= 0; i -= 1) {
      if (waitersInternal[i].pred(frame)) {
        waitersInternal[i].resolve(frame);
        waitersInternal.splice(i, 1);
      }
    }
  });
  return {
    seen,
    waitersInternal,
    promise: new Promise<Payload>((resolve) => {
      waitersInternal.push({ pred: () => true, resolve });
    }),
  };
}

function nextControl(control: ControlWait, pred: (f: Payload) => boolean): Promise<Payload> {
  const existing = control.seen.find(pred);
  if (existing) return Promise.resolve(existing);
  return new Promise<Payload>((resolve) => {
    control.waitersInternal.push({ pred, resolve });
  });
}

function isAck(f: Payload, commandId: string): f is Payload & { type: 'ack'; commandId: string; serverSeq: number } {
  return f.type === 'ack' && f.commandId === commandId;
}

function isReject(f: Payload): f is Payload & { type: 'reject'; commandId: string; errors: { code: string; message: string }[] } {
  return f.type === 'reject';
}

const styleColor = (hex: string): unknown => ({
  kind: 'set-style',
  source: 'canvas',
  targetIds: ['hero-heading'],
  scope: 'all',
  stylePatch: { color: hex },
});

const contentText = (text: string): unknown => ({
  kind: 'set-content',
  source: 'canvas',
  targetIds: ['hero-eyebrow'],
  scope: 'all',
  content: { text },
});

const promotedLocalDoc = (): Uint8Array => {
  const local = new Y.Doc();
  initializeTemplateYDoc(local, createDefaultTemplate());
  return Y.encodeStateAsUpdate(local);
};

const replacedDoc = (): unknown => {
  const doc = createDefaultTemplate();
  doc.templateId = 'tpl-replaced-e2e';
  doc.templateName = 'Replaced E2E';
  return doc;
};

it.skipIf(!url)('scenario 1+5: A edits, ack, B joins and converges with history', { timeout: 45_000 }, async () => {
  const a = await connectRoom('scen-conv');
  bindSyncApplying(a.ws, a.doc);
  sendSyncStep1(a.ws, a.doc);
  sendSyncUpdate(a.ws, promotedLocalDoc());
  const aCtl = observeControl(a.ws);
  sendCommand(a.ws, 'scen-conv-a1', styleColor('#112233'));
  const ackA = await nextControl(aCtl, (f) => isAck(f, 'scen-conv-a1'));
  expect(ackA.serverSeq).toBe(1);

  const b = await connectRoom('scen-conv');
  bindSyncApplying(b.ws, b.doc);
  sendSyncStep1(b.ws, b.doc);
  await waitForQuiet(b.ws);
  expect(JSON.stringify(projectDoc(b.doc).elements['hero-heading']?.style)).toContain('#112233');
  expect(projectDoc(a.doc).elements).toEqual(projectDoc(b.doc).elements);
  expect(getHistoryYArray(b.doc).length).toBe(1);
  a.close();
  b.close();
});

it.skipIf(!url)('scenario 2: invalid command rejected sender-only, peers see nothing', { timeout: 45_000 }, async () => {
  const a = await connectRoom('scen-invalid');
  bindSyncApplying(a.ws, a.doc);
  sendSyncStep1(a.ws, a.doc);
  sendSyncUpdate(a.ws, promotedLocalDoc());
  await waitForQuiet(a.ws);
  const aCtl = observeControl(a.ws);
  const b = await connectRoom('scen-invalid');
  bindSyncApplying(b.ws, b.doc);
  sendSyncStep1(b.ws, b.doc);
  await waitForQuiet(b.ws);
  const bCtl = observeControl(b.ws);

  sendCommand(a.ws, 'scen-invalid-bad', {
    kind: 'set-style',
    source: 'canvas',
    targetIds: ['ghost-element'],
    scope: 'all',
    stylePatch: { color: '#ff0000' },
  });
  const rej = await nextControl(aCtl, (f) => isReject(f));
  expect(rej.commandId).toBe('scen-invalid-bad');
  expect(rej.errors).toEqual([{ code: 'unknown-element', message: expect.any(String) }]);
  expect(bCtl.seen).toHaveLength(0);
  expect(JSON.stringify(projectDoc(b.doc).elements)).not.toContain('#ff0000');
  expect(JSON.stringify(projectDoc(a.doc).elements)).not.toContain('#ff0000');
  a.close();
  b.close();
});

it.skipIf(!url)('scenario 3: disjoint concurrent edits both acked and converge', { timeout: 45_000 }, async () => {
  const a = await connectRoom('scen-disjoint');
  bindSyncApplying(a.ws, a.doc);
  sendSyncStep1(a.ws, a.doc);
  sendSyncUpdate(a.ws, promotedLocalDoc());
  await waitForQuiet(a.ws);
  const b = await connectRoom('scen-disjoint');
  bindSyncApplying(b.ws, b.doc);
  sendSyncStep1(b.ws, b.doc);
  await waitForQuiet(b.ws);
  const aCtl = observeControl(a.ws);
  const bCtl = observeControl(b.ws);

  sendCommand(a.ws, 'scen-dis-a1', styleColor('#112233'));
  sendCommand(b.ws, 'scen-dis-b1', contentText('From B'));
  const ackA = await nextControl(aCtl, (f) => isAck(f, 'scen-dis-a1'));
  const ackB = await nextControl(bCtl, (f) => isAck(f, 'scen-dis-b1'));
  expect(ackA.serverSeq).toBe(1);
  expect(ackB.serverSeq).toBe(2);

  await waitForQuiet(a.ws);
  await waitForQuiet(b.ws);
  expect(projectDoc(a.doc).elements).toEqual(projectDoc(b.doc).elements);
  expect(JSON.stringify(projectDoc(a.doc).elements['hero-heading']?.style)).toContain('#112233');
  expect(JSON.stringify(projectDoc(a.doc).elements['hero-eyebrow']?.content)).toContain('From B');
  a.close();
  b.close();
});

it.skipIf(!url)('scenario 4+7: provider dispatch onto removed element rejects, rollbacks, converges', { timeout: 45_000 }, async () => {
  const a = await connectRoom('scen-reject');
  bindSyncApplying(a.ws, a.doc);
  sendSyncStep1(a.ws, a.doc);
  sendSyncUpdate(a.ws, promotedLocalDoc());
  await waitForQuiet(a.ws);

  const aCtl = observeControl(a.ws);
  sendCommand(a.ws, 'scen-rej-a1', {
    kind: 'remove',
    source: 'canvas',
    targetIds: ['hero-eyebrow'],
    scope: 'all',
  } as never);
  await nextControl(aCtl, (f) => isAck(f, 'scen-rej-a1'));
  await waitForQuiet(a.ws);
  expect(projectDoc(a.doc).elements['hero-eyebrow']).toBeUndefined();

  const providerDoc = new Y.Doc();
  const bProvider = new TemplateRoomProvider('127.0.0.1:8787', `scen-reject-${RUN}`, providerDoc, { connect: true });
  let rejected = false;
  const emits: string[] = [];
  bProvider.on('room-reject', () => emits.push('reject'));
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), 10_000);
    bProvider.on('synced', (state: boolean) => {
      if (state && !rejected) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  expect(projectDoc(providerDoc).elements['hero-eyebrow']).toBeUndefined();

  bProvider.dispatch({
    kind: 'set-content',
    source: 'canvas',
    targetIds: ['hero-eyebrow'],
    scope: 'all',
    contentPatch: { text: 'zombie' },
  } as never);
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), 10_000);
    bProvider.on('room-reject', () => {
      rejected = true;
      clearTimeout(timer);
      resolve();
    });
  });
  expect(emits).toContain('reject');
  expect(JSON.stringify(projectDoc(providerDoc).elements)).not.toContain('zombie');
  bProvider.destroy();
  a.close();
});

it.skipIf(!url)('scenario 8: whole-doc replace notices every client and clears history', { timeout: 45_000 }, async () => {
  const a = await connectRoom('scen-replace');
  bindSyncApplying(a.ws, a.doc);
  sendSyncStep1(a.ws, a.doc);
  sendSyncUpdate(a.ws, promotedLocalDoc());
  const aCtl = observeControl(a.ws);
  sendCommand(a.ws, 'scen-rep-a1', styleColor('#112233'));
  await nextControl(aCtl, (f) => isAck(f, 'scen-rep-a1'));
  await waitForQuiet(a.ws);

  const b = await connectRoom('scen-replace');
  bindSyncApplying(b.ws, b.doc);
  sendSyncStep1(b.ws, b.doc);
  await waitForQuiet(b.ws);
  expect(getHistoryYArray(a.doc).length).toBe(1);
  expect(getHistoryYArray(b.doc).length).toBe(1);
  const bCtl = observeControl(b.ws);

  sendCommand(a.ws, 'scen-rep-a2', {
    kind: 'replace-doc',
    source: 'code',
    targetIds: [],
    scope: 'all',
    reason: 'import',
    doc: replacedDoc(),
    by: 'E2E Tester',
  });
  const ackA = await nextControl(aCtl, (f) => isAck(f, 'scen-rep-a2'));
  expect(ackA.serverSeq).toBe(2);
  const noticeA = await nextControl(aCtl, (f) => f.type === 'notice');
  const noticeB = await nextControl(bCtl, (f) => f.type === 'notice');
  expect(noticeA).toMatchObject({ event: 'room-replaced', reason: 'import', by: 'E2E Tester' });
  expect(noticeB).toMatchObject({ event: 'room-replaced', reason: 'import', by: 'E2E Tester' });

  await waitForQuiet(a.ws);
  await waitForQuiet(b.ws);
  expect(projectDoc(a.doc).templateId).toBe('tpl-replaced-e2e');
  expect(projectDoc(b.doc).templateId).toBe('tpl-replaced-e2e');
  expect(projectDoc(a.doc).elements).toEqual(projectDoc(b.doc).elements);
  expect(getHistoryYArray(a.doc).length).toBe(0);
  expect(getHistoryYArray(b.doc).length).toBe(0);
  a.close();
  b.close();
});

it.skipIf(!url)('scenario 9: duplicate commandId applied exactly once', { timeout: 45_000 }, async () => {
  const a = await connectRoom('scen-dedupe');
  bindSyncApplying(a.ws, a.doc);
  sendSyncStep1(a.ws, a.doc);
  sendSyncUpdate(a.ws, promotedLocalDoc());
  await waitForQuiet(a.ws);
  const aCtl = observeControl(a.ws);

  sendCommand(a.ws, 'scen-dup-1', styleColor('#112233'));
  const first = await nextControl(aCtl, (f) => isAck(f, 'scen-dup-1'));
  sendCommand(a.ws, 'scen-dup-1', styleColor('#112233'));
  const second = await nextControl(aCtl, (f) => isAck(f, 'scen-dup-1') && f.serverSeq === first.serverSeq);
  await waitForQuiet(a.ws);
  expect(second.serverSeq).toBe(first.serverSeq);
  expect(getHistoryYArray(a.doc).length).toBe(1);
  a.close();
});

it.skipIf(!url)('scenario 6: reconnect delta-syncs missed changes without commands', { timeout: 45_000 }, async () => {
  const a = await connectRoom('scen-reconnect');
  bindSyncApplying(a.ws, a.doc);
  sendSyncStep1(a.ws, a.doc);
  sendSyncUpdate(a.ws, promotedLocalDoc());
  await waitForQuiet(a.ws);
  a.close();

  const b = await connectRoom('scen-reconnect');
  bindSyncApplying(b.ws, b.doc);
  sendSyncStep1(b.ws, b.doc);
  await waitForQuiet(b.ws);
  sendCommand(b.ws, 'scen-rec-b1', styleColor('#332211'));
  await waitForQuiet(b.ws);
  b.close();

  const a2 = await connectRoom('scen-reconnect');
  bindSyncApplying(a2.ws, a2.doc);
  sendSyncStep1(a2.ws, a2.doc);
  await waitForQuiet(a2.ws);
  expect(JSON.stringify(projectDoc(a2.doc).elements['hero-heading']?.style)).toContain('#332211');
  a2.close();
});

it.skipIf(!url)('scenario 10: restore round-trips through the command gate', { timeout: 45_000 }, async () => {
  const a = await connectRoom('scen-restore');
  bindSyncApplying(a.ws, a.doc);
  sendSyncStep1(a.ws, a.doc);
  sendSyncUpdate(a.ws, promotedLocalDoc());
  const aCtl = observeControl(a.ws);
  sendCommand(a.ws, 'scen-rst-a1', styleColor('#445566'));
  expect((await nextControl(aCtl, (f) => isAck(f, 'scen-rst-a1'))).serverSeq).toBe(1);
  sendCommand(a.ws, 'scen-rst-a2', styleColor('#112233'));
  expect((await nextControl(aCtl, (f) => isAck(f, 'scen-rst-a2'))).serverSeq).toBe(2);
  await waitForQuiet(a.ws);

  const b = await connectRoom('scen-restore');
  bindSyncApplying(b.ws, b.doc);
  sendSyncStep1(b.ws, b.doc);
  await waitForQuiet(b.ws);
  expect(getHistoryYArray(b.doc).length).toBe(2);

  const entry = getHistoryYArray(b.doc).toArray()[1];
  const inverse = commandsFromRevision(projectDoc(b.doc), entry);
  expect(inverse).toHaveLength(1);
  const bCtl = observeControl(b.ws);
  sendCommand(b.ws, 'scen-rst-b1', inverse[0]);
  expect((await nextControl(bCtl, (f) => isAck(f, 'scen-rst-b1'))).serverSeq).toBe(3);

  await waitForQuiet(a.ws);
  await waitForQuiet(b.ws);
  expect(JSON.stringify(projectDoc(a.doc).elements['hero-heading']?.style)).toContain('#445566');
  expect(JSON.stringify(projectDoc(a.doc).elements['hero-heading']?.style)).not.toContain('#112233');
  expect(projectDoc(a.doc).elements).toEqual(projectDoc(b.doc).elements);

  const historyA = getHistoryYArray(a.doc).toArray();
  const historyB = getHistoryYArray(b.doc).toArray();
  expect(historyA.map((item) => item.serverSeq)).toEqual([1, 2, 3]);
  expect(historyB.map((item) => item.serverSeq)).toEqual([1, 2, 3]);
  expect(historyB[2]).toMatchObject({ source: 'restore', commandId: 'scen-rst-b1' });
  a.close();
  b.close();
});

it.skipIf(!url)('scenario 11: restoring an unset style value deletes it across peers', { timeout: 45_000 }, async () => {
  const a = await connectRoom('scen-restore-unset');
  bindSyncApplying(a.ws, a.doc);
  sendSyncStep1(a.ws, a.doc);
  sendSyncUpdate(a.ws, promotedLocalDoc());
  const aCtl = observeControl(a.ws);
  sendCommand(a.ws, 'scen-rst-u1', styleColor('#778899'));
  expect((await nextControl(aCtl, (f) => isAck(f, 'scen-rst-u1'))).serverSeq).toBe(1);
  await waitForQuiet(a.ws);

  const b = await connectRoom('scen-restore-unset');
  bindSyncApplying(b.ws, b.doc);
  sendSyncStep1(b.ws, b.doc);
  await waitForQuiet(b.ws);
  expect(getHistoryYArray(b.doc).length).toBe(1);

  const entry = getHistoryYArray(b.doc).toArray()[0];
  expect(entry.before.style).toEqual({ color: null });
  const inverse = commandsFromRevision(projectDoc(b.doc), entry);
  expect(inverse).toHaveLength(1);
  expect(inverse[0]).toMatchObject({ stylePatch: { color: null } });

  const bCtl = observeControl(b.ws);
  sendCommand(b.ws, 'scen-rst-u2', inverse[0]);
  expect((await nextControl(bCtl, (f) => isAck(f, 'scen-rst-u2'))).serverSeq).toBe(2);

  await waitForQuiet(a.ws);
  await waitForQuiet(b.ws);
  const styleA = projectDoc(a.doc).elements['hero-heading']?.style;
  const styleB = projectDoc(b.doc).elements['hero-heading']?.style;
  expect(JSON.stringify(styleA)).not.toContain('#778899');
  expect('color' in (styleA?.base ?? {})).toBe(false);
  expect(styleA).toEqual(styleB);

  const historyB = getHistoryYArray(b.doc).toArray();
  expect(historyB.map((item) => item.serverSeq)).toEqual([1, 2]);
  expect(historyB[1]).toMatchObject({ source: 'restore', commandId: 'scen-rst-u2' });
  a.close();
  b.close();
});
