export class SecretManagerWixCredentialSession {
  constructor({ projectId, secretId, version = "latest", siteId, accessTokenProvider, fetchImpl = fetch, revokeCredential, verifyRevoked } = {}) {
    if (!projectId || !secretId || !siteId || !accessTokenProvider || !revokeCredential || !verifyRevoked) throw new Error("WIX_CREDENTIAL_SESSION_CONFIGURATION_REQUIRED");
    this.projectId = projectId; this.secretId = secretId; this.version = version; this.siteId = siteId; this.accessTokenProvider = accessTokenProvider; this.fetch = fetchImpl; this.revokeCredential = revokeCredential; this.verifyRevoked = verifyRevoked;
  }

  async acquire() {
    const accessToken = await this.accessTokenProvider();
    if (!accessToken) throw new Error("WIX_SECRET_ACCESS_TOKEN_REQUIRED");
    const name = `projects/${encodeURIComponent(this.projectId)}/secrets/${encodeURIComponent(this.secretId)}/versions/${encodeURIComponent(this.version)}`;
    const response = await this.fetch(`https://secretmanager.googleapis.com/v1/${name}:access`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`WIX_SECRET_ACCESS_HTTP_${response.status}`);
    const encoded = (await response.json()).payload?.data;
    if (!encoded) throw new Error("WIX_SECRET_PAYLOAD_MISSING");
    this.lastSession = { credential: Buffer.from(encoded, "base64").toString("utf8"), siteId: this.siteId, secretVersion: name };
    return this.lastSession;
  }

  async revoke(session) { await this.revokeCredential({ siteId: session.siteId, secretVersion: session.secretVersion }); }
  async isRevoked(session) { return Boolean(await this.verifyRevoked({ siteId: session.siteId, secretVersion: session.secretVersion })); }
}

