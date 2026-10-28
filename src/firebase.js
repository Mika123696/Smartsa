import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Environment variables configuration with safe fallbacks
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD2xk5cXWrf35Cy0gFEa7yd0eJwnJPL40A",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "pinteru-30b26.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "pinteru-30b26",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "pinteru-30b26.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "274664390309",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:274664390309:web:39e85f540dfe5b216ed74c"
};

// Singleton initialization
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Cloud Firestore Database & Authentication services
export const db = getFirestore(app);
export const auth = getAuth(app);
