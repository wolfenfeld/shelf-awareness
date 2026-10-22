// Paste the values from Firebase console → Project settings → Your apps → Web app.
// These are designed to be public; the Firestore rules are what protect the data.
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

// Google accounts that can manage members, invites and content.
// Keep in sync with ADMIN_EMAILS in firestore.rules.
export const adminEmails = ["wolfenfeld@gmail.com"];
