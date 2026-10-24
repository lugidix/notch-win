// Shelf controller — drop target on the open notch, grid of items, context
// menu, drag-out to Explorer, persistence via notchApi.
// Model: shared/shelf.js (ShelfItem/Service port).
import { addItem, removeItem, fromFileList, displayName } from "../../../shared/shelf.js";

const $ = (id) => document.getElementById(id);

export function createShelfController({ store, api }) {
  const els = {
    view: $("shelf-view"),
    grid: $("shelf-grid"),
    tabHome: $("tab-home"),
    tabShelf: $("tab-shelf"),
  };

  let items = [];
  let loaded = false;
  let currentView = "home";
  let onSwitch = null;

  function persist() {
    api?.setShelf(items);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function thumb(item) {
    if (item.type === "text") {
      return `<div class="shelf-thumb text-item"><span>${escapeHtml(item.text)}</span></div>`;
    }
    const icon = item.type === "link" ? "🔗" : "📄";
    return `<div class="shelf-thumb"><span class="thumb-icon">${icon}</span></div>`;
  }

  function render() {
    els.grid.innerHTML = items
      .map(
        (item) => `
      <div class="shelf-item" data-id="${item.id}" draggable="${item.type === "file"}">
        ${thumb(item)}
        <span class="shelf-name">${escapeHtml(displayName(item))}</span>
      </div>`
      )
      .join("");
  }

  function bindItemEvents(el, item) {
    el.addEventListener("click", () => api?.openItem(item));
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showItemMenu(e, item);
    });
    if (item.type === "file") {
      el.addEventListener("dragstart", (e) => {
        // Drag back out to Explorer (ShelfItemView NSDraggingSource equivalent)
        e.dataTransfer.setData("text/plain", item.path);
        e.dataTransfer.effectAllowed = "copy";
      });
    }
  }

  function showItemMenu(e, item) {
    const old = document.getElementById("shelf-ctx");
    old?.remove();
    const menu = document.createElement("div");
    menu.id = "shelf-ctx";
    const entries = [["Open", () => api?.openItem(item)]];
    if (item.type === "file") {
      entries.push(["Reveal in File Explorer", () => api?.revealItem(item)]);
      entries.push(["Copy path", () => api?.copyItemPath(item)]);
    } else {
      entries.push(["Copy", () => api?.copyItemPath(item)]);
    }
    entries.push(["Remove", () => {
      items = removeItem(items, item.id);
      render();
      persist();
    }]);
    menu.innerHTML = entries.map(([label], i) => `<div data-i="${i}" class="shelf-ctx-row">${label}</div>`).join("");
    menu.style.cssText = `position:fixed;left:${Math.min(e.clientX, window.innerWidth - 170)}px;top:${e.clientY}px;z-index:20;background:#1c1c1e;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:4px;min-width:160px;box-shadow:0 6px 20px rgba(0,0,0,.5)`;
    menu.querySelectorAll(".shelf-ctx-row").forEach((row, i) => {
      row.style.cssText = "padding:6px 10px;border-radius:7px;font:500 11px Inter,sans-serif;color:#fff;cursor:pointer";
      row.addEventListener("click", () => { entries[i][1](); menu.remove(); });
      row.addEventListener("mouseenter", () => (row.style.background = "rgba(255,255,255,.12)"));
      row.addEventListener("mouseleave", () => (row.style.background = "transparent"));
    });
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
  }

  // ---- drop handling (open notch) ----
  els.view.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    els.view.classList.add("dragover");
  });
  els.view.addEventListener("dragleave", () => els.view.classList.remove("dragover"));
  els.view.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    els.view.classList.remove("dragover");
    const files = [...(e.dataTransfer?.files ?? [])].map((f) => f.path).filter(Boolean);
    for (const item of fromFileList(files)) {
      items = addItem(items, item).list;
    }
    const text = e.dataTransfer?.getData("text/plain");
    if (!files.length && text && /^https?:\/\//i.test(text)) {
      items = addItem(items, { type: "link", url: text }).list;
    } else if (!files.length && text) {
      items = addItem(items, { type: "text", text }).list;
    }
    render();
    persist();
  });

  // rebind grid children after each render
  const observer = new MutationObserver(() => {
    els.grid.querySelectorAll(".shelf-item").forEach((el) => {
      const item = items.find((it) => it.id === el.dataset.id);
      if (item) bindItemEvents(el, item);
    });
  });
  observer.observe(els.grid, { childList: true });

  // tabs
  function setView(view) {
    currentView = view;
    els.tabHome.classList.toggle("active", view === "home");
    els.tabShelf.classList.toggle("active", view === "shelf");
    onSwitch?.(view);
  }
  els.tabHome.addEventListener("click", (e) => { e.stopPropagation(); setView("home"); });
  els.tabShelf.addEventListener("click", (e) => { e.stopPropagation(); setView("shelf"); });

  async function init() {
    items = (await api?.getShelf()) ?? [];
    loaded = true;
    render();
  }
  init();

  return {
    setView,
    get currentView() { return currentView; },
    onSwitchView(cb) { onSwitch = cb; },
    get isEmpty() { return items.length === 0; },
    get shouldOpenOnShelf() { return loaded && items.length > 0; },
  };
}
