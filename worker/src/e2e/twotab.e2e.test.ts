// @vitest-environment node
import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { TemplateRoomProvider } from '@app/collab/provider';
import { getHistoryYArray, initializeTemplateYDoc, projectDoc } from '@app/collab/schema';
import { createDefaultTemplate } from '@app/template/defaultTemplate';

declare const process: { env: Record<string, string | undefined> };

const url = process.env.SMOKE_E2E_URL;
const host = new URL(url ?? 'ws://127.0.0.1:8787').host;
const RUN = Date.now().toString(36);

async function hostReachable(target: string): Promise<boolean> {
  const { connect } = await import('node:net');
  const idx = target.lastIndexOf(':');
  const hostname = idx > -1 ? target.slice(0, idx) : target;
  const port = idx > -1 ? Number(target.slice(idx + 1)) : 443;
  return new Promise((resolve) => {
    const socket = connect({ host: hostname, port, timeout: 1500 }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
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

async function waitFor(fn: () => boolean, what: string, timeoutMs = 15_000): Promise<void> {
  const started = Date.now();
  while (!fn()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function awaitSynced(provider: TemplateRoomProvider): Promise<void> {
  await waitFor(() => provider.synced, 'synced');
}

function waitEvent(
  provider: TemplateRoomProvider,
  event: string,
  pred: (payload: unknown) => boolean,
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} event`)), 15_000);
    provider.on(event, (payload: unknown) => {
      const entry = Array.isArray(payload) ? payload[0] : payload;
      if (pred(entry)) {
        clearTimeout(timer);
        resolve(entry);
      }
    });
  });
}

it('two-provider smoke: creator + joiner converge, invalid rolls back', { timeout: 45_000 }, async (t) => {
  if (!url && !(await hostReachable(host))) {
    t.skip();
    return;
  }
  const room = `smoke-${RUN}`;
  const creatorDoc = new Y.Doc();
  initializeTemplateYDoc(creatorDoc, createDefaultTemplate());
  const creator = new TemplateRoomProvider(host, room, creatorDoc, {
    connect: true,
    uploadLocal: true,
  });
  await awaitSynced(creator);

  const joinerDoc = new Y.Doc();
  const joiner = new TemplateRoomProvider(host, room, joinerDoc, {
    connect: true,
  });
  await awaitSynced(joiner);
  expect(JSON.stringify(projectDoc(joinerDoc).elements['hero-heading']?.type)).toContain('heading');

  const ackCreator = waitEvent(creator, 'room-ack', () => true);
  creator.dispatch(styleColor('#112233') as never);
  const ack = (await ackCreator) as { commandId: string; serverSeq: number };
  expect(ack.serverSeq).toBe(1);
  await waitFor(
    () => JSON.stringify(projectDoc(joinerDoc).elements['hero-heading']?.style).includes('#112233'),
    'joiner receives creator style',
  );

  const ackJoiner = waitEvent(joiner, 'room-ack', () => true);
  joiner.dispatch(contentText('Hello from joiner') as never);
  const ackB = (await ackJoiner) as { serverSeq: number };
  expect(ackB.serverSeq).toBe(2);
  await waitFor(
    () => JSON.stringify(projectDoc(creatorDoc).elements['hero-eyebrow']?.content).includes('Hello from joiner'),
    'creator receives joiner content',
  );

  expect(projectDoc(creatorDoc).elements).toEqual(projectDoc(joinerDoc).elements);
  expect(getHistoryYArray(creatorDoc).length).toBe(2);

  const rejectJoiner = waitEvent(joiner, 'room-reject', () => true);
  joiner.dispatch({
    kind: 'set-style',
    source: 'canvas',
    targetIds: ['ghost-element'],
    scope: 'all',
    stylePatch: { color: '#ff0000' },
  } as never);
  await rejectJoiner;
  await waitFor(
    () => !JSON.stringify(projectDoc(joinerDoc).elements).includes('#ff0000'),
    'joiner rollback leaves no residue',
  );
  expect(JSON.stringify(projectDoc(creatorDoc).elements)).not.toContain('#ff0000');

  creator.destroy();
  joiner.destroy();
});
