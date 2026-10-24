// Visual smoke capture: launches the notch window headless-fully (real Electron),
// simulates the hover-open, and captures closed + open states to PNG so the
// layout fidelity can be verified against the boring.notch reference.
// Usage: npx electron scripts/smoke-capture.js
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigStore } from "../src/main/config-store.js";
import { registerNotchIpc } from "../src/main/ipc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "tests", "artifacts");
fs.mkdirSync(outDir, { recursive: true });

app.whenReady().then(async () => {
  const config = new ConfigStore(path.join(root, "tests", "artifacts", "fixture-config"));

  const win = new BrowserWindow({
    width: 640,
    height: 210,
    frame: false,
    transparent: false, // opaque for the artifact; the real run stays transparent
    show: true,
    webPreferences: {
      preload: path.join(root, "src", "preload", "api.js"),
      contextIsolation: true,
      sandbox: false,
    },
  });
  win.setBackgroundThrottling(false);
  registerNotchIpc(win, config);
  await win.loadFile(path.join(root, "src", "renderer", "notch", "index.html"));

  const shoot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, name), img.toPNG());
  };

  await new Promise((r) => setTimeout(r, 800)); // let the renderer settle
  await shoot("notch-closed.png");

  // Inject a synthetic SMTC poll FIRST so the next open lands on the compact
  // media panel (Apple expanded-island view), not the full player.
  // artB64: 64×64 coral→purple gradient (tests/artifacts/fixture-art.b64).
  const artB64 = fs.readFileSync(path.join(outDir, "fixture-art.b64"), "utf8").trim();
  const fakePoll = {
    type: "media",
    status: "playing",
    ts: Date.now(),
    artB64,
    track: { title: "Tranchées", artist: "La Fouine & Himra", album: "CAPITALE DU CRIME RADIO", positionSec: 75, durationSec: 167, rate: 1 },
  };
  await win.webContents.executeJavaScript(
    `window.__notch.music.handleMediaEvent(${JSON.stringify(fakePoll)})`
  );
  await new Promise((r) => setTimeout(r, 400));

  // Simulate the hover-open path exactly like a user would (hover dwell 300ms).
  const state1 = await win.webContents.executeJavaScript(`
    (() => {
      const notch = document.getElementById('notch');
      notch.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
      return {
        hasHook: !!window.__notch,
        state: window.__notch ? window.__notch.store.notchState : 'no-hook',
        width0: notch.style.width,
      };
    })()
  `);
  await new Promise((r) => setTimeout(r, 300)); // minimumHoverDuration
  await new Promise((r) => setTimeout(r, 1200)); // spring + overshoot fully settled
  await shoot("notch-open.png");

  // Click progression: medium (hover) → large clean island.
  await win.webContents.executeJavaScript(`(() => {
    const n = document.getElementById('notch');
    n.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    n.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return 'clicked';
  })()`);
  await new Promise((r) => setTimeout(r, 700));
  await shoot("notch-click.png");

  // Closed state with the music activity visible (widened pill).
  await win.webContents.executeJavaScript(`window.__notch.store.close(); 'closed'`);
  await new Promise((r) => setTimeout(r, 500));
  await shoot("notch-closed-music.png");

  console.log("artifacts written to", outDir);
  app.quit();
});
