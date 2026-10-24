// SMTC bridge supervisor — spawns scripts/smtc-stream.ps1 (persistent JSON-lines
// process, like boring.notch's mediaremote-adapter), parses its output, forwards
// media state, and relays playback commands over the bridge's TCP channel.
// Restarts the child with backoff if it dies.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// pollers → main → src → project root → scripts
export const SMTC_SCRIPT = path.join(__dirname, "..", "..", "..", "scripts", "smtc-stream.ps1");

export function startSmtcBridge(opts = {}) {
  const {
    scriptPath = SMTC_SCRIPT,
    onMedia = () => {},
    onLog = () => {},
    spawnImpl = (file, args) =>
      spawn(file, args, { windowsHide: true }),
    netImpl = undefined, // injected in tests; real net imported lazily below
    backoffMs = [1000, 3000, 8000],
  } = opts;

  let child = null;
  let stopped = false;
  let restartIndex = 0;
  let buffer = "";
  let net = netImpl;
  let commandPort = null;
  const commandQueue = [];

  function dispatch(cmd, value) {
    // One short-lived connection per command: the PowerShell side reads
    // non-blocking with a deadline and closes — a persistent socket would
    // stall its polling loop.
    if (!net || !commandPort) {
      commandQueue.push({ cmd, value });
      if (commandQueue.length > 20) commandQueue.shift();
      return;
    }
    const s = net.connect({ host: "127.0.0.1", port: commandPort });
    s.on("connect", () => s.write(JSON.stringify({ cmd, value }) + "\n"));
    s.on("error", () => {}); // best effort; next poll re-syncs state
  }

  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
  ];

  function spawnChild() {
    if (stopped) return;
    child = spawnImpl("powershell.exe", args);
    console.log(`[smtc] spawned powershell pid=${child.pid}`);

    child.on("error", (err) => onLog(`smtc spawn error: ${err.message}`));

    child.stdout?.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) handleLine(line);
      }
    });

    child.stderr?.on("data", (chunk) => onLog(`smtc stderr: ${chunk}`));

    child.on("exit", (code) => {
      child = null;
      if (stopped) return;
      const delay = backoffMs[Math.min(restartIndex, backoffMs.length - 1)];
      restartIndex += 1;
      onLog(`smtc bridge exited (${code}); restarting in ${delay}ms`);
      setTimeout(spawnChild, delay);
    });
  }

  function handleLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      onLog(`smtc unparsable line: ${line.slice(0, 120)}`);
      return;
    }
    if (msg.type === "ready") {
      restartIndex = 0;
      commandPort = msg.port;
      flushQueue();
    } else if (msg.type === "media") {
      onMedia(msg);
    } else if (msg.type === "error") {
      onLog(`smtc error (${msg.where}): ${msg.message}`);
    }
  }

  async function flushQueue() {
    if (!net) {
      net = await import("node:net");
    }
    while (commandQueue.length) {
      const { cmd, value } = commandQueue.shift();
      dispatch(cmd, value);
    }
  }

  function send(cmd, value) {
    dispatch(cmd, value);
  }

  function stop() {
    stopped = true;
    child?.kill();
    child = null;
  }

  spawnChild();
  return { send, stop };
}
