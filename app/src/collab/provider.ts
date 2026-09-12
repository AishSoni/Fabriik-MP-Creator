import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import YPartyserverProvider, {
  type WebsocketProvider,
} from 'y-partyserver/provider';
import { applyCommandToYDoc } from './commandAdapter';
import { TRANSACTION_ORIGIN } from './schema';
import { newCommandId } from './ids';
import {
  TAG_ACK,
  TAG_COMMAND,
  TAG_NOTICE,
  TAG_REJECT,
  ackFrameSchema,
  commandFrameSchema,
  decodeControlFrame,
  encodeControlFrame,
  noticeFrameSchema,
  rejectFrameSchema,
  type CommandFrame,
  type ControlFramePayload,
} from './frames';
import type { EditCommand } from '../types/commands';

/** Wire frame as built locally from hand-typed commands (cast at the encode boundary). */
type OutgoingFrame = { v: 1; commandId: string; command: EditCommand };

/** Transaction origin for room-optimistic applies (client gate passed, server pending). */
export const OPTIMISTIC_ORIGIN = 'room-optimistic';

export interface RoomDispatchEvents {
  ack: { commandId: string; serverSeq: number };
  reject: { commandId: string; errors: { code: string; message: string }[] };
  notice: { event: string; reason?: string; by?: string };
}

type ControlHandler = NonNullable<WebsocketProvider['messageHandlers'][number]>;

function readJsonTail(decoder: decoding.Decoder): unknown {
  const bytes = decoding.readTailAsUint8Array(decoder);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export interface TemplateRoomProviderOptions {
  connect?: boolean;
  uploadLocal?: boolean;
  party?: string;
}

export interface RoomDispatchOptions {
  /**
   * When false the frame is sent without a local apply; the projection waits
   * for the authoritative broadcast (used by whole-doc replace commands,
   * which clear history and must not be undone by client rollback).
   */
  optimistic?: boolean;
}

export class TemplateRoomProvider extends YPartyserverProvider {
  readonly pending = new Map<string, { frame: OutgoingFrame }>();
  readonly queue: OutgoingFrame[] = [];
  readonly undoManager: Y.UndoManager;

  #uploadLocal: boolean;
  #uploaded = false;
  #autoConnect: boolean;

  constructor(
    host: string,
    room: string,
    doc: Y.Doc,
    options: TemplateRoomProviderOptions = {},
  ) {
    const { connect = true, uploadLocal = false, party = 'doc', ...base } = options;
    super(host, room, doc, { ...base, party, disableBc: true, connect: false });
    this.#autoConnect = connect;
    this.#uploadLocal = uploadLocal;
    this.undoManager = new Y.UndoManager(doc, {
      trackedOrigins: new Set<unknown>([TRANSACTION_ORIGIN]),
      captureTimeout: 0,
    });

    this.messageHandlers[TAG_ACK] = ((_encoder, decoder, provider) => {
      const parsed = ackFrameSchema.safeParse(readJsonTail(decoder));
      if (!parsed.success) return;
      const frame = parsed.data;
      const self = provider as TemplateRoomProvider;
      self.pending.delete(frame.commandId);
      self.emit('room-ack', [
        { commandId: frame.commandId, serverSeq: frame.serverSeq },
      ]);
    }) as ControlHandler;

    this.messageHandlers[TAG_REJECT] = ((_encoder, decoder, provider) => {
      const parsed = rejectFrameSchema.safeParse(readJsonTail(decoder));
      if (!parsed.success) return;
      const frame = parsed.data;
      const self = provider as TemplateRoomProvider;
      self.rollbackAll();
      self.emit('room-reject', [{ commandId: frame.commandId, errors: frame.errors }]);
    }) as ControlHandler;

    this.messageHandlers[TAG_NOTICE] = ((_encoder, decoder, provider) => {
      const parsed = noticeFrameSchema.safeParse(readJsonTail(decoder));
      if (!parsed.success) return;
      const notice = parsed.data;
      (provider as TemplateRoomProvider).emit('room-notice', [
        notice.event === 'room-replaced'
          ? { event: notice.event, reason: notice.reason, by: notice.by }
          : { event: notice.event },
      ]);
    }) as ControlHandler;

    this.doc.off('update', this._updateHandler);
    this.on('synced', (state: boolean) => {
      if (!state) return;
      if (this.#uploadLocal && !this.#uploaded) {
        this.#uploaded = true;
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, 0);
        syncProtocol.writeUpdate(enc, Y.encodeStateAsUpdate(this.doc));
        this.sendBinary(encoding.toUint8Array(enc));
      }
      this.flush();
    });

    if (this.#autoConnect) void this.connect();
  }

  /** Applies the command optimistically and sends (or queues) the frame. */
  dispatch(command: EditCommand, options: RoomDispatchOptions = {}): string {
    const commandId = newCommandId();
    if (options.optimistic !== false) {
      applyCommandToYDoc(this.doc, command, {
        origin: OPTIMISTIC_ORIGIN,
        commandId,
      });
    }
    const frame: OutgoingFrame = { v: 1, commandId, command };
    this.pending.set(commandId, { frame });
    this.sendOrQueue(frame);
    return commandId;
  }

  private sendOrQueue(frame: OutgoingFrame): void {
    if (this.wsconnected && this.ws) {
      try {
        this.sendBinary(encodeControlFrame(frame as ControlFramePayload));
      } catch {
        this.queue.push(frame);
      }
      return;
    }
    this.queue.push(frame);
  }

  private sendBinary(bytes: Uint8Array): void {
    const ws = this.ws;
    if (!ws) throw new Error('no websocket');
    ws.send(bytes as unknown as ArrayBuffer);
  }

  /** Re-sends unacked commands (same ids; DO dedupes) then queued ones, in order. */
  flush(): void {
    if (!this.wsconnected || !this.ws) return;
    for (const { frame } of this.pending.values()) {
      try {
        this.sendBinary(encodeControlFrame(frame as ControlFramePayload));
      } catch {
        return;
      }
    }
    const queued = this.queue.splice(0, this.queue.length);
    for (const frame of queued) {
      const before = this.queue.length;
      this.sendOrQueue(frame);
      if (this.queue.length > before) return;
    }
  }

  /** Drops every unacked optimistic command and reverts the local doc, then delta-syncs. */
  rollbackAll(): void {
    this.pending.clear();
    this.queue.length = 0;
    let undone = true;
    while (undone) {
      undone = this.undoManager.undo() !== null;
    }
    if (this.ws && this.wsconnected) {
      try {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, 0);
        syncProtocol.writeSyncStep1(enc, this.doc);
        this.sendBinary(encoding.toUint8Array(enc));
      } catch {
        /* reconnect flow re-syncs anyway */
      }
    }
  }

  override destroy(): void {
    this.doc.off('update', this._updateHandler);
    super.destroy();
  }

  static frameFromBytes(bytes: Uint8Array): CommandFrame | null {
    if (bytes[0] !== TAG_COMMAND) return null;
    const decoded = decodeControlFrame(bytes);
    if (!decoded) return null;
    const parsed = commandFrameSchema.safeParse(decoded.frame);
    return parsed.success ? parsed.data : null;
  }
}
