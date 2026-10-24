// Music controller — renderer side of the SMTC slice. Ports the observable
// behaviors of MusicManager.swift + MusicLiveActivity/NotchHomeView:
// marquee title/artist (minDuration 3s), album avg-color tinting
// (ensureMinimumBrightness 0.6), extrapolated progress (100ms tick), slider
// 5→9px drag, spectrum 4 bars (0.35–1.0 targets every 0.3s, autoreverse),
// closed-notch activity with widened pill, sneak peek on track change.
import {
  applyPoll,
  initialState,
  estimatedPosition,
  timeString,
  ensureMinimumBrightness,
  cssColor,
} from "../../../shared/playback-state.js";

const $ = (id) => document.getElementById(id);

// Title/artist go through innerHTML — escape everything.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

class Marquee {
  // MarqueeTextView.swift: duplicated text in an inner HStack (spacing 20),
  // linear scroll at width/30 px/s inside a clipped frame, initial delay
  // minDuration, target offset −(width + 10), restart on change.
  // The INNER strip is animated — animating the clipped container would move
  // its clipping window across neighbouring content. A ResizeObserver
  // re-measures when the notch opens/closes (the info column resizes with the
  // spring, and a measurement taken while closed goes stale once open).
  constructor(container, minDuration) {
    this.container = container;
    this.minDuration = minDuration;
    this.text = null;
    container.innerHTML =
      '<div class="marquee-inner"><span class="marquee-text"></span><span class="marquee-text" aria-hidden="true"></span></div>';
    this.inner = container.querySelector(".marquee-inner");
    this.spans = container.querySelectorAll(".marquee-text");
    this._resizeObserver = new ResizeObserver(() => this.relayout());
    this._resizeObserver.observe(container);
  }

  update(text) {
    if (text === this.text) return;
    this.text = text;
    this.spans.forEach((s) => (s.textContent = text));
    this._apply();
  }

  relayout() {
    if (!this.text) return;
    if (this._lastContainerW === this.container.offsetWidth) return;
    this._apply();
  }

  _apply() {
    this.inner.style.animation = "none";
    // measure after layout settles
    requestAnimationFrame(() => {
      this._lastContainerW = this.container.offsetWidth;
      const w = this.spans[0].offsetWidth;
      if (w > this.container.offsetWidth && w > 0) {
        // Loop copy only visible while scrolling (MarqueeText.swift:58)
        this.spans[1].style.opacity = "1";
        this.inner.style.setProperty("--marquee-offset", `${-(w + 10)}px`);
        this.inner.style.animation = `marquee-scroll ${w / 30}s linear ${this.minDuration}s infinite`;
      } else {
        this.spans[1].style.opacity = "0";
        this.inner.style.animation = "none";
      }
    });
  }
}

export function createMusicController({ store, config, api }) {
  const els = {
    artHalo: $("art-halo"),
    artImg: $("album-art-img"),
    artNote: $("art-note"),
    artDark: $("art-dark-overlay"),
    art: $("album-art"),
    title: $("song-title-marquee"),
    artist: $("song-artist-marquee"),
    sliderTrack: $("slider-track"),
    sliderFill: $("slider-fill"),
    timeElapsed: $("time-elapsed"),
    timeTotal: $("time-total"),
    iconPlay: $("icon-play"),
    iconPause: $("icon-pause"),
    closed: $("music-closed"),
    closedArtImg: $("mc-art-img"),
    closedArtNote: $("mc-art-note"),
    closedArt: $("mc-art"),
    spectrum: $("mc-spectrum"),
    sneak: $("sneak-peek"),
    sneakText: $("sneak-text"),
    // Compact media panel (Canopy-style: art/copy/wave + scrub + controls)
    cmpArtImg: $("cmp-art-img"),
    cmpArtNote: $("cmp-art-note"),
    cmpTitle: $("cmp-title"),
    cmpArtist: $("cmp-artist"),
    cmpSpectrum: $("cmp-spectrum"),
    cmpTrack: $("cmp-track"),
    cmpFill: $("cmp-fill"),
    cmpCurrent: $("cmp-current"),
    cmpDuration: $("cmp-duration"),
    cmpPlay: $("cmp-btn-play"),
    // Closed activity title (demo .tb-collapsed-title)
    mcTitle: $("mc-title"),
  };

  const titleMarquee = new Marquee(els.title, 3); // MarqueeText default (NotchHomeView.swift:143-154)
  const artistMarquee = new Marquee(els.artist, 3);
  const sneakMarquee = new Marquee(els.sneakText, 1); // sneak peek minDuration 1 (ContentView.swift:330)

  const spectrumSets = [els.spectrum, els.cmpSpectrum];

  let state = initialState();
  let dragging = false;
  let dragValue = 0;
  let spectrumTimer = null;
  let onActivityChange = null;

  // ---- progress ticker (TimelineView 0.1s, NotchHomeView.swift:193) --------
  const ticker = setInterval(() => {
    if (!state || state.status === "idle") return;
    const pos = dragging ? dragValue : estimatedPosition(state, Date.now());
    const dur = state.durationSec || 0;
    const pct = dur > 0 ? `${(pos / dur) * 100}%` : "0%";
    const cur = timeString(pos);
    const tot = timeString(dur);
    els.sliderFill.style.width = pct;
    els.timeElapsed.textContent = cur;
    els.timeTotal.textContent = tot;
    els.cmpFill.style.width = pct;
    els.cmpCurrent.textContent = cur;
    els.cmpDuration.textContent = tot;
  }, 100);

  // ---- average color (NSImage+Extensions.swift:19-70, canvas sampling) ----
  function computeAvgColor(b64, cb) {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 24;
      c.height = 24;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 24, 24);
      const d = ctx.getImageData(0, 0, 24, 24).data;
      let r = 0, g = 0, b = 0;
      const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
      }
      cb({ r: r / n, g: g / n, b: b / n });
    };
    img.onerror = () => cb({ r: 255, g: 255, b: 255 });
    img.src = `data:image/png;base64,${b64}`;
  }

  function applyTint() {
    const tinted = ensureMinimumBrightness(state.avgColor, 0.6);
    const col = cssColor(tinted);
    els.artist.style.color = config.playerColorTinting !== false ? col : "#8e8e93";
    els.timeElapsed.style.color = col;
    els.timeTotal.style.color = col;
    if (config.coloredSpectrogram !== false) {
      els.spectrum.style.setProperty("--bar-color", cssColor(state.avgColor));
      // Compact island bars stay white/light gray per the reference.
    }
  }

  // ---- spectrum (MusicVisualizer.swift:29-95) — drives every visible set ----
  function startSpectrum() {
    stopSpectrum();
    spectrumTimer = setInterval(() => {
      for (const set of spectrumSets) {
        set.querySelectorAll(".bar").forEach((bar) => {
          const target = 0.35 + Math.random() * 0.65;
          bar.style.transition = "transform .15s ease";
          bar.style.transform = `scaleY(${target})`;
          setTimeout(() => {
            bar.style.transition = "transform .15s ease";
            bar.style.transform = "scaleY(0.35)";
          }, 150);
        });
      }
    }, 300);
  }
  function stopSpectrum() {
    if (spectrumTimer) clearInterval(spectrumTimer);
    spectrumTimer = null;
    for (const set of spectrumSets) {
      set.querySelectorAll(".bar").forEach((bar) => (bar.style.transform = "scaleY(0.35)"));
    }
  }

  // ---- closed activity ------------------------------------------------------
  // Visible only while the notch is CLOSED (ContentView.swift:290-291 replaces
  // the live activity with the header when open — it never overlaps).
  let musicActive = false;

  function setActivity(active) {
    if (active === musicActive) return;
    musicActive = active;
    updateClosedVisibility();
    onActivityChange?.(musicActive);
  }

  function updateClosedVisibility() {
    const show = musicActive && store.notchState === "closed";
    els.closed.classList.toggle("visible", show);
    if (!show) els.sneak.classList.remove("visible");
  }

  store.addEventListener("open", updateClosedVisibility);
  store.addEventListener("close", updateClosedVisibility);

  // ---- public ---------------------------------------------------------------
  function handleMediaEvent(poll) {
    console.log(`[music] event: ${poll?.status} ${poll?.track?.title ?? "-"}`);
    const res = applyPoll(state, poll, Date.now(), config.waitInterval ?? 3);
    const seekable = poll?.track?.seekable !== false;
    els.cmpTrack?.classList.toggle("noseek", !seekable);
    els.sliderTrack?.classList.toggle("noseek", !seekable);
    state = res.state;

    if (state.status === "idle") {
      setActivity(false);
      stopSpectrum();
      $("btn-play").classList.remove("playing");
      els.cmpPlay?.classList.remove("playing");
      return;
    }

    titleMarquee.update(state.title || "—");
    artistMarquee.update(state.artist || "—");
    els.cmpTitle.textContent = state.title || "—";
    els.cmpArtist.textContent = state.artist || "—";
    els.mcTitle.innerHTML = `${escapeHtml(state.title || "")}<span class="mc-artist"> — ${escapeHtml(state.artist || "")}</span>`;
    els.closed.classList.toggle("paused", !state.isPlaying);

    const playing = state.isPlaying;
    $("btn-play").classList.toggle("playing", playing);
    els.cmpPlay?.classList.toggle("playing", playing);

    // artwork. display:"block" (not "") — the stylesheet default for the art
    // <img> is display:none, and clearing the inline style would fall back to it.
    if (poll.artB64) {
      const url = `data:image/png;base64,${poll.artB64}`;
      els.artImg.src = url;
      els.closedArtImg.src = url;
      els.cmpArtImg.src = url;
      els.artImg.style.display = "block";
      els.artNote.style.display = "none";
      els.closedArtImg.style.display = "block";
      els.closedArtNote.style.display = "none";
      els.cmpArtImg.style.display = "block";
      els.cmpArtNote.style.display = "none";
      els.artHalo.style.backgroundImage = `url("${url}")`;
      computeAvgColor(poll.artB64, (c) => {
        state.avgColor = c;
        applyTint();
      });
    }

    // lighting effect + dark overlay (AlbumArtView, NotchHomeView.swift:41-81)
    els.artHalo.style.opacity = playing ? "0.5" : "0";
    els.artDark.style.opacity = playing ? "0" : "0.8";

    // spectrum + closed activity visibility
    if (playing) startSpectrum();
    else stopSpectrum();
    setActivity((playing || !state.isPlayerIdle) && config.musicLiveActivityEnabled !== false);

    // sneak peek on track change while playing (MusicManager.swift:585-593)
    if (
      res.trackChanged &&
      playing &&
      config.enableSneakPeek &&
      store.notchState === "closed"
    ) {
      sneakMarquee.update(`${state.title} - ${state.artist}`);
      store.showSneakPeek("music", 1500);
    }
  }

  // sneak peek show/hide (store drives the timer)
  store.addEventListener("sneakpeek", (e) => {
    if (e.detail?.type === "music") els.sneak.classList.add("visible");
  });
  store.addEventListener("sneakpeek-end", () => els.sneak.classList.remove("visible"));

  // ---- controls -------------------------------------------------------------
  document.querySelectorAll("[data-cmd]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const cmd = btn.dataset.cmd;
      // Optimistic feedback: flip the UI instantly; the next poll (<=500ms)
      // reconciles with the real SMTC state.
      if (cmd === "togglePlay") {
        state.isPlaying = !state.isPlaying;
        $("btn-play").classList.toggle("playing", state.isPlaying);
        els.cmpPlay?.classList.toggle("playing", state.isPlaying);
        els.artHalo.style.opacity = state.isPlaying ? "0.5" : "0";
        els.artDark.style.opacity = state.isPlaying ? "0" : "0.8";
      }
      api?.mediaCommand(cmd);
    });
  });

  // slider seek (CustomSlider, NotchHomeView.swift:529-577) — shared handler
  function bindSlider(trackEl, fillEl) {
    trackEl.addEventListener("pointerdown", (e) => {
      dragging = true;
      trackEl.classList.add("dragging");
      const move = (ev) => {
        const r = trackEl.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
        dragValue = frac * (state.durationSec || 0);
        fillEl.style.width = `${frac * 100}%`;
      };
      move(e);
      const up = () => {
        dragging = false;
        trackEl.classList.remove("dragging");
        if (trackEl.classList.contains("noseek")) {
          fillEl.style.width = ""; // let the ticker restore the real position
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          return;
        }
        api?.mediaCommand("seek", dragValue);
        state.positionSec = dragValue; // optimistic jump; poll reconciles
        state.ts = Date.now();
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }
  bindSlider(els.sliderTrack, els.sliderFill);
  bindSlider(els.cmpTrack, els.cmpFill);

  // ---- hotkeys (boringNotchApp.swift:354-411) -------------------------------
  function handleHotkey(key) {
    if (key === "toggle-notch") {
      store.toggleWithMinimumOpen((ms, fn) => setTimeout(fn, ms)); // 3s minimum
    } else if (key === "toggle-sneak-peek") {
      if (store.sneakPeek.show) {
        store._emit("sneakpeek-end");
        store.sneakPeek = { show: false, type: null, value: 0 };
        els.sneak.classList.remove("visible");
      } else {
        sneakMarquee.update(`${state.title || ""} - ${state.artist || ""}`);
        store.showSneakPeek("music", 3000); // hotkey duration 3.0s
      }
    }
  }

  function setClosedArtSize(h) {
    const size = Math.max(0, h - 12);
    els.closedArt.style.width = `${size}px`;
    els.closedArt.style.height = `${size}px`;
  }

  return {
    handleMediaEvent,
    handleHotkey,
    setClosedArtSize,
    onActivityChange(cb) {
      onActivityChange = cb;
    },
    get state() {
      return state;
    },
    destroy() {
      clearInterval(ticker);
      stopSpectrum();
    },
  };
}
