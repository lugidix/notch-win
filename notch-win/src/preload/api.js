// ESM preload (package.json has "type": "module" — Electron ≥28 supports ESM preloads).
import { contextBridge, ipcRenderer } from "electron";

const api = {
  getConfig: () => ipcRenderer.invoke("get-config"),
  setConfig: (key, value) => ipcRenderer.send("set-config", { key, value }),
  onConfig: (cb) => {
    ipcRenderer.on("config", (_e, data) => cb(data));
    ipcRenderer.on("config-changed", (_e, data) => cb(data));
  },
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send("set-ignore-mouse-events", ignore),
  contextMenu: () => ipcRenderer.send("notch-context-menu"),
  // Slice 2 channels (media SMTC) arrive here.
  onMedia: (cb) => ipcRenderer.on("media", (_e, state) => cb(state)),
  mediaCommand: (cmd, arg) => ipcRenderer.send("media-command", { cmd, arg }),
  onCursorInside: (cb) => ipcRenderer.on("cursor-inside", (_e, inside) => cb(inside)),
  onHotkey: (cb) => ipcRenderer.on("hotkey", (_e, key) => cb(key)),
  onFullscreen: (cb) => ipcRenderer.on("fullscreen", (_e, state) => cb(state)),
  // Shelf (slice 4)
  getShelf: () => ipcRenderer.invoke("get-shelf"),
  setShelf: (items) => ipcRenderer.send("set-shelf", items),
  openItem: (item) => ipcRenderer.send("open-item", item),
  revealItem: (item) => ipcRenderer.send("reveal-item", item),
  copyItemPath: (item) => ipcRenderer.send("copy-item-path", item),
};

contextBridge.exposeInMainWorld("notchApi", api);
