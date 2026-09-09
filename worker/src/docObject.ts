import type { Connection, WSMessage } from 'partyserver';
import { YServer } from 'y-partyserver';
import * as Y from 'yjs';
import { TRANSACTION_ORIGIN } from '@app/collab/schema';
import { TAG_COMMAND, decodeControlEnvelope, encodeControlFrame } from '@app/collab/frames';
import { createDedupeSet, decideCommandFrame, processCommand } from './docLoop';
import type { DocLoopState } from './docLoop';

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

  #state: DocLoopState | null = null;

  #ensureState(): DocLoopState {
    this.#state ??= { ydoc: this.document, serverSeq: 0, seen: createDedupeSet() };
    return this.#state;
  }

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
      if (bytes[0] === TAG_COMMAND) {
        const envelope = decodeControlEnvelope(bytes);
        const decision = decideCommandFrame(envelope?.data ?? null);
        if (decision.action === 'drop') {
          console.warn('[doc] dropped malformed command frame');
          return;
        }
        const response = processCommand(this.#ensureState(), decision);
        if (response) connection.send(encodeControlFrame(response));
        return;
      }
      return;
    }
    super.handleMessage(connection, message);
  }
}
