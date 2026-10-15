import { mkdir, readFile, writeFile, rename, unlink, readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createState } from "../shared/domain.js";

export class SessionStore {
  constructor(directory) { this.directory = directory; this.locks = new Map(); }
  async init() { await mkdir(this.directory, { recursive: true }); }
  validId(id) { return typeof id === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id); }
  async read(id) {
    if (!this.validId(id)) return null;
    try {
      const record = JSON.parse(await readFile(join(this.directory, `${id}.json`), "utf8"));
      if (record.schemaVersion !== 1 || !record.state || !Array.isArray(record.receipts)) throw new Error("Invalid session record");
      return record;
    } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }
  async write(id, record) {
    const temporary = join(this.directory, `${id}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(record), { encoding: "utf8", mode: 0o600 });
      await rename(temporary, join(this.directory, `${id}.json`));
    } finally { await unlink(temporary).catch(() => {}); }
  }
  async create(now = Date.now()) {
    const id = randomUUID();
    const record = { schemaVersion: 1, state: createState(now), receipts: [], createdAt: now };
    await this.write(id, record);
    return { id, record };
  }
  async transaction(id, work) {
    const previous = this.locks.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const record = await this.read(id);
      if (!record) throw Object.assign(new Error("Session expired"), { status: 401, code: "session_expired" });
      const result = await work(record);
      await this.write(id, record);
      return result;
    });
    this.locks.set(id, next);
    try { return await next; }
    finally { if (this.locks.get(id) === next) this.locks.delete(id); }
  }
  async prune(now = Date.now()) {
    // Single-process deployment. Active transactions are never removed.
    for (const file of await readdir(this.directory)) {
      if (!file.endsWith(".json")) continue;
      const id = file.slice(0, -5);
      if (!this.validId(id) || this.locks.has(id)) continue;
      const record = await this.read(id);
      if (now - (record.lastAccessAt || record.createdAt) > 30 * 86_400_000) await unlink(join(this.directory, file));
    }
  }
}
