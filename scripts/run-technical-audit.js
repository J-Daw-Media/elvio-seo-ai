import fs from "node:fs";
import path from "node:path";
import { auditSite } from "../src/technicalAudit.js";

const result = await auditSite({});
const output = path.resolve("output", `technical-audit-${new Date().toISOString().slice(0, 10)}.json`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output, urlCount: result.urlCount, issueCounts: Object.groupBy(result.pages.flatMap((page) => page.issues || []), (value) => value) }, null, 2));
