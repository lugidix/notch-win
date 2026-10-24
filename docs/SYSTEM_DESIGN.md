# System Design — notch.win (port Windows de boring.notch)

> Entrées : [`PRD.md`](PRD.md), [`SPEC-fidelite-boring-notch.md`](SPEC-fidelite-boring-notch.md).

## 1. Vue d'ensemble

```
┌──────────────────────────── Electron main (Node) ────────────────────────────┐
│ main.js            fenêtres, tray, cycle de vie, raccourcis globaux          │
│ window-manager.js  BrowserWindow notch (transparent/frameless/topmost)       │
│ config-store.js    réglages persistés %APPDATA%/notch-win/config.json        │
│ media/smtc-bridge  process PowerShell WinRT persistant (JSON-lines),         │
│                   équivalent direct de mediaremote-adapter (macOS)           │
│ battery/poll.js    CIM Win32_Battery, 2 s                                   │
│ fullscreen/poll.js fenêtre avant-plan == écran (user32 via PS)               │
└──────────────┬───────────────────────────────────────────────────────────────┘
               │ contextBridge (preload.js) — API minimale typée
┌──────────────▼──────────── Renderer (notch UI) ───────────────────────────────┐
│ index.html / notch.css / svg (NotchShape exact)                              │
│ spring-engine.js   physics stiffness/damping (≠ CSS transitions)             │
│ notch-store.js     machine à états closed|open, sneak peek, expanding view    │
│ components/        header, music-player, spectrum, marquee, battery,          │
│                    calendar, shelf, hello-animation, onboarding               │
└───────────────────────────────────────────────────────────────────────────────┘
  settings.html (fenêtre séparée) — groupes General/Appearance/Media/Battery/Shelf/Shortcuts
```

## 2. Mapping fidèle macOS → Windows

| boring.notch (Swift) | notch.win | Notes fidélité |
|---|---|---|
| `NSPanel` borderless, level mainMenu+3, CGSSpace | `BrowserWindow` `transparent, frameless, alwaysOnTop('screen-saver'), skipTaskbar, resizable:false` | top-centre : `x = midX − w/2, y = 0` (fenêtre 640×210) |
| `NotchShape` (path) | SVG `path` identique (quadratiques, rayons 6/14↔19/24 animés) | + rect noir 1 px top inset rTop |
| `.spring(response:dampingFraction:)` | `spring-engine.js` : `k=(2π/r)², c=2ζ(2π/r)`, intégration semi-implicite Euler par rAF | valeurs SPEC §3 |
| `BoringViewModel` (notchState, open/close) | `notch-store.js` (EventTarget) mêmes états + délais (hover 0,3 s, leave 100 ms) | |
| MediaRemote/mediaremote-adapter | `smtc-bridge` (PowerShell WinRT persistant, JSON-lines) | mêmes commandes : play/pause/toggle/next/prev/seek |
| `PlaybackState` + extrapolation | même modèle + `elapsed + (now−ts)×rate` | |
| IOPowerSources + BatteryActivityManager | `Win32_Battery` CIM poll 2 s → mêmes `statusText` | expanding chin 640, 3 s |
| EventKit calendrier | parseur ICS local + démo | roue 7→14 jours, auto-scroll |
| Shelf (bookmarks, items.json) | copies dans `%APPDATA%/notch-win/shelf/` + `items.json` | fichier/texte/lien, 56×56, drag-out |
| `Defaults[...]` | `config-store.js` mêmes clés/défauts (SPEC §4) | |
| MenuBarExtra / Sparkle / LSUIElement | Tray Electron / electron-updater (v1.1) / app sans dock | |
| Hotkeys ⌘⇧H / ⌘⇧I | `globalShortcut` Ctrl+Shift+H / Ctrl+Shift+I (configurables) | toggle-open garde 3 s min |
| FullscreenMediaDetection | poll user32 `GetForegroundWindow` rect == screen | nowPlayingOnly : compare AUMID du process média |

## 3. Décisions d'ingénierie

- **Springs en JS** (pas CSS `transition`) : reproduction exacte des Springs SwiftUI y compris pendant
  les gestes (progress interpolé). Une seule boucle rAF pilote width/height/radius/opacity/scale.
- **Pollers = processus enfants persistants** émettant JSON-lines (pas de spawn par requête) ;
  redémarrage automatique avec backoff ; logs `main.log`.
- **Renderer sans framework** (vanilla ES modules) : DOM léger, contrôlé frame par frame ;
  pas de VDOM entre la spring-loop et le layout.
- **SetWindowsRgn interdit** : la transpareur fenêtre + SVG suffit ; hit-testing via
  `setIgnoreMouseEvents(true, {forward:true})` hors du notch.
- **Sécurité Electron** : `contextIsolation:true`, `nodeIntegration:false`, pas de `remote`,
  IPC typé allowlisté ; scripts PowerShell embarqués en assets lisibles (pas d'eval de chaînes reçues du renderer).

## 4. Arborescence cible

```
notch-win/
├─ package.json            electron ^3x, scripts start/dev/test
├─ src/
│  ├─ main/                main.js, window-manager.js, tray.js, config-store.js,
│  │                       shortcuts.js, pollers/ (smtc.js, battery.js, fullscreen.js)
│  ├─ preload/             api.js (contextBridge)
│  ├─ renderer/
│  │  ├─ notch/            index.html, notch.css, js: spring-engine, notch-store,
│  │  │                    components/* (header, music, spectrum, marquee, battery,
│  │  │                    calendar, shelf, hello), assets/svg paths
│  │  └─ settings/         index.html + js
│  └─ shared/              constants.js (défauts = SPEC §4), spring-math.js
├─ scripts/                smtc-stream.ps1, battery.ps1, fullscreen.ps1
├─ tests/                  unit (spring engine, marquee math, state machine, ics parser)
└─ docs/                   (ce dossier, remonté à la racine projet via lien README)
```

## 5. Tests & qualification

- **Unitaires (vitest)** : spring-engine (valeurs cibles à ±1 px à t donné), notch-store (délais, transitions), extrapolation position, parseur ICS, config-store.
- **Intégration** : smtc-bridge parsing JSON-lines (fixtures), battery poll (fixtures CIM).
- **Visuel (GAN evaluator / rubrique)** : captures des états fermé/ouvert/transition comparées à la SPEC (dimensions, rayons, springs) — `gan-harness/eval-rubric.md`.
- **Smoke E2E** : lancement app, ouverture hover, lecture démo, fermeture.
