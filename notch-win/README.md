# notch.win — la Dynamic Island de boring.notch, sur Windows

Port fidèle de [boring.notch](https://github.com/TheBoredTeam/boring.notch) (macOS/SwiftUI)
vers Windows (Electron). Mêmes dimensions, mêmes springs, mêmes comportements.

## Lancer

```bash
cd notch-win
npm install
npm start        # la pilule apparaît en haut au centre de l'écran
```

## Interactions

- **Repos, musique en cours** : pilule décrite (pochette, « Titre — Artiste », 5 barres)
- **Survol ou clic** : île média 370×150 — pochette réelle, progression cliquable-glissable,
  boutons Apple Music (SMTC), onde
- **Clic hors pilule** : traversant (click-through) ; clic droit : menu
- **Ctrl+Shift+I** : ouvre 3 s ; **Ctrl+Shift+H** : sneak peek
- **App plein écran/maximisée** : la pilule s'efface (retour au bureau : elle revient)

## Tester

```bash
npm test                                  # 46 tests unitaires
npx electron scripts/smoke-capture.js     # captures PNG fermé/ouvert
```

## Architecture

```
src/main/       fenêtre top-centre, pont SMTC (PowerShell WinRT + helper C#), pollers
src/preload/    pont contextBridge
src/renderer/   UI : springs SwiftUI, SVG NotchShape, mini-lecteur, Inter
src/shared/     modules purs testés (springs, shape, playback, battery)
scripts/        ponts PowerShell (SMTC, fullscreen) + smoke capture
```

## Limites connues

- Apple Music Windows ignore le seek SMTC (détection auto, barre estompée) ;
  Spotify/Chrome le respectent.
- Le spectre est cosmétique (comme boring.notch), pas un FFT réel.
