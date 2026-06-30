// ============================================================
// src/firebase.js
// Step 1: Replace the placeholder values with your real
//         Firebase config (from Firebase Console).
// Step 2: Change USE_FIREBASE from false to true.
// ============================================================

export const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

// Change to true after pasting real config above
const USE_FIREBASE = false;

// ── localStorage fallback (used when USE_FIREBASE = false) ───
function localGet(k) {
  try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
}
function localSet(k, v) {
  localStorage.setItem(k, JSON.stringify(v));
}

// ── Firebase lazy initialiser ────────────────────────────────
let _fb = null;
async function fb() {
  if (_fb) return _fb;
  const { initializeApp } =
    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
  const fs =
    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  _fb = { db: fs.getFirestore(initializeApp(firebaseConfig)), ...fs };
  return _fb;
}

// ── Public API ───────────────────────────────────────────────
export async function getParticipant(email) {
  if (!USE_FIREBASE)
    return (localGet("qv_participants") || {})[email] || null;
  const { db, doc, getDoc } = await fb();
  const s = await getDoc(doc(db, "participants", email));
  return s.exists() ? s.data() : null;
}

export async function saveParticipant(p) {
  if (!USE_FIREBASE) {
    const all = localGet("qv_participants") || {};
    all[p.email] = p;
    localSet("qv_participants", all);
    return;
  }
  const { db, doc, setDoc } = await fb();
  await setDoc(doc(db, "participants", p.email), p, { merge: true });
}

export async function getAllParticipants() {
  if (!USE_FIREBASE)
    return Object.values(localGet("qv_participants") || {});
  const { db, collection, getDocs } = await fb();
  return (await getDocs(collection(db, "participants"))).docs.map(d => d.data());
}

export async function getCustomWords() {
  if (!USE_FIREBASE) return localGet("qv_customWords") || [];
  const { db, doc, getDoc } = await fb();
  const s = await getDoc(doc(db, "customWords", "global"));
  return s.exists() ? (s.data().words || []) : [];
}

export async function saveCustomWords(words) {
  if (!USE_FIREBASE) { localSet("qv_customWords", words); return; }
  const { db, doc, setDoc } = await fb();
  await setDoc(doc(db, "customWords", "global"), { words });
}