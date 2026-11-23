import { stableId } from "./identity.js";

export class FirestorePublicationLedger {
  constructor({ projectId, accessToken, fetchImpl = fetch, database = "(default)", collection = "seo_blog_publication_reservations", now = () => new Date().toISOString() } = {}) {
    if (!projectId || !accessToken) throw new Error("PUBLICATION_LEDGER_AUTH_REQUIRED");
    this.root = `projects/${projectId}/databases/${database}`; this.accessToken = accessToken; this.fetch = fetchImpl; this.collection = collection; this.now = now;
  }
  headers() { return { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json" }; }
  documentName(id) { return `${this.root}/documents/${this.collection}/${id}`; }
  async read(id) {
    const response = await this.fetch(`https://firestore.googleapis.com/v1/${this.documentName(id)}`, { headers: this.headers() });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`PUBLICATION_LEDGER_READ_HTTP_${response.status}`);
    const document = await response.json();
    return { payload: JSON.parse(document.fields?.payloadJson?.stringValue || "null"), updateTime: document.updateTime };
  }
  async reserveAtomically({ monthKey, slotKey, articleId, contentFingerprint, publicationAttemptId, wixDraftId = null, limit = 6 } = {}) {
    const monthId = `month-${monthKey}`; const slotId = `slot-${slotKey.replace(/[^a-z0-9-]/gi, "-")}`;
    const [month, slot] = await Promise.all([this.read(monthId), this.read(slotId)]);
    if (slot) return { reserved: false, reason: "slot_already_consumed", record: slot.payload };
    const count = Number(month?.payload?.consumedCount || 0);
    if (count >= limit) return { reserved: false, reason: "monthly_limit_reached", count };
    const reservation = { id: stableId("blog-publication-reservation", { slotKey, articleId, contentFingerprint }), monthKey, slotKey, articleId, contentFingerprint, publicationAttemptId, wixDraftId, state: "publication_reserved", createdAt: this.now(), verificationResult: null, publishedWixId: null, publicUrl: null, errorOrQuarantineReason: null };
    const monthPayload = { monthKey, consumedCount: count + 1, updatedAt: this.now() };
    const write = (id, payload, precondition) => ({ update: { name: this.documentName(id), fields: { payloadJson: { stringValue: JSON.stringify(payload) } } }, currentDocument: precondition });
    const writes = [
      write(monthId, monthPayload, month ? { updateTime: month.updateTime } : { exists: false }),
      write(slotId, reservation, { exists: false }),
    ];
    const response = await this.fetch(`https://firestore.googleapis.com/v1/${this.root}/documents:commit`, { method: "POST", headers: this.headers(), body: JSON.stringify({ writes }) });
    if (response.status === 409 || response.status === 412) return { reserved: false, reason: "concurrent_reservation_conflict" };
    if (!response.ok) throw new Error(`PUBLICATION_LEDGER_COMMIT_HTTP_${response.status}`);
    return { reserved: true, reason: "reserved", count: count + 1, record: reservation };
  }
}

export async function reservePublicationSlot({ ledger, plan, monthlyLimit = 6 } = {}) {
  if (!plan?.developmentReady || !plan.slot || !plan.publicationAttemptId) throw new Error("PUBLICATION_PLAN_NOT_READY");
  return ledger.reserveAtomically({ monthKey: plan.slot.monthKey, slotKey: plan.slot.key, articleId: plan.articleId, contentFingerprint: plan.contentFingerprint, publicationAttemptId: plan.publicationAttemptId, wixDraftId: plan.wixDraftId, limit: monthlyLimit });
}

