// Shared IPC registration — used by main.js and the smoke/probe scripts so the
// renderer always finds the same contract.
import { ipcMain, Menu, app, screen } from "electron";

export function registerNotchIpc(win, config) {
  ipcMain.handle("get-config", () => config.data);

  ipcMain.on("set-config", (_e, { key, value }) => {
    config.set(key, value);
    win.webContents.send("config-changed", { key, value });
  });

  ipcMain.on("set-ignore-mouse-events", (_e, ignore) => {
    win.setIgnoreMouseEvents(ignore, { forward: true });
  });

  ipcMain.on("notch-context-menu", () => {
    Menu.buildFromTemplate([
      { label: "Settings", accelerator: "CmdOrCtrl+,", enabled: false /* slice 5 */ },
      { type: "separator" },
      { label: "Restart notch.win", click: () => { app.relaunch(); app.quit(); } },
      { label: "Quit", accelerator: "CmdOrCtrl+Q", click: () => app.quit() },
    ]).popup({ window: win });
  });

  const sendConfig = () => win.webContents.send("config", config.data);
  win.webContents.once("did-finish-load", sendConfig);

  // Surface renderer console in the main log for diagnostics.
  win.webContents.on("console-message", (_e, _level, message) => {
    console.log(`[renderer] ${message}`);
  });

  // Cursor watchdog: mouse-leave events are unreliable when the pointer jumps
  // to another monitor (or when the host flips to pass-through). Poll the real
  // cursor position against the window bounds and broadcast the verdict so the
  // renderer can always close/release the notch.
  const cursorTimer = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(cursorTimer);
      return;
    }
    try {
      const p = screen.getCursorScreenPoint();
      const b = win.getBounds();
      const inside =
        p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
      win.webContents.send("cursor-inside", inside);
    } catch {
      /* window may be mid-teardown */
    }
  }, 200);
  win.on("closed", () => clearInterval(cursorTimer));

  return { sendConfig };
}
