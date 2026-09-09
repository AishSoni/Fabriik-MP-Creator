import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

const URL = process.env.SPIKE_URL ?? 'ws://127.0.0.1:8787/doc/spike-room';
const TIMEOUT_MS = 60_000;

const results = { sync: false, custom: false };

function sendSyncStep1(ws) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep1);
  syncProtocol.writeSyncStep1(encoder, new Y.Doc());
  ws.send(encoding.toUint8Array(encoder));
}

function sendCommandFrame(ws) {
  const body = new TextEncoder().encode(
    JSON.stringify({ v: 1, commandId: 'spike-1', command: { kind: 'spike' } }),
  );
  const frame = new Uint8Array(1 + body.length);
  frame[0] = 100;
  frame.set(body, 1);
  ws.send(frame);
}

function fail(message) {
  console.error('SPIKE FAIL:', message);
  process.exit(1);
}

function finish() {
  console.log('SPIKE PASS: sync handshake + tagged frame round-trip verified');
  process.exit(0);
}

function connect(attempt = 0) {
  let ws;
  try {
    ws = new WebSocket(URL);
  } catch (err) {
    fail(`connect error: ${err}`);
  }
  ws.binaryType = 'arraybuffer';

  ws.addEventListener('open', () => {
    console.log('connected');
    sendSyncStep1(ws);
  });

  ws.addEventListener('message', (event) => {
    const data = event.data;
    const bytes = typeof data === 'string' ? null : new Uint8Array(data);
    if (!bytes) return;
    const tag = bytes[0];
    console.log(`frame tag=${tag} len=${bytes.length}`);
    if (tag === syncProtocol.messageYjsSyncStep1 || tag === 0) {
      results.sync = true;
      sendCommandFrame(ws);
      return;
    }
    if (tag === 101) {
      try {
        const payload = JSON.parse(new TextDecoder().decode(bytes.slice(1)));
        const echoed = typeof payload?.echo === 'string' ? JSON.parse(payload.echo) : payload?.echo;
        if (payload?.type === 'spike-ack' && echoed?.commandId === 'spike-1') {
          results.custom = true;
          if (results.sync) finish();
        } else {
          fail(`unexpected ack payload: ${JSON.stringify(payload)}`);
        }
      } catch (err) {
        fail(`ack payload not JSON: ${err}`);
      }
    }
  });

  ws.addEventListener('error', () => {
    retry(attempt);
  });
  ws.addEventListener('close', () => {
    if (!results.sync || !results.custom) retry(attempt);
  });
}

function retry(attempt) {
  if (attempt > 55) fail('gave up connecting to wrangler dev');
  setTimeout(() => connect(attempt + 1), 1000);
}

setTimeout(() => {
  if (results.sync && results.custom) finish();
  fail(`timeout: ${JSON.stringify(results)}`);
}, TIMEOUT_MS);

connect();
