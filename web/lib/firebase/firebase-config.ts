// Project ID is hardcoded; never import service-account JSON in client code.

const FIREBASE_PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "zts-music";

interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/**
 * Get Firebase Web SDK configuration
 * Uses project info from env vars only
 */
export function getFirebaseWebConfig(): FirebaseWebConfig | null {
  const projectId = FIREBASE_PROJECT_ID;

  // Construct authDomain and storageBucket from project ID
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`;
  const storageBucket =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;

  // Get Web SDK specific values from env vars
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  // Check if we have all required values
  if (!apiKey || !messagingSenderId || !appId) {
    const missing = [];
    if (!apiKey) missing.push("NEXT_PUBLIC_FIREBASE_API_KEY");
    if (!messagingSenderId) missing.push("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID");
    if (!appId) missing.push("NEXT_PUBLIC_FIREBASE_APP_ID");

    console.warn(
      `⚠️  Missing Firebase Web SDK configuration:\n${missing.join("\n")}\n\nThese values can be found in Firebase Console > Project Settings > General > Your apps\nProject ID: ${projectId}\nAuth Domain: ${authDomain}\nStorage Bucket: ${storageBucket}`
    );
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}

/**
 * Get Firebase project ID
 */
export function getFirebaseProjectId(): string {
  return FIREBASE_PROJECT_ID;
}
