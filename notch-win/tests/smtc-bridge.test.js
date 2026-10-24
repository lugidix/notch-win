import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { startSmtcBridge, SMTC_SCRIPT } from "../src/main/pollers/smtc.js";

describe("SMTC_SCRIPT path", () => {
  it("points at the real PowerShell bridge at the project root", () => {
    expect(SMTC_SCRIPT.replace(/\\/g, "/")).toMatch(/notch-win\/scripts\/smtc-stream\.ps1$/);
    expect(fs.existsSync(SMTC_SCRIPT)).toBe(true);
  });
});

function fakeChild() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stderr = new EventEmitter();
  c.killed = false;
  c.kill = vi.fn(() => {
    c.killed = true;
  });
  return c;
}

function fakeNet() {
  const sockets = [];
  return {
    sockets,
    connect(_opts) {
      const s = new EventEmitter();
      s.writable = true;
      s.written = [];
      s.write = (d) => s.written.push(d);
      s.destroy = () => {};
      sockets.push(s);
      queueMicrotask(() => s.emit("connect"));
      return s;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("startSmtcBridge", () => {
  it("parses chunked JSON-lines and forwards media payloads", () => {
    const child = fakeChild();
    const media = [];
    const bridge = startSmtcBridge({
      spawnImpl: () => child,
      onMedia: (m) => media.push(m),
    });
    // one chunk split across two data events
    child.stdout.emit("data", '{"type":"ready","port":1}\n{"type":"media","status":"playing","tr');
    child.stdout.emit("data", 'ack":{"title":"Tranchées"}}\n');
    expect(media).toHaveLength(1);
    expect(media[0].track.title).toBe("Tranchées");
    bridge.stop();
  });

  it("queues commands until ready, then sends one connection per command", async () => {
    const child = fakeChild();
    const net = fakeNet();
    const bridge = startSmtcBridge({ spawnImpl: () => child, netImpl: net });
    bridge.send("togglePlay");
    expect(net.sockets).toHaveLength(0); // not ready yet
    child.stdout.emit("data", '{"type":"ready","port":4242}\n');
    await Promise.resolve();
    await Promise.resolve();
    expect(net.sockets).toHaveLength(1);
    expect(net.sockets[0].written).toEqual(['{"cmd":"togglePlay"}\n']);
    bridge.send("seek", 42.5); // ready: immediate dedicated connection
    expect(net.sockets).toHaveLength(2);
    await Promise.resolve();
    expect(net.sockets[1].written).toEqual(['{"cmd":"seek","value":42.5}\n']);
    bridge.stop();
  });

  it("restarts the child with backoff on exit", () => {
    const children = [fakeChild(), fakeChild(), fakeChild()];
    let n = 0;
    const logs = [];
    const bridge = startSmtcBridge({
      spawnImpl: () => children[n++],
      onLog: (l) => logs.push(l),
      backoffMs: [1000, 5000],
    });
    children[0].emit("exit", 1);
    expect(n).toBe(1); // not yet restarted
    vi.advanceTimersByTime(1000);
    expect(n).toBe(2); // first backoff elapsed
    children[1].emit("exit", 1);
    vi.advanceTimersByTime(1000);
    expect(n).toBe(2); // still in the 5s backoff
    vi.advanceTimersByTime(4000);
    expect(n).toBe(3);
    bridge.stop();
  });

  it("stop() prevents any restart", () => {
    const children = [fakeChild()];
    let n = 0;
    const bridge = startSmtcBridge({ spawnImpl: () => children[n++] });
    bridge.stop();
    children[0].emit("exit", 1);
    vi.advanceTimersByTime(60_000);
    expect(n).toBe(1);
  });
});
