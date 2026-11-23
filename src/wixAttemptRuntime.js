import { sha256 } from "./identity.js";
import { WixOneShotExecutor } from "./wixOneShotExecutor.js";
import { AttemptExecutionLedgerAdapter } from "./wixAttemptLedger.js";

export async function executeAuthorizedWixDraft({ store, authorization, parentAttemptId = null, seoSlug, credentialSession, preparedInput, fetchImpl = fetch, now } = {}) {
  if (!authorization || !preparedInput) throw new Error("WIX_ATTEMPT_RUNTIME_INPUT_REQUIRED");
  const checksum = sha256(preparedInput.wixDryRun.payload);
  if (authorization.articleFingerprint !== preparedInput.approvedFingerprint) throw new Error("WIX_ATTEMPT_RUNTIME_FINGERPRINT_MISMATCH");
  if (authorization.transportChecksum !== checksum) throw new Error("WIX_ATTEMPT_RUNTIME_TRANSPORT_MISMATCH");
  const ledger = new AttemptExecutionLedgerAdapter({ store, authorizationId: authorization.authorizationId, attemptId: authorization.attemptId, parentAttemptId, seoSlug });
  const executor = new WixOneShotExecutor({ ledger, credentialSession, fetchImpl, now });
  try {
    return await executor.execute(preparedInput);
  } finally {
    if (credentialSession?.lastSession && await store.getAttempt(authorization.attemptId)) {
      const revoked = Boolean(await credentialSession.isRevoked(credentialSession.lastSession));
      await store.markCredentialRevoked(authorization.attemptId, revoked);
    }
  }
}
