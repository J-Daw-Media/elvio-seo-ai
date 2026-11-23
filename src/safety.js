const SENSITIVE_KEY = /(?:email|phone|mobile|name|address|recipient|contact|message|body|client|customer|person)/i;
const SECRET_KEY = /(?:token|secret|password|authorization|api.?key|cookie)/i;

export function assertReadOnlyRequest(method = "GET") {
  const normalized = String(method).toUpperCase();
  if (!["GET", "HEAD", "OPTIONS", "POST"].includes(normalized)) throw new Error("read_only_method_required");
  return normalized;
}

export function redact(value, key = "") {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (SENSITIVE_KEY.test(key)) return "[OMITTED_PII]";
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
  if (typeof value === "string") {
    return value
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[OMITTED_EMAIL]")
      .replace(/(?:\+31|0)\s*6(?:[\s-]*\d){8}/g, "[OMITTED_PHONE]");
  }
  return value;
}

export function safetyState(env = process.env) {
  return {
    dryRun: String(env.SEO_DRY_RUN ?? "true").toLowerCase() !== "false",
    killed: String(env.SEO_KILL_SWITCH ?? "false").toLowerCase() === "true",
    persistentWritesEnabled: String(env.SEO_PERSISTENT_WRITES_ENABLED ?? "false").toLowerCase() === "true",
    wixWritesEnabled: false,
    adsMutationsEnabled: false,
    crmWritesEnabled: false,
  };
}

export function assertRunnable(state = safetyState()) {
  if (state.killed) throw new Error("SEO_KILL_SWITCH_active");
  return state;
}

export function assertPersistentWriteAllowed(state = safetyState()) {
  if (state.killed) throw new Error("SEO_KILL_SWITCH_active");
  if (state.dryRun || !state.persistentWritesEnabled) throw new Error("SEO_PERSISTENT_WRITES_DISABLED");
  return true;
}
