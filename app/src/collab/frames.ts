import { z } from 'zod';
import type { CommandErrorCode } from '../engine/validate';
import { editCommandSchema } from '../engine/validate';

export const TAG_COMMAND = 100;
export const TAG_ACK = 101;
export const TAG_REJECT = 102;
export const TAG_NOTICE = 103;

export const ROOM_FULL_CLOSE_CODE = 4003;

const commandErrorCodes = [
  'invalid-payload',
  'unknown-element',
  'invalid-target',
  'id-collision',
  'forbidden-field',
] as const satisfies readonly CommandErrorCode[];

const commandErrorSchema = z.strictObject({
  code: z.enum(commandErrorCodes),
  message: z.string(),
});

export const commandFrameSchema = z.strictObject({
  v: z.literal(1),
  commandId: z.string().min(1),
  command: editCommandSchema,
});

export const ackFrameSchema = z.strictObject({
  v: z.literal(1),
  type: z.literal('ack'),
  commandId: z.string().min(1),
  serverSeq: z.number().int().nonnegative(),
});

export const rejectFrameSchema = z.strictObject({
  v: z.literal(1),
  type: z.literal('reject'),
  commandId: z.string().min(1),
  errors: z.array(commandErrorSchema),
});

export const roomReplacedNoticeSchema = z.strictObject({
  v: z.literal(1),
  type: z.literal('notice'),
  event: z.literal('room-replaced'),
  reason: z.enum(['import', 'load-template', 'reset']),
  by: z.string().min(1),
});

export const roomFullNoticeSchema = z.strictObject({
  v: z.literal(1),
  type: z.literal('notice'),
  event: z.literal('room-full'),
});

export const noticeFrameSchema = z.discriminatedUnion('event', [
  roomReplacedNoticeSchema,
  roomFullNoticeSchema,
]);

export type CommandFrame = z.infer<typeof commandFrameSchema>;
export type AckFrame = z.infer<typeof ackFrameSchema>;
export type RejectFrame = z.infer<typeof rejectFrameSchema>;
export type NoticeFrame = z.infer<typeof noticeFrameSchema>;
export type RoomReplacedNotice = z.infer<typeof roomReplacedNoticeSchema>;
export type RoomFullNotice = z.infer<typeof roomFullNoticeSchema>;

export type ControlFramePayload =
  | CommandFrame
  | AckFrame
  | RejectFrame
  | NoticeFrame;

export type ControlFrame =
  | { tag: typeof TAG_COMMAND; frame: CommandFrame }
  | { tag: typeof TAG_ACK; frame: AckFrame }
  | { tag: typeof TAG_REJECT; frame: RejectFrame }
  | { tag: typeof TAG_NOTICE; frame: NoticeFrame };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function frameTagFor(frame: ControlFramePayload): number {
  if ('type' in frame) {
    if (frame.type === 'ack') return TAG_ACK;
    if (frame.type === 'reject') return TAG_REJECT;
    return TAG_NOTICE;
  }
  return TAG_COMMAND;
}

export function encodeControlFrame(frame: ControlFramePayload): Uint8Array {
  const tag = frameTagFor(frame);
  const payload = textEncoder.encode(JSON.stringify(frame));
  const bytes = new Uint8Array(payload.length + 1);
  bytes[0] = tag;
  bytes.set(payload, 1);
  return bytes;
}

export interface ControlEnvelope {
  tag: number;
  data: unknown;
}

export function decodeControlEnvelope(bytes: Uint8Array): ControlEnvelope | null {
  if (bytes.length < 1) return null;
  const tag = bytes[0];
  if (
    tag !== TAG_COMMAND &&
    tag !== TAG_ACK &&
    tag !== TAG_REJECT &&
    tag !== TAG_NOTICE
  ) {
    return null;
  }
  try {
    return { tag, data: JSON.parse(textDecoder.decode(bytes.subarray(1))) };
  } catch {
    return null;
  }
}

export function decodeControlFrame(bytes: Uint8Array): ControlFrame | null {
  const envelope = decodeControlEnvelope(bytes);
  if (!envelope) return null;
  const { tag, data } = envelope;
  switch (tag) {
    case TAG_COMMAND: {
      const parsed = commandFrameSchema.safeParse(data);
      return parsed.success ? { tag, frame: parsed.data } : null;
    }
    case TAG_ACK: {
      const parsed = ackFrameSchema.safeParse(data);
      return parsed.success ? { tag, frame: parsed.data } : null;
    }
    case TAG_REJECT: {
      const parsed = rejectFrameSchema.safeParse(data);
      return parsed.success ? { tag, frame: parsed.data } : null;
    }
    case TAG_NOTICE: {
      const parsed = noticeFrameSchema.safeParse(data);
      return parsed.success ? { tag, frame: parsed.data } : null;
    }
    default:
      return null;
  }
}
