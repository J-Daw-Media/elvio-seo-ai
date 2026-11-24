import { sha256, stableId } from "./identity.js";

const terminal = new Set(["publicly_verified", "quarantined", "completed_no_publication"]);
const writePayload = (name, payload, precondition) => ({ update: { name, fields: { payloadJson: { stringValue: JSON.stringify(payload) }, checksum: { stringValue: sha256(payload) } } }, currentDocument: precondition });

export class FirestoreAutopilotExecutionLedger {
  constructor({ client, collection = "elvio_seo_ai_publisher_attempts_v1", now = () => new Date().toISOString() } = {}) { if (!client) throw new Error("AUTOPILOT_LEDGER_CLIENT_REQUIRED"); this.client = client; this.collection = collection; this.now = now; }
  path(id) { return this.client.path(this.collection, id); }
  async reserve({ monthKey, slotKey, articleId, contentFingerprint, exploratory = false } = {}) {
    const id = stableId("publisher-attempt", { monthKey, slotKey, articleId, contentFingerprint });
    const attemptPath = this.path(id); const slotPath = this.path(`slot-${slotKey.replace(/[^a-z0-9-]/gi, "-")}`); const monthPath = this.path(`month-${monthKey}`);
    return this.client.transaction(async ({ read, commit }) => {
      const docs = await read([attemptPath, slotPath, monthPath]);
      const existing = docs.get(attemptPath)?.payload; if (existing) return { created: false, record: existing };
      if (docs.get(slotPath)) return { created: false, record: docs.get(slotPath).payload };
      const month = docs.get(monthPath)?.payload || { monthKey, consumedCount: 0, exploratoryCount: 0, version: 0 };
      if (month.consumedCount >= 6) return { created: false, record: { state: "monthly_limit_reached" } };
      if (exploratory && month.exploratoryCount >= 2) return { created: false, record: { state: "exploratory_limit_reached" } };
      const at = this.now(); const record = { id, monthKey, slotKey, articleId, contentFingerprint, exploratory, state: "reserved", version: 1, requestCounts: { image: 0, draft: 0, publish: 0 }, createdAt: at, updatedAt: at };
      const nextMonth = { ...month, consumedCount: month.consumedCount + 1, exploratoryCount: month.exploratoryCount + Number(exploratory), version: month.version + 1, updatedAt: at };
      await commit([
        writePayload(attemptPath, record, { exists: false }), writePayload(slotPath, record, { exists: false }),
        writePayload(monthPath, nextMonth, docs.get(monthPath) ? { updateTime: docs.get(monthPath).updateTime } : { exists: false }),
      ]);
      return { created: true, record };
    });
  }
  async transition(expectedVersion, state, patch = {}) {
    const id = patch.id || patch.attemptId;
    if (!id) throw new Error("AUTOPILOT_LEDGER_ATTEMPT_ID_REQUIRED");
    const path = this.path(id);
    return this.client.transaction(async ({ read, commit }) => {
      const currentDoc = (await read([path])).get(path); const current = currentDoc?.payload;
      if (!current || current.version !== expectedVersion) throw new Error("AUTOPILOT_LEDGER_CONFLICT");
      if (terminal.has(current.state)) throw new Error("AUTOPILOT_LEDGER_TERMINAL");
      const next = { ...current, ...patch, id: current.id, state, version: expectedVersion + 1, updatedAt: this.now() };
      await commit([writePayload(path, next, { updateTime: currentDoc.updateTime })]); return next;
    });
  }
}

export class InMemoryAutopilotExecutionLedger {
  constructor() { this.attempts = new Map(); this.slots = new Set(); this.months = new Map(); }
  async reserve(input) {
    const id = stableId("publisher-attempt", input); if (this.attempts.has(id)) return { created: false, record: structuredClone(this.attempts.get(id)) };
    if (this.slots.has(input.slotKey)) return { created: false, record: { state: "slot_already_consumed" } };
    const month = this.months.get(input.monthKey) || { consumedCount: 0, exploratoryCount: 0 };
    if (month.consumedCount >= 6 || (input.exploratory && month.exploratoryCount >= 2)) return { created: false, record: { state: "quota_reached" } };
    const record = { ...input, id, state: "reserved", version: 1, requestCounts: { image: 0, draft: 0, publish: 0 } };
    this.attempts.set(id, record); this.slots.add(input.slotKey); this.months.set(input.monthKey, { consumedCount: month.consumedCount + 1, exploratoryCount: month.exploratoryCount + Number(input.exploratory) }); return { created: true, record: structuredClone(record) };
  }
  async transition(version, state, patch = {}) { const current = this.attempts.get(patch.id); if (!current || current.version !== version) throw new Error("AUTOPILOT_LEDGER_CONFLICT"); const next = { ...current, ...patch, state, version: version + 1 }; this.attempts.set(current.id, next); return structuredClone(next); }
}

