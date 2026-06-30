"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SiteStore } = require("../src/store");

test("site store persists add, update, and remove operations", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pinbar-store-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "sites.json");
  const store = new SiteStore(filePath);
  const site = {
    id: "site-1",
    name: "Example",
    url: "https://example.com/",
  };

  store.add(site);
  store.update(site.id, { name: "Updated" });
  assert.deepEqual(new SiteStore(filePath).list(), [
    { ...site, name: "Updated" },
  ]);

  store.remove(site.id);
  assert.deepEqual(new SiteStore(filePath).list(), []);
});
