// Shelf model — port of ShelfItem.swift / ShelfDropService / ShelfPersistenceService:
// items are file | text | link, deduped by identityKey, persisted as JSON
// (renderer keeps the array; main persists via IPC to %APPDATA%/notch-win/shelf/).
export function itemIdentityKey(item) {
  switch (item.type) {
    case "file": return `file:${item.path.toLowerCase()}`;
    case "text": return `text:${item.text}`;
    case "link": return `link:${item.url}`;
    default: return `${item.type}:unknown`;
  }
}

// Ingest order per ShelfDropService.swift: file → link → text.
export function addItem(list, item) {
  const key = itemIdentityKey(item);
  if (list.some((it) => itemIdentityKey(it) === key)) return { list, added: false };
  return { list: [...list, { ...item, id: `it_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }], added: true };
}

export function removeItem(list, id) {
  return list.filter((it) => it.id !== id);
}

export function fromFileList(filePaths) {
  return filePaths.map((p) => ({
    type: "file",
    path: p,
    name: p.split(/[\\/]/).pop(),
  }));
}

// Label shown under thumbnails (56×56 grid, ShelfItemView).
export function displayName(item) {
  if (item.type === "file") return item.name ?? item.path.split(/[\\/]/).pop();
  if (item.type === "link") return item.title ?? item.url.replace(/^https?:\/\//, "").split("/")[0];
  const t = item.text.trim();
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
}
