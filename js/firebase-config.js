// Paste the values from Firebase console → Project settings → Your apps → Web app.
// These are designed to be public; the Firestore rules are what protect the data.
export const firebaseConfig = {
  apiKey: "AIzaSyAb6j9aHH5MIjjytuVdV_rRnjftoxdZv5o",
  authDomain: "shelf-awareness-4014c.firebaseapp.com",
  projectId: "shelf-awareness-4014c",
  storageBucket: "shelf-awareness-4014c.firebasestorage.app",
  messagingSenderId: "290511862835",
  appId: "1:290511862835:web:7065c768d4be4342dbf746",
};

// Google accounts that can manage members, invites and content.
// Keep in sync with ADMIN_EMAILS in firestore.rules.
export const adminEmails = ["wolfenfeld@gmail.com"];
