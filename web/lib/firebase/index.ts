// Re-export all Firebase functionality
export { getFirebaseApp, getFirebaseAuth, getFirebaseStatus } from './config'
export { getFirebaseWebConfig, getFirebaseProjectId } from './firebase-config'
export { signInWithGoogle, isGoogleAuthAvailable, type GoogleSignInResult } from './google-auth'

// Initialize Firebase on import
import './init'
