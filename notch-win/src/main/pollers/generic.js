// Generic JSON-lines poller — spawns a PowerShell script and forwards each
// parsed line to the renderer on the given channel. Restart with backoff.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// pollers → main → src → project root → scripts
export const SCRIPTS_DIR = path.join(__dirname, "..", "..", "..", "scripts");

export function startJsonPoller({ script, args = [], channel, win, onLog = () => {}, backoffMs = [1000, 5000, 15000] }) {
  let child = null;
  let stopped = false;
  let restartIndex = 0;
  let buffer = "";

  function spawnChild() {
    if (stopped) return;
    child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(SCRIPTS_DIR, script), ...args.map(String)],
      { windowsHide: true }
    );

    child.stdout?.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === "error") onLog(`${script}: ${msg.where}: ${msg.message}`);
          else if (!win.isDestroyed()) win.webContents.send(channel, msg);
        } catch {
          onLog(`${script}: unparsable: ${line.slice(0, 80)}`);
        }
      }
    });

    child.on("error", (err) => onLog(`${script} spawn error: ${err.message}`));
    child.on("exit", (code) => {
      child = null;
      if (stopped) return;
      const delay = backoffMs[Math.min(restartIndex, backoffMs.length - 1)];
      restartIndex += 1;
      onLog(`${script} exited (${code}); restart in ${delay}ms`);
      setTimeout(spawnChild, delay);
    });
  }

  spawnChild();
  return { stop() { stopped = true; child?.kill(); child = null; } };
}
