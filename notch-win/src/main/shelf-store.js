// Shelf persistence — items.json in userData/shelf/ (ShelfPersistenceService
// equivalent). IPC: get-shelf / set-shelf (renderer keeps the source of truth
// in memory; main persists), open-item, reveal-item, copy-item-path.
import { app, ipcMain, clipboard, shell } from "electron";
import fs from "node:fs";
import path from "node:path";

const DIR = () => path.join(app.getPath("userData"), "shelf");
const FILE = () => path.join(DIR(), "items.json");

export function registerShelfIpc() {
  ipcMain.handle("get-shelf", () => {
    try {
      if (fs.existsSync(FILE())) return JSON.parse(fs.readFileSync(FILE(), "utf8"));
    } catch { /* corrupt file: start fresh */ }
    return [];
  });

  ipcMain.on("set-shelf", (_e, items) => {
    try {
      fs.mkdirSync(DIR(), { recursive: true });
      fs.writeFileSync(FILE(), JSON.stringify(items, null, 2));
    } catch { /* disk error: in-memory copy still works */ }
  });

  ipcMain.on("open-item", (_e, item) => {
    if (item.type === "file") shell.openPath(item.path);
    else if (item.type === "link") shell.openExternal(item.url);
    else if (item.type === "text") clipboard.writeText(item.text);
  });

  ipcMain.on("reveal-item", (_e, item) => {
    if (item.type === "file") shell.showItemInFolder(item.path);
  });

  ipcMain.on("copy-item-path", (_e, item) => {
    if (item.type === "file") clipboard.writeText(item.path);
    else if (item.type === "text") clipboard.writeText(item.text);
    else if (item.type === "link") clipboard.writeText(item.url);
  });
}
