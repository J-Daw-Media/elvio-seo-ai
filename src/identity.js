import { createHash } from "node:crypto";

export function canonical(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function stableId(prefix, value) {
  const digest = createHash("sha256").update(canonical(value)).digest("hex");
  return `${prefix}:${digest.slice(0, 32)}`;
}

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}
