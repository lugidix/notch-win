# PRD — « notch.win » : la Dynamic Island de boring.notch, fidèlement portée sur Windows

> Référence de fidélité : [`SPEC-fidelite-boring-notch.md`](SPEC-fidelite-boring-notch.md) (extrait du source macOS).
> Inventaire complet des features : rapport d'exploration intégré ci-dessous §5.
> Process d'orchestration : pipeline ecc `orch-build-mvp` (intake → research → plan → scaffold → TDD → review → commits).

## 1. Problème / vision

Les PC Windows n'ont pas d'encoche physique. boring.notch (macOS, SwiftUI) démontre l'expérience
« Dynamic Island » : une pilule noire en haut au centre de l'écran qui s'expand en un panneau
vivant (musique, batterie, calendrier, shelf de fichiers) avec des animations spring caractéristiques.
Nous recréons cette expérience **à l'identique** sur Windows : mêmes dimensions (640×190 ouvert,
185×32 fermé), même forme (rayons 6/14 ↔ 19/24), mêmes springs (0.42/0.8 ouverture, 0.45/1.0 fermeture),
mêmes comportements (hover 0,3 s, fermeture 100 ms, sneak peek 1,5 s…).

## 2. Choix techniques (décisions verrouillées)

| Décision | Choix | Justification |
|---|---|---|
| Runtime | **Electron** (Node 24 disponible) | Fenêtres transparentes frameless toujours-au-dessus, rendu HTML/CSS/SVG au pixel près, moteur spring JS calqué sur les paramètres SwiftUI, itération rapide. boring.notch utilise lui-même du web pour ses vues. |
| Shape | SVG path exact `NotchShape` | La forme asymétrique (coins hauts/bas différents, décalage horizontal) n'est pas exprimable en `border-radius` CSS standard. |
| Springs | moteur spring maison (stiffness/damping dérivés de response/dampingFraction — formule SPEC §3) | Reproduit la physique SwiftUI frame par frame. |
| Média (musique) | **SMTC Windows** via pont PowerShell WinRT (`GlobalSystemMediaTransportControlsSessionManager`) : polling ~1 s (titre/artiste/album/position/durée/rate/statut/shuffle/repeat) + commandes play/pause/next/prev/seek | Équivalent direct de `NowPlayingController`+mediaremote-adapter : source **système**, marche avec Spotify, Chrome, etc. Pochette : flux miniature SMTC → PNG temporaire ; fallback icône par défaut (comme `defaultmusic` sur macOS). |
| Extrapolation position | `elapsed + (now − timestamp) × playbackRate` | Identique à `MusicManager.estimatedPlaybackPosition` (rapport §5 A1). |
| Batterie | `Win32_Battery` (CIM) polling 2 s (%, BatteryStatus, branché) | Équivalent IOPowerSources ; statuts textuels repris tels quels. |
| Calendrier (MVP) | Fichier ICS local (`~/.notch-win/calendar.ics`) + démo | Pas d'API unifiée ; fidélité visuelle garantie (roue 7 passés → 14 futurs, barre couleur, auto-scroll), données branchables. |
| Plein écran | Fenêtre avant-plan == taille écran (helper PowerShell user32) | Réplique `hideNotchOption: nowPlayingOnly`. |
| Réglages | Fenêtre Electron dédiée + JSON `%APPDATA%/notch-win/config.json` | Équivalent Settings+Defaults, mêmes clés/défauts que macOS (SPEC §4). |

Hors périmètre v1 : remplacement HUD système, micro/FaceTime (absent du repo de toute façon), AirPlay,
YouTube Music, paroles, webcam mirror, multi-écrans simultanés (1 écran préféré, basculable), CGSSpace/SkyLight
(spécifique macOS — remplacé par topmost + régions interactives).

## 3. Critères d'acceptation (extraits de la SPEC, vérifiables)

1. Pilule noire 185×32 top-centre, clic-droit → Settings ; toujours-au-dessus sans voler le focus.
2. Survol 300 ms OU clic OU glisser-bas → expansion **640×190**, spring response 0.42 / damping 0.8, coins 19/24.
3. Sortie souris → fermeture après 100 ms, spring 0.45/1.0, coins 6/14.
4. Lecteur : pochette 90×90 r13 + halo (scale 1.3×1.4 rot 92° blur 40), titre/artiste marquee teintés avgColor, slider 5→9 px (spring 0.35/0.7), slots `[∅,prev,play,next,∅]` 30/40 px, temps écoulé/total.
5. Fermé : pochette (h−12)² r4 + spectre 4 barres 2 px (échelle aléatoire 0.35–1, 0,3 s, autoreverse) + élargissement `closedWidth + 2(h−12)+20`.
6. Musique de n'importe quelle app SMTC reflétée < 1,5 s ; position extrapolée entre polls.
7. Batterie : %, branché/débranché → expanding chin 640 de large, 3 s, statut « Plugged In / Charging battery / Not charging / Full charge » ; popover au clic.
8. Sneak peek piste : 1,5 s marquee gris « titre − artiste » (option, défaut off).
9. Shelf : drop sur notch fermé → ouverture vue shelf ; items fichier/texte/lien persistés (JSON) ; drag-out ; miniatures 56×56 ; clic-droit (ouvrir/révéler/copier chemin/supprimer).
10. HelloAnimation au premier lancement (serpent gradient 4 s) + onboarding minimal + son de bienvenue.
11. Tray : Settings / Redémarrer / Quitter ; raccourcis globaux toggle-open (ouvre 3 s min) et toggle-sneak-peek.
12. Masquage si app plein écran au premier plan (nowPlayingOnly).

## 4. Risques & mitigations

- **SMTC/PowerShell** : démarrage à froid ~1 s → poll long-running (process persistant émettant du JSON-lines, comme mediaremote-adapter) plutôt que spawn par requête ; pochette absente → fallback.
- Volume système : pas d'API Node → slot volume en v1.1 via helper AudioEndpoint ; slots par défaut sans volume (identique macOS).
- Fenêtres transparentes : forcer `--enable-features` GPU ; test sur machine cible.
- Fidélité animation : validée par rubrique GAN (évaluateur visuel) + tests unitaires du moteur spring.

## 5. Priorisation (issue de l'exploration du repo)

- **P0 (cœur « Dynamic Island feel »)** : panneau top-centre + shape + springs ; états fermés (activité musique, batterie) ; hover/clic/gestes ouverture-fermeture ; vue ouverte complète (header, lecteur, calendrier opt.) ; contrôle SMTC réel ; shelf ; settings ; tray + login ; hotkeys.
- **P1** : HUD volume/lumino, sneak peek inline, masquage plein écran, multi-affichages, teinte pochette (avgColor), gestes, verrouillage.
- **P2** : webcam, quick share, Lottie custom, paroles, YTM.
