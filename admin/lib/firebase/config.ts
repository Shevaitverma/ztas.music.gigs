import { type FirebaseApp, type FirebaseOptions, getApps, initializeApp } from 'firebase/app'
import { type Auth, getAuth } from 'firebase/auth'
import { getFirebaseWebConfig } from './firebase-config'

let app: FirebaseApp | null = null
let auth: Auth | null = null

function getFirebaseOptions(): FirebaseOptions | null {
  return getFirebaseWebConfig()
}

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null

  const firebaseOptions = getFirebaseOptions()
  // No status surface here (unlike web/, which has getFirebaseStatus) — callers
  // just null-check. Failures are logged by lib/firebase/init.ts.
  if (!firebaseOptions) return null

  if (!app) {
    try {
      const apps = getApps()
      app = apps.length > 0 ? apps[0] : initializeApp(firebaseOptions)
    } catch {
      return null
    }
  }
  return app
}

export function getFirebaseAuth(): Auth | null {
  if (typeof window === 'undefined') return null
  if (!auth) {
    const firebaseApp = getFirebaseApp()
    if (!firebaseApp) return null
    try {
      auth = getAuth(firebaseApp)
    } catch {
      return null
    }
  }
  return auth
}
