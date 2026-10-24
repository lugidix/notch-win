// Notch window — Windows equivalent of the macOS borderless NSPanel pinned
// top-center (boringNotchApp.swift:234-280, BoringNotchSkyLightWindow.swift).
// Host window is 640×210 (openNotchSize + 20px shadow padding, sizing/matters.swift:15-17).
import { BrowserWindow, screen } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const NOTCH_WINDOW_W = 640;
export const NOTCH_WINDOW_H = 210;

export function createNotchWindow() {
  const win = new BrowserWindow({
    width: NOTCH_WINDOW_W,
    height: NOTCH_WINDOW_H,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false, // nonactivatingPanel equivalent — never steal focus
    hasShadow: false, // the notch draws its own conditional shadow (ContentView.swift:111-114)
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "api.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Top-center, flush to the top edge (positionWindow, boringNotchApp.swift:267-280).
  const display = screen.getPrimaryDisplay();
  const { bounds } = display;
  win.setPosition(
    Math.round(bounds.x + (bounds.width - NOTCH_WINDOW_W) / 2),
    Math.round(bounds.y)
  );

  // Above everything, like level = .mainMenu + 3 + CGSSpace on macOS.
  win.setAlwaysOnTop(true, "screen-saver");

  win.once("ready-to-show", () => win.showInactive());
  win.loadFile(path.join(__dirname, "..", "renderer", "notch", "index.html"));
  return win;
}
