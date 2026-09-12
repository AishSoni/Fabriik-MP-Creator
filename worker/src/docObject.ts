import type { Connection, ConnectionContext, WSMessage } from 'partyserver';
import { YServer } from 'y-partyserver';
import * as Y from 'yjs';
import { TRANSACTION_ORIGIN } from '@app/collab/schema';
import { ROOM_FULL_CLOSE_CODE, TAG_COMMAND, decodeControlEnvelope, encodeControlFrame } from '@app/collab/frames';
import { decideCommandFrame, dedupeFromEntries, noticeForCommand, parseDocLoopMeta, processCommand, serializeDocLoopMeta } from './docLoop';
import { createCommandRateLimiter } from './rateLimit';
import { exceedsFrameSizeLimit } from './frameLimit';
import { isRoomFull, parseMaxRoomConnections } from './roomLimits';
import { ROOM_TTL_MS, shouldPruneRoom } from './roomTtl';
import { trimHistory } from './historyTrim';
import type { DocLoopMeta, DocLoopState } from './docLoop';
import type { Env } from './env';

export const SNAPSHOT_KEY = 'snapshot';
export const META_KEY = 'meta';
export const LAST_ACTIVE_KEY = 'lastActiveAt';
export const TOMBSTONE_KEY = 'prunedAt';

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
  #loadedMeta: DocLoopMeta | null = null;
  #rateLimiter = createCommandRateLimiter();
  #maxConnections: number;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.#maxConnections = parseMaxRoomConnections(env.MAX_ROOM_CONNECTIONS);
    (this.document as unknown as {
      on(name: 'error', f: (err: unknown) => void): void;
    }).on('error', (err: unknown) => {
      console.error('[doc] document error event:', err instanceof Error ? err.stack : String(err));
    });
  }

  #ensureState(): DocLoopState {
    this.#state ??= {
      ydoc: this.document,
      serverSeq: this.#loadedMeta?.serverSeq ?? 0,
      seen: dedupeFromEntries(this.#loadedMeta?.dedupe ?? []),
    };
    return this.#state;
  }

  override onRequest(_request: Request): Response {
    return new Response(
      JSON.stringify({ ok: true, transactionOrigin: TRANSACTION_ORIGIN }),
      { headers: { 'content-type': 'application/json' } },
    );
  }

  override onConnect(connection: Connection, ctx: ConnectionContext): void | Promise<void> {
    const count = [...this.getConnections()].length;
    if (isRoomFull(count, this.#maxConnections)) {
      connection.send(encodeControlFrame({ v: 1, type: 'notice', event: 'room-full' }));
      connection.close(ROOM_FULL_CLOSE_CODE, 'room full');
      return;
    }
    return super.onConnect(connection, ctx);
  }

  async onLoad(): Promise<Y.Doc | void> {
    const [snapshot, meta] = await Promise.all([
      this.ctx.storage.get<Uint8Array>(SNAPSHOT_KEY),
      this.ctx.storage.get<string>(META_KEY),
    ]);
    if (typeof meta === 'string') {
      try {
        this.#loadedMeta = parseDocLoopMeta(JSON.parse(meta));
      } catch {
        this.#loadedMeta = null;
      }
    }
    if (!snapshot) return;
    const doc = new Y.Doc();
    Y.applyUpdate(doc, snapshot);
    return doc;
  }

  async onSave(): Promise<void> {
    const snapshot = Y.encodeStateAsUpdate(this.document);
    await this.ctx.storage.put(SNAPSHOT_KEY, snapshot);
    trimHistory(this.document);
    if (this.#state) {
      await this.ctx.storage.put(META_KEY, serializeDocLoopMeta(this.#state));
    }
    const now = Date.now();
    await this.ctx.storage.put(LAST_ACTIVE_KEY, now);
    await this.ctx.storage.delete(TOMBSTONE_KEY);
    await this.ctx.storage.setAlarm(now + ROOM_TTL_MS);
  }

  override async onAlarm(): Promise<void> {
    const now = Date.now();
    const lastActiveAt = await this.ctx.storage.get<number>(LAST_ACTIVE_KEY);
    const connectionCount = [...this.getConnections()].length;
    if (shouldPruneRoom({ lastActiveAt, now, connectionCount })) {
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.put(TOMBSTONE_KEY, now);
      console.warn('[doc] pruned idle room');
      return;
    }
    await this.ctx.storage.setAlarm(now + ROOM_TTL_MS);
  }

  override handleMessage(connection: Connection, message: WSMessage): void {
    const bytes = toBytes(message);
    if (bytes && exceedsFrameSizeLimit(bytes)) {
      console.warn('[doc] dropped oversized frame', bytes.length);
      return;
    }
    if (bytes && bytes.length > 0 && bytes[0] >= 100) {
      if (bytes[0] === TAG_COMMAND) {
        if (!this.#rateLimiter.allow(connection.id)) {
          console.warn('[doc] dropped rate-limited command frame');
          return;
        }
        const envelope = decodeControlEnvelope(bytes);
        const decision = decideCommandFrame(envelope?.data ?? null);
        if (decision.action === 'drop') {
          console.warn('[doc] dropped malformed command frame');
          return;
        }
        const response = processCommand(this.#ensureState(), decision, (command) => {
          const notice = noticeForCommand(command);
          if (!notice) return;
          const bytes = encodeControlFrame(notice);
          for (const peer of this.getConnections()) {
            peer.send(bytes);
          }
        });
        if (response) {
          connection.send(encodeControlFrame(response));
        }
        return;
      }
      return;
    }
    super.handleMessage(connection, message);
  }

  override onClose(connection: Connection, code: number, reason: string, wasClean: boolean): void {
    this.#rateLimiter.forget(connection.id);
    super.onClose(connection, code, reason, wasClean);
  }
}
