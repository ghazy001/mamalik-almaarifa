import { CloseCode, Protocol } from '@colyseus/sdk';
import type { Page, WebSocketRoute } from '@playwright/test';

type Frame = string | Buffer;
// Colyseus 0.18 uses ROOM_DATA + schema-encoded short channel name + payload.
// Inspect only that header; never decode/mutate gameplay or construct outcomes.
function channel(frame: Frame, name: string) {
  return (
    Buffer.isBuffer(frame) &&
    frame[0] === Protocol.ROOM_DATA &&
    frame[1] === 0xa0 + name.length &&
    frame.subarray(2, 2 + name.length).toString() === name
  );
}

/** Test-only network proxy. Every accepted frame still comes from the real room. */
export async function installSocketFaults(page: Page) {
  let pair: { page: WebSocketRoute; server: WebSocketRoute } | null = null;
  let lastSnapshot: Frame | null = null;
  let suppressSnapshots = false;
  let duplicateCommand = false;
  let holdHandshake = false;
  const handshakes: { destination: WebSocketRoute; frame: Frame }[] = [];
  let suppressed = 0;
  let duplicated = 0;
  await page.routeWebSocket('ws://127.0.0.1:2571/**', (socket) => {
    const server = socket.connectToServer();
    pair = { page: socket, server };
    server.onMessage((frame) => {
      if (
        holdHandshake &&
        Buffer.isBuffer(frame) &&
        frame[0] === Protocol.JOIN_ROOM
      ) {
        handshakes.push({ destination: socket, frame: Buffer.from(frame) });
        return;
      }
      if (channel(frame, 'snapshot')) {
        if (suppressSnapshots) {
          suppressed++;
          return;
        }
        lastSnapshot = Buffer.isBuffer(frame) ? Buffer.from(frame) : frame;
      }
      socket.send(frame);
    });
    socket.onMessage((frame) => {
      server.send(frame);
      if (duplicateCommand && channel(frame, 'command')) {
        duplicateCommand = false;
        duplicated++;
        server.send(frame);
      }
    });
  });
  return {
    suppress(value: boolean) {
      suppressSnapshots = value;
    },
    duplicateNextCommand() {
      duplicateCommand = true;
    },
    captureSnapshot() {
      if (!lastSnapshot) throw new Error('No real snapshot captured');
      const frame = lastSnapshot;
      return () => {
        if (!pair) throw new Error('No active transport');
        pair.page.send(frame);
      };
    },
    async drop() {
      if (!pair) throw new Error('No active transport');
      holdHandshake = true;
      await Promise.all([
        pair.page.close({ code: CloseCode.MAY_TRY_RECONNECT }),
        pair.server.close({ code: CloseCode.MAY_TRY_RECONNECT }),
      ]);
    },
    resume() {
      holdHandshake = false;
      for (const { destination, frame } of handshakes.splice(0))
        destination.send(frame);
    },
    async stopAutomaticRecovery() {
      if (!pair) throw new Error('No active transport');
      // Normal WebSocket close ends SDK retries, while Colyseus reserves a
      // non-consented guest seat. This exercises the explicit retry UI.
      await Promise.all([
        pair.page.close({ code: CloseCode.NORMAL_CLOSURE }),
        pair.server.close({ code: CloseCode.NORMAL_CLOSURE }),
      ]);
    },
    stats: () => ({ suppressed, duplicated }),
  };
}
