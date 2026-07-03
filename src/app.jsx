import React, { useState, useEffect } from "react";
import { supabase } from "./supabase.js";

const WORD_BANK = [
  { arabic: "اللَّهُ", translit: "Allāh", english: "Allah / God", urdu: "اللہ", root: "أله", rootEnglish: "to worship, deity", rootUrdu: "عبادت کرنا، معبود" },
  { arabic: "رَبُّ", translit: "Rabb", english: "Lord / Sustainer", urdu: "رب، پالنے والا", root: "ربب", rootEnglish: "to nurture, sustain", rootUrdu: "پرورش کرنا" },
  { arabic: "الرَّحْمَنُ", translit: "Ar-Rahmān", english: "The Most Gracious", urdu: "نہایت رحم کرنے والا", root: "رحم", rootEnglish: "mercy, womb", rootUrdu: "رحم، مہربانی" },
  { arabic: "الرَّحِيمُ", translit: "Ar-Raheem", english: "The Most Merciful", urdu: "نہایت مہربان", root: "رحم", rootEnglish: "mercy, womb", rootUrdu: "رحم، مہربانی" },
  { arabic: "الْحَمْدُ", translit: "Al-Hamd", english: "All Praise", urdu: "تمام تعریف", root: "حمد", rootEnglish: "to praise", rootUrdu: "تعریف کرنا" },
  { arabic: "فِي", translit: "fī", english: "in / within", urdu: "میں", root: "—", rootEnglish: "—", rootUrdu: "—" },
  { arabic: "مِن", translit: "min", english: "from / of", urdu: "سے", root: "—", rootEnglish: "—", rootUrdu: "—" },
  { arabic: "عَلَى", translit: "'alā", english: "on / upon / over", urdu: "پر", root: "—", rootEnglish: "—", rootUrdu: "—" },
  { arabic: "إِلَى", translit: "ilā", english: "to / towards", urdu: "کی طرف", root: "—", rootEnglish: "—", rootUrdu: "—" },
  { arabic: "كَانَ", translit: "kāna", english: "was / to be", urdu: "تھا، ہونا", root: "كون", rootEnglish: "to be, existence", rootUrdu: "ہونا، وجود" },
  { arabic: "هُوَ", translit: "huwa", english: "He / It", urdu: "وہ", root: "—", rootEnglish: "—", rootUrdu: "—" },
  { arabic: "الَّذِي", translit: "alladhī", english: "who / that / which", urdu: "جو، وہ جو", root: "—", rootEnglish: "—", rootUrdu: "—" },
  { arabic: "مَا", translit: "mā", english: "what / that which / not", urdu: "جو، نہیں", root: "—", rootEnglish: "—", rootUrdu: "—" },
  { arabic: "لَا", translit: "lā", english: "no / not", urdu: "نہیں", root: "—", rootEnglish: "—", rootUrdu: "—" },
  { arabic: "قَالَ", translit: "qāla", english: "he said", urdu: "اس نے کہا", root: "قول", rootEnglish: "to say, speech", rootUrdu: "کہنا، بات" },
  { arabic: "إِنَّ", translit: "inna", english: "verily / indeed", urdu: "بے شک", root: "—", rootEnglish: "—", rootUrdu: "—" },
  { arabic: "آمَنَ", translit: "āmana", english: "to believe / have faith", urdu: "ایمان لانا", root: "أمن", rootEnglish: "safety, trust, faith", rootUrdu: "امن، اعتماد، ایمان" },
  { arabic: "عَمِلَ", translit: "'amila", english: "to do / work / act", urdu: "عمل کرنا", root: "عمل", rootEnglish: "to do, work", rootUrdu: "کام کرنا، عمل" },
  { arabic: "عَلِمَ", translit: "'alima", english: "to know", urdu: "جاننا", root: "علم", rootEnglish: "knowledge", rootUrdu: "علم، جاننا" },
  { arabic: "نَاسٌ", translit: "nās", english: "people / mankind", urdu: "لوگ، انسان", root: "نوس", rootEnglish: "people, humankind", rootUrdu: "لوگ، انسانیت" },
  { arabic: "قَوْمٌ", translit: "qawm", english: "people / nation / tribe", urdu: "قوم، گروہ", root: "قوم", rootEnglish: "nation, to stand/rise", rootUrdu: "قوم، کھڑا ہونا" },
  { arabic: "يَوْمٌ", translit: "yawm", english: "day", urdu: "دن", root: "يوم", rootEnglish: "day", rootUrdu: "دن" },
  { arabic: "أَرْضٌ", translit: "ard", english: "earth / land / ground", urdu: "زمین", root: "أرض", rootEnglish: "earth, land", rootUrdu: "زمین" },
  { arabic: "سَمَاءٌ", translit: "samā'", english: "sky / heaven", urdu: "آسمان", root: "سمو", rootEnglish: "to be high, elevated", rootUrdu: "بلند ہونا" },
  { arabic: "كِتَابٌ", translit: "kitāb", english: "book / scripture", urdu: "کتاب", root: "كتب", rootEnglish: "to write, book", rootUrdu: "لکھنا، کتاب" },
  { arabic: "نَفْسٌ", translit: "nafs", english: "soul / self", urdu: "نفس، جان", root: "نفس", rootEnglish: "soul, self, breath", rootUrdu: "جان، نفس" },
  { arabic: "قَلْبٌ", translit: "qalb", english: "heart", urdu: "دل", root: "قلب", rootEnglish: "heart, to turn/change", rootUrdu: "دل، پلٹنا" },
  { arabic: "إِيمَانٌ", translit: "īmān", english: "faith / belief", urdu: "ایمان", root: "أمن", rootEnglish: "safety, trust, faith", rootUrdu: "امن، اعتماد، ایمان" },
  { arabic: "تَقْوَى", translit: "taqwā", english: "piety / God-consciousness", urdu: "تقویٰ، پرہیزگاری", root: "وقي", rootEnglish: "to protect, guard", rootUrdu: "حفاظت کرنا، بچانا" },
  { arabic: "صَلَاةٌ", translit: "salāh", english: "prayer", urdu: "نماز", root: "صلو", rootEnglish: "to pray, connection", rootUrdu: "دعا، تعلق" },
  { arabic: "جَنَّةٌ", translit: "jannah", english: "paradise / garden", urdu: "جنت، باغ", root: "جنن", rootEnglish: "to conceal, garden", rootUrdu: "چھپانا، باغ" },
  { arabic: "نَارٌ", translit: "nār", english: "fire / hell", urdu: "آگ، دوزخ", root: "نور", rootEnglish: "light, fire", rootUrdu: "روشنی، آگ" },
  { arabic: "آخِرَةٌ", translit: "ākhirah", english: "the Hereafter", urdu: "آخرت", root: "أخر", rootEnglish: "to be last, end", rootUrdu: "پیچھے، آخر" },
  { arabic: "مَوْتٌ", translit: "mawt", english: "death", urdu: "موت", root: "موت", rootEnglish: "death", rootUrdu: "موت" },
  { arabic: "نَبِيٌّ", translit: "nabī", english: "prophet", urdu: "نبی، پیغمبر", root: "نبأ", rootEnglish: "to inform, news", rootUrdu: "خبر دینا" },
  { arabic: "رَسُولٌ", translit: "rasūl", english: "messenger", urdu: "رسول، پیغام لانے والا", root: "رسل", rootEnglish: "to send, message", rootUrdu: "بھیجنا، پیغام" },
  { arabic: "مَلَكٌ", translit: "malak", english: "angel", urdu: "فرشتہ", root: "ملك", rootEnglish: "to possess, dominion", rootUrdu: "مالک ہونا، بادشاہت" },
  { arabic: "عِلْمٌ", translit: "'ilm", english: "knowledge", urdu: "علم", root: "علم", rootEnglish: "knowledge", rootUrdu: "علم، جاننا" },
  { arabic: "حَقٌّ", translit: "haqq", english: "truth / right", urdu: "حق، سچ", root: "حقق", rootEnglish: "to be true, established", rootUrdu: "سچائی، ثابت ہونا" },
  { arabic: "صَبْرٌ", translit: "sabr", english: "patience / perseverance", urdu: "صبر", root: "صبر", rootEnglish: "patience, to restrain", rootUrdu: "صبر، روکنا" },
  { arabic: "رَحْمَةٌ", translit: "rahmah", english: "mercy / compassion", urdu: "رحمت", root: "رحم", rootEnglish: "mercy, womb", rootUrdu: "رحم، مہربانی" },
  { arabic: "نُورٌ", translit: "nūr", english: "light", urdu: "نور، روشنی", root: "نور", rootEnglish: "light, fire", rootUrdu: "روشنی، آگ" },
  { arabic: "هُدًى", translit: "hudan", english: "guidance", urdu: "ہدایت", root: "هدي", rootEnglish: "to guide", rootUrdu: "راہ دکھانا" },
  { arabic: "تَوْبَةٌ", translit: "tawbah", english: "repentance", urdu: "توبہ", root: "توب", rootEnglish: "to return, repent", rootUrdu: "لوٹنا، توبہ کرنا" },
  { arabic: "دُعَاءٌ", translit: "du'ā'", english: "supplication", urdu: "دعا", root: "دعو", rootEnglish: "to call, invoke", rootUrdu: "بلانا، دعا کرنا" },
  { arabic: "سَلَامٌ", translit: "salām", english: "peace / greeting", urdu: "سلام، امن", root: "سلم", rootEnglish: "peace, safety", rootUrdu: "امن، سلامتی" },
  { arabic: "حِكْمَةٌ", translit: "hikmah", english: "wisdom", urdu: "حکمت", root: "حكم", rootEnglish: "wisdom, judgment", rootUrdu: "حکمت، فیصلہ" },
  { arabic: "عَدْلٌ", translit: "'adl", english: "justice / equity", urdu: "عدل، انصاف", root: "عدل", rootEnglish: "justice, fairness", rootUrdu: "انصاف، برابری" },
  { arabic: "رِزْقٌ", translit: "rizq", english: "provision / sustenance", urdu: "رزق", root: "رزق", rootEnglish: "provision, sustenance", rootUrdu: "روزی، رزق" },
  { arabic: "شُكْرٌ", translit: "shukr", english: "gratitude", urdu: "شکر", root: "شكر", rootEnglish: "to thank, gratitude", rootUrdu: "شکر ادا کرنا" },
];

const WORDS_PER_DAY = 10;
const TOTAL_DAYS = Math.ceil(WORD_BANK.length / WORDS_PER_DAY);
// A set unlocks the next one via EITHER of two paths, whichever comes first:
//  1. Score at least PASSING_SCORE_PCT (90%) on a single quiz attempt of
//     this set, OR
//  2. Reach MASTERY_GATE_PCT (70%) of this set's words individually mastered
//     (each word answered correctly MASTERY_STREAK_REQUIRED times in a row).
// This keeps a fast path open for confident learners who ace it first try,
// while also rewarding steady, repeated correct practice over time for
// learners who build up mastery gradually rather than acing one attempt.
// Doesn't apply to the All Sets Quiz, which is a review/practice mode and
// never gates a specific set's unlock.
const PASSING_SCORE_PCT = 90;
const MASTERY_GATE_PCT = 70;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Activity-based unlock: Day 1 is always available immediately on enrollment.
// Day N+1 unlocks only once Day N has actually been completed with a quiz
// (i.e. dayProgress[N] exists) — never just by time passing. A learner who
// takes a 4-day break comes back to exactly where they left off, not skipped
// ahead to whatever day the calendar would otherwise imply.
function getUnlockedDays(enrolledAt, dayProgress = {}) {
  let day = 1;
  while (day < TOTAL_DAYS && dayProgress[String(day)]) {
    day++;
  }
  return day;
}

function getWordsForDay(day) {
  return WORD_BANK.slice((day - 1) * WORDS_PER_DAY, day * WORDS_PER_DAY);
}

function getUnlockedWords(enrolledAt, dayProgress = {}) {
  return WORD_BANK.slice(0, getUnlockedDays(enrolledAt, dayProgress) * WORDS_PER_DAY);
}

function getWrongs(pool, correct, field) {
  return shuffle(pool.filter(w => w !== correct)).slice(0, 3).map(w => w[field]);
}

function calcStreak(scores) {
  if (!scores.length) return 0;
  const days = [...new Set(scores.map(s => new Date(s.date).toDateString()))].reverse();
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < days.length; i++) {
    const diff = Math.round((today - new Date(days[i])) / 86400000);
    if (diff === i) streak++;
    else break;
  }
  return streak;
}

// ── History page chart data helpers ───────────────────────────────────────────
// Aggregates a user's score history into the shapes the bar/pie charts need.

function buildAttemptScoreSeries(scores, maxBars = 10) {
  // Most recent N sessions, oldest-to-newest left-to-right (reading order).
  // For Set quizzes, label with the set number (S1, S2...). For All Sets Quiz
  // attempts there's no set number to show, and the date often repeats when
  // someone retakes it multiple times in one sitting — so label these simply
  // by attempt order (A1, A2...) which is always unique and stays short.
  const recent = [...scores].slice(-maxBars);
  return recent.map((s, i) => ({
    label: s.day ? `S${s.day}` : `A${i + 1}`,
    pct: s.pct,
    score: s.score,
    total: s.total,
    timeUsedSec: s.timeUsedSec ?? null,
    date: s.date,
  }));
}

function buildWordStrengthBreakdown(scores, allWords = []) {
  // Tally every individual word attempt across all sessions that have detail.
  // A word is "strong" if it's been answered correctly more often than not,
  // "weak" if wrong more often than right, "even" if tied (no clear pattern yet).
  const tally = {}; // key: arabic word -> { correct, wrong, english, translit, ...fullWordData }
  for (const s of scores) {
    if (!s.detail) continue;
    for (const d of s.detail) {
      const key = d.arabic;
      if (!tally[key]) {
        // Look up the full word entry (urdu, root, root meanings, ayah ref) so
        // the breakdown can show the same level of detail as the Day Words page.
        const full = allWords.find(w => w.arabic === d.arabic);
        tally[key] = {
          correct: 0, wrong: 0,
          arabic: d.arabic, english: d.english, translit: d.translit,
          urdu: full?.urdu, root: full?.root,
          rootEnglish: full?.rootEnglish, rootUrdu: full?.rootUrdu,
          ayahRef: full?.ayahRef,
        };
      }
      if (d.isCorrect) tally[key].correct++; else tally[key].wrong++;
    }
  }
  const words = Object.values(tally);
  const strong = words.filter(w => w.correct > w.wrong);
  const weak = words.filter(w => w.wrong > w.correct);
  const even = words.filter(w => w.wrong === w.correct);
  return { strong, weak, even, totalTracked: words.length };
}

// ── Strict word mastery (zero wrong attempts ever) ──────────────────────────────
// Different from the "strong" classification above (which allows more right
// than wrong) — mastery here requires every single attempt at a word to have
// been correct, with no exceptions. A single wrong answer, even if followed
// by many correct ones, means the word is NOT mastered yet under this rule.
// Word mastery: requires the most recent MASTERY_STREAK_REQUIRED attempts of
// a word to all be correct, in a row — older mistakes don't permanently block
// mastery once that many consecutive correct answers follow. A wrong answer
// at any point resets the streak back to zero for that word.
const MASTERY_STREAK_REQUIRED = 3;

function buildStrictMastery(scores) {
  const streaks = {}; // key: arabic word -> current consecutive-correct streak
  const attempted = new Set();
  // scores is chronological (oldest first, since it's built by appending each
  // new attempt) — process in that order so the streak reflects recency.
  for (const s of scores) {
    if (!s.detail) continue;
    for (const d of s.detail) {
      const key = d.arabic;
      attempted.add(key);
      if (d.isCorrect) {
        streaks[key] = (streaks[key] || 0) + 1;
      } else {
        streaks[key] = 0; // any wrong answer resets the streak
      }
    }
  }
  const masteredSet = new Set(
    Object.entries(streaks).filter(([, streak]) => streak >= MASTERY_STREAK_REQUIRED).map(([key]) => key)
  );
  return { masteredSet, attemptedSet: attempted };
}

// Checks whether a specific set has reached MASTERY_GATE_PCT (70%) of its
// words individually mastered — the alternative unlock path alongside a
// single 90%+ quiz pass. Counts attempts from both that set's own quiz and
// the All Sets Quiz, same as the calendar page's mastery display, so this
// check and what the learner actually sees on screen always agree.
function hasMetMasteryGate(setDay, allScores, allWords) {
  const setWords = getWordsForDay(setDay);
  if (setWords.length === 0) return false;
  const setWordArabics = new Set(setWords.map(w => w.arabic));
  const relevantScores = allScores.filter(s => s.day === setDay || s.day == null);
  const { masteredSet } = buildStrictMastery(relevantScores);
  const masteredInSet = [...masteredSet].filter(arabic => setWordArabics.has(arabic)).length;
  return (masteredInSet / setWords.length) * 100 >= MASTERY_GATE_PCT;
}

// ── Qur'an coverage estimate ────────────────────────────────────────────────────
// Based on published research on Quranic word frequency (not a made-up curve):
// learning the ~70-80 most frequent words covers roughly 50% of the Qur'an's
// text, ~150-200 words covers ~65%, ~300 covers ~75%, 500 covers ~80%, and
// beyond 1000 words approaches ~90%+. This interpolates between those known
// milestones rather than claiming false precision.
function estimateQuranCoverage(wordsLearned) {
  if (wordsLearned <= 0) return 0;
  if (wordsLearned >= 1000) return 90;
  if (wordsLearned >= 500) return 80;
  if (wordsLearned >= 300) return 75;
  if (wordsLearned >= 150) return 65;
  if (wordsLearned >= 70) return 50;
  // Below the first published milestone (70 words ≈ 50%), interpolate linearly
  // toward it rather than showing nothing.
  return Math.round((wordsLearned / 70) * 50);
}

// ── Words added in the last 7 days ──────────────────────────────────────────────
// Only counts words with a real addedAt timestamp (i.e. added via Admin after
// this feature existed) — the original built-in word bank has no add-date, so
// it's intentionally excluded rather than guessed at.
function countWordsAddedLastWeek(allWords) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return allWords.filter(w => w.addedAt && new Date(w.addedAt).getTime() >= weekAgo).length;
}

function storageGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function storageRemove(k) { try { localStorage.removeItem(k); } catch {} }

// ── Password hashing (SHA-256 via Web Crypto API) ─────────────────────────────
// Used for both the admin gate and per-user login (#5). This is client-side
// hashing — reasonable for a free learning tool with no backend server, but
// it's not a substitute for real server-side auth if this app ever handles
// sensitive data. It at least ensures passwords are never stored in plain text.
async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Password complexity rule ───────────────────────────────────────────────────
// Minimum 10 characters, at least 1 number, at least 1 special character.
// Used consistently across Sign Up, the emailed reset-link flow, and Admin's
// own password change — so the same rule applies everywhere a password is set.
function getPasswordComplexityError(password) {
  if (password.length < 10) return "Password must be at least 10 characters.";
  if (!/[0-9]/.test(password)) return "Password must include at least 1 number.";
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return "Password must include at least 1 special character.";
  return null;
}

// Default admin password is "admin123" — CHANGE THIS before going live, either
// by replacing the hash below, or (recommended) by using the in-app "Change
// Password" option inside Admin → Settings, which stores an override in
// localStorage that takes precedence over this default automatically.
const ADMIN_PASSWORD_HASH = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9"; // sha256("admin123")

function getActiveAdminPasswordHash() {
  return storageGet("qv_admin_pw_hash") || ADMIN_PASSWORD_HASH;
}

// Default finance-team password is "finance123" — separate, independent
// password from Admin's, since finance access should only ever reach the
// restricted receipt-issuing screen, never admin's broader capabilities
// (word management, account editing, test-data wipe, etc). Same pattern as
// the admin password: change it via the in-app "Change Password" screen,
// which stores an override in localStorage taking precedence over this default.
const FINANCE_PASSWORD_HASH = "48f7312924d74358e75294e3b3613f2319d99e944184b69550f528577ca082fb"; // sha256("finance123")

function getActiveFinancePasswordHash() {
  return storageGet("qv_finance_pw_hash") || FINANCE_PASSWORD_HASH;
}

// Admin's notification email — one-time setup in Admin → Settings, editable
// only after re-confirming the admin password. Currently used to display
// "where reset requests would be emailed" and to label the Message Center.
// Wiring this up to actually SEND email (e.g. via EmailJS) is a follow-up step
// once an EmailJS account is set up — this field is ready for that integration.
function getAdminEmail() {
  return storageGet("qv_admin_email") || "";
}
function setAdminEmail(email) {
  storageSet("qv_admin_email", email.trim());
}

// ── Admin Message Center — password reset requests ────────────────────────────
// Stored in localStorage like the rest of this app's data. Note: this means
// a request is only visible to Admin if Admin opens /admin in the SAME
// browser the learner used — consistent with how participants/scores already
// work in this version of the app (no shared backend yet). If true cross-device
// visibility is needed later, this and the rest of the app's data should move
// to a shared backend (e.g. the Firebase layer built separately for this app).
function getMessages() {
  return storageGet("qv_messages") || [];
}
function addMessage(msg) {
  const all = getMessages();
  all.unshift({ id: Date.now() + Math.random().toString(36).slice(2), read: false, resolved: false, createdAt: new Date().toISOString(), ...msg });
  storageSet("qv_messages", all);
}
function markMessageRead(id) {
  const all = getMessages().map(m => m.id === id ? { ...m, read: true } : m);
  storageSet("qv_messages", all);
}
function markMessageResolved(id) {
  const all = getMessages().map(m => m.id === id ? { ...m, resolved: true, read: true } : m);
  storageSet("qv_messages", all);
}

// ── Donation receipts (admin-issued, after finance team confirms payment) ──────
// Sequential numbering per calendar year, e.g. ABM-2026-001, ABM-2026-002...
// This is admin-issued bookkeeping, not an automated/verified payment receipt
// — the app has no way to independently confirm a UPI payment occurred, since
// UPI deep-links and QR scans complete entirely inside the donor's own banking
// app with no callback to this site. The finance team confirms funds received
// (outside the app) and tells admin, who then issues the receipt manually.
const RECEIPT_PREFIX = "ABM";

function getReceipts() {
  return storageGet("qv_receipts") || [];
}
function getNextReceiptNumber() {
  const year = new Date().getFullYear();
  const all = getReceipts();
  const thisYearCount = all.filter(r => r.receiptNo.includes(`-${year}-`)).length;
  const next = String(thisYearCount + 1).padStart(3, "0");
  return `${RECEIPT_PREFIX}-${year}-${next}`;
}
function addReceipt(receipt) {
  const all = getReceipts();
  const record = {
    id: Date.now() + Math.random().toString(36).slice(2),
    receiptNo: getNextReceiptNumber(),
    issuedAt: new Date().toISOString(),
    ...receipt,
  };
  all.unshift(record);
  storageSet("qv_receipts", all);
  return record;
}

// ── EmailJS configuration ──────────────────────────────────────────────────────
// Sends transactional emails via Titan SMTP (support@awamibaitulmaal.org.in),
// connected through EmailJS. No backend server needed — EmailJS's public key is
// safe to expose client-side by design (see EmailJS docs); their free tier caps
// abuse at 200 emails/month.
const EMAILJS_SERVICE_ID = "service_u97pazt";
const EMAILJS_RESET_TEMPLATE_ID = "template_hbjl6yv";
// Free EmailJS tier allows only 2 templates total. Reset uses one slot;
// this Verify template is reused as a GENERIC SHELL for both email
// verification AND donation receipts (see sendVerificationEmail and
// sendReceiptEmail below) — it needs these variables in EmailJS's dashboard:
//   {{to_email}}, {{recipient_name}}, {{email_heading}}, {{email_body}},
//   {{{email_body_html}}} (triple braces — unescaped HTML, used only for
//   the receipt's invoice table), {{cta_label}}, {{cta_link}}
// If donations become regular, upgrading EmailJS to a paid tier ($9/mo,
// Personal plan) unlocks a dedicated receipt template — at that point,
// give receipts their own EMAILJS_RECEIPT_TEMPLATE_ID instead of sharing
// this one, and point sendReceiptEmail at it.
const EMAILJS_VERIFY_TEMPLATE_ID = "template_s5mtjrc";
const EMAILJS_PUBLIC_KEY = "lVfbS-yLSA3hkGGT5";

let _emailjsLoaded = null;
async function loadEmailJS() {
  if (_emailjsLoaded) return _emailjsLoaded;
  _emailjsLoaded = new Promise((resolve, reject) => {
    if (window.emailjs) { resolve(window.emailjs); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
    script.onload = () => {
      window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
      resolve(window.emailjs);
    };
    script.onerror = () => reject(new Error("Failed to load EmailJS"));
    document.head.appendChild(script);
  });
  return _emailjsLoaded;
}

async function sendResetEmail({ toEmail, learnerName, resetLink }) {
  const emailjs = await loadEmailJS();
  return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_RESET_TEMPLATE_ID, {
    to_email: toEmail,
    learner_name: learnerName,
    reset_link: resetLink,
  });
}

// ── Password reset tokens ──────────────────────────────────────────────────────
// Single-use, time-limited tokens. A reset link looks like:
//   https://quranvocab.awamibaitulmaal.org.in/?reset=TOKEN
// Opening that link lets the learner set their own new password directly —
// the actual password is never written into the email itself.
const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateResetToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function getResetTokens() {
  return storageGet("qv_reset_tokens") || {};
}
function createResetToken(userId, messageId = null) {
  const tokens = getResetTokens();
  const token = generateResetToken();
  tokens[token] = { userId, messageId, createdAt: Date.now(), used: false };
  storageSet("qv_reset_tokens", tokens);
  return token;
}
function validateResetToken(token) {
  const tokens = getResetTokens();
  const entry = tokens[token];
  if (!entry) return { valid: false, reason: "not-found" };
  if (entry.used) return { valid: false, reason: "used" };
  if (Date.now() - entry.createdAt > RESET_TOKEN_TTL_MS) return { valid: false, reason: "expired" };
  return { valid: true, userId: entry.userId, messageId: entry.messageId };
}
function consumeResetToken(token) {
  const tokens = getResetTokens();
  if (tokens[token]) {
    tokens[token].used = true;
    storageSet("qv_reset_tokens", tokens);
  }
}

// ── Email verification tokens ──────────────────────────────────────────────────
// Separate token store from password-reset tokens (different purpose, should
// never be interchangeable). A verification link looks like:
//   https://quranvocab.awamibaitulmaal.org.in/?verify=TOKEN
// New accounts are created with emailVerified:false and can't log in until
// the link is opened — this catches typo'd/unreachable emails (e.g. gmail.cm)
// at the moment of signup, instead of discovering it later when something
// needs to be emailed to them.
const VERIFY_TOKEN_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours — longer than reset, since it's less urgent

function getVerifyTokens() {
  return storageGet("qv_verify_tokens") || {};
}
function createVerifyToken(userId) {
  const tokens = getVerifyTokens();
  const token = generateResetToken(); // same secure random generator, different store
  tokens[token] = { userId, createdAt: Date.now(), used: false };
  storageSet("qv_verify_tokens", tokens);
  return token;
}
function validateVerifyToken(token) {
  const tokens = getVerifyTokens();
  const entry = tokens[token];
  if (!entry) return { valid: false, reason: "not-found" };
  if (entry.used) return { valid: false, reason: "used" };
  if (Date.now() - entry.createdAt > VERIFY_TOKEN_TTL_MS) return { valid: false, reason: "expired" };
  return { valid: true, userId: entry.userId };
}
function consumeVerifyToken(token) {
  const tokens = getVerifyTokens();
  if (tokens[token]) {
    tokens[token].used = true;
    storageSet("qv_verify_tokens", tokens);
  }
}

// Verification emails and receipt emails share ONE EmailJS template slot
// (EMAILJS_VERIFY_TEMPLATE_ID), since the free EmailJS tier only allows 2
// templates total and Reset + Verify already use both. The shared template
// must be built generically in EmailJS's dashboard with these variables:
//   {{to_email}}, {{recipient_name}}, {{email_heading}}, {{email_body}},
//   {{cta_label}}, {{cta_link}}
// — so it can render either a "verify your email" message or a donation
// receipt, depending on what this function passes in. If donations start
// coming in regularly, upgrading EmailJS to a paid tier (for a dedicated
// receipt template) is the natural next step — see DONATE comments below.
async function sendVerificationEmail({ toEmail, learnerName, verifyLink }) {
  const emailjs = await loadEmailJS();
  return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_VERIFY_TEMPLATE_ID, {
    to_email: toEmail,
    learner_name: learnerName,
    verify_link: verifyLink,
    // Generic shell variables, populated for the verification case specifically:
    recipient_name: learnerName,
    email_heading: "Verify Your Email",
    email_body: `Welcome to Quranic Vocab — a daily journey into the words of the Qur'an, brought to you by Awami Baitulmaal Committee. Before you begin, please confirm this is your email address by clicking the link below. Once verified, you'll be logged in automatically and your first set of words will be ready and waiting. This link is valid for 48 hours. If you didn't create this account, you can safely ignore this email.`,
    email_body_html: "", // unused for verification — plain email_body is used instead
    cta_label: "Verify My Email",
    cta_link: verifyLink,
  });
}

async function sendReceiptEmail({ toEmail, donorName, receiptNo, amount, donationDate, purpose, note }) {
  const emailjs = await loadEmailJS();
  // Registration details: only includes what's actually been confirmed and
  // filled in DONATE above. Starts with just PAN; will automatically pick up
  // 80G/12A details the moment those are filled in, with no code changes.
  const regParts = [];
  if (DONATE.pan && DONATE.pan !== "PASTE_TRUST_PAN_HERE") regParts.push(`PAN: ${DONATE.pan}`);
  if (DONATE.reg12A) regParts.push(`12A Reg. No: ${DONATE.reg12A}`);
  if (DONATE.reg80G) {
    let line = `80G Reg. No: ${DONATE.reg80G}`;
    if (DONATE.reg80GValidTo) line += ` (valid till ${DONATE.reg80GValidTo})`;
    regParts.push(line);
  }
  const registrationLine = regParts.join(" &middot; ");
  // Only mention tax-deduction eligibility once 80G is confirmed AND the
  // trust has actually filed Form 10BD for the relevant year — printing this
  // prematurely is exactly the kind of claim that needs to be accurate.
  const taxNote = (DONATE.reg80G && DONATE.form10BDFiled)
    ? "This donation may be eligible for tax deduction under Section 80G. Your Form 10BE certificate (if applicable) will be issued separately by the Income Tax Department portal."
    : "";

  const formattedDate = new Date(donationDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // Real HTML invoice table — sent as raw HTML (see {{{email_body_html}}}
  // in the template, triple braces = unescaped) rather than plain text, so
  // it actually looks like a structured receipt/invoice instead of a list
  // of lines. A row only appears if its value exists.
  const row = (label, value) => value
    ? `<tr><td style="padding:9px 14px;border-bottom:1px solid #f0e3d3;color:#777;font-size:13px;">${label}</td><td style="padding:9px 14px;border-bottom:1px solid #f0e3d3;color:#222;font-size:14px;text-align:right;font-weight:600;">${value}</td></tr>`
    : "";

  const tableRows = [
    row("Receipt No.", `<span style="font-family:monospace;color:#0eab23;">${receiptNo}</span>`),
    row("Donor Name", donorName),
    row("Amount", `&#8377;${amount}`),
    row("Date Received", formattedDate),
    row("Purpose", purpose),
    note ? row("Note", note) : "",
  ].join("");

  const emailBodyHtml = `
    <p style="margin:0 0 16px;">Thank you for your generous contribution to <strong>${DONATE.charityName}</strong> (Quranic Vocab &mdash; Awami Baitulmaal Committee).</p>
    <table style="width:100%;border-collapse:collapse;background:#fffdfa;border:1px solid #f0e3d3;border-radius:8px;overflow:hidden;margin-bottom:16px;">
      <tbody>${tableRows}</tbody>
    </table>
    ${registrationLine ? `<p style="margin:0 0 10px;font-size:12px;color:#888;">${registrationLine}</p>` : ""}
    ${taxNote ? `<p style="margin:0 0 16px;font-size:13px;color:#0eab23;">${taxNote}</p>` : ""}
    <p style="margin:0;">This receipt confirms funds received as reported by our finance team. May Allah accept your contribution and reward you abundantly.</p>
  `;

  // Shares the same EmailJS template slot as verification emails (see note
  // above sendVerificationEmail) — uses the same generic shell variables,
  // plus email_body_html specifically for this invoice-style table.
  return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_VERIFY_TEMPLATE_ID, {
    to_email: toEmail,
    // Generic shell variables, populated for the receipt case specifically:
    recipient_name: donorName,
    email_heading: `Donation Receipt — ${receiptNo}`,
    email_body: "", // unused for receipts — real content is in email_body_html
    email_body_html: emailBodyHtml,
    cta_label: "",
    cta_link: "",
  });
}

// ── Email domain validation ──────────────────────────────────────────────────
// Checks whether the email's domain actually has mail servers (MX records),
// using Google's free public DNS-over-HTTPS API. Catches typos and made-up
// domains (e.g. gmial.com, fake123.com) without sending any email or requiring
// the user to click a confirmation link — fully silent and frictionless.

const KNOWN_DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "tempmail.com", "10minutemail.com", "guerrillamail.com",
  "throwawaymail.com", "yopmail.com", "trashmail.com", "fakeinbox.com",
  "getnada.com", "maildrop.cc", "discard.email", "sharklasers.com",
]);

// Major providers to check near-misses against. A typo domain (e.g. gmail.cm,
// gmial.com) can sometimes have its own real, working mail servers — especially
// typo-squatted domains set up deliberately — so the MX check alone won't catch
// it. This catches it by spelling distance instead, and just warns rather than
// blocking, since it can't be 100% certain the user made a mistake.
const COMMON_PROVIDERS = [
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "live.com", "aol.com", "protonmail.com", "rediffmail.com", "yandex.com",
];

// Microsoft alias groups — all valid domains but users confuse them.
// If someone enters one, warn them to check they use the right one.
const MICROSOFT_ALIASES = {
  "outlook.com": ["hotmail.com", "live.com", "msn.com"],
  "hotmail.com": ["outlook.com", "live.com", "msn.com"],
  "live.com":    ["outlook.com", "hotmail.com", "msn.com"],
  "msn.com":     ["outlook.com", "hotmail.com", "live.com"],
};

// Yahoo alias group
const YAHOO_ALIASES = {
  "yahoo.com":   ["ymail.com", "yahoo.co.in", "yahoo.co.uk"],
  "ymail.com":   ["yahoo.com"],
  "yahoo.co.in": ["yahoo.com"],
  "yahoo.co.uk": ["yahoo.com"],
};

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function findLikelyTypoOf(domain) {
  if (COMMON_PROVIDERS.includes(domain)) return null; // exact match — no warning
  for (const provider of COMMON_PROVIDERS) {
    const dist = levenshtein(domain, provider);
    // Close enough to be a likely typo (1-2 character difference) but not identical
    if (dist > 0 && dist <= 2) return provider;
  }
  return null;
}

async function isEmailDomainValid(email) {
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[1].includes(".")) {
    return { valid: false, reason: "format" };
  }
  const domain = parts[1].toLowerCase().trim();

  if (KNOWN_DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, reason: "disposable" };
  }

  // Microsoft / Yahoo alias warning — both domains are real and valid,
  // but users frequently confuse outlook.com ↔ hotmail.com ↔ live.com
  const msAliases = MICROSOFT_ALIASES[domain];
  if (msAliases) {
    return { valid: true, reason: "alias-warning", aliases: msAliases, provider: "Microsoft" };
  }
  const yahooAliases = YAHOO_ALIASES[domain];
  if (yahooAliases) {
    return { valid: true, reason: "alias-warning", aliases: yahooAliases, provider: "Yahoo" };
  }

  // Soft warning for likely typos of major providers (e.g. gmail.cm, gmial.com,
  // outlok.com) — surfaced even if the domain technically has MX records, since
  // typo-squatted domains can be deliberately configured to look functional.
  const typoOf = findLikelyTypoOf(domain);

  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`, {
      signal: AbortSignal.timeout(4000),
    });
    const data = await res.json();
    // Status 0 = NOERROR, and at least one MX/Answer record present
    const hasMx = data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;
    if (!hasMx) return { valid: false, reason: "no-mx" };
    if (typoOf) return { valid: true, reason: "likely-typo", suggestion: typoOf };
    return { valid: true, reason: "ok" };
  } catch (err) {
    // If the DNS check itself fails (offline, blocked, timeout), don't block
    // enrollment — fail open so a real user is never locked out by a network hiccup.
    if (typoOf) return { valid: true, reason: "likely-typo", suggestion: typoOf };
    return { valid: true, reason: "check-unavailable" };
  }
}

const GEO = `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><g fill='none' stroke='rgba(0,200,230,0.08)' stroke-width='.7'><polygon points='90,8 108,62 164,62 118,96 136,150 90,116 44,150 62,96 16,62 72,62'/><circle cx='90' cy='90' r='65'/><line x1='90' y1='0' x2='90' y2='180'/><line x1='0' y1='90' x2='180' y2='90'/></g></svg>`;
const bgUrl = `data:image/svg+xml;base64,${btoa(GEO)}`;

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;600;700&family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#071c2a;--s1:rgba(255,255,255,.05);--s2:rgba(255,255,255,.08);--s3:rgba(255,255,255,.12);
  --cyan:#00c8e6;--cyan2:#1ae6ff;
  --teal:#00e6b4;--teal2:#1affd4;
  --gold:#ffc940;--gold2:#ffd96b;--gold3:#ffe899;
  --text:#f0f8ff;--muted:#7ab8d4;
  --ok:#00c8e6;--err:#ff5252;
  --glow:rgba(0,200,230,.22);--glow2:rgba(0,200,230,.12);
}
body{background:var(--bg);color:var(--text);font-family:'Poppins',system-ui,sans-serif;min-height:100vh;font-size:15px;-webkit-font-smoothing:antialiased;}
.app{min-height:100vh;background:
  radial-gradient(ellipse 70% 45% at 15% -5%,rgba(0,180,220,.18),transparent),
  radial-gradient(ellipse 60% 60% at 88% 100%,rgba(0,180,210,.14),transparent),
  radial-gradient(ellipse 80% 50% at 50% 50%,rgba(0,0,0,.3),transparent),
  var(--bg);}
.nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:13px 28px;
  background:rgba(11,26,20,.82);backdrop-filter:blur(28px) saturate(1.6);
  border-bottom:1px solid rgba(0,200,230,.22);
  box-shadow:0 4px 32px rgba(0,0,0,.5),0 1px 0 rgba(0,200,230,.15),inset 0 1px 0 rgba(255,255,255,.06);}
.nlogo{display:flex;align-items:center;gap:10px;cursor:pointer;}
.nicon{width:38px;height:38px;border-radius:50%;background:linear-gradient(145deg,#1ae6ff,#0090b8);display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 18px rgba(0,200,230,.5),0 3px 10px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.2);}
.ntext h1{font-family:'Poppins',sans-serif;font-size:17px;font-weight:700;color:var(--cyan2);letter-spacing:.02em;text-shadow:0 0 20px rgba(0,200,230,.5);}
.ntext span{font-size:10px;color:var(--muted);}
.nright{display:flex;align-items:center;gap:8px;}
.nuser-wrap{position:relative;}
.admin-mode-badge{
  font-family:'Poppins',sans-serif;font-size:11px;letter-spacing:.02em;
  color:var(--cyan2);background:rgba(0,200,230,.1);
  border:1px solid rgba(0,200,230,.35);border-radius:14px;
  padding:5px 14px;box-shadow:0 0 12px rgba(0,200,230,.15);
}
.admin-msg-badge{
  font-family:'Poppins',sans-serif;font-size:11px;letter-spacing:.01em;
  color:#fff;background:var(--err);
  border-radius:14px;padding:5px 12px;
  animation:msgPulse 2s ease-in-out infinite;
}
@keyframes msgPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,82,82,.5);}50%{box-shadow:0 0 0 6px rgba(255,82,82,0);}}
.nuser{font-size:12px;color:var(--cyan2);padding:4px 11px;border-radius:16px;background:rgba(0,200,230,.1);border:1px solid rgba(0,200,230,.3);cursor:pointer;font-family:'Poppins',sans-serif;transition:all .18s;}
.nuser:hover{background:rgba(0,180,220,.18);border-color:var(--cyan);box-shadow:0 0 14px rgba(0,200,230,.2);}
.nuser-menu{
  position:absolute;top:calc(100% + 8px);right:0;
  background:rgba(11,26,20,.96);backdrop-filter:blur(20px);
  border:1px solid rgba(0,200,230,.25);
  border-radius:12px;min-width:200px;
  box-shadow:0 16px 48px rgba(0,0,0,.7),0 0 24px rgba(0,200,230,.1);
  z-index:300;overflow:hidden;
  animation:menuIn .16s ease;
}
@keyframes menuIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.nuser-menu-email{padding:10px 14px;font-size:11px;color:var(--muted);border-bottom:1px solid rgba(0,200,230,.12);word-break:break-all;}
.nuser-menu-item{
  display:block;width:100%;text-align:left;
  background:none;border:none;color:var(--text);
  padding:10px 14px;font-size:13px;cursor:pointer;
  font-family:'Poppins',sans-serif;transition:background .15s;
}
.nuser-menu-item:hover{background:rgba(0,200,230,.1);color:var(--cyan2);}
.nuser-menu-item.logout{color:#ff8a80;}
.nuser-menu-item.logout:hover{background:rgba(255,82,82,.1);color:#ff5252;}
.nbtn{background:transparent;border:1px solid rgba(0,200,230,.22);color:var(--muted);padding:5px 14px;border-radius:16px;font-family:'Poppins',sans-serif;font-size:12px;cursor:pointer;transition:all .18s;}
.nbtn:hover,.nbtn.on{border-color:var(--cyan);color:var(--cyan2);box-shadow:0 0 10px rgba(0,200,230,.2);}
.ncta{background:linear-gradient(135deg,var(--cyan),#0090b8);border:none;color:#fff;padding:6px 16px;border-radius:16px;font-family:'Poppins',sans-serif;font-size:11px;cursor:pointer;font-weight:500;transition:all .2s;box-shadow:0 4px 16px rgba(0,200,230,.35);}
.ncta:hover{transform:translateY(-1px);box-shadow:0 6px 22px rgba(0,200,230,.45);}
.page{max-width:860px;margin:0 auto;padding:44px 22px;animation:fu .32s ease;}
.pmd{max-width:680px;}.psm{max-width:520px;}
@keyframes fu{from{opacity:0;transform:translateY(13px)}to{opacity:1;transform:none}}
@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.lbl{font-family:'Poppins',sans-serif;font-size:13px;letter-spacing:.02em;text-transform:uppercase;color:var(--cyan2);display:flex;align-items:center;gap:9px;margin-bottom:13px;font-weight:600;}
.lbl::before{content:'';width:28px;height:2px;background:var(--cyan2);border-radius:1px;}
.lbl::before{content:'';width:26px;height:1px;background:var(--teal);}
h2{font-family:'Poppins',sans-serif;font-size:30px;font-weight:700;margin-bottom:8px;color:var(--text);}
.sub{color:var(--muted);font-size:17px;font-weight:300;line-height:1.85;}
.arabic{font-family:'Scheherazade New',serif;direction:rtl;}
.card{
  background:rgba(255,255,255,.045);
  border:1px solid rgba(0,200,230,.22);
  border-radius:16px;padding:28px;
  backdrop-filter:blur(12px);
  box-shadow:0 8px 40px rgba(0,0,0,.45),0 0 0 1px rgba(0,200,230,.06),inset 0 1px 0 rgba(255,255,255,.07);
}
.card+.card{margin-top:16px;}
.field{margin-bottom:16px;}
.field label{display:block;font-size:12px;color:var(--muted);margin-bottom:5px;letter-spacing:.07em;font-family:'Poppins',sans-serif;}
.field input{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(0,200,230,.2);color:var(--text);padding:11px 14px;border-radius:9px;font-family:'Poppins',sans-serif;font-size:15px;outline:none;transition:all .2s;box-shadow:inset 0 2px 8px rgba(0,0,0,.3);}
.field input::placeholder{color:rgba(122,184,152,.5);}
.field input:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(0,200,230,.15),inset 0 2px 8px rgba(0,0,0,.2);}

/* ── ENROLLMENT — VALIDATION ERROR ── */
.enroll-error{
  font-size:12.5px;color:#e0a098;background:rgba(192,80,74,.08);
  border:1px solid rgba(192,80,74,.25);border-radius:7px;
  padding:9px 13px;margin:-4px 0 14px;line-height:1.5;
}

/* ── ENROLLMENT — LOGIN HINT ── */
.enroll-hint{
  font-size:11.5px;color:var(--muted);text-align:center;
  margin-top:12px;line-height:1.5;
}
.forgot-link{color:var(--teal2);cursor:pointer;text-decoration:underline;text-decoration-color:rgba(34,139,112,.4);}
.forgot-link:hover{color:var(--gold3);}

/* ── ENROLLMENT — AUTH MODE TABS (Login / Sign Up / Upgrade) ── */
.auth-mode-tabs{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;}
.auth-mode-tab{
  flex:1;min-width:90px;padding:9px 10px;border-radius:8px;
  background:rgba(255,255,255,.06);border:1px solid rgba(0,200,230,.14);
  color:var(--muted);font-family:'Poppins',sans-serif;font-size:11.5px;
  letter-spacing:.01em;cursor:pointer;transition:all .18s;
}
.auth-mode-tab:hover{border-color:rgba(0,200,230,.25);color:var(--gold3);}
.auth-mode-tab.on{background:rgba(0,200,230,.1);border-color:var(--cyan2);color:var(--cyan2);}
@keyframes tagIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}

/* ── ENROLLMENT — TYPO WARNING ── */
.enroll-typo-warning{
  background:rgba(0,200,230,.06);border:1px solid rgba(0,200,230,.22);
  border-radius:8px;padding:12px 14px;margin:-4px 0 14px;
  font-size:13px;color:var(--cyan2);line-height:1.5;
  animation:tagIn .2s ease;
}
.enroll-typo-warning strong{color:var(--cyan2);}
.enroll-typo-actions{display:flex;gap:8px;margin-top:10px;}
.enroll-typo-actions .btn{flex:1;}

/* ── ENROLLMENT — SINCERITY MESSAGE ── */
.enroll-sincerity{
  margin-top:22px;padding:20px 22px;text-align:center;
  background:linear-gradient(135deg,rgba(0,200,230,.05),rgba(180,134,11,.03));
  border:1px solid rgba(0,200,230,.15);border-radius:10px;
}
.enroll-sincerity .arabic{
  font-family:'Scheherazade New',serif;font-size:24px;color:var(--cyan2);
  direction:rtl;margin-bottom:10px;
}
.enroll-sincerity p{
  font-size:13px;color:var(--muted);line-height:1.75;font-style:italic;
  max-width:420px;margin:0 auto;
}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 26px;border-radius:9px;font-family:'Poppins',sans-serif;font-size:15px;cursor:pointer;transition:all .18s;border:none;font-weight:500;}
.bg{
  background:linear-gradient(145deg,#1ae6ff,#0090b8);color:#fff;
  box-shadow:0 5px 22px rgba(0,200,230,.5),0 2px 6px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.25);
}
.bg:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(0,200,230,.6),0 4px 12px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.3);}
.bg:active{transform:translateY(1px);box-shadow:0 2px 10px rgba(0,200,230,.3),inset 0 3px 8px rgba(0,0,0,.2);}
.bt{background:linear-gradient(145deg,#00c8e6,#0078a8);color:#fff;box-shadow:0 4px 16px rgba(0,200,230,.4),inset 0 1px 0 rgba(255,255,255,.2);}
.bt:hover{background:linear-gradient(145deg,#1ae6ff,#00c8e6);}
.bh{background:rgba(255,255,255,.06);border:1px solid rgba(0,200,230,.25);color:var(--muted);backdrop-filter:blur(8px);}
.bh:hover{border-color:var(--cyan);color:var(--cyan2);background:rgba(0,200,230,.08);}
.bsm{padding:7px 16px;font-size:13px;}.bfw{width:100%;}
.btn:disabled{opacity:.35;cursor:not-allowed;transform:none!important;box-shadow:none!important;}
.srow{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px;}
.sbox{
  background:rgba(0,200,230,.07);
  border:1px solid rgba(0,200,230,.28);
  border-radius:14px;padding:20px 14px;text-align:center;
  backdrop-filter:blur(10px);
  box-shadow:0 6px 24px rgba(0,0,0,.35),0 0 20px rgba(0,200,230,.08),inset 0 1px 0 rgba(255,255,255,.07);
  transition:transform .2s,box-shadow .2s;cursor:default;
  position:relative;
}
.sbox:hover{transform:translateY(-3px);box-shadow:0 12px 36px rgba(0,0,0,.4),0 0 30px rgba(0,200,230,.15),inset 0 1px 0 rgba(255,255,255,.1);}
.sn{font-family:'Poppins',sans-serif;font-size:36px;font-weight:700;color:var(--gold2);}
.sl{font-size:11px;color:var(--muted);letter-spacing:.07em;margin-top:4px;text-transform:uppercase;}
.cal{display:grid;grid-template-columns:repeat(auto-fill,minmax(34px,1fr));gap:5px;}
.cc{aspect-ratio:1;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:10px;cursor:pointer;transition:all .14s;border:1px solid transparent;}
.cc.locked{background:rgba(0,0,0,.04);color:rgba(0,0,0,.18);cursor:default;}
.cc.done{background:rgba(0,200,230,.12);color:var(--ok);border-color:rgba(0,200,230,.28);}
.cc.today{background:rgba(0,180,220,.18);color:var(--cyan2);border-color:var(--cyan2);font-weight:600;}
.cc.avail{background:rgba(0,200,230,.05);color:var(--muted);border-color:rgba(0,200,230,.12);}
.cc:not(.locked):hover{border-color:var(--cyan2);color:var(--cyan2);}
.cc.cc-continues{background:transparent;cursor:default;color:var(--muted);font-size:16px;letter-spacing:1px;opacity:.5;}
.cc.selected{border-color:var(--cyan2);box-shadow:0 0 0 1px var(--teal);}
.cc-allsets{
  grid-column:span 3;aspect-ratio:auto;height:100%;min-height:34px;
  border-radius:7px;display:flex;align-items:center;justify-content:center;
  font-size:12px;font-family:'Poppins',sans-serif;font-weight:600;letter-spacing:.02em;
  cursor:pointer;transition:all .18s;
  background:linear-gradient(135deg,rgba(0,200,230,.25),rgba(0,180,210,.18));
  color:var(--cyan2);border:1.5px solid rgba(0,200,230,.45);
  white-space:nowrap;padding:0 14px;
  box-shadow:0 0 14px rgba(0,200,230,.15),inset 0 1px 0 rgba(255,255,255,.08);
}
.cc-allsets:hover{border-color:var(--cyan2);background:linear-gradient(135deg,rgba(0,200,230,.38),rgba(0,180,210,.28));box-shadow:0 0 22px rgba(0,200,230,.25);}
.cc-allsets.selected{background:linear-gradient(135deg,var(--cyan),#0090b8);color:#fff;border-color:var(--cyan);box-shadow:0 0 0 2px rgba(0,200,230,.3),0 4px 16px rgba(0,200,230,.3);}
.set-mastery-banner{
  background:rgba(0,200,230,.06);border:1px solid rgba(0,180,220,.18);
  border-radius:8px;padding:11px 14px;font-size:13px;color:var(--text);line-height:1.5;
}
.set-mastery-banner strong{color:var(--cyan2);}
.wlist{display:grid;gap:12px;}
.word-card{
  background:rgba(255,255,255,.04);
  border:1px solid rgba(0,200,230,.2);
  border-radius:14px;padding:16px 20px;
  transition:all .22s;backdrop-filter:blur(10px);
  box-shadow:0 4px 20px rgba(0,0,0,.35),0 0 0 1px rgba(0,200,230,.04),inset 0 1px 0 rgba(255,255,255,.06);
}
.word-card:hover{
  transform:translateY(-2px);
  border-color:rgba(0,200,230,.42);
  box-shadow:0 10px 36px rgba(0,0,0,.45),0 0 24px rgba(0,200,230,.14),inset 0 1px 0 rgba(255,255,255,.09);
}
.word-card-unmastered{background:rgba(255,82,82,.05);border-color:rgba(255,82,82,.25);}
.word-card-unmastered:hover{border-color:rgba(255,82,82,.45);}
.word-card-main{display:grid;grid-template-columns:auto 1fr auto;align-items:stretch;gap:14px;}
.war{font-family:'Scheherazade New',serif;font-size:34px;font-weight:600;color:var(--gold2);text-align:right;text-shadow:0 0 18px rgba(255,184,0,.3);display:flex;align-items:center;min-width:80px;}
.wtr{font-size:13px;color:var(--muted);font-style:italic;text-align:center;display:none;}
.wen{font-size:17px;font-weight:400;color:var(--text);display:flex;align-items:center;justify-content:center;text-align:center;flex:1;}
.word-urdu{font-family:'Scheherazade New',serif;font-size:22px;color:var(--teal2);direction:rtl;text-align:right;text-shadow:0 0 12px rgba(0,212,168,.25);}
.word-toggle{
  background:rgba(0,200,230,.08);border:1px solid rgba(0,200,230,.28);
  color:var(--muted);font-size:11px;padding:5px 10px;border-radius:8px;
  cursor:pointer;transition:all .15s;white-space:nowrap;
}
.word-toggle:hover{border-color:var(--cyan);color:var(--cyan2);background:rgba(0,200,230,.14);box-shadow:0 0 12px rgba(0,200,230,.2);}
.word-card-detail{
  margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,200,230,.1);
  display:grid;grid-template-columns:auto 1fr;gap:7px 16px;font-size:14px;
  animation:tagIn .15s ease;
}
.word-card-detail .dlabel{color:var(--muted);font-family:'Poppins',sans-serif;font-size:11px;letter-spacing:.07em;text-transform:uppercase;}
.word-card-detail .dval{color:var(--text);}
.word-card-detail .dval.arabic{font-family:'Scheherazade New',serif;font-size:28px;font-weight:600;color:var(--gold2);direction:rtl;text-align:left;text-shadow:0 0 14px rgba(255,184,0,.25);}
.word-card-detail .dval.urdu{font-family:'Scheherazade New',serif;font-size:25px;font-weight:600;color:var(--teal2);direction:rtl;text-align:left;}
.qwrap{max-width:620px;margin:0 auto;}
.qprog{display:flex;gap:3px;margin-bottom:22px;}
.qd{height:5px;flex:1;border-radius:3px;background:rgba(255,255,255,.08);transition:background .28s;}
.qd.done{background:var(--cyan);box-shadow:0 0 8px rgba(0,200,230,.5);}
.qd.now{background:linear-gradient(90deg,var(--cyan),var(--teal));box-shadow:0 0 12px rgba(0,200,230,.6);}
.qcard{
  background:rgba(255,255,255,.04);
  backdrop-filter:blur(20px);
  border:1px solid rgba(0,200,230,.25);
  border-radius:20px;padding:44px 36px;text-align:center;
  box-shadow:
    0 24px 80px rgba(0,0,0,.6),
    0 0 60px rgba(0,200,230,.08),
    0 0 0 1px rgba(0,200,230,.06),
    inset 0 1px 0 rgba(255,255,255,.08);
  background-image:url("${bgUrl}");background-size:180px;
}
.qdir{font-family:'Poppins',sans-serif;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--teal2);margin-bottom:18px;font-weight:500;}
.qq{font-size:70px;color:var(--gold2);line-height:1.18;margin-bottom:6px;font-weight:700;text-shadow:0 0 30px rgba(255,184,0,.45),0 2px 8px rgba(0,0,0,.4);}
.qq.en{font-size:30px;font-weight:400;color:var(--text);text-shadow:none;}
.qtr{font-size:14px;color:var(--muted);font-style:italic;margin-bottom:38px;}
.opts{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.opt{
  background:rgba(255,255,255,.06);
  border:1px solid rgba(0,180,220,.18);
  border-bottom:2px solid rgba(0,200,230,.28);
  color:var(--text);padding:17px 14px;border-radius:13px;
  font-family:'Poppins',sans-serif;font-size:17px;cursor:pointer;
  transition:all .15s;line-height:1.5;
  backdrop-filter:blur(8px);
  box-shadow:0 4px 16px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.08);
}
.opt:hover:not(:disabled){
  border-color:rgba(0,200,230,.5);border-bottom-color:rgba(0,200,230,.5);
  color:var(--cyan2);
  background:rgba(0,200,230,.1);
  transform:translateY(-2px);
  box-shadow:0 8px 28px rgba(0,0,0,.4),0 0 20px rgba(0,180,220,.18),inset 0 1px 0 rgba(255,255,255,.1);
}
.opt:active:not(:disabled){transform:translateY(1px);box-shadow:0 2px 8px rgba(0,0,0,.3),inset 0 3px 10px rgba(0,0,0,.2);}
.opt:disabled{cursor:default;pointer-events:none;transform:none;}
.opt.ar{font-family:'Scheherazade New',serif;font-size:30px;padding:22px 14px;}
.opt.correct{background:rgba(0,180,220,.18)!important;border-color:var(--cyan)!important;color:var(--cyan2)!important;box-shadow:0 0 28px rgba(0,200,230,.3)!important;}
.opt.wrong{background:rgba(255,82,82,.12)!important;border-color:var(--err)!important;color:#ff8a80!important;}
.rring{
  width:140px;height:140px;border-radius:50%;
  border:3px solid var(--cyan);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  margin:0 auto 28px;
  background:radial-gradient(circle,rgba(0,200,230,.1),transparent);
  box-shadow:0 0 0 10px rgba(0,200,230,.05),0 0 50px rgba(0,200,230,.25),0 8px 40px rgba(0,0,0,.5);
}
.rpct{font-family:'Poppins',sans-serif;font-size:48px;font-weight:500;color:var(--cyan2);line-height:1;text-shadow:0 0 20px rgba(0,220,255,.5);}
.rfrac{font-size:12px;color:var(--muted);letter-spacing:.07em;}
.miss{padding:11px 15px;border-radius:7px;background:rgba(192,80,74,.06);border:1px solid rgba(192,80,74,.18);display:grid;grid-template-columns:auto 1fr auto;gap:11px;align-items:center;margin-bottom:7px;font-size:13px;}
.lbrow{display:flex;align-items:center;gap:14px;padding:11px 14px;border-radius:7px;transition:background .14s;}
.lbrow:hover{background:rgba(0,200,230,.07);}
.lbrank{font-family:'Poppins',sans-serif;font-size:12px;color:var(--muted);width:26px;text-align:center;}
.lbrank.top{color:var(--cyan2);}
.lbinfo{flex:1;}
.lbname{font-size:16px;}
.lbmeta{font-size:11px;color:var(--muted);}
.lbsc{font-family:'Poppins',sans-serif;font-size:15px;color:var(--cyan2);}
.lbbadge{font-size:10px;background:rgba(0,200,230,.08);color:var(--cyan2);padding:2px 7px;border-radius:9px;border:1px solid rgba(0,180,220,.18);}
.tabs{display:flex;gap:3px;background:rgba(255,255,255,.06);border-radius:9px;padding:3px;margin-bottom:20px;}
.tab{flex:1;padding:7px 10px;border-radius:7px;border:none;background:transparent;color:var(--muted);font-family:'Poppins',sans-serif;font-size:12px;cursor:pointer;transition:all .18s;}
.tab.on{background:var(--s1);color:var(--cyan2);border:1px solid rgba(0,180,220,.18);}
.tab-badge{display:inline-block;background:var(--err);color:#fff;font-size:10px;border-radius:9px;padding:1px 6px;margin-left:4px;}

/* ── ADMIN MESSAGE CENTER ── */
.msg-list{display:flex;flex-direction:column;gap:10px;}
.msg-item{
  display:grid;grid-template-columns:32px 1fr auto;gap:14px;align-items:start;
  background:rgba(255,255,255,.06);border:1px solid rgba(0,0,0,.06);
  border-radius:9px;padding:14px 16px;cursor:pointer;transition:all .15s;
}
.msg-item.unread{border-color:rgba(0,200,230,.3);background:rgba(0,200,230,.04);}
.msg-item.resolved{opacity:.55;}
.msg-item:hover{border-color:rgba(0,200,230,.28);}
.msg-icon{font-size:18px;text-align:center;}
.msg-title{font-size:13.5px;color:var(--text);display:flex;align-items:center;gap:6px;}
.msg-title strong{color:var(--cyan2);}
.msg-new-dot{width:7px;height:7px;border-radius:50%;background:var(--err);display:inline-block;}
.msg-sub{font-size:12px;color:var(--muted);margin-top:3px;}
.msg-date{font-size:10.5px;color:var(--muted);margin-top:4px;opacity:.7;}
.msg-actions{display:flex;flex-direction:column;gap:6px;align-items:flex-end;}
.msg-actions .btn{white-space:nowrap;}

.tbl{width:100%;border-collapse:collapse;font-size:12px;}
.tbl th{text-align:left;padding:7px 10px;color:var(--muted);font-weight:400;font-size:10px;letter-spacing:.01em;border-bottom:1px solid rgba(0,200,230,.1);}
.tbl td{padding:9px 10px;border-bottom:1px solid rgba(0,0,0,.05);vertical-align:middle;}
.del{background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;}.del:hover{color:var(--err);}
.hero{text-align:center;padding:54px 18px 38px;}
.bism{font-family:'Scheherazade New',serif;font-size:62px;font-weight:700;color:var(--gold2);direction:rtl;margin-bottom:20px;line-height:1.45;text-shadow:0 0 40px rgba(255,184,0,.5),0 2px 8px rgba(0,0,0,.5);}
.hero h2{font-size:38px;font-weight:500;color:var(--text);}.hero h2 em{color:var(--cyan2);font-style:normal;text-shadow:0 0 20px rgba(0,220,255,.35);}
.hero .sub{max-width:500px;margin:0 auto 30px;font-size:18px;}
.streak{display:inline-flex;align-items:center;gap:6px;
  background:rgba(0,200,230,.1);
  border:1px solid rgba(0,200,230,.35);border-radius:14px;padding:6px 14px;
  font-size:13px;font-weight:500;color:var(--cyan2);
  box-shadow:0 0 16px rgba(0,200,230,.2),inset 0 1px 0 rgba(255,255,255,.08);}
.toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);
  background:rgba(11,26,20,.95);backdrop-filter:blur(20px);
  border:1px solid var(--cyan);color:var(--cyan2);
  padding:10px 22px;border-radius:22px;font-size:14px;font-weight:500;
  z-index:999;animation:tin .28s ease;
  box-shadow:0 8px 32px rgba(0,0,0,.5),0 0 20px rgba(0,200,230,.25);white-space:nowrap;}
@keyframes tin{from{opacity:0;transform:translateX(-50%) translateY(9px)}}

/* ── DONATE BUTTON ── */
.ndonate{
  display:inline-flex;align-items:center;gap:6px;
  background:transparent;
  border:1px solid rgba(0,200,230,.3);
  color:var(--cyan2);padding:5px 14px;border-radius:16px;
  font-family:'Poppins',sans-serif;font-size:12px;cursor:pointer;transition:all .2s;
}
.ndonate:hover{background:rgba(0,200,230,.08);border-color:var(--cyan2);box-shadow:0 0 10px rgba(0,200,230,.12);}

/* ── DONATE MODAL ── */
.modal-overlay{
  position:fixed;inset:0;background:rgba(0,0,0,.75);
  z-index:500;display:flex;align-items:center;justify-content:center;
  padding:20px;animation:mfade .22s ease;backdrop-filter:blur(4px);
}
@keyframes mfade{from{opacity:0}to{opacity:1}}
.modal{
  background:#091e2e;
  border:1px solid rgba(0,200,230,.35);
  border-radius:16px;width:100%;max-width:520px;
  box-shadow:0 24px 80px rgba(0,0,0,.8),0 0 40px rgba(0,200,230,.12);
  animation:mslide .26s ease;max-height:90vh;overflow-y:auto;
}
@keyframes mslide{from{transform:translateY(18px);opacity:0}to{transform:none;opacity:1}}
.modal-head{
  display:flex;align-items:center;justify-content:space-between;
  padding:20px 24px 16px;
  border-bottom:1px solid rgba(0,180,220,.18);
  background:rgba(0,200,230,.06);border-radius:16px 16px 0 0;
}
.modal-head h3{font-family:'Poppins',sans-serif;font-size:17px;font-weight:500;color:var(--cyan2);text-shadow:0 0 16px rgba(0,220,255,.3);}
.modal-close{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:var(--muted);font-size:18px;cursor:pointer;line-height:1;padding:3px 8px;border-radius:6px;transition:all .15s;}
.modal-close:hover{color:var(--text);background:rgba(255,255,255,.1);}
.modal-body{padding:22px 24px 26px;}

/* ── DONATE — FREQUENCY SELECTOR ── */
.freq-row{display:flex;gap:8px;margin-bottom:16px;}
.freq-pill{
  flex:1;padding:9px 10px;border-radius:8px;
  background:rgba(255,255,255,.06);border:1px solid rgba(0,200,230,.2);
  color:var(--muted);font-family:'Poppins',sans-serif;font-size:12px;
  letter-spacing:.01em;cursor:pointer;transition:all .18s;
}
.freq-pill:hover{border-color:rgba(0,200,230,.4);color:var(--cyan2);}
.freq-pill.on{background:rgba(0,200,230,.16);border-color:var(--cyan);color:var(--cyan2);box-shadow:0 0 12px rgba(0,200,230,.2);}

/* ── DONATE — RECURRING SETUP (UPI) ── */
.recurring-box{
  background:rgba(0,200,230,.06);border:1px solid rgba(0,200,230,.2);
  border-radius:10px;padding:22px 22px 18px;text-align:center;
}
.recurring-icon{font-size:30px;margin-bottom:8px;}
.recurring-box h4{font-family:'Poppins',sans-serif;font-size:14px;color:var(--gold2);font-weight:400;margin-bottom:8px;}
.recurring-box p{font-size:12.5px;color:var(--muted);line-height:1.6;margin-bottom:14px;}
.recurring-steps{
  text-align:left;font-size:12.5px;color:var(--text);
  line-height:1.8;margin:0 0 12px;padding-left:20px;
}
.recurring-steps li{margin-bottom:6px;}
.recurring-steps li strong{color:var(--gold3);}

/* ── DONATE — BANK TRANSFER BY REQUEST (shown to everyone; UPI is the only self-service method) ── */
.bank-login-prompt{
  background:rgba(26,107,90,.07);border:1px solid rgba(34,139,112,.2);
  border-radius:8px;padding:13px 15px;margin-top:14px;
  font-size:12.5px;color:#7acfb8;line-height:1.6;text-align:center;
}
.bank-login-prompt strong{color:var(--teal2);}

/* ── DONATE TABS ── */
.dtabs{display:flex;gap:3px;background:rgba(0,0,0,.3);border-radius:8px;padding:3px;margin-bottom:22px;border:1px solid rgba(0,200,230,.15);}
.dtab{flex:1;padding:7px;border-radius:6px;border:none;background:transparent;color:var(--muted);font-family:'Poppins',sans-serif;font-size:13px;cursor:pointer;transition:all .18s;}
.dtab.on{background:rgba(0,180,220,.18);color:var(--cyan2);border:1px solid rgba(0,200,230,.35);box-shadow:0 0 10px rgba(0,200,230,.15);}

/* ── QR BOX ── */
.qr-box{
  background:rgba(0,200,230,.06);border:1px solid rgba(0,200,230,.25);
  border-radius:12px;padding:24px;text-align:center;margin-bottom:16px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05);
}
.qr-placeholder{
  width:180px;height:180px;margin:0 auto 16px;
  background:#fff;border-radius:8px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:8px;color:#666;font-size:11px;
  border:3px solid var(--gold2);
  position:relative;overflow:hidden;
}
.qr-placeholder svg{opacity:.15;}
.qr-corner{position:absolute;width:24px;height:24px;border-color:var(--gold2);border-style:solid;}
.qr-corner.tl{top:6px;left:6px;border-width:3px 0 0 3px;}
.qr-corner.tr{top:6px;right:6px;border-width:3px 3px 0 0;}
.qr-corner.bl{bottom:6px;left:6px;border-width:0 0 3px 3px;}
.qr-corner.br{bottom:6px;right:6px;border-width:0 3px 3px 0;}
.qr-inner{position:relative;z-index:1;text-align:center;}
.qr-upi{font-size:14px;color:var(--text);margin-bottom:4px;font-weight:400;}
.qr-upiid{font-family:'Courier New',monospace;font-size:15px;color:var(--gold2);background:rgba(0,0,0,.3);padding:7px 16px;border-radius:7px;display:inline-block;margin-top:6px;border:1px solid rgba(255,184,0,.3);}
.copy-btn{background:rgba(0,200,230,.1);border:1px solid rgba(0,200,230,.3);color:var(--cyan2);padding:6px 14px;border-radius:6px;font-size:11px;cursor:pointer;transition:all .18s;margin-top:8px;}
.copy-btn:hover{border-color:var(--cyan2);background:rgba(0,180,220,.18);box-shadow:0 0 10px rgba(0,200,230,.2);}

/* ── BANK DETAILS ── */
.bank-row{display:flex;justify-content:space-between;align-items:flex-start;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.06);gap:12px;}
.bank-row:last-child{border:none;}
.bank-label{font-size:11px;color:var(--muted);letter-spacing:.02em;flex-shrink:0;padding-top:2px;}
.bank-value{font-size:14px;color:var(--text);text-align:right;word-break:break-all;}
.bank-value.mono{font-family:'Courier New',monospace;font-size:13px;color:var(--gold2);}

/* ── DONATE FOOTER ── */
.donate-ayah{
  text-align:center;margin-top:20px;padding-top:16px;
  border-top:1px solid rgba(0,200,230,.14);
}
.donate-ayah .arabic{font-size:22px;color:var(--gold2);margin-bottom:6px;}
.donate-ayah p{font-size:12px;color:var(--muted);font-style:italic;}

/* ── COMPACT DONATE STRIP (replaces the old large banner) ── */
.donate-strip{
  display:flex;align-items:center;justify-content:space-between;gap:14px;
  background:rgba(0,200,230,.05);border:1px solid rgba(0,200,230,.14);
  border-radius:8px;padding:12px 18px;margin-top:16px;
  cursor:pointer;transition:all .18s;flex-wrap:wrap;
}
.donate-strip:hover{background:rgba(0,200,230,.09);border-color:rgba(0,200,230,.25);}
.donate-strip span:first-child{font-size:13px;color:var(--muted);}
.donate-strip-cta{font-family:'Poppins',sans-serif;font-size:12px;color:var(--cyan2);font-weight:500;white-space:nowrap;}

/* ── HOMEPAGE — ALL SETS QUIZ BEST-ATTEMPT RIBBON ── */
.allsets-ribbon{
  display:flex;align-items:center;gap:14px;
  cursor:pointer;transition:all .18s;
}
.allsets-ribbon:hover{border-color:rgba(0,200,230,.25);}
.allsets-ribbon-icon{font-size:26px;flex-shrink:0;}
.allsets-ribbon-text{flex:1;min-width:0;}
.allsets-ribbon-title{font-family:'Poppins',sans-serif;font-size:11px;letter-spacing:.02em;color:var(--cyan2);text-transform:uppercase;margin-bottom:4px;}
.allsets-ribbon-detail{font-size:13.5px;color:var(--text);line-height:1.5;}
.allsets-ribbon-detail strong{color:var(--cyan2);}
.allsets-ribbon-arrow{font-size:18px;color:var(--muted);flex-shrink:0;}
.btn-donate{
  background:linear-gradient(135deg,var(--teal),var(--teal2));
  border:none;color:#fff;padding:10px 22px;border-radius:8px;
  font-family:'Poppins',sans-serif;font-size:12px;cursor:pointer;
  transition:all .2s;font-weight:500;white-space:nowrap;flex-shrink:0;
}
.btn-donate:hover{transform:translateY(-1px);box-shadow:0 5px 18px rgba(0,200,230,.25);}

/* ── QUIZ EXIT BUTTON ── */
.quiz-exit{
  background:transparent;border:1px solid rgba(192,80,74,.3);
  color:#c0504a;padding:3px 11px;border-radius:14px;
  font-size:11px;cursor:pointer;transition:all .18s;font-family:'Poppins',sans-serif;
}
.quiz-exit:hover{background:rgba(192,80,74,.08);border-color:var(--err);color:#a03030;}

/* ── QUIZ TIMER ── */
.quiz-timer{
  font-family:'Poppins',sans-serif;font-size:13px;color:var(--cyan2);
  background:rgba(0,200,230,.08);border:1px solid rgba(0,200,230,.2);
  border-radius:14px;padding:3px 12px;
}
.quiz-timer.low{
  color:#fff;background:var(--err);border-color:var(--err);
  animation:timerPulse 1s ease-in-out infinite;
}
@keyframes timerPulse{0%,100%{opacity:1;}50%{opacity:.6;}}

/* ── HISTORY LIST ── */
/* ── HISTORY — SIDE-BY-SIDE CHARTS (Set vs All Sets Quiz) ── */
.chart-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;align-items:stretch;}
.chart-col{padding:16px 14px;display:flex;flex-direction:column;height:340px;}
.chart-col-head{height:28px;display:flex;align-items:flex-start;flex-shrink:0;}
.chart-col-inner{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;}
.chart-empty{text-align:center;color:var(--muted);font-size:12px;padding:36px 10px;}
@media(max-width:640px){.chart-row{grid-template-columns:1fr;}}

.hist-row{
  display:grid;grid-template-columns:56px 1fr 20px;align-items:center;gap:14px;
  padding:14px 16px;border-radius:8px;cursor:pointer;transition:background .15s;
  border-bottom:1px solid rgba(0,0,0,.05);
}
.hist-row:last-child{border-bottom:none;}
.hist-row:hover{background:rgba(255,255,255,.06);}
.hist-pct{font-family:'Poppins',sans-serif;font-size:20px;text-align:center;}
.hist-title{font-size:15px;color:var(--text);}
.hist-date{font-size:12px;color:var(--muted);margin-top:2px;}
.hist-arrow{color:var(--muted);font-size:16px;text-align:center;transition:color .15s;}
.hist-row:hover .hist-arrow{color:var(--cyan2);}

/* ── ANSWER REVIEW ── */
.review-answer-note{
  font-size:12px;padding:8px 16px 12px;line-height:1.5;
  margin-top:-4px;margin-bottom:8px;
}

/* ── MOBILE BOTTOM NAV BAR ── */
.mobile-nav{display:none;}
@media(max-width:600px){
  .mobile-nav{
    display:flex;
    position:fixed;bottom:0;left:0;right:0;z-index:200;
    background:rgba(11,26,20,.95);backdrop-filter:blur(14px);
    border-top:1px solid rgba(0,200,230,.25);
    padding:6px 0 env(safe-area-inset-bottom,6px);
    justify-content:space-around;align-items:center;
    box-shadow:0 -4px 24px rgba(0,0,0,.5),0 0 20px rgba(0,200,230,.1);
  }
  .mnav-btn{
    display:flex;flex-direction:column;align-items:center;gap:2px;
    background:none;border:none;color:var(--muted);
    font-family:'Poppins',sans-serif;font-size:10px;cursor:pointer;
    padding:4px 10px;border-radius:8px;transition:color .18s;
    -webkit-tap-highlight-color:transparent;
  }
  .mnav-btn.on{color:var(--cyan2);}
  .mnav-btn:active{color:var(--teal2);}
  .mnav-icon{font-size:18px;line-height:1;}
  /* Push page content above bottom nav */
  .app{padding-bottom:60px;}
}

/* ── Tablet ≤768px ── */
@media(max-width:768px){
  .nav{padding:10px 16px;}
  .ntext span{display:none;}
  .ntext h1{font-size:14px;}
  h2{font-size:24px;}
  .page{padding:28px 16px;}
  .hero{padding:36px 14px 26px;}
  .bism{font-size:38px;}
  .hero h2{font-size:26px;}
  .chart-row{grid-template-columns:1fr;}
  .qcard{padding:28px 20px;}
  .modal-body{padding:18px 20px 22px;}
}

/* ── Mobile ≤600px ── */
@media(max-width:600px){

  /* NAV — hide secondary nav links; keep user chip, donate, CTA */
  .nav{padding:9px 12px;}
  .ntext h1{font-size:13px;}
  .ntext span{display:none;}
  .nbtn{display:none;}
  .ndonate{padding:4px 10px;font-size:11px;}
  .ncta{padding:5px 12px;font-size:10px;letter-spacing:.02em;}
  .nuser{font-size:11px;padding:4px 8px;}
  .nright{gap:5px;}

  /* PAGE & HERO */
  .page{padding:18px 12px;}
  .hero{padding:24px 12px 18px;}
  .bism{font-size:34px;}
  .hero h2{font-size:22px;}
  .hero .sub{font-size:15px;margin-bottom:20px;}
  h2{font-size:22px;}
  .sub{font-size:15px;}
  .lbl{font-size:9px;}
  .card{padding:16px 14px;}

  /* STATS GRID — 2 columns */
  .srow{grid-template-columns:repeat(2,1fr);gap:8px;}
  .sn{font-size:20px;}
  .sl{font-size:9px;}
  .sbox{padding:12px 10px;}

  /* WORD CARD — 3-col on mobile too */
  .word-card-main{
    grid-template-columns:auto 1fr auto;
    gap:8px 10px;
  }
  .war{font-size:26px;min-width:60px;}
  .wtr{display:none;}
  .wen{font-size:15px;}
  .word-urdu{display:none;}
  .word-toggle{align-self:center;}

  /* QUIZ */
  .opts{grid-template-columns:1fr;}
  .qq{font-size:46px;}
  .qq.en{font-size:21px;}
  .qcard{padding:20px 14px;}
  .qtr{margin-bottom:20px;}
  .qwrap{padding:0;}

  /* QUIZ RESULTS */
  .rring{width:108px;height:108px;}
  .rpct{font-size:36px;}
  .miss{grid-template-columns:auto 1fr;gap:8px;font-size:12px;}

  /* MODAL — edge-to-edge */
  .modal-overlay{padding:8px;}
  .modal{border-radius:10px;}
  .modal-head{padding:13px 15px 11px;}
  .modal-body{padding:14px 15px 18px;}

  /* DONATE */
  .donate-strip{flex-direction:column;text-align:center;gap:8px;}
  .qr-upiid{font-size:13px;word-break:break-all;}
  .freq-row{gap:5px;}
  .freq-pill{font-size:11px;padding:7px 6px;}

  /* TABLES — horizontal scroll inside card */
  .card{overflow-x:auto;}
  .tbl{min-width:460px;}

  /* MESSAGE CENTER */
  .msg-item{grid-template-columns:28px 1fr;gap:8px;}
  .msg-actions{grid-column:1/-1;flex-direction:row;justify-content:flex-start;flex-wrap:wrap;gap:6px;}

  /* HISTORY */
  .chart-row{grid-template-columns:1fr;}
  .chart-col{height:260px;}
  .hist-row{grid-template-columns:46px 1fr 18px;gap:10px;padding:11px 12px;}

  /* LEADERBOARD */
  .lbrow{padding:8px 10px;gap:10px;}
  .lbname{font-size:14px;}
  .lbbadge{display:none;}

  /* MISC */
  .wrow{grid-template-columns:1fr 2fr;}
  .tabs{gap:2px;}
  .tab{font-size:11px;padding:6px 7px;}
  .btn{padding:9px 18px;font-size:13px;}
  .bism{line-height:1.3;}
  .streak{font-size:11px;padding:4px 10px;}
}

/* ── Small phones ≤400px ── */
@media(max-width:400px){
  .nicon{width:30px;height:30px;font-size:13px;}
  .ntext h1{font-size:12px;}
  .ndonate{display:none;}
  .bism{font-size:28px;}
  .hero h2{font-size:19px;}
  .qq{font-size:40px;}
  .sn{font-size:20px;}
  .war{font-size:23px;}
  .ncta{font-size:10px;padding:5px 10px;}
  .srow{gap:6px;}
  .card{padding:13px 11px;}
}
/* ── ACCESS GATE ── */
.gate{
  min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:
    radial-gradient(ellipse 70% 45% at 15% -5%,rgba(0,180,220,.18),transparent),
    radial-gradient(ellipse 60% 60% at 88% 100%,rgba(0,180,210,.14),transparent),
    #071c2a;
  padding:24px;
}
.gate-card{
  width:100%;max-width:400px;text-align:center;
  background:rgba(255,255,255,.04);
  border:1px solid rgba(0,200,230,.28);
  border-radius:20px;padding:44px 36px 40px;
  backdrop-filter:blur(20px);
  box-shadow:0 24px 80px rgba(0,0,0,.6),0 0 60px rgba(0,200,230,.08),inset 0 1px 0 rgba(255,255,255,.07);
  animation:fu .4s ease;
}
.gate-icon{font-size:52px;margin-bottom:16px;line-height:1;}
.gate-bism{
  font-family:'Scheherazade New',serif;font-size:38px;font-weight:700;
  color:var(--gold2);direction:rtl;margin-bottom:20px;line-height:1.5;
  text-shadow:0 0 30px rgba(255,184,0,.4);
}
.gate-title{font-family:'Poppins',sans-serif;font-size:22px;font-weight:500;color:var(--text);margin-bottom:6px;}
.gate-sub{font-size:14px;color:var(--muted);line-height:1.7;margin-bottom:28px;}
.gate-badge{
  display:inline-block;font-size:10px;font-family:'Poppins',sans-serif;
  letter-spacing:.01em;color:var(--cyan2);
  background:rgba(0,200,230,.1);border:1px solid rgba(0,200,230,.28);
  border-radius:20px;padding:4px 14px;margin-bottom:28px;
}
.gate-input{
  width:100%;background:rgba(255,255,255,.06);
  border:1.5px solid rgba(0,200,230,.25);
  color:var(--text);padding:14px 18px;border-radius:11px;
  font-family:'Poppins',sans-serif;font-size:16px;letter-spacing:.05em;
  text-align:center;outline:none;transition:all .2s;
  box-shadow:inset 0 2px 8px rgba(0,0,0,.3);
  margin-bottom:10px;
}
.gate-input::placeholder{color:rgba(122,184,152,.35);letter-spacing:.02em;font-size:13px;font-family:'Poppins',sans-serif;}
.gate-input:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(0,200,230,.15),inset 0 2px 8px rgba(0,0,0,.2);}
.gate-input.shake{animation:gateShake .4s ease;}
@keyframes gateShake{0%,100%{transform:none}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}
.gate-err{font-size:12px;color:#ff8a80;margin-bottom:10px;min-height:16px;transition:opacity .2s;}
.gate-btn{
  width:100%;background:linear-gradient(145deg,#1ae6ff,#0090b8);
  color:#fff;border:none;padding:14px;border-radius:11px;
  font-family:'Poppins',sans-serif;font-size:14px;letter-spacing:.01em;
  cursor:pointer;transition:all .2s;font-weight:500;
  box-shadow:0 5px 22px rgba(0,200,230,.5),inset 0 1px 0 rgba(255,255,255,.2);
}
.gate-btn:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(0,200,230,.6);}
.gate-btn:active{transform:translateY(1px);box-shadow:0 2px 10px rgba(0,200,230,.3);}
.gate-footer{margin-top:24px;font-size:11px;color:rgba(122,184,152,.45);line-height:1.7;}
`;

// ── Access Gate ── Change GATE_CODE to any word/phrase you want.
// Delete this whole block (and the gate check in App) when you go public.
const GATE_CODE = "B!sm!11@h";
const GATE_KEY  = "qv_gate_unlocked";
const DONATE = {
  charityName: "Your Charity Name Here",
  upiId:       "yourcharity@upi",
  accountName: "Charity Full Account Name",
  accountNo:   "XXXX XXXX XXXX",
  ifsc:        "XXXXX0000000",
  bankName:    "Bank Name",
  branch:      "Branch Name, City, India",
  purpose:     "Quranic Education & Dawah",

  // ── Registration details, for printing on receipts once confirmed ──────────
  // PAN is confirmed and filled in. The others (80G/12A/10BD-BE) are pending
  // confirmation from the trust's CA — leave them as null until verified.
  // Nothing in the receipt code prints a field unless it's filled in here, so
  // it's safe to update these one at a time as each gets confirmed, without
  // needing any other code changes.
  pan:           "PASTE_TRUST_PAN_HERE",       // confirmed — fill in the actual PAN
  reg80G:        null,  // 80G registration number, once confirmed (e.g. "AABCT1234R/2026/0001")
  reg80GValidTo: null,  // 80G validity expiry date, if applicable (e.g. "2031-03-31")
  reg12A:        null,  // 12A registration number, once confirmed
  form10BDFiled: false, // set true once the trust has actually filed Form 10BD for a given year
};

// ── GateScreen — shown to everyone until they enter the access code ──────────
function GateScreen({ onUnlock }) {
  const [code, setCode]     = React.useState("");
  const [err, setErr]       = React.useState("");
  const [shake, setShake]   = React.useState(false);

  const attempt = () => {
    if (code.trim().toUpperCase() === GATE_CODE.toUpperCase()) {
      sessionStorage.setItem(GATE_KEY, "1");
      onUnlock();
    } else {
      setErr("Incorrect access code. Please try again.");
      setShake(true);
      setCode("");
      setTimeout(() => setShake(false), 450);
    }
  };

  const onKey = (e) => { if (e.key === "Enter") attempt(); };

  return (
    <div className="gate">
      <style>{CSS}</style>
      <div className="gate-card">
        <div className="gate-icon">📖</div>
        <div className="gate-bism">بِسْمِ اللَّهِ</div>
        <h2 className="gate-title">Quranic Vocab</h2>
        <p className="gate-sub">This app is currently in private beta.<br/>Enter the access code to continue.</p>
        <span className="gate-badge">🔒 PRIVATE BETA</span>
        <input
          className={`gate-input${shake ? " shake" : ""}`}
          type="password"
          placeholder="Enter access code"
          value={code}
          onChange={e => { setCode(e.target.value); setErr(""); }}
          onKeyDown={onKey}
          autoFocus
          autoComplete="off"
        />
        <p className="gate-err">{err}</p>
        <button className="gate-btn" onClick={attempt}>Enter App →</button>
        <p className="gate-footer">
          Quranic Vocabulary Memorization Platform<br/>
          Awami Baitulmaal Committee
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const isAdminRoute = typeof window !== "undefined" && window.location.pathname.replace(/\/+$/, "") === "/admin";
  const isFinanceRoute = typeof window !== "undefined" && window.location.pathname.replace(/\/+$/, "") === "/finance";
  const resetTokenFromUrl = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("reset") : null;
  const verifyTokenFromUrl = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("verify") : null;
  const [view, setView] = useState(isAdminRoute ? "admin" : isFinanceRoute ? "finance" : "home");
  const [user, setUser] = useState(null);
  const [customWords, setCustomWords] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [quiz, setQuiz] = useState(null);
  const [toast, setToast] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showDonate, setShowDonate] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showFinanceMenu, setShowFinanceMenu] = useState(false);
  const [adminProfileOpen, setAdminProfileOpen] = useState(false);
  const [financeProfileOpen, setFinanceProfileOpen] = useState(false);
  // Admin unlock is session-only (sessionStorage, not localStorage) — closing
  // the browser tab re-locks it. This is intentionally separate from regular
  // learner accounts; it gates the single shared Admin password, not a
  // per-user login (that's #5, for learners).
  const [adminUnlocked, setAdminUnlocked] = useState(() => sessionStorage.getItem("qv_admin_unlocked") === "1");
  const [financeUnlocked, setFinanceUnlocked] = useState(() => sessionStorage.getItem("qv_finance_unlocked") === "1");
  const [messages, setMessages] = useState([]);
  const [receipts, setReceipts] = useState([]);

  useEffect(() => {
    const cw = storageGet("qv_custom") || [];
    setCustomWords(cw);
    setMessages(getMessages());
    setReceipts(getReceipts());

    // ── Supabase: restore session on page load ──────────────────────────────
    const loadSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await loadUserProfile(session.user.id);

      // Load participants from Supabase users table
      const { data: parts } = await supabase.from("users").select("*");
      if (parts) setParticipants(parts.map(p => ({
        userId: p.user_id, name: p.name, email: p.email,
        enrolledAt: p.enrolled_at, role: p.role || "learner",
        scores: storageGet(`qv_scores_${p.user_id}`) || [],
        dayProgress: storageGet(`qv_progress_${p.user_id}`) || {},
        emailVerified: true, supabaseId: p.auth_id,
      })));
    };
    loadSession();

    // ── Supabase: listen for auth events (login, verify, logout) ───────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        // User clicked password reset link — show reset password page
        setView("resetPassword");
        return;
      }
      if (event === "SIGNED_IN" && session) {
        await loadUserProfile(session.user.id);
        // Reload participants
        const { data: parts } = await supabase.from("users").select("*");
        if (parts) setParticipants(parts.map(p => ({
          userId: p.user_id, name: p.name, email: p.email,
          enrolledAt: p.enrolled_at, role: p.role || "learner",
          scores: storageGet(`qv_scores_${p.user_id}`) || [],
          dayProgress: storageGet(`qv_progress_${p.user_id}`) || {},
          emailVerified: true, supabaseId: p.auth_id,
        })));
      }
      if (event === "SIGNED_OUT") {
        setUser(null);
        storageRemove("qv_user");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load user profile from Supabase users table
  const loadUserProfile = async (authId) => {
    const { data: profile } = await supabase
      .from("users").select("*").eq("auth_id", authId).single();
    if (!profile) return;
    const u = {
      userId: profile.user_id, name: profile.name,
      email: profile.email, enrolledAt: profile.enrolled_at,
      role: profile.role || "learner",
      scores: storageGet(`qv_scores_${profile.user_id}`) || [],
      dayProgress: storageGet(`qv_progress_${profile.user_id}`) || {},
      emailVerified: true, supabaseId: authId,
    };
    setUser(u);
    storageSet("qv_user", u);
    // Navigate away from verify/reset screens if on them
    setView(v => ["verifyEmail", "resetPassword"].includes(v) ? "home" : v);
    if (["verifyEmail", "resetPassword"].includes(view)) {
      toast_("✅ Email confirmed — welcome to Quranic Vocab! 🕌");
    }
  };

  const unlockAdmin = () => {
    setAdminUnlocked(true);
    sessionStorage.setItem("qv_admin_unlocked", "1");
  };
  const lockAdmin = () => {
    setAdminUnlocked(false);
    sessionStorage.removeItem("qv_admin_unlocked");
    if (isAdminRoute) { window.location.href = "/"; } else { setView("home"); }
  };

  const unlockFinance = () => {
    setFinanceUnlocked(true);
    sessionStorage.setItem("qv_finance_unlocked", "1");
  };
  const lockFinance = () => {
    setFinanceUnlocked(false);
    sessionStorage.removeItem("qv_finance_unlocked");
    if (isFinanceRoute) { window.location.href = "/"; } else { setView("home"); }
  };

  const toast_ = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const saveUser = (u) => {
    setUser(u);
    storageSet("qv_user", u);
    // Store progress and scores per-user in localStorage (Phase 3 migrates to Supabase)
    if (u.userId) {
      storageSet(`qv_scores_${u.userId}`, u.scores || []);
      storageSet(`qv_progress_${u.userId}`, u.dayProgress || {});
    }
    setParticipants(prev => {
      const next = prev.find(p => p.userId === u.userId)
        ? prev.map(p => p.userId === u.userId ? u : p)
        : [...prev, u];
      return next;
    });
  };

  // ── SUPABASE AUTH: Register new account ───────────────────────────────────
  const registerUser = async (userId, password, name, email) => {
    const idLower    = userId.trim().toLowerCase();
    const emailLower = email.trim().toLowerCase();

    // Check duplicate User ID in Supabase users table
    const { data: existingId } = await supabase
      .from("users").select("id").ilike("user_id", idLower).maybeSingle();
    if (existingId) {
      toast_("That User ID is already taken. Please choose another.");
      return { ok: false, reason: "id-taken" };
    }

    // Sign up via Supabase Auth — sends verification email via Titan SMTP
    const { data, error } = await supabase.auth.signUp({
      email: emailLower,
      password,
      options: {
        data: { name: name.trim(), user_id: userId.trim() },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      if (error.message.toLowerCase().includes("already registered") ||
          error.message.toLowerCase().includes("already been registered")) {
        toast_("That email is already registered. Please log in or use a different email.");
        return { ok: false, reason: "email-taken" };
      }
      toast_(`Sign up failed: ${error.message}`);
      return { ok: false, reason: "error" };
    }

    // Save profile to Supabase users table
    if (data.user) {
      await supabase.from("users").insert({
        auth_id: data.user.id,
        user_id: userId.trim(),
        name: name.trim(),
        email: emailLower,
        enrolled_at: new Date().toISOString(),
        role: "learner",
        verified: false,
      });
    }

    return { ok: true, userId: userId.trim(), email: emailLower };
  };

  // ── SUPABASE AUTH: Resend verification email ─────────────────────────────
  const resendVerificationEmail = async (userId) => {
    const { data: profile } = await supabase
      .from("users").select("email").ilike("user_id", userId).maybeSingle();
    if (!profile) return { ok: false, reason: "not-found" };
    const { error } = await supabase.auth.resend({
      type: "signup", email: profile.email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) return { ok: false, reason: "send-failed" };
    return { ok: true };
  };


  // ── Supabase handles email verification automatically via onAuthStateChange ─
  // The old verifyEmailFromToken is no longer needed.

  // ── SUPABASE AUTH: Login ──────────────────────────────────────────────────
  const loginUser = async (userId, password) => {
    // Look up email by userId from Supabase users table
    const { data: profile } = await supabase
      .from("users").select("email, user_id, name").ilike("user_id", userId.trim()).maybeSingle();
    if (!profile) {
      toast_("No account found with that User ID.");
      return { ok: false, reason: "not-found" };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: profile.email, password,
    });

    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        return { ok: false, reason: "not-verified", userId: profile.user_id, email: profile.email };
      }
      toast_("Incorrect password. Please try again.");
      return { ok: false, reason: "wrong-password" };
    }

    // Profile is loaded via onAuthStateChange SIGNED_IN event
    return { ok: true };
  };
    toast_(`Welcome back, ${existing.name}!`);
    setView("home");
    return { ok: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    storageRemove("qv_user");
    setQuiz(null);
    setSelectedDay(null);
    setView("home");
    toast_("Logged out — your progress is saved for next time");
  };

  // Admin-only: reset a learner's password to a new temporary one they provide
  // Admin-triggered reset: generates a one-time reset link and emails it to
  // the learner via EmailJS (Titan SMTP, support@awamibaitulmaal.org.in).
  // The actual new password is never set by admin and never appears in the
  // email — the learner sets it themselves by opening the link.
  const sendResetLinkToUser = async (userId, messageId = null) => {
    const target = participants.find(p => (p.userId || "").toLowerCase() === userId.toLowerCase());
    if (!target) return { ok: false, reason: "not-found" };
    if (!target.email) return { ok: false, reason: "no-email" };

    const token = createResetToken(target.userId, messageId);
    const resetLink = `${window.location.origin}/?reset=${token}`;

    try {
      await sendResetEmail({ toEmail: target.email, learnerName: target.name, resetLink });
      return { ok: true };
    } catch (err) {
      console.error("EmailJS send failed:", err);
      return { ok: false, reason: "send-failed" };
    }
  };

  // Admin-only: correct a learner's name or email (e.g. fixing a typo'd
  // domain like gmail.cm that slipped through signup). Email changes are
  // re-validated through the same domain check used at signup, so admin
  // can't accidentally introduce another bad address.
  const updateParticipantDetails = async (userId, newName, newEmail) => {
    const target = participants.find(p => (p.userId || "").toLowerCase() === userId.toLowerCase());
    if (!target) return { ok: false, reason: "not-found" };

    const trimmedEmail = newEmail.trim();
    if (trimmedEmail !== target.email) {
      const result = await isEmailDomainValid(trimmedEmail);
      if (!result.valid) {
        if (result.reason === "disposable") return { ok: false, reason: "disposable" };
        if (result.reason === "no-mx") return { ok: false, reason: "no-mx" };
        return { ok: false, reason: "format" };
      }
      // Note: a "likely-typo" warning is informational here — admin can still
      // save if they're confident it's correct (e.g. a real but unusual domain).
    }

    const updated = { ...target, name: newName.trim(), email: trimmedEmail };
    // Update in Supabase users table
    await supabase.from("users")
      .update({ name: newName.trim(), email: trimmedEmail })
      .ilike("user_id", userId);
    setParticipants(prev => prev.map(p => (p.userId || "").toLowerCase() === userId.toLowerCase() ? updated : p));
    if (user && (user.userId || "").toLowerCase() === userId.toLowerCase()) {
      setUser(updated);
      storageSet("qv_user", updated);
    }
    return { ok: true };
  };

  const deleteParticipant = async (userId) => {
    // Delete from Supabase users table (cascades to auth via trigger if set)
    const { data: profile } = await supabase.from("users")
      .select("auth_id").ilike("user_id", userId).maybeSingle();
    if (profile?.auth_id) {
      await supabase.from("users").delete().eq("auth_id", profile.auth_id);
    }
    setParticipants(prev => prev.filter(p => (p.userId || "").toLowerCase() !== userId.toLowerCase()));
    if (user && (user.userId || "").toLowerCase() === userId.toLowerCase()) {
      await supabase.auth.signOut();
      setUser(null);
      storageRemove("qv_user");
    }
  };

  // Pre-launch cleanup: wipes every piece of test data accumulated during
  // QA — participants, scores, messages, reset/verify tokens, custom words,
  // and the admin password (reverts to the hardcoded default so a fresh
  // production password must be set deliberately afterward). Deliberately
  // does NOT touch qv_admin_email, since that's a real configuration value,
  // not test data. Admin is logged out of the unlocked session as part of
  // this, since the password they were using is no longer valid.
  const resetAllTestData = async () => {
    // Clear Supabase users table (auth users remain — admin can delete manually)
    await supabase.from("users").delete().neq("role", "admin");
    await supabase.from("scores").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("progress").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    // Sign out current user if any
    await supabase.auth.signOut();
    // Clear localStorage
    storageRemove("qv_user");
    storageRemove("qv_messages");
    storageRemove("qv_reset_tokens");
    storageRemove("qv_verify_tokens");
    storageRemove("qv_custom");
    storageRemove("qv_admin_pw_hash");
    sessionStorage.removeItem("qv_admin_unlocked");

    setParticipants([]);
    setUser(null);
    setMessages([]);
    setCustomWords([]);
    setAdminUnlocked(false);
    setQuiz(null);

    window.location.href = "/admin";
  };

  // Sets a learner's password directly from a valid reset token (used by the
  // "Set New Password" screen the reset link opens) — not by admin typing it.
  // ── SUPABASE AUTH: Set new password (called from reset password page) ─────
  const setPasswordFromToken = async (token, newPassword) => {
    // With Supabase, the user is already signed in via the reset link
    // Just update the password directly
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, reason: "error" };
    toast_("Password updated successfully!");
    return { ok: true };
  };

  // Forgot-password request from the Login screen → lands in Admin's Message
  // Center. Admin reviews it, then clicks "Send Reset Link" to email the
  // learner via sendResetLinkToUser above.
  // Requires User ID + registered Email to match the SAME account. If they
  // don't match, reject immediately client-side — no admin message is created,
  // since there's nothing valid for admin to act on.
  // ── SUPABASE AUTH: Forgot password — sends reset email directly ──────────
  const submitForgotPasswordRequest = async (userId, email, note) => {
    // Look up email by userId to confirm account exists
    const { data: profile } = await supabase
      .from("users").select("email, user_id")
      .ilike("user_id", userId.trim()).maybeSingle();

    if (!profile || profile.email.toLowerCase() !== email.trim().toLowerCase()) {
      return { ok: false, reason: "no-match" };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: `${window.location.origin}/`,
    });

    if (error) {
      toast_("Failed to send reset email. Please try again.");
      return { ok: false, reason: "error" };
    }

    toast_("Password reset email sent! Check your inbox.");
    return { ok: true };
  };

  const onMarkMessageRead = (id) => { markMessageRead(id); setMessages(getMessages()); };
  const onMarkMessageResolved = (id) => { markMessageResolved(id); setMessages(getMessages()); };

  // Admin-issued donation receipt, sent after the finance team confirms funds
  // were actually received (outside the app). Not an automated/verified
  // payment confirmation — see the note above getReceipts() for why.
  const issueReceipt = async ({ donorName, donorEmail, amount, donationDate, purpose, note }) => {
    const record = addReceipt({ donorName, donorEmail, amount, donationDate, purpose, note });
    setReceipts(getReceipts());
    try {
      await sendReceiptEmail({
        toEmail: donorEmail, donorName, receiptNo: record.receiptNo,
        amount, donationDate, purpose, note,
      });
      return { ok: true, receiptNo: record.receiptNo };
    } catch (err) {
      console.error("Receipt email failed to send:", err);
      return { ok: true, receiptNo: record.receiptNo, emailFailed: true };
    }
  };

  const allWords = [...WORD_BANK, ...customWords];

  const startQuiz = (day = null, customPool = null) => {
    if (!user) { toast_("Please enroll first"); return; }
    const pool = getUnlockedWords(user.enrolledAt, user.dayProgress);
    if (pool.length < 4) { toast_("Need more unlocked words"); return; }
    const src = customPool ? customPool : day ? getWordsForDay(day) : pool;
    const use = src.length >= 4 ? src : pool;
    // All Sets Quiz (day === null, no customPool) = all unlocked words, timed
    // Set quiz or custom (weak word practice) = capped at 10, no timer
    const isAllSetsQuiz = day === null && !customPool;
    const questionCount = isAllSetsQuiz ? use.length : Math.min(10, use.length);
    const questions = shuffle(use).slice(0, questionCount).map(w => {
      const dir = Math.random() > .5 ? "ar2en" : "en2ar";
      const qf = dir === "ar2en" ? "arabic" : "english";
      const af = dir === "ar2en" ? "english" : "arabic";
      return { word: w, dir, qf, af, options: shuffle([w[af], ...getWrongs(pool, w, af)]), chosen: null };
    });
    const timerSeconds = isAllSetsQuiz ? Math.round(questions.length * 1.5) : null;
    const quizLabel = customPool ? "weak-practice" : day;
    setQuiz({ questions, cur: 0, score: 0, day: quizLabel, done: false, missed: [], timerSeconds, timeUp: false, startedAt: Date.now() });
    setView("quiz");
  };

  const answer = (opt) => {
    if (!quiz || quiz.questions[quiz.cur].chosen !== null) return;
    const q = quiz.questions[quiz.cur];
    const correct = opt === q.word[q.af];
    const updQs = quiz.questions.map((qq, i) => i === quiz.cur ? { ...qq, chosen: opt } : qq);
    const ns = quiz.score + (correct ? 1 : 0);
    const nm = correct ? quiz.missed : [...quiz.missed, q.word];

    setTimeout(() => {
      if (quiz.cur + 1 >= updQs.length) {
        const pct = Math.round((ns / updQs.length) * 100);
        // Build detailed per-question log for review later
        const detail = updQs.map(qq => ({
          arabic: qq.word.arabic,
          translit: qq.word.translit,
          english: qq.word.english,
          dir: qq.dir,
          correctAnswer: qq.word[qq.af],
          chosen: qq.chosen,
          isCorrect: qq.chosen === qq.word[qq.af],
        }));
        const rec = { score: ns, total: updQs.length, pct, day: quiz.day, date: new Date().toISOString(), detail, timeUsedSec: Math.round((Date.now() - quiz.startedAt) / 1000) };
        // A set unlocks the next one via EITHER path — see the constants'
        // comment above for the full reasoning. The All Sets Quiz (quiz.day
        // is null, stored under "free") isn't gated by either path, since it
        // doesn't unlock a specific set; it's a review/practice mode.
        const passed = pct >= PASSING_SCORE_PCT;
        const allScoresForGate = [...(user.scores || []), rec];
        const masteryGateMet = quiz.day ? hasMetMasteryGate(quiz.day, allScoresForGate, allWords) : false;
        const unlockedNow = passed || masteryGateMet;
        const dp = (!quiz.day || unlockedNow)
          ? { ...user.dayProgress, [String(quiz.day || "free")]: new Date().toISOString() }
          : user.dayProgress;
        const updated = { ...user, scores: allScoresForGate, dayProgress: dp };
        saveUser(updated);
        setQuiz({ ...quiz, questions: updQs, score: ns, done: true, result: rec, missed: nm, passed, masteryGateMet });
        setView("results");
      } else {
        setQuiz({ ...quiz, questions: updQs, score: ns, cur: quiz.cur + 1, missed: nm });
      }
    }, 860);
    setQuiz({ ...quiz, questions: updQs, score: ns });
  };

  const cancelQuiz = () => {
    setQuiz(null);
    setView("learn");
    toast_("Quiz cancelled — no score recorded");
  };

  // Called when the All Sets Quiz timer reaches zero. Locks further answers
  // and finalizes the result using only the questions actually answered so
  // far — unanswered questions are excluded from scoring entirely rather than
  // counted as wrong, since the learner never got the chance to attempt them.
  const finishQuizEarly = () => {
    if (!quiz || quiz.done) return;
    const answered = quiz.questions.filter(qq => qq.chosen !== null);
    const correctCount = answered.filter(qq => qq.chosen === qq.word[qq.af]).length;
    const total = answered.length;
    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const detail = answered.map(qq => ({
      arabic: qq.word.arabic,
      translit: qq.word.translit,
      english: qq.word.english,
      dir: qq.dir,
      correctAnswer: qq.word[qq.af],
      chosen: qq.chosen,
      isCorrect: qq.chosen === qq.word[qq.af],
    }));
    const missed = answered.filter(qq => qq.chosen !== qq.word[qq.af]).map(qq => qq.word);
    const rec = { score: correctCount, total, pct, day: quiz.day, date: new Date().toISOString(), detail, timedOut: true, timeUsedSec: quiz.timerSeconds };
    // Same dual unlock gate as natural completion — see the constants'
    // comment above for the full reasoning. In practice this path is only
    // reached by the All Sets Quiz (the only mode with a timer), so
    // quiz.day is always null and neither gate actually applies to a
    // specific set's unlock — kept consistent in case that changes.
    const passed = pct >= PASSING_SCORE_PCT;
    const allScoresForGate = [...(user.scores || []), rec];
    const masteryGateMet = quiz.day ? hasMetMasteryGate(quiz.day, allScoresForGate, allWords) : false;
    const unlockedNow = passed || masteryGateMet;
    const dp = (!quiz.day || unlockedNow)
      ? { ...user.dayProgress, [String(quiz.day || "free")]: new Date().toISOString() }
      : user.dayProgress;
    const updated = { ...user, scores: allScoresForGate, dayProgress: dp };
    saveUser(updated);
    setQuiz({ ...quiz, done: true, timeUp: true, result: rec, missed, passed, masteryGateMet });
    setView("results");
  };

  const reviewSession = (rec) => {
    setReviewing(rec);
    setView("review");
  };

  const saveCW = (w) => { setCustomWords(w); storageSet("qv_custom", w); };

  // ── Browser back button support ─────────────────────────────────────────
  // Push state whenever the view changes so the browser history stack tracks it
  React.useEffect(() => {
    if (!isAdminRoute && !isFinanceRoute) {
      const hash = '#' + view;
      if (window.location.hash !== hash) {
        window.history.pushState({ view }, '', hash);
      }
    }
  }, [view]);

  // On browser back/forward, restore the view from the history state
  React.useEffect(() => {
    const onPop = (e) => {
      if (isAdminRoute || isFinanceRoute) return;
      const v = e.state?.view;
      if (v) setView(v);
      else setView('home');
    };
    // Set initial history state
    window.history.replaceState({ view }, '', window.location.hash || '#home');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isAdminRoute, isFinanceRoute]);
  // ── End browser back button ──────────────────────────────────────────────
  React.useEffect(() => {
    const close = () => {
      setShowUserMenu(false);
      setShowAdminMenu(false);
      if (typeof setShowFinanceMenu === 'function') setShowFinanceMenu(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // Ensure mobile viewport is set correctly (safe to call multiple times)
  React.useEffect(() => {
    let vp = document.querySelector('meta[name="viewport"]');
    if (!vp) {
      vp = document.createElement("meta");
      vp.name = "viewport";
      document.head.appendChild(vp);
    }
    vp.content = "width=device-width, initial-scale=1, maximum-scale=1";
  }, []);

  // ── Idle session timeout ───────────────────────────────────────────────────
  // Learner  → 20 min idle, warning at 18 min
  // Admin / Finance → 10 min idle, warning at 8 min
  const IDLE_LEARNER_MS  = 20 * 60 * 1000;
  const IDLE_ADMIN_MS    = 10 * 60 * 1000;
  const IDLE_WARN_BEFORE =  2 * 60 * 1000;   // warn this many ms before logout

  React.useEffect(() => {
    // Only run when someone is actually logged in
    const isLearnerActive  = !!user;
    const isAdminActive    = adminUnlocked;
    const isFinanceActive  = isFinanceRoute;
    if (!isLearnerActive && !isAdminActive && !isFinanceActive) return;

    const timeoutMs = (isAdminRoute || isFinanceRoute) ? IDLE_ADMIN_MS : IDLE_LEARNER_MS;
    const warnMs    = timeoutMs - IDLE_WARN_BEFORE;
    const roleLabel = (isAdminRoute || isFinanceRoute) ? "10 minutes" : "20 minutes";

    let warnTimer   = null;
    let logoutTimer = null;

    const doLogout = () => {
      if (isAdminActive && isAdminRoute) {
        sessionStorage.removeItem("qv_admin_unlocked");
        setAdminUnlocked(false);
        toast_("⏱ Admin session expired after inactivity.");
        setTimeout(() => { window.location.href = "/admin"; }, 1800);
      } else if (isFinanceActive && isFinanceRoute) {
        toast_("⏱ Finance session expired after inactivity.");
        setTimeout(() => { window.location.href = "/"; }, 1800);
      } else if (isLearnerActive) {
        setUser(null);
        storageRemove("qv_user");
        setQuiz(null);
        setSelectedDay(null);
        setView("home");
        toast_("⏱ Logged out after 20 minutes of inactivity. Your progress is saved.");
      }
    };

    const reset = () => {
      clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
      warnTimer   = setTimeout(() => {
        toast_(`⏱ Still there? You'll be signed out in 2 minutes due to inactivity.`);
      }, warnMs);
      logoutTimer = setTimeout(doLogout, timeoutMs);
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach(ev => window.addEventListener(ev, reset, { passive: true }));
    reset(); // kick off immediately

    return () => {
      clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
      events.forEach(ev => window.removeEventListener(ev, reset));
    };
  }, [user, adminUnlocked, isAdminRoute, isFinanceRoute]); // re-run when session changes
  // ── End idle timeout ──────────────────────────────────────────────────────

  // ── Access gate — remove this block when going public ──
  const [gateOpen, setGateOpen] = React.useState(
    () => sessionStorage.getItem(GATE_KEY) === "1"
  );
  if (!gateOpen) return <GateScreen onUnlock={() => setGateOpen(true)} />;
  // ── End gate ──

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <nav className="nav">
          <div className="nlogo" onClick={() => !isAdminRoute && !isFinanceRoute && setView("home")}>
            <div className="nicon">📖</div>
            <div className="ntext"><h1>Quranic Vocab</h1><span>{isAdminRoute ? "Admin Panel" : isFinanceRoute ? "Finance Panel" : "Daily Memorization Series"}</span></div>
          </div>
          {isAdminRoute ? (
            <div className="nright">
              {adminUnlocked && messages.filter(m => !m.resolved).length > 0 && (
                <span className="admin-msg-badge">✉ {messages.filter(m => !m.resolved).length}</span>
              )}
              {adminUnlocked && (
                <div className="nuser-wrap">
                  <button className="nuser" onClick={() => setShowAdminMenu(s => !s)}>🔧 Admin <span style={{ fontSize: 9, marginLeft: 4 }}>▾</span></button>
                  {showAdminMenu && (
                    <div className="nuser-menu" onMouseLeave={() => setShowAdminMenu(false)}>
                      <button className="nuser-menu-item" onClick={() => { setShowAdminMenu(false); setAdminProfileOpen(true); }}>⚙ Profile Settings</button>
                      <button className="nuser-menu-item logout" onClick={() => { setShowAdminMenu(false); lockAdmin(); }}>🔒 Lock</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : isFinanceRoute ? (
            <div className="nright">
              {financeUnlocked && (
                <div className="nuser-wrap">
                  <button className="nuser" onClick={() => setShowFinanceMenu(s => !s)}>🧾 Finance <span style={{ fontSize: 9, marginLeft: 4 }}>▾</span></button>
                  {showFinanceMenu && (
                    <div className="nuser-menu" onMouseLeave={() => setShowFinanceMenu(false)}>
                      <button className="nuser-menu-item" onClick={() => { setShowFinanceMenu(false); setFinanceProfileOpen(true); }}>⚙ Profile Settings</button>
                      <button className="nuser-menu-item logout" onClick={() => { setShowFinanceMenu(false); lockFinance(); }}>🔒 Lock</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="nright">
              <button className={`nbtn ${view === "learn" ? "on" : ""}`} onClick={() => setView("learn")}>Learn</button>
              <button className={`nbtn ${view === "history" ? "on" : ""}`} onClick={() => setView("history")}>History</button>
              <button className={`nbtn ${view === "leaderboard" ? "on" : ""}`} onClick={() => setView("leaderboard")}>Ranks</button>
              <button className="ndonate" onClick={() => setShowDonate(true)}>🤲 Donate</button>
              {!user ? <button className="ncta" onClick={() => setView("enroll")}>Login / Join Now</button>
                : <button className="ncta" onClick={() => setView("learn")}>▶ Study</button>}
              {user && (
                <div className="nuser-wrap">
                  <button className="nuser" onClick={e => { e.stopPropagation(); setShowUserMenu(s => !s); }}>﷽ {user.name} <span style={{ fontSize: 9, marginLeft: 4 }}>▾</span></button>
                  {showUserMenu && (
                    <div className="nuser-menu" onMouseLeave={() => setShowUserMenu(false)}>
                      {user.userId && <div className="nuser-menu-email" style={{ color: "var(--gold3)", fontWeight: 500 }}>ID: {user.userId}</div>}
                      <div className="nuser-menu-email">{user.email}</div>
                      <button className="nuser-menu-item" onClick={() => { setShowUserMenu(false); setView("history"); }}>📋 My History</button>
                      <button className="nuser-menu-item logout" onClick={() => { setShowUserMenu(false); logout(); }}>↪ Log Out</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </nav>

        {isAdminRoute ? (
          adminUnlocked
            ? <AdminPage customWords={customWords} saveWords={saveCW} participants={participants} toast_={toast_} onSendResetLink={sendResetLinkToUser} messages={messages} onMarkRead={onMarkMessageRead} onMarkResolved={onMarkMessageResolved} onUpdateParticipant={updateParticipantDetails} onDeleteParticipant={deleteParticipant} onResendVerification={resendVerificationEmail} onResetAllTestData={resetAllTestData} />
            : <AdminGate onUnlock={unlockAdmin} />
        ) : isFinanceRoute ? (
          financeUnlocked
            ? <FinancePage receipts={receipts} onIssueReceipt={issueReceipt} toast_={toast_} />
            : <FinanceGate onUnlock={unlockFinance} />
        ) : (
          <>
            {view === "home" && <HomePage user={user} allWords={allWords} participants={participants} onStart={startQuiz} setView={setView} onDonate={() => setShowDonate(true)} onReview={reviewSession} />}
            {view === "enroll" && <EnrollPage onRegister={registerUser} onLogin={loginUser} participants={participants} onForgotPassword={submitForgotPasswordRequest} onResendVerification={resendVerificationEmail} />}
            {view === "learn" && <LearnPage user={user} allWords={allWords} onQuiz={startQuiz} setView={setView} selectedDay={selectedDay} setSelectedDay={setSelectedDay} />}
            {view === "quiz" && quiz && <QuizPage quiz={quiz} onAnswer={answer} onCancel={cancelQuiz} onTimeUp={finishQuizEarly} />}
            {view === "results" && quiz?.done && <ResultsPage quiz={quiz} user={user} onRetry={() => startQuiz(quiz.day)} setView={setView} onDonate={() => setShowDonate(true)} onReview={reviewSession} />}
            {view === "history" && <HistoryPage user={user} setView={setView} onReview={reviewSession} allWords={allWords} onStart={startQuiz} />}
            {view === "review" && reviewing && <ReviewPage rec={reviewing} setView={setView} allWords={allWords} />}
            {view === "leaderboard" && <LBPage participants={participants} user={user} />}
            {view === "resetPassword" && <ResetPasswordPage onSetPassword={setPasswordFromToken} setView={setView} />}
            {/* Email verification handled automatically by Supabase via onAuthStateChange */}
          </>
        )}

        {!isAdminRoute && !isFinanceRoute && showDonate && <DonateModal onClose={() => setShowDonate(false)} toast_={toast_} user={user} />}
        {/* Mobile bottom navigation bar — visible only on small screens (CSS-controlled) */}
        {!isAdminRoute && !isFinanceRoute && (
          <nav className="mobile-nav">
            <button className={`mnav-btn ${view === "home" ? "on" : ""}`} onClick={() => setView("home")}>
              <span className="mnav-icon">🏠</span>Home
            </button>
            <button className={`mnav-btn ${view === "learn" ? "on" : ""}`} onClick={() => setView("learn")}>
              <span className="mnav-icon">📚</span>Learn
            </button>
            <button className={`mnav-btn ${view === "history" ? "on" : ""}`} onClick={() => setView("history")}>
              <span className="mnav-icon">📋</span>History
            </button>
            <button className={`mnav-btn ${view === "leaderboard" ? "on" : ""}`} onClick={() => setView("leaderboard")}>
              <span className="mnav-icon">🏆</span>Ranks
            </button>
            <button className="mnav-btn" onClick={() => setShowDonate(true)}>
              <span className="mnav-icon">🤲</span>Donate
            </button>
          </nav>
        )}
        {adminProfileOpen && (
          <ChangePasswordModal
            label="Admin"
            getCurrentHash={getActiveAdminPasswordHash}
            storageKey="qv_admin_pw_hash"
            onClose={() => setAdminProfileOpen(false)}
            toast_={toast_}
          />
        )}
        {financeProfileOpen && (
          <ChangePasswordModal
            label="Finance"
            getCurrentHash={getActiveFinancePasswordHash}
            storageKey="qv_finance_pw_hash"
            onClose={() => setFinanceProfileOpen(false)}
            toast_={toast_}
          />
        )}
        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}

function HomePage({ user, allWords, participants, onStart, setView, onDonate, onReview }) {
  const unlocked = user ? getUnlockedWords(user.enrolledAt, user.dayProgress).length : 0;
  const dayN = user ? getUnlockedDays(user.enrolledAt, user.dayProgress) : 0;
  const best = user?.scores?.length ? Math.max(...user.scores.map(s => s.pct)) : null;
  const streak = calcStreak(user?.scores || []);
  // Actual quiz completion = distinct numbered days completed / total days in programme
  // (deliberately excludes "free" quick-quiz attempts and is 0 for a brand-new user)
  const daysCompleted = user ? Object.keys(user.dayProgress || {}).filter(k => k !== "free").length : 0;
  const recentSessions = [...(user?.scores || [])].reverse().slice(0, 4);
  const wordsAddedLastWeek = countWordsAddedLastWeek(allWords);
  const quranCoverage = estimateQuranCoverage(allWords.length);

  // Item 7: best-ever All Sets Quiz attempt, for the homepage summary ribbon.
  // Same selection logic as the calendar page's version — most words correct,
  // ties broken by higher percentage, then by more recent date.
  const allSetsScores = (user?.scores || []).filter(s => !s.day);
  const bestAllSetsHome = allSetsScores.length > 0
    ? allSetsScores.reduce((best, s) => {
        if (!best) return s;
        if (s.score !== best.score) return s.score > best.score ? s : best;
        if (s.pct !== best.pct) return s.pct > best.pct ? s : best;
        return new Date(s.date) > new Date(best.date) ? s : best;
      }, null)
    : null;

  return (
    <div className="page">
      <div className="hero">
        <div className="bism">بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ</div>
        <h2>Master the <em>Language of the Quran</em></h2>
        <p className="sub">Learn the most frequent Qur'an vocabulary in sets of 10 — unlocking the next set as you complete each one, at your own pace.</p>
        {user ? (
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn bg" onClick={() => setView("learn")}>Continue — Set {dayN}</button>
            <button className="btn bh" onClick={() => onStart()}>All Sets Quiz</button>
          </div>
        ) : <button className="btn bg" onClick={() => setView("enroll")}>Begin Your Journey →</button>}
      </div>

      <div className="srow">
        <div className="sbox">
          <span style={{ position: "absolute", top: 6, right: 8, fontSize: 12, opacity: .6 }}>🔒</span>
          <div className="sn">{allWords.length}</div>
          <div className="sl">Total Words</div>
        </div>
        <div className="sbox"><div className="sn">+{wordsAddedLastWeek}</div><div className="sl">Added Last Week</div></div>
        <div className="sbox"><div className="sn">{quranCoverage}%</div><div className="sl">Qur'an Coverage</div></div>
        {user ? (
          <div className="sbox">
            <span style={{ position: "absolute", top: 7, right: 9, fontSize: 11, opacity: .65 }}>🔓</span>
            <div className="sn">{unlocked}</div>
            <div className="sl">Words Unlocked</div>
          </div>
        ) : (
          <div className="sbox"><div className="sn">{participants.length}</div><div className="sl">Members Enrolled</div></div>
        )}
      </div>

      {user && (
        <div className="card" style={{ marginTop: 16, position: "relative" }}>
          <div className="lbl">Your Progress</div>
          {streak > 0 && (
            <span className="streak" style={{ position: "absolute", top: 12, right: 14, fontSize: 11, padding: "3px 10px" }}>
              🔥 {streak}-day streak
            </span>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 10 }}>
            {[
              { label: "Current Set", value: dayN, onClick: () => setView("learn") },
              { label: "Unlocked", value: unlocked, onClick: () => setView("learn") },
              { label: "Completed", value: daysCompleted },
              { label: "Best Score", value: best !== null ? `${best}%` : "—" },
            ].map(({ label, value, onClick }) => (
              <div key={label} onClick={onClick} style={{ cursor: onClick ? "pointer" : "default", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--cyan2)", minHeight: 28, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", lineHeight: 1.3, whiteSpace: "nowrap" }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--cyan2)", fontFamily: "'Poppins',sans-serif", lineHeight: 1, textShadow: "0 0 16px rgba(0,220,255,.25)" }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ overflow: "hidden", marginTop: 4, direction: "ltr" }}>
            <div style={{ display: "inline-block", whiteSpace: "nowrap", animation: "marquee 18s linear infinite", fontSize: 11, color: "var(--muted)" }}>
              Keep going — each quiz unlocks more words on your path to the Quran. &nbsp;&nbsp;&nbsp;✦&nbsp;&nbsp;&nbsp; Keep going — each quiz unlocks more words on your path to the Quran.
            </div>
          </div>
        </div>
      )}

      {/* Item 7: All Sets Quiz best-attempt summary ribbon */}
      {user && bestAllSetsHome && (
        <div className="card allsets-ribbon" style={{ marginTop: 16 }} onClick={() => setView("learn")}>
          <div className="allsets-ribbon-icon">🏆</div>
          <div className="allsets-ribbon-text">
            <div className="allsets-ribbon-title">All Sets Quiz — Best Attempt</div>
            <div className="allsets-ribbon-detail">
              You answered <strong>{bestAllSetsHome.score}</strong> word{bestAllSetsHome.score !== 1 ? "s" : ""} correctly
              {bestAllSetsHome.timeUsedSec != null && (
                bestAllSetsHome.score === unlocked
                  ? <> in just <strong>{bestAllSetsHome.timeUsedSec}</strong> seconds! 🎉</>
                  : <> in <strong>{bestAllSetsHome.timeUsedSec}</strong> seconds</>
              )} out of <strong>{unlocked}</strong> unlocked words
            </div>
          </div>
          <div className="allsets-ribbon-arrow">→</div>
        </div>
      )}

      {/* Session History (replaces the old donate banner) */}
      {user && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div className="lbl" style={{ marginBottom: 0 }}>Session History</div>
            {recentSessions.length > 0 && <button className="btn bh bsm" onClick={() => setView("history")}>View All →</button>}
          </div>
          {recentSessions.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
              No sessions yet — head to <strong style={{ color: "var(--gold2)", cursor: "pointer", textDecoration: "underline" }} onClick={() => setView("learn")}>Learn</strong> and take your first quiz!
            </div>
          ) : (
            <div className="wlist">
              {recentSessions.map((s, i) => (
                <div key={i} className="hist-row" onClick={() => onReview(s)} style={{ padding: "10px 12px", display: "grid", gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: 12 }}>
                  <div className="hist-info">
                    <div className="hist-title">{s.day ? `Set ${s.day}` : "All Sets Quiz"}</div>
                    <div className="hist-date">{new Date(s.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at {new Date(s.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>{s.score}/{s.total}</div>
                  <div className="hist-pct" style={{ color: s.pct >= 70 ? "var(--ok)" : s.pct >= 50 ? "var(--gold2)" : "var(--err)", fontSize: 16, fontWeight: 700, minWidth: 48, textAlign: "right" }}>{s.pct}%</div>
                  <div className="hist-arrow">→</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Compact donate strip — moved below, no longer the dominant element */}
      <div className="donate-strip" onClick={onDonate}>
        <span>🤲 Support this initiative — every rupee helps Quranic education continue</span>
        <span className="donate-strip-cta">Donate →</span>
      </div>
    </div>
  );
}

function EnrollPage({ onRegister, onLogin, participants, onForgotPassword, onResendVerification }) {
  // mode: "login" | "signup"
  const [mode, setMode] = useState("login");

  // Login fields
  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");

  // Forgot-password request modal — requires User ID + Email together
  const [showForgot, setShowForgot] = useState(false);
  const [forgotId, setForgotId] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotNote, setForgotNote] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState("");

  // Signup fields
  const [suUserId, setSuUserId] = useState("");
  const [suPw, setSuPw] = useState("");
  const [suPwConfirm, setSuPwConfirm] = useState("");
  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [typoWarning, setTypoWarning] = useState(null);
  const [ignoreTypo, setIgnoreTypo] = useState(false);

  // Inline availability hints — checked onBlur, cleared when user edits the field
  const [userIdHint, setUserIdHint] = useState(""); // "taken" | "ok" | ""
  const [emailHint,  setEmailHint]  = useState(""); // "taken" | "ok" | ""

  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  // Set after a successful signup (awaiting email click), or after a login
  // attempt that was blocked because the account isn't verified yet.
  const [pendingVerify, setPendingVerify] = useState(null); // { userId, email } or null
  const [resendStatus, setResendStatus] = useState(""); // "", "sending", "sent", "failed"

  const isValidUserId = (id) => /^[a-zA-Z0-9_]{4,20}$/.test(id.trim());

  const submitForgot = () => {
    setForgotError("");
    if (!forgotId.trim() || !forgotEmail.trim()) return;
    const result = onForgotPassword(forgotId, forgotEmail, forgotNote);
    if (result.ok) {
      setForgotSent(true);
    } else {
      setForgotError("That User ID and email don't match any account on file. Please double-check both and try again.");
    }
  };
  const closeForgot = () => {
    setShowForgot(false); setForgotId(""); setForgotEmail(""); setForgotNote(""); setForgotSent(false); setForgotError("");
  };

  // ── LOGIN ──
  const submitLogin = async () => {
    setError("");
    if (!loginId.trim() || !loginPw) { setError("Enter your User ID and password."); return; }
    setChecking(true);
    const result = await onLogin(loginId, loginPw);
    setChecking(false);
    if (!result.ok) {
      if (result.reason === "not-verified") {
        setPendingVerify({ userId: result.userId, email: result.email });
      } else {
        setError("Login failed. Check your User ID and password, or contact admin if you've forgotten your password.");
      }
    }
  };

  // ── SIGN UP ──
  const submitSignup = async () => {
    setError("");
    setTypoWarning(null);
    const userId = suUserId.trim(), name = suName.trim(), email = suEmail.trim();
    if (!userId || !suPw || !suPwConfirm || !name || !email) { setError("All fields are required."); return; }
    if (!isValidUserId(userId)) { setError("User ID must be 4–20 characters: letters, numbers, underscore only."); return; }
    const pwError = getPasswordComplexityError(suPw);
    if (pwError) { setError(pwError); return; }
    if (suPw !== suPwConfirm) { setError("Passwords don't match."); return; }

    setChecking(true);
    const result = await isEmailDomainValid(email);
    setChecking(false);

    if (!result.valid) {
      if (result.reason === "disposable") setError("Temporary or disposable email addresses aren't accepted — please use one you actually check.");
      else if (result.reason === "no-mx") setError("This email domain doesn't appear to exist. Please double-check for a typo.");
      else setError("That doesn't look like a valid email address.");
      return;
    }
    if (result.reason === "likely-typo" && !ignoreTypo) {
      setTypoWarning({ suggestion: result.suggestion });
      return;
    }
    if (result.reason === "alias-warning" && !ignoreTypo) {
      setTypoWarning({ suggestion: null, aliases: result.aliases, provider: result.provider });
      return;
    }

    setChecking(true);
    const regResult = await onRegister(userId, suPw, name, email);
    setChecking(false);
    if (regResult.ok) {
      setPendingVerify({ userId: regResult.userId, email: regResult.email });
      if (regResult.emailFailed) {
        setError("Account created, but the verification email failed to send. Try 'Resend' below, or contact admin.");
      }
    } else if (regResult.reason === "id-taken") {
      setError("That User ID is already taken. Please choose a different one.");
    } else if (regResult.reason === "email-taken") {
      setError("That email address is already registered. Please log in instead, or use a different email.");
    } else {
      setError("Could not create account. Please try again.");
    }
  };

  const acceptSuggestion = () => {
    const local = suEmail.trim().split("@")[0];
    setSuEmail(`${local}@${typoWarning.suggestion}`);
    setTypoWarning(null);
    setIgnoreTypo(false);
  };
  const useAnyway = () => { setTypoWarning(null); setIgnoreTypo(true); };

  const submitResend = async () => {
    if (!pendingVerify) return;
    setResendStatus("sending");
    const result = await onResendVerification(pendingVerify.userId);
    setResendStatus(result.ok ? "sent" : "failed");
  };

  // ── PENDING VERIFICATION SCREEN ──
  // Shown right after signup, or when a login attempt hits an unverified account.
  if (pendingVerify) {
    return (
      <div className="page psm" style={{ textAlign: "center", paddingTop: 60 }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>📧</div>
        <h2>Check Your Email</h2>
        <p className="sub" style={{ marginBottom: 24 }}>
          We sent a verification link to <strong style={{ color: "var(--gold3)" }}>{pendingVerify.email}</strong>.
          Click the link to activate your account and log in.
        </p>

        {/* iPhone PWA specific instruction */}
        <div style={{ background: "rgba(0,200,230,.07)", border: "1px solid rgba(0,200,230,.25)", borderRadius: 10, padding: "14px 16px", marginBottom: 16, textAlign: "left" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--cyan2)", marginBottom: 8 }}>📱 Using the app on iPhone or iPad?</div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.8 }}>
            When you tap the verification link in your email it will open in Safari — not in this app.
            <br/>
            <strong style={{ color: "var(--text)" }}>After clicking the link in Safari, come back here and tap Login.</strong>
            <br/>
            Your account will be verified and ready to use.
          </div>
        </div>

        <div className="card">
          {error && <div className="enroll-error" style={{ marginBottom: 14 }}>⚠ {error}</div>}
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
            Didn't get it? Check your spam folder, or request a new link below.
          </p>
          <button className="btn bg bfw" onClick={submitResend} disabled={resendStatus === "sending"}>
            {resendStatus === "sending" ? "Sending…" : "Resend Verification Email"}
          </button>
          {resendStatus === "sent" && <p style={{ fontSize: 12, color: "var(--ok)", marginTop: 10 }}>✅ New link sent — check your inbox.</p>}
          {resendStatus === "failed" && <p style={{ fontSize: 12, color: "var(--err)", marginTop: 10 }}>⚠ Failed to send. Please contact admin for help.</p>}
          <button className="btn bh bfw" style={{ marginTop: 10 }} onClick={() => { setPendingVerify(null); setError(""); setResendStatus(""); setMode("login"); }}>
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page psm">
      <div className="lbl">{mode === "login" ? "Login" : "Create Account"}</div>
      <h2>{mode === "login" ? "Welcome Back" : "Join the Series"}</h2>
      <p className="sub" style={{ marginBottom: 22 }}>
        {mode === "login" && "Enter your User ID and password to resume your journey."}
        {mode === "signup" && "Choose a User ID and password to begin your journey."}
      </p>

      <div className="auth-mode-tabs">
        <button className={`auth-mode-tab ${mode === "login" ? "on" : ""}`} onClick={() => { setMode("login"); setError(""); }}>Login</button>
        <button className={`auth-mode-tab ${mode === "signup" ? "on" : ""}`} onClick={() => { setMode("signup"); setError(""); }}>Sign Up</button>
      </div>

      <div className="card">
        {mode === "login" && (
          <>
            <div className="field"><label>User ID</label><input value={loginId} onChange={e => { setLoginId(e.target.value); setError(""); }} placeholder="Your User ID" autoFocus /></div>
            <div className="field"><label>Password</label><input type="password" value={loginPw} onChange={e => { setLoginPw(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && submitLogin()} placeholder="Your password" /></div>
            {error && <div className="enroll-error">⚠ {error}</div>}
            <button className="btn bg bfw" onClick={submitLogin} disabled={!loginId || !loginPw || checking}>
              {checking ? "Checking…" : "Login →"}
            </button>
            <p className="enroll-hint">🔒 <span className="forgot-link" onClick={() => setShowForgot(true)}>Forgot your password? Contact the admin to have it reset.</span></p>
          </>
        )}

        {mode === "signup" && (
          <>
            <div className="field">
              <label>Choose a User ID</label>
              <input
                value={suUserId}
                onChange={e => { setSuUserId(e.target.value); setError(""); setUserIdHint(""); }}
                onBlur={() => {
                  const v = suUserId.trim().toLowerCase();
                  if (!v || v.length < 4) return;
                  const taken = participants.some(p => (p.userId || "").toLowerCase() === v);
                  setUserIdHint(taken ? "taken" : "ok");
                }}
                placeholder="e.g. ghouse123 (4–20 chars)"
                style={userIdHint === "taken" ? { borderColor: "var(--err)" } : userIdHint === "ok" ? { borderColor: "var(--cyan)" } : {}}
              />
              {userIdHint === "taken" && <div style={{ fontSize: 12, color: "var(--err)", marginTop: 4 }}>⚠ This User ID is already taken — choose another.</div>}
              {userIdHint === "ok"    && <div style={{ fontSize: 12, color: "var(--cyan)", marginTop: 4 }}>✓ User ID is available.</div>}
            </div>
            <div className="field"><label>Choose a Password</label><input type="password" value={suPw} onChange={e => { setSuPw(e.target.value); setError(""); }} placeholder="Min 10 chars, 1 number, 1 special char" /></div>
            <div className="field"><label>Confirm Password</label><input type="password" value={suPwConfirm} onChange={e => { setSuPwConfirm(e.target.value); setError(""); }} placeholder="Re-enter password" /></div>
            <div className="field"><label>Full Name</label><input value={suName} onChange={e => { setSuName(e.target.value); setError(""); }} placeholder="Your name" /></div>
            <div className="field">
              <label>Email Address</label>
              <input
                type="email"
                value={suEmail}
                onChange={e => { setSuEmail(e.target.value); setError(""); setTypoWarning(null); setIgnoreTypo(false); setEmailHint(""); }}
                onBlur={() => {
                  const v = suEmail.trim().toLowerCase();
                  if (!v || !v.includes("@")) return;
                  const taken = participants.some(p => (p.email || "").toLowerCase() === v);
                  setEmailHint(taken ? "taken" : "ok");
                }}
                placeholder="your@email.com"
                style={emailHint === "taken" ? { borderColor: "var(--err)" } : emailHint === "ok" ? { borderColor: "var(--cyan)" } : {}}
              />
              {emailHint === "taken" && <div style={{ fontSize: 12, color: "var(--err)", marginTop: 4 }}>⚠ This email is already registered — please log in or use a different email.</div>}
              {emailHint === "ok"    && <div style={{ fontSize: 12, color: "var(--cyan)", marginTop: 4 }}>✓ Email is available.</div>}
            </div>
            {error && <div className="enroll-error">⚠ {error}</div>}
            {typoWarning && (
              <div className="enroll-typo-warning">
                {typoWarning.suggestion ? (
                  <>
                    <div>🤔 Did you mean <strong>@{typoWarning.suggestion}</strong>?</div>
                    <div className="enroll-typo-actions">
                      <button className="btn bsm bg" onClick={acceptSuggestion}>Yes, fix it</button>
                      <button className="btn bsm bh" onClick={useAnyway}>No, use as typed</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>⚠️ <strong>{typoWarning.provider} accounts</strong> can use different email addresses — make sure you check the right inbox!</div>
                    <div style={{ fontSize: 12, marginTop: 6, color: "var(--muted)" }}>
                      Your address ends in <strong style={{ color: "var(--text)" }}>@{suEmail.split("@")[1]}</strong> — the verification email will go there.
                      If you usually check <strong style={{ color: "var(--text)" }}>{typoWarning.aliases.map(a => `@${a}`).join(", ")}</strong> instead, please update your email above.
                    </div>
                    <div className="enroll-typo-actions">
                      <button className="btn bsm bg" onClick={useAnyway}>Yes, I check @{suEmail.split("@")[1]}</button>
                      <button className="btn bsm bh" onClick={() => { setTypoWarning(null); setIgnoreTypo(false); }}>Let me change it</button>
                    </div>
                  </>
                )}
              </div>
            )}
            <button className="btn bg bfw" onClick={submitSignup} disabled={checking}>
              {checking ? "Checking…" : "Create Account →"}
            </button>
          </>
        )}
      </div>

      <div className="enroll-sincerity">
        <div className="arabic">إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ</div>
        <p>"Actions are judged by intentions." This journey is between you and the words of Allah ﷻ — please use a real email that's truly yours. Memorizing the Qur'an means something only when it's approached with sincerity, not shortcuts. Begin honestly, and let every word you learn bring you closer to Him.</p>
      </div>

      {showForgot && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeForgot(); }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-head">
              <h3>🔑 Request Password Reset</h3>
              <button className="modal-close" onClick={closeForgot}>✕</button>
            </div>
            <div className="modal-body">
              {!forgotSent ? (
                <>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
                    Both your User ID and registered email must match the same account.
                  </p>
                  <div className="field"><label>Your User ID</label><input value={forgotId} onChange={e => { setForgotId(e.target.value); setForgotError(""); }} placeholder="The User ID you signed up with" autoFocus /></div>
                  <div className="field"><label>Your Registered Email</label><input type="email" value={forgotEmail} onChange={e => { setForgotEmail(e.target.value); setForgotError(""); }} placeholder="The email you signed up with" /></div>
                  <div className="field"><label>Note (optional)</label><input value={forgotNote} onChange={e => setForgotNote(e.target.value)} placeholder="e.g. your phone number, or how to reach you" /></div>
                  {forgotError && <div className="enroll-error">⚠ {forgotError}</div>}
                  <button className="btn bg bfw" onClick={submitForgot} disabled={!forgotId.trim() || !forgotEmail.trim()}>Send Request →</button>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "10px 0" }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
                  <p style={{ fontSize: 14, color: "var(--text)", marginBottom: 6 }}>Request sent!</p>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 18 }}>The admin will email you a reset link shortly.</p>
                  <button className="btn bh" onClick={closeForgot}>Close</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reset Password Page (Supabase handles token via URL hash automatically) ──
function ResetPasswordPage({ onSetPassword, setView }) {
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError("");
    if (!newPw || !confirmPw) { setError("Both fields are required."); return; }
    const pwError = getPasswordComplexityError(newPw);
    if (pwError) { setError(pwError); return; }
    if (newPw !== confirmPw) { setError("Passwords don't match."); return; }
    setChecking(true);
    const result = await onSetPassword(null, newPw);
    setChecking(false);
    if (result.ok) {
      setDone(true);
      window.history.replaceState({}, "", window.location.pathname);
    } else {
      setError("Could not update password. Please request a new reset link.");
    }
  };

  if (done) {
    return (
      <div className="page psm" style={{ textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
        <h2>Password Updated</h2>
        <p className="sub" style={{ marginBottom: 24 }}>Your password has been set. You can now log in.</p>
        <button className="btn bg" onClick={() => setView("enroll")}>Go to Login</button>
      </div>
    );
  }

  return (
    <div className="page psm" style={{ paddingTop: 60 }}>
      <div className="lbl" style={{ justifyContent: "center" }}>Reset Password</div>
      <h2 style={{ textAlign: "center" }}>Set a New Password</h2>
      <p className="sub" style={{ textAlign: "center", marginBottom: 26 }}>Choose a new password for your account.</p>
      <div className="card">
        <div className="field"><label>New Password</label><input type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setError(""); }} placeholder="Min 10 chars, 1 number, 1 special char" autoFocus /></div>
        <div className="field"><label>Confirm New Password</label><input type="password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setError(""); }} placeholder="Re-enter password" /></div>
        {error && <div className="enroll-error">⚠ {error}</div>}
        <button className="btn bg bfw" onClick={submit} disabled={checking}>
          {checking ? "Updating…" : "Set New Password →"}
        </button>
      </div>
    </div>
  );
}

// ─── Verify Email Page (opened via emailed signup verification link) ─────────
function VerifyEmailPage({ token, onVerify, setView }) {
  const [status, setStatus] = useState("checking"); // checking | done | error
  const [reason, setReason] = useState("");
  const [learnerName, setLearnerName] = useState("");
  const ranRef = useState(() => ({ current: false }))[0];

  useEffect(() => {
    if (ranRef.current) return; // guard against double-run in strict mode
    ranRef.current = true;
    if (!token) { setStatus("error"); setReason("not-found"); return; }
    const result = onVerify(token);
    if (result.ok) {
      setLearnerName(result.name);
      setStatus("done");
      window.history.replaceState({}, "", window.location.pathname);
    } else {
      setStatus("error");
      setReason(result.reason);
    }
  }, []);

  if (status === "checking") {
    return (
      <div className="page psm" style={{ textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>⏳</div>
        <h2>Verifying…</h2>
      </div>
    );
  }

  if (status === "error") {
    const messages = {
      "not-found": "This verification link is invalid.",
      "used": "This link has already been used — your account should already be verified. Try logging in.",
      "expired": "This verification link has expired (links are valid for 48 hours). Please request a new one from the Login page.",
    };
    return (
      <div className="page psm" style={{ textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>⚠️</div>
        <h2>Link Not Valid</h2>
        <p className="sub" style={{ marginBottom: 24 }}>{messages[reason] || "This verification link can't be used."}</p>
        <button className="btn bg" onClick={() => { window.history.replaceState({}, "", window.location.pathname); setView("enroll"); }}>Go to Login</button>
      </div>
    );
  }

  return (
    <div className="page psm" style={{ textAlign: "center", paddingTop: 80 }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
      <h2>Email Verified!</h2>
      <p className="sub" style={{ marginBottom: 24 }}>Welcome, {learnerName}! Your account is now active and you're logged in.</p>
      <button className="btn bg" onClick={() => setView("home")}>Go to Home</button>
    </div>
  );
}

// ── Shared expandable word card — used on Day Words page and History's ──────
// Strong/Weak word breakdown, so both show identical detail (Urdu, root,
// root meanings, Qur'an reference).
function WordDetailCard({ word, isOpen, onToggle, badge, highlight = false }) {
  return (
    <div className={`word-card ${highlight ? "word-card-unmastered" : ""}`}>
      {badge && (
        <div style={{ textAlign: "center", marginBottom: 8 }}>{badge}</div>
      )}
      <div className="word-card-main">
        <div className="war">{word.arabic}</div>
        <div className="wtr">{word.translit}</div>
        <div className="wen">{word.english}</div>
        <button className="word-toggle" onClick={onToggle}>
          {isOpen ? "Hide ▲" : "Details ▼"}
        </button>
      </div>
      {isOpen && (
        <div className="word-card-detail">
          <span className="dlabel">Urdu</span>
          <span className="dval urdu">{word.urdu || "—"}</span>
          <span className="dlabel">Root</span>
          <span className="dval arabic">{word.root && word.root !== "—" ? word.root : "— (no triliteral root)"}</span>
          <span className="dlabel">Root Meaning (En)</span>
          <span className="dval">{word.rootEnglish || "—"}</span>
          <span className="dlabel">Root Meaning (Ur)</span>
          <span className="dval urdu">{word.rootUrdu || "—"}</span>
          {word.ayahRef && (<><span className="dlabel">Qur'an Ref</span><span className="dval">{word.ayahRef}</span></>)}
        </div>
      )}
    </div>
  );
}

function LearnPage({ user, allWords, onQuiz, setView, selectedDay, setSelectedDay }) {
  const [expandedWord, setExpandedWord] = useState(null);
  const [viewingAllSets, setViewingAllSets] = useState(false);

  if (!user) return (
    <div className="page pmd" style={{ textAlign: "center", paddingTop: 72 }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>📖</div>
      <h2>Please Enroll First</h2>
      <p className="sub" style={{ marginBottom: 22 }}>Enroll to track your daily progress.</p>
      <button className="btn bg" onClick={() => setView("enroll")}>Enroll Now</button>
    </div>
  );
  const unlocked = getUnlockedDays(user.enrolledAt, user.dayProgress);
  const totalDays = Math.ceil(allWords.length / WORDS_PER_DAY);
  const words = selectedDay ? allWords.slice((selectedDay - 1) * WORDS_PER_DAY, selectedDay * WORDS_PER_DAY) : null;
  const done = (d) => !!user.dayProgress?.[String(d)];

  const selectSet = (d) => { setSelectedDay(d); setViewingAllSets(false); };
  const selectAllSets = () => { setSelectedDay(null); setViewingAllSets(true); };

  // Item 4: words "mastered" in the currently selected set — a word counts as
  // mastered once its most recent MASTERY_STREAK_REQUIRED (3) attempts were
  // all correct, in a row. Older mistakes don't permanently block mastery
  // once that streak is achieved, but any wrong answer resets it back to
  // zero. Counts attempts from BOTH this set's own dedicated quiz AND the
  // All Sets Quiz — mastery reflects whether the learner actually knows the
  // word, regardless of which quiz mode they demonstrated that through.
  let setMastery = null;
  let setMasteredKeys = null;
  if (selectedDay) {
    const setWordArabics = new Set((words || []).map(w => w.arabic));
    const relevantScores = (user.scores || []).filter(s => s.day === selectedDay || s.day == null);
    const { masteredSet } = buildStrictMastery(relevantScores);
    // Only count mastery for words that actually belong to this set — an
    // All Sets Quiz attempt covers many sets' words at once, so we filter
    // its contribution down to just the words shown on this page.
    setMasteredKeys = new Set([...masteredSet].filter(arabic => setWordArabics.has(arabic)));
    setMastery = { mastered: setMasteredKeys.size, totalInSet: words ? words.length : WORDS_PER_DAY };
  }

  // Item 5: best-ever All Sets Quiz attempt — most words answered correctly.
  // Ties broken by higher percentage, then by more recent date (so a newer
  // attempt with full data, e.g. timing info, isn't silently shadowed by an
  // older tied attempt that predates a feature like time tracking).
  let bestAllSets = null;
  if (viewingAllSets) {
    const allSetsScores = (user.scores || []).filter(s => !s.day);
    if (allSetsScores.length > 0) {
      bestAllSets = allSetsScores.reduce((best, s) => {
        if (!best) return s;
        if (s.score !== best.score) return s.score > best.score ? s : best;
        if (s.pct !== best.pct) return s.pct > best.pct ? s : best;
        return new Date(s.date) > new Date(best.date) ? s : best;
      }, null);
    }
  }

  return (
    <div className="page pmd">
      <div className="lbl">Word Sets</div>
      <h2>Choose Your Set</h2>
      <p className="sub" style={{ marginBottom: 26 }}>Set {unlocked} unlocked so far · {unlocked * WORDS_PER_DAY} words available</p>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="lbl" style={{ marginBottom: 13 }}>Progress Calendar</div>
        <div className="cal" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(34px, 1fr)) auto" }}>
          {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => {
            const locked = d > unlocked, isDone = done(d), isToday = d === unlocked;
            return (
              <div key={d} className={`cc ${locked ? "locked" : isDone ? "done" : isToday ? "today" : "avail"} ${selectedDay === d ? "selected" : ""}`}
                title={locked ? `Unlocks once Set ${d - 1} is completed` : `Set ${d}`}
                onClick={() => !locked && selectSet(d)}>
                {isDone ? "✓" : d}
              </div>
            );
          })}
          <div className="cc cc-continues" title="More sets will be added as the word bank grows">⋯</div>
          <button
            className={`cc-allsets ${viewingAllSets ? "selected" : ""}`}
            onClick={selectAllSets}
            title="See your best All Sets Quiz attempt"
          >
            All Sets
          </button>
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 11, color: "var(--muted)" }}>
          <span><span style={{ color: "var(--gold3)" }}>■</span> Current</span>
          <span><span style={{ color: "var(--ok)" }}>■</span> Done</span>
          <span style={{ opacity: .5 }}>■ Locked</span>
        </div>
      </div>

      {selectedDay && words && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="lbl" style={{ marginBottom: 0 }}>Set {selectedDay} Words</div>
            <button className="btn bg bsm" onClick={() => onQuiz(selectedDay)}>Quiz Set {selectedDay}</button>
          </div>
          {setMastery && (
            <div className="set-mastery-banner">
              🎯 <strong>{setMastery.mastered}</strong> of <strong>{setMastery.totalInSet}</strong> words mastered in this set
              {setMastery.mastered >= setMastery.totalInSet
                ? <> — all words mastered! 🎉</>
                : <> — highlighted words below still need {MASTERY_STREAK_REQUIRED} correct answers in a row.</>}
              {done(selectedDay) && setMastery.mastered < setMastery.totalInSet && (
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
                  Note: passing this set's quiz (80%+) unlocks the next set, but "mastered" tracks each word individually and takes longer to build up — they're measuring different things.
                </div>
              )}
            </div>
          )}
          <div className="wlist" style={{ marginTop: 16 }}>
            {words.map((w, i) => {
              const isOpen = expandedWord === `${selectedDay}-${i}`;
              const isMastered = setMasteredKeys ? setMasteredKeys.has(w.arabic) : false;
              return (
                <WordDetailCard
                  key={i}
                  word={w}
                  isOpen={isOpen}
                  onToggle={() => setExpandedWord(isOpen ? null : `${selectedDay}-${i}`)}
                  highlight={!isMastered}
                />
              );
            })}
          </div>
          {done(selectedDay) && <div style={{ marginTop: 12, fontSize: 12, color: "var(--ok)", textAlign: "center" }}>✓ Completed</div>}
        </div>
      )}

      {viewingAllSets && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="lbl" style={{ marginBottom: 0 }}>All Sets Quiz — Best Attempt</div>
            <button className="btn bg bsm" onClick={() => onQuiz()}>Quiz All Sets</button>
          </div>
          {bestAllSets ? (
            <div className="set-mastery-banner">
              🏆 Best attempt: <strong>{bestAllSets.score}</strong> word{bestAllSets.score !== 1 ? "s" : ""} answered correctly
              {bestAllSets.timeUsedSec != null && (
                bestAllSets.score === bestAllSets.total
                  ? <> in just <strong>{bestAllSets.timeUsedSec}</strong> seconds! 🎉</>
                  : <> in <strong>{bestAllSets.timeUsedSec}</strong> seconds</>
              )} out of <strong>{bestAllSets.total}</strong> words ({bestAllSets.pct}%)
            </div>
          ) : (
            <div className="set-mastery-banner">
              No All Sets Quiz attempts yet — take one to see your best score here.
            </div>
          )}
          {/* Show all unlocked words — same layout as individual set words, with mastery highlight */}
          {(() => {
            const { masteredSet: allMastered } = buildStrictMastery(user.scores || []);
            const allMasteredCount = getUnlockedWords(user.enrolledAt, user.dayProgress).filter(w => allMastered.has(w.arabic)).length;
            const allUnlocked = getUnlockedWords(user.enrolledAt, user.dayProgress);
            return (
              <>
                {allMastered.size > 0 && (
                  <div className="set-mastery-banner" style={{ marginTop: 12, marginBottom: 4 }}>
                    ⭐ <strong>{allMasteredCount}</strong> of <strong>{allUnlocked.length}</strong> words mastered
                    {allMasteredCount >= allUnlocked.length ? " — all words mastered! 🎉" : " — highlighted words below still need 3 correct in a row."}
                  </div>
                )}
                <div className="wlist" style={{ marginTop: 12 }}>
                  {allUnlocked.map((w, i) => {
                    const isOpen = expandedWord === `allsets-${i}`;
                    const isMastered = allMastered.has(w.arabic);
                    return (
                      <WordDetailCard
                        key={i}
                        word={w}
                        isOpen={isOpen}
                        onToggle={() => setExpandedWord(isOpen ? null : `allsets-${i}`)}
                        highlight={!isMastered}
                      />
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {!selectedDay && !viewingAllSets && (
        <div className="card" style={{ textAlign: "center", padding: 36, color: "var(--muted)" }}>
          Select a set from the calendar to preview its words and quiz.
        </div>
      )}
    </div>
  );
}

function QuizPage({ quiz, onAnswer, onCancel, onTimeUp }) {
  const { questions, cur } = quiz;
  const q = questions[cur];
  const isArQ = q.qf === "arabic";
  const [confirmCancel, setConfirmCancel] = useState(false);
  const hasTimer = quiz.timerSeconds != null;
  const [timeLeft, setTimeLeft] = useState(quiz.timerSeconds);

  useEffect(() => {
    if (!hasTimer || quiz.done) return;
    if (timeLeft <= 0) {
      onTimeUp();
      return;
    }
    const id = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft, hasTimer, quiz.done]);

  const timerLow = hasTimer && timeLeft <= 10;

  return (
    <div className="page pmd qwrap">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--muted)" }}>Q {cur + 1} / {questions.length}</span>
        <span style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {hasTimer && (
            <span className={`quiz-timer ${timerLow ? "low" : ""}`} style={{ fontSize: 15, fontWeight: 700 }}>⏱ {timeLeft}s</span>
          )}
          <span style={{ color: "var(--gold2)", fontSize: 15, fontWeight: 700 }}>Score: {quiz.score}</span>
          <button className="quiz-exit" onClick={() => setConfirmCancel(true)} style={{ fontSize: 13, fontWeight: 600 }}>✕ Exit Quiz</button>
        </span>
      </div>
      <div className="qprog">{questions.map((_, i) => <div key={i} className={`qd ${i < cur ? "done" : i === cur ? "now" : ""}`} />)}</div>
      <div className="qcard">
        <div className="qdir">{q.dir === "ar2en" ? "Arabic → English" : "English → Arabic"}</div>
        <div className={`qq arabic ${isArQ ? "" : "en"}`}>{q.word[q.qf]}</div>
        {isArQ && <div className="qtr">{q.word.translit}</div>}
        {!isArQ && <div style={{ marginBottom: 34 }} />}
        <div className="opts" key={`q-${cur}`}>
          {q.options.map((opt, i) => {
            let c = `opt${!isArQ ? " ar" : ""}`;
            if (q.chosen !== null) { if (opt === q.word[q.af]) c += " correct"; else if (opt === q.chosen) c += " wrong"; }
            return <button key={`${cur}-${i}`} className={c} onClick={() => onAnswer(opt)} disabled={q.chosen !== null}>{opt}</button>;
          })}
        </div>
      </div>

      {confirmCancel && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmCancel(false); }}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-body" style={{ textAlign: "center", padding: "28px 24px" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
              <h3 style={{ fontFamily: "'Cinzel',serif", fontSize: 16, color: "var(--gold2)", marginBottom: 8 }}>Exit this quiz?</h3>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20, lineHeight: 1.6 }}>
                Your progress on this attempt ({cur + 1} of {questions.length} answered) will not be saved. This will not count as a session.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button className="btn bh" onClick={() => setConfirmCancel(false)}>Continue Quiz</button>
                <button className="btn" style={{ background: "var(--err)", color: "#fff" }} onClick={onCancel}>Exit Without Saving</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsPage({ quiz, user, onRetry, setView, onDonate, onReview }) {
  const { result, missed } = quiz;
  const { score, total, pct } = result;
  const msg = pct >= 90 ? { t: "Excellent! ما شاء الله", c: "var(--ok)" }
    : pct >= 70 ? { t: "Well done! الحمد لله", c: "var(--teal2)" }
    : pct >= 50 ? { t: "Keep going! إن شاء الله", c: "var(--gold2)" }
    : { t: "More practice needed — صبر", c: "var(--err)" };

  // Count words now mastered (3 consecutive correct across all sessions)
  const { masteredSet } = buildStrictMastery(user?.scores || []);
  const masteredCount = masteredSet.size;

  return (
    <div className="page psm" style={{ textAlign: "center" }}>
      <div className="lbl" style={{ justifyContent: "center" }}>Session Complete</div>
      {result.timedOut && (
        <div style={{ background: "rgba(192,80,74,.08)", border: "1px solid rgba(192,80,74,.25)", borderRadius: 8, padding: "8px 14px", marginBottom: 16, fontSize: 13, color: "#e0a098" }}>
          ⏱ Time's up! Scored based on {total} question{total !== 1 ? "s" : ""} you answered.
        </div>
      )}
      {quiz.day && (
        quiz.passed
          ? <div style={{ background: "rgba(74,158,92,.08)", border: "1px solid rgba(74,158,92,.25)", borderRadius: 8, padding: "8px 14px", marginBottom: 16, fontSize: 13, color: "var(--ok)" }}>
              ✅ Passed! ({PASSING_SCORE_PCT}%+ on this attempt) — the next set is now unlocked.
            </div>
          : quiz.masteryGateMet
          ? <div style={{ background: "rgba(74,158,92,.08)", border: "1px solid rgba(74,158,92,.25)", borderRadius: 8, padding: "8px 14px", marginBottom: 16, fontSize: 13, color: "var(--ok)" }}>
              ✅ {MASTERY_GATE_PCT}%+ of this set's words are now mastered — the next set is unlocked!
            </div>
          : <div style={{ background: "rgba(192,80,74,.08)", border: "1px solid rgba(192,80,74,.25)", borderRadius: 8, padding: "8px 14px", marginBottom: 16, fontSize: 13, color: "#e0a098" }}>
              Unlock the next set with <strong>{PASSING_SCORE_PCT}%+</strong> on one attempt, or by mastering <strong>{MASTERY_GATE_PCT}%+</strong> of this set's words over time — retry to keep working toward either.
            </div>
      )}
      <div className="rring"><div className="rpct">{pct}%</div><div className="rfrac">{score} / {total}</div></div>
      <div style={{ fontSize: 20, color: msg.c, marginBottom: 6 }}>{msg.t}</div>
      {user?.scores?.length > 1 && <div style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0 14px" }}>{user.scores.length} sessions · Best: {Math.max(...user.scores.map(s => s.pct))}%</div>}

      {/* Mastered word count */}
      {masteredCount > 0 && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(0,200,230,.08)", border: "1px solid rgba(0,200,230,.25)", borderRadius: 10, padding: "8px 18px", marginBottom: 20, fontSize: 14 }}>
          <span style={{ fontSize: 18 }}>⭐</span>
          <span style={{ color: "var(--text)" }}>
            <strong style={{ color: "var(--cyan2)", fontWeight: 700 }}>{masteredCount}</strong>
            <span style={{ color: "var(--muted)" }}> word{masteredCount !== 1 ? "s" : ""} mastered (3 correct in a row)</span>
          </span>
        </div>
      )}
      {missed.length > 0 && (
        <div style={{ textAlign: "left", marginBottom: 24 }}>
          <div className="lbl" style={{ marginBottom: 9 }}>Words to Review</div>
          {missed.map((w, i) => (
            <div className="miss" key={i}>
              <span className="arabic" style={{ fontSize: 20, color: "var(--gold3)" }}>{w.arabic}</span>
              <span style={{ color: "var(--muted)" }}>{w.translit}</span>
              <span>{w.english}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 9, justifyContent: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <button className="btn bg" onClick={onRetry}>Retry</button>
        <button className="btn bt" onClick={() => setView("learn")}>Sets</button>
        <button className="btn bh" onClick={() => setView("leaderboard")}>Ranks</button>
      </div>
      <div style={{ marginBottom: 22 }}>
        <button className="btn bh" style={{ width: "100%" }} onClick={() => onReview(result)}>📋 Review Full Answer Breakdown</button>
      </div>
      {/* Donate nudge after completing a session */}
      <div style={{ background: "rgba(0,200,230,.06)", border: "1px solid rgba(0,200,230,.15)", borderRadius: 10, padding: "16px 18px", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>جَزَاكَ اللَّهُ خَيْرًا — Enjoying this? Consider supporting the cause.</div>
        <button className="btn-donate" onClick={onDonate}>🤲 Donate to {DONATE.charityName}</button>
      </div>
    </div>
  );
}

// ── Simple SVG Bar Chart — supports two modes ──────────────────────────────────
// mode="score" (Set Quizzes): bar height = percentage, label on top = "8/10"
// mode="time"  (All Sets Quiz): bar height = seconds taken, label on top =
//   number of words answered correctly, y-axis gridlines scaled to seconds
function ScoreBarChart({ data, compact = false, mode = "score" }) {
  if (data.length === 0) return null;
  const W = compact ? 320 : 420, H = compact ? 290 : 320, padL = compact ? 30 : 36, padB = 32, padT = 18, padR = 8;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const barGap = compact ? 10 : 14;
  // Fixed bar width regardless of how many bars there are, so a 2-bar chart
  // and a 6-bar chart both show consistently-sized bars rather than one
  // stretching wide and the other shrinking to fit — only the total row
  // width differs, anchored from the left in both cases.
  const maxBarW = compact ? 30 : 42;
  const barW = Math.min(maxBarW, (chartW - barGap * (data.length - 1)) / data.length);
  const startX = padL;

  // Time mode: scale the y-axis to the highest time value actually present,
  // rounded up to a clean number, so gridlines are meaningful regardless of
  // how long attempts took (10s vs 90s attempts both render sensibly).
  const maxTime = mode === "time"
    ? Math.max(10, Math.ceil(Math.max(...data.map(d => d.timeUsedSec || 0)) / 10) * 10)
    : 100;
  const gridSteps = mode === "time"
    ? [0, maxTime * 0.25, maxTime * 0.5, maxTime * 0.75, maxTime].map(Math.round)
    : [0, 25, 50, 75, 100];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", maxWidth: compact ? 340 : 440, display: "block" }}>
      {gridSteps.map(p => {
        const fraction = mode === "time" ? p / maxTime : p / 100;
        const y = padT + chartH - fraction * chartH;
        return (
          <g key={p}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={padL - 8} y={y + 3} fontSize={compact ? 9 : 11} fill="var(--muted)" textAnchor="end" fontFamily="Poppins, sans-serif">{p}{mode === "time" ? "s" : ""}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = startX + i * (barW + barGap);
        let barFraction, topLabel, color;
        if (mode === "time") {
          const t = d.timeUsedSec ?? 0;
          barFraction = maxTime > 0 ? t / maxTime : 0;
          topLabel = d.score != null ? `${d.score}✓` : "—";
          color = "var(--teal2)";
        } else {
          barFraction = d.pct / 100;
          topLabel = (d.score != null && d.total != null) ? `${d.score}/${d.total}` : `${d.pct}%`;
          color = d.pct >= 70 ? "var(--ok)" : d.pct >= 50 ? "var(--gold2)" : "var(--err)";
        }
        const barH = barFraction * chartH;
        const y = padT + chartH - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx="3" fill={color} opacity="0.85" />
            {(!compact || data.length <= 8) && <text x={x + barW / 2} y={y - 7} fontSize={compact ? 10.5 : 13} fontWeight="600" fill="var(--text)" textAnchor="middle" fontFamily="Poppins, sans-serif">{topLabel}</text>}
            <text x={x + barW / 2} y={H - 10} fontSize={compact ? 10 : 12} fill="var(--muted)" textAnchor="middle" fontFamily="Poppins, sans-serif">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Simple SVG Pie/Donut Chart — Strong vs Weak vs Even words ─────────────────
function WordStrengthPieChart({ strong, weak, even, compact = false }) {
  const total = strong + weak + even;
  if (total === 0) return null;
  const size = 180, cx = size / 2, cy = size / 2, r = 70, innerR = 42;

  const segments = [
    { value: strong, color: "var(--ok)", label: "Strong" },
    { value: weak, color: "var(--err)", label: "Weak" },
    { value: even, color: "var(--gold2)", label: "Mixed" },
  ].filter(s => s.value > 0);

  let cumulativeAngle = -90; // start at top
  const paths = segments.map(seg => {
    const angle = (seg.value / total) * 360;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;

    const toRad = (deg) => (deg * Math.PI) / 180;
    const x1 = cx + r * Math.cos(toRad(startAngle));
    const y1 = cy + r * Math.sin(toRad(startAngle));
    const x2 = cx + r * Math.cos(toRad(endAngle));
    const y2 = cy + r * Math.sin(toRad(endAngle));
    const ix1 = cx + innerR * Math.cos(toRad(startAngle));
    const iy1 = cy + innerR * Math.sin(toRad(startAngle));
    const ix2 = cx + innerR * Math.cos(toRad(endAngle));
    const iy2 = cy + innerR * Math.sin(toRad(endAngle));
    const largeArc = angle > 180 ? 1 : 0;

    const d = `M ${ix1} ${iy1} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
    return { d, color: seg.color, label: seg.label, value: seg.value };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: compact ? 14 : 18 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: compact ? 200 : 230, height: compact ? 200 : 230, flexShrink: 0, display: "block" }}>
        {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} opacity="0.88" />)}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={compact ? 24 : 28} fontFamily="Poppins, sans-serif" fill="var(--gold3)">{total}</text>
        <text x={cx} y={cy + 18} textAnchor="middle" fontSize={compact ? 10 : 11} fontFamily="Poppins, sans-serif" fill="var(--muted)">words</text>
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: compact ? "6px 16px" : "8px 20px" }}>
        {paths.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: compact ? 13 : 14 }}>
            <span style={{ width: compact ? 11 : 12, height: compact ? 11 : 12, borderRadius: 3, background: p.color, display: "inline-block" }} />
            <span style={{ color: "var(--text)" }}>{p.label}</span>
            <span style={{ color: "var(--muted)" }}>({p.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryPage({ user, setView, onReview, allWords, onStart }) {
  const [wordTab, setWordTab] = useState("weak"); // weak | strong | even
  const [expandedHistWord, setExpandedHistWord] = useState(null);
  const [allSetsWordTab, setAllSetsWordTab] = useState("weak");
  const [expandedAllSetsHistWord, setExpandedAllSetsHistWord] = useState(null);
  const [expandedWeakWord, setExpandedWeakWord] = useState(null);

  if (!user) return (
    <div className="page pmd" style={{ textAlign: "center", paddingTop: 72 }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>📋</div>
      <h2>Please Enroll First</h2>
      <p className="sub" style={{ marginBottom: 22 }}>Enroll to start tracking your quiz history.</p>
      <button className="btn bg" onClick={() => setView("enroll")}>Enroll Now</button>
    </div>
  );

  const sessions = [...(user.scores || [])].reverse(); // most recent first
  const setScores = (user.scores || []).filter(s => s.day);
  const allSetsScores = (user.scores || []).filter(s => !s.day);
  const barData = buildAttemptScoreSeries(setScores);
  const allSetsBarData = buildAttemptScoreSeries(allSetsScores);
  const wordBreakdown = buildWordStrengthBreakdown(setScores, allWords || []);
  const allSetsWordBreakdown = buildWordStrengthBreakdown(allSetsScores, allWords || []);

  const listForTab = wordTab === "weak" ? wordBreakdown.weak : wordTab === "strong" ? wordBreakdown.strong : wordBreakdown.even;
  const badgeColor = wordTab === "weak" ? "var(--err)" : wordTab === "strong" ? "var(--ok)" : "var(--gold2)";
  const allSetsListForTab = allSetsWordTab === "weak" ? allSetsWordBreakdown.weak : allSetsWordTab === "strong" ? allSetsWordBreakdown.strong : allSetsWordBreakdown.even;
  const allSetsBadgeColor = allSetsWordTab === "weak" ? "var(--err)" : allSetsWordTab === "strong" ? "var(--ok)" : "var(--gold2)";

  return (
    <div className="page pmd">
      <div className="lbl">Quiz History</div>
      <h2>Your Past Attempts</h2>
      <p className="sub" style={{ marginBottom: 26 }}>{sessions.length} session{sessions.length !== 1 ? "s" : ""} recorded. Click any attempt to see exactly which words you got right or wrong.</p>

      {sessions.length > 0 && (
        <>
          <div className="chart-row">
            <div className="card chart-col">
              <div className="chart-col-head"><div className="lbl" style={{ marginBottom: 0 }}>Set Quizzes — Last {barData.length} Attempts</div></div>
              <div className="chart-col-inner">
                {barData.length > 0 ? <ScoreBarChart data={barData} compact mode="score" /> : <div className="chart-empty">No set quizzes yet</div>}
              </div>
            </div>
            <div className="card chart-col">
              <div className="chart-col-head">
                <div className="lbl" style={{ marginBottom: 0 }}>All Sets Quiz — Last {allSetsBarData.length} Attempts</div>
              </div>
              <div className="chart-col-inner">
                {allSetsBarData.length > 0 ? <ScoreBarChart data={allSetsBarData} compact mode="score" /> : <div className="chart-empty">No All Sets Quiz attempts yet</div>}
              </div>
              {allSetsBarData.length > 0 && (() => {
                const totalUnlockedWords = getUnlockedWords(user.enrolledAt, user.dayProgress).length;
                const timeAvailable = Math.round(totalUnlockedWords * 1.5);
                return (
                  <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--muted)", marginTop: 8, justifyContent: "center", flexWrap: "wrap" }}>
                    <span>📚 <strong style={{ color: "var(--gold2)" }}>{totalUnlockedWords}</strong> total words</span>
                    <span>⏱ <strong style={{ color: "var(--cyan2)" }}>{timeAvailable}s</strong> time available</span>
                  </div>
                );
              })()}
            </div>
          </div>

          {(wordBreakdown.totalTracked > 0 || allSetsWordBreakdown.totalTracked > 0) && (
            <div className="chart-row" style={{ marginBottom: 16 }}>
              {wordBreakdown.totalTracked > 0 && (
                <div className="card chart-col">
                  <div className="chart-col-head"><div className="lbl" style={{ marginBottom: 0 }}>Set Quizzes — Word Strength</div></div>
                  <div className="chart-col-inner">
                    <WordStrengthPieChart strong={wordBreakdown.strong.length} weak={wordBreakdown.weak.length} even={wordBreakdown.even.length} compact />
                  </div>
                </div>
              )}
              {allSetsWordBreakdown.totalTracked > 0 && (
                <div className="card chart-col">
                  <div className="chart-col-head"><div className="lbl" style={{ marginBottom: 0 }}>All Sets Quiz — Word Strength</div></div>
                  <div className="chart-col-inner">
                    <WordStrengthPieChart strong={allSetsWordBreakdown.strong.length} weak={allSetsWordBreakdown.weak.length} even={allSetsWordBreakdown.even.length} compact />
                  </div>
                </div>
              )}
            </div>
          )}

          {wordBreakdown.totalTracked > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="lbl" style={{ marginBottom: 14 }}>Word Strength Breakdown (Set Quizzes)</div>

              <div className="tabs" style={{ marginTop: 0, marginBottom: 14 }}>
                <button className={`tab ${wordTab === "weak" ? "on" : ""}`} onClick={() => { setWordTab("weak"); setExpandedHistWord(null); }}>
                  Weak ({wordBreakdown.weak.length})
                </button>
                <button className={`tab ${wordTab === "strong" ? "on" : ""}`} onClick={() => { setWordTab("strong"); setExpandedHistWord(null); }}>
                  Strong ({wordBreakdown.strong.length})
                </button>
                <button className={`tab ${wordTab === "even" ? "on" : ""}`} onClick={() => { setWordTab("even"); setExpandedHistWord(null); }}>
                  Mixed ({wordBreakdown.even.length})
                </button>
              </div>

              {listForTab.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "16px 0" }}>
                  No words in this category yet.
                </div>
              ) : (
                <div className="wlist">
                  {listForTab.map((w, i) => {
                    const isOpen = expandedHistWord === `${wordTab}-${i}`;
                    const badge = (
                      <span style={{ fontSize: 11, color: badgeColor, fontWeight: 600, border: `1px solid ${badgeColor}`, borderRadius: 10, padding: "2px 10px", whiteSpace: "nowrap", display: "inline-block", minWidth: 80, textAlign: "center" }}>
                        {w.correct}✓ / {w.wrong}✗
                      </span>
                    );
                    return (
                      <WordDetailCard
                        key={i}
                        word={w}
                        isOpen={isOpen}
                        onToggle={() => setExpandedHistWord(isOpen ? null : `${wordTab}-${i}`)}
                        badge={badge}
                      />
                    );
                  })}
                </div>
              )}

              {wordBreakdown.weak.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
                  See combined weak word practice below ↓
                </div>
              )}
            </div>
          )}

          {allSetsWordBreakdown.totalTracked > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="lbl" style={{ marginBottom: 14 }}>Word Strength Breakdown (All Sets Quiz)</div>

              <div className="tabs" style={{ marginTop: 0, marginBottom: 14 }}>
                <button className={`tab ${allSetsWordTab === "weak" ? "on" : ""}`} onClick={() => { setAllSetsWordTab("weak"); setExpandedAllSetsHistWord(null); }}>
                  Weak ({allSetsWordBreakdown.weak.length})
                </button>
                <button className={`tab ${allSetsWordTab === "strong" ? "on" : ""}`} onClick={() => { setAllSetsWordTab("strong"); setExpandedAllSetsHistWord(null); }}>
                  Strong ({allSetsWordBreakdown.strong.length})
                </button>
                <button className={`tab ${allSetsWordTab === "even" ? "on" : ""}`} onClick={() => { setAllSetsWordTab("even"); setExpandedAllSetsHistWord(null); }}>
                  Mixed ({allSetsWordBreakdown.even.length})
                </button>
              </div>

              {allSetsListForTab.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "16px 0" }}>
                  No words in this category yet.
                </div>
              ) : (
                <div className="wlist">
                  {allSetsListForTab.map((w, i) => {
                    const isOpen = expandedAllSetsHistWord === `${allSetsWordTab}-${i}`;
                    const badge = (
                      <span style={{ fontSize: 11, color: allSetsBadgeColor, fontWeight: 600, border: `1px solid ${allSetsBadgeColor}`, borderRadius: 10, padding: "2px 10px", whiteSpace: "nowrap", display: "inline-block", minWidth: 80, textAlign: "center" }}>
                        {w.correct}✓ / {w.wrong}✗
                      </span>
                    );
                    return (
                      <WordDetailCard
                        key={i}
                        word={w}
                        isOpen={isOpen}
                        onToggle={() => setExpandedAllSetsHistWord(isOpen ? null : `${allSetsWordTab}-${i}`)}
                        badge={badge}
                      />
                    );
                  })}
                </div>
              )}

              {allSetsWordBreakdown.weak.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
                  See combined weak word practice below ↓
                </div>
              )}
            </div>
          )}
          {/* ── COMBINED WEAK WORD PRACTICE ─────────────────────────── */}
          {(wordBreakdown.weak.length > 0 || allSetsWordBreakdown.weak.length > 0) && (() => {
            // Deduplicate weak words from both sections by arabic key
            const seenArabic = new Set();
            const combinedWeak = [
              ...wordBreakdown.weak,
              ...allSetsWordBreakdown.weak,
            ].filter(w => {
              if (seenArabic.has(w.arabic)) return false;
              seenArabic.add(w.arabic);
              return true;
            });
            const { masteredSet } = buildStrictMastery(user?.scores || []);
            return (
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div className="lbl" style={{ marginBottom: 0 }}>Weak Words Practice</div>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{combinedWeak.length} word{combinedWeak.length !== 1 ? "s" : ""} to review</span>
                </div>
                <div className="set-mastery-banner" style={{ marginBottom: 14 }}>
                  📝 These are words you've answered incorrectly more than correctly across Set and All Sets quizzes. Review them below, then take a focused quiz.
                </div>
                <div className="wlist" style={{ marginBottom: 16 }}>
                  {combinedWeak.map((w, i) => {
                    const isOpen = expandedWeakWord === `weak-${i}`;
                    const isMastered = masteredSet.has(w.arabic);
                    const badge = (
                      <span style={{ fontSize: 11, color: "var(--err)", fontWeight: 600, border: "1px solid var(--err)", borderRadius: 10, padding: "2px 10px", whiteSpace: "nowrap", display: "inline-block", minWidth: 80, textAlign: "center" }}>
                        {w.correct}✓ / {w.wrong}✗
                      </span>
                    );
                    return (
                      <WordDetailCard
                        key={i}
                        word={w}
                        isOpen={isOpen}
                        onToggle={() => setExpandedWeakWord(isOpen ? null : `weak-${i}`)}
                        badge={badge}
                        highlight={!isMastered}
                      />
                    );
                  })}
                </div>
                <div style={{ textAlign: "center" }}>
                  <button className="btn bg" onClick={() => onStart(null, combinedWeak)}>
                    📚 Quiz Weak Words ({Math.min(10, combinedWeak.length)} questions)
                  </button>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {sessions.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 44, color: "var(--muted)" }}>
          No quiz attempts yet. Go to <strong style={{ color: "var(--gold2)", cursor: "pointer", textDecoration: "underline" }} onClick={() => setView("learn")}>Learn</strong> and take your first quiz!
        </div>
      ) : (
        <div className="card">
          {sessions.map((s, i) => (
            <div key={i} className="hist-row" onClick={() => onReview(s)} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: 12 }}>
              <div className="hist-info">
                <div className="hist-title">{s.day ? `Set ${s.day}` : "All Sets Quiz"}</div>
                <div className="hist-date">{new Date(s.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} at {new Date(s.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>{s.score}/{s.total}</div>
              <div className="hist-pct" style={{ color: s.pct >= 70 ? "var(--ok)" : s.pct >= 50 ? "var(--gold2)" : "var(--err)", fontSize: 16, fontWeight: 700, minWidth: 48, textAlign: "right" }}>{s.pct}%</div>
              <div className="hist-arrow">→</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewPage({ rec, setView, allWords }) {
  const [expandedReviewWord, setExpandedReviewWord] = useState(null);
  const detail = rec.detail || [];
  const correctCount = detail.filter(d => d.isCorrect).length;

  return (
    <div className="page pmd">
      <div className="lbl">Answer Breakdown</div>
      <h2>{rec.day ? `Set ${rec.day} Review` : "Quiz Review"}</h2>
      <p className="sub" style={{ marginBottom: 22 }}>
        {new Date(rec.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} ·
        Scored {rec.pct}% ({rec.score}/{rec.total})
      </p>

      {detail.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 36, color: "var(--muted)" }}>
          Detailed breakdown isn't available for this older session — only the overall score was saved.
          New quiz attempts will include full per-question detail.
        </div>
      ) : (
        <div className="card">
          <div className="wlist">
            {detail.map((d, i) => {
              const isOpen = expandedReviewWord === i;
              const full = (allWords || []).find(w => w.arabic === d.arabic) || {};
              const word = { ...full, arabic: d.arabic, english: d.english, translit: d.translit };
              const badge = (
                <span style={{
                  fontSize: 10, padding: "2px 7px", borderRadius: 8, whiteSpace: "nowrap",
                  color: d.isCorrect ? "var(--ok)" : "var(--err)",
                  border: `1px solid ${d.isCorrect ? "var(--ok)" : "var(--err)"}`,
                }}>
                  {d.isCorrect ? "✓ Correct" : "✗ Wrong"}
                </span>
              );
              return (
                <div key={i}>
                  <WordDetailCard
                    word={word}
                    isOpen={isOpen}
                    onToggle={() => setExpandedReviewWord(isOpen ? null : i)}
                    badge={badge}
                  />
                  {!d.isCorrect && (
                    <div className="review-answer-note">
                      <span style={{ color: "var(--err)" }}>You chose: {d.chosen}</span>
                      <span style={{ color: "var(--ok)", marginLeft: 12 }}>Correct: {d.correctAnswer}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 9, justifyContent: "center", marginTop: 22, flexWrap: "wrap" }}>
        <button className="btn bg" onClick={() => setView("history")}>← Back to History</button>
        <button className="btn bh" onClick={() => setView("learn")}>Go to Learn</button>
      </div>
    </div>
  );
}

function LBPage({ participants, user }) {
  const ranked = [...participants].filter(p => p.scores?.length > 0)
    .map(p => ({ ...p, best: Math.max(...p.scores.map(s => s.pct)), sessions: p.scores.length }))
    .sort((a, b) => b.best - a.best || b.sessions - a.sessions);
  const userKey = user ? (user.userId || user.email) : null;
  return (
    <div className="page pmd">
      <div className="lbl">Leaderboard</div>
      <h2>Top Learners</h2>
      <p className="sub" style={{ marginBottom: 26 }}>Ranked by best quiz score</p>
      {ranked.length === 0
        ? <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: 44 }}>No scores yet — complete a quiz to appear here!</div>
        : <div className="card">
          {ranked.map((p, i) => {
            const pKey = p.userId || p.email;
            const isYou = userKey && pKey === userKey;
            return (
              <div className="lbrow" key={pKey} style={isYou ? { background: "rgba(0,200,230,.06)", borderRadius: 7 } : {}}>
                <div className={`lbrank ${i < 3 ? "top" : ""}`}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</div>
                <div className="lbinfo">
                  <div className="lbname">{p.userId || p.name} {isYou && <span style={{ color: "var(--teal2)", fontSize: 11 }}>(you)</span>}</div>
                  <div className="lbmeta">{p.sessions} sessions · {Object.keys(p.dayProgress || {}).filter(k => k !== "free").length} sets done</div>
                </div>
                <div className="lbsc">{p.best}%</div>
                <div className="lbbadge">{calcStreak(p.scores) > 0 ? `🔥${calcStreak(p.scores)}` : "—"}</div>
              </div>
            );
          })}
        </div>}
    </div>
  );
}

// ─── Admin Password Gate ──────────────────────────────────────────────────────
function AdminGate({ onUnlock }) {
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!password) return;
    setChecking(true);
    setError("");
    const hash = await hashPassword(password);
    setChecking(false);
    if (hash === getActiveAdminPasswordHash()) {
      onUnlock();
    } else {
      setError("Incorrect password.");
      setPassword("");
    }
  };

  return (
    <div className="page psm" style={{ paddingTop: 80 }}>
      <div className="lbl" style={{ justifyContent: "center" }}>Restricted Area</div>
      <h2 style={{ textAlign: "center" }}>Admin Access</h2>
      <p className="sub" style={{ textAlign: "center", marginBottom: 26 }}>This area is for administrators only.</p>
      <div className="card">
        <div className="field">
          <label>Admin Password</label>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="Enter admin password"
            autoFocus
          />
        </div>
        {error && <div className="enroll-error">⚠ {error}</div>}
        <button className="btn bg bfw" onClick={submit} disabled={!password || checking}>
          {checking ? "Checking…" : "Unlock →"}
        </button>
      </div>
    </div>
  );
}

// ─── Finance Gate — separate, restricted-scope password (receipts only) ──────
function FinanceGate({ onUnlock }) {
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!password) return;
    setChecking(true);
    setError("");
    const hash = await hashPassword(password);
    setChecking(false);
    if (hash === getActiveFinancePasswordHash()) {
      onUnlock();
    } else {
      setError("Incorrect password.");
      setPassword("");
    }
  };

  return (
    <div className="page psm" style={{ paddingTop: 80 }}>
      <div className="lbl" style={{ justifyContent: "center" }}>Restricted Area</div>
      <h2 style={{ textAlign: "center" }}>Finance Team Access</h2>
      <p className="sub" style={{ textAlign: "center", marginBottom: 26 }}>This area is for the finance team only — issue donation receipts here.</p>
      <div className="card">
        <div className="field">
          <label>Finance Password</label>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="Enter finance password"
            autoFocus
          />
        </div>
        {error && <div className="enroll-error">⚠ {error}</div>}
        <button className="btn bg bfw" onClick={submit} disabled={!password || checking}>
          {checking ? "Checking…" : "Unlock →"}
        </button>
      </div>
    </div>
  );
}

// ─── Generic Change Password modal — used by both Admin and Finance ──────────
// profile dropdowns. Which password it checks/changes is determined by the
// getCurrentHash/storageKey/label props passed in, not hardcoded, so one
// component serves both roles without duplicating the logic.
function ChangePasswordModal({ label, getCurrentHash, storageKey, onClose, toast_ }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    setError("");
    if (!currentPw || !newPw || !confirmPw) { setError("All fields are required."); return; }
    const complexityError = getPasswordComplexityError(newPw);
    if (complexityError) { setError(complexityError); return; }
    if (newPw !== confirmPw) { setError("New password and confirmation don't match."); return; }

    setChecking(true);
    const currentHash = await hashPassword(currentPw);
    if (currentHash !== getCurrentHash()) {
      setChecking(false);
      setError("Current password is incorrect.");
      return;
    }
    const newHash = await hashPassword(newPw);
    storageSet(storageKey, newHash);
    setChecking(false);
    toast_(`${label} password updated successfully!`);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-head">
          <h3>{label} — Change Password</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field"><label>Current Password</label><input type="password" value={currentPw} onChange={e => { setCurrentPw(e.target.value); setError(""); }} placeholder="Enter current password" autoFocus /></div>
          <div className="field"><label>New Password</label><input type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setError(""); }} placeholder="Min 10 chars, 1 number, 1 special char" /></div>
          <div className="field"><label>Confirm New Password</label><input type="password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setError(""); }} placeholder="Re-enter new password" /></div>
          {error && <div className="enroll-error">⚠ {error}</div>}
          <button className="btn bg bfw" onClick={submit} disabled={checking}>
            {checking ? "Updating…" : "Update Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared Receipt Manager — used inside Admin's Receipts tab AND the ───────
// standalone Finance Panel, so both stay in sync with one implementation
// instead of two copies to maintain separately.
function ReceiptManager({ receipts, onIssueReceipt, toast_ }) {
  const [rcptName, setRcptName] = useState("");
  const [rcptEmail, setRcptEmail] = useState("");
  const [rcptAmount, setRcptAmount] = useState("");
  const [rcptDate, setRcptDate] = useState(new Date().toISOString().slice(0, 10));
  const [rcptPurpose, setRcptPurpose] = useState("Donation");
  const [rcptNote, setRcptNote] = useState("");
  const [rcptError, setRcptError] = useState("");
  const [rcptSending, setRcptSending] = useState(false);
  const [rcptSuccess, setRcptSuccess] = useState(null);

  const submitReceipt = async () => {
    setRcptError("");
    if (!rcptName.trim() || !rcptEmail.trim() || !rcptAmount || !rcptDate) {
      setRcptError("Donor name, email, amount, and date are all required.");
      return;
    }
    if (isNaN(Number(rcptAmount)) || Number(rcptAmount) <= 0) {
      setRcptError("Enter a valid amount.");
      return;
    }
    setRcptSending(true);
    const result = await onIssueReceipt({
      donorName: rcptName.trim(),
      donorEmail: rcptEmail.trim(),
      amount: Number(rcptAmount),
      donationDate: rcptDate,
      purpose: rcptPurpose.trim() || "Donation",
      note: rcptNote.trim(),
    });
    setRcptSending(false);
    if (result.ok) {
      setRcptSuccess({ receiptNo: result.receiptNo, emailFailed: result.emailFailed });
      setRcptName(""); setRcptEmail(""); setRcptAmount(""); setRcptNote("");
      setRcptDate(new Date().toISOString().slice(0, 10));
      setRcptPurpose("Donation");
    } else {
      setRcptError("Could not issue receipt. Please try again.");
    }
  };

  return (
    <>
      <div className="card" style={{ maxWidth: 480, marginBottom: 16 }}>
        <div className="lbl">Issue Donation Receipt</div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
          Only issue this after the finance team confirms the payment was actually received. This is a bookkeeping record, not an automated payment verification — the app has no way to independently confirm a UPI transfer occurred.
        </p>
        <div className="field"><label>Donor Name</label><input value={rcptName} onChange={e => { setRcptName(e.target.value); setRcptError(""); }} placeholder="Full name" /></div>
        <div className="field"><label>Donor Email</label><input type="email" value={rcptEmail} onChange={e => { setRcptEmail(e.target.value); setRcptError(""); }} placeholder="donor@email.com" /></div>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="field" style={{ flex: 1 }}><label>Amount (₹)</label><input type="number" value={rcptAmount} onChange={e => { setRcptAmount(e.target.value); setRcptError(""); }} placeholder="1000" /></div>
          <div className="field" style={{ flex: 1 }}><label>Date Received</label><input type="date" value={rcptDate} onChange={e => setRcptDate(e.target.value)} /></div>
        </div>
        <div className="field"><label>Purpose</label><input value={rcptPurpose} onChange={e => setRcptPurpose(e.target.value)} placeholder="Donation" /></div>
        <div className="field"><label>Note (optional)</label><input value={rcptNote} onChange={e => setRcptNote(e.target.value)} placeholder="Any additional note for the donor" /></div>
        {rcptError && <div className="enroll-error">⚠ {rcptError}</div>}
        <button className="btn bg bfw" onClick={submitReceipt} disabled={rcptSending}>
          {rcptSending ? "Issuing…" : "Issue & Email Receipt"}
        </button>
        {rcptSuccess && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 7, background: "rgba(74,158,92,.08)", border: "1px solid rgba(74,158,92,.25)" }}>
            <div style={{ fontSize: 13, color: "var(--ok)" }}>✅ Receipt {rcptSuccess.receiptNo} issued.</div>
            {rcptSuccess.emailFailed && <div style={{ fontSize: 12, color: "var(--err)", marginTop: 4 }}>⚠ Email failed to send — check EmailJS connection and resend manually if needed.</div>}
          </div>
        )}
      </div>

      <div className="card">
        <div className="lbl">Receipt Log</div>
        {receipts.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No receipts issued yet.</div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Receipt #</th><th>Donor</th><th>Amount</th><th>Date</th><th>Issued</th></tr></thead>
            <tbody>
              {receipts.map(r => (
                <tr key={r.id}>
                  <td style={{ color: "var(--gold3)", fontFamily: "monospace" }}>{r.receiptNo}</td>
                  <td>{r.donorName}<br/><span style={{ color: "var(--muted)", fontSize: 11 }}>{r.donorEmail}</span></td>
                  <td style={{ color: "var(--ok)" }}>₹{r.amount}</td>
                  <td>{new Date(r.donationDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td style={{ color: "var(--muted)", fontSize: 11 }}>{new Date(r.issuedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ─── Finance Panel — restricted to receipt issuing only, nothing else ────────
function FinancePage({ receipts, onIssueReceipt, toast_ }) {
  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <div className="lbl" style={{ marginBottom: 4 }}>Finance Panel</div>
        <h2 style={{ fontSize: 20 }}>Donation Receipts</h2>
      </div>
      <ReceiptManager receipts={receipts} onIssueReceipt={onIssueReceipt} toast_={toast_} />
    </div>
  );
}

function AdminPage({ customWords, saveWords, participants, toast_, onSendResetLink, messages, onMarkRead, onMarkResolved, onUpdateParticipant, onDeleteParticipant, onResendVerification, onResetAllTestData }) {
  const [resetTarget, setResetTarget] = useState(null); // userId being reset, or null
  const [resetMessageId, setResetMessageId] = useState(null); // linked message, if reset was triggered from Messages tab
  const [resetSending, setResetSending] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // userId being edited, or null
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editError, setEditError] = useState("");
  const [editChecking, setEditChecking] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);
  const [tab, setTab] = useState("words");
  const [arabic, setArabic] = useState(""), [translit, setTranslit] = useState(""), [english, setEnglish] = useState("");
  const [urdu, setUrdu] = useState(""), [root, setRootField] = useState(""), [rootEnglish, setRootEnglish] = useState(""), [rootUrdu, setRootUrdu] = useState("");
  const [ayahRef, setAyahRef] = useState("");
  const allWords = [...WORD_BANK, ...customWords];

  const submitReset = async () => {
    setResetError("");
    setResetSending(true);
    const result = await onSendResetLink(resetTarget, resetMessageId);
    setResetSending(false);
    if (result.ok) {
      setResetSent(true);
      toast_(`Reset link emailed to ${resetTarget}.`);
    } else if (result.reason === "no-email") {
      setResetError("This learner has no registered email on file — can't send a link.");
    } else if (result.reason === "send-failed") {
      setResetError("Email failed to send. Check the EmailJS/Titan connection and try again.");
    } else {
      setResetError("Could not find that user.");
    }
  };

  const closeReset = () => { setResetTarget(null); setResetMessageId(null); setResetError(""); setResetSent(false); };

  const openEdit = (p) => {
    setEditTarget(p.userId);
    setEditName(p.name);
    setEditEmail(p.email);
    setEditError("");
  };
  const closeEdit = () => { setEditTarget(null); setEditError(""); };

  const submitEdit = async () => {
    setEditError("");
    if (!editName.trim() || !editEmail.trim()) { setEditError("Name and email are required."); return; }
    setEditChecking(true);
    const result = await onUpdateParticipant(editTarget, editName, editEmail);
    setEditChecking(false);
    if (result.ok) {
      toast_(`Account updated for ${editTarget}.`);
      closeEdit();
    } else if (result.reason === "disposable") {
      setEditError("That email looks like a disposable/temporary address — please use a real one.");
    } else if (result.reason === "no-mx") {
      setEditError("That email domain doesn't appear to exist. Double-check for a typo.");
    } else {
      setEditError("Couldn't save — please check the details and try again.");
    }
  };

  const submitDelete = () => {
    onDeleteParticipant(deleteConfirmTarget);
    toast_(`Account ${deleteConfirmTarget} deleted.`);
    setDeleteConfirmTarget(null);
  };

  const handleResendVerify = async (userId) => {
    const result = await onResendVerification(userId);
    toast_(result.ok ? `Verification email resent to ${userId}.` : "Failed to resend — check EmailJS connection.");
  };

  const add = () => {
    if (!arabic || !english) { toast_("Arabic and English required"); return; }
    saveWords([...customWords, {
      arabic: arabic.trim(), translit: translit.trim(), english: english.trim(),
      urdu: urdu.trim() || "—",
      root: root.trim() || "—", rootEnglish: rootEnglish.trim() || "—", rootUrdu: rootUrdu.trim() || "—",
      ayahRef: ayahRef.trim() || "",
      addedAt: new Date().toISOString(),
    }]);
    setArabic(""); setTranslit(""); setEnglish(""); setUrdu(""); setRootField(""); setRootEnglish(""); setRootUrdu(""); setAyahRef("");
    toast_("Word added!");
  };

  return (
    <div className="page">
      <div className="lbl" style={{ marginBottom: 16 }}>Administration</div>
      <div className="tabs">
        <button className={`tab ${tab === "words" ? "on" : ""}`} onClick={() => setTab("words")}>All Words ({allWords.length})</button>
        <button className={`tab ${tab === "add" ? "on" : ""}`} onClick={() => setTab("add")}>Add Word</button>
        <button className={`tab ${tab === "parts" ? "on" : ""}`} onClick={() => setTab("parts")}>Participants ({participants.length})</button>
        <button className={`tab ${tab === "messages" ? "on" : ""}`} onClick={() => setTab("messages")}>
          ✉ Messages {messages.filter(m => !m.resolved).length > 0 && <span className="tab-badge">{messages.filter(m => !m.resolved).length}</span>}
        </button>
        <button className={`tab ${tab === "settings" ? "on" : ""}`} onClick={() => setTab("settings")}>⚙ Settings</button>
      </div>
      {tab === "words" && (
        <div className="card">
          <div style={{ maxHeight: 460, overflowY: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Arabic</th><th>Transliteration</th><th>English</th><th>Urdu</th><th>Root</th><th></th></tr></thead>
              <tbody>{allWords.map((w, i) => {
                const isCust = customWords.includes(w);
                return <tr key={i}>
                  <td><span className="arabic" style={{ fontSize: 22 }}>{w.arabic}</span></td>
                  <td style={{ color: "var(--muted)", fontStyle: "italic" }}>{w.translit}</td>
                  <td>{w.english}</td>
                  <td><span className="arabic" style={{ fontSize: 15, color: "var(--teal2)" }}>{w.urdu || "—"}</span></td>
                  <td><span className="arabic" style={{ fontSize: 13, color: "var(--teal2)" }}>{w.root}</span></td>
                  <td>{isCust ? <button className="del" onClick={() => saveWords(customWords.filter(x => x !== w))}>✕</button> : <span style={{ fontSize: 10, color: "var(--muted)" }}>built-in</span>}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </div>
      )}
      {tab === "add" && (
        <div className="card" style={{ maxWidth: 480 }}>
          <div className="field"><label>Arabic Word *</label><input value={arabic} onChange={e => setArabic(e.target.value)} placeholder="e.g. مَسْجِدٌ" style={{ direction: "rtl", fontSize: 22, fontFamily: "'Scheherazade New','Amiri',serif" }} /></div>
          <div className="field"><label>Transliteration</label><input value={translit} onChange={e => setTranslit(e.target.value)} placeholder="e.g. Masjid" /></div>
          <div className="field"><label>English Meaning *</label><input value={english} onChange={e => setEnglish(e.target.value)} placeholder="e.g. Mosque" /></div>
          <div className="field"><label>Urdu Meaning</label><input value={urdu} onChange={e => setUrdu(e.target.value)} placeholder="e.g. مسجد" style={{ direction: "rtl", fontFamily: "'Scheherazade New',serif", fontSize: 17 }} /></div>
          <div className="field"><label>Root Letters</label><input value={root} onChange={e => setRootField(e.target.value)} placeholder="e.g. سجد" style={{ direction: "rtl", fontFamily: "'Scheherazade New',serif" }} /></div>
          <div className="field"><label>Root Meaning (English)</label><input value={rootEnglish} onChange={e => setRootEnglish(e.target.value)} placeholder="e.g. to prostrate" /></div>
          <div className="field"><label>Root Meaning (Urdu)</label><input value={rootUrdu} onChange={e => setRootUrdu(e.target.value)} placeholder="e.g. سجدہ کرنا" style={{ direction: "rtl", fontFamily: "'Scheherazade New',serif", fontSize: 15 }} /></div>
          <div className="field"><label>Qur'an Reference (optional)</label><input value={ayahRef} onChange={e => setAyahRef(e.target.value)} placeholder="e.g. Surah Al-Baqarah 2:144" /></div>
          <button className="btn bg" onClick={add}>Add Word</button>
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 11 }}>Custom words unlock day-by-day after the built-in words.</p>
        </div>
      )}
      {tab === "parts" && (
        <div className="card">
          {participants.length === 0 ? <div style={{ textAlign: "center", color: "var(--muted)", padding: 36 }}>No participants yet.</div>
            : <table className="tbl">
              <thead><tr><th>Name</th><th>User ID</th><th>Email</th><th>Status</th><th>Set</th><th>Sessions</th><th>Best</th><th></th></tr></thead>
              <tbody>{participants.map(p => {
                const isUnverified = p.emailVerified === false;
                return (
                <tr key={p.userId || p.email}>
                  <td>{p.name}</td>
                  <td style={{ color: p.userId ? "var(--gold3)" : "var(--muted)" }}>{p.userId || <span style={{ fontStyle: "italic", fontSize: 11 }}>legacy — not upgraded</span>}</td>
                  <td style={{ color: "var(--muted)" }}>{p.email}</td>
                  <td>
                    {isUnverified
                      ? <span style={{ fontSize: 10, color: "var(--err)", border: "1px solid var(--err)", borderRadius: 8, padding: "2px 7px", whiteSpace: "nowrap" }}>⚠ Unverified</span>
                      : <span style={{ fontSize: 10, color: "var(--ok)", border: "1px solid var(--ok)", borderRadius: 8, padding: "2px 7px", whiteSpace: "nowrap" }}>✓ Verified</span>}
                  </td>
                  <td style={{ color: "var(--gold2)" }}>{getUnlockedDays(p.enrolledAt, p.dayProgress)}</td>
                  <td>{p.scores?.length || 0}</td>
                  <td style={{ color: "var(--ok)" }}>{p.scores?.length ? `${Math.max(...p.scores.map(s => s.pct))}%` : "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {p.userId && !isUnverified && (
                        <button className="del" style={{ fontSize: 11 }} onClick={() => { setResetTarget(p.userId); setResetMessageId(null); setResetError(""); setResetSent(false); }}>🔑 Reset</button>
                      )}
                      {p.userId && isUnverified && (
                        <button className="del" style={{ fontSize: 11 }} onClick={() => handleResendVerify(p.userId)}>📧 Resend Verify</button>
                      )}
                      {p.userId && (
                        <button className="del" style={{ fontSize: 11 }} onClick={() => openEdit(p)}>✏ Edit</button>
                      )}
                      {p.userId && (
                        <button className="del" style={{ fontSize: 11, color: "var(--err)" }} onClick={() => setDeleteConfirmTarget(p.userId)}>🗑 Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}</tbody>
            </table>}
        </div>
      )}
      {tab === "messages" && (
        <div className="card">
          {messages.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>No messages yet. Password reset requests from learners will appear here.</div>
          ) : (
            <div className="msg-list">
              {messages.map(m => {
                const accountUnknown = m.learnerName?.startsWith("(unknown");
                const isAck = m.type === "password_reset_completed";
                return (
                <div key={m.id} className={`msg-item ${m.resolved ? "resolved" : !m.read ? "unread" : ""}`} onClick={() => !m.read && onMarkRead(m.id)}>
                  <div className="msg-icon">{isAck ? "✅" : m.resolved ? "✅" : accountUnknown ? "⚠️" : "🔑"}</div>
                  <div className="msg-body">
                    <div className="msg-title">
                      {isAck ? "Reset completed" : "Password reset request"} — <strong>{m.userId}</strong>
                      {!m.resolved && !m.read && <span className="msg-new-dot" />}
                    </div>
                    {accountUnknown ? (
                      <div className="msg-sub" style={{ color: "var(--err)" }}>⚠ No account found with this User ID — likely a typo. {m.note ? `Note: ${m.note}` : ""}</div>
                    ) : isAck ? (
                      <div className="msg-sub" style={{ color: "var(--ok)" }}>{m.learnerName} successfully set their new password.</div>
                    ) : (
                      <div className="msg-sub">{m.learnerName}{m.note ? ` · ${m.note}` : ""}</div>
                    )}
                    <div className="msg-date">{new Date(m.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                  <div className="msg-actions">
                    {!m.resolved && !accountUnknown && !isAck && (
                      <>
                        <button className="btn bg bsm" onClick={(e) => { e.stopPropagation(); setResetTarget(m.userId); setResetMessageId(m.id); setResetError(""); setResetSent(false); }}>Send Reset Link</button>
                        <button className="btn bh bsm" onClick={(e) => { e.stopPropagation(); onMarkResolved(m.id); }}>Mark Resolved</button>
                      </>
                    )}
                    {!m.resolved && accountUnknown && (
                      <button className="btn bh bsm" onClick={(e) => { e.stopPropagation(); onMarkResolved(m.id); }}>Dismiss (No Account)</button>
                    )}
                    {(m.resolved || isAck) && <span style={{ fontSize: 11, color: "var(--ok)" }}>{isAck ? "Acknowledged" : "Resolved"}</span>}
                  </div>
                </div>
              );})}
            </div>
          )}
        </div>
      )}
      {tab === "settings" && <AdminEmailSettings toast_={toast_} />}
      {tab === "settings" && <ResetTestDataPanel onResetAllTestData={onResetAllTestData} />}

      {resetTarget && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeReset(); }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-head">
              <h3>Send Reset Link — {resetTarget}</h3>
              <button className="modal-close" onClick={closeReset}>✕</button>
            </div>
            <div className="modal-body">
              {!resetSent ? (
                <>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
                    This emails a one-time link to <strong style={{ color: "var(--gold3)" }}>{resetTarget}</strong>'s registered email address. The link lets them set a new password themselves — no password is sent or typed by you. The link expires in 24 hours.
                  </p>
                  {resetError && <div className="enroll-error">⚠ {resetError}</div>}
                  <button className="btn bg bfw" onClick={submitReset} disabled={resetSending}>
                    {resetSending ? "Sending…" : "Send Reset Link →"}
                  </button>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "10px 0" }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
                  <p style={{ fontSize: 14, color: "var(--text)", marginBottom: 6 }}>Reset link sent!</p>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 18 }}>{resetTarget} will receive an email with a link to set their own new password.</p>
                  <button className="btn bh" onClick={closeReset}>Close</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h3>Edit Account — {editTarget}</h3>
              <button className="modal-close" onClick={closeEdit}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
                Use this to correct a learner's name or fix a typo'd email (e.g. a wrong domain entered at signup). Only change the email to what the learner has told you directly — the new address is re-validated before saving.
              </p>
              <div className="field"><label>Full Name</label><input value={editName} onChange={e => { setEditName(e.target.value); setEditError(""); }} placeholder="Learner's name" /></div>
              <div className="field"><label>Email Address</label><input type="email" value={editEmail} onChange={e => { setEditEmail(e.target.value); setEditError(""); }} placeholder="learner@email.com" /></div>
              {editError && <div className="enroll-error">⚠ {editError}</div>}
              <button className="btn bg bfw" onClick={submitEdit} disabled={editChecking}>
                {editChecking ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmTarget && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDeleteConfirmTarget(null); }}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-head">
              <h3>Delete Account?</h3>
              <button className="modal-close" onClick={() => setDeleteConfirmTarget(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ textAlign: "center", padding: "20px 24px" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
              <p style={{ fontSize: 14, color: "var(--text)", marginBottom: 8 }}>
                Permanently delete <strong style={{ color: "var(--err)" }}>{deleteConfirmTarget}</strong>?
              </p>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20, lineHeight: 1.6 }}>
                This removes their account, scores, and progress entirely. This cannot be undone.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button className="btn bh" onClick={() => setDeleteConfirmTarget(null)}>Cancel</button>
                <button className="btn" style={{ background: "var(--err)", color: "#fff" }} onClick={submitDelete}>Delete Permanently</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin Email Settings (one-time setup, edit requires password confirm) ────
function AdminEmailSettings({ toast_ }) {
  const [savedEmail, setSavedEmail] = useState(getAdminEmail());
  const [editing, setEditing] = useState(!savedEmail);
  const [newEmail, setNewEmail] = useState(savedEmail);
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    setError("");
    const trimmed = newEmail.trim();
    if (!trimmed || !trimmed.includes("@")) { setError("Enter a valid email address."); return; }
    // Re-confirm admin password before allowing the change, since this is
    // already inside the unlocked Admin panel.
    if (!confirmPw) { setError("Enter your admin password to confirm this change."); return; }
    setChecking(true);
    const hash = await hashPassword(confirmPw);
    setChecking(false);
    if (hash !== getActiveAdminPasswordHash()) { setError("Incorrect admin password."); return; }

    setAdminEmail(trimmed);
    setSavedEmail(trimmed);
    setEditing(false);
    setConfirmPw("");
    toast_("Admin notification email saved.");
  };

  return (
    <div className="card" style={{ maxWidth: 440, marginTop: 16 }}>
      <div className="lbl">Admin Notification Email</div>
      {!editing ? (
        <>
          <p style={{ fontSize: 14, color: "var(--text)", marginBottom: 12 }}>
            Current email: <strong style={{ color: "var(--gold3)" }}>{savedEmail}</strong>
          </p>
          <button className="btn bh bsm" onClick={() => { setEditing(true); setNewEmail(savedEmail); setError(""); }}>Change Email</button>
        </>
      ) : (
        <>
          <div className="field"><label>Email Address</label><input type="email" value={newEmail} onChange={e => { setNewEmail(e.target.value); setError(""); }} placeholder="admin@example.com" /></div>
          <div className="field"><label>Confirm Admin Password</label><input type="password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setError(""); }} placeholder="Required to save changes" /></div>
          {error && <div className="enroll-error">⚠ {error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn bg" onClick={submit} disabled={checking}>{checking ? "Saving…" : "Save Email"}</button>
            {savedEmail && <button className="btn bh" onClick={() => { setEditing(false); setError(""); }}>Cancel</button>}
          </div>
        </>
      )}
      <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 12, lineHeight: 1.6 }}>
        This is a record-keeping address — password reset and verification emails to learners are already sent automatically via EmailJS. This address is just where you, as admin, can be reached if that's wired up separately later.
      </p>
    </div>
  );
}

// ─── Reset All Test Data (pre-launch cleanup) ─────────────────────────────────
// Destructive, irreversible action — wipes every participant, score, message,
// and token accumulated during QA. Requires typing a literal confirmation
// phrase (not just a click) given how severe and unrecoverable this is.
function ResetTestDataPanel({ onResetAllTestData }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const CONFIRM_PHRASE = "DELETE ALL TEST DATA";

  const close = () => { setOpen(false); setConfirmText(""); };

  return (
    <div className="card" style={{ maxWidth: 440, marginTop: 16, borderColor: "rgba(192,80,74,.3)" }}>
      <div className="lbl" style={{ color: "var(--err)" }}>⚠ Danger Zone</div>
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14, lineHeight: 1.6 }}>
        Permanently erases <strong style={{ color: "var(--text)" }}>every participant, score, day progress, message, and reset/verification link</strong> created so far. Use this once, right before going live, to start with a clean slate. The admin password also reverts to the default and must be set again.
      </p>
      {!open ? (
        <button className="btn" style={{ background: "var(--err)", color: "#fff" }} onClick={() => setOpen(true)}>
          🧹 Reset All Test Data
        </button>
      ) : (
        <div style={{ background: "rgba(192,80,74,.06)", border: "1px solid rgba(192,80,74,.25)", borderRadius: 8, padding: "14px 16px" }}>
          <p style={{ fontSize: 13, color: "var(--text)", marginBottom: 10, lineHeight: 1.6 }}>
            This cannot be undone. Type <strong style={{ color: "var(--err)", fontFamily: "monospace" }}>{CONFIRM_PHRASE}</strong> below to confirm.
          </p>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            style={{ width: "100%", background: "var(--s2)", border: "1px solid rgba(192,80,74,.3)", color: "var(--text)", padding: "9px 13px", borderRadius: 7, fontFamily: "monospace", fontSize: 13, marginBottom: 12, outline: "none" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{ background: "var(--err)", color: "#fff" }}
              disabled={confirmText !== CONFIRM_PHRASE}
              onClick={onResetAllTestData}
            >
              Permanently Delete Everything
            </button>
            <button className="btn bh" onClick={close}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Donate Modal ─────────────────────────────────────────────────────────────
function DonateModal({ onClose, toast_, user }) {
  const [frequency, setFrequency] = useState("once"); // once | monthly | yearly

  const copy = (text, label) => {
    navigator.clipboard.writeText(text).then(() => toast_(`${label} copied!`)).catch(() => toast_("Copy manually from screen"));
  };

  // Generate UPI payment deep-link (works on mobile with UPI apps).
  // Note: standard UPI deep-links only support one-time payments — there's no
  // universal cross-app deep-link for recurring UPI (that needs a registered
  // UPI AutoPay/e-mandate merchant integration). For Monthly/Yearly, we guide
  // the user to set it up themselves via their banking app instead of
  // pretending a one-tap link can create a recurring payment.
  const upiLink = `upi://pay?pa=${encodeURIComponent(DONATE.upiId)}&pn=${encodeURIComponent(DONATE.charityName)}&tn=${encodeURIComponent(DONATE.purpose)}&cu=INR`;

  // Close on overlay click
  const handleOverlay = (e) => { if (e.target === e.currentTarget) onClose(); };

  return (
    <div className="modal-overlay" onClick={handleOverlay}>
      <div className="modal">
        <div className="modal-head">
          <h3>🤲 Support Quranic Education</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          <div style={{ textAlign: "center", marginBottom: 16, fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
            Your donation supports <strong style={{ color: "var(--gold2)" }}>{DONATE.charityName}</strong> — enabling free Quranic learning for all.
          </div>

          {/* ── FREQUENCY SELECTOR ── */}
          <div className="freq-row">
            <button className={`freq-pill ${frequency === "once" ? "on" : ""}`} onClick={() => setFrequency("once")}>One-time</button>
            <button className={`freq-pill ${frequency === "monthly" ? "on" : ""}`} onClick={() => setFrequency("monthly")}>Monthly</button>
            <button className={`freq-pill ${frequency === "yearly" ? "on" : ""}`} onClick={() => setFrequency("yearly")}>Yearly</button>
          </div>

          <div className="dtabs">
            <button className={`dtab on`} style={{ flex: 1 }}>📱 UPI Payment</button>
          </div>

          {/* ── UPI TAB (the only payment method — see note below on why) ── */}
          {true && (
            <div>
              {frequency === "once" ? (
              <div className="qr-box">
                {/* QR Placeholder — replace the SVG below with your actual QR image */}
                <div className="qr-placeholder">
                  <div className="qr-corner tl"/><div className="qr-corner tr"/>
                  <div className="qr-corner bl"/><div className="qr-corner br"/>
                  <div className="qr-inner">
                    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                      <rect x="4" y="4" width="28" height="28" rx="2" stroke="#b8860b" strokeWidth="3"/>
                      <rect x="12" y="12" width="12" height="12" fill="#b8860b"/>
                      <rect x="48" y="4" width="28" height="28" rx="2" stroke="#b8860b" strokeWidth="3"/>
                      <rect x="56" y="12" width="12" height="12" fill="#b8860b"/>
                      <rect x="4" y="48" width="28" height="28" rx="2" stroke="#b8860b" strokeWidth="3"/>
                      <rect x="12" y="56" width="12" height="12" fill="#b8860b"/>
                      <rect x="48" y="48" width="8" height="8" fill="#b8860b"/>
                      <rect x="60" y="48" width="8" height="8" fill="#b8860b"/>
                      <rect x="48" y="60" width="8" height="8" fill="#b8860b"/>
                      <rect x="60" y="60" width="8" height="8" fill="#b8860b"/>
                    </svg>
                    <div style={{ fontSize: 10, color: "#888", marginTop: 6 }}>Replace with your<br/>actual UPI QR image</div>
                  </div>
                </div>

                <div className="qr-upi">Scan with any UPI app</div>
                <div className="qr-upi" style={{ marginTop: 10 }}>Or pay directly to UPI ID:</div>
                <div className="qr-upiid">{DONATE.upiId}</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10, flexWrap: "wrap" }}>
                  <button className="copy-btn" onClick={() => copy(DONATE.upiId, "UPI ID")}>Copy UPI ID</button>
                  <a href={upiLink} style={{ textDecoration: "none" }}>
                    <button className="copy-btn" style={{ color: "var(--teal2)", borderColor: "rgba(34,139,112,.35)" }}>
                      Open UPI App ↗
                    </button>
                  </a>
                </div>
              </div>
              ) : (
                <div className="recurring-box">
                  <div className="recurring-icon">🔁</div>
                  <h4>Set up {frequency === "monthly" ? "Monthly" : "Yearly"} UPI AutoPay</h4>
                  <p>UPI doesn't support one-tap recurring payments across apps yet — but setting up an AutoPay mandate takes under a minute in your own banking app:</p>
                  <ol className="recurring-steps">
                    <li>Open your UPI app (GPay, PhonePe, Paytm, BHIM)</li>
                    <li>Go to <strong>Mandates / AutoPay / Subscriptions</strong></li>
                    <li>Choose <strong>"Pay to UPI ID"</strong> and enter:
                      <div className="qr-upiid" style={{ margin: "8px 0" }}>{DONATE.upiId}</div>
                    </li>
                    <li>Set frequency to <strong>{frequency === "monthly" ? "Monthly" : "Yearly"}</strong> and your preferred amount</li>
                    <li>Confirm with your UPI PIN — done!</li>
                  </ol>
                  <button className="copy-btn" onClick={() => copy(DONATE.upiId, "UPI ID")} style={{ marginTop: 4 }}>Copy UPI ID</button>
                </div>
              )}

              <div className="callout" style={{ background: "rgba(26,107,90,.08)", border: "1px solid rgba(26,107,90,.2)", borderRadius: 7, padding: "10px 14px", fontSize: 12, color: "var(--teal2)", marginTop: 12 }}>
                💡 Works with <strong>GPay, PhonePe, Paytm, BHIM</strong> and all UPI-enabled bank apps
              </div>
            </div>
          )}

          {/* ── BANK TRANSFER — by request only, screened by admin ── */}
          {/* UPI is the only self-service payment method app-wide. Direct bank
              transfer is intentionally never shown automatically — a donor
              who wants it must email admin first, so admin can have a quick
              conversation with the donor before sharing account details and
              accepting a transfer. This keeps the in-app flow domestic-leaning
              (UPI requires an Indian bank account to exist at all) and adds a
              human checkpoint for the one channel that doesn't have that
              built-in restriction. */}
          <div className="bank-login-prompt">
            Prefer a direct bank transfer instead of UPI? Email <strong>admin@awamibaitulmaal.org.in</strong> and the admin will get in touch to arrange it.
          </div>

          {/* ── FOOTER AYAH ── */}
          <div className="donate-ayah">
            <div className="arabic" style={{ fontFamily: "'Scheherazade New',serif", fontSize: 22, color: "var(--gold2)", direction: "rtl", marginBottom: 6 }}>
              مَن ذَا الَّذِي يُقْرِضُ اللَّهَ قَرْضًا حَسَنًا
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
              "Who is it that will lend to Allah a goodly loan?" — Al-Baqarah 2:245
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}