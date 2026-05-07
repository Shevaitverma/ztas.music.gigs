'use client'

import { getFirebaseApp, getFirebaseAuth } from './config'

if (typeof window !== 'undefined') {
  try {
    const app = getFirebaseApp()
    if (app) {
      getFirebaseAuth()
    }
  } catch (error) {
    console.error('Failed to initialize Firebase:', error)
  }
}
