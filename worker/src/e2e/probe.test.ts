import { describe, it, expect } from 'vitest';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { initializeTemplateYDoc } from '@app/collab/schema';
import { createDefaultTemplate } from '@app/template/defaultTemplate';
import { decodeControlFrame, encodeControlFrame, TAG_ACK, TAG_REJECT } from '@app/collab/frames';

declare const process: { env: Record<string, string | undefined> };

const url = process.env.PROBE_URL;

function connectRoom(room: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${url}/doc/${room}`);
    ws.binaryType = 'arraybuffer';
    const attempt = () => {
      if (ws.readyState === WebSocket.OPEN) {
        resolve(ws);
        return;
      }
      setTimeout(attempt, 1000);
    };
    ws.addEventListener('open', attempt);
    ws.addEventListener('error', () => {
      setTimeout(() => {
        reject(new Error('connect failed'));
      }, 500);
    });
    setTimeout(attempt, 1000);
  });
}

function sendSyncStep1(ws: WebSocket, doc: Y.Doc): void {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, 0);
  syncProtocol.writeSyncStep1(enc, doc);
  ws.send(encoding.toUint8Array(enc));
}

function sendPromotion(ws: WebSocket, doc: Y.Doc): void {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, 0);
  syncProtocol.writeUpdate(enc, Y.encodeStateAsUpdate(doc));
  ws.send(encoding.toUint8Array(enc));
}

describe('probe', () => {
  it.skipIf(!url)('delivers control frames to sender', { timeout: 30_000 }, async () => {
    const ws = await connectRoom('probe-room-x');
    const local = new Y.Doc();
    initializeTemplateYDoc(local, createDefaultTemplate());
    let promoted = false;
    const received: string[] = [];

    ws.addEventListener('message', (event) => {
      const bytes = new Uint8Array(event.data as ArrayBuffer);
      const tag = bytes[0];
      if (tag === 0) {
        try {
          const replyEnc = encoding.createEncoder();
          syncProtocol.readSyncMessage(decoding.createDecoder(bytes.slice(1)), replyEnc, local, 'probe');
          received.push('sync');
          if (!promoted) {
            promoted = true;
            setTimeout(() => {
              sendPromotion(ws, local);
              setTimeout(() => {
                ws.send(
                  encodeControlFrame({
                    v: 1,
                    commandId: 'probe-cmd-x',
                    command: {
                      kind: 'set-style',
                      source: 'canvas',
                      targetIds: ['hero-heading'],
                      scope: 'all',
                      baseRevision: 0,
                      stylePatch: { color: '#112233' },
                    },
                  }),
                );
                received.push('cmd-sent');
              }, 300);
            }, 100);
          }
        } catch {
          received.push('sync-error');
        }
      } else if (tag === TAG_ACK || tag === TAG_REJECT) {
        const decoded = decodeControlFrame(bytes);
        if (!decoded) return;
        const frame = decoded.frame;
        received.push(`control:${JSON.stringify(frame)}`);
        if (tag === TAG_ACK && 'commandId' in frame) {
          expect(frame).toMatchObject({ commandId: 'probe-cmd-x', serverSeq: 1 });
          ws.close();
        }
      } else {
        received.push(`tag:${tag}`);
      }
    });

    sendSyncStep1(ws, local);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    expect(received.some((r) => r.includes('"type":"ack"'))).toBe(true);
  });
});
