// src/lib/envGuards.ts
/**
 * Ensures we never ship sensitive client-side secrets in production.
 *
 * - Firebase config (VITE_FIREBASE_*) is OK in client bundles.
 * - Third-party API keys (e.g., Odds API, RapidAPI) MUST NOT be bundled.
 *   Use a serverless proxy and expose only VITE_ODDS_PROXY_URL to the client.
 */
export function assertNoPublicSecrets() {
  const isProd = import.meta.env.PROD;
  if (!isProd) return;

  const oddsKey = (import.meta.env.VITE_ODDS_API_KEY as string | undefined) || "";
  const rapidKey = (import.meta.env.VITE_RAPIDAPI_KEY as string | undefined) || "";

  if (oddsKey.trim()) {
    throw new Error(
      "Security: VITE_ODDS_API_KEY is set in a production build. Remove it from the client env and use a serverless proxy (set VITE_ODDS_PROXY_URL)."
    );
  }

  if (rapidKey.trim()) {
    throw new Error(
      "Security: VITE_RAPIDAPI_KEY is set in a production build. Remove it from the client env and route calls through a serverless proxy."
    );
  }

  // Firebase keys are intentionally allowed (they are not secrets, rules protect data)
}
