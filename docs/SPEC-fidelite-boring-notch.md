# SPEC de fidélité — boring.notch (macOS) → port Windows

> Document extrait directement du source SwiftUI du repo `reference/boring.notch`
> (commit cloné le 2026-10-23). Chaque valeur est référencée `fichier:ligne`.
> Ce document fait foi pour toute implémentation Windows : mêmes dimensions,
> mêmes courbes de spring, mêmes durées, mêmes comportements.

---

## 1. Géométrie

### 1.1 Tailles globales

| Élément | Valeur | Source |
|---|---|---|
| Notch OUVERT (open) | **640 × 190** | `sizing/matters.swift:16` |
| Fenêtre hôte | 640 × (190 + 20 padding ombre) = **640 × 210** | `sizing/matters.swift:15-17` |
| Padding ombre (shadow) | 20 | `sizing/matters.swift:15` |
| Notch FERMÉ — largeur | **185** (défaut) ; écrans à encoche : `frame.width − auxLeft − auxRight + 4` (largeur exacte de l'encoche physique) | `sizing/matters.swift:42,56` |
| Notch FERMÉ — hauteur | **32** (défaut `notchHeight`/`nonNotchHeight`) ; modes : `matchRealNotchSize` (= safeAreaInsets.top) ou `matchMenuBar` (= hauteur barre de menus) | `sizing/matters.swift:41,60-74`, `models/Constants.swift:83-92` |
| Sneak peek batterie | 160 × 1 (croissance animée) | `sizing/matters.swift:13` |
| Sneak peek téléchargement | 65 × 1 | `sizing/matters.swift:12` |
| Espacement générique `spacing` | 16 | `models/Constants.swift:19` |

### 1.2 Forme du notch (`NotchShape`)

Path exact — rayons de coin **asymétriques haut/bas** (`components/Notch/NotchShape.swift:36-119`, `sizing/matters.swift:18`) :

| État | Coin haut (topCornerRadius) | Coin bas (bottomCornerRadius) |
|---|---|---|
| Fermé | **6** | **14** |
| Ouvert (si `cornerRadiusScaling`, défaut true) | **19** | **24** |

Construction du path (à répliquer en SVG) : coins hauts = quadratiques du point `(minX,minY)` vers `(minX+rTop, minY+rTop)` (contrôle `(minX+rTop, minY)`) ; coins bas décalés horizontalement de `rTop` : de `(minX+rTop, maxY−rBot)` vers `(minX+rTop+rBot, maxY)`. Un rectangle noir 1 px de haut, inset horizontal `rTop`, est superposé en haut pour « carrer » le bord (`ContentView.swift:105-110`).

### 1.3 Musique

| Élément | Valeur | Source |
|---|---|---|
| Pochette fermée | (hauteurNotch − 12)², rayon 4 — défaut ≈ **20×20 r4** | `sizing/matters.swift:22`, `ContentView.swift:399-402` |
| Pochette ouverte | **90×90, rayon 13** (padding 5 autour) | `sizing/matters.swift:21-22`, `NotchHomeView.swift:21` |
| Halo lumineux pochette | scale 1.3×1.4, rotation 92°, blur 40, opacité 0.5 (si lecture) | `NotchHomeView.swift:41-56` (`lightingEffect` défaut true) |
| Overlay sombre pochette | noir, blur 50, opacité 0.8 quand pause | `NotchHomeView.swift:75-81` |
| Scale pochette | 1 en lecture, 0.85 en pause | `NotchHomeView.swift:69` |
| Icône app sur pochette | 30×30, offset (+10,+10), transition scale+opacity | `NotchHomeView.swift:99-109` |
| Largeur fermée avec musique | `closedWidth + 2·max(0, h−12) + 20` (le notch fermé s'élargit) | `ContentView.swift:68-72` |

### 1.4 Vue ouverte (layout 640×190)

- HStack aligné en haut, espacement **15** (10 si caméra+calendrier) : `NotchHomeView.swift:443`
- Calendrier : largeur **215** (170 si caméra affichée) : `NotchHomeView.swift:446-448`
- Header : hauteur `max(24, hauteurNotchFermé)` : `ContentView.swift:296-297`
- Capsules header (caméra, réglages) : **30×30**, batterie largeur 30 : `BoringHeader.swift:49-91`
- Zone ouverte : padding horizontal 12 + rayon de coin, padding bas 12 : `ContentView.swift:96-102`
- Boutons contrôle : **30×30** (moyen) / **40×40** (play/pause), icône `largeTitle` vs `body`, capsule `gray 0.2` au survol : `HoverButton.swift:20-35`
- Barre d'outils slots : HStack espacement **6**, centré : `NotchHomeView.swift:215-221` ; slots par défaut `[vide, précédent, playPause, suivant, vide]` : `MusicControlButton.swift:24-30`

### 1.5 Slider musique (`CustomSlider`)

- Piste : `gray opacity 0.3` ; remplissage : blanc (ou couleur pochette/accent), `sliderColor` défaut white : `NotchHomeView.swift:529-577`, `Constants.swift:111-114`
- Hauteur : **5 px**, **9 px pendant le drag** (spring response 0.35, damping 0.7 sur le changement) : `NotchHomeView.swift:541,575`
- Coin : `hauteur/2` (pill)
- Temps : `caption` (≈12 pt), `medium`, couleur = teinte pochette (luminosité min 0.6) ou gris ; écoulé à gauche, durée à droite : `NotchHomeView.swift:497-507`

### 1.6 Typographie / couleurs

| Élément | Style |
|---|---|
| Titre (ouvert) | `.headline` SF Pro (~13 pt semibold), blanc, marquee |
| Artiste | `.headline medium`, teinte `avgColor` pochette (min luminosité 0.6) ou gris |
| Header | `.system(.headline, design: .rounded)` |
| Fond | **noir pur** (`.background(.black)`), `preferredColorScheme(.dark)` |
| Ombre | noir 0.7, rayon **6** (si cornerRadiusScaling) sinon 4 ; visible seulement ouvert/survol (`enableShadow` défaut true) |
| Teinte spectre | gradient de `avgColor` pochette si `coloredSpectrogram` (défaut true), sinon gris |

## 2. Machine à états & interactions (`ContentView.swift`)

États : `NotchState.closed | .open` (`enums/generic.swift:22-25`) ; vues `home | shelf` ; `ContentType normal|menu|settings`.

| Interaction | Comportement | Source |
|---|---|---|
| Survol (fermé) | `openNotchOnHover` (défaut **true**) → ouverture après **`minimumHoverDuration` = 0,3 s** de survol | `ContentView.swift:526-541`, `Constants.swift:79-81` |
| Sortie de survol | fermeture après **100 ms** (annulée si re-survol) ; pas de fermeture si popover batterie ou partage actif | `ContentView.swift:542-557` |
| Clic | ouverture (spring interactif) | `ContentView.swift:134-136` |
| Glisser vers le bas (fermé) | progression `translation/gestureSensitivity(200)·20`, scale 1+p·0.01 (min 0.6), ouverture au-delà du seuil | `ContentView.swift:562-583`, `Constants.swift:121-123` |
| Glisser vers le haut (ouvert) | idem inversé → fermeture | `ContentView.swift:585-611` |
| Hover bouton | `.smooth(duration: 0.3)` | `HoverButton.swift:40-44` |
| Masquage plein écran | `hideNotchOption` défaut **nowPlayingOnly** → `hideOnClosed` (animé `.smooth`) | `BoringViewModel.swift:72-103`, `Constants.swift:181` |
| Fermeture impossible si | partage actif (`SharingStateManager.preventNotchClose`) | `BoringViewModel.swift:200-204` |
| À l'ouverture | rafraîchit forcément les infos musique | `BoringViewModel.swift:192-198` |
| À la fermeture | reset sneak peek/popover ; vue = shelf si fichiers + `openShelfByDefault`(true), sinon home | `BoringViewModel.swift:200-219` |
| Hotkey toggle ouverture | ouvre 3 s minimum puis ferme | `boringNotchApp.swift:368-411` |
| Drag de fichiers vers zone notch (fermé) | ouvre + vue shelf (global `DragDetector`, `expandedDragDetection` true) | `boringNotchApp.swift:195-232` |

### 2.1 Sneak peek / expanding view (`BoringViewCoordinator.swift`)

- Types : brightness, volume, backlight, music, mic, battery, download (`:13-21`)
- Durées : sneak peek défaut **1,5 s** (musique via hotkey **3 s**) ; expanding view : download **2 s**, autres **3 s** (`:209,233,284`)
- Apparition/disparition animées `.smooth`
- Musique fermée (sneak peek standard) : marquee `titre − artiste`, gris, padding bas 10 (`ContentView.swift:324-336`)
- Batterie (fermé, `showPowerStatusNotifications` true) : largeur **640**, texte statut + batterie 30 px (`ContentView.swift:260-286`, `sizing/matters.swift` chinWidth 640)
- HUD inline (défaut off) : InlineHUD dans le notch fermé ; sinon `SystemEventIndicatorModifier` sous le notch (padding bas 10, leading 4, trailing 8)

## 3. Animations — valeurs exactes

| Animation | Paramètres | Source |
|---|---|---|
| **Ouverture notch** | `spring(response: 0.42, dampingFraction: 0.8, blendDuration: 0)` | `ContentView.swift:123` |
| **Fermeture notch** | `spring(response: 0.45, dampingFraction: 1.0, blendDuration: 0)` | `ContentView.swift:124` |
| Spring interactif (hover/clic/gestes) | `interactiveSpring(response: 0.38, dampingFraction: 0.8, blendDuration: 0)` | `ContentView.swift:41` |
| Anim générique (hello/closeHello) | `.spring(.bouncy(duration: 0.4))` = spring(response 0.4, damping ≈ 0.85) ; fallback `timingCurve(0.16, 1, 0.3, 1, 0.7)` (= easeOutExpo-like) | `animations/drop.swift:19-25` |
| Transition vues home/shelf | `scale(0.8, anchor top) + opacity`, `.smooth(duration: 0.35)` | `ContentView.swift:354-358` |
| Slider (drag on/off) | `spring(response: 0.35, dampingFraction: 0.7)` | `NotchHomeView.swift:575` |
| Masquage plein écran / sneak peek | `.smooth` (= spring(response d, damping 1.0)) | `BoringViewModel.swift:98` |
| Gestes | `.smooth` sur gestureProgress | `ContentView.swift:128,213` |
| Transition insertion contenu ouvert | `opacity + move(top)` ; retrait `opacity` ; blur 30 fermé | `NotchHomeView.swift:464-465` |
| Header fermé | opacity 0 + blur 20 | `BoringHeader.swift:26-27,97-98` |
| Caméra | `interactiveSpring(response: 0.32, damping 0.76)` ; blur 20→0 | `NotchHomeView.swift:460-461` |
| Hover bouton | `.smooth(duration: 0.3)` | `HoverButton.swift:41` |
| Volume slider show/hide | `easeInOut 0.12` / `easeInOut 0.2` | `NotchHomeView.swift:342,385` |
| Album art app icon | `.scale + .opacity` | `NotchHomeView.swift:106` |

**Conversion spring SwiftUI → JS** (moteur spring maison, intégration par frame) :
`stiffness = (2π/response)²`, `damping = 2·dampingFraction·(2π/response)` (masse 1).
Ex. ouverture : ω = 2π/0.42 ≈ 14.96 rad/s, ζ = 0.8 → stiffness ≈ 223.8, damping ≈ 23.94.

### 3.1 Visualiseur audio (fermé) (`MusicVisualizer.swift`)

- **4 barres**, largeur **2 px**, espacement **2 px**, hauteur **14** (fenêtre 16×12 masquée) (`:30-34`, `ContentView.swift:462-463`)
- Capsules arrondies (rayon = largeur/2), blanches ou gradient avgColor (rect 50 px masqué)
- Animation : cible aléatoire `scale.y ∈ [0.35, 1.0]` toutes les **0,3 s**, animation 0,3 s **autoreverse**, 24 fps (`:57-87`)
- Pause : reset à 0.35

### 3.2 Marquee (`MarqueeTextView.swift`)

- Texte dupliqué, défilement **linéaire vitesse = largeurTexte/30 px/s**, délai initial `minDuration` (défaut 3 ; musique sneak 1 ; titre 0.4), offset cible `−(largeur + 10)`, redémarrage au changement de texte (`:38-92`)

### 3.3 HelloAnimation (premier lancement) (`animations/HelloAnimation.swift`)

- Serpent brillant tracé progressivement : gradient linéaire blue→purple(0.2)→red(0.4)→mint(0.5)→indigo(0.7)→pink(0.9)→blue (`:43-57`)
- Triple contour : lineWidth 4 sans blur + 8 avec blur 8 + 8 avec blur 4, caps rondes (`:130-153`)
- Démarrage après **0,6 s** (attendre l'expansion), durée **easeInOut 4 s**, puis fermeture (`:112-127`)
- Cadre : largeurNotchFermé × 80, padding haut 40 (`ContentView.swift:251-257`) ; path paramétrique complet dans le source (`:10-39`) — répliquable tel quel en SVG

## 4. Valeurs par défaut des réglages (`models/Constants.swift`)

- hover: ouverture au survol **true**, durée min **0,3 s**, haptics true
- apparence: cornerRadiusScaling true, shadow true, lightingEffect true, mirror false, calendrier **false**, emojis false, settingsIconInNotch true
- musique: visualiseur true, spectrogramme coloré true, teinte joueur true, sneak peek **false** (waitInterval 3), slots `[∅, prev, play, next, ∅]`
- batterie: notifications alimentation true, indicateur true, pourcentage true, icônes true
- téléchargements: écoute true, Safari true, style progression
- HUD: remplacement false, inline false, HUD notch ouvert true
- shelf: **activé true**, ouverture par défaut true, tap pour ouvrir true, détection drag étendue true, copie au drag false, suppression auto false
- gestes: activés true, fermeture true, sensibilité **200**
- plein écran: cacher **nowPlayingOnly**
- écrans: tous les écrans false, bascule auto true, écran verrouillé false
- barre de titre masquée true ; contrôle média défaut = system Now Playing

## 5. Fenêtre & cycle de vie (`boringNotchApp.swift`)

- Fenêtre borderless `nonactivatingPanel`, **top-centre** : `x = midX − w/2`, collée au bord haut (`:268-280`)
- Multi-écrans : une fenêtre par écran (option) ou écran préféré avec bascule auto (`:477-543`)
- Verrouillage écran : masqué par défaut (`showOnLockScreen` false)
- Menu barre (MenuBarExtra) : Settings, Check for Updates, Restart, Quit (`:32-48`)
- Premier lancement : onboarding (fenêtre 400×600) + HelloAnimation + son de bienvenue (`:425-436,561-597`)
- Context menu notch : Settings (⌘,) (`ContentView.swift:185-197`)
