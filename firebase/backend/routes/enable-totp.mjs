import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Adjust if your key lives elsewhere
const keyPath = path.join(__dirname, "..", "serviceAccountKey.json");
const svc = JSON.parse(fs.readFileSync(keyPath, "utf8"));

initializeApp({ credential: cert(svc), projectId: svc.project_id });

async function main() {
  const mgr = getAuth().projectConfigManager();

  // 1) Show current
  const before = await mgr.getProjectConfig();
  //console.log("Current MFA config:", JSON.stringify(before?.mfa || {}, null, 2));

  // 2) Enable TOTP with adjacentIntervals = 5 (default acceptable drift)
  await mgr.updateProjectConfig({
    multiFactorConfig: {
      providerConfigs: [
        { state: "ENABLED", totpProviderConfig: { adjacentIntervals: 5 } }
      ]
    }
  });

  // 3) Verify
  const after = await mgr.getProjectConfig();
  console.log("Updated MFA config:", JSON.stringify(after?.mfa || {}, null, 2));
  console.log("✅ TOTP ENABLED for project:", svc.project_id);
}

main().catch(e => { console.error("❌ Failed:", e); process.exit(1); });
