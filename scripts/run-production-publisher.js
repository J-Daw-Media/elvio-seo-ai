import { runProductionPublisher } from "../src/productionPublisherJob.js";

runProductionPublisher()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error) => { console.error(JSON.stringify({ status: "failed", reason: error.message })); process.exitCode = 1; });

