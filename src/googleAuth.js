export async function metadataAccessToken({ fetchImpl = fetch } = {}) {
  const response = await fetchImpl("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "Metadata-Flavor": "Google" },
  });
  if (!response.ok) throw new Error(`metadata_token_http_${response.status}`);
  const payload = await response.json();
  if (!payload?.access_token) throw new Error("metadata_access_token_missing");
  return payload.access_token;
}

export async function scopedServiceAccountAccessToken({
  serviceAccountEmail,
  scopes = [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/analytics.readonly",
  ],
  fetchImpl = fetch,
  baseTokenProvider = () => metadataAccessToken({ fetchImpl }),
} = {}) {
  if (!serviceAccountEmail) throw new Error("runtime_service_account_missing");
  const baseToken = await baseTokenProvider();
  const response = await fetchImpl(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:generateAccessToken`, {
    method: "POST",
    headers: { authorization: `Bearer ${baseToken}`, "content-type": "application/json" },
    body: JSON.stringify({ scope: scopes, lifetime: "3600s" }),
  });
  if (!response.ok) throw new Error(`scoped_token_http_${response.status}`);
  const payload = await response.json();
  if (!payload?.accessToken) throw new Error("scoped_access_token_missing");
  return payload.accessToken;
}
