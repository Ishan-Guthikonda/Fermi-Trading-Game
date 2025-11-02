// client/src/firebase.ts
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyCynRmybrQpRWEhbSaYLBFs5uQRh5UUfo8',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'fermi-market-game.firebaseapp.com',
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL || 'https://fermi-market-game-default-rtdb.firebaseio.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'fermi-market-game',
  // Use the bucket **name**, not the web host:
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'fermi-market-game.appspot.com',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '776648407789',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:776648407789:web:2982f6542004aef1c42ae4',
  // measurementId intentionally omitted; not needed unless you actually use Analytics
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Pin to the provided DB URL to avoid any subtle default/region issues:
const database = getDatabase(app, firebaseConfig.databaseURL);
const auth = getAuth(app);

// Optional: connect to emulators when truly local
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  try {
    connectDatabaseEmulator(database, 'localhost', 9000);
    connectAuthEmulator(auth, 'http://localhost:9099');
    // console.log('Connected to Firebase emulators');
  } catch { /* noop */ }
}

export { app, database, auth };