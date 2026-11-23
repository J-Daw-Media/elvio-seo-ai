import { runMilestoneBCreativeRehearsal } from "../src/milestoneBCreativeRehearsal.js";

const report = runMilestoneBCreativeRehearsal();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed || report.externalWrites !== 0 || report.externalRequests !== 0) process.exitCode = 1;

