import type { Connection, WSMessage } from 'partyserver';
import { YServer } from 'y-partyserver';
import * as Y from 'yjs';
import { TRANSACTION_ORIGIN } from '@app/collab/schema';

export const SNAPSHOT_KEY = 'snapshot';

function toBytes(message: WSMessage): Uint8Array | null {
  if (typeof message === 'string') return null;
  if (message instanceof Uint8Array) return message;
  if (message instanceof ArrayBuffer) return new Uint8Array(message);
  const view = message as { buffer: ArrayBufferLike; byteOffset: number; byteLength: number };
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

export class TemplateDocDO extends YServer {
  static options = { hibernate: true };

  override onRequest(_request: Request): Response {
    return new Response(
      JSON.stringify({ ok: true, transactionOrigin: TRANSACTION_ORIGIN }),
      { headers: { 'content-type': 'application/json' } },
    );
  }

  async onLoad(): Promise<Y.Doc | void> {
    const snapshot = await this.ctx.storage.get<Uint8Array>(SNAPSHOT_KEY);
    if (!snapshot) return;
    const doc = new Y.Doc();
    Y.applyUpdate(doc, snapshot);
    return doc;
  }

  async onSave(): Promise<void> {
    const snapshot = Y.encodeStateAsUpdate(this.document);
    await this.ctx.storage.put(SNAPSHOT_KEY, snapshot);
  }

  override handleMessage(connection: Connection, message: WSMessage): void {
    const bytes = toBytes(message);
    if (bytes && bytes.length > 0 && bytes[0] >= 100) {
      // Stage 0 spike: echo a tag-101 ack so the client can verify the custom
      // tag round-trip in both directions. Replaced by the authoritative doc
      // loop in Stage 2.
      const payload = new TextDecoder().decode(bytes.slice(1));
      const reply = JSON.stringify({ v: 1, type: 'spike-ack', echo: payload });
      const body = new TextEncoder().encode(reply);
      const frame = new Uint8Array(1 + body.length);
      frame[0] = 101;
      frame.set(body, 1);
      connection.send(frame);
      return;
    }
    super.handleMessage(connection, message);
  }
}
