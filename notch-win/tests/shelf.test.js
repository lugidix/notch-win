import { describe, it, expect } from "vitest";
import {
  itemIdentityKey,
  addItem,
  removeItem,
  fromFileList,
  displayName,
} from "../src/shared/shelf.js";

describe("shelf model", () => {
  it("dedupes by identity key (case-insensitive paths)", () => {
    const a = { type: "file", path: "C:\\Users\\me\\a.txt", name: "a.txt" };
    const b = { type: "file", path: "c:\\users\\me\\a.txt", name: "a.txt" };
    const r = addItem([a], b);
    expect(r.added).toBe(false);
    expect(r.list).toHaveLength(1);
  });

  it("adds distinct items with generated ids", () => {
    const r = addItem([], { type: "file", path: "C:\\x.txt", name: "x.txt" });
    expect(r.added).toBe(true);
    expect(r.list[0].id).toMatch(/^it_/);
  });

  it("handles text and link items", () => {
    let list = [];
    list = addItem(list, { type: "text", text: "hello" }).list;
    list = addItem(list, { type: "link", url: "https://example.com" }).list;
    expect(list).toHaveLength(2);
    list = addItem(list, { type: "link", url: "https://example.com" }).list; // dedupe
    expect(list).toHaveLength(2);
  });

  it("removes by id", () => {
    const { list } = addItem([], { type: "text", text: "bye" });
    const after = removeItem(list, list[0].id);
    expect(after).toHaveLength(0);
  });

  it("maps dropped file paths to file items", () => {
    const items = fromFileList(["C:\\a\\b.txt", "D:/c/d.png"]);
    expect(items[0].name).toBe("b.txt");
    expect(items[1].name).toBe("d.png");
  });

  it("display names: file name, link host, truncated text", () => {
    expect(displayName({ type: "file", path: "C:\\x\\y.txt" })).toBe("y.txt");
    expect(displayName({ type: "link", url: "https://docs.github.com/pr" })).toBe("docs.github.com");
    const long = displayName({ type: "text", text: "x".repeat(50) });
    expect(long).toHaveLength(41);
    expect(long.endsWith("…")).toBe(true);
  });
});
