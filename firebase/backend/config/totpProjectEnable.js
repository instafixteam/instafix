import { getAuth } from "firebase-admin/auth";

export async function enableTotpProjectwide(adjacentIntervals = 5) {
  const auth = getAuth();

  // Optional: guard so you don't flip it every boot
  const current = await auth.projectConfigManager().getProjectConfig();
  const providers = current.multiFactorConfig?.providerConfigs || [];
  const alreadyEnabled = providers.some(
    (p) => p?.totpProviderConfig && p.state === "ENABLED"
  );
  if (alreadyEnabled) return;

  await auth.projectConfigManager().updateProjectConfig({
    multiFactorConfig: {
      providerConfigs: [{
        state: "ENABLED",
        totpProviderConfig: { adjacentIntervals }
      }]
    }
  });
}
