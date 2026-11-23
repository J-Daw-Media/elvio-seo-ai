import { buildFirstPublicationPackage } from "../src/firstPublicationPackage.js";

process.stdout.write(`${JSON.stringify(buildFirstPublicationPackage(), null, 2)}\n`);
