import { stableId, sha256 } from "./identity.js";
import { assertPersistentWriteAllowed, safetyState } from "./safety.js";

export class InMemorySeoStore {
  constructor() { this.collections = new Map(); }
  async createIfAbsent(collection, id, value) {
    const bucket = this.collections.get(collection) || new Map();
    this.collections.set(collection, bucket);
    if (bucket.has(id)) return { created: false, value: bucket.get(id) };
    bucket.set(id, structuredClone(value));
    return { created: true, value: structuredClone(value) };
  }
  async list(collection) { return [...(this.collections.get(collection)?.values() || [])].map((value) => structuredClone(value)); }
}

export class InMemoryRunLedger {
  constructor() { this.runs = new Map(); }
  async checkpoint(runId, step, value = {}) {
    const current = this.runs.get(runId) || { runId, completedSteps: [], status: "running" };
    if (!current.completedSteps.includes(step)) current.completedSteps.push(step);
    const next = { ...current, ...structuredClone(value), runId, completedSteps: [...current.completedSteps] };
    this.runs.set(runId, next);
    return structuredClone(next);
  }
  async read(runId) { return structuredClone(this.runs.get(runId) || null); }
  async pendingSteps(runId, steps) {
    const run = await this.read(runId);
    const completed = new Set(run?.completedSteps || []);
    return steps.filter((step) => !completed.has(step));
  }
}

export class FirestoreSeoStore {
  constructor({ client, namespace = "elvio_seo_ai", state = safetyState() } = {}) {
    this.client = client; this.namespace = namespace; this.state = state;
  }
  async createIfAbsent(collection, id, value) {
    assertPersistentWriteAllowed(this.state);
    if (!this.client?.createIfAbsent) throw new Error("firestore_client_missing");
    return this.client.createIfAbsent(`${this.namespace}_${collection}`, id, value);
  }
}

export class CloudStorageSnapshotStore {
  constructor({ client, prefix = "elvio-seo-ai/snapshots", state = safetyState() } = {}) {
    this.client = client; this.prefix = prefix.replace(/^\/+|\/+$/g, ""); this.state = state;
  }
  async putImmutable(kind, payload) {
    assertPersistentWriteAllowed(this.state);
    if (!this.client?.putIfAbsent) throw new Error("storage_client_missing");
    const checksum = sha256(payload);
    const object = `${this.prefix}/${kind}/${checksum}.json`;
    return { object, checksum, ...(await this.client.putIfAbsent(object, JSON.stringify(payload), { ifGenerationMatch: 0 })) };
  }
}

export async function persistEvidence(store, records) {
  let created = 0;
  for (const record of records) {
    const id = record.id || stableId("evidence", record);
    const result = await store.createIfAbsent("evidence", id, { ...record, id });
    if (result.created) created += 1;
  }
  return { received: records.length, created, duplicates: records.length - created };
}
