import { app, ipcMain, globalShortcut, net } from "electron";
import { createNotchWindow } from "./window-manager.js";
import { ConfigStore } from "./config-store.js";
import { registerNotchIpc } from "./ipc.js";
import { startSmtcBridge } from "./pollers/smtc.js";
import { startJsonPoller } from "./pollers/generic.js";
import { registerShelfIpc } from "./shelf-store.js";

// Artwork fallback: several SMTC sources (e.g. Apple Music Windows) expose no
// thumbnail. Fetch the cover from the public iTunes Search API in the main
// process (no CORS) and re-emit the media event enriched with artB64.
const artCache = new Map(); // "title|artist" -> base64 | null
const ART_CACHE_MAX = 50;

async function searchItunesArtwork(title, cleanArtist) {
  const norm = (s) =>
    (s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const titleN = norm(title);
  const artistN = norm(cleanArtist);
  for (const term of [`${title} ${cleanArtist}`.trim(), title]) {
    if (!term) continue;
    try {
      const q = encodeURIComponent(term);
      const search = await net.fetch(
        `https://itunes.apple.com/search?term=${q}&entity=song&limit=5&country=FR`
      );
      const json = await search.json();
      for (const r of json?.results ?? []) {
        // Strict validation — a fuzzy-only match shows the WRONG cover
        // (e.g. "Dadi - Saison" for "HMZ - Saison").
        const rTitle = norm(r.trackName);
        const rArtist = norm(r.artistName);
        const titleOk =
          rTitle === titleN || rTitle.includes(titleN) || titleN.includes(rTitle);
        const artistTokens = artistN.split(" ").filter(Boolean);
        const artistOk =
          !artistTokens.length ||
          artistTokens.some((tok) => tok.length > 2 && (rArtist.includes(tok) || artistN.includes(norm(rArtist))));
        if (titleOk && artistOk) {
          const url = r.artworkUrl100?.replace("100x100", "512x512");
          if (url) {
            const img = await net.fetch(url);
            return Buffer.from(await img.arrayBuffer()).toString("base64");
          }
        }
      }
    } catch (err) {
      console.log(`[art] itunes fetch failed: ${err.message}`);
    }
  }
  return null;
}

async function fetchItunesArt(title, artist) {
  const key = `${title}|${artist}`;
  if (artCache.has(key)) return artCache.get(key);
  // SMTC artist fields often carry extra labels ("A — Album (Edition)"):
  // try the cleaned artist, then the bare title.
  const cleanArtist = (artist ?? "").split(/[—–-]/)[0].trim();
  const result = await searchItunesArtwork(title, cleanArtist);
  if (artCache.size >= ART_CACHE_MAX) {
    const first = artCache.keys().next().value;
    artCache.delete(first);
  }
  artCache.set(key, result);
  return result;
}

// Single instance — the notch must never be duplicated.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.whenReady().then(() => {
  const config = ConfigStore.create();
  const win = createNotchWindow();

  // Click-through, context menu, config IPC (shared with test scripts).
  registerNotchIpc(win, config);

  // Media bridge: boring.notch's mediaremote-adapter equivalent, via SMTC.
  let lastTrackKey = "";
  const bridge = startSmtcBridge({
    onMedia: (m) => {
      const art = m.artB64 ? ` +art${Math.round(m.artB64.length / 1024)}KB` : "";
      console.log(`[smtc→renderer] ${m.status} ${m.track?.title ?? "-"}${art}`);
      if (win.isDestroyed()) return;
      const t = m.track;
      const trackKey = t ? `${t.title}|${t.artist}` : "";
      if (!m.artB64 && t?.title && trackKey && trackKey !== lastTrackKey) {
        lastTrackKey = trackKey;
        fetchItunesArt(t.title, t.artist).then((b64) => {
          if (b64 && !win.isDestroyed()) {
            win.webContents.send("media", { ...m, artB64: b64, ts: m.ts });
            console.log(`[art] cover resolved via iTunes for "${t.title}"`);
          } else {
            console.log(`[art] no cover found for "${t.title}"`);
          }
        });
      }
      win.webContents.send("media", m);
    },
    onLog: (l) => console.log(l),
  });
  ipcMain.on("media-command", (_e, { cmd, arg }) => {
    console.log(`[cmd] ${cmd}${arg !== undefined ? ` ${arg}` : ""}`);
    bridge.send(cmd, arg);
  });

  // Shelf persistence (drag & drop items, slice 4)
  registerShelfIpc();

  // Fullscreen detection poller (hides the closed notch while an app is
  // fullscreen — hideNotchOption: nowPlayingOnly default).
  startJsonPoller({
    script: "fullscreen.ps1",
    channel: "fullscreen",
    win,
    onLog: (l) => console.log(`[fullscreen] ${l}`),
  });


  // Hotkeys — boring.notch: ⌘⇧I toggle open (3s min), ⌘⇧H toggle sneak peek.
  globalShortcut.register("Control+Shift+I", () =>
    win.webContents.send("hotkey", "toggle-notch")
  );
  globalShortcut.register("Control+Shift+H", () =>
    win.webContents.send("hotkey", "toggle-sneak-peek")
  );

  app.on("second-instance", () => {
    win.setAlwaysOnTop(true, "screen-saver");
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => app.quit());
