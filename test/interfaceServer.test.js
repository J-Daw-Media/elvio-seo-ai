import test from "node:test";
import assert from "node:assert/strict";
import { FirestoreInterfaceReader } from "../src/firestoreReadClient.js";
import { createInterfaceHandler } from "../src/interfaceServer.js";

function responseRecorder() {
  return { status: null, headers: null, body: "", writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body || ""; } };
}

test("Firestore reader is bounded and decodes only persisted payloads", async () => {
  let request;
  const fetchImpl = async (url, options) => { request = { url, options }; return new Response(JSON.stringify([{ document: { fields: { payloadJson: { stringValue: JSON.stringify({ id: "safe-1" }) } } } }]), { status: 200 }); };
  const reader = new FirestoreInterfaceReader({ projectId: "test-project", accessTokenProvider: async () => "token", fetchImpl, maxRecords: 100 });
  assert.deepEqual(await reader.list("opportunities_v1", { limit: 999 }), [{ id: "safe-1" }]);
  assert.equal(JSON.parse(request.options.body).structuredQuery.limit, 100);
  assert.equal(request.options.method, "POST");
});

test("interface server requires auth, is GET-only and returns the read-only contract", async () => {
  const readModel = { read: async () => ({ schemaVersion: "seo-intelligence-v1", readOnly: true }) };
  const handler = createInterfaceHandler({ expectedToken: "secret", readModel, now: () => Date.parse("2026-11-23T12:00:00Z") });
  const unauth = responseRecorder(); await handler({ method: "GET", url: "/v1/seo-intelligence", headers: {}, socket: {} }, unauth); assert.equal(unauth.status, 401);
  const write = responseRecorder(); await handler({ method: "POST", url: "/v1/seo-intelligence", headers: { authorization: "Bearer secret" }, socket: {} }, write); assert.equal(write.status, 405);
  const read = responseRecorder(); await handler({ method: "GET", url: "/v1/seo-intelligence?limit=25", headers: { authorization: "Bearer secret" }, socket: {} }, read); assert.equal(read.status, 200); assert.equal(JSON.parse(read.body).readOnly, true);
});
