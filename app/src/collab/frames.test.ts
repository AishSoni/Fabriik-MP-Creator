import { describe, expect, it } from 'vitest';
import type { CommandError, CommandErrorCode } from '../engine/validate';
import {
  TAG_ACK,
  TAG_COMMAND,
  TAG_NOTICE,
  TAG_REJECT,
  decodeControlFrame,
  encodeControlFrame,
  frameTagFor,
} from './frames';
import type { AckFrame, CommandFrame, NoticeFrame, RejectFrame } from './frames';
import { decodeControlEnvelope } from './frames';

const textEncoder = new TextEncoder();
const json = (payload: unknown) =>
  new Uint8Array([TAG_COMMAND, ...textEncoder.encode(JSON.stringify(payload))]);

const reorderFrame: CommandFrame = {
  v: 1,
  commandId: 'cmd-1',
  command: {
    kind: 'reorder',
    source: 'canvas',
    targetIds: ['hero-subtext'],
    scope: 'all',
    baseRevision: 0,
    index: 0,
  },
};

const ackFrame: AckFrame = { v: 1, type: 'ack', commandId: 'cmd-1', serverSeq: 7 };

const rejectErrors: CommandError[] = [
  { code: 'stale-revision', message: 'command targets revision 0 but current revision is 3' },
  { code: 'unknown-element', message: 'unknown element id "ghost"' },
];

const rejectFrame: RejectFrame = { v: 1, type: 'reject', commandId: 'cmd-1', errors: rejectErrors };

const noticeFrame: NoticeFrame = {
  v: 1,
  type: 'notice',
  event: 'room-replaced',
  reason: 'import',
  by: 'client-a',
};

describe('control frames', () => {
  it('uses consecutive tags 100-103', () => {
    expect([TAG_COMMAND, TAG_ACK, TAG_REJECT, TAG_NOTICE]).toEqual([100, 101, 102, 103]);
  });

  it('round-trips a command frame', () => {
    const bytes = encodeControlFrame(reorderFrame);
    expect(bytes[0]).toBe(TAG_COMMAND);
    const decoded = decodeControlFrame(bytes);
    expect(decoded).toEqual({ tag: TAG_COMMAND, frame: reorderFrame });
  });

  it('round-trips an ack frame', () => {
    const bytes = encodeControlFrame(ackFrame);
    expect(bytes[0]).toBe(TAG_ACK);
    expect(decodeControlFrame(bytes)).toEqual({ tag: TAG_ACK, frame: ackFrame });
  });

  it('round-trips a reject frame preserving error codes and messages', () => {
    const bytes = encodeControlFrame(rejectFrame);
    expect(bytes[0]).toBe(TAG_REJECT);
    const decoded = decodeControlFrame(bytes);
    expect(decoded).toEqual({ tag: TAG_REJECT, frame: rejectFrame });
    const frame = decoded?.frame;
    if (!frame || !('errors' in frame)) throw new Error('expected reject frame');
    expect(frame.errors.map((e) => e.code)).toEqual(['stale-revision', 'unknown-element']);
    expect(frame.errors[1]?.message).toBe('unknown element id "ghost"');
  });

  it('round-trips a notice frame', () => {
    const bytes = encodeControlFrame(noticeFrame);
    expect(bytes[0]).toBe(TAG_NOTICE);
    expect(decodeControlFrame(bytes)).toEqual({ tag: TAG_NOTICE, frame: noticeFrame });
  });

  it('maps payload types to tags without transport', () => {
    expect(frameTagFor(reorderFrame)).toBe(TAG_COMMAND);
    expect(frameTagFor(ackFrame)).toBe(TAG_ACK);
    expect(frameTagFor(rejectFrame)).toBe(TAG_REJECT);
    expect(frameTagFor(noticeFrame)).toBe(TAG_NOTICE);
  });

  it('accepts every engine CommandErrorCode on the wire', () => {
    const codes: CommandErrorCode[] = [
      'invalid-payload',
      'unknown-element',
      'stale-revision',
      'invalid-target',
      'id-collision',
      'forbidden-field',
    ];
    for (const code of codes) {
      const errors: CommandError[] = [{ code, message: `x ${code}` }];
      const decoded = decodeControlFrame(encodeControlFrame({ ...rejectFrame, errors }));
      expect(decoded?.frame).toMatchObject({ errors: [{ code, message: `x ${code}` }] });
    }
  });

  it('exposes raw envelopes for the DO gate to decide on', () => {
    const envelope = decodeControlEnvelope(encodeControlFrame(reorderFrame));
    expect(envelope).toEqual({ tag: TAG_COMMAND, data: reorderFrame });
    expect(decodeControlEnvelope(new Uint8Array([TAG_COMMAND, ...textEncoder.encode('{oops')]))).toBeNull();
    expect(decodeControlEnvelope(new Uint8Array([0, 1]))).toBeNull();
    expect(decodeControlEnvelope(new Uint8Array())).toBeNull();
  });

  it('returns null for non-control tags (yjs sync passthrough)', () => {
    expect(decodeControlFrame(new Uint8Array([0, 1, 2, 3]))).toBeNull();
    expect(decodeControlFrame(new Uint8Array([99]))).toBeNull();
    expect(decodeControlFrame(new Uint8Array([104]))).toBeNull();
    expect(decodeControlFrame(new Uint8Array())).toBeNull();
  });

  it('returns null for malformed payloads', () => {
    const garbage = new Uint8Array([TAG_COMMAND, ...new TextEncoder().encode('not json')]);
    expect(decodeControlFrame(garbage)).toBeNull();

    const wrongShape = new Uint8Array([TAG_COMMAND, ...new TextEncoder().encode('{"v":1}')]);
    expect(decodeControlFrame(wrongShape)).toBeNull();

    expect(decodeControlFrame(json({ ...reorderFrame, extra: true }))).toBeNull();
    expect(
      decodeControlFrame(
        json({
          v: 1,
          commandId: 'cmd-1',
          command: { kind: 'reorder', source: 'canvas', targetIds: ['e1'], scope: 'all', baseRevision: -1, index: 0 },
        }),
      ),
    ).toBeNull();
  });

  it('rejects schema violations per tag', () => {
    expect(decodeControlFrame(json({ v: 1, commandId: '', command: reorderFrame.command }))).toBeNull();

    const ackJson = new Uint8Array([TAG_ACK, ...new TextEncoder().encode(JSON.stringify({ v: 1, type: 'ack', commandId: 'cmd-1' }))]);
    expect(decodeControlFrame(ackJson)).toBeNull();

    const rejectJson = new Uint8Array([TAG_REJECT, ...new TextEncoder().encode(JSON.stringify({ v: 1, type: 'reject', commandId: 'cmd-1', errors: [{ code: 'nope', message: 'x' }] }))]);
    expect(decodeControlFrame(rejectJson)).toBeNull();

    const noticeJson = new Uint8Array([TAG_NOTICE, ...new TextEncoder().encode(JSON.stringify({ ...noticeFrame, reason: 'other' }))]);
    expect(decodeControlFrame(noticeJson)).toBeNull();
  });
});
