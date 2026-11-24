import { sha256, stableId } from "./identity.js";

const writePayload = (name, payload, precondition) => ({ update: { name, fields: { payloadJson: { stringValue: JSON.stringify(payload) }, checksum: { stringValue: sha256(payload) }, createdAt: { timestampValue: payload.at || payload.completedAt || new Date().toISOString() } } }, currentDocument: precondition });

export class FirestorePublisherStore {
  constructor({ client, namespace = "elvio_seo_ai" } = {}) { if (!client) throw new Error("PUBLISHER_STORE_CLIENT_REQUIRED"); this.client = client; this.namespace = namespace; }
  path(collection, id) { return this.client.path(`${this.namespace}_${collection}`, id); }
  async create(collection, id, payload) {
    const path = this.path(collection, id);
    return this.client.transaction(async ({ read, commit }) => {
      const existing = (await read([path])).get(path);
      if (existing) return { created: false, value: existing.payload };
      await commit([writePayload(path, payload, { exists: false })]); return { created: true, value: payload };
    });
  }
  async persistEvent(event) {
    const id = stableId("publisher-candidate-event", { executionId: event.executionId, candidateId: event.candidateId, state: event.state, at: event.at });
    return this.create("publisher_candidate_events_v1", id, { ...event, id, schemaVersion: "publisher-candidate-event-v1" });
  }
  async persistExecution(execution) {
    return this.create("publisher_executions_v1", execution.executionId, { ...execution, schemaVersion: "publisher-execution-v1", completedAt: new Date().toISOString() });
  }
  async persistIncident(incident) {
    const id = incident.id || stableId("publisher-incident", incident);
    return this.create("publisher_incidents_v1", id, { ...incident, id, schemaVersion: "publisher-incident-v1" });
  }
}

