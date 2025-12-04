import admin from "firebase-admin";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// ✅ FIXED: correct relative import from ./models -> ../config
import { enableTotpProjectwide } from "../config/totpProjectEnable.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// service account next to server.js (adjust if yours is elsewhere)
const saPath = path.join(__dirname, "..", "serviceAccountKey.json");
const serviceAccount = JSON.parse(await readFile(saPath, "utf-8"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
}

await enableTotpProjectwide(5);
console.log("✅ TOTP enabled project-wide.");
