"use strict";

const fs = require("node:fs");
const path = require("node:path");

class SiteStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.sites = this.#read();
  }

  list() {
    return structuredClone(this.sites);
  }

  add(site) {
    this.sites.push(structuredClone(site));
    this.#write();
    return structuredClone(site);
  }

  update(id, changes) {
    const index = this.sites.findIndex((site) => site.id === id);
    if (index === -1) return null;
    this.sites[index] = { ...this.sites[index], ...structuredClone(changes) };
    this.#write();
    return structuredClone(this.sites[index]);
  }

  remove(id) {
    const before = this.sites.length;
    this.sites = this.sites.filter((site) => site.id !== id);
    if (this.sites.length !== before) this.#write();
  }

  #read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (site) =>
          site &&
          typeof site.id === "string" &&
          typeof site.name === "string" &&
          typeof site.url === "string",
      );
    } catch (error) {
      if (error.code !== "ENOENT") console.error("Could not read sites.json", error);
      return [];
    }
  }

  #write() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.sites, null, 2));
    fs.renameSync(temporaryPath, this.filePath);
  }
}

module.exports = { SiteStore };
