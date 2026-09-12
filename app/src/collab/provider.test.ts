// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as Y from 'yjs';
import { initializeTemplateYDoc, projectDoc } from './schema';
import { createDefaultTemplate } from '../template/defaultTemplate';
import { TemplateRoomProvider } from './provider';
import { TAG_ACK, TAG_COMMAND, TAG_REJECT } from './frames';
import type { EditCommand } from '../types/commands';

function makeDoc(): Y.Doc {
  const doc = new Y.Doc();
  initializeTemplateYDoc(doc, createDefaultTemplate());
  return doc;
}

function makeProvider(
  doc: Y.Doc,
  options: { uploadLocal?: boolean; party?: string } = {},
): TemplateRoomProvider {
  return new TemplateRoomProvider('127.0.0.1:8787', 'test-room', doc, {
    connect: false,
    ...options,
  });
}

function stubConnect(provider: TemplateRoomProvider, sent: Uint8Array[]): void {
  provider.ws = {
    send: (bytes: ArrayBuffer) => {
      sent.push(new Uint8Array(bytes));
    },
  } as unknown as WebSocket;
  provider.wsconnected = true;
}

function makeFrameBytes(tag: number, payload: unknown): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const bytes = new Uint8Array(1 + json.length);
  bytes[0] = tag;
  bytes.set(json, 1);
  return bytes;
}

function driveControl(
  provider: TemplateRoomProvider,
  tag: number,
  payload: unknown,
): void {
  const bytes = makeFrameBytes(tag, payload);
  const handler = provider.messageHandlers[tag];
  if (!handler) throw new Error(`no handler for tag ${tag}`);
  handler(
    encoding.createEncoder(),
    decoding.createDecoder(bytes.subarray(1)),
    provider as never,
    false,
    tag,
  );
}

function parseFrame(bytes: Uint8Array): { commandId: string } {
  return JSON.parse(new TextDecoder().decode(bytes.subarray(1)));
}

const styleCommand = (patch: Record<string, unknown>): EditCommand =>
  ({
    kind: 'set-style',
    source: 'canvas',
    targetIds: ['hero-heading'],
    scope: 'all',
    stylePatch: patch,
  }) as unknown as EditCommand;

const replaceCommand = (): EditCommand => ({
  kind: 'replace-doc',
  source: 'code',
  targetIds: [],
  scope: 'all',
  reason: 'reset',
  doc: {
    ...createDefaultTemplate(),
    templateId: 'tpl-replaced-x1',
    templateName: 'Replaced',
  },
});

describe('TemplateRoomProvider', () => {
  it("defaults to the worker's 'doc' party when none is supplied", () => {
    const provider = makeProvider(makeDoc());
    expect(provider.url).toBe('ws://127.0.0.1:8787/parties/doc/test-room');
  });

  it('honors an explicit party override', () => {
    const provider = makeProvider(makeDoc(), { party: 'other' });
    expect(provider.url).toBe('ws://127.0.0.1:8787/parties/other/test-room');
  });

  it('dispatch applies optimistically and queues while offline', () => {
    const doc = makeDoc();
    const provider = makeProvider(doc);
    provider.dispatch(styleCommand({ color: '#112233' }));
    expect(projectDoc(doc).elements['hero-heading']?.style.base.color).toBe('#112233');
    expect(provider.pending.size).toBe(1);
    expect(provider.queue.length).toBe(1);
  });

  it('dispatch sends the command frame when connected', () => {
    const doc = makeDoc();
    const provider = makeProvider(doc);
    const sent: Uint8Array[] = [];
    stubConnect(provider, sent);
    provider.dispatch(styleCommand({ color: '#112233' }));
    expect(sent.length).toBe(1);
    expect(sent[0][0]).toBe(TAG_COMMAND);
    expect(parseFrame(sent[0]).commandId).toBeTruthy();
    expect(provider.pending.size).toBe(1);
    expect(provider.queue.length).toBe(0);
  });

  it('ack clears pending and emits room-ack', () => {
    const doc = makeDoc();
    const provider = makeProvider(doc);
    const sent: Uint8Array[] = [];
    stubConnect(provider, sent);
    const acks: Array<{ commandId: string; serverSeq: number }> = [];
    provider.on('room-ack', (payload: { commandId: string; serverSeq: number }) => {
      acks.push(payload);
    });
    const commandId = provider.dispatch(styleCommand({ color: '#112233' }));
    expect(provider.pending.size).toBe(1);
    driveControl(provider, TAG_ACK, { v: 1, type: 'ack', commandId, serverSeq: 1 });
    expect(provider.pending.size).toBe(0);
    expect(acks).toEqual([{ commandId, serverSeq: 1 }]);
  });

  it('reject rolls back every pending command and emits room-reject', () => {
    const doc = makeDoc();
    const provider = makeProvider(doc);
    const sent: Uint8Array[] = [];
    stubConnect(provider, sent);
    const rejects: unknown[] = [];
    provider.on('room-reject', (payload: unknown) => {
      rejects.push(payload);
    });
    provider.dispatch(styleCommand({ color: '#112233' }));
    provider.dispatch(styleCommand({ fontSize: 40 }));
    expect(projectDoc(doc).elements['hero-heading']?.style.base.color).toBe('#112233');
    expect(provider.pending.size).toBe(2);
    driveControl(provider, TAG_REJECT, {
      v: 1,
      type: 'reject',
      commandId: 'any-id',
      errors: [{ code: 'unknown-element', message: 'stale' }],
    });
    expect(provider.pending.size).toBe(0);
    expect(provider.queue.length).toBe(0);
    expect(rejects.length).toBe(1);
    expect(projectDoc(doc).elements['hero-heading']?.style.base.color).toBeUndefined();
    const last = sent[sent.length - 1];
    expect(last[0]).toBe(0);
  });

  it('uploadLocal promotes the local state exactly once on first sync', () => {
    const doc = makeDoc();
    const provider = makeProvider(doc, { uploadLocal: true });
    const sent: Uint8Array[] = [];
    stubConnect(provider, sent);
    provider.synced = true;
    expect(sent.length).toBe(1);
    expect(sent[0][0]).toBe(0);
    provider.synced = false;
    provider.synced = true;
    expect(sent.length).toBe(1);
  });

  it('flush re-sends pending frames before queued frames in order', () => {
    const doc = makeDoc();
    const provider = makeProvider(doc);
    const firstId = provider.dispatch(styleCommand({ color: '#112233' }));
    const sent: Uint8Array[] = [];
    stubConnect(provider, sent);
    const secondId = provider.dispatch(styleCommand({ fontSize: 40 }));
    expect(provider.pending.size).toBe(2);
    expect(provider.queue.length).toBe(1);
    provider.flush();
    expect(provider.queue.length).toBe(0);
    const ids = sent.map((bytes) => parseFrame(bytes).commandId);
    expect(ids).toEqual([secondId, firstId, secondId, firstId]);
  });

  it('dispatch with optimistic:false sends the frame without applying locally', () => {
    const doc = makeDoc();
    const provider = makeProvider(doc);
    const sent: Uint8Array[] = [];
    stubConnect(provider, sent);
    const before = JSON.stringify(projectDoc(doc));

    const commandId = provider.dispatch(replaceCommand(), { optimistic: false });

    expect(sent.length).toBe(1);
    expect(sent[0][0]).toBe(TAG_COMMAND);
    expect(parseFrame(sent[0]).commandId).toBe(commandId);
    expect(provider.pending.has(commandId)).toBe(true);
    expect(JSON.stringify(projectDoc(doc))).toBe(before);
  });

  it('a reject after a non-optimistic dispatch leaves the doc intact', () => {
    const doc = makeDoc();
    const provider = makeProvider(doc);
    const sent: Uint8Array[] = [];
    stubConnect(provider, sent);
    const before = JSON.stringify(projectDoc(doc));

    const commandId = provider.dispatch(replaceCommand(), { optimistic: false });
    driveControl(provider, TAG_REJECT, {
      v: 1,
      type: 'reject',
      commandId,
      errors: [{ code: 'invalid-payload', message: 'rejected' }],
    });

    expect(provider.pending.size).toBe(0);
    expect(JSON.stringify(projectDoc(doc))).toBe(before);
  });
});
