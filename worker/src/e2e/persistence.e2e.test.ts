import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import { expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  decodeControlFrame,
  encodeControlFrame,
  TAG_ACK,
  TAG_REJECT,
} from '@app/collab/frames';

declare const process: { env: Record<string, string | undefined> };
import { getHistoryYArray, initializeTemplateYDoc, projectDoc } from '@app/collab/schema';
import { createDefaultTemplate } from '@app/template/defaultTemplate';

const url = process.env.PERSIST_E2E_URL;
const phase = process.env.PERSIST_E2E_PHASE ?? 'write';
const ROOM_COMMAND_ID = 'persist-e2e-cmd-1';
const CONNECT_TIMEOUT_MS = 60_000;

interface Session {
  ws: WebSocket;
  doc: Y.Doc;
  close: () => void;
}

function connectRoom(): Promise<Session> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const attempt = (): void => {
      const ws = new WebSocket(url!);
      ws.binaryType = 'arraybuffer';
      const doc = new Y.Doc();
      let opened = false;
      ws.addEventListener('open', () => {
        opened = true;
        resolve({
          ws,
          doc,
          close: () => {
            try {
              ws.close();
            } catch {
              /* already closed */
            }
          },
        });
      });
      ws.addEventListener('error', () => {
        if (opened) return;
        try {
          ws.close();
        } catch {
          /* never opened */
        }
        if (Date.now() - started > CONNECT_TIMEOUT_MS) {
          reject(new Error('could not connect to wrangler dev'));
          return;
        }
        setTimeout(attempt, 1000);
      });
    };
    attempt();
  });
}

function sendSyncStep1(ws: WebSocket, doc: Y.Doc): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeSyncStep1(encoder, doc);
  ws.send(encoding.toUint8Array(encoder));
}

function sendSyncUpdate(ws: WebSocket, update: Uint8Array): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeUpdate(encoder, update);
  ws.send(encoding.toUint8Array(encoder));
}

function bindSyncApplying(ws: WebSocket, doc: Y.Doc): void {
  ws.addEventListener('message', (event) => {
    if (typeof event.data === 'string') return;
    const bytes = new Uint8Array(event.data);
    if (bytes[0] !== 0) return;
    try {
      const replyEncoder = encoding.createEncoder();
      syncProtocol.readSyncMessage(decoding.createDecoder(bytes.subarray(1)), replyEncoder, doc, 'e2e-client');
      if (encoding.length(replyEncoder) > 1) {
        const reply = encoding.toUint8Array(replyEncoder);
        const frame = new Uint8Array(1 + reply.length);
        frame[0] = 0;
        frame.set(reply, 1);
        ws.send(frame);
      }
    } catch {
      return;
    }
  });
}

function sendCommand(ws: WebSocket, commandId: string): void {
  ws.send(
    encodeControlFrame({
      v: 1,
      commandId,
      command: {
        kind: 'set-style',
        source: 'canvas',
        targetIds: ['hero-heading'],
        scope: 'all',
        stylePatch: { color: '#112233' },
      },
    }),
  );
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

function expectAck(ws: WebSocket, commandId: string, serverSeq: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeEventListener('message', onMessage);
      reject(new Error(`no ack for ${commandId}`));
    }, 10_000);
    const onMessage = (event: MessageEvent): void => {
      if (typeof event.data === 'string') return;
      const bytes = new Uint8Array(event.data);
      if (bytes[0] !== TAG_ACK && bytes[0] !== TAG_REJECT) return;
      const decoded = decodeControlFrame(bytes);
      if (
        !decoded ||
        !('commandId' in decoded.frame) ||
        decoded.frame.commandId !== commandId
      )
        return;
      const frame = decoded.frame;
      clearTimeout(timeout);
      ws.removeEventListener('message', onMessage);
      if (bytes[0] === TAG_REJECT) {
        reject(new Error(`rejected: ${JSON.stringify(frame, null, 2)}`));
        return;
      }
      try {
        expect(frame).toEqual({ v: 1, type: 'ack', commandId, serverSeq });
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    ws.addEventListener('message', onMessage);
  });
}

it.skipIf(!url)(`persistence e2e: ${phase} phase`, { timeout: 45_000 }, async () => {
  const { ws, doc, close } = await connectRoom();
  bindSyncApplying(ws, doc);
  try {
    if (phase === 'write') {
      const local = new Y.Doc();
      initializeTemplateYDoc(local, createDefaultTemplate());
      sendSyncStep1(ws, doc);
      sendSyncUpdate(ws, Y.encodeStateAsUpdate(local));
      const acked = expectAck(ws, ROOM_COMMAND_ID, 1);
      sendCommand(ws, ROOM_COMMAND_ID);
      await acked;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } else {
      sendSyncStep1(ws, doc);
      await waitForQuiet(ws);
      const projection = projectDoc(doc);
      expect(JSON.stringify(projection)).toContain('#112233');
      expect(getHistoryYArray(doc).length).toBe(1);
      const acked = expectAck(ws, ROOM_COMMAND_ID, 1);
      sendCommand(ws, ROOM_COMMAND_ID);
      await acked;
      expect(getHistoryYArray(doc).length).toBe(1);
    }
  } finally {
    close();
  }
});
