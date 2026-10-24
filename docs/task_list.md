# Task list — notch.win (tranches verticales, GATE 1)

> Issue de [`PRD.md`](PRD.md) + [`SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md), contraintes de fidélité dans
> [`SPEC-fidelite-boring-notch.md`](SPEC-fidelite-boring-notch.md). Une tranche = un chemin
> bout-en-bout livrable (fenêtre → UI → interaction → données), tests inclus.
> Chaque tranche : TDD (vitest) → review → commit conventionnel unique.

## Slice 1 — Scaffold end-to-end : le notch vivant (cœur fidélité)
1. `package.json` electron + vitest ; structure `notch-win/` (SYSTEM_DESIGN §4).
2. `spring-engine.js` (+ maths `spring-math.js`) — TDD : cibles ±1 px aux instants clés
   (ouverture 0.42/0.8, fermeture 0.45/1.0, interactif 0.38/0.8, smooth).
3. `notch-store.js` — TDD : états closed/open, hover 0,3 s, leave 100 ms, blocages (shelf drop).
4. `window-manager.js` : BrowserWindow 640×210 transparent/frameless/topmost/skipTaskbar,
   top-centre, non-activating (blur sans voler focus).
5. Renderer : `index.html` + SVG NotchShape (6/14 ↔ 19/24 animés) + rect noir 1 px ;
   pill fermée 185×32 ; ouverture → layout 640×190 (header vide + zone contenu) ;
   interactions hover/clic/glisser (progress scale) ; ombre 0.7/r6 ; clic-droit → Settings (stub).
6. `config-store.js` avec défauts = SPEC §4.
✅ Démo : survol/clic → expansion spring fidèle ; quitte → fermeture.

## Slice 2 — Musique réelle (SMTC) + identité fermée
1. `scripts/smtc-stream.ps1` (WinRT SMTC, JSON-lines persistant) + `main/pollers/smtc.js`
   (restart backoff) — TDD parsing sur fixtures.
2. Modèle `PlaybackState` + extrapolation `elapsed + (now−ts)×rate` — TDD.
3. Lecteur ouvert : pochette 90×90 r13 + halo + overlay pause + icône app, marquee
   titre/artiste teintés avgColor, slider 5→9 (spring 0.35/0.7) + temps, slots
   [∅,prev,play,next,∅] 30/40, commandes SMTC, volume slot (optionnel dégradable).
4. Fermé : activité musique (pochette (h−12)² r4, spectre 4 barres 2 px 0.35–1/0.3 s
   autoreverse, élargissement closedWidth+2(h−12)+20), disparition après 3 s pause.
5. Sneak peek piste (1,5 s, marquee gris) + hotkeys Ctrl+Shift+H/I (toggle-open 3 s min).
✅ Démo : Spotify/Chrome → reflété < 1,5 s, contrôle complet.

## Slice 3 — Batterie + plein écran
1. `battery.ps1` (CIM) + poll 2 s — TDD fixtures ; statuts « Plugged In / Charging battery /
   Not charging / Full charge », %, branché.
2. Expanding chin 640 (3 s) branché/débranché, icônes couleur (jaune low, rouge ≤20, vert charge),
   popover header (max capacité, temps restant estimé).
3. `fullscreen.ps1` (GetForegroundWindow == screen) → hideOnClosed `.smooth`, nowPlayingOnly.
✅ Démo : brancher/débrancher → animation ; app plein écran → notch masqué.

## Slice 4 — Shelf (drag & drop)
1. Drop sur notch fermé (fenêtre + zone) → ouverture vue shelf ; vue shelf (grille,
   miniatures 56×56, drop panel pointillé).
2. Items fichier/texte/lien, persistance `%APPDATA%/notch-win/shelf/items.json`, dédup,
   drag-out (copie), clic-droit (ouvrir/révéler/copier chemin/supprimer), tabs Home/Shelf.
✅ Démo : déposer 3 fichiers, fermer/rouvrir → persistés, drag-out vers l'explorateur.

## Slice 5 — Calendrier, onboarding, hello, settings, tray
1. Parseur ICS (TDD) + calendrier ouvert (largeur 215, roue 7 passés→14 futurs, barres
   couleur, auto-scroll prochain événement, rappels déco) ; fichier `~/.notch-win/calendar.ics`.
2. HelloAnimation (serpent SVG gradient, 0.6 s délai, easeInOut 4 s, triple contour)
   + son de bienvenue + onboarding minimal (400×600, étapes simplifiées).
3. Fenêtre Settings (groupes SPEC §4, mêmes clés/défauts) + tray (Settings/Redémarrer/Quitter).
✅ Démo : premier lancement complet ; réglages persistants appliqués au notch en live.

## Non-livré v1 (P1/P2 du PRD §5) : HUD remplacement, micro, YTM, paroles, webcam,
multi-écrans simultanés, updater — documentés pour v1.1.
