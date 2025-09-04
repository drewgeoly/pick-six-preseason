import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Production sanity check: verify envs are present (log lengths only)
if (import.meta.env.PROD) {
  const apiKeyLen = (import.meta.env.VITE_FIREBASE_API_KEY || "").length;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  // eslint-disable-next-line no-console
  console.info("Firebase env (lengths)", {
    apiKeyLen,
    authDomain,
    projectId,
  });
}

if (!firebaseConfig.apiKey) {
  // Provide a clearer error if secrets didn't inject at build time
  throw new Error(
    "Missing VITE_FIREBASE_API_KEY. Ensure GitHub Actions injects .env.production with VITE_* secrets and re-deploy."
  );
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
