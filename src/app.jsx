import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { supabase } from "./supabase.js";

const WORDS_PER_DAY = 10;
// Safety-net fallback only — every real call site below passes the live,
// Supabase-derived day count explicitly. If this default is ever hit, it
// means a caller forgot to pass one; capping at 1 is the safest failure mode
// (a learner stuck on Day 1 is far better than one shown a wrong high number).
const TOTAL_DAYS = 1;
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
// TEMPORARY for testing — real threshold is 100. Change back to 100 once
// the certificate email flow is confirmed working end-to-end.
const CERTIFICATE_MASTERY_THRESHOLD = 100;
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
function getUnlockedDays(enrolledAt, dayProgress = {}, totalDays = TOTAL_DAYS) {
  let day = 1;
  while (day < totalDays && dayProgress[String(day)]) {
    day++;
  }
  return day;
}

function getWordsForDay(day, allWords = []) {
  return allWords.slice((day - 1) * WORDS_PER_DAY, day * WORDS_PER_DAY);
}

function getUnlockedWords(enrolledAt, dayProgress = {}, allWords = []) {
  const totalDays = Math.ceil(allWords.length / WORDS_PER_DAY);
  return allWords.slice(0, getUnlockedDays(enrolledAt, dayProgress, totalDays) * WORDS_PER_DAY);
}

// A word counts as mastered the moment its most recent 3 attempts are all
// correct — regardless of whether those attempts came from that set's own
// quiz, the All Sets Quiz, or a Weak Words Practice quiz, and regardless of
// whether that set's own quiz has ever been taken. Set-quiz, All Sets Quiz,
// and Weak Practice are just three different ways to practice the same
// underlying word bank — mastery attributes back to whichever set the word
// belongs to either way. Ranks/Home/Rewards totals are simply every mastered
// word across every set, summed.
function getMasteredWords(scores, allWords = []) {
  const { masteredSet } = buildStrictMastery(scores || []);
  const wordBankKeys = new Set(allWords.map(w => w.english));
  return new Set([...masteredSet].filter(k => wordBankKeys.has(k)));
}

// Words from sets the learner has actually completed (passed 90%+ or hit the
// 70% mastery gate) — NOT simply "unlocked". Used to scope the All Sets Quiz
// pool so it only reviews material already finished, never previewing words
// from the set currently in progress (that set's own dedicated quiz is the
// only way to first encounter and complete it).
function getCompletedWords(dayProgress = {}, allWords = []) {
  const completedDays = Object.keys(dayProgress || {}).filter(k => k !== "free" && dayProgress[k]).map(Number);
  const seen = new Set();
  const result = [];
  completedDays.forEach(d => {
    allWords.slice((d - 1) * WORDS_PER_DAY, d * WORDS_PER_DAY).forEach(w => {
      if (!seen.has(w.arabic)) { seen.add(w.arabic); result.push(w); }
    });
  });
  return result;
}

// Distractor selection for quiz answer options - keeps the full word object
// so the quiz can show Urdu alongside each English answer option.
function getWrongWords(pool, correct) {
  return shuffle(pool.filter(w => w !== correct)).slice(0, 3);
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
    // "weak-practice" is a sentinel day value, not a set number — label those
    // W1, W2… (attempt order). Without this special-case they'd render as
    // "Sweak-practice", a huge string that overlaps every neighboring label.
    label: s.day === "weak-practice" ? `W${i + 1}` : s.day ? `S${s.day}` : `A${i + 1}`,
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
  // Keyed by english (not arabic) — arabic display text has been deliberately
  // changed for some words this session (to match audio pronunciation), so a
  // user's older session.detail rows may carry the OLD arabic text. Keying by
  // arabic would silently fail to find the current word (losing the play
  // button/ayah link) and would also fragment one word's history into two
  // separate tally entries. english has stayed stable throughout, so it's
  // the reliable join key.
  const tally = {}; // key: english meaning -> { correct, wrong, ...fullWordData }
  for (const s of scores) {
    if (!s.detail) continue;
    for (const d of s.detail) {
      const key = d.english;
      if (!tally[key]) {
        // Look up the full word entry (current arabic/urdu/ayah ref/audio
        // data) so the breakdown always reflects the word's current state.
        const full = allWords.find(w => w.english === d.english);
        tally[key] = {
          correct: 0, wrong: 0,
          arabic: full?.arabic ?? d.arabic, english: d.english, translit: full?.translit ?? d.translit,
          urdu: full?.urdu,
          ayahRef: full?.ayahRef,
          surahNumber: full?.surahNumber, ayahNumber: full?.ayahNumber, wordPosition: full?.wordPosition,
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
  const streaks = {}; // key: english meaning -> current consecutive-correct streak.
  // Keyed by english, not arabic — arabic display text has been deliberately
  // changed for some words (pronunciation-accuracy work), so keying by arabic
  // would fragment one word's streak into two whenever its display text changes.
  // english has stayed stable throughout, so it's the reliable key.
  const attempted = new Set();
  // scores is chronological (oldest first, since it's built by appending each
  // new attempt) — process in that order so the streak reflects recency.
  for (const s of scores) {
    if (!s.detail) continue;
    for (const d of s.detail) {
      const key = d.english;
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

// ── Monthly mastery counts (for the monthly-target feature) ─────────────────
// Walks scores chronologically (same order as buildStrictMastery) and records
// the FIRST time each word's streak reaches MASTERY_STREAK_REQUIRED, bucketed
// by calendar month of that attempt's date. A word is only ever attributed to
// one month — the month it was first mastered — even if a later wrong answer
// resets its streak and it's re-mastered afterward. This matches how mastery
// is counted everywhere else in the app (a word "mastered" stays counted).
function buildMonthlyMasteryCounts(scores) {
  const streaks = {};
  const firstMasteredMonth = {}; // key -> "YYYY-MM"
  for (const s of scores) {
    if (!s.detail || !s.date) continue;
    for (const d of s.detail) {
      const key = d.english;
      if (d.isCorrect) {
        streaks[key] = (streaks[key] || 0) + 1;
        if (streaks[key] === MASTERY_STREAK_REQUIRED && !firstMasteredMonth[key]) {
          firstMasteredMonth[key] = new Date(s.date).toISOString().slice(0, 7);
        }
      } else {
        streaks[key] = 0;
      }
    }
  }
  const counts = {};
  for (const month of Object.values(firstMasteredMonth)) {
    counts[month] = (counts[month] || 0) + 1;
  }
  return counts; // e.g. { "2026-07": 12, "2026-06": 34 }
}

// Checks whether a specific set has reached MASTERY_GATE_PCT (70%) of its
// words individually mastered — the alternative unlock path alongside a
// single 90%+ quiz pass. Uses every score, not just this set's own quiz,
// then filters the *result* down to this set's words — a word can only ever
// appear in its own set's quiz, the All Sets Quiz, or a weak-practice quiz,
// so this naturally captures progress from all three consistently (weak
// -practice attempts exist specifically to help a learner reach mastery on
// words they've struggled with — they should count here, same as everywhere
// else mastery is shown).
function hasMetMasteryGate(setDay, allScores, allWords) {
  const setWords = getWordsForDay(setDay, allWords);
  if (setWords.length === 0) return false;
  const setWordKeys = new Set(setWords.map(w => w.english));
  const { masteredSet } = buildStrictMastery(allScores);
  const masteredInSet = [...masteredSet].filter(key => setWordKeys.has(key)).length;
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
// Numbering: ABM-2026-001-X7K9 — the sequential part (2026-001) is for human
// bookkeeping/ordering; the 4-char suffix is random and exists purely so the
// receipt number itself can't be brute-forced on the donor-facing PDF lookup
// (get_receipt_for_download, see deploy notes) — without it, an attacker who
// already knows a donor's email would only need to try ~999 guesses/year.
// This is admin-issued bookkeeping, not an automated/verified payment receipt
// — the app has no way to independently confirm a UPI payment occurred, since
// UPI deep-links and QR scans complete entirely inside the donor's own banking
// app with no callback to this site. The finance team confirms funds received
// (outside the app) and tells admin, who then issues the receipt manually.
const RECEIPT_PREFIX = "ABM";
// Excludes visually-ambiguous characters (0/O, 1/I/L) — still ~1M combos (32^4).
const RECEIPT_SUFFIX_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function randomReceiptSuffix() {
  let s = "";
  for (let i = 0; i < 4; i++) s += RECEIPT_SUFFIX_CHARS[Math.floor(Math.random() * RECEIPT_SUFFIX_CHARS.length)];
  return s;
}

function mapReceiptRow(row) {
  return {
    id: row.id, receiptNo: row.receipt_no, donorName: row.donor_name,
    donorEmail: row.donor_email, amount: row.amount, donationDate: row.donation_date,
    purpose: row.purpose, note: row.notes, issuedAt: row.issued_at,
    utrReference: row.utr_reference,
  };
}

async function fetchAllReceipts() {
  const { data, error } = await supabase.from("receipts").select("*").order("issued_at", { ascending: false });
  if (error) { console.error("fetchAllReceipts error:", error.message); return null; }
  return (data || []).map(mapReceiptRow);
}

// Retries with the next number if a rare race produces a duplicate — the
// unique constraint on receipt_no (see deploy notes) is what makes this safe:
// Postgres rejects the conflict outright rather than silently double-issuing
// the same receipt number to two donors.
async function insertReceiptRow(receipt) {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { count } = await supabase.from("receipts")
      .select("id", { count: "exact", head: true })
      .like("receipt_no", `${RECEIPT_PREFIX}-${year}-%`);
    const next = String((count || 0) + 1 + attempt).padStart(3, "0");
    const receiptNo = `${RECEIPT_PREFIX}-${year}-${next}-${randomReceiptSuffix()}`;
    const { data, error } = await supabase.from("receipts").insert({
      receipt_no: receiptNo, donor_name: receipt.donorName, donor_email: receipt.donorEmail,
      amount: receipt.amount, donation_date: receipt.donationDate, purpose: receipt.purpose,
      notes: receipt.note || null, issued_at: new Date().toISOString(),
      utr_reference: receipt.utrReference || null,
    }).select().single();
    if (!error) return { ok: true, receiptNo, dbId: data.id };
    if (error.code !== "23505") { // not a receipt-number conflict — a real error, stop retrying
      console.error("insertReceiptRow error:", error.message);
      return { ok: false };
    }
    // else: number conflict — loop and retry with the next one
  }
  console.error("insertReceiptRow: exhausted retries on receipt number conflicts");
  return { ok: false };
}

// ── Donation receipt REQUESTS (self-service, donor-initiated) ──────────────
// A donor who already paid via UPI clicks "Request Receipt" — this just logs
// their claim for Finance to verify against actual funds received. It does
// NOT auto-issue anything; it lands in Finance's queue exactly like a manual
// walk-up would, just pre-filled instead of typed from scratch. True
// automated issuing still isn't possible without a payment gateway webhook
// (see the note above insertReceiptRow()).
function mapReceiptRequestRow(row) {
  return {
    id: row.id, userId: row.user_id, donorName: row.donor_name,
    donorEmail: row.donor_email, amount: row.amount, donationDate: row.donation_date,
    note: row.note, status: row.status, requestedAt: row.requested_at,
    utrReference: row.utr_reference,
  };
}

async function fetchReceiptRequests() {
  const { data, error } = await supabase.from("receipt_requests").select("*")
    .order("requested_at", { ascending: false });
  if (error) { console.error("fetchReceiptRequests error:", error.message); return null; }
  return (data || []).map(mapReceiptRequestRow);
}

// Goes through submit_receipt_request() (SECURITY DEFINER, rate-limited by
// IP) rather than inserting into receipt_requests directly — direct insert
// access to that table is revoked, this function is the only way in.
// UTR reference is required (this flow is UPI-specific) — the function
// rejects with false if it's missing, distinct from the "pretend success"
// it returns when rate-limited, so the UI can show a real validation error.
async function insertReceiptRequestRow({ userId, donorName, donorEmail, amount, donationDate, note, utrReference }) {
  const { data, error } = await supabase.rpc("submit_receipt_request", {
    p_user_id: userId || null, p_donor_name: donorName, p_donor_email: donorEmail,
    p_amount: amount || null, p_donation_date: donationDate || null, p_note: note || null,
    p_utr_reference: utrReference,
  });
  if (error) { console.error("insertReceiptRequestRow error:", error.message); return false; }
  return data === true;
}

async function updateReceiptRequestRow(id, fields) {
  const { error } = await supabase.from("receipt_requests").update(fields).eq("id", id);
  if (error) { console.error("updateReceiptRequestRow error:", error.message); return false; }
  return true;
}

// Donor-facing, no-login-required receipt lookup — used by the
// "Download Receipt PDF" page linked from the receipt email. Goes through
// get_receipt_for_download(), a SECURITY DEFINER function that only returns
// a row when BOTH the receipt number and email match (see deploy notes).
async function fetchReceiptForDownload(receiptNo, email) {
  const { data, error } = await supabase.rpc("get_receipt_for_download", {
    p_receipt_no: receiptNo.trim(), p_email: email.trim(),
  });
  if (error) { console.error("fetchReceiptForDownload error:", error.message); return null; }
  if (!data || data.length === 0) return null;
  const row = data[0];
  return {
    receiptNo: row.receipt_no, donorName: row.donor_name, donorEmail: row.donor_email,
    amount: row.amount, donationDate: row.donation_date, purpose: row.purpose,
    note: row.notes, issuedAt: row.issued_at, utrReference: row.utr_reference,
  };
}

// Logged-in donor's own receipt history — matches by their account email
// server-side via get_my_receipts() (see deploy notes), not by anything the
// client claims, so this can't be used to browse anyone else's receipts.
async function fetchMyReceipts() {
  const { data, error } = await supabase.rpc("get_my_receipts");
  if (error) { console.error("fetchMyReceipts error:", error.message); return null; }
  return (data || []).map(row => ({
    receiptNo: row.receipt_no, amount: row.amount, donationDate: row.donation_date,
    purpose: row.purpose, issuedAt: row.issued_at, utrReference: row.utr_reference,
  }));
}

// ── Finance password-change approval workflow ───────────────────────────
// Finance can't change their own password unilaterally — this queues a
// request for Admin. Approval doesn't set a password directly (that would
// need the Supabase service-role key, which must never be in the browser);
// it just triggers the same "email me a reset code" flow already used for
// the learner Forgot Password screen.
function mapPasswordChangeRequestRow(row) {
  return {
    id: row.id, requesterUserId: row.requester_user_id, requesterEmail: row.requester_email,
    status: row.status, requestedAt: row.requested_at, resolvedAt: row.resolved_at,
  };
}

// Admin view — RLS returns every request when called by an admin account.
async function fetchAllPasswordChangeRequests() {
  const { data, error } = await supabase.from("password_change_requests").select("*")
    .order("requested_at", { ascending: false });
  if (error) { console.error("fetchAllPasswordChangeRequests error:", error.message); return null; }
  return (data || []).map(mapPasswordChangeRequestRow);
}

// Finance's own view — RLS scopes this to only their own row(s) even
// without an explicit filter, since the select policy is "own row or admin".
async function fetchMyLatestPasswordChangeRequest() {
  const { data, error } = await supabase.from("password_change_requests").select("*")
    .order("requested_at", { ascending: false }).limit(1);
  if (error) { console.error("fetchMyLatestPasswordChangeRequest error:", error.message); return null; }
  return data && data[0] ? mapPasswordChangeRequestRow(data[0]) : null;
}

// Goes through request_password_change() (SECURITY DEFINER) which verifies
// server-side that the caller is actually a Finance account before inserting
// — direct insert access to the table is not granted at all.
async function requestPasswordChangeRPC() {
  const { data, error } = await supabase.rpc("request_password_change");
  if (error) { console.error("requestPasswordChangeRPC error:", error.message); return false; }
  return data === true;
}

async function updatePasswordChangeRequestStatus(id, status) {
  const { error } = await supabase.from("password_change_requests")
    .update({ status, resolved_at: new Date().toISOString() }).eq("id", id);
  if (error) { console.error("updatePasswordChangeRequestStatus error:", error.message); return false; }
  return true;
}

// Called by Finance right after successfully redeeming their reset code —
// marks their own approved request "completed" so re-opening the modal
// later shows a fresh "none" state instead of re-showing a stale, already-
// used code-entry screen forever. Matches by email rather than
// current_user_id()/auth.uid() — right after verifyOtp() the session is
// mid-transition, and relying on session-derived identity here caused this
// to silently match zero rows instead of erroring (no exception, nothing
// to catch — the UPDATE just ran and touched nothing).
async function completePasswordChangeRequestRPC(email) {
  const { error } = await supabase.rpc("complete_password_change_request", { p_email: email });
  if (error) console.error("completePasswordChangeRequestRPC error:", error.message);
}

// ── Supabase: scores + progress (Phase 3) ──────────────────────────────────
// A `scores` row -> the shape the rest of the app already expects everywhere
// (Home, History, Leaderboard, Admin) so those screens need zero changes.
function mapScoreRow(row) {
  // scores.day is stored as `text` in Supabase, but the rest of the app
  // (Home, History, Leaderboard, mastery-gate checks) compares it as a
  // JS number for real set days — e.g. `s.day === selectedDay` — with
  // only "weak-practice" and null as the non-numeric exceptions. Convert
  // back here, once, so every existing comparison keeps working unchanged.
  const day = row.day == null ? null : (/^\d+$/.test(row.day) ? Number(row.day) : row.day);
  return {
    score: row.score, total: row.total, pct: row.pct, day,
    date: row.quiz_date, detail: row.detail || [],
    timeUsedSec: row.time_used_sec, timedOut: row.timed_out || false,
  };
}

async function insertScore(dbUserId, rec) {
  const { error } = await supabase.from("scores").insert({
    user_id: dbUserId, day: rec.day != null ? String(rec.day) : null,
    score: rec.score, total: rec.total, pct: rec.pct,
    time_used_sec: rec.timeUsedSec ?? null, passed: rec.pct >= PASSING_SCORE_PCT,
    detail: rec.detail || [], quiz_date: rec.date, timed_out: !!rec.timedOut,
  });
  if (error) console.error("insertScore error:", error.message);
  return !error;
}

async function upsertProgress(dbUserId, dayProgress) {
  const { error } = await supabase.from("progress").upsert(
    { user_id: dbUserId, day_progress: dayProgress, last_activity: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) console.error("upsertProgress error:", error.message);
  return !error;
}

// ── Supabase: words (Phase 3) ───────────────────────────────────────────────
// One unified table for both built-in and admin-added words — editing either
// kind is just an UPDATE on its row now, no separate "overrides" concept needed.
function mapWordRow(row) {
  return {
    dbId: row.id, arabic: row.arabic, translit: row.translit, english: row.english,
    urdu: row.urdu,
    ayahRef: row.ayah_ref || "", isCustom: !!row.is_custom,
    surahNumber: row.surah_number ?? null, ayahNumber: row.ayah_number ?? null,
    wordPosition: row.word_position ?? null,
    partialAyahText: row.partial_ayah_text || "",
  };
}

async function fetchAllWords() {
  const { data, error } = await supabase.from("words").select("*")
    .eq("is_active", true)
    .order("set_number", { ascending: true })
    .order("order_in_set", { ascending: true });
  if (error) { console.error("fetchAllWords error:", error.message); return null; }
  return (data || []).map(mapWordRow);
}

// Safe to call for anyone, logged in or not — returns just a number via
// get_total_word_count() (see deploy notes), never actual word rows. Used
// so the "Total Words" stat shows the real total even for anon visitors,
// who can only fetch Set 1's actual content via fetchAllWords() above.
async function fetchTotalWordCount() {
  const { data, error } = await supabase.rpc("get_total_word_count");
  if (error) { console.error("fetchTotalWordCount error:", error.message); return null; }
  return data;
}

// New custom words always append after the last existing word, filling out
// a partial set before starting a new one — matches the old array-append behavior.
async function insertWord(word) {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  let addedBy = null;
  if (authUser) {
    const { data: profile } = await supabase.from("users").select("id").eq("auth_id", authUser.id).maybeSingle();
    addedBy = profile?.id || null;
  }
  const { data: last } = await supabase.from("words").select("set_number, order_in_set")
    .order("set_number", { ascending: false }).order("order_in_set", { ascending: false })
    .limit(1).maybeSingle();
  let setNum = 1, orderNum = 1;
  if (last) {
    orderNum = last.order_in_set + 1;
    setNum = last.set_number;
    if (orderNum > WORDS_PER_DAY) { setNum += 1; orderNum = 1; }
  }
  const { error } = await supabase.from("words").insert({
    arabic: word.arabic, translit: word.translit, english: word.english,
    urdu: word.urdu,
    ayah_ref: word.ayahRef || null, surah_number: word.surahNumber || null, ayah_number: word.ayahNumber || null,
    word_position: word.wordPosition || null, partial_ayah_text: word.partialAyahText || null, set_number: setNum, order_in_set: orderNum,
    is_custom: true, is_active: true, added_by: addedBy, added_at: new Date().toISOString(),
  });
  if (error) console.error("insertWord error:", error.message);
  return !error;
}

async function updateWord(dbId, fields) {
  const { error } = await supabase.from("words").update({
    arabic: fields.arabic, translit: fields.translit, english: fields.english,
    urdu: fields.urdu,
    ayah_ref: fields.ayahRef || null, surah_number: fields.surahNumber || null, ayah_number: fields.ayahNumber || null,
    word_position: fields.wordPosition || null, partial_ayah_text: fields.partialAyahText || null,
  }).eq("id", dbId);
  if (error) console.error("updateWord error:", error.message);
  return !error;
}

async function deleteWordRow(dbId) {
  const { error } = await supabase.from("words").delete().eq("id", dbId);
  if (error) console.error("deleteWordRow error:", error.message);
  return !error;
}

// ── Bulk word upload (CSV) ──────────────────────────────────────────────
// Hand-rolled parser instead of a library — keeps the app dependency-free
// (no package.json/npm install changes needed, just this one file, same as
// every other change this whole project). Handles quoted fields with
// embedded commas/newlines, which a naive text.split(',') would break on.
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ""; }
      else if (c === '\r') { /* skip, \n handles the line break */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0].trim() === ""));
}

// Accepts a few reasonable header spellings so a non-technical person
// rearranging/renaming columns in Excel doesn't break the upload.
const CSV_HEADER_ALIASES = {
  arabic: ["arabic", "arabic word"],
  translit: ["transliteration", "translit"],
  english: ["english", "english meaning", "meaning"],
  urdu: ["urdu", "urdu meaning"],
  ayahRef: ["ayah reference", "ayahref", "quran reference", "reference"],
  surahNumber: ["surah number", "surah#", "surah no", "surah"],
  ayahNumber: ["ayah number", "ayah#", "ayah no", "ayah"],
  wordPosition: ["word position", "word#", "word no", "word number in ayah"],
  partialAyahText: ["partial ayah text", "partial ayah", "partial text", "play up to"],
};

function mapCSVHeaders(headerRow) {
  const normalized = headerRow.map(h => h.trim().toLowerCase());
  const colIndex = {};
  for (const [field, aliases] of Object.entries(CSV_HEADER_ALIASES)) {
    const idx = normalized.findIndex(h => aliases.includes(h));
    if (idx !== -1) colIndex[field] = idx;
  }
  return colIndex;
}

// Parses + validates in one pass, returning both the rows ready to upload
// and per-row problems so the UI can show a preview before anything is sent.
// normalizeArabic: strips whitespace so trivial formatting differences
// (extra space, etc.) don't defeat duplicate detection.
function normalizeArabic(s) { return (s || "").trim(); }

function parseWordsCSV(text, existingArabicSet = new Set()) {
  // Strip a leading UTF-8 BOM if present (our own downloaded CSVs include
  // one now, for correct Arabic/Urdu rendering in Excel) — without this,
  // the invisible BOM character would corrupt the very first header cell
  // and break the "Arabic"/"English" column matching below.
  const cleanText = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const rows = parseCSV(cleanText.trim());
  if (rows.length === 0) return { headerError: "File appears to be empty.", words: [] };
  const colIndex = mapCSVHeaders(rows[0]);
  if (colIndex.arabic === undefined || colIndex.english === undefined) {
    return { headerError: "Couldn't find 'Arabic' and 'English' columns — check the header row matches the template.", words: [] };
  }
  const words = [];
  const seenInFile = new Set();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.every(cell => cell.trim() === "")) continue; // skip blank lines
    const get = (field) => (colIndex[field] !== undefined ? (r[colIndex[field]] || "").trim() : "");
    const arabic = get("arabic"), english = get("english");
    const normArabic = normalizeArabic(arabic);
    const errors = [];
    if (!arabic) errors.push("missing Arabic");
    if (!english) errors.push("missing English meaning");
    // Duplicate against the existing word list (e.g. re-uploading the
    // downloaded CSV after appending new rows) or against another row
    // earlier in this same file (e.g. accidentally pasted twice).
    const isDuplicate = normArabic && (existingArabicSet.has(normArabic) || seenInFile.has(normArabic));
    if (normArabic) seenInFile.add(normArabic);
    words.push({
      rowNum: i + 1, arabic, english,
      translit: get("translit"), urdu: get("urdu") || "—",
      ayahRef: get("ayahRef"),
      surahNumber: get("surahNumber") ? parseInt(get("surahNumber"), 10) || null : null,
      ayahNumber: get("ayahNumber") ? parseInt(get("ayahNumber"), 10) || null : null,
      wordPosition: get("wordPosition") ? parseInt(get("wordPosition"), 10) || null : null,
      partialAyahText: get("partialAyahText"),
      errors, isDuplicate,
    });
  }
  return { headerError: null, words };
}

// Single batch INSERT — computes the starting set/order position once, then
// increments locally per row instead of round-tripping to the DB for each
// one (which is what looping insertWord() per-row would do).
async function bulkInsertWords(words) {
  if (words.length === 0) return { ok: true, count: 0 };
  const { data: { user: authUser } } = await supabase.auth.getUser();
  let addedBy = null;
  if (authUser) {
    const { data: profile } = await supabase.from("users").select("id").eq("auth_id", authUser.id).maybeSingle();
    addedBy = profile?.id || null;
  }
  const { data: last } = await supabase.from("words").select("set_number, order_in_set")
    .order("set_number", { ascending: false }).order("order_in_set", { ascending: false })
    .limit(1).maybeSingle();
  let setNum = 1, orderNum = 1;
  if (last) {
    orderNum = last.order_in_set + 1;
    setNum = last.set_number;
    if (orderNum > WORDS_PER_DAY) { setNum += 1; orderNum = 1; }
  }
  const nowIso = new Date().toISOString();
  const rows = words.map(word => {
    const row = {
      arabic: word.arabic, translit: word.translit, english: word.english,
      urdu: word.urdu,
      ayah_ref: word.ayahRef || null, surah_number: word.surahNumber || null, ayah_number: word.ayahNumber || null,
      word_position: word.wordPosition || null, partial_ayah_text: word.partialAyahText || null, set_number: setNum, order_in_set: orderNum,
      is_custom: true, is_active: true, added_by: addedBy, added_at: nowIso,
    };
    orderNum += 1;
    if (orderNum > WORDS_PER_DAY) { setNum += 1; orderNum = 1; }
    return row;
  });
  const { error } = await supabase.from("words").insert(rows);
  if (error) { console.error("bulkInsertWords error:", error.message); return { ok: false }; }
  return { ok: true, count: rows.length };
}

// One-time pre-launch action — wipes every donation receipt. Deliberately
// separate from resetAllTestData: receipts are real financial/bookkeeping
// records, not disposable QA data, so this needs its own explicit, guarded
// action rather than being bundled into routine test-data cleanup.
async function clearAllReceiptsRows() {
  const { error } = await supabase.from("receipts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) { console.error("clearAllReceiptsRows error:", error.message); return false; }
  return true;
}

// ── EmailJS configuration ──────────────────────────────────────────────────────
// Sends transactional emails via Titan SMTP (support@awamibaitulmaal.org.in),
// connected through EmailJS. No backend server needed — EmailJS's public key is
// safe to expose client-side by design (see EmailJS docs); their free tier caps
// abuse at 200 emails/month.
const EMAILJS_SERVICE_ID    = "service_u97pazt"; // support@ — invites, certificates, misc.
const EMAILJS_RECEIPT_SERVICE_ID = "service_jdrpzb6"; // admin@ — receipts only
const EMAILJS_RECEIPT_TEMPLATE_ID = "template_hbjl6yv"; // dedicated receipt/invoice template
const EMAILJS_INVITE_TEMPLATE_ID  = "template_1hfqxef"; // "Invite a Friend" template
const EMAILJS_PUBLIC_KEY    = "lVfbS-yLSA3hkGGT5";
// Supabase now handles verification + password reset emails via Titan SMTP.
// EmailJS is used for donation receipts (template_hbjl6yv, sent via the
// separate admin@ service — see EMAILJS_RECEIPT_SERVICE_ID) and, as of this
// change, "invite a friend" emails (a separate dedicated template, still on
// the original support@ service) — an intentional, agreed exception to the
// "receipts + certificates only" rule.

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

// ── jsPDF (lazy-loaded, same pattern as EmailJS above) — used only for the
// client-side "Download PDF Receipt" button. No server involved, no cost.
let _jsPDFLoaded = null;
async function loadJsPDF() {
  if (_jsPDFLoaded) return _jsPDFLoaded;
  _jsPDFLoaded = new Promise((resolve, reject) => {
    if (window.jspdf) { resolve(window.jspdf.jsPDF); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
    script.onload = () => resolve(window.jspdf.jsPDF);
    script.onerror = () => reject(new Error("Failed to load jsPDF"));
    document.head.appendChild(script);
  });
  return _jsPDFLoaded;
}

// ── HTML-escape user-supplied text before it goes into any email template.
// EmailJS templates use {{{email_body_html}}} (triple-mustache = unescaped)
// so whatever we build here goes out verbatim — donor names, notes, and
// even a learner's registered display name are all free text a person
// typed in, so without this a crafted name/note could inject links or
// broken markup into an outbound receipt/invite/certificate email.
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ── Amount in words, Indian numbering system (Lakh/Crore) — for the formal
// receipt format. Handles ₹0 to ₹99,99,99,999 (sufficient for donations).
function amountInWordsIndian(num) {
  const n = Math.round(Number(num) || 0);
  if (n === 0) return "Zero Rupees Only";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const twoDigits = (v) => v < 20 ? ones[v] : `${tens[Math.floor(v / 10)]}${v % 10 ? " " + ones[v % 10] : ""}`;
  const threeDigits = (v) => v >= 100 ? `${ones[Math.floor(v / 100)]} Hundred${v % 100 ? " " + twoDigits(v % 100) : ""}` : twoDigits(v);

  let rem = n;
  const crore = Math.floor(rem / 10000000); rem %= 10000000;
  const lakh = Math.floor(rem / 100000); rem %= 100000;
  const thousand = Math.floor(rem / 1000); rem %= 1000;
  const hundred = rem;

  const parts = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));
  return `${parts.join(" ")} Rupees Only`;
}

// ── All auth emails (verification + password reset) handled by Supabase ───────
// EmailJS is now used ONLY for donation receipts (sendReceiptEmail below).

// Formal donation-receipt document format — mirrors the layout of a
// standard 80G-style trust receipt (reg numbers up top, donor details block,
// amount in figures + words, signatory block at the bottom), rendered in
// the app's dark ocean / cyan / gold theme rather than a plain white page.
async function sendReceiptEmail({ toEmail, donorName, receiptNo, amount, donationDate, purpose, note, donorAddress, donorPan, paymentMode, utrReference }) {
  const emailjs = await loadEmailJS();

  const charityName = DONATE.charityName && DONATE.charityName !== "Your Charity Name Here"
    ? DONATE.charityName
    : "Awami Baitulmaal Committee (Reg.)";
  const regLines = [];
  if (DONATE.regdNo) regLines.push(`Regd No: ${DONATE.regdNo}`);
  if (DONATE.pan && DONATE.pan !== "PASTE_TRUST_PAN_HERE") regLines.push(`PAN No: ${DONATE.pan}`);
  if (DONATE.reg12A) regLines.push(`12A Reg: ${DONATE.reg12A}`);
  if (DONATE.reg80G) {
    let line = `80G Reg: ${DONATE.reg80G}`;
    if (DONATE.reg80GValidTo) line += ` (valid till ${DONATE.reg80GValidTo})`;
    regLines.push(line);
  }
  const formattedIssueDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  const formattedDonationDate = new Date(donationDate).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  const amountWords = amountInWordsIndian(amount);
  const taxNote = (DONATE.reg80G && DONATE.form10BDFiled)
    ? "All donations are exempted under Section 80G of the Income Tax Act, 1961. This document is an acknowledgement of your payment; your official 80G certificate (Form 10BE) will follow separately."
    : "This document is only an acknowledgement of your payment. Please retain it as your transaction receipt for future reference.";

  const detailRow = (label, value) => value
    ? `<tr>
        <td style="padding:9px 4px;font-size:12.5px;color:#7ab8d4;width:38%;vertical-align:top">${label}</td>
        <td style="padding:9px 4px;font-size:13.5px;color:#f0f8ff;font-weight:500">: ${value}</td>
       </tr>`
    : "";

  const invoiceHtml = `
  <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;background:#0d1f2d;border:2px solid #00c8e6;border-radius:6px;overflow:hidden;">

    <!-- Header: org identity + reg block -->
    <div style="padding:22px 24px 16px;border-bottom:2px solid rgba(0,200,230,.3);">
      <div style="font-size:19px;font-weight:700;color:#ffd96b;letter-spacing:.02em">${charityName}</div>
      ${regLines.length > 0 ? `<div style="margin-top:8px;font-size:11px;color:#7ab8d4;line-height:1.9">${regLines.join("<br/>")}</div>` : ""}
    </div>

    <!-- Title -->
    <div style="text-align:center;padding:16px 24px 8px;">
      <div style="display:inline-block;font-size:16px;font-weight:700;color:#00c8e6;border-bottom:2px solid #00c8e6;padding-bottom:4px;letter-spacing:.04em">Donation Receipt</div>
    </div>

    <!-- Receipt No / Date -->
    <div style="display:flex;justify-content:space-between;padding:10px 24px;font-size:12.5px;color:#a9c9dc;">
      <span>Receipt No: <strong style="color:#ffd96b;font-family:monospace">${receiptNo}</strong></span>
      <span>Date: <strong style="color:#f0f8ff">${formattedIssueDate}</strong></span>
    </div>

    <!-- Donor + payment details -->
    <div style="padding:4px 24px 8px;">
      <table style="width:100%;border-collapse:collapse;">
        <tbody>
          ${detailRow("Donor Name", escapeHtml(donorName))}
          ${detailRow("Donor Email", escapeHtml(toEmail))}
          ${detailRow("Address", escapeHtml(donorAddress || ""))}
          ${detailRow("PAN No", escapeHtml(donorPan || ""))}
          ${detailRow("Amount (in words)", amountWords)}
          ${detailRow("Amount", `<span style="font-size:16px;color:#ffd96b;font-weight:700">₹${Number(amount).toLocaleString("en-IN")}</span>`)}
          ${detailRow("Donation Date", formattedDonationDate)}
          ${detailRow("Payment Mode", escapeHtml(paymentMode || "Online (UPI)"))}
          ${utrReference ? detailRow("UPI Reference (UTR)", escapeHtml(utrReference)) : ""}
          ${detailRow("Purpose", escapeHtml(purpose))}
          ${note ? detailRow("Note", escapeHtml(note)) : ""}
        </tbody>
      </table>
    </div>

    <!-- Thank you -->
    <div style="margin:8px 24px 16px;padding:12px 16px;background:rgba(0,200,230,.06);border-radius:6px;font-size:12.5px;color:#a9c9dc;line-height:1.7">
      Thank you so much for contributing to ${charityName}. Your donation benefits Qur'anic education and dawah for all.
    </div>

    <!-- Legal note -->
    <div style="margin:0 24px 18px;font-size:11px;color:#7ab8d4;line-height:1.8">
      ${taxNote}
    </div>

    <!-- Download PDF -->
    <div style="text-align:center;margin:0 24px 20px;">
      <a href="${window.location.origin}/?receipt=${encodeURIComponent(receiptNo)}" style="display:inline-block;padding:10px 22px;background:rgba(0,200,230,.1);border:1px solid rgba(0,200,230,.4);color:#00c8e6;font-size:12.5px;font-weight:600;text-decoration:none;border-radius:8px;">
        📄 Download as PDF
      </a>
    </div>

    <!-- Signature block -->
    <div style="display:flex;justify-content:flex-end;padding:0 24px 20px;">
      <div style="text-align:center;">
        <div style="font-size:12px;color:#a9c9dc;margin-bottom:28px;">For ${charityName}</div>
        <div style="border-top:1px solid rgba(122,184,212,.4);padding-top:6px;font-size:11px;color:#7ab8d4;">Authorized Signatory</div>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:12px 24px;background:#071c2a;text-align:center;border-top:1px solid rgba(0,200,230,.15)">
      <p style="margin:0;font-size:11px;color:rgba(122,184,212,.5)">${charityName} &nbsp;·&nbsp; admin@awamibaitulmaal.org.in</p>
    </div>

  </div>`;

  return emailjs.send(EMAILJS_RECEIPT_SERVICE_ID, EMAILJS_RECEIPT_TEMPLATE_ID, {
    to_email: toEmail,
    recipient_name: donorName,
    receipt_no: receiptNo,
    from_email: "admin@awamibaitulmaal.org.in", // must match the admin@ Titan SMTP auth user on EMAILJS_RECEIPT_SERVICE_ID (see deploy notes)
    reply_to: "finance@awamibaitulmaal.org.in", // alias forwarding to admin@ — replies land in the same inbox either way
    email_heading: `Donation Receipt ${receiptNo} — ${charityName}`,
    email_body_html: invoiceHtml,
  });
}

// Client-side PDF version of the same receipt — free, no EmailJS attachment
// plan needed. Triggers a browser download; doesn't touch email at all.
async function generateReceiptPDF(receipt) {
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const charityName = DONATE.charityName && DONATE.charityName !== "Your Charity Name Here"
    ? DONATE.charityName
    : "Awami Baitulmaal Committee (Reg.)";
  const regLines = [];
  if (DONATE.regdNo) regLines.push(`Regd No: ${DONATE.regdNo}`);
  if (DONATE.pan && DONATE.pan !== "PASTE_TRUST_PAN_HERE") regLines.push(`PAN No: ${DONATE.pan}`);
  if (DONATE.reg12A) regLines.push(`12A Reg: ${DONATE.reg12A}`);
  if (DONATE.reg80G) regLines.push(`80G Reg: ${DONATE.reg80G}${DONATE.reg80GValidTo ? ` (valid till ${DONATE.reg80GValidTo})` : ""}`);

  const marginX = 48; let y = 60;
  doc.setDrawColor(0, 150, 180); doc.setLineWidth(1.5);
  doc.rect(30, 30, 535, 700);

  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(20, 60, 90);
  doc.text(charityName, marginX, y); y += 16;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
  regLines.forEach(line => { doc.text(line, marginX, y); y += 12; });

  y += 12;
  doc.setDrawColor(0, 150, 180); doc.line(marginX, y, 547, y); y += 24;
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(0, 130, 160);
  doc.text("Donation Receipt", 297, y, { align: "center" }); y += 26;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(40, 40, 40);
  const issueDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  doc.text(`Receipt No: ${receipt.receiptNo}`, marginX, y);
  doc.text(`Date: ${issueDate}`, 420, y); y += 24;

  const field = (label, value) => {
    doc.setFont("helvetica", "bold"); doc.text(label, marginX, y);
    doc.setFont("helvetica", "normal"); doc.text(`: ${value}`, marginX + 130, y);
    y += 20;
  };
  field("Donor Name", receipt.donorName || "");
  field("Donor Email", receipt.donorEmail || "");
  field("Amount", `Rs. ${Number(receipt.amount).toLocaleString("en-IN")}`);
  field("Amount (words)", amountInWordsIndian(receipt.amount));
  field("Donation Date", new Date(receipt.donationDate).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }));
  field("Payment Mode", "Online (UPI)");
  if (receipt.utrReference) field("UPI Reference (UTR)", receipt.utrReference);
  field("Purpose", receipt.purpose || "Donation");
  if (receipt.note) field("Note", receipt.note);

  y += 20;
  doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
  const legal = doc.splitTextToSize(
    "This document is only an acknowledgement of your payment. Please retain it as your transaction receipt for future reference.",
    460
  );
  doc.text(legal, marginX, y); y += legal.length * 12 + 40;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(40, 40, 40);
  doc.text(`For ${charityName}`, 460, y, { align: "center" }); y += 34;
  doc.line(410, y, 510, y); y += 12;
  doc.setFontSize(9); doc.text("Authorized Signatory", 460, y, { align: "center" });

  doc.save(`${receipt.receiptNo}.pdf`);
}

// ── Invite a Friend (EmailJS, dedicated template — see EMAILJS_INVITE_TEMPLATE_ID) ─
async function sendInviteEmail({ toEmail, friendName, inviterName }) {
  const emailjs = await loadEmailJS();
  const appUrl = window.location.origin;

  const inviteHtml = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0d1f2d;border-radius:12px;overflow:hidden;border:1px solid rgba(0,200,230,.25);">

    <!-- Header -->
    <div style="background-color:#0d2d40;padding:32px 24px;text-align:center;border-bottom:1px solid rgba(0,200,230,.2);">
      <div style="font-size:36px;margin-bottom:8px">📖</div>
      <div style="font-size:20px;color:#ffd96b;margin-bottom:8px;line-height:1.6">بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ</div>
      <div style="font-size:21px;font-weight:700;color:#f0f8ff">You're Invited to Learn Qur'anic Vocabulary</div>
    </div>

    <!-- Body -->
    <div style="padding:28px 24px;background:#0d1f2d;text-align:center;">
      <p style="font-size:15px;color:#f0f8ff;line-height:1.7;margin:0 0 16px">
        Assalamu Alaikum${friendName ? " " + escapeHtml(friendName) : ""},
      </p>
      <p style="font-size:14px;color:#a9c9dc;line-height:1.8;margin:0 0 22px">
        <strong style="color:#ffd96b">${escapeHtml(inviterName)}</strong> thought you'd love to join them on a journey to understand the words of the Qur'an — learning its most frequently used vocabulary, one set of 10 words at a time, at your own pace.
      </p>
      <p style="font-size:13px;color:#7ab8d4;line-height:1.7;margin:0 0 26px;font-style:italic">
        "Whoever follows a path in pursuit of knowledge, Allah will make easy for him a path to Paradise." — Sahih Muslim
      </p>
      <a href="${appUrl}" style="display:inline-block;padding:14px 34px;background-color:#00c8e6;color:#071c2a;font-weight:700;font-size:14px;text-decoration:none;border-radius:10px">
        Begin Your Journey →
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:14px 24px;text-align:center;background:rgba(0,0,0,.2);border-top:1px solid rgba(0,200,230,.12)">
      <p style="margin:0;font-size:11px;color:rgba(122,184,212,.5)">Awami Baitulmaal Committee (Reg.) &nbsp;·&nbsp; support@awamibaitulmaal.org.in</p>
    </div>

  </div>`;

  return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_INVITE_TEMPLATE_ID, {
    to_email: toEmail,
    recipient_name: friendName || "there",
    from_email: "support@awamibaitulmaal.org.in",
    email_heading: `${inviterName} invited you to learn Qur'anic vocabulary`,
    email_body_html: inviteHtml,
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

// ── Cloudflare Turnstile (bot check on Sign Up) ─────────────────────────────
// Site key is public by design — safe to embed in client code. The secret
// key is never in this file; it lives only as a Supabase Edge Function
// secret, used server-side by verify-turnstile to actually validate tokens.
const TURNSTILE_SITE_KEY = "0x4AAAAAAD1RXCGKqZ8-xS5F";

async function verifyTurnstileToken(token) {
  if (!token) return false;
  try {
    const { data, error } = await supabase.functions.invoke("verify-turnstile", { body: { token } });
    if (error) { console.error("verify-turnstile error:", error.message); return false; }
    return !!data?.success;
  } catch (e) {
    console.error("verify-turnstile exception:", e.message);
    return false;
  }
}

// Renders a Turnstile widget via the explicit render API (more reliable in
// React than Turnstile's automatic DOM-scan, which can conflict with React's
// own re-renders). Waits for the script (loaded in index.html) if it hasn't
// finished loading yet by the time this mounts.
function TurnstileWidget({ onVerify, onExpire }) {
  const containerRef = React.useRef(null);
  const widgetIdRef = React.useRef(null);

  useEffect(() => {
    let cancelled = false;
    let pollId = null;

    const renderWidget = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "dark",
        size: "flexible",
        callback: onVerify,
        "expired-callback": () => onExpire?.(),
        "error-callback": () => onExpire?.(),
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      // Script tag has async/defer — poll briefly until it's ready.
      pollId = setInterval(() => {
        if (window.turnstile) { clearInterval(pollId); renderWidget(); }
      }, 150);
    }

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (window.turnstile && widgetIdRef.current != null) {
        try { window.turnstile.remove(widgetIdRef.current); } catch (e) { /* already gone */ }
      }
    };
  }, []);

  return <div ref={containerRef} style={{ margin: "4px 0 2px" }} />;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;600;700&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#071c2a;--s1:rgba(255,255,255,.05);--s2:rgba(255,255,255,.08);--s3:rgba(255,255,255,.12);
  --cyan:#00c8e6;--cyan2:#1ae6ff;
  --teal:#00e6b4;--teal2:#1affd4;
  --gold:#ffc940;--gold2:#ffd96b;--gold3:#ffe899;
  --text:#f0f8ff;--muted:#7ab8d4;
  --ok:#00c8e6;--err:#ff5252;
  --pal-rose:#ff8a80;--pal-teal:#00e0a0;
  --glow:rgba(0,200,230,.22);--glow2:rgba(0,200,230,.12);
}
body{background:var(--bg);color:var(--text);font-family:'Poppins',system-ui,sans-serif;min-height:100vh;font-size:17px;-webkit-font-smoothing:antialiased;overflow-x:hidden;}
html{overflow-x:hidden;}
#root{overflow-x:hidden;width:100%;max-width:100vw;}
.app{min-height:100vh;background:
  radial-gradient(ellipse 70% 45% at 15% -5%,rgba(0,180,220,.18),transparent),
  radial-gradient(ellipse 60% 60% at 88% 100%,rgba(0,180,210,.14),transparent),
  radial-gradient(ellipse 80% 50% at 50% 50%,rgba(0,0,0,.3),transparent),
  var(--bg);}
/* Masjid photo background — scoped to Home + Login/Signup only, not the whole
   app (quiz/admin/etc. keep the plain gradient background for readability).
   Applied via ::before bounded to a fixed viewport-relative height, NOT as a
   direct background on the page container — that container's height grows
   with all its scrollable content, so background-size:cover was computing
   against that full (very tall) height instead of just the visible screen,
   stretching the photo far beyond need and pushing the interesting part
   (doors, water reflection) down past where anyone would actually see it.
   Light scrim only — the photo itself should read clearly (like a WhatsApp
   chat wallpaper); text readability comes from the existing glass/card
   components' own semi-opaque backgrounds, not from darkening the whole page. */
.page-home,.page-enroll{position:relative;margin:-44px -22px;padding:44px 22px;isolation:isolate;}
.page-home::before,.page-enroll::before{
  content:"";position:absolute;top:0;left:0;right:0;height:min(640px,72vh);z-index:-1;
  background:
    linear-gradient(180deg,rgba(7,28,42,.38) 0%,rgba(7,28,42,.45) 60%,var(--bg) 100%),
    url("/images/masjid-bg.jpg");
  background-size:115% auto;background-position:center 58%;background-repeat:no-repeat;
}
.page-enroll h2,.page-enroll .sub,.page-enroll .lbl{text-shadow:0 2px 10px rgba(0,0,0,.6);}
.page-enroll > .tagline-prominent,.page-enroll > .lbl,.page-enroll > h2,.page-enroll > p.sub{text-align:center;justify-content:center;}
.tagline-prominent{
  color:var(--text)!important;font-size:19px!important;font-weight:500!important;
  text-shadow:0 2px 12px rgba(0,0,0,.7),0 0 20px rgba(0,200,230,.15);
}
.nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:13px 28px;
  background:rgba(11,26,20,.82);backdrop-filter:blur(28px) saturate(1.6);
  border-bottom:1px solid rgba(0,200,230,.22);
  box-shadow:0 4px 32px rgba(0,0,0,.5),0 1px 0 rgba(0,200,230,.15),inset 0 1px 0 rgba(255,255,255,.06);}
.nlogo{display:flex;align-items:center;gap:10px;cursor:pointer;}
.nicon{width:38px;height:38px;border-radius:50%;background:linear-gradient(145deg,#1ae6ff,#0090b8);display:flex;align-items:center;justify-content:center;font-size:21px;box-shadow:0 0 18px rgba(0,200,230,.5),0 3px 10px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.2);}
.ntext h1{font-family:'Poppins',sans-serif;font-size:20px;font-weight:700;color:var(--cyan2);letter-spacing:.02em;text-shadow:0 0 20px rgba(0,200,230,.5);}
.ntext span{font-size:12px;color:var(--muted);}
.nright{display:flex;align-items:center;gap:8px;}
.nuser-wrap{position:relative;}
.admin-mode-badge{
  font-family:'Poppins',sans-serif;font-size:13px;letter-spacing:.02em;
  color:var(--cyan2);background:rgba(0,200,230,.1);
  border:1px solid rgba(0,200,230,.35);border-radius:14px;
  padding:5px 14px;box-shadow:0 0 12px rgba(0,200,230,.15);
}
.admin-msg-badge{
  font-family:'Poppins',sans-serif;font-size:13px;letter-spacing:.01em;
  color:#fff;background:var(--err);
  border-radius:14px;padding:5px 12px;
  animation:msgPulse 2s ease-in-out infinite;
}
@keyframes msgPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,82,82,.5);}50%{box-shadow:0 0 0 6px rgba(255,82,82,0);}}
.nuser{font-size:14px;color:var(--cyan2);padding:4px 11px;border-radius:16px;background:rgba(0,200,230,.1);border:1px solid rgba(0,200,230,.3);cursor:pointer;font-family:'Poppins',sans-serif;transition:all .18s;}
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
.nuser-menu-email{padding:10px 14px;font-size:13px;color:var(--muted);border-bottom:1px solid rgba(0,200,230,.12);word-break:break-all;}
.nuser-menu-item{
  display:block;width:100%;text-align:left;
  background:none;border:none;color:var(--text);
  padding:10px 14px;font-size:15px;cursor:pointer;
  font-family:'Poppins',sans-serif;transition:background .15s;
}
.nuser-menu-item:hover{background:rgba(0,200,230,.1);color:var(--cyan2);}
.nuser-menu-item.logout{color:#ff8a80;}
.nuser-menu-item.logout:hover{background:rgba(255,82,82,.1);color:#ff5252;}
.nbtn{background:transparent;border:1px solid rgba(0,200,230,.22);color:var(--muted);padding:5px 14px;border-radius:16px;font-family:'Poppins',sans-serif;font-size:14px;cursor:pointer;transition:all .18s;}
.nbtn:hover,.nbtn.on{border-color:var(--cyan);color:var(--cyan2);box-shadow:0 0 10px rgba(0,200,230,.2);}
.ncta{background:linear-gradient(135deg,var(--cyan),#0090b8);border:none;color:#fff;padding:6px 16px;border-radius:16px;font-family:'Poppins',sans-serif;font-size:13px;cursor:pointer;font-weight:500;transition:all .2s;box-shadow:0 4px 16px rgba(0,200,230,.35);}
.ncta:hover{transform:translateY(-1px);box-shadow:0 6px 22px rgba(0,200,230,.45);}
.page{max-width:860px;margin:0 auto;padding:44px 22px;animation:fu .32s ease;}
.pmd{max-width:680px;}.psm{max-width:520px;}
@keyframes fu{from{opacity:0;transform:translateY(13px)}to{opacity:1;transform:none}}
@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes optsReset{from{opacity:.01}to{opacity:1}}
@keyframes confettiFall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}
@keyframes confettiBlast{0%{transform:translate(0,0) rotate(0deg);opacity:1}70%{opacity:1}100%{transform:translate(var(--dx),calc(var(--dy) + 45vh)) rotate(var(--spin));opacity:0}}
@keyframes glow{from{box-shadow:0 0 20px rgba(0,200,230,.4)}to{box-shadow:0 0 40px rgba(0,200,230,.8),0 0 60px rgba(0,200,230,.3)}}
.lbl{font-family:'Poppins',sans-serif;font-size:15px;letter-spacing:.02em;text-transform:uppercase;color:var(--cyan2);display:flex;align-items:center;gap:9px;margin-bottom:13px;font-weight:600;}
.lbl::before{content:'';width:28px;height:2px;background:var(--cyan2);border-radius:1px;}
.lbl::before{content:'';width:26px;height:1px;background:var(--teal);}
h2{font-family:'Poppins',sans-serif;font-size:34px;font-weight:700;margin-bottom:8px;color:var(--text);}
.sub{color:var(--muted);font-size:20px;font-weight:300;line-height:1.85;}
.arabic{font-family:'Scheherazade New',serif;direction:rtl;}
.card{
  background:rgba(255,255,255,.045);
  border:1px solid rgba(0,200,230,.22);
  border-radius:16px;padding:28px;
  backdrop-filter:blur(12px);
  box-shadow:0 8px 40px rgba(0,0,0,.45),0 0 0 1px rgba(0,200,230,.06),inset 0 1px 0 rgba(255,255,255,.07);
  animation:fu .4s ease;
}
.card+.card{margin-top:16px;}
.field{margin-bottom:16px;min-width:0;}
.field input[type="date"]{-webkit-appearance:none;appearance:none;width:100%;min-width:0;box-sizing:border-box;}
.field label{display:block;font-size:14px;color:var(--muted);margin-bottom:5px;letter-spacing:.07em;font-family:'Poppins',sans-serif;}
.field input{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(0,200,230,.2);color:var(--text);padding:11px 14px;border-radius:9px;font-family:'Poppins',sans-serif;font-size:17px;outline:none;transition:all .2s;box-shadow:inset 0 2px 8px rgba(0,0,0,.3);}
/* Edge/IE auto-add their own "reveal password" eye icon inside every
   type="password" field, which stacks/overlaps with our custom SVG eye
   toggle — suppress the native one everywhere so there's only ever one. */
input[type="password"]::-ms-reveal,
input[type="password"]::-ms-clear{display:none;}
.field input::placeholder{color:rgba(122,184,152,.5);}
.field input:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(0,200,230,.15),inset 0 2px 8px rgba(0,0,0,.2);}

/* ── ENROLLMENT — VALIDATION ERROR ── */
.enroll-error{
  font-size:14px;color:#e0a098;background:rgba(192,80,74,.08);
  border:1px solid rgba(192,80,74,.25);border-radius:7px;
  padding:9px 13px;margin:-4px 0 14px;line-height:1.5;
}

/* ── ENROLLMENT — LOGIN HINT ── */
.enroll-hint{
  font-size:13px;color:var(--muted);text-align:center;
  margin-top:12px;line-height:1.5;
}
.forgot-link{color:var(--teal2);cursor:pointer;text-decoration:underline;text-decoration-color:rgba(34,139,112,.4);}
.forgot-link:hover{color:var(--gold3);}

/* ── ENROLLMENT — AUTH MODE TABS (Login / Sign Up / Upgrade) ── */
.auth-mode-tabs{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;}
.auth-mode-tab{
  flex:1;min-width:90px;padding:9px 10px;border-radius:8px;
  background:rgba(7,28,42,.65);border:1px solid rgba(0,200,230,.22);
  color:var(--muted);font-family:'Poppins',sans-serif;font-size:13px;
  letter-spacing:.01em;cursor:pointer;transition:all .18s;
  backdrop-filter:blur(6px);
}
.auth-mode-tab:hover{border-color:rgba(0,200,230,.35);color:var(--gold3);}
.auth-mode-tab.on{background:rgba(0,150,190,.35);border-color:var(--cyan2);color:var(--cyan2);}
@keyframes tagIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}

/* ── ENROLLMENT — TYPO WARNING ── */
.enroll-typo-warning{
  background:rgba(0,200,230,.06);border:1px solid rgba(0,200,230,.22);
  border-radius:8px;padding:12px 14px;margin:-4px 0 14px;
  font-size:15px;color:var(--cyan2);line-height:1.5;
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
  font-family:'Scheherazade New',serif;font-size:28px;color:var(--cyan2);
  direction:rtl;margin-bottom:10px;
}
.enroll-sincerity p{
  font-size:15px;color:var(--muted);line-height:1.75;font-style:italic;
  max-width:420px;margin:0 auto;
}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 26px;border-radius:9px;font-family:'Poppins',sans-serif;font-size:17px;cursor:pointer;transition:all .18s;border:none;font-weight:500;}
.btn:active{transform:scale(.96);}
.bg{
  background:linear-gradient(145deg,#1ae6ff,#0090b8);color:#fff;
  box-shadow:0 5px 22px rgba(0,200,230,.5),0 2px 6px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.25);
}
.bg:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(0,200,230,.6),0 4px 12px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.3);}
.bg:active{transform:translateY(1px);box-shadow:0 2px 10px rgba(0,200,230,.3),inset 0 3px 8px rgba(0,0,0,.2);}
.bt{background:linear-gradient(145deg,#00c8e6,#0078a8);color:#fff;box-shadow:0 4px 16px rgba(0,200,230,.4),inset 0 1px 0 rgba(255,255,255,.2);}
.bt:hover{background:linear-gradient(145deg,#1ae6ff,#00c8e6);}
.bh{background:rgba(255,255,255,.06);border:1px solid rgba(0,200,230,.25);color:var(--muted);backdrop-filter:blur(8px);}
.bh:hover{border-color:var(--cyan);color:var(--cyan2);background:rgba(0,200,230,.08);transform:translateY(-1px);}
.bsm{padding:7px 16px;font-size:15px;}.bfw{width:100%;}
.btn:disabled{opacity:.35;cursor:not-allowed;transform:none!important;box-shadow:none!important;}
.srow{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px;}
.sbox{
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.15);
  border-top:1px solid rgba(255,255,255,.25);
  border-radius:14px;
  aspect-ratio:1;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:8px;
  backdrop-filter:blur(20px) saturate(1.5);
  -webkit-backdrop-filter:blur(20px) saturate(1.5);
  box-shadow:0 8px 32px rgba(0,0,0,.3),0 0 0 1px rgba(255,255,255,.05),inset 0 1px 0 rgba(255,255,255,.15),inset 0 -1px 0 rgba(0,0,0,.1);
  transition:transform .2s,box-shadow .2s;cursor:default;
  position:relative;
}
/* Islamic geometric accent inside each stat box — the same 8-point-star
   pattern used app-wide (bgUrl), sized small and kept faint via ::before so
   the number itself stays the visually dominant element. */
/* Ornate mandala artwork (user-provided, repo: public/images/stat-bg.jpg) as
   each stat box's backdrop — dimmed via opacity so the number stays dominant. */
.sbox::before{
  content:"";position:absolute;inset:0;border-radius:14px;
  background-image:url("/images/stat-bg.jpg");background-size:100% 100%;background-repeat:no-repeat;background-position:center;
  opacity:.5;pointer-events:none;
}
.sbox .sn,.sbox .sl{position:relative;z-index:1;}
.sbox:hover{transform:translateY(-4px);box-shadow:0 14px 44px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.08),0 0 24px rgba(0,200,230,.18),inset 0 1px 0 rgba(255,255,255,.18);}
.sn{font-family:'Poppins',sans-serif;font-size:clamp(18px,4.2vw,32px);font-weight:700;color:var(--gold2);text-shadow:0 0 16px rgba(255,184,0,.35),0 2px 6px rgba(0,0,0,.5);}
.sl{font-size:clamp(10px,1.8vw,13px);color:var(--muted);letter-spacing:.04em;margin-top:4px;text-transform:uppercase;text-align:center;line-height:1.3;}
.phub-header{display:flex;align-items:center;gap:16px;margin-bottom:18px;}
.phub-logout-btn{
  flex:0 0 auto;background:rgba(255,82,82,.1);border:1px solid rgba(255,82,82,.3);
  color:#ff8a80;font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:20px;
  cursor:pointer;transition:background .15s,box-shadow .15s;white-space:nowrap;
}
.phub-logout-btn:hover{background:rgba(255,82,82,.18);box-shadow:0 0 14px rgba(255,82,82,.15);}
.phub-avatar{
  width:64px;height:64px;border-radius:50%;flex:0 0 auto;
  display:flex;align-items:center;justify-content:center;
  font-family:'Poppins',sans-serif;font-size:26px;font-weight:700;color:var(--gold3);
  background:linear-gradient(135deg,rgba(0,200,230,.25),rgba(255,217,107,.2));
  border:1px solid rgba(0,200,230,.35);
  box-shadow:0 0 20px rgba(0,200,230,.15);
}
.phub-tabs{display:flex;gap:22px;border-bottom:1px solid rgba(255,255,255,.1);margin-bottom:20px;}
.phub-tab{background:none;border:none;padding:10px 2px;font-size:14px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .15s,border-color .15s;}
.phub-tab:hover:not(.on){color:var(--text);}
.phub-tab.on{color:var(--cyan2);border-bottom-color:var(--cyan2);}
.phub-section-label{font-family:'Poppins',sans-serif;font-size:15px;font-weight:600;color:var(--text);margin:20px 0 12px;}
.phub-stat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
.phub-stat-card{
  border-radius:14px;padding:16px;display:flex;align-items:center;gap:12px;
  border:1px solid rgba(255,255,255,.1);
}
.phub-stat-card.streak{background:rgba(255,138,128,.12);border-color:rgba(255,138,128,.25);}
.phub-stat-card.mastered{background:rgba(0,200,230,.12);border-color:rgba(0,200,230,.28);}
.phub-stat-card.month{background:rgba(0,224,160,.12);border-color:rgba(0,224,160,.28);}
.phub-stat-card.best{background:rgba(255,217,107,.14);border-color:rgba(255,217,107,.3);}
.phub-stat-icon{font-size:22px;flex:0 0 auto;}
.phub-stat-num{font-family:'Poppins',sans-serif;font-size:clamp(16px,3.6vw,22px);font-weight:700;color:var(--text);line-height:1.2;}
.phub-stat-label{font-size:11px;color:var(--muted);margin-top:2px;}
.phub-challenge-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
.phub-badge-card{
  border-radius:14px;padding:16px 10px;text-align:center;
  display:flex;flex-direction:column;align-items:center;gap:4px;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);
}
.phub-badge-card.current{background:rgba(0,200,230,.1);border-color:rgba(0,200,230,.35);box-shadow:0 0 18px rgba(0,200,230,.12);}
.phub-badge-card.locked{opacity:.5;}
.phub-badge-shape{
  width:46px;height:46px;border-radius:14px 14px 22px 22px;
  display:flex;align-items:center;justify-content:center;font-size:20px;
  background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);
}
.phub-badge-shape.met{background:rgba(0,224,160,.14);border-color:rgba(0,224,160,.4);}
.phub-badge-shape.missed{background:rgba(255,82,82,.1);border-color:rgba(255,82,82,.3);}
.phub-badge-shape.active{background:rgba(0,200,230,.18);border-color:var(--cyan2);box-shadow:0 0 14px rgba(0,200,230,.3);}
.phub-badge-month{font-weight:600;font-size:13px;color:var(--text);margin-top:4px;}
.phub-badge-sub{font-size:11px;color:var(--muted);}
.phub-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:20px;}
.phub-box{
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.15);
  border-top:1px solid rgba(255,255,255,.25);
  border-radius:14px;
  padding:18px;
  min-height:150px;
  display:flex;flex-direction:column;
  backdrop-filter:blur(20px) saturate(1.5);
  -webkit-backdrop-filter:blur(20px) saturate(1.5);
  box-shadow:0 8px 32px rgba(0,0,0,.3),0 0 0 1px rgba(255,255,255,.05),inset 0 1px 0 rgba(255,255,255,.15),inset 0 -1px 0 rgba(0,0,0,.1);
  transition:transform .15s,box-shadow .15s;
  position:relative;
}
.phub-box-action{cursor:pointer;align-items:center;justify-content:center;text-align:center;}
.phub-box-action:hover{transform:translateY(-2px);box-shadow:0 12px 36px rgba(0,200,230,.15),0 0 0 1px rgba(0,200,230,.2);}
.phub-box-disabled{opacity:.45;cursor:not-allowed;}
.phub-box-disabled:hover{transform:none;box-shadow:0 8px 32px rgba(0,0,0,.3),0 0 0 1px rgba(255,255,255,.05),inset 0 1px 0 rgba(255,255,255,.15),inset 0 -1px 0 rgba(0,0,0,.1);}
.phub-box-disabled .phub-desc{color:var(--gold2);}
.phub-box-action.logout:hover{box-shadow:0 12px 36px rgba(255,82,82,.12),0 0 0 1px rgba(255,82,82,.2);}
.phub-icon{font-size:26px;margin-bottom:8px;}
.phub-label{font-weight:600;font-size:14px;color:var(--text);}
.phub-desc{font-size:11px;color:var(--muted);margin-top:4px;line-height:1.4;}
.phub-target-btn{background:none;border:1px solid rgba(0,200,230,.3);color:var(--cyan2);font-size:11px;padding:4px 10px;border-radius:20px;margin-top:6px;cursor:pointer;}
.phub-target-edit{display:flex;gap:6px;margin-top:6px;align-items:center;}
.phub-target-edit input{width:60px;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.2);color:var(--text);font-size:13px;}
@media(max-width:480px){.field-row{flex-direction:column;gap:0 !important;}.phub-logout-btn{padding:7px 10px;font-size:11px;}.phub-avatar{width:52px;height:52px;font-size:21px;}}
@media(max-width:640px){
  .phub-page{padding-left:12px;padding-right:12px;}
  .phub-stat-grid{grid-template-columns:repeat(2,1fr);gap:14px;}
  .phub-stat-card{padding:20px 16px;min-height:100px;gap:14px;}
  .phub-stat-icon{font-size:30px;}
  .phub-stat-num{font-size:24px;}
  .phub-stat-label{font-size:12.5px;}
  .phub-grid{grid-template-columns:repeat(2,1fr);gap:14px;}
  .phub-box{padding:22px 16px;min-height:170px;}
  .phub-icon{font-size:34px;margin-bottom:10px;}
  .phub-label{font-size:15.5px;}
  .phub-desc{font-size:12.5px;}
  .phub-challenge-row{gap:10px;}
  .phub-badge-card{padding:18px 8px;gap:6px;}
  .phub-badge-shape{width:56px;height:56px;font-size:26px;}
  .phub-badge-month{font-size:14.5px;}
  .phub-badge-sub{font-size:12px;}
  .phub-tab{font-size:15.5px;}
}
.cal{display:grid;grid-template-columns:repeat(auto-fill,minmax(34px,1fr));gap:5px;}
.cal-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:rgba(0,200,230,.3) transparent;}
.cal-scroll::-webkit-scrollbar{height:4px;}
.cal-scroll::-webkit-scrollbar-track{background:transparent;}
.cal-scroll::-webkit-scrollbar-thumb{background:rgba(0,200,230,.3);border-radius:2px;}
.cc{aspect-ratio:1;border-radius:7px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:13px;cursor:pointer;transition:all .14s;border:1px solid transparent;min-width:40px;}
.cc.locked{background:rgba(0,0,0,.04);color:rgba(0,0,0,.18);cursor:default;}
.cc.done{background:rgba(0,200,230,.12);color:var(--ok);border-color:rgba(0,200,230,.28);}
.cc.today{background:rgba(0,180,220,.18);color:var(--cyan2);border-color:var(--cyan2);font-weight:600;}
.cc.avail{background:rgba(0,200,230,.05);color:var(--muted);border-color:rgba(0,200,230,.12);}
.cc:not(.locked):hover{border-color:var(--cyan2);color:var(--cyan2);}
.cc.cc-continues{background:transparent;cursor:default;color:var(--muted);font-size:18px;letter-spacing:1px;opacity:.5;}
.cc.selected{border-color:var(--cyan2);box-shadow:0 0 0 1px var(--teal);}
.cc-allsets{
  grid-column:span 3;aspect-ratio:auto;height:100%;min-height:34px;
  border-radius:7px;display:flex;align-items:center;justify-content:center;
  font-size:14px;font-family:'Poppins',sans-serif;font-weight:600;letter-spacing:.02em;
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
  border-radius:8px;padding:11px 14px;font-size:15px;color:var(--text);line-height:1.5;
}
.set-mastery-banner strong{color:var(--cyan2);}
.wlist{display:grid;gap:12px;}
.word-card{
  position:relative;
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
.war{font-family:'Scheherazade New',serif;font-size:39px;font-weight:600;color:var(--gold2);text-align:right;text-shadow:0 0 18px rgba(255,184,0,.3);display:flex;align-items:center;min-width:80px;}
.war-wrap{display:flex;align-items:center;gap:8px;}
.word-actions-col{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;}
.play-btn{background:rgba(0,200,230,.1);border:1px solid rgba(0,200,230,.3);border-radius:50%;
  width:28px;height:28px;font-size:13px;display:flex;align-items:center;justify-content:center;
  cursor:pointer;transition:all .15s;flex-shrink:0;color:var(--cyan2);padding:0;}
.play-btn:hover{background:rgba(0,200,230,.2);box-shadow:0 0 10px rgba(0,200,230,.3);}
.play-btn.playing{background:rgba(0,200,230,.25);border-color:var(--cyan2);}
.play-btn.error{border-color:rgba(255,82,82,.5);color:var(--err);}
.ayah-ref-link{cursor:pointer;color:var(--cyan2);text-decoration:underline;text-underline-offset:2px;}
.ayah-ref-link:hover{color:var(--cyan);}
.ayah-img-frame{
  max-height:70vh;overflow:auto;border-radius:8px;background:#fff;padding:10px;
}
/* Set 1 preview strip — scrollbar hidden; desktop gets ‹ › arrow buttons
   instead (hidden on mobile, where swipe is the natural gesture). */
.preview-scroll{scrollbar-width:none;-ms-overflow-style:none;}
.preview-scroll::-webkit-scrollbar{display:none;}
.preview-arrow{
  position:absolute;top:50%;transform:translateY(-50%);z-index:5;
  width:36px;height:36px;border-radius:50%;
  background:rgba(7,28,42,.85);border:1px solid rgba(0,200,230,.35);
  color:var(--cyan2);font-size:22px;line-height:1;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  transition:all .15s;backdrop-filter:blur(6px);
}
.preview-arrow:hover{background:rgba(0,200,230,.15);border-color:var(--cyan);}
@media(max-width:640px){.preview-arrow{display:none;}}
.wtr{font-size:15px;color:var(--muted);font-style:italic;text-align:center;display:none;}
.wen{font-size:20px;font-weight:400;color:var(--text);text-align:center;}
.word-mid{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex:1;min-width:0;}
.word-urdu{font-family:'Noto Nastaliq Urdu',serif;font-size:22px;line-height:1.9;color:var(--teal2);direction:rtl;text-align:right;text-shadow:0 0 12px rgba(0,212,168,.25);}
.word-toggle{
  background:rgba(0,200,230,.08);border:1px solid rgba(0,200,230,.28);
  color:var(--muted);font-size:13px;padding:5px 10px;border-radius:8px;
  cursor:pointer;transition:all .15s;white-space:nowrap;
}
.word-toggle:hover{border-color:var(--cyan);color:var(--cyan2);background:rgba(0,200,230,.14);box-shadow:0 0 12px rgba(0,200,230,.2);}
.word-card-detail{
  position:relative;z-index:2;
  margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,200,230,.1);
  display:grid;grid-template-columns:auto 1fr;gap:7px 16px;font-size:16px;
  animation:tagIn .15s ease;
}
.word-card-detail-compact{margin-top:8px;padding-top:8px;font-size:13px;gap:4px 10px;}
.word-card-detail-compact .dlabel{font-size:11px;}
.word-card-detail .dlabel{color:var(--muted);font-family:'Poppins',sans-serif;font-size:13px;letter-spacing:.07em;text-transform:uppercase;}
.word-card-detail .dval{color:var(--text);}
.word-card-detail .dval.arabic{font-family:'Scheherazade New',serif;font-size:32px;font-weight:600;color:var(--gold2);direction:rtl;text-align:left;text-shadow:0 0 14px rgba(255,184,0,.25);}
.word-card-detail .dval.urdu{font-family:'Noto Nastaliq Urdu',serif;font-size:26px;line-height:1.9;font-weight:600;color:var(--teal2);direction:rtl;text-align:left;}
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
.qdir{font-family:'Poppins',sans-serif;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--teal2);margin-bottom:18px;font-weight:500;}
.qq{font-size:80px;color:var(--gold2);line-height:1.18;margin-bottom:6px;font-weight:700;text-shadow:0 0 30px rgba(255,184,0,.45),0 2px 8px rgba(0,0,0,.4);}
.qtr{font-size:16px;color:var(--muted);font-style:italic;margin-bottom:38px;}
.opts{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.opt{
  background:rgba(255,255,255,.06);
  border:1px solid rgba(0,180,220,.18);
  border-bottom:2px solid rgba(0,200,230,.28);
  color:var(--text);padding:17px 14px;border-radius:13px;
  font-family:'Poppins',sans-serif;font-size:20px;cursor:pointer;
  transition:all .15s;line-height:1.5;
  backdrop-filter:blur(8px);
  -webkit-tap-highlight-color:transparent;
  -webkit-touch-callout:none;
  box-shadow:0 4px 16px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.08);
  min-height:82px;display:flex;flex-direction:column;gap:4px;align-items:center;justify-content:center;text-align:center;
}
.opt-en{font-size:20px;}
.opt-ur{font-family:'Noto Nastaliq Urdu',serif;font-size:24px;line-height:1.9;color:var(--teal2);direction:rtl;}
.opt:hover:not(:disabled){
  border-color:rgba(0,200,230,.5);border-bottom-color:rgba(0,200,230,.5);
  color:var(--cyan2);
  background:rgba(0,200,230,.1);
  transform:translateY(-2px);
  box-shadow:0 8px 28px rgba(0,0,0,.4),0 0 20px rgba(0,180,220,.18),inset 0 1px 0 rgba(255,255,255,.1);
}
.opt:active:not(:disabled){transform:translateY(1px);box-shadow:0 2px 8px rgba(0,0,0,.3),inset 0 3px 10px rgba(0,0,0,.2);}
.opt:disabled{cursor:default;pointer-events:none;transform:none;}
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
.rpct{font-family:'Poppins',sans-serif;font-size:42px;font-weight:500;color:var(--cyan2);line-height:1;text-shadow:0 0 20px rgba(0,220,255,.5);}
.rfrac{font-size:14px;color:var(--muted);letter-spacing:.07em;}
.miss{padding:11px 15px;border-radius:7px;background:rgba(192,80,74,.06);border:1px solid rgba(192,80,74,.18);display:grid;grid-template-columns:auto 1fr auto;gap:11px;align-items:center;margin-bottom:7px;font-size:15px;}
.lbrow{display:flex;align-items:center;gap:14px;padding:11px 14px;border-radius:7px;transition:background .14s;}
.lbrow:hover{background:rgba(0,200,230,.07);}
.lbrank{font-family:'Poppins',sans-serif;font-size:14px;color:var(--muted);width:26px;text-align:center;}
.lbrank.top{color:var(--cyan2);}
.lbinfo{flex:1;}
.lbname{font-size:18px;}
.lbmeta{font-size:13px;color:var(--muted);}
.lbsc{font-family:'Poppins',sans-serif;font-size:17px;color:var(--cyan2);}
.lbbadge{font-size:12px;background:rgba(0,200,230,.08);color:var(--cyan2);padding:2px 7px;border-radius:9px;border:1px solid rgba(0,180,220,.18);}
.tabs{display:flex;gap:3px;background:rgba(255,255,255,.06);border-radius:9px;padding:3px;margin-bottom:20px;}
.tab{flex:1;padding:7px 10px;border-radius:7px;border:none;background:transparent;color:var(--muted);font-family:'Poppins',sans-serif;font-size:14px;cursor:pointer;transition:all .18s;}
.tab:hover:not(.on){color:var(--cyan2);background:rgba(0,200,230,.05);}
.tab:active{transform:scale(.96);}
.tab.on{background:var(--s1);color:var(--cyan2);border:1px solid rgba(0,180,220,.18);}
.tab-badge{display:inline-block;background:var(--err);color:#fff;font-size:12px;border-radius:9px;padding:1px 6px;margin-left:4px;}

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
.msg-icon{font-size:21px;text-align:center;}
.msg-title{font-size:16px;color:var(--text);display:flex;align-items:center;gap:6px;}
.msg-title strong{color:var(--cyan2);}
.msg-new-dot{width:7px;height:7px;border-radius:50%;background:var(--err);display:inline-block;}
.msg-sub{font-size:14px;color:var(--muted);margin-top:3px;}
.msg-date{font-size:12px;color:var(--muted);margin-top:4px;opacity:.7;}
.msg-actions{display:flex;flex-direction:column;gap:6px;align-items:flex-end;}
.msg-actions .btn{white-space:nowrap;}

.tbl{width:100%;border-collapse:collapse;font-size:14px;}
.tbl th{text-align:left;padding:7px 10px;color:var(--muted);font-weight:400;font-size:12px;letter-spacing:.01em;border-bottom:1px solid rgba(0,200,230,.1);}
.tbl td{padding:9px 10px;border-bottom:1px solid rgba(0,0,0,.05);vertical-align:middle;}
.del{background:none;border:none;color:var(--muted);cursor:pointer;font-size:15px;}.del:hover{color:var(--err);}
.hero{text-align:center;padding:54px 18px 38px;}
.bism{font-family:'Scheherazade New',serif;font-size:71px;font-weight:700;color:var(--gold2);direction:rtl;margin-bottom:20px;line-height:1.45;text-shadow:0 0 40px rgba(255,184,0,.5),0 2px 8px rgba(0,0,0,.5);}
.hero h2{font-size:44px;font-weight:500;color:var(--text);text-shadow:0 2px 10px rgba(0,0,0,.6);}.hero h2 em{color:var(--cyan2);font-style:normal;text-shadow:0 0 20px rgba(0,220,255,.35),0 2px 10px rgba(0,0,0,.6);}
.hero .sub{max-width:500px;margin:0 auto 30px;font-size:21px;text-shadow:0 1px 8px rgba(0,0,0,.6);}
.streak{display:inline-flex;align-items:center;gap:6px;
  background:rgba(0,200,230,.1);
  border:1px solid rgba(0,200,230,.35);border-radius:14px;padding:6px 14px;
  font-size:15px;font-weight:500;color:var(--cyan2);
  box-shadow:0 0 16px rgba(0,200,230,.2),inset 0 1px 0 rgba(255,255,255,.08);}
.toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);
  background:rgba(11,26,20,.95);backdrop-filter:blur(20px);
  border:1px solid var(--cyan);color:var(--cyan2);
  padding:10px 22px;border-radius:22px;font-size:16px;font-weight:500;
  z-index:999;animation:tin .28s ease;
  box-shadow:0 8px 32px rgba(0,0,0,.5),0 0 20px rgba(0,200,230,.25);white-space:nowrap;}
@keyframes tin{from{opacity:0;transform:translateX(-50%) translateY(9px)}}

/* ── DONATE BUTTON ── */
.ndonate{
  display:inline-flex;align-items:center;gap:6px;
  background:transparent;
  border:1px solid rgba(0,200,230,.3);
  color:var(--cyan2);padding:5px 14px;border-radius:16px;
  font-family:'Poppins',sans-serif;font-size:14px;cursor:pointer;transition:all .2s;
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
.modal-head h3{font-family:'Poppins',sans-serif;font-size:20px;font-weight:500;color:var(--cyan2);text-shadow:0 0 16px rgba(0,220,255,.3);}
.modal-close{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:var(--muted);font-size:21px;cursor:pointer;line-height:1;padding:3px 8px;border-radius:6px;transition:all .15s;}
.modal-close:hover{color:var(--text);background:rgba(255,255,255,.1);}
.modal-body{padding:22px 24px 26px;}

/* ── DONATE — FREQUENCY SELECTOR ── */
.freq-row{display:flex;gap:8px;margin-bottom:16px;}
.freq-pill{
  flex:1;padding:9px 10px;border-radius:8px;
  background:rgba(255,255,255,.06);border:1px solid rgba(0,200,230,.2);
  color:var(--muted);font-family:'Poppins',sans-serif;font-size:14px;
  letter-spacing:.01em;cursor:pointer;transition:all .18s;
}
.freq-pill:hover{border-color:rgba(0,200,230,.4);color:var(--cyan2);}
.freq-pill.on{background:rgba(0,200,230,.16);border-color:var(--cyan);color:var(--cyan2);box-shadow:0 0 12px rgba(0,200,230,.2);}

/* ── DONATE — RECURRING SETUP (UPI) ── */
.recurring-box{
  background:rgba(0,200,230,.06);border:1px solid rgba(0,200,230,.2);
  border-radius:10px;padding:22px 22px 18px;text-align:center;
}
.recurring-icon{font-size:34px;margin-bottom:8px;}
.recurring-box h4{font-family:'Poppins',sans-serif;font-size:16px;color:var(--gold2);font-weight:400;margin-bottom:8px;}
.recurring-box p{font-size:14px;color:var(--muted);line-height:1.6;margin-bottom:14px;}
.recurring-steps{
  text-align:left;font-size:14px;color:var(--text);
  line-height:1.8;margin:0 0 12px;padding-left:20px;
}
.recurring-steps li{margin-bottom:6px;}
.recurring-steps li strong{color:var(--gold3);}

/* ── DONATE — BANK TRANSFER BY REQUEST (shown to everyone; UPI is the only self-service method) ── */
.bank-login-prompt{
  background:rgba(26,107,90,.07);border:1px solid rgba(34,139,112,.2);
  border-radius:8px;padding:13px 15px;margin-top:14px;
  font-size:14px;color:#7acfb8;line-height:1.6;text-align:center;
}
.bank-login-prompt strong{color:var(--teal2);}

/* ── DONATE TABS ── */
.dtabs{display:flex;gap:3px;background:rgba(0,0,0,.3);border-radius:8px;padding:3px;margin-bottom:22px;border:1px solid rgba(0,200,230,.15);}
.dtab{flex:1;padding:7px;border-radius:6px;border:none;background:transparent;color:var(--muted);font-family:'Poppins',sans-serif;font-size:15px;cursor:pointer;transition:all .18s;}
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
  gap:8px;color:#666;font-size:13px;
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
.qr-upi{font-size:16px;color:var(--text);margin-bottom:4px;font-weight:400;}
.qr-upiid{font-family:'Courier New',monospace;font-size:17px;color:var(--gold2);background:rgba(0,0,0,.3);padding:7px 16px;border-radius:7px;display:inline-block;margin-top:6px;border:1px solid rgba(255,184,0,.3);}
.copy-btn{background:rgba(0,200,230,.1);border:1px solid rgba(0,200,230,.3);color:var(--cyan2);padding:6px 14px;border-radius:6px;font-size:13px;cursor:pointer;transition:all .18s;margin-top:8px;}
.copy-btn:hover{border-color:var(--cyan2);background:rgba(0,180,220,.18);box-shadow:0 0 10px rgba(0,200,230,.2);}

/* ── BANK DETAILS ── */
.bank-row{display:flex;justify-content:space-between;align-items:flex-start;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.06);gap:12px;}
.bank-row:last-child{border:none;}
.bank-label{font-size:13px;color:var(--muted);letter-spacing:.02em;flex-shrink:0;padding-top:2px;}
.bank-value{font-size:16px;color:var(--text);text-align:right;word-break:break-all;}
.bank-value.mono{font-family:'Courier New',monospace;font-size:15px;color:var(--gold2);}

/* ── DONATE FOOTER ── */
.donate-ayah{
  text-align:center;margin-top:20px;padding-top:16px;
  border-top:1px solid rgba(0,200,230,.14);
}
.donate-ayah .arabic{font-size:25px;color:var(--gold2);margin-bottom:6px;}
.donate-ayah p{font-size:14px;color:var(--muted);font-style:italic;}

/* ── COMPACT DONATE STRIP (replaces the old large banner) ── */
.donate-strip{
  display:flex;align-items:center;justify-content:space-between;gap:14px;
  background:rgba(0,200,230,.05);border:1px solid rgba(0,200,230,.14);
  border-radius:8px;padding:12px 18px;margin-top:16px;
  cursor:pointer;transition:all .18s;flex-wrap:wrap;
}
.donate-strip:hover{background:rgba(0,200,230,.09);border-color:rgba(0,200,230,.25);}
.donate-strip span:first-child{font-size:15px;color:var(--muted);}
.donate-strip-cta{font-family:'Poppins',sans-serif;font-size:14px;color:var(--cyan2);font-weight:500;white-space:nowrap;}

/* ── HOMEPAGE — ALL SETS QUIZ BEST-ATTEMPT RIBBON ── */
.allsets-ribbon{
  display:flex;align-items:center;gap:14px;
  cursor:pointer;transition:all .18s;
}
.allsets-ribbon:hover{border-color:rgba(0,200,230,.25);}
.allsets-ribbon-icon{font-size:30px;flex-shrink:0;}
.allsets-ribbon-text{flex:1;min-width:0;}
.allsets-ribbon-title{font-family:'Poppins',sans-serif;font-size:13px;letter-spacing:.02em;color:var(--cyan2);text-transform:uppercase;margin-bottom:4px;}
.allsets-ribbon-detail{font-size:16px;color:var(--text);line-height:1.5;}
.allsets-ribbon-detail strong{color:var(--cyan2);}
.allsets-ribbon-arrow{font-size:21px;color:var(--muted);flex-shrink:0;}
.btn-donate{
  background:linear-gradient(135deg,var(--teal),var(--teal2));
  border:none;color:#fff;padding:10px 22px;border-radius:8px;
  font-family:'Poppins',sans-serif;font-size:14px;cursor:pointer;
  transition:all .2s;font-weight:500;white-space:nowrap;flex-shrink:0;
}
.btn-donate:hover{transform:translateY(-1px);box-shadow:0 5px 18px rgba(0,200,230,.25);}

/* ── QUIZ EXIT BUTTON ── */
.quiz-exit{
  background:transparent;border:1px solid rgba(192,80,74,.3);
  color:#c0504a;padding:3px 11px;border-radius:14px;
  font-size:13px;cursor:pointer;transition:all .18s;font-family:'Poppins',sans-serif;
}
.quiz-exit:hover{background:rgba(192,80,74,.08);border-color:var(--err);color:#a03030;}

/* ── QUIZ TIMER ── */
.quiz-timer{
  font-family:'Poppins',sans-serif;font-size:15px;color:var(--cyan2);
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
.chart-col{padding:16px 14px;display:flex;flex-direction:column;height:365px;transition:transform .25s ease,box-shadow .25s ease;}
.chart-col:hover{transform:translateY(-3px);box-shadow:0 14px 44px rgba(0,0,0,.4),0 0 0 1px rgba(0,200,230,.1);}
.chart-col-teal{background:rgba(0,224,160,.07);border-color:rgba(0,224,160,.25);}
.chart-col-cyan{background:rgba(0,200,230,.08);border-color:rgba(0,200,230,.28);}
.chart-col-gold{background:rgba(255,217,107,.08);border-color:rgba(255,217,107,.28);}
.chart-col-rose{background:rgba(255,138,128,.07);border-color:rgba(255,138,128,.25);}
.chart-col-head{min-height:28px;display:flex;align-items:flex-start;flex-shrink:0;padding-bottom:14px;}
.chart-col-head .lbl{font-size:13px;letter-spacing:0;line-height:1.3;}
.chart-col-inner{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;}
.chart-empty{text-align:center;color:var(--muted);font-size:14px;padding:36px 10px;}
@media(max-width:640px){.chart-row{grid-template-columns:1fr;}}

.hist-row{
  display:grid;grid-template-columns:56px 1fr 20px;align-items:center;gap:14px;
  padding:14px 16px;border-radius:8px;cursor:pointer;transition:background .15s;
  border-bottom:1px solid rgba(0,0,0,.05);
}
.hist-row:last-child{border-bottom:none;}
.hist-row:hover{background:rgba(255,255,255,.06);}
.hist-pct{font-family:'Poppins',sans-serif;font-size:23px;text-align:center;}
.hist-title{font-size:17px;color:var(--text);}
.hist-date{font-size:14px;color:var(--muted);margin-top:2px;}
.hist-arrow{color:var(--muted);font-size:18px;text-align:center;transition:color .15s;}
.hist-row:hover .hist-arrow{color:var(--cyan2);}

/* ── ANSWER REVIEW ── */
.review-answer-note{
  font-size:14px;padding:8px 16px 12px;line-height:1.5;
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
    font-family:'Poppins',sans-serif;font-size:12px;cursor:pointer;
    padding:4px 10px;border-radius:8px;transition:color .18s,transform .15s;
    -webkit-tap-highlight-color:transparent;
  }
  .mnav-btn.on{color:var(--cyan2);}
  .mnav-btn:active{color:var(--teal2);transform:scale(.92);}
  .mnav-icon{font-size:21px;line-height:1;}
  /* Push page content above bottom nav */
  .app{padding-bottom:60px;}
}

/* ── Tablet ≤768px ── */
@media(max-width:768px){
  .nav{padding:10px 16px;}
  .ntext span{display:none;}
  .ntext h1{font-size:16px;}
  h2{font-size:28px;}
  .page{padding:28px 16px;}
  .page-home,.page-enroll{margin:-28px -16px;padding:28px 16px;}
  .hero{padding:36px 14px 26px;}
  .bism{font-size:44px;}
  .hero h2{font-size:30px;}
  .chart-row{grid-template-columns:1fr;}
  .qcard{padding:28px 20px;}
  .modal-body{padding:18px 20px 22px;}
}

/* ── Mobile ≤600px ── */
@media(max-width:600px){

  /* NAV — hide secondary nav links; keep user chip, donate, CTA */
  .nav{padding:9px 12px;}
  .ntext h1{font-size:15px;}
  .ntext span{display:none;}
  .nbtn{display:none;}
  .ndonate{padding:4px 10px;font-size:13px;}
  .ncta{padding:5px 12px;font-size:12px;letter-spacing:.02em;}
  .nuser{font-size:13px;padding:4px 8px;}
  .nright{gap:5px;}

  /* PAGE & HERO */
  .page{padding:18px 12px;}
  .page-home,.page-enroll{margin:-18px -12px;padding:18px 12px;}
  .hero{padding:24px 12px 18px;}
  .bism{font-size:39px;}
  .hero h2{font-size:25px;}
  .hero .sub{font-size:17px;margin-bottom:20px;}
  h2{font-size:25px;}
  .sub{font-size:17px;}
  .lbl{font-size:10px;}
  .card{padding:16px 14px;}

  /* STATS GRID — 2 columns, big numbers */
  .srow{grid-template-columns:repeat(2,1fr);gap:10px;}
  .sn{font-size:12vw;font-weight:700;}
  .sl{font-size:12px;padding:0 4px;}
  .sbox{padding:8px;}

  /* WORD CARD — 3-col on mobile too */
  .word-card-main{
    grid-template-columns:auto 1fr auto;
    gap:8px 10px;
  }
  .war{font-size:30px;min-width:60px;}
  .wtr{display:none;}
  .wen{font-size:17px;}
  .word-urdu{font-size:20px;}
  .word-toggle{align-self:center;}

  /* QUIZ */
  .opts{grid-template-columns:1fr;}
  .opt{min-height:64px;}
  .qq{font-size:53px;}
  .qcard{padding:20px 14px;}
  .qtr{margin-bottom:20px;}
  .qwrap{padding:0;}

  /* QUIZ RESULTS */
  .rring{width:108px;height:108px;}
  .rpct{font-size:32px;}
  .miss{grid-template-columns:auto 1fr;gap:8px;font-size:14px;}

  /* MODAL — edge-to-edge */
  .modal-overlay{padding:8px;}
  .modal{border-radius:10px;}
  .modal-head{padding:13px 15px 11px;}
  .modal-body{padding:14px 15px 18px;}

  /* DONATE */
  .donate-strip{flex-direction:column;text-align:center;gap:8px;}
  .qr-upiid{font-size:15px;word-break:break-all;}
  .freq-row{gap:5px;}
  .freq-pill{font-size:13px;padding:7px 6px;}

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
  .lbname{font-size:16px;}
  .lbbadge{display:none;}

  /* MISC */
  .wrow{grid-template-columns:1fr 2fr;}
  .tabs{gap:2px;}
  .tab{font-size:13px;padding:6px 7px;}
  .btn{padding:9px 18px;font-size:15px;}
  .bism{line-height:1.3;}
  .streak{font-size:13px;padding:4px 10px;}
}

/* ── Small phones ≤400px ── */
@media(max-width:400px){
  .nicon{width:30px;height:30px;font-size:15px;}
  .ntext h1{font-size:14px;}
  .ndonate{display:none;}
  .bism{font-size:32px;}
  .hero h2{font-size:22px;}
  .qq{font-size:46px;}
  .sn{font-size:11vw;font-weight:700;}
  .war{font-size:26px;}
  .ncta{font-size:12px;padding:5px 10px;}
  .srow{gap:8px;}
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
.gate-icon{font-size:60px;margin-bottom:16px;line-height:1;}
.gate-bism{
  font-family:'Scheherazade New',serif;font-size:44px;font-weight:700;
  color:var(--gold2);direction:rtl;margin-bottom:20px;line-height:1.5;
  text-shadow:0 0 30px rgba(255,184,0,.4);
}
.gate-title{font-family:'Poppins',sans-serif;font-size:25px;font-weight:500;color:var(--text);margin-bottom:6px;}
.gate-sub{font-size:16px;color:var(--muted);line-height:1.7;margin-bottom:28px;}
.gate-badge{
  display:inline-block;font-size:12px;font-family:'Poppins',sans-serif;
  letter-spacing:.01em;color:var(--cyan2);
  background:rgba(0,200,230,.1);border:1px solid rgba(0,200,230,.28);
  border-radius:20px;padding:4px 14px;margin-bottom:28px;
}
.gate-input{
  width:100%;background:rgba(255,255,255,.06);
  border:1.5px solid rgba(0,200,230,.25);
  color:var(--text);padding:14px 18px;border-radius:11px;
  font-family:'Poppins',sans-serif;font-size:18px;letter-spacing:.05em;
  text-align:center;outline:none;transition:all .2s;
  box-shadow:inset 0 2px 8px rgba(0,0,0,.3);
  margin-bottom:10px;
}
.gate-input::placeholder{color:rgba(122,184,152,.35);letter-spacing:.02em;font-size:15px;font-family:'Poppins',sans-serif;}
.gate-input:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(0,200,230,.15),inset 0 2px 8px rgba(0,0,0,.2);}
.gate-input.shake{animation:gateShake .4s ease;}
@keyframes gateShake{0%,100%{transform:none}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}
.gate-err{font-size:14px;color:#ff8a80;margin-bottom:10px;min-height:16px;transition:opacity .2s;}
.gate-btn{
  width:100%;background:linear-gradient(145deg,#1ae6ff,#0090b8);
  color:#fff;border:none;padding:14px;border-radius:11px;
  font-family:'Poppins',sans-serif;font-size:16px;letter-spacing:.01em;
  cursor:pointer;transition:all .2s;font-weight:500;
  box-shadow:0 5px 22px rgba(0,200,230,.5),inset 0 1px 0 rgba(255,255,255,.2);
}
.gate-btn:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(0,200,230,.6);}
.gate-btn:active{transform:translateY(1px);box-shadow:0 2px 10px rgba(0,200,230,.3);}
.gate-footer{margin-top:24px;font-size:13px;color:rgba(122,184,152,.45);line-height:1.7;}
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
  regdNo:        null,  // Trust/Society registration number, once confirmed (e.g. "255/2015")
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
        <PasswordInput
          className={`gate-input${shake ? " shake" : ""}`}
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
  // ?receipt=ABM-2026-001 in the URL (from the receipt email's "Download as
  // PDF" link) opens the no-login-required download page, pre-filled.
  const receiptParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("receipt") : null;
  const [view, setView] = useState(isAdminRoute ? "admin" : isFinanceRoute ? "finance" : "home");
  const [user, setUser] = useState(() => storageGet("qv_user") || null); // instant restore on PWA reload — Supabase session reconciles async
  const userRef = React.useRef(null);
  React.useEffect(() => { userRef.current = user; }, [user]);
  // allWords: instant-painted from the last successful Supabase fetch (cached
  // in qv_words_cache, same pattern as qv_user), then reconciled for real via
  // fetchAllWords() in the init effect below. Built-in and custom words are
  // both just rows in one table now; no more separate overrides system.
  const [allWords, setAllWordsState] = useState(() => storageGet("qv_words_cache") || []);
  const setAllWords = (words) => {
    setAllWordsState(words);
    storageSet("qv_words_cache", words);
  };
  const [totalWordCount, setTotalWordCount] = useState(null); // real total, visible even to anon (see fetchTotalWordCount)
  const [participants, setParticipants] = useState([]);
  const [quiz, setQuiz] = useState(null);
  const quizRef = React.useRef(null);
  React.useEffect(() => { quizRef.current = quiz; }, [quiz]);
  const [optsVisible, setOptsVisible] = useState(true);
  const [toast, setToast] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showDonate, setShowDonate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [gateWarning, setGateWarning] = useState(null);
  const [pendingResetEmail, setPendingResetEmail] = useState(""); // carries email into the "Enter Reset Code" screen
  const [reviewing, setReviewing] = useState(null);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showFinanceMenu, setShowFinanceMenu] = useState(false);
  const [adminProfileOpen, setAdminProfileOpen] = useState(false);
  const [financeProfileOpen, setFinanceProfileOpen] = useState(false);
  const [passwordChangeRequests, setPasswordChangeRequests] = useState([]); // Admin's view of all requests
  const [showNotifCenter, setShowNotifCenter] = useState(false);
  // Admin unlock is session-only (sessionStorage, not localStorage) — closing
  // the browser tab re-locks it. This is intentionally separate from regular
  // learner accounts; it gates the single shared Admin password, not a
  // per-user login (that's #5, for learners).
  const [adminUnlocked, setAdminUnlocked] = useState(() => sessionStorage.getItem("qv_admin_unlocked") === "1");
  const [financeUnlocked, setFinanceUnlocked] = useState(() => sessionStorage.getItem("qv_finance_unlocked") === "1");
  const [messages, setMessages] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [receiptRequests, setReceiptRequests] = useState([]);
  const [showRequestReceipt, setShowRequestReceipt] = useState(false);

  useEffect(() => {
    setMessages(getMessages());

    // Runs for EVERY visitor, logged in or not — RLS scopes the actual
    // result correctly either way (anon gets Set 1 only, thanks to the
    // words_anon_preview policy; a logged-in user gets everything). Without
    // this, a not-yet-logged-in visitor never even attempts a words fetch
    // at all and is stuck on whatever's in the (often empty, e.g. a fresh
    // Incognito tab) local cache until they log in.
    fetchAllWords().then(words => { if (words) setAllWords(words); });
    fetchTotalWordCount().then(count => { if (count !== null) setTotalWordCount(count); });

    // ── Supabase: load every participant's profile + scores + progress ──────
    // Two bulk queries (not one per participant) — RLS means a regular
    // learner's queries only ever return their own scores/progress rows,
    // while admin/finance see everyone's (see scores_select/progress_select
    // policies). Either way this fetch pattern is correct as-is.
    //
    // IMPORTANT: after the users_read_all -> users_own_or_staff_read RLS
    // fix (closing the public-email-exposure gap), a direct `.from("users")`
    // query only returns the CALLER'S OWN row for non-staff — which would
    // silently break the Leaderboard for every non-admin viewer (each
    // learner would only ever see themselves). get_leaderboard_data() is a
    // narrow SECURITY DEFINER RPC that returns every learner's name/userId/
    // progress (deliberately NOT email) so the Leaderboard keeps working for
    // everyone, anon included, while the email-privacy fix stays intact.
    const loadParticipants = async () => {
      // Admin/Finance are real accounts in this same table now, but they're
      // staff, not learners — excluded here at the source so they can never
      // appear in member counts, Leaderboard, or (importantly) the "Delete
      // Participant" list, where someone could otherwise remove them by mistake.
      const { data: parts } = await supabase.from("users").select("*").neq("role", "admin").neq("role", "finance");
      const { data: publicParts } = await supabase.rpc("get_leaderboard_data");
      const { data: allScores } = await supabase.from("scores").select("*").order("quiz_date", { ascending: true });
      const { data: allProgress } = await supabase.from("progress").select("*");

      // Merge: the direct query (full row, may include email) wins when
      // present; the public RPC fills in every other learner the direct
      // query couldn't see (email intentionally absent from that source).
      const byId = new Map();
      (publicParts || []).forEach(p => byId.set(p.id, {
        userId: p.user_id, name: p.name, email: null,
        enrolledAt: p.enrolled_at, role: "learner", dbId: p.id,
        dayProgress: p.day_progress || {}, emailVerified: true, supabaseId: null,
      }));
      (parts || []).forEach(p => byId.set(p.id, {
        userId: p.user_id, name: p.name, email: p.email,
        enrolledAt: p.enrolled_at, role: p.role || "learner", dbId: p.id,
        dayProgress: (allProgress || []).find(pr => pr.user_id === p.id)?.day_progress || byId.get(p.id)?.dayProgress || {},
        emailVerified: true, supabaseId: p.auth_id,
      }));

      const merged = Array.from(byId.values());
      if (merged.length) setParticipants(merged.map(p => ({
        ...p,
        scores: (allScores || []).filter(s => s.user_id === p.dbId).map(mapScoreRow),
      })));
    };

    // ── Supabase: restore session on page load ──────────────────────────────
    const loadSession = async () => {
      // Email confirmation (signup) still arrives via URL hash — let
      // onAuthStateChange handle it, don't load an existing session over it.
      // Password reset no longer uses a clickable link at all (see
      // verifyResetCodeAndSetPassword below) — Outlook's Safe Links feature
      // silently "uses up" one-time reset links before the user ever clicks
      // them, which is why this moved to a 6-digit code the user types in.
      const hash = window.location.hash;
      if (hash.includes("type=signup")) {
        return;
      }

      // ── PWA reload fix: restore user INSTANTLY from localStorage so an
      // iPhone app-switch (which often fully reloads the PWA) never shows a
      // logged-out flash. Supabase then verifies the session in background —
      // if it's genuinely gone, we sign the user out properly.
      const cached = storageGet("qv_user");
      if (cached?.userId) setUser(cached);

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await loadUserProfile(session.user.id, { silent: !!cached });
        // Re-fetch words/receipts now that we're actually authenticated — the
        // calls at the top of this effect only ever run once, at page mount,
        // before any session could possibly be confirmed yet (so they run as
        // anon and correctly get blocked by RLS). Without this, allWords and
        // receipts would stay empty for the rest of the session even when
        // reloading with an already-valid login.
        fetchAllWords().then(words => { if (words) setAllWords(words); });
        fetchAllReceipts().then(r => { if (r) setReceipts(r); });
        fetchReceiptRequests().then(r => { if (r) setReceiptRequests(r); });
        fetchAllPasswordChangeRequests().then(r => { if (r) setPasswordChangeRequests(r); });
      } else {
        if (cached) {
          // Supabase session truly expired — clear the optimistic restore
          setUser(null);
          storageRemove("qv_user");
        }
        // Same idea for Admin/Finance — sessionStorage's flag is only ever an
        // optimistic instant-restore hint; no real session means it's stale.
        if (sessionStorage.getItem("qv_admin_unlocked") === "1") {
          setAdminUnlocked(false);
          sessionStorage.removeItem("qv_admin_unlocked");
        }
        if (sessionStorage.getItem("qv_finance_unlocked") === "1") {
          setFinanceUnlocked(false);
          sessionStorage.removeItem("qv_finance_unlocked");
        }
      }

      // Load participants (profiles + scores + progress) from Supabase
      await loadParticipants();
    };
    loadSession();

    // ── Supabase: listen for auth events (login, verify, logout) ───────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Safety net for a genuine incoming recovery link Supabase detects on
      // its own (not currently used — the app is fully code-based now, no
      // clickable links — but kept as a defensive fallback). Only acts when
      // isPasswordRecovery.current is still false, meaning OUR code didn't
      // already know this was coming — both the learner's ResetPasswordPage
      // and Finance's in-modal flow set that flag themselves before calling
      // verifyOtp(type:'recovery'), which itself also fires this same event.
      // Without this guard, Finance's flow would get its screen hijacked to
      // this generic page right after successfully finishing inline.
      if (event === "PASSWORD_RECOVERY") {
        if (isPasswordRecovery.current) return;
        isPasswordRecovery.current = true;
        // Clear any existing logged-in user so wrong account doesn't show
        setUser(null);
        storageRemove("qv_user");
        setView("resetPassword");
        return;
      }
      if (event === "SIGNED_IN" && session) {
        // Don't auto-login during password recovery — user must set new password first
        if (isPasswordRecovery.current) return;
        // iOS/PWA fires SIGNED_IN on every token refresh when the app regains
        // focus — if this user is already logged in, reload silently (no toast,
        // no navigation) so they stay exactly where they were.
        const alreadyLoggedIn = userRef.current?.supabaseId === session.user.id;
        await loadUserProfile(session.user.id, { silent: alreadyLoggedIn });
        await loadParticipants();
        // Re-fetch words/receipts now that we're actually authenticated — the
        // calls at the top of this effect only ever run once, at page mount,
        // before any login could possibly have happened yet (so they run as
        // anon and correctly get blocked by RLS). Without this, allWords and
        // receipts would stay empty for a learner's entire session even after
        // a successful login.
        fetchAllWords().then(words => { if (words) setAllWords(words); });
        fetchAllReceipts().then(r => { if (r) setReceipts(r); });
        fetchReceiptRequests().then(r => { if (r) setReceiptRequests(r); });
        fetchAllPasswordChangeRequests().then(r => { if (r) setPasswordChangeRequests(r); });
      }
      if (event === "USER_UPDATED" && session?.user) {
        // Email change confirmed — sync public.users with the new auth email
        await supabase.from("users").update({ email: session.user.email }).eq("auth_id", session.user.id);
      }
      if (event === "SIGNED_OUT") {
        setUser(null);
        storageRemove("qv_user");
        isPasswordRecovery.current = false;
        setAdminUnlocked(false);
        setFinanceUnlocked(false);
        sessionStorage.removeItem("qv_admin_unlocked");
        sessionStorage.removeItem("qv_finance_unlocked");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Track if we're in password recovery flow — prevents SIGNED_IN from auto-logging in
  const isPasswordRecovery = React.useRef(false);

  // Load user profile from Supabase users table
  // Profile is auto-created by database trigger when auth user signs up
  const loadUserProfile = async (authId, opts = {}) => {
    const { data: profile, error } = await supabase
      .from("users").select("*").eq("auth_id", authId).maybeSingle();

    if (error) { console.error("loadUserProfile error:", error.message); return; }
    if (!profile) { console.warn("No profile found for auth_id:", authId); return; }

    // Admin/Finance are real Supabase accounts (as of the session-security fix)
    // but don't behave like learner accounts — no quiz state, routed to their
    // own panel instead of Home. Handle here, centrally, so it works no matter
    // which screen the login happened from (main login form, /admin, /finance,
    // or a restored session on page reload).
    if (profile.role === "admin" || profile.role === "finance") {
      if (profile.role === "admin") {
        setAdminUnlocked(true);
        sessionStorage.setItem("qv_admin_unlocked", "1");
        if (!opts.silent) setView("admin");
      } else {
        setFinanceUnlocked(true);
        sessionStorage.setItem("qv_finance_unlocked", "1");
        if (!opts.silent) setView("finance");
      }
      return;
    }

    // Detect re-created account using Supabase auth UUID (always unique per account)
    // If same user_id but different auth UUID → deleted and re-created → clear stale cache.
    // (Scores/progress no longer need clearing here — they live in Supabase keyed to the
    // immutable users.id, and deleteParticipant already removes them when an account is deleted.)
    const cachedUser = storageGet("qv_user");
    const isReCreated = cachedUser?.userId === profile.user_id && cachedUser?.supabaseId !== authId;
    if (isReCreated) {
      storageRemove("qv_user");
      console.log("Re-created account detected — cleared stale local cache for", profile.user_id);
    }

    const [{ data: scoreRows }, { data: progressRow }] = await Promise.all([
      supabase.from("scores").select("*").eq("user_id", profile.id).order("quiz_date", { ascending: true }),
      supabase.from("progress").select("day_progress").eq("user_id", profile.id).maybeSingle(),
    ]);

    const u = {
      userId: profile.user_id, name: profile.name,
      email: profile.email, enrolledAt: profile.enrolled_at,
      role: profile.role || "learner", dbId: profile.id,
      scores: (scoreRows || []).map(mapScoreRow),
      dayProgress: progressRow?.day_progress || {},
      emailVerified: true, supabaseId: authId,
      monthlyTarget: profile.monthly_word_target || 30,
    };
    setUser(u);
    storageSet("qv_user", u);
    if (!opts.silent) {
      toast_(`✅ Welcome, ${u.name}! 🕌`);
      setView("home");
    }
  };

  const lockAdmin = async () => {
    setAdminUnlocked(false);
    sessionStorage.removeItem("qv_admin_unlocked");
    await supabase.auth.signOut();
    if (isAdminRoute) { window.location.href = "/"; } else { setView("home"); }
  };

  const lockFinance = async () => {
    setFinanceUnlocked(false);
    sessionStorage.removeItem("qv_finance_unlocked");
    await supabase.auth.signOut();
    if (isFinanceRoute) { window.location.href = "/"; } else { setView("home"); }
  };

  const toast_ = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const saveUser = (u) => {
    setUser(u);
    // qv_user is kept only as an instant-restore snapshot for PWA reloads —
    // scores/progress are no longer authoritative here, Supabase is (Phase 3).
    storageSet("qv_user", u);
    setParticipants(prev => {
      const next = prev.find(p => p.userId === u.userId)
        ? prev.map(p => p.userId === u.userId ? u : p)
        : [...prev, u];
      return next;
    });
  };

  // ── SUPABASE AUTH: Register new account ───────────────────────────────────
  const registerUser = async (userId, password, name, email, turnstileToken) => {
    const idLower    = userId.trim().toLowerCase();
    const emailLower = email.trim().toLowerCase();

    // Bot check first, before any DB queries — fail fast and cheaply.
    const humanVerified = await verifyTurnstileToken(turnstileToken);
    if (!humanVerified) {
      toast_("Bot check failed — please complete the verification and try again.");
      return { ok: false, reason: "turnstile-failed" };
    }

    // Check duplicate EMAIL first — if the email is already registered,
    // that's the error the person needs to see (not a user-id clash)
    const { data: emailTaken } = await supabase.rpc("check_email_taken", { p_email: emailLower });
    if (emailTaken) {
      toast_("That email is already registered. Please log in or use a different email.");
      return { ok: false, reason: "email-taken" };
    }

    // Check duplicate User ID in Supabase users table
    const { data: idTaken } = await supabase.rpc("check_user_id_taken", { p_user_id: idLower });
    if (idTaken) {
      toast_("That User ID is already taken. Please choose another.");
      return { ok: false, reason: "id-taken" };
    }

    // Sign up via Supabase Auth — sends verification email via Titan SMTP
    const { data, error } = await supabase.auth.signUp({
      email: emailLower,
      password,
      options: {
        data: { name: name.trim(), user_id: userId.trim().toLowerCase() },
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

    // Supabase doesn't error on duplicate email (anti-enumeration) — instead
    // it returns a user with an EMPTY identities array. Detect that here.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      toast_("That email is already registered. Please log in or use a different email.");
      return { ok: false, reason: "email-taken" };
    }

    // Insert profile immediately using open INSERT policy
    // (trigger approach unreliable on free tier — we do it directly)
    if (data.user) {
      const { error: profileErr } = await supabase.from("users").insert({
        auth_id: data.user.id,
        user_id: userId.trim().toLowerCase(),
        name: name.trim(),
        email: emailLower,
        enrolled_at: new Date().toISOString(),
        role: "learner",
        verified: false,
      });
      if (profileErr) console.error("Profile insert error:", profileErr.message);
    }

    return { ok: true, userId: userId.trim(), email: emailLower };
  };

  // ── SUPABASE AUTH: Resend verification email ─────────────────────────────
  const resendVerificationEmail = async (userId) => {
    const { data: rows } = await supabase.rpc("get_login_lookup", { p_user_id: userId.toLowerCase() });
    const profile = rows?.[0];
    if (!profile) return { ok: false, reason: "not-found" };
    const { error } = await supabase.auth.resend({
      type: "signup", email: profile.email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) {
      if (error.message?.toLowerCase().includes("already confirmed") ||
          error.message?.toLowerCase().includes("already been confirmed")) {
        return { ok: false, reason: "already-verified" };
      }
      return { ok: false, reason: "send-failed" };
    }
    return { ok: true };
  };


  // ── Supabase handles email verification automatically via onAuthStateChange ─
  // The old verifyEmailFromToken is no longer needed.

  // ── SUPABASE AUTH: Login ──────────────────────────────────────────────────
  const loginUser = async (userId, password) => {
    // Look up email by userId via a narrow SECURITY DEFINER RPC — the RLS
    // policy on `users` no longer allows anon to browse the table directly
    // (fixed to close the public-email-exposure gap), so pre-auth lookups
    // like this one go through purpose-built functions instead.
    const { data: rows, error: lookupErr } = await supabase.rpc("get_login_lookup", { p_user_id: userId.trim().toLowerCase() });
    const profile = rows?.[0];
    if (!profile) {
      toast_("No account found with that User ID.");
      return { ok: false, reason: "not-found" };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: profile.email, password,
    });

    if (error) {
      // Only "email not confirmed" should show resend verification screen
      // "invalid login credentials" = wrong password - show error message
      if (error.message.toLowerCase().includes("email not confirmed")) {
        return { ok: false, reason: "not-verified", userId: profile.user_id, email: profile.email };
      }
      toast_("⚠ Incorrect User ID or password. Please try again.");
      return { ok: false, reason: "wrong-password" };
    }

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

    // Uses the same real Supabase Auth mechanism as the learner's own
    // "Forgot Password" flow — the old custom token/EmailJS approach here
    // called functions that no longer exist (dead code from before Phase 2).
    const { error } = await supabase.auth.resetPasswordForEmail(target.email, {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) {
      console.error("sendResetLinkToUser error:", error.message);
      return { ok: false, reason: "send-failed" };
    }
    return { ok: true };
  };

  // Admin-only: correct a learner's display name (e.g. a typo). Email is
  // deliberately NOT editable here — this only ever touched the profile
  // table, never the learner's actual Supabase Auth login email, so it
  // silently desynced the two. Email corrections now go through the
  // learner's own Change Email flow (OTP-verified), which keeps both in
  // sync properly. Admin can still trigger a password reset on a learner's
  // behalf via the separate "Send Reset Link" action.
  const updateParticipantDetails = async (userId, newName) => {
    const target = participants.find(p => (p.userId || "").toLowerCase() === userId.toLowerCase());
    if (!target) return { ok: false, reason: "not-found" };

    // .select() makes Supabase return the updated rows — an empty array means
    // the UPDATE matched nothing (e.g. a missing RLS policy), which this
    // project has repeatedly seen fail SILENTLY. Never claim success on it.
    const { data: updatedRows, error } = await supabase.from("users")
      .update({ name: newName.trim() })
      .eq("user_id", userId.toLowerCase())
      .select("id");
    if (error || !updatedRows || updatedRows.length === 0) {
      console.error("updateParticipantDetails: update touched 0 rows", error?.message || "(no error — likely RLS)");
      return { ok: false, reason: "db-update-failed" };
    }

    const updated = { ...target, name: newName.trim() };
    setParticipants(prev => prev.map(p => (p.userId || "").toLowerCase() === userId.toLowerCase() ? updated : p));
    if (user && (user.userId || "").toLowerCase() === userId.toLowerCase()) {
      setUser(updated);
      storageSet("qv_user", updated);
    }
    return { ok: true };
  };

  const deleteParticipant = async (userId) => {
    const idLower = userId.toLowerCase();
    if (idLower === "admin" || idLower === "finance") {
      console.warn("Blocked attempt to delete a protected staff account:", idLower);
      return { ok: false, reason: "protected" };
    }
    // Delete from Supabase users table (cascades to auth via trigger if set)
    const { data: profile } = await supabase.from("users")
      .select("id, auth_id").eq("user_id", idLower).maybeSingle();
    // scores/progress reference users.id (Phase 3) — must clear those rows
    // first or the users delete below fails on the foreign key.
    if (profile?.id) {
      await supabase.from("scores").delete().eq("user_id", profile.id);
      await supabase.from("progress").delete().eq("user_id", profile.id);
    }
    if (profile?.auth_id) {
      await supabase.from("users").delete().eq("auth_id", profile.auth_id);
    }
    setParticipants(prev => prev.filter(p => (p.userId || "").toLowerCase() !== idLower));
    if (user && (user.userId || "").toLowerCase() === idLower) {
      await supabase.auth.signOut();
      setUser(null);
      storageRemove("qv_user");
    }
  };

  // Pre-launch cleanup: wipes every piece of test data accumulated during
  // QA — participants, scores, messages, reset/verify tokens, custom words.
  // Admin/Finance are real Supabase accounts now (as of the session-security
  // fix) and are excluded from the wipe by role — their login is untouched.
  const resetAllTestData = async () => {
    // Clear Supabase users table (auth users remain — admin can delete manually)
    await supabase.from("users").delete().neq("role", "admin").neq("role", "finance");
    await supabase.from("scores").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("progress").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    // Words (built-in AND custom — single-added or Bulk Uploaded) are
    // deliberately NOT touched by this reset. They're real content once
    // added, not disposable test data — this only clears learner accounts,
    // scores, and progress.
    // Sign out current user if any
    await supabase.auth.signOut();
    // Clear localStorage
    storageRemove("qv_user");
    storageRemove("qv_messages");
    storageRemove("qv_reset_tokens");
    storageRemove("qv_verify_tokens");
    sessionStorage.removeItem("qv_admin_unlocked");
    sessionStorage.removeItem("qv_finance_unlocked");

    setParticipants([]);
    setUser(null);
    setMessages([]);
    const words = await fetchAllWords();
    if (words) setAllWords(words);
    setAdminUnlocked(false);
    setFinanceUnlocked(false);
    setQuiz(null);

    window.location.href = "/admin";
  };

  // Pre-launch only: wipes every real donation receipt, separate from the
  // test-data reset above. Since receipt numbers are computed from however
  // many receipts exist for the current year, clearing them also naturally
  // resets numbering back to 001 — no extra step needed.
  const clearAllReceipts = async () => {
    const ok = await clearAllReceiptsRows();
    if (ok) setReceipts([]);
    return ok;
  };

  // Sets a learner's new password using the 6-digit code emailed to them
  // (see the "Reset Password" screen). Uses supabase.auth.verifyOtp to
  // establish a session from the code, then updates the password — no
  // clickable link involved, so nothing for Outlook's Safe Links (or any
  // other email link-scanner) to silently consume before the user acts.
  // ── SUPABASE AUTH: Set new password from emailed reset code ────────────
  const verifyResetCodeAndSetPassword = async (email, code, newPassword, onBeforeSignOut) => {
    isPasswordRecovery.current = true; // guard: don't auto-login on the SIGNED_IN this triggers
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(), token: code.trim(), type: "recovery",
    });
    if (verifyErr) {
      isPasswordRecovery.current = false;
      return { ok: false, reason: "invalid-code" };
    }
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
    if (updateErr) {
      isPasswordRecovery.current = false;
      return { ok: false, reason: "error" };
    }
    // Run any extra cleanup that needs identifying who this was for (e.g.
    // Finance marking its approval request "completed") before signOut()
    // ends the session — passed by email, not session state (see the note
    // on completePasswordChangeRequestRPC for why).
    if (onBeforeSignOut) {
      try { await onBeforeSignOut(email); } catch (err) { console.error("onBeforeSignOut error:", err); }
    }
    // Sign out after reset — user must login fresh with new password
    isPasswordRecovery.current = false;
    await supabase.auth.signOut();
    toast_("Password updated! Please log in with your new password.");
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
    const { data: rows } = await supabase.rpc("get_login_lookup", { p_user_id: userId.trim().toLowerCase() });
    const profile = rows?.[0];

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

    toast_("Reset code sent! Check your inbox.");
    return { ok: true };
  };

  const onMarkMessageRead = (id) => { markMessageRead(id); setMessages(getMessages()); };
  const onMarkMessageResolved = (id) => { markMessageResolved(id); setMessages(getMessages()); };

  // Admin-issued donation receipt, sent after the finance team confirms funds
  // were actually received (outside the app). Not an automated/verified
  // payment confirmation — see the note above insertReceiptRow() for why.
  // `requestId`, when present, means this receipt was issued from a donor's
  // self-service Request Receipt entry — mark that request resolved once the
  // receipt is actually issued, so it drops off Finance's pending queue.
  const issueReceipt = async ({ donorName, donorEmail, amount, donationDate, purpose, note, requestId, utrReference }) => {
    const result = await insertReceiptRow({ donorName, donorEmail, amount, donationDate, purpose, note, utrReference });
    if (!result.ok) return { ok: false };
    const updated = await fetchAllReceipts();
    if (updated) setReceipts(updated);
    if (requestId) {
      await updateReceiptRequestRow(requestId, {
        status: "issued", resolved_receipt_id: result.dbId, resolved_at: new Date().toISOString(),
      });
      const updatedReqs = await fetchReceiptRequests();
      if (updatedReqs) setReceiptRequests(updatedReqs);
    }
    try {
      await sendReceiptEmail({
        toEmail: donorEmail, donorName, receiptNo: result.receiptNo,
        amount, donationDate, purpose, note, utrReference,
      });
      return { ok: true, receiptNo: result.receiptNo };
    } catch (err) {
      console.error("Receipt email failed to send:", err);
      return { ok: true, receiptNo: result.receiptNo, emailFailed: true };
    }
  };

  // Donor-initiated: "I already paid, please email my receipt." Just logs
  // the claim for Finance to verify — see the note above insertReceiptRow().
  // utrReference is required (enforced both in the modal and server-side).
  const submitRequestReceipt = async ({ donorName, donorEmail, amount, donationDate, note, utrReference }) => {
    const ok = await insertReceiptRequestRow({
      userId: user?.dbId || null, donorName, donorEmail, amount, donationDate, note, utrReference,
    });
    if (ok && (user?.role === "admin" || user?.role === "finance")) {
      const updated = await fetchReceiptRequests();
      if (updated) setReceiptRequests(updated);
    }
    return ok;
  };

  // Finance dismisses a request without issuing (duplicate, spam, can't verify, etc.)
  const dismissReceiptRequest = async (id) => {
    const ok = await updateReceiptRequestRow(id, { status: "dismissed", resolved_at: new Date().toISOString() });
    if (ok) {
      const updated = await fetchReceiptRequests();
      if (updated) setReceiptRequests(updated);
    }
    return ok;
  };

  // Finance-initiated: queues a request for Admin instead of changing the
  // password directly. See the note above request_password_change() SQL.
  const requestPasswordChange = async () => {
    return await requestPasswordChangeRPC();
  };

  // Admin approves — this doesn't set a password. It emails Finance a
  // 6-digit reset code (same mechanism as the learner Forgot Password flow),
  // which Finance then redeems themselves to actually set the new password.
  const approvePasswordChangeRequest = async (id, email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) {
      console.error("approvePasswordChangeRequest error:", error.message);
      return false;
    }
    const ok = await updatePasswordChangeRequestStatus(id, "approved");
    if (ok) {
      const updated = await fetchAllPasswordChangeRequests();
      if (updated) setPasswordChangeRequests(updated);
    }
    return ok;
  };

  const rejectPasswordChangeRequest = async (id) => {
    const ok = await updatePasswordChangeRequestStatus(id, "rejected");
    if (ok) {
      const updated = await fetchAllPasswordChangeRequests();
      if (updated) setPasswordChangeRequests(updated);
    }
    return ok;
  };

  const startQuiz = (day = null, customPool = null) => {
    if (!user) { toast_("Please enroll first"); return; }
    const pool = getUnlockedWords(user.enrolledAt, user.dayProgress, allWords); // wrong-answer distractors + general fallback
    if (pool.length < 4) { toast_("Need more unlocked words"); return; }
    const isAllSetsQuiz = day === null && !customPool;
    let src;
    if (isAllSetsQuiz) {
      // All Sets Quiz reviews already-completed sets only — never previews
      // words from the set currently in progress (that set's own dedicated
      // quiz is the only way to first encounter and complete it).
      src = getCompletedWords(user.dayProgress, allWords);
      if (src.length < 4) { setGateWarning("Complete at least one set first to unlock the All Sets Quiz."); return; }
    } else {
      src = customPool ? customPool : getWordsForDay(day, allWords);
    }
    const use = src.length >= 4 ? src : pool;
    // All Sets Quiz = all completed-set words, timed
    // Set quiz or custom (weak word practice) = capped at 10, no timer
    const questionCount = isAllSetsQuiz ? use.length : Math.min(10, use.length);
    const questions = shuffle(use).slice(0, questionCount).map(w => {
      // Always Arabic-question / English(+Urdu)-answer — no longer randomized
      // between directions, per product decision.
      const dir = "ar2en", qf = "arabic", af = "english";
      const optionWords = shuffle([w, ...getWrongWords(pool, w)]);
      return {
        word: w, dir, qf, af,
        options: optionWords.map(ow => ow[af]),
        optionsUrdu: optionWords.map(ow => ow.urdu),
        chosen: null,
      };
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
    // Record the answer immediately so finishQuizEarly (timer) sees it
    setQuiz(prev => prev && !prev.done ? { ...prev, questions: updQs } : prev);

    setTimeout(() => {
      // Guard: if timer already ended the quiz (finishQuizEarly ran),
      // don't overwrite the finished state — that caused a blank screen
      // when the last answer landed at the final second.
      if (quizRef.current?.done) return;
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
        const passed = pct >= PASSING_SCORE_PCT;
        const allScoresForGate = [...(user.scores || []), rec];
        const masteryGateMet = quiz.day ? hasMetMasteryGate(quiz.day, allScoresForGate, allWords) : false;
        const unlockedNow = passed || masteryGateMet;
        const dp = (!quiz.day || unlockedNow)
          ? { ...user.dayProgress, [String(quiz.day || "free")]: new Date().toISOString() }
          : user.dayProgress;
        const updated = { ...user, scores: allScoresForGate, dayProgress: dp };
        saveUser(updated);
        // Phase 3: persist to Supabase (fire-and-forget so the UI transition
        // isn't blocked; a failed save surfaces as a toast rather than silently
        // losing the attempt, since Supabase is now the only place it's stored).
        insertScore(user.dbId, rec).then(ok => { if (!ok) toast_("⚠ Couldn't save this score online — check your connection."); });
        if (dp !== user.dayProgress) {
          upsertProgress(user.dbId, dp).then(ok => { if (!ok) toast_("⚠ Couldn't save progress online — check your connection."); });
        }
        setQuiz({ ...quiz, questions: updQs, score: ns, done: true, result: rec, missed: nm, passed, masteryGateMet });
        setView("results");
      } else {
        // Briefly hide opts before showing next question — forces iOS to
        // fully clear any residual touch/active visual state on mobile
        setOptsVisible(false);
        requestAnimationFrame(() => {
          setQuiz({ ...quiz, questions: updQs, score: ns, cur: quiz.cur + 1, missed: nm });
          requestAnimationFrame(() => setOptsVisible(true));
        });
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
    insertScore(user.dbId, rec).then(ok => { if (!ok) toast_("⚠ Couldn't save this score online — check your connection."); });
    if (dp !== user.dayProgress) {
      upsertProgress(user.dbId, dp).then(ok => { if (!ok) toast_("⚠ Couldn't save progress online — check your connection."); });
    }
    setQuiz({ ...quiz, done: true, timeUp: true, result: rec, missed, passed, masteryGateMet });
    setView("results");
  };

  const reviewSession = (rec) => {
    setReviewing(rec);
    setView("review");
  };

  // Word management (Admin only) — all three refetch the full list after
  // writing, so set/order positions and any other admin's concurrent edits
  // stay correctly reflected rather than trusting a locally-guessed update.
  const addWord = async (wordData) => {
    const ok = await insertWord(wordData);
    if (ok) { const words = await fetchAllWords(); if (words) setAllWords(words); }
    return ok;
  };
  const bulkAddWords = async (words) => {
    const result = await bulkInsertWords(words);
    if (result.ok) { const updated = await fetchAllWords(); if (updated) setAllWords(updated); }
    return result;
  };
  const editWord = async (dbId, fields) => {
    const ok = await updateWord(dbId, fields);
    if (ok) { const words = await fetchAllWords(); if (words) setAllWords(words); }
    return ok;
  };
  // Uploads the file to Storage, then saves the resulting URL on the word
  // in one step — Admin just picks a file, doesn't juggle two actions.
  const removeWord = async (dbId) => {
    const ok = await deleteWordRow(dbId);
    if (ok) { const words = await fetchAllWords(); if (words) setAllWords(words); }
    return ok;
  };

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
    const isFinanceActive  = financeUnlocked;
    if (!isLearnerActive && !isAdminActive && !isFinanceActive) return;

    const timeoutMs = (isAdminRoute || isFinanceRoute) ? IDLE_ADMIN_MS : IDLE_LEARNER_MS;
    const warnMs    = timeoutMs - IDLE_WARN_BEFORE;
    const roleLabel = (isAdminRoute || isFinanceRoute) ? "10 minutes" : "20 minutes";

    let warnTimer   = null;
    let logoutTimer = null;
    let lastActivity = Date.now();

    const doLogout = () => {
      if (isAdminActive && isAdminRoute) {
        sessionStorage.removeItem("qv_admin_unlocked");
        setAdminUnlocked(false);
        supabase.auth.signOut();
        toast_("⏱ Admin session expired after inactivity.");
        setTimeout(() => { window.location.href = "/admin"; }, 1800);
      } else if (isFinanceActive && isFinanceRoute) {
        sessionStorage.removeItem("qv_finance_unlocked");
        setFinanceUnlocked(false);
        supabase.auth.signOut();
        toast_("⏱ Finance session expired after inactivity.");
        setTimeout(() => { window.location.href = "/"; }, 1800);
      } else if (isLearnerActive) {
        setUser(null);
        storageRemove("qv_user");
        setQuiz(null);
        setSelectedDay(null);
        setView("home");
        supabase.auth.signOut();
        toast_("⏱ Logged out after 20 minutes of inactivity. Your progress is saved.");
      }
    };

    const reset = () => {
      lastActivity = Date.now();
      clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
      warnTimer   = setTimeout(() => {
        toast_(`⏱ Still there? You'll be signed out in 2 minutes due to inactivity.`);
      }, warnMs);
      logoutTimer = setTimeout(doLogout, timeoutMs);
    };

    // iPhone PWA fix: when returning to the app, don't fire stale timers.
    // Instead check actual elapsed time — only logout if genuinely idle
    // beyond the limit; otherwise treat the return as fresh activity.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        const elapsed = Date.now() - lastActivity;
        if (elapsed >= timeoutMs) {
          doLogout();
        } else {
          reset(); // returning counts as activity
        }
      } else {
        // Page hidden — clear timers so iOS doesn't fire them on resume
        clearTimeout(warnTimer);
        clearTimeout(logoutTimer);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach(ev => window.addEventListener(ev, reset, { passive: true }));
    reset(); // kick off immediately

    return () => {
      clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      events.forEach(ev => window.removeEventListener(ev, reset));
    };
  }, [user, adminUnlocked, financeUnlocked, isAdminRoute, isFinanceRoute]); // re-run when session changes
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
            <div className="ntext"><h1>Quranic Vocab</h1><span>{isAdminRoute || view === "admin" ? "Admin Panel" : isFinanceRoute || view === "finance" ? "Finance Panel" : "Daily Memorization Series"}</span></div>
          </div>
          {isAdminRoute || view === "admin" ? (
            <div className="nright">
              {adminUnlocked && (() => {
                const pendingCount = passwordChangeRequests.filter(r => r.status === "pending").length
                  + receiptRequests.filter(r => r.status === "pending").length;
                return pendingCount > 0 ? (
                  <div style={{ position: "relative" }}>
                    <span className="admin-msg-badge" style={{ cursor: "pointer" }} onClick={e => { e.stopPropagation(); setShowNotifCenter(s => !s); }}>
                      🔔 {pendingCount}
                    </span>
                    {showNotifCenter && (
                      <AdminNotificationCenter
                        passwordChangeRequests={passwordChangeRequests}
                        receiptRequests={receiptRequests}
                        onApprovePasswordChange={approvePasswordChangeRequest}
                        onRejectPasswordChange={rejectPasswordChangeRequest}
                        onClose={() => setShowNotifCenter(false)}
                        toast_={toast_}
                      />
                    )}
                  </div>
                ) : null;
              })()}
              {adminUnlocked && (
                <div className="nuser-wrap">
                  <button className="nuser" onClick={e => { e.stopPropagation(); setShowAdminMenu(s => !s); }}>🔧 Admin <span style={{ fontSize: 9, marginLeft: 4 }}>▾</span></button>
                  {showAdminMenu && (
                    <div className="nuser-menu" onMouseLeave={() => setShowAdminMenu(false)}>
                      <button className="nuser-menu-item" onClick={() => { setShowAdminMenu(false); setAdminProfileOpen(true); }}>⚙ Profile Settings</button>
                      <button className="nuser-menu-item logout" onClick={() => { setShowAdminMenu(false); lockAdmin(); }}>👤 Logoff</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : isFinanceRoute || view === "finance" ? (
            <div className="nright">
              {financeUnlocked && (
                <div className="nuser-wrap">
                  <button className="nuser" onClick={e => { e.stopPropagation(); setShowFinanceMenu(s => !s); }}>🧾 Finance <span style={{ fontSize: 9, marginLeft: 4 }}>▾</span></button>
                  {showFinanceMenu && (
                    <div className="nuser-menu" onMouseLeave={() => setShowFinanceMenu(false)}>
                      <button className="nuser-menu-item" onClick={() => { setShowFinanceMenu(false); setFinanceProfileOpen(true); }}>⚙ Profile Settings</button>
                      <button className="nuser-menu-item logout" onClick={() => { setShowFinanceMenu(false); lockFinance(); }}>👤 Logoff</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="nright">
              <button className={`nbtn ${view === "home" ? "on" : ""}`} onClick={() => setView("home")}>🏠 Home</button>
              <button className={`nbtn ${view === "history" ? "on" : ""}`} onClick={() => setView("history")}>History</button>
              <button className={`nbtn ${view === "leaderboard" ? "on" : ""}`} onClick={() => setView("leaderboard")}>Ranks</button>
              <button className="ndonate" onClick={() => setShowDonate(true)}>🤲 Donate</button>
              <button className={`ncta ${view === "learn" ? "on" : ""}`} onClick={() => setView("learn")}>📚 Learn</button>
              {user && <button className="ncta" onClick={() => setShowInvite(true)}>✉ Invite</button>}
              {!user && <button className="ncta" onClick={() => setView("enroll")}>Login / Join Now</button>}
              {user && (
                <div className="nuser-wrap">
                  <button className="nuser" onClick={e => { e.stopPropagation(); setView("profileHub"); }}>﷽ {user.name}</button>
                </div>
              )}
            </div>
          )}
        </nav>

        {receiptParam ? (
          <DownloadReceiptPage prefillReceiptNo={receiptParam} toast_={toast_} user={user} />
        ) : isAdminRoute || view === "admin" ? (
          adminUnlocked
            ? <AdminPage allWords={allWords} onAddWord={addWord} onBulkAddWords={bulkAddWords} onEditWord={editWord} onDeleteWord={removeWord} participants={participants} toast_={toast_} onSendResetLink={sendResetLinkToUser} messages={messages} onMarkRead={onMarkMessageRead} onMarkResolved={onMarkMessageResolved} onUpdateParticipant={updateParticipantDetails} onDeleteParticipant={deleteParticipant} onResendVerification={resendVerificationEmail} onResetAllTestData={resetAllTestData} onClearAllReceipts={clearAllReceipts} passwordChangeRequests={passwordChangeRequests} onApprovePasswordChange={approvePasswordChangeRequest} onRejectPasswordChange={rejectPasswordChangeRequest} />
            : <AdminGate onLogin={loginUser} />
        ) : isFinanceRoute || view === "finance" ? (
          financeUnlocked
            ? <FinancePage receipts={receipts} receiptRequests={receiptRequests} onIssueReceipt={issueReceipt} onDismissRequest={dismissReceiptRequest} toast_={toast_} participants={participants} />
            : <FinanceGate onLogin={loginUser} />
        ) : (
          <>
            {view === "home" && <HomePage user={user} allWords={allWords} totalWordCount={totalWordCount} participants={participants} onStart={startQuiz} setView={setView} onDonate={() => setShowDonate(true)} onInvite={() => setShowInvite(true)} onReview={reviewSession} toast_={toast_} setGateWarning={setGateWarning} />}
            {view === "enroll" && <EnrollPage onRegister={registerUser} onLogin={loginUser} participants={participants} onForgotPassword={submitForgotPasswordRequest} onResendVerification={resendVerificationEmail} setView={setView} onGoToResetCode={(email) => { setPendingResetEmail(email); setView("resetPassword"); }} />}
            {view === "learn" && <LearnPage user={user} allWords={allWords} onQuiz={startQuiz} setView={setView} selectedDay={selectedDay} setSelectedDay={setSelectedDay} />}
            {view === "quiz" && quiz && <QuizPage quiz={quiz} onAnswer={answer} onCancel={cancelQuiz} onTimeUp={finishQuizEarly} optsVisible={optsVisible} />}
            {view === "results" && quiz?.done && <ResultsPage quiz={quiz} user={user} onRetry={() => startQuiz(quiz.day)} setView={setView} onDonate={() => setShowDonate(true)} onReview={reviewSession} setSelectedDay={setSelectedDay} />}
            {view === "history" && <HistoryPage user={user} setView={setView} onReview={reviewSession} allWords={allWords} onStart={startQuiz} />}
            {view === "review" && reviewing && <ReviewPage rec={reviewing} setView={setView} allWords={allWords} />}
            {view === "leaderboard" && <LBPage participants={participants} user={user} allWords={allWords} />}
            {view === "resetPassword" && <ResetPasswordPage onSetPassword={verifyResetCodeAndSetPassword} initialEmail={pendingResetEmail} setView={setView} />}
            {view === "profile" && user && <ProfilePage user={user} saveUser={saveUser} setView={setView} toast_={toast_} />}
            {view === "profileHub" && user && <ProfileHub user={user} saveUser={saveUser} setView={setView} toast_={toast_} onRequestReceipt={() => setShowRequestReceipt(true)} onLogout={logout} allWords={allWords} />}
            {view === "downloadReceipt" && <DownloadReceiptPage prefillReceiptNo="" toast_={toast_} user={user} setView={setView} />}
            {/* Email verification handled automatically by Supabase via onAuthStateChange */}
          </>
        )}

        {!isAdminRoute && !isFinanceRoute && showDonate && <DonateModal onClose={() => setShowDonate(false)} toast_={toast_} user={user} onRequestReceipt={() => { setShowDonate(false); setShowRequestReceipt(true); }} />}
        {!isAdminRoute && !isFinanceRoute && showInvite && <InviteModal onClose={() => setShowInvite(false)} toast_={toast_} user={user} />}
        {gateWarning && <GateWarningModal message={gateWarning} onClose={() => setGateWarning(null)} />}
        {!isAdminRoute && !isFinanceRoute && showRequestReceipt && <RequestReceiptModal onClose={() => setShowRequestReceipt(false)} toast_={toast_} user={user} onSubmit={submitRequestReceipt} />}
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
            onClose={() => setAdminProfileOpen(false)}
            toast_={toast_}
          />
        )}
        {financeProfileOpen && (
          <RequestPasswordChangeModal
            onClose={() => setFinanceProfileOpen(false)}
            toast_={toast_}
            onSetPassword={(email, code, newPassword) =>
              verifyResetCodeAndSetPassword(email, code, newPassword, completePasswordChangeRequestRPC)
            }
          />
        )}
        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}

function HomePage({ user, allWords, totalWordCount, participants, onStart, setView, onDonate, onInvite, onReview, toast_, setGateWarning }) {
  const [showAllSetsReady, setShowAllSetsReady] = useState(false);
  const [showMasteredList, setShowMasteredList] = useState(false);
  const unlocked = user ? getUnlockedWords(user.enrolledAt, user.dayProgress, allWords).length : 0;
  const completedWordsCount = user ? getCompletedWords(user.dayProgress, allWords).length : 0;
  const dayN = user ? getUnlockedDays(user.enrolledAt, user.dayProgress, Math.ceil(allWords.length / WORDS_PER_DAY)) : 0;
  const best = user?.scores?.length ? Math.max(...user.scores.map(s => s.pct)) : null;
  const homeMastered = getMasteredWords(user?.scores || [], allWords);
  const streak = calcStreak(user?.scores || []);
  // Actual quiz completion = distinct numbered days completed / total days in programme
  // (deliberately excludes "free" quick-quiz attempts and is 0 for a brand-new user)
  const daysCompleted = user ? Object.keys(user.dayProgress || {}).filter(k => k !== "free").length : 0;
  const recentSessions = [...(user?.scores || [])].reverse().slice(0, 4);
  const wordsAddedLastWeek = countWordsAddedLastWeek(allWords);
  const quranCoverage = estimateQuranCoverage(totalWordCount ?? allWords.length);

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
    <div className="page page-home">
      <div className="hero">
        <div className="bism">بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ</div>
        <h2>Master the <em>Language of the Quran</em></h2>
        <p className="sub tagline-prominent">Learn the most frequent Qur'an vocabulary in sets of 10 — unlocking the next set as you complete each one, at your own pace.</p>
        {user ? (
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn bg" onClick={() => setView("learn")}>Continue — Set {dayN}</button>
            <button className="btn bh" onClick={() => {
              if (completedWordsCount < 4) {
                setGateWarning("Complete at least Set 1 first to unlock the All Sets Quiz.");
                return;
              }
              setShowAllSetsReady(true);
            }}>All Sets Quiz</button>
          </div>
        ) : <button className="btn bg" onClick={() => setView("enroll")}>Begin Your Journey →</button>}
      </div>

      {/* Word preview for logged-out visitors — Set 1 only (RLS scopes anon
          access to set_number=1 server-side too; this filter is just a
          defensive belt-and-suspenders in case allWords ever contains more). */}
      {!user && (
        <div style={{ margin: "8px 0 24px" }}>
          <p style={{ textAlign: "center", fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
            A taste of what you'll learn — Set 1:
          </p>
          <div style={{ position: "relative" }}>
            <button className="preview-arrow" style={{ left: -14 }} aria-label="Scroll left"
              onClick={() => { const el = document.getElementById("set1-preview-strip"); if (el) el.scrollBy({ left: -300, behavior: "smooth" }); }}>‹</button>
            <div id="set1-preview-strip" className="preview-scroll" style={{ display: "flex", gap: 12, overflowX: "auto", padding: "4px 4px 12px", WebkitOverflowScrolling: "touch" }}>
              {/* allWords is already sorted by set/order (see fetchAllWords), and
                  RLS itself restricts anon visitors to Set 1 rows only server-side
                  — slice(0,10) just caps it defensively at one set's worth. */}
              {allWords.slice(0, 10).map((w, i) => (
                <div key={i} style={{ flex: "0 0 auto", width: 130, textAlign: "center", background: "rgba(7,28,42,.72)", border: "1px solid rgba(0,200,230,.25)", borderRadius: 10, padding: "16px 10px", backdropFilter: "blur(6px)" }}>
                  <div className="arabic" style={{ fontSize: 24, color: "var(--gold2)", marginBottom: 8 }}>{w.arabic}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text)" }}>{w.english}</div>
                </div>
              ))}
            </div>
            <button className="preview-arrow" style={{ right: -14 }} aria-label="Scroll right"
              onClick={() => { const el = document.getElementById("set1-preview-strip"); if (el) el.scrollBy({ left: 300, behavior: "smooth" }); }}>›</button>
          </div>
          <p style={{ textAlign: "center", fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
            <span className="forgot-link" onClick={() => setView("enroll")}>Sign up free to unlock all {totalWordCount ?? "100+"} words →</span>
          </p>
        </div>
      )}

      {/* All Sets Quiz Ready Modal */}
      {showAllSetsReady && (
        <div className="modal-overlay" onClick={() => setShowAllSetsReady(false)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>🏆 All Sets Quiz</h3>
              <button className="modal-close" onClick={() => setShowAllSetsReady(false)}>×</button>
            </div>
            <div className="modal-body" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
              <p style={{ fontSize: 15, color: "var(--text)", marginBottom: 8, fontWeight: 500 }}>
                You're about to quiz on <strong style={{ color: "var(--cyan2)" }}>{completedWordsCount}</strong> completed words
              </p>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20, lineHeight: 1.7 }}>
                The timer starts as soon as you begin.<br/>
                You have <strong style={{ color: "var(--gold2)" }}>~{Math.round(completedWordsCount * 1.5)}s</strong> total — about 1.5s per word.<br/>
                Find a quiet moment and stay focused.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button className="btn bh" onClick={() => setShowAllSetsReady(false)}>Not yet</button>
                <button className="btn bg" onClick={() => { setShowAllSetsReady(false); onStart(); }}>
                  I'm Ready — Start! →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="srow">
        <div className="sbox">
          <span style={{ position: "absolute", top: 6, right: 8, fontSize: 12, opacity: .6 }}>🔒</span>
          <div className="sn">{totalWordCount ?? allWords.length}</div>
          <div className="sl">Words to Learn</div>
        </div>
        <div className="sbox"><div className="sn">+{wordsAddedLastWeek}</div><div className="sl">Newly added words</div></div>
        <div className="sbox"><div className="sn">{quranCoverage}%</div><div className="sl">Qur'an Coverage</div></div>
        {user ? (
          <div className="sbox">
            <span style={{ position: "absolute", top: 7, right: 9, fontSize: 11, opacity: .65 }}>🔓</span>
            <div className="sn">{unlocked}</div>
            <div className="sl">Words Unlocked</div>
          </div>
        ) : (
          <div className="sbox" onClick={() => user ? setView("leaderboard") : setView("enroll")}
            style={{ cursor: "pointer" }}
            title={user ? "View Leaderboard" : "Join to see the leaderboard"}>
            <div className="sn">{participants.length}</div>
            <div className="sl">Members Enrolled</div>
            <div style={{ fontSize: 10, color: "var(--cyan2)", marginTop: 4, opacity: .7 }}>{user ? "View Ranks →" : "Join →"}</div>
          </div>
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
              { label: "Mastered", value: homeMastered.size, onClick: homeMastered.size > 0 ? () => setShowMasteredList(true) : undefined },
            ].map(({ label, value, onClick }) => (
              <div key={label} onClick={onClick} style={{ cursor: onClick ? "pointer" : "default", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--cyan2)", minHeight: 28, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", lineHeight: 1.3, whiteSpace: "nowrap" }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--cyan2)", fontFamily: "'Poppins',sans-serif", lineHeight: 1, textShadow: "0 0 16px rgba(0,220,255,.25)" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Mastered words modal moved outside this card — see below the
              closing of this card. backdrop-filter (from .card) creates a
              containing block for position:fixed descendants, which was
              trapping this modal inside the card's own stacking context
              instead of letting it escape to the true top of the page. */}
          <div style={{ overflow: "hidden", marginTop: 4, direction: "ltr" }}>
            <div style={{ display: "inline-flex", whiteSpace: "nowrap", animation: "marquee 22s linear infinite", fontSize: 11, color: "var(--muted)" }}>
              <span>Keep going — each quiz unlocks more words on your path to the Quran.</span>
              <span style={{ margin: "0 20px", color: "var(--cyan2)", opacity: .5 }}>✦</span>
              <span>Keep going — each quiz unlocks more words on your path to the Quran.</span>
              <span style={{ margin: "0 20px", color: "var(--cyan2)", opacity: .5 }}>✦</span>
            </div>
          </div>
        </div>
      )}

      {/* Mastered words modal — deliberately outside the "Your Progress" card
          above (see the note there for why) */}
      {showMasteredList && (
        <div className="modal-overlay" onClick={() => setShowMasteredList(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>🎯 Mastered Words ({homeMastered.size})</h3>
              <button className="modal-close" onClick={() => setShowMasteredList(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: 360, overflowY: "auto" }}>
              {allWords.filter(w => homeMastered.has(w.arabic)).map((w, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 4px", borderBottom: "1px solid rgba(0,200,230,.08)" }}>
                  <span className="arabic" style={{ fontSize: 20, color: "var(--gold2)" }}>{w.arabic}</span>
                  <span style={{ fontSize: 13, color: "var(--text)" }}>{w.english}</span>
                </div>
              ))}
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
                bestAllSetsHome.score === bestAllSetsHome.total
                  ? <> in just <strong>{bestAllSetsHome.timeUsedSec}</strong> seconds! 🎉</>
                  : <> in <strong>{bestAllSetsHome.timeUsedSec}</strong> seconds</>
              )} out of <strong>{bestAllSetsHome.total}</strong> words
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

      {user && (
        <div className="donate-strip" onClick={onInvite} style={{ marginTop: 10 }}>
          <span>💌 Know someone who'd love this? Invite a friend or family member</span>
          <span className="donate-strip-cta">Invite →</span>
        </div>
      )}
    </div>
  );
}

function EnrollPage({ onRegister, onLogin, participants, onForgotPassword, onResendVerification, setView, onGoToResetCode }) {
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
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [turnstileKey, setTurnstileKey] = useState(0); // bump to force widget remount/reset

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

  const submitForgot = async () => {
    setForgotError("");
    if (!forgotId.trim() || !forgotEmail.trim()) return;
    setChecking(true);
    const result = await onForgotPassword(forgotId, forgotEmail, forgotNote);
    setChecking(false);
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
        setError("Login failed. Check your User ID and password, or contact support@awamibaitulmaal.org.in for help.");
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
    // alias-warning (hotmail/outlook/yahoo) — shown inline below the field already, don't block signup

    if (!turnstileToken) { setError("Please complete the verification check below."); return; }

    setChecking(true);
    const regResult = await onRegister(userId, suPw, name, email, turnstileToken);
    setChecking(false);
    if (regResult.ok) {
      setPendingVerify({ userId: regResult.userId, email: regResult.email });
      if (regResult.emailFailed) {
        setError("Account created, but the verification email failed to send. Try 'Resend' below, or contact support@awamibaitulmaal.org.in");
      }
    } else if (regResult.reason === "id-taken") {
      setError("That User ID is already taken. Please choose a different one.");
      setTurnstileToken(null); setTurnstileKey(k => k + 1);
    } else if (regResult.reason === "email-taken") {
      setError("That email address is already registered. Please log in instead, or use a different email.");
      setTurnstileToken(null); setTurnstileKey(k => k + 1);
    } else {
      setError("Could not create account. Please try again.");
      setTurnstileToken(null); setTurnstileKey(k => k + 1);
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
        <div className="card">
          {error && <div className="enroll-error" style={{ marginBottom: 14 }}>⚠ {error}</div>}
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
            Didn't get it? Check your spam folder, or request a new link below.
          </p>
          <button className="btn bg bfw" onClick={submitResend} disabled={resendStatus === "sending"}>
            {resendStatus === "sending" ? "Sending…" : "Resend Verification Email"}
          </button>
          {resendStatus === "sent" && <p style={{ fontSize: 12, color: "var(--ok)", marginTop: 10 }}>✅ New link sent — check your inbox.</p>}
          {resendStatus === "failed" && <p style={{ fontSize: 12, color: "var(--err)", marginTop: 10 }}>⚠ Your email may already be verified — try logging in, or contact <a href="mailto:support@awamibaitulmaal.org.in" style={{ color: "var(--cyan2)" }}>support@awamibaitulmaal.org.in</a></p>}
          <button className="btn bh bfw" style={{ marginTop: 10 }} onClick={() => { setPendingVerify(null); setError(""); setResendStatus(""); setMode("login"); }}>
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page psm page-enroll">
      <p className="sub tagline-prominent" style={{ marginBottom: 20 }}>Learn the most frequent Qur'an vocabulary in sets of 10 — unlocking the next set as you complete each one, at your own pace.</p>
      <div className="lbl">{mode === "login" ? "Login" : "Create Account"}</div>
      <h2>{mode === "login" ? "Welcome Back" : "Join the Series"}</h2>
      <p className="sub" style={{ marginBottom: 22 }}>
        {mode === "login" && "Enter your User ID and password to resume your journey."}
        {mode === "signup" && "Choose a User ID and password to begin your journey."}
      </p>

      <div className="auth-mode-tabs">
        <button className={`auth-mode-tab ${mode === "login" ? "on" : ""}`} onClick={() => {
          setMode("login"); setError("");
          // Clear whatever was typed in Sign Up so switching tabs doesn't
          // leave stale credentials sitting in the other form.
          setSuUserId(""); setSuPw(""); setSuPwConfirm(""); setSuName(""); setSuEmail("");
          setUserIdHint(""); setTypoWarning(null); setIgnoreTypo(false); setEmailHint("");
        }}>Login</button>
        <button className={`auth-mode-tab ${mode === "signup" ? "on" : ""}`} onClick={() => {
          setMode("signup"); setError("");
          setLoginId(""); setLoginPw("");
        }}>Sign Up</button>
      </div>

      <div className="card">
        {mode === "login" && (
          <>
            <div className="field"><label>User ID</label><input value={loginId} onChange={e => { setLoginId(e.target.value); setError(""); }} placeholder="Your User ID" autoFocus /></div>
            <div className="field"><label>Password</label><PasswordInput value={loginPw} onChange={e => { setLoginPw(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && submitLogin()} placeholder="Your password" /></div>
            {error && <div className="enroll-error">⚠ {error}</div>}
            <button className="btn bg bfw" onClick={submitLogin} disabled={!loginId || !loginPw || checking}>
              {checking ? "Checking…" : "Login →"}
            </button>
            <p className="enroll-hint">🔒 <span className="forgot-link" onClick={() => setShowForgot(true)}>Forgot your password? Reset it yourself with a code emailed to you.</span></p>
            <p className="enroll-hint">Already have a reset code? <span className="forgot-link" onClick={() => onGoToResetCode("")}>Enter it here.</span></p>
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
            <div className="field">
              <label>Choose a Password</label>
              <PasswordInput
                value={suPw}
                onChange={e => { setSuPw(e.target.value); setError(""); }}
                placeholder="Min 10 chars, 1 number, 1 special char"
                style={suPw && !getPasswordComplexityError(suPw) ? { borderColor: "var(--ok)" } :
                       suPw && getPasswordComplexityError(suPw) ? { borderColor: "var(--err)" } : {}}
              />
              {suPw && (() => {
                const checks = [
                  { label: "10+ characters", ok: suPw.length >= 10 },
                  { label: "1 number", ok: /[0-9]/.test(suPw) },
                  { label: "1 special character", ok: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(suPw) },
                ];
                return (
                  <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    {checks.map(c => (
                      <span key={c.label} style={{ fontSize: 11, color: c.ok ? "var(--ok)" : "var(--err)", display: "flex", alignItems: "center", gap: 3 }}>
                        {c.ok ? "✓" : "✗"} {c.label}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="field">
              <label>Confirm Password</label>
              <PasswordInput
                value={suPwConfirm}
                onChange={e => { setSuPwConfirm(e.target.value); setError(""); }}
                placeholder="Re-enter password"
                style={suPwConfirm && suPw && suPwConfirm !== suPw ? { borderColor: "var(--err)" } :
                       suPwConfirm && suPw && suPwConfirm === suPw ? { borderColor: "var(--ok)" } : {}}
              />
              {suPwConfirm && suPw && suPwConfirm !== suPw && (
                <div style={{ fontSize: 12, color: "var(--err)", marginTop: 4 }}>⚠ Passwords don't match</div>
              )}
              {suPwConfirm && suPw && suPwConfirm === suPw && (
                <div style={{ fontSize: 12, color: "var(--ok)", marginTop: 4 }}>✓ Passwords match</div>
              )}
            </div>
            <div className="field"><label>Full Name</label><input value={suName} onChange={e => { setSuName(e.target.value); setError(""); }} placeholder="Your name" /></div>
            <div className="field">
              <label>Email Address</label>
              <input
                type="email"
                value={suEmail}
                onChange={e => { setSuEmail(e.target.value); setError(""); setTypoWarning(null); setIgnoreTypo(false); setEmailHint(""); }}
                placeholder="your@email.com"
              />
              {suEmail && suEmail.includes("@") && (() => {
                const domain = suEmail.split("@")[1]?.toLowerCase();
                const aliases = { "outlook.com": "hotmail.com", "hotmail.com": "outlook.com", "live.com": "outlook.com", "ymail.com": "yahoo.com" };
                const alt = aliases[domain];
                return alt ? <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>💡 Verification goes to <strong style={{ color: "var(--text)" }}>@{domain}</strong> — not @{alt}</div> : null;
              })()}
            </div>
            {error && <div className="enroll-error">⚠ {error}</div>}
            <TurnstileWidget
              key={turnstileKey}
              onVerify={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken(null)}
            />
            <button className="btn bg bfw" onClick={submitSignup} disabled={checking || !turnstileToken}>
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
                  <p style={{ fontSize: 14, color: "var(--text)", marginBottom: 6 }}>Check your email!</p>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 18 }}>We've sent a code to <strong style={{ color: "var(--gold2)" }}>{forgotEmail}</strong>. Enter it on the next screen along with your new password.</p>
                  <button className="btn bg bfw" onClick={() => { onGoToResetCode(forgotEmail); closeForgot(); }}>Enter Code →</button>
                  <button className="btn bh bfw" style={{ marginTop: 8 }} onClick={closeForgot}>Close</button>
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
// ─── Profile Settings Page ────────────────────────────────────────────────────
// ── Profile Hub — full-page replacement for the old nav dropdown ────────────
// Redesigned as: avatar header, tabbed "Progress" / "Account" page.
// Progress tab: colorful summary stat grid + Monthly Challenge badge row
// (last month / current month / next month locked).
// Account tab: the same 5 actions the old dropdown held, as box-cards.
function ProfileHub({ user, saveUser, setView, toast_, onRequestReceipt, onLogout, allWords }) {
  const [tab, setTab] = useState("progress"); // "progress" | "account"
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetVal, setTargetVal] = useState(user.monthlyTarget || 30);
  const [savingTarget, setSavingTarget] = useState(false);

  const monthlyCounts = React.useMemo(() => buildMonthlyMasteryCounts(user.scores || []), [user.scores]);
  const target = user.monthlyTarget || 30;

  const now = new Date();
  const monthInfo = (offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const key = d.toISOString().slice(0, 7);
    return { key, label: d.toLocaleDateString("en-GB", { month: "short" }), count: monthlyCounts[key] || 0 };
  };
  const lastMonth = monthInfo(-1);
  const thisMonth = monthInfo(0);
  const nextMonth = monthInfo(1);

  const streak = calcStreak(user.scores || []);
  const masteredCount = getMasteredWords(user.scores || [], allWords || []).size;
  const masteredPct = allWords?.length ? Math.round((masteredCount / allWords.length) * 100) : 0;
  const bestScore = user.scores?.length ? Math.max(...user.scores.map(s => s.pct)) : 0;

  const saveTarget = async () => {
    const n = parseInt(targetVal, 10);
    if (!n || n < 1 || n > 500) { toast_("Enter a valid target between 1 and 500."); return; }
    setSavingTarget(true);
    const { error } = await supabase.from("users").update({ monthly_word_target: n }).eq("auth_id", user.supabaseId);
    setSavingTarget(false);
    if (error) { toast_("Failed to save target — please try again."); return; }
    saveUser({ ...user, monthlyTarget: n });
    setEditingTarget(false);
    toast_(`✅ Monthly target set to ${n} words`);
  };

  const actionBoxes = [
    { key: "profile", icon: "👤", label: "Profile Settings", desc: "User ID, email, password", onClick: () => setView("profile") },
    { key: "history", icon: "📋", label: "My History", desc: "Past quizzes & results", onClick: () => setView("history") },
    { key: "receipt-req", icon: "🧾", label: "Request Receipt", desc: "Coming soon", onClick: onRequestReceipt, disabled: true },
    { key: "receipts", icon: "🧾", label: "My Receipts", desc: "Download past receipts", onClick: () => setView("downloadReceipt") },
  ];

  return (
    <div className="page pmd phub-page">
      {/* Header */}
      <div className="phub-header">
        <div className="phub-avatar">{(user.name || "?").trim().charAt(0).toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0 }}>{user.name}</h2>
          <p className="sub" style={{ margin: "2px 0 0" }}>{user.userId ? `@${user.userId}` : user.email}</p>
        </div>
        <button className="phub-logout-btn" onClick={onLogout}>↪ Log Out</button>
      </div>

      {/* Tabs */}
      <div className="phub-tabs">
        <button className={`phub-tab ${tab === "progress" ? "on" : ""}`} onClick={() => setTab("progress")}>Progress</button>
        <button className={`phub-tab ${tab === "account" ? "on" : ""}`} onClick={() => setTab("account")}>Account</button>
      </div>

      {tab === "progress" ? (
        <>
          <div className="phub-section-label">Summary</div>
          <div className="phub-stat-grid">
            <div className="phub-stat-card streak">
              <span className="phub-stat-icon">🔥</span>
              <div><div className="phub-stat-num">{streak}</div><div className="phub-stat-label">Day Streak</div></div>
            </div>
            <div className="phub-stat-card mastered">
              <span className="phub-stat-icon">📖</span>
              <div><div className="phub-stat-num">{masteredPct}%</div><div className="phub-stat-label">Words Mastered</div></div>
            </div>
            <div className="phub-stat-card month">
              <span className="phub-stat-icon">🎯</span>
              <div><div className="phub-stat-num">{thisMonth.count}/{target}</div><div className="phub-stat-label">This Month</div></div>
            </div>
            <div className="phub-stat-card best">
              <span className="phub-stat-icon">🏆</span>
              <div><div className="phub-stat-num">{bestScore}%</div><div className="phub-stat-label">Personal Best</div></div>
            </div>
          </div>

          <div className="phub-section-label">Monthly Challenge</div>
          <div className="phub-challenge-row">
            <div className="phub-badge-card past">
              <div className={`phub-badge-shape ${lastMonth.count >= target ? "met" : "missed"}`}>
                {lastMonth.count >= target ? "🏅" : "📕"}
              </div>
              <div className="phub-badge-month">{lastMonth.label}</div>
              <div className="phub-badge-sub">{lastMonth.count}/{target}</div>
            </div>
            <div className="phub-badge-card current">
              <div className="phub-badge-shape active">🎯</div>
              <div className="phub-badge-month">{thisMonth.label}</div>
              <div className="phub-badge-sub">{thisMonth.count}/{target}</div>
              {editingTarget ? (
                <div className="phub-target-edit">
                  <input type="number" min="1" max="500" value={targetVal} onChange={e => setTargetVal(e.target.value)} />
                  <button className="btn bh bsm" disabled={savingTarget} onClick={saveTarget}>{savingTarget ? "…" : "Save"}</button>
                  <button className="btn bh bsm" onClick={() => { setEditingTarget(false); setTargetVal(user.monthlyTarget || 30); }}>✕</button>
                </div>
              ) : (
                <button className="phub-target-btn" onClick={() => setEditingTarget(true)}>🎯 Edit Target</button>
              )}
            </div>
            <div className="phub-badge-card locked">
              <div className="phub-badge-shape">🔒</div>
              <div className="phub-badge-month">{nextMonth.label}</div>
              <div className="phub-badge-sub">Locked</div>
            </div>
          </div>
        </>
      ) : (
        <div className="phub-grid" style={{ marginTop: 16 }}>
          {actionBoxes.map(b => (
            <div key={b.key} className={`phub-box phub-box-action ${b.disabled ? "phub-box-disabled" : ""}`} onClick={b.disabled ? undefined : b.onClick}>
              <div className="phub-icon">{b.icon}</div>
              <div className="phub-label">{b.label}</div>
              {b.desc && <div className="phub-desc">{b.desc}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfilePage({ user, saveUser, setView, toast_ }) {
  const [section, setSection] = useState(null); // "userid" | "email" | "password"
  const [val1, setVal1] = useState("");
  const [val2, setVal2] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [emailCodeStep, setEmailCodeStep] = useState(false); // true once the code has been sent, awaiting entry
  const [pendingEmail, setPendingEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");

  const reset = () => { setVal1(""); setVal2(""); setPw(""); setError(""); setSuccess(""); setSaving(false); setEmailCodeStep(false); setPendingEmail(""); setEmailCode(""); };
  const open = (s) => { setSection(s); reset(); };

  const submitUserId = async () => {
    setError(""); setSaving(true);
    const newId = val1.trim().toLowerCase();
    if (!newId || !/^[a-z0-9_]{4,20}$/.test(newId)) { setError("User ID must be 4-20 characters, letters/numbers/underscore only."); setSaving(false); return; }
    if (newId === user.userId) { setError("That's already your current User ID."); setSaving(false); return; }
    const { data: idTaken } = await supabase.rpc("check_user_id_taken", { p_user_id: newId });
    if (idTaken) { setError("That User ID is already taken."); setSaving(false); return; }
    const { error: err } = await supabase.from("users").update({ user_id: newId }).eq("auth_id", user.supabaseId);
    if (err) { setError(`Failed: ${err.message}. If this persists, contact support@awamibaitulmaal.org.in`); setSaving(false); return; }
    // No scores/progress migration needed (Phase 3): Supabase rows key off
    // the immutable users.id, not the username, so they're untouched by this.
    saveUser({ ...user, userId: newId });
    toast_("✅ User ID updated — please log in again with your new ID.");
    setSuccess("User ID changed to: " + newId + ". Logging you out…");
    setSaving(false);
    setTimeout(async () => {
      await supabase.auth.signOut();
      setView("enroll");
    }, 2000);
  };

  const submitEmail = async () => {
    setError(""); setSaving(true);
    const newEmail = val1.trim().toLowerCase();
    if (!newEmail.includes("@")) { setError("Enter a valid email address."); setSaving(false); return; }
    if (newEmail === user.email) { setError("That's already your current email."); setSaving(false); return; }
    // Check the new email isn't already registered to another account
    const { data: emailTaken } = await supabase.rpc("check_email_taken", { p_email: newEmail });
    if (emailTaken) { setError("That email is already registered to another account."); setSaving(false); return; }
    const oldEmail = user.email;
    const { error: err } = await supabase.auth.updateUser({ email: newEmail });
    if (err) { setError("Failed to update email: " + err.message); setSaving(false); return; }
    // Send a courtesy notice to the OLD email so the owner is aware.
    try {
      const emailjs = await loadEmailJS();
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_RECEIPT_TEMPLATE_ID, {
        to_email: oldEmail,
        recipient_name: user.name,
        from_email: "support@awamibaitulmaal.org.in",
        reply_to: "support@awamibaitulmaal.org.in",
        email_heading: "Security notice — email change requested on your Quranic Vocab account",
        email_body_html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0d1f2d;border-radius:12px;overflow:hidden;border:1px solid rgba(0,200,230,.25);"><div style="padding:28px 24px;text-align:center;"><div style="font-size:34px;margin-bottom:10px">🔔</div><h2 style="color:#00c8e6;font-size:20px;margin:0 0 12px">Email Change Requested</h2><p style="color:#7ab8d4;font-size:14px;line-height:1.8;margin:0">A request was made to change the email on your Quranic Vocab account from <strong style="color:#f0f8ff">${oldEmail}</strong> to <strong style="color:#f0f8ff">${newEmail}</strong>.<br/><br/>If this was you, enter the code sent to your new address to confirm it.<br/><br/>If this was NOT you, contact <a href="mailto:support@awamibaitulmaal.org.in" style="color:#00c8e6">support@awamibaitulmaal.org.in</a> immediately.</p></div></div>`,
      });
    } catch (e) { console.warn("Old-email notice failed:", e); }
    toast_("✅ A 6-digit code was sent to your new email — enter it below to confirm.");
    setPendingEmail(newEmail);
    setEmailCodeStep(true);
    setSaving(false);
  };

  // Confirms the email change via the code sent to the NEW address — no
  // clickable link involved at all, so there's nothing for a corporate
  // email scanner (e.g. Outlook Safe Links) to prematurely trigger, which
  // is exactly what silently broke this flow before (the scanner "clicked"
  // the old confirmation link within seconds, completing the change on
  // Supabase's side with no real browser session present to sync
  // public.users.email — leaving it permanently stuck on the old address).
  const submitEmailCode = async () => {
    setError(""); setSaving(true);
    if (!emailCode.trim()) { setError("Enter the 6-digit code from your email."); setSaving(false); return; }
    const { data, error: err } = await supabase.auth.verifyOtp({
      email: pendingEmail, token: emailCode.trim(), type: "email_change",
    });
    if (err) {
      setError("Invalid or expired code — check your email for the latest one, or go back and try again.");
      setSaving(false);
      return;
    }
    // Explicit, immediate sync — don't rely solely on the USER_UPDATED
    // session-event listener's timing to catch this (same lesson as an
    // earlier bug this session: event timing right after verifyOtp isn't
    // reliable enough to depend on alone for something this important).
    if (data?.user) {
      await supabase.from("users").update({ email: data.user.email }).eq("auth_id", data.user.id);
    }
    // Unlike User ID / password changes, email isn't a login credential in
    // itself — no need to force a fresh login. The Supabase session is
    // already valid post-verifyOtp, so just update local state in place.
    saveUser({ ...user, email: pendingEmail });
    toast_("✅ Email updated!");
    setSuccess("Email changed to: " + pendingEmail + ".");
    setSaving(false);
  };

  const submitPassword = async () => {
    setError(""); setSaving(true);
    if (!pw) { setError("Enter your current password first."); setSaving(false); return; }
    if (!val1 || val1.length < 10) { setError("New password must be at least 10 characters."); setSaving(false); return; }
    if (val1 !== val2) { setError("New passwords don't match."); setSaving(false); return; }
    const pwErr = getPasswordComplexityError(val1);
    if (pwErr) { setError(pwErr); setSaving(false); return; }
    // Verify current password by re-authenticating
    const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: user.email, password: pw });
    if (verifyErr) { setError("Current password is incorrect."); setSaving(false); return; }
    const { error: err } = await supabase.auth.updateUser({ password: val1 });
    if (err) { setError("Failed to update password: " + err.message); setSaving(false); return; }
    toast_("✅ Password updated — please log in again with your new password.");
    setSuccess("Password changed. Logging you out…");
    setSaving(false);
    setTimeout(async () => {
      await supabase.auth.signOut();
      setView("enroll");
    }, 2000);
  };

  return (
    <div className="page pmd">
      <div className="lbl">Account</div>
      <h2>Profile Settings</h2>
      <p className="sub" style={{ marginBottom: 24 }}>Manage your account details</p>

      {/* Current info */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>User ID</span>
            <span style={{ fontWeight: 600, color: "var(--gold2)" }}>{user.userId}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Email</span>
            <span style={{ fontSize: 13, color: "var(--text)" }}>{user.email}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Name</span>
            <span style={{ fontSize: 13, color: "var(--text)" }}>{user.name}</span>
          </div>
        </div>
      </div>

      {/* Action cards */}
      {[
        { key: "userid", label: "Change User ID", icon: "🪪", desc: "Update your login username" },
        { key: "email", label: "Change Email Address", icon: "📧", desc: "A 6-digit code will be sent to the new email" },
        { key: "password", label: "Change Password", icon: "🔑", desc: "Must be 10+ chars with a number and special character" },
      ].map(item => (
        <div key={item.key} className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: section === item.key ? 16 : 0 }}>
            <div>
              <div style={{ fontWeight: 500 }}>{item.icon} {item.label}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{item.desc}</div>
            </div>
            <button className="btn bh bsm" onClick={() => section === item.key ? open(null) : open(item.key)}>
              {section === item.key ? (success ? "Done" : "Cancel") : "Change"}
            </button>
          </div>

          {section === item.key && (
            <div>
              {success ? (
                <div style={{ color: "var(--ok)", fontSize: 13, padding: "8px 0" }}>✅ {success}</div>
              ) : (
                <>
                  {item.key === "userid" && (
                    <div className="field"><label>New User ID</label><input value={val1} onChange={e => { setVal1(e.target.value); setError(""); }} placeholder="4-20 chars, letters/numbers/underscore" autoFocus /></div>
                  )}
                  {item.key === "email" && !emailCodeStep && (
                    <div className="field"><label>New Email Address</label><input type="email" value={val1} onChange={e => { setVal1(e.target.value); setError(""); }} placeholder="new@email.com" autoFocus /></div>
                  )}
                  {item.key === "email" && emailCodeStep && (
                    <>
                      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14, lineHeight: 1.6 }}>
                        Check <strong style={{ color: "var(--text)" }}>{pendingEmail}</strong> for a 6-digit code, then enter it below.
                      </p>
                      <div className="field"><label>6-Digit Code</label><input value={emailCode} onChange={e => { setEmailCode(e.target.value); setError(""); }} placeholder="123456" autoFocus /></div>
                    </>
                  )}
                  {item.key === "password" && (<>
                    <div className="field"><label>Current Password</label><PasswordInput value={pw} onChange={e => { setPw(e.target.value); setError(""); }} placeholder="Enter your current password" autoFocus /></div>
                    <div className="field">
                      <label>New Password</label>
                      <PasswordInput value={val1} onChange={e => { setVal1(e.target.value); setError(""); }} placeholder="Min 10 chars, 1 number, 1 special char"
                        style={val1 && !getPasswordComplexityError(val1) ? { borderColor: "var(--ok)" } : val1 ? { borderColor: "var(--err)" } : {}} />
                      {val1 && (() => {
                        const checks = [
                          { label: "10+ characters", ok: val1.length >= 10 },
                          { label: "1 number", ok: /[0-9]/.test(val1) },
                          { label: "1 special character", ok: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(val1) },
                        ];
                        return (
                          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                            {checks.map(c => (
                              <span key={c.label} style={{ fontSize: 11, color: c.ok ? "var(--ok)" : "var(--err)" }}>
                                {c.ok ? "✓" : "✗"} {c.label}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="field"><label>Confirm New Password</label><PasswordInput value={val2} onChange={e => { setVal2(e.target.value); setError(""); }} placeholder="Re-enter password"
                      style={val2 && val1 && val2 !== val1 ? { borderColor: "var(--err)" } : val2 && val1 && val2 === val1 ? { borderColor: "var(--ok)" } : {}} />
                      {val2 && val1 && val2 !== val1 && <div style={{ fontSize: 12, color: "var(--err)", marginTop: 4 }}>⚠ Passwords don't match</div>}
                    </div>
                  </>)}
                  {error && <div className="enroll-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
                  <button className="btn bg" onClick={item.key === "userid" ? submitUserId : item.key === "email" ? (emailCodeStep ? submitEmailCode : submitEmail) : submitPassword} disabled={saving}>
                    {saving ? "Saving…" : item.key === "email" && emailCodeStep ? "Confirm Code" : "Save Changes"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      <button className="btn bh" style={{ marginTop: 8 }} onClick={() => setView("home")}>← Back to Home</button>
    </div>
  );
}

function ResetPasswordPage({ onSetPassword, initialEmail = "", setView }) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError("");
    if (!email.trim()) { setError("Enter the email you signed up with."); return; }
    if (!code.trim() || !/^\d{6,10}$/.test(code.trim())) { setError("Enter the code from your email."); return; }
    if (!newPw || !confirmPw) { setError("Both password fields are required."); return; }
    const pwError = getPasswordComplexityError(newPw);
    if (pwError) { setError(pwError); return; }
    if (newPw !== confirmPw) { setError("Passwords don't match."); return; }
    setChecking(true);
    const result = await onSetPassword(email, code, newPw);
    setChecking(false);
    if (result.ok) {
      setDone(true);
    } else if (result.reason === "invalid-code") {
      setError("That code is incorrect or has expired. Please request a new one.");
    } else {
      setError("Could not update password. Please request a new reset code.");
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
      <h2 style={{ textAlign: "center" }}>Enter Your Reset Code</h2>
      <p className="sub" style={{ textAlign: "center", marginBottom: 26 }}>Check your email for a code, enter it below along with your new password.</p>
      <div className="card">
        <div className="field"><label>Your Registered Email</label><input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder="The email you signed up with" autoFocus={!initialEmail} /></div>
        <div className="field"><label>Code From Your Email</label><input value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); }} placeholder="Enter the code" inputMode="numeric" style={{ letterSpacing: "0.3em", fontSize: 18, textAlign: "center" }} autoFocus={!!initialEmail} /></div>
        <div className="field"><label>New Password</label><PasswordInput value={newPw} onChange={e => { setNewPw(e.target.value); setError(""); }} placeholder="Min 10 chars, 1 number, 1 special char" /></div>
        <div className="field">
          <label>Confirm New Password</label>
          <PasswordInput
            value={confirmPw}
            onChange={e => { setConfirmPw(e.target.value); setError(""); }}
            placeholder="Re-enter password"
            style={confirmPw && newPw && confirmPw !== newPw ? { borderColor: "var(--err)" } :
                   confirmPw && newPw && confirmPw === newPw ? { borderColor: "var(--ok)" } : {}}
          />
          {confirmPw && newPw && confirmPw !== newPw && (
            <div style={{ fontSize: 12, color: "var(--err)", marginTop: 4 }}>⚠ Passwords don't match</div>
          )}
          {confirmPw && newPw && confirmPw === newPw && (
            <div style={{ fontSize: 12, color: "var(--ok)", marginTop: 4 }}>✓ Passwords match</div>
          )}
        </div>
        {error && <div className="enroll-error">⚠ {error}</div>}
        <button className="btn bg bfw" onClick={submit} disabled={checking}>
          {checking ? "Updating…" : "Set New Password →"}
        </button>
        <button className="btn bh bfw" style={{ marginTop: 8 }} onClick={() => setView("enroll")}>Back to Login</button>
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

// ── Quran audio/image CDNs — free, no API key, no auth ─────────────────────
// Word-level pronunciation: official Quran.com/Quran Foundation word-by-word
// CDN. The URL is a public static asset (surah_ayah_word, each zero-padded
// to 3 digits) — no API call or OAuth needed, just the three numbers.
// Ayah-level audio/image: Al Quran Cloud (islamic.network) — also free/no-key.
const AYAH_RECITER = "ar.alafasy"; // Mishary Rashid Alafasy — Murattal style
function pad3(n) { return String(n).padStart(3, "0"); }
function getWordAudioUrl(surahNumber, ayahNumber, wordPosition) {
  return `https://audio.qurancdn.com/wbw/${pad3(surahNumber)}_${pad3(ayahNumber)}_${pad3(wordPosition)}.mp3`;
}
function getAyahImageUrl(surahNumber, ayahNumber) {
  return `https://cdn.islamic.network/quran/images/high-resolution/${surahNumber}_${ayahNumber}.png`;
}

// ── Admin-uploaded ayah images (Supabase Storage) ───────────────────────────
// Per-ayah, not per-word — several words can share the same ayah, so one
// upload benefits every word that references it. Falls back automatically
// to the external CDN (getAyahImageUrl above) for any ayah nobody's
// uploaded a custom image for yet — see AyahImagePopup's onError handling.
const AYAH_IMAGE_BUCKET = "ayah-images";
function getCustomAyahImageUrl(surahNumber, ayahNumber) {
  const { data } = supabase.storage.from(AYAH_IMAGE_BUCKET).getPublicUrl(`${surahNumber}_${ayahNumber}.png`);
  // Cache-bust so a re-uploaded replacement for the same ayah shows
  // immediately instead of a stale browser-cached version.
  return `${data.publicUrl}?v=${Date.now()}`;
}

// Normalizes whatever image format Admin uploads (jpg/png/webp/etc.) to a
// consistent PNG via canvas, so the lookup above can always assume a fixed
// `.png` extension without needing to track what was actually uploaded.
async function uploadAyahImage(file, surahNumber, ayahNumber) {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      canvas.toBlob(async (blob) => {
        if (!blob) { resolve({ ok: false, reason: "conversion-failed" }); return; }
        const { error } = await supabase.storage
          .from(AYAH_IMAGE_BUCKET)
          .upload(`${surahNumber}_${ayahNumber}.png`, blob, { upsert: true, contentType: "image/png" });
        if (error) { console.error("uploadAyahImage error:", error.message); resolve({ ok: false, reason: "upload-failed" }); return; }
        resolve({ ok: true });
      }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve({ ok: false, reason: "invalid-image" }); };
    img.src = objectUrl;
  });
}

// In-memory cache so re-opening the same ayah's audio doesn't re-hit the API.
const _ayahAudioCache = {};
async function fetchAyahAudioUrl(surahNumber, ayahNumber) {
  const key = `${surahNumber}:${ayahNumber}`;
  if (_ayahAudioCache[key]) return _ayahAudioCache[key];
  try {
    const res = await fetch(`https://api.alquran.cloud/v1/ayah/${key}/${AYAH_RECITER}`);
    const json = await res.json();
    const url = json?.data?.audio || null;
    if (url) _ayahAudioCache[key] = url;
    return url;
  } catch (e) {
    console.error("fetchAyahAudioUrl error:", e.message);
    return null;
  }
}

// Small reusable play/pause control. Owns its own <audio> element via ref so
// it can be stopped mid-playback (tap again while playing = stop), instead
// of only ever running to completion.
function PlayPauseButton({ resolveUrl, className, title, playingLabel = "⏸", idleLabel = "▶" }) {
  const [state, setState] = useState("idle"); // idle | loading | playing | error
  const audioRef = React.useRef(null);

  const stop = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setState("idle");
  };

  const toggle = async (e) => {
    e.stopPropagation();
    if (state === "playing" || state === "loading") { stop(); return; }
    setState("loading");
    const url = await resolveUrl();
    if (!url) { setState("error"); setTimeout(() => setState("idle"), 1800); return; }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setState("idle");
    audio.onerror = () => { setState("error"); setTimeout(() => setState("idle"), 1800); };
    setState("playing");
    audio.play().catch(() => { setState("error"); setTimeout(() => setState("idle"), 1800); });
  };

  // Stop playback if the component unmounts (e.g. popup closed) mid-play.
  React.useEffect(() => () => { if (audioRef.current) audioRef.current.pause(); }, []);

  return (
    <button
      className={`play-btn ${state} ${className || ""}`}
      onClick={toggle}
      aria-label={state === "playing" ? "Stop" : "Play"}
      title={title}
    >
      {state === "loading" ? "…" : state === "playing" ? playingLabel : state === "error" ? "⚠" : idleLabel}
    </button>
  );
}

// ── Plays a short lead-in portion of an ayah, word-by-word, chaining the
// same per-word CDN clips used for single-word pronunciation — rather than
// needing a separately trimmed audio file. wordCount is derived from how
// many space-separated words are in the admin-pasted "partial ayah text"
// (see WordsTable), on the assumption that text always starts from word 1.
function PartialAyahPlayButton({ surahNumber, ayahNumber, wordCount, className, title }) {
  const [state, setState] = useState("idle"); // idle | loading | playing | error
  const audioRef = React.useRef(null);
  const stoppedRef = React.useRef(false);

  const stop = () => {
    stoppedRef.current = true;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setState("idle");
  };

  const playFrom = (position) => {
    if (position > wordCount) { setState("idle"); return; }
    const url = getWordAudioUrl(surahNumber, ayahNumber, position);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => { if (!stoppedRef.current) playFrom(position + 1); };
    audio.onerror = () => { setState("error"); setTimeout(() => setState("idle"), 1800); };
    audio.play().catch(() => { setState("error"); setTimeout(() => setState("idle"), 1800); });
  };

  const toggle = (e) => {
    e.stopPropagation();
    if (state === "playing" || state === "loading") { stop(); return; }
    if (!wordCount || wordCount < 1) { setState("error"); setTimeout(() => setState("idle"), 1800); return; }
    stoppedRef.current = false;
    setState("playing");
    playFrom(1);
  };

  React.useEffect(() => () => { stoppedRef.current = true; if (audioRef.current) audioRef.current.pause(); }, []);

  return (
    <button className={`play-btn ${state} ${className || ""}`} onClick={toggle} aria-label={state === "playing" ? "Stop" : "Play"} title={title}>
      {state === "loading" ? "…" : state === "playing" ? "⏸" : state === "error" ? "⚠" : "▶"}
    </button>
  );
}


// ── Ayah reference popup — shows the actual mushaf-script image, with
// zoom controls (since the source image is a small raster crop — stretching
// it via CSS just blurs it, but letting the user zoom in on demand keeps it
// sharp at whatever size they actually need), plus a play/stop control for
// the full ayah's recitation. Image + audio via Al Quran Cloud. ────────────
// Small centered warning modal (yellow exclamation icon) — used for gate
// messages like "complete a set first" that deserve a clear pause, not a
// toast that can be missed or auto-dismisses too fast.
function GateWarningModal({ message, onClose }) {
  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 320, textAlign: "center", padding: "32px 24px" }}>
        <div style={{
          width: 52, height: 52, borderRadius: "50%", background: "rgba(255,184,0,.12)",
          border: "1px solid rgba(255,184,0,.4)", display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px", fontSize: 26, color: "#ffd96b",
        }}>⚠</div>
        <p style={{ margin: "0 0 20px", fontSize: 15, lineHeight: 1.6, color: "var(--text)" }}>{message}</p>
        <button className="btn bg" onClick={onClose} style={{ width: "100%" }}>Got it</button>
      </div>
    </div>,
    document.body
  );
}

function AyahImagePopup({ surahNumber, ayahNumber, partialAyahText, onClose }) {
  const [stage, setStage] = useState("custom"); // "custom" -> "cdn" -> "failed"
  // Fixed at a comfortable reading size (~400%, the sweet spot for legibility
  // on the low-res CDN fallback) rather than manual zoom controls — panning
  // around the enlarged image is just a normal scroll/drag inside the frame
  // below. Only applied to the CDN fallback — a custom-uploaded image is
  // presumably already a reasonably-sized, clear crop, so it's shown at its
  // own natural fit instead of forcing the same aggressive zoom onto it.
  const READING_SCALE = 4;
  const imageSrc = stage === "custom" ? getCustomAyahImageUrl(surahNumber, ayahNumber) : getAyahImageUrl(surahNumber, ayahNumber);
  const partialWordCount = partialAyahText ? partialAyahText.trim().split(/\s+/).filter(Boolean).length : 0;

  const handleImgError = () => {
    // No custom upload exists for this ayah yet (404) — silently fall back
    // to the CDN, no error shown to the learner for this expected case.
    if (stage === "custom") setStage("cdn");
    else setStage("failed");
  };

  // Rendered via portal straight into document.body — this modal is normally
  // mounted inside a word-card, and word-card has a :hover transform, which
  // would otherwise turn this popup's position:fixed into "fixed relative to
  // that card" instead of the real viewport (a CSS containing-block quirk),
  // making the popup collapse into a tiny sliver instead of covering the screen.
  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-head">
          <h3>Qur'an {surahNumber}:{ayahNumber}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ textAlign: "center" }}>
          {stage === "failed" ? (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>Couldn't load the ayah image right now — please try again later.</p>
          ) : (
            <div className="ayah-img-frame">
              <img
                src={imageSrc}
                alt={`Qur'an ${surahNumber}:${ayahNumber}`}
                onError={handleImgError}
                style={
                  stage === "custom"
                    ? { maxWidth: "100%", width: "100%", height: "auto" }
                    : { maxWidth: "100%", height: "auto", width: `${READING_SCALE * 100}%` }
                }
              />
            </div>
          )}
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <PlayPauseButton
              resolveUrl={() => fetchAyahAudioUrl(surahNumber, ayahNumber)}
              title="Play/stop this ayah's recitation"
            />
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Play full ayah recitation</span>
          </div>
          {partialWordCount > 0 && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <PartialAyahPlayButton
                surahNumber={surahNumber} ayahNumber={ayahNumber} wordCount={partialWordCount}
                title="Play/stop just the portion shown in this image"
              />
              <span style={{ fontSize: 12, color: "var(--gold2)" }}>Play up to here ({partialWordCount} word{partialWordCount !== 1 ? "s" : ""})</span>
            </div>
          )}
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 12 }}>Audio &amp; image courtesy of Al Quran Cloud (islamic.network)</p>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Shared expandable word card — used on Day Words page and History's ──────
// Strong/Weak word breakdown, so both show identical detail (Urdu,
// Qur'an reference).
function WordDetailCard({ word, isOpen, onToggle, badge, highlight = false }) {
  const [showAyahPopup, setShowAyahPopup] = useState(false);
  const hasAyahRef = !!(word.surahNumber && word.ayahNumber);
  const hasWordAudio = !!(word.surahNumber && word.ayahNumber && word.wordPosition);

  return (
    <div className={`word-card ${highlight ? "word-card-unmastered" : ""}`}>
      {badge && (
        <div style={{ textAlign: "center", marginBottom: 8 }}>{badge}</div>
      )}
      <div className="word-card-main">
        <div className="war-wrap">
          <div className="war">{word.arabic}</div>
        </div>
        <div className="word-mid">
          <div className="wtr">{word.translit}</div>
          <div className="wen">{word.english}</div>
          <div className="word-urdu">{word.urdu || "—"}</div>
        </div>
        <div className="word-actions-col">
          {hasWordAudio && (
            <PlayPauseButton
              resolveUrl={() => Promise.resolve(getWordAudioUrl(word.surahNumber, word.ayahNumber, word.wordPosition))}
              title="Play word pronunciation"
            />
          )}
          {word.ayahRef && (
            <button className="word-toggle" onClick={onToggle}>
              {isOpen ? "Hide ▲" : "Details ▼"}
            </button>
          )}
        </div>
      </div>
      {isOpen && word.ayahRef && (
        <div className="word-card-detail word-card-detail-compact">
          <span className="dlabel">Qur'an Ref</span>
          {hasAyahRef ? (
            <span className="dval ayah-ref-link" onClick={(e) => { e.stopPropagation(); setShowAyahPopup(true); }}>{word.ayahRef} 🖼</span>
          ) : (
            <span className="dval">{word.ayahRef}</span>
          )}
        </div>
      )}
      {showAyahPopup && hasAyahRef && (
        <AyahImagePopup surahNumber={word.surahNumber} ayahNumber={word.ayahNumber} partialAyahText={word.partialAyahText} onClose={() => setShowAyahPopup(false)} />
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
  const unlocked = getUnlockedDays(user.enrolledAt, user.dayProgress, Math.ceil(allWords.length / WORDS_PER_DAY));
  const totalDays = Math.ceil(allWords.length / WORDS_PER_DAY);
  const words = selectedDay ? allWords.slice((selectedDay - 1) * WORDS_PER_DAY, selectedDay * WORDS_PER_DAY) : null;
  const done = (d) => !!user.dayProgress?.[String(d)];

  const selectSet = (d) => { setSelectedDay(d); setViewingAllSets(false); };
  const selectAllSets = () => { setSelectedDay(null); setViewingAllSets(true); };

  // Item 4: words "mastered" in the currently selected set — a word counts as
  // mastered once its most recent MASTERY_STREAK_REQUIRED (3) attempts were
  // all correct, in a row. Older mistakes don't permanently block mastery
  // once that streak is achieved, but any wrong answer resets it back to
  // zero. Uses every score, not just this set's own quiz — a word can only
  // ever appear in its own set's quiz, the All Sets Quiz, or a weak-practice
  // quiz, so this naturally reflects progress from all three, matching how
  // mastery is counted everywhere else (Leaderboard, Home, set-unlock gate).
  let setMastery = null;
  let setMasteredKeys = null;
  if (selectedDay) {
    const setWordKeys = new Set((words || []).map(w => w.english));
    const { masteredSet } = buildStrictMastery(user.scores || []);
    // Only count mastery for words that actually belong to this set — an
    // All Sets Quiz attempt covers many sets' words at once, so we filter
    // its contribution down to just the words shown on this page.
    setMasteredKeys = new Set([...masteredSet].filter(key => setWordKeys.has(key)));
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
        <div className="cal-scroll" style={{ overflowX: "auto", paddingBottom: 6 }}>
          <div style={{ display: "flex", gap: 8, width: "max-content", alignItems: "stretch" }}>
            {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => {
              const locked = d > unlocked, isDone = done(d), isToday = d === unlocked;
              return (
                <div key={d}
                  className={`cc ${locked ? "locked" : isDone ? "done" : isToday ? "today" : "avail"} ${selectedDay === d ? "selected" : ""}`}
                  style={{ position: "relative", minWidth: 44, width: 44, height: 44 }}
                  title={locked ? `Unlocks once Set ${d - 1} is completed` : `Set ${d}`}
                  onClick={() => !locked && selectSet(d)}>
                  {/* Tick in top-right corner for completed sets */}
                  {isDone && (
                    <span style={{
                      position: "absolute", top: 2, right: 3,
                      fontSize: 8, fontWeight: 900, color: "#22c55e",
                      lineHeight: 1,
                      textShadow: "0 0 1px #22c55e, 0 0 1px #22c55e",
                      WebkitTextStroke: ".5px #22c55e"
                    }}>✓</span>
                  )}
                  {/* Set number - same size whether done or not */}
                  <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1 }}>{d}</span>
                </div>
              );
            })}
            <div className="cc cc-continues" style={{ minWidth: 44, width: 44, height: 44 }}
              title="More sets coming">⋯</div>
            <button
              className={`cc-allsets ${viewingAllSets ? "selected" : ""}`}
              style={{ height: 44, minWidth: 80 }}
              onClick={selectAllSets}
              title="All Sets Quiz">
              All Sets
            </button>
          </div>
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
                : <> — highlighted words still need {MASTERY_STREAK_REQUIRED} correct answers in a row.</>}
            </div>
          )}
          <div className="wlist" style={{ marginTop: 16 }}>
            {words.map((w, i) => {
              const isOpen = expandedWord === `${selectedDay}-${i}`;
              const isMastered = setMasteredKeys ? setMasteredKeys.has(w.english) : false;
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
            const allMasteredCount = getUnlockedWords(user.enrolledAt, user.dayProgress, allWords).filter(w => allMastered.has(w.english)).length;
            const allUnlocked = getUnlockedWords(user.enrolledAt, user.dayProgress, allWords);
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
                    const isMastered = allMastered.has(w.english);
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

function QuizPage({ quiz, onAnswer, onCancel, onTimeUp, optsVisible = true }) {
  const { questions, cur } = quiz;
  const q = questions[cur];
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

  // Auto-play this word's pronunciation once per question (not on every
  // re-render, e.g. when an answer is chosen — only when the question itself
  // changes). Silently does nothing for words without word-audio data yet,
  // and silently ignores browser autoplay-block errors.
  useEffect(() => {
    const w = q.word;
    if (!(w.surahNumber && w.ayahNumber && w.wordPosition)) return;
    const audio = new Audio(getWordAudioUrl(w.surahNumber, w.ayahNumber, w.wordPosition));
    audio.play().catch(() => {});
    return () => audio.pause();
  }, [cur]);

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
        <div className="qdir">Arabic → English</div>
        <div className="qq arabic">{q.word.arabic}</div>
        <div className="qtr">{q.word.translit}</div>
        {optsVisible && <div className="opts" key={`q-${cur}`} style={{ animation: "optsReset .01s" }}>
          {q.options.map((opt, i) => {
            let c = "opt";
            if (q.chosen !== null) { if (opt === q.word[q.af]) c += " correct"; else if (opt === q.chosen) c += " wrong"; }
            return (
              <button key={`${cur}-${i}`} className={c} onClick={() => onAnswer(opt)} disabled={q.chosen !== null}>
                <span className="opt-en">{opt}</span>
                {q.optionsUrdu[i] && <span className="opt-ur">{q.optionsUrdu[i]}</span>}
              </button>
            );
          })}
        </div>}
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

// ── Confetti component ────────────────────────────────────────────────────────
function Confetti() {
  // Cannon blast from both bottom corners
  const pieces = Array.from({ length: 70 }, (_, i) => {
    const fromLeft = i % 2 === 0;
    const angle = fromLeft
      ? -80 + Math.random() * 55   // left cannon fires up-right: -80° to -25°
      : -155 + Math.random() * 55; // right cannon fires up-left: -155° to -100°
    const velocity = 55 + Math.random() * 40; // vh distance
    const rad = angle * Math.PI / 180;
    const dx = Math.cos(rad) * velocity;
    const dy = Math.sin(rad) * velocity;
    return {
      id: i,
      color: ["#00c8e6","#ffd96b","#ff6b6b","#51cf66","#ff922b","#cc5de8","#1ae6ff"][i % 7],
      fromLeft,
      dx: `${dx}vw`,
      dy: `${dy}vh`,
      delay: `${Math.random() * .35}s`,
      duration: `${1.6 + Math.random() * 1.4}s`,
      size: `${7 + Math.random() * 8}px`,
      shape: i % 3 === 0 ? "50%" : i % 3 === 1 ? "2px" : "0%",
      spin: `${540 + Math.random() * 540}deg`,
    };
  });
  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 9999, overflow: "hidden" }}>
      {pieces.map(p => (
        <div key={p.id} style={{
          position: "absolute", bottom: "-10px",
          left: p.fromLeft ? "-5px" : "auto",
          right: p.fromLeft ? "auto" : "-5px",
          width: p.size, height: p.size,
          background: p.color, borderRadius: p.shape,
          "--dx": p.dx, "--dy": p.dy, "--spin": p.spin,
          animation: `confettiBlast ${p.duration} ${p.delay} cubic-bezier(.15,.65,.35,1) forwards`,
        }} />
      ))}
    </div>
  );
}

function ResultsPage({ quiz, user, onRetry, setView, onDonate, onReview, setSelectedDay }) {
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
      {/* Confetti celebration on pass */}
      {quiz.passed && <Confetti />}
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
        {/* Go to Next Set if passed */}
        {quiz.passed && quiz.day && quiz.day !== "weak-practice" && (
          <button className="btn bg" style={{ fontSize: 16, padding: "12px 28px", boxShadow: "0 0 28px rgba(0,200,230,.5)", animation: "glow 1.5s ease-in-out infinite alternate" }}
            onClick={() => {
              const nextDay = typeof quiz.day === "number" ? quiz.day + 1 : parseInt(quiz.day) + 1;
              setSelectedDay(nextDay);
              setView("learn");
            }}>
            🎉 Go to Next Set →
          </button>
        )}
        <button className="btn bt" onClick={onRetry}>Retry</button>
        <button className="btn bh" onClick={() => setView("learn")}>Sets</button>
        <button className="btn bh" onClick={() => setView("leaderboard")}>Ranks</button>
      </div>
      <div style={{ marginBottom: 22 }}>
        <button className="btn bh" style={{ width: "100%" }} onClick={() => onReview(result)}>📋 Review Full Answer Breakdown</button>
      </div>
      {/* Celebration banner on pass */}
      {quiz.passed && (
        <div style={{ background: "rgba(0,200,230,.08)", border: "1px solid rgba(0,200,230,.3)", borderRadius: 10, padding: "14px 18px", textAlign: "center", marginBottom: 12, animation: "tagIn .4s ease" }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>🏆✨🎊</div>
          <div style={{ fontSize: 14, color: "var(--cyan2)", fontWeight: 600 }}>ما شاء الله — Set unlocked!</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Your next set of words is now available.</div>
        </div>
      )}
    </div>
  );
}

// ── Simple SVG Bar Chart — supports two modes ──────────────────────────────────
// mode="score" (Set Quizzes): bar height = percentage, label on top = "8/10"
// mode="time"  (All Sets Quiz): bar height = seconds taken, label on top =
//   number of words answered correctly, y-axis gridlines scaled to seconds
function ScoreBarChart({ data, compact = false, mode = "score" }) {
  // Animate bars growing up from the baseline only once this chart actually
  // scrolls into view — not the instant the History page mounts, since
  // several charts sit below the fold and would otherwise finish animating
  // before the user ever scrolls down to see them. Re-triggers if the
  // underlying data changes while already visible (e.g. switching tabs).
  const containerRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) { setInView(true); obs.disconnect(); }
    }, { threshold: 0.1 });
    obs.observe(el);
    // Safety net: if the observer never reports intersection (layout timing
    // quirks, an element that's already fully on-screen at mount not always
    // firing its first callback reliably on every browser), reveal the
    // chart anyway after a short delay rather than leaving it permanently
    // stuck empty.
    const fallback = setTimeout(() => setInView(true), 900);
    return () => { obs.disconnect(); clearTimeout(fallback); };
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    setGrown(false);
    const t = setTimeout(() => setGrown(true), 30);
    return () => clearTimeout(t);
  }, [inView, data]);

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
    <svg ref={containerRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", maxWidth: compact ? 340 : 440, display: "block" }}>
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
      {(() => {
        // At high bar counts in compact mode, shrinking font alone wasn't
        // reliably preventing overlap (depends on exact glyph widths) — show
        // at most ~6 evenly-spaced labels instead, which guarantees no
        // overlap regardless of font metrics.
        const labelStep = compact && data.length > 6 ? Math.ceil(data.length / 6) : 1;
        return data.map((d, i) => {
        const x = startX + i * (barW + barGap);
        let barFraction, topLabel, color;
        if (mode === "time") {
          const t = d.timeUsedSec ?? 0;
          barFraction = maxTime > 0 ? t / maxTime : 0;
          topLabel = d.score != null ? `${d.score}✓` : "—";
          color = "var(--cyan2)";
        } else {
          barFraction = d.pct / 100;
          topLabel = (d.score != null && d.total != null) ? `${d.score}/${d.total}` : `${d.pct}%`;
          color = d.pct >= 70 ? "var(--pal-teal)" : d.pct >= 50 ? "var(--gold2)" : "var(--pal-rose)";
        }
        const fullBarH = barFraction * chartH;
        const barH = grown ? fullBarH : 0;
        const y = padT + chartH - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx="3" fill={color} opacity="0.85"
              style={{ transition: `height 1.1s cubic-bezier(.22,1,.36,1) ${i * 0.09}s, y 1.1s cubic-bezier(.22,1,.36,1) ${i * 0.09}s` }} />
            {(!compact || data.length <= 8) && grown && <text x={x + barW / 2} y={y - 7} fontSize={compact ? 10.5 : 13} fontWeight="600" fill="var(--text)" textAnchor="middle" fontFamily="Poppins, sans-serif" style={{ transition: `opacity .5s ease ${i * 0.09 + 0.7}s`, opacity: grown ? 1 : 0 }}>{topLabel}</text>}
            {i % labelStep === 0 && <text x={x + barW / 2} y={H - 10} fontSize={compact ? 10 : 12} fill="var(--muted)" textAnchor="middle" fontFamily="Poppins, sans-serif">{d.label}</text>}
          </g>
        );
        });
      })()}
    </svg>
  );
}

// ── Simple SVG Donut Chart — Strong vs Weak vs Even words ────────────────────
// Built from stacked stroke-dasharray circles (not path arcs) specifically so
// each ring segment can animate its length — only once this chart scrolls
// into view (not the instant the History page mounts), so it doesn't finish
// sweeping before the user has scrolled down to see it. Re-triggers if the
// underlying counts change while already visible.
function WordStrengthPieChart({ strong, weak, even, compact = false }) {
  const total = strong + weak + even;

  const containerRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [swept, setSwept] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) { setInView(true); obs.disconnect(); }
    }, { threshold: 0.1 });
    obs.observe(el);
    // Safety net: if the observer never reports intersection (layout timing
    // quirks, an element that's already fully on-screen at mount not always
    // firing its first callback reliably on every browser), reveal the
    // chart anyway after a short delay rather than leaving it permanently
    // stuck empty.
    const fallback = setTimeout(() => setInView(true), 900);
    return () => { obs.disconnect(); clearTimeout(fallback); };
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    setSwept(false);
    const t = setTimeout(() => setSwept(true), 30);
    return () => clearTimeout(t);
  }, [inView, strong, weak, even]);

  if (total === 0) return null;
  const size = 180, cx = size / 2, cy = size / 2;
  const ringR = 56; // radius at the centre of the ring stroke
  const strokeW = 28; // r(70) - innerR(42) from the original path version
  const circumference = 2 * Math.PI * ringR;

  const segments = [
    { value: strong, color: "var(--pal-teal)", label: "Strong" },
    { value: weak, color: "var(--pal-rose)", label: "Weak" },
    { value: even, color: "var(--gold2)", label: "Mixed" },
  ].filter(s => s.value > 0);

  let cumLen = 0;
  const rings = segments.map(seg => {
    const segLen = (seg.value / total) * circumference;
    const offsetBefore = cumLen;
    cumLen += segLen;
    return { ...seg, segLen, offsetBefore };
  });

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: compact ? 14 : 18 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: compact ? 200 : 230, height: compact ? 200 : 230, flexShrink: 0, display: "block" }}>
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {rings.map((seg, i) => (
            <circle key={i} cx={cx} cy={cy} r={ringR} fill="none" stroke={seg.color} strokeWidth={strokeW} opacity="0.88"
              strokeDasharray={`${swept ? seg.segLen : 0} ${circumference - (swept ? seg.segLen : 0)}`}
              strokeDashoffset={-seg.offsetBefore}
              style={{ transition: `stroke-dasharray 1.1s cubic-bezier(.22,1,.36,1) ${i * 0.35}s` }} />
          ))}
        </g>
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={compact ? 24 : 28} fontFamily="Poppins, sans-serif" fill="var(--gold3)" style={{ transition: "opacity .5s ease 1.9s", opacity: swept ? 1 : 0 }}>{total}</text>
        <text x={cx} y={cy + 18} textAnchor="middle" fontSize={compact ? 10 : 11} fontFamily="Poppins, sans-serif" fill="var(--muted)" style={{ transition: "opacity .5s ease 1.9s", opacity: swept ? 1 : 0 }}>words</text>
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: compact ? "6px 16px" : "8px 20px", paddingBottom: 6 }}>
        {rings.map((p, i) => (
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

// ── Monthly Mastery Target Chart — bars for the last 6 months (current +
// 5 prior) vs the learner's monthly word target. Same visual language as
// ScoreBarChart/WordStrengthPieChart: scroll-into-view animation, same
// palette (teal = target met, coral = missed, cyan = current month still in
// progress), same growth duration/stagger/easing.
function MonthlyTargetChart({ scores, target, compact = false }) {
  const containerRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [grown, setGrown] = useState(false);

  const monthlyCounts = React.useMemo(() => buildMonthlyMasteryCounts(scores || []), [scores]);

  const now = new Date();
  const months = [];
  for (let offset = -5; offset <= 0; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const key = d.toISOString().slice(0, 7);
    months.push({
      key, label: d.toLocaleDateString("en-GB", { month: "short" }),
      count: monthlyCounts[key] || 0, isCurrent: offset === 0,
    });
  }

  useEffect(() => {
    if (inView) return;
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) { setInView(true); obs.disconnect(); }
    }, { threshold: 0.1 });
    obs.observe(el);
    // Safety net: if the observer never reports intersection (layout timing
    // quirks, an element that's already fully on-screen at mount not always
    // firing its first callback reliably on every browser), reveal the
    // chart anyway after a short delay rather than leaving it permanently
    // stuck empty.
    const fallback = setTimeout(() => setInView(true), 900);
    return () => { obs.disconnect(); clearTimeout(fallback); };
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    setGrown(false);
    const t = setTimeout(() => setGrown(true), 30);
    return () => clearTimeout(t);
  }, [inView, scores, target]);

  const W = compact ? 320 : 420, H = compact ? 290 : 320, padL = compact ? 30 : 36, padB = 32, padT = 18, padR = 8;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const barGap = compact ? 10 : 14;
  const maxBarW = compact ? 30 : 42;
  const barW = Math.min(maxBarW, (chartW - barGap * (months.length - 1)) / months.length);
  const startX = padL;

  const maxVal = Math.max(target, ...months.map(m => m.count), 1) * 1.15;
  const targetY = padT + chartH - (target / maxVal) * chartH;

  return (
    <svg ref={containerRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", maxWidth: compact ? 340 : 440, display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map(f => {
        const y = padT + chartH - f * chartH;
        const v = Math.round(f * maxVal);
        return (
          <g key={f}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={padL - 8} y={y + 3} fontSize={compact ? 9 : 11} fill="var(--muted)" textAnchor="end" fontFamily="Poppins, sans-serif">{v}</text>
          </g>
        );
      })}
      {/* Target reference line */}
      <line x1={padL} y1={targetY} x2={W - padR} y2={targetY} stroke="var(--gold2)" strokeWidth="1.5" strokeDasharray="5 4" opacity={grown ? 0.7 : 0}
        style={{ transition: "opacity .6s ease 1.1s" }} />
      <text x={W - padR} y={targetY - 6} fontSize={compact ? 9 : 10.5} fill="var(--gold2)" textAnchor="end" fontFamily="Poppins, sans-serif" opacity={grown ? 1 : 0}
        style={{ transition: "opacity .6s ease 1.1s" }}>Target: {target}</text>
      {months.map((m, i) => {
        const x = startX + i * (barW + barGap);
        const fullBarH = (m.count / maxVal) * chartH;
        const barH = grown ? fullBarH : 0;
        const y = padT + chartH - barH;
        const color = m.isCurrent ? "var(--cyan2)" : m.count >= target ? "var(--pal-teal)" : "var(--pal-rose)";
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx="3" fill={color} opacity="0.85"
              style={{ transition: `height 1.1s cubic-bezier(.22,1,.36,1) ${i * 0.09}s, y 1.1s cubic-bezier(.22,1,.36,1) ${i * 0.09}s` }} />
            <text x={x + barW / 2} y={y - 7} fontSize={compact ? 10.5 : 13} fontWeight="600" fill="var(--text)" textAnchor="middle" fontFamily="Poppins, sans-serif"
              style={{ transition: `opacity .5s ease ${i * 0.09 + 0.7}s`, opacity: grown ? 1 : 0 }}>{m.count}</text>
            <text x={x + barW / 2} y={H - 10} fontSize={compact ? 10 : 12} fill={m.isCurrent ? "var(--cyan2)" : "var(--muted)"} textAnchor="middle" fontFamily="Poppins, sans-serif" fontWeight={m.isCurrent ? "600" : "400"}>{m.label}</text>
          </g>
        );
      })}
    </svg>
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
  const setScores = (user.scores || []).filter(s => s.day && s.day !== "weak-practice");
  const allSetsScores = (user.scores || []).filter(s => !s.day);
  const weakScores = (user.scores || []).filter(s => s.day === "weak-practice");
  const barData = buildAttemptScoreSeries(setScores);
  const allSetsBarData = buildAttemptScoreSeries(allSetsScores);
  const weakBarData = buildAttemptScoreSeries(weakScores);
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
          <div className="card chart-col chart-col-teal" style={{ marginBottom: 18 }}>
            <div className="chart-col-head"><div className="lbl" style={{ marginBottom: 0 }}>Monthly Mastery Target — Last 6 Months</div></div>
            <div className="chart-col-inner">
              <MonthlyTargetChart scores={user.scores || []} target={user.monthlyTarget || 30} />
            </div>
          </div>

          <div className="chart-row">
            <div className="card chart-col chart-col-cyan">
              <div className="chart-col-head"><div className="lbl" style={{ marginBottom: 0 }}>Set Quizzes — Last {barData.length} Attempts</div></div>
              <div className="chart-col-inner">
                {barData.length > 0 ? <ScoreBarChart data={barData} compact mode="score" /> : <div className="chart-empty">No set quizzes yet</div>}
              </div>
            </div>
            <div className="card chart-col chart-col-gold">
              <div className="chart-col-head">
                <div className="lbl" style={{ marginBottom: 0 }}>All Sets Quiz — Last {allSetsBarData.length} Attempts</div>
              </div>
              <div className="chart-col-inner">
                {allSetsBarData.length > 0 ? <ScoreBarChart data={allSetsBarData} compact mode="score" /> : <div className="chart-empty">No All Sets Quiz attempts yet</div>}
              </div>
              {allSetsBarData.length > 0 && (() => {
                const totalUnlockedWords = getUnlockedWords(user.enrolledAt, user.dayProgress, allWords).length;
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

          {/* Weak Words Practice — separate chart */}
          {weakBarData.length > 0 && (
            <div className="card chart-col chart-col-rose" style={{ marginBottom: 16 }}>
              <div className="chart-col-head"><div className="lbl" style={{ marginBottom: 0 }}>Weak Words Practice — Last {weakBarData.length} Attempts</div></div>
              <div className="chart-col-inner">
                <ScoreBarChart data={weakBarData} compact mode="score" />
              </div>
            </div>
          )}

          {(wordBreakdown.totalTracked > 0 || allSetsWordBreakdown.totalTracked > 0) && (
            <div className="chart-row" style={{ marginBottom: 16 }}>
              {wordBreakdown.totalTracked > 0 && (
                <div className="card chart-col chart-col-cyan">
                  <div className="chart-col-head"><div className="lbl" style={{ marginBottom: 0 }}>Set Quizzes — Word Strength</div></div>
                  <div className="chart-col-inner">
                    <WordStrengthPieChart strong={wordBreakdown.strong.length} weak={wordBreakdown.weak.length} even={wordBreakdown.even.length} compact />
                  </div>
                </div>
              )}
              {allSetsWordBreakdown.totalTracked > 0 && (
                <div className="card chart-col chart-col-gold">
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
                    const isMastered = masteredSet.has(w.english);
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
              const full = (allWords || []).find(w => w.english === d.english) || {};
              const word = { ...full, arabic: full.arabic ?? d.arabic, english: d.english, translit: full.translit ?? d.translit };
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

function LBPage({ participants, user, allWords }) {
  // Rank by mastery progress: mastered words / unlocked words %
  // Falls back to best quiz score if no mastery data
  const ranked = [...participants]
    .map(p => {
      const scores = p.scores || [];
      const unlocked = getUnlockedDays(p.enrolledAt, p.dayProgress, Math.ceil(allWords.length / WORDS_PER_DAY)) * WORDS_PER_DAY || 1;
      const masteredSet = getMasteredWords(scores, allWords);
      const masteryPct = Math.round((masteredSet.size / unlocked) * 100);
      const bestQuiz = scores.length > 0 ? Math.max(...scores.map(s => s.pct)) : 0;
      return { ...p, masteryPct, bestQuiz, unlockedWords: unlocked, masteredWords: masteredSet.size, sessions: scores.length };
    })
    .filter(p => p.unlockedWords > 0)
    .sort((a, b) => b.masteryPct - a.masteryPct || b.masteredWords - a.masteredWords || b.bestQuiz - a.bestQuiz)
    .slice(0, 10);

  const userKey = user ? (user.userId || user.email) : null;
  return (
    <div className="page pmd">
      <div className="lbl">Leaderboard</div>
      <h2>Top Learners</h2>
      <p className="sub" style={{ marginBottom: 26 }}>Top 10, ranked by words mastered out of words unlocked</p>
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
                  <div className="lbmeta">{p.masteredWords} of {p.unlockedWords} words mastered · {p.sessions} sessions</div>
                </div>
                <div className="lbsc">{p.masteryPct}%</div>
                <div className="lbbadge">{calcStreak(p.scores) > 0 ? `🔥${calcStreak(p.scores)}` : "—"}</div>
              </div>
            );
          })}
        </div>}
    </div>
  );
}

// ─── Admin Password Gate ──────────────────────────────────────────────────────
// ── Password input with a show/hide toggle — used everywhere a password is
// typed (login, registration, change/reset password, the beta gate). Merges
// any caller-supplied style (e.g. green/red border validation feedback)
// with the padding needed to make room for the toggle button, and forwards
// everything else (autoFocus, onKeyDown, className, etc.) straight through.
function PasswordInput({ value, onChange, style, onKeyDown, onKeyUp, ...rest }) {
  const [show, setShow] = useState(false);
  const [capsOn, setCapsOn] = useState(false);

  // getModifierState reads the CURRENT physical Caps Lock state on every
  // keystroke — this is detection only; browsers never allow a web page to
  // read or change Caps Lock any other way (turning it on/off isn't
  // something a web app can do at all, by design, for security reasons).
  const checkCaps = (e) => {
    if (e.getModifierState) setCapsOn(e.getModifierState("CapsLock"));
  };

  return (
    <div>
      <div style={{ position: "relative" }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          onKeyDown={e => { checkCaps(e); if (onKeyDown) onKeyDown(e); }}
          onKeyUp={e => { checkCaps(e); if (onKeyUp) onKeyUp(e); }}
          style={{ paddingRight: 42, ...style }}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          tabIndex={-1}
          aria-label={show ? "Hide password" : "Show password"}
          style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", cursor: "pointer", padding: 4,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--muted)", lineHeight: 1,
          }}
        >
          {show ? (
            // Eye with a slash through it — "currently visible, click to hide"
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-6 0-10-8-10-8a19.7 19.7 0 0 1 4.22-5.44M9.9 4.24A10.4 10.4 0 0 1 12 4c6 0 10 8 10 8a19.7 19.7 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          ) : (
            // Plain open eye — "currently hidden, click to show"
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )}
        </button>
      </div>
      {capsOn && (
        <div style={{ fontSize: 11.5, color: "var(--gold3)", marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>
          ⚠ Caps Lock is on
        </div>
      )}
    </div>
  );
}

function AdminGate({ onLogin }) {
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!password) return;
    setChecking(true);
    setError("");
    const result = await onLogin("admin", password);
    setChecking(false);
    if (!result.ok) {
      setError("Incorrect password.");
      setPassword("");
    }
    // On success, adminUnlocked flips true reactively once the SIGNED_IN
    // event fires and loadUserProfile picks up the admin role — no further
    // action needed here.
  };

  return (
    <div className="page psm" style={{ paddingTop: 80 }}>
      <div className="lbl" style={{ justifyContent: "center" }}>Restricted Area</div>
      <h2 style={{ textAlign: "center" }}>Admin Access</h2>
      <p className="sub" style={{ textAlign: "center", marginBottom: 26 }}>This area is for administrators only.</p>
      <div className="card">
        <div className="field">
          <label>Admin Password</label>
          <PasswordInput
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
function FinanceGate({ onLogin }) {
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!password) return;
    setChecking(true);
    setError("");
    const result = await onLogin("finance", password);
    setChecking(false);
    if (!result.ok) {
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
          <PasswordInput
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
// Now backed by a real Supabase account (as of the session-security fix), so
// this re-verifies the current password against Supabase directly, then
// updates it for real — password changes now sync instantly across every
// device, instead of only the browser they were changed on.
function ChangePasswordModal({ label, onClose, toast_ }) {
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
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser?.email) {
      setChecking(false);
      setError("Couldn't verify your session. Please log out and back in, then try again.");
      return;
    }
    // Re-verify current password by attempting a real sign-in with it
    const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: authUser.email, password: currentPw });
    if (verifyErr) {
      setChecking(false);
      setError("Current password is incorrect.");
      return;
    }
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
    setChecking(false);
    if (updateErr) {
      setError("Couldn't update password. Please try again.");
      return;
    }
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
          <div className="field"><label>Current Password</label><PasswordInput value={currentPw} onChange={e => { setCurrentPw(e.target.value); setError(""); }} placeholder="Enter current password" autoFocus /></div>
          <div className="field"><label>New Password</label><PasswordInput value={newPw} onChange={e => { setNewPw(e.target.value); setError(""); }} placeholder="Min 10 chars, 1 number, 1 special char" /></div>
          <div className="field"><label>Confirm New Password</label><PasswordInput value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setError(""); }} placeholder="Re-enter new password" /></div>
          {error && <div className="enroll-error">⚠ {error}</div>}
          <button className="btn bg bfw" onClick={submit} disabled={checking}>
            {checking ? "Updating…" : "Update Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Finance's password-change flow — requires Admin approval ───────────────
// Replaces ChangePasswordModal for Finance only (Admin keeps the direct
// self-service version above). Two things happen here, not one form: (1)
// requesting the change, which just queues it for Admin — no password
// typed at this stage — and (2), once Admin has approved and Finance has
// the emailed code, actually redeeming that code to set the new password.
// Both live in this one modal so Finance never has to hunt for a separate
// screen or get logged out mid-flow.
function RequestPasswordChangeModal({ onClose, toast_, onSetPassword }) {
  const [phase, setPhase] = useState("loading"); // loading | none | pending | approved | rejected
  const [email, setEmail] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Code-redemption fields (only used once phase === "approved")
  const [code, setCode] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [codeError, setCodeError] = useState("");
  const [submittingCode, setSubmittingCode] = useState(false);
  const [done, setDone] = useState(false);

  const loadStatus = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser?.email) setEmail(authUser.email);
    const latest = await fetchMyLatestPasswordChangeRequest();
    if (!latest) { setPhase("none"); return; }
    // An "approved" status older than ~1 hour means the actual emailed code
    // has long since expired (Supabase OTP codes expire around then) — don't
    // let a stale old approval keep skipping straight to code-entry forever;
    // treat it as needing a fresh request instead.
    if (latest.status === "approved") {
      const approvedAt = latest.resolvedAt ? new Date(latest.resolvedAt).getTime() : new Date(latest.requestedAt).getTime();
      const staleAfterMs = 60 * 60 * 1000;
      if (Date.now() - approvedAt > staleAfterMs) { setPhase("none"); return; }
    }
    setPhase(latest.status);
  };

  useEffect(() => { loadStatus(); }, []);

  const sendRequest = async () => {
    setRequesting(true);
    const ok = await requestPasswordChangeRPC();
    setRequesting(false);
    if (ok) {
      setPhase("pending");
      toast_("Request sent to Admin for approval.");
    } else {
      toast_("Couldn't send the request — please try again.");
    }
  };

  const refreshStatus = async () => {
    setRefreshing(true);
    await loadStatus();
    setRefreshing(false);
  };

  const submitCode = async () => {
    setCodeError("");
    if (!code.trim()) { setCodeError("Enter the 6-digit code from your email."); return; }
    const complexityError = getPasswordComplexityError(newPw);
    if (complexityError) { setCodeError(complexityError); return; }
    if (newPw !== confirmPw) { setCodeError("New password and confirmation don't match."); return; }
    setSubmittingCode(true);
    const result = await onSetPassword(email, code.trim(), newPw);
    setSubmittingCode(false);
    if (result.ok) {
      setDone(true);
    } else {
      setCodeError(result.reason === "invalid-code" ? "Invalid or expired code — check your email for the latest one." : "Couldn't update password. Please try again.");
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <h3>Finance — Change Password</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {done ? (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
              <p style={{ fontSize: 14, color: "var(--text)", marginBottom: 6 }}>Password updated!</p>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>You've been signed out — log back in with your new password.</p>
              <button className="btn bh" style={{ marginTop: 16 }} onClick={onClose}>Close</button>
            </div>
          ) : phase === "loading" ? (
            <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>Checking status…</p>
          ) : phase === "approved" ? (
            <>
              <p style={{ fontSize: 13, color: "var(--ok)", marginBottom: 16, lineHeight: 1.6 }}>
                ✅ Admin approved your request. Check <strong>{email}</strong> for a 6-digit code, then enter it below with your new password.
              </p>
              <div className="field"><label>6-Digit Code</label><input value={code} onChange={e => setCode(e.target.value)} placeholder="123456" /></div>
              <div className="field"><label>New Password</label><PasswordInput value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 10 chars, 1 number, 1 special char" /></div>
              <div className="field"><label>Confirm New Password</label><PasswordInput value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Re-enter new password" /></div>
              {codeError && <div className="enroll-error">⚠ {codeError}</div>}
              <button className="btn bg bfw" onClick={submitCode} disabled={submittingCode}>
                {submittingCode ? "Updating…" : "Set New Password"}
              </button>
            </>
          ) : phase === "pending" ? (
            <>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
                ⏳ Your request is awaiting Admin approval. You'll be able to set a new password here once it's approved.
              </p>
              <button className="btn bh" onClick={refreshStatus} disabled={refreshing}>
                {refreshing ? "Checking…" : "Refresh Status"}
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
                {phase === "rejected"
                  ? "Your last request was declined by Admin. You can submit a new one below."
                  : "Password changes for Finance accounts require Admin approval — request one below, and you'll get an email once it's approved."}
              </p>
              <button className="btn bg bfw" onClick={sendRequest} disabled={requesting}>
                {requesting ? "Sending…" : "Request Password Change"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Shared Receipt Manager — used inside Admin's Receipts tab AND the ───────
// standalone Finance Panel, so both stay in sync with one implementation
// instead of two copies to maintain separately.
function ReceiptManager({ receipts, receiptRequests = [], onIssueReceipt, onDismissRequest, toast_, participants = [] }) {
  const [rcptName, setRcptName] = useState("");
  const [rcptEmail, setRcptEmail] = useState("");
  const [rcptAmount, setRcptAmount] = useState("");
  const [rcptDate, setRcptDate] = useState(new Date().toISOString().slice(0, 10));
  const [rcptPurpose, setRcptPurpose] = useState("Donation");
  const [rcptNote, setRcptNote] = useState("");
  const [rcptUpiId, setRcptUpiId] = useState("");
  const [rcptUtr, setRcptUtr] = useState("");
  const [rcptError, setRcptError] = useState("");
  const [rcptSending, setRcptSending] = useState(false);
  const [rcptSuccess, setRcptSuccess] = useState(null);
  const [activeRequestId, setActiveRequestId] = useState(null); // set when filling the form from a pending request
  const [downloadingId, setDownloadingId] = useState(null);

  // User search for auto-populate
  const [userSearch, setUserSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestions = userSearch.length >= 1
    ? participants.filter(p =>
        p.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
        p.userId?.toLowerCase().includes(userSearch.toLowerCase()) ||
        p.email?.toLowerCase().includes(userSearch.toLowerCase())
      ).slice(0, 6)
    : [];

  const selectUser = (p) => {
    setRcptName(p.name || "");
    setRcptEmail(p.email || "");
    setUserSearch(p.name || "");
    setShowSuggestions(false);
    setRcptError("");
  };

  const pendingRequests = receiptRequests.filter(r => r.status === "pending");

  // Pull a pending request's details into the issue form. Finance still
  // reviews/edits everything before submitting — this just saves retyping.
  const fillFromRequest = (req) => {
    setRcptName(req.donorName || "");
    setRcptEmail(req.donorEmail || "");
    setRcptAmount(req.amount != null ? String(req.amount) : "");
    setRcptDate(req.donationDate || new Date().toISOString().slice(0, 10));
    setRcptPurpose("Donation");
    setRcptNote(req.note || "");
    setRcptUtr(req.utrReference || "");
    setActiveRequestId(req.id);
    setRcptError("");
    setRcptSuccess(null);
  };

  const dismiss = async (id) => {
    const ok = await onDismissRequest(id);
    if (ok) toast_("Request dismissed.");
    else toast_("Couldn't dismiss the request — try again.");
    if (activeRequestId === id) setActiveRequestId(null);
  };

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
    if (rcptDate > new Date().toISOString().slice(0, 10)) {
      setRcptError("Date received can't be in the future.");
      return;
    }
    if (!rcptUpiId.trim()) {
      setRcptError("UPI ID is required.");
      return;
    }
    if (!/^[a-zA-Z0-9]+$/.test(rcptUpiId.trim())) {
      setRcptError("UPI ID should only contain letters and numbers.");
      return;
    }
    if (!/^[0-9]{12}$/.test(rcptUtr.trim())) {
      setRcptError("UTR must be exactly 12 digits.");
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
      utrReference: `UPI: ${rcptUpiId.trim()} | UTR: ${rcptUtr.trim()}`,
      requestId: activeRequestId,
    });
    setRcptSending(false);
    if (result.ok) {
      setRcptSuccess({ receiptNo: result.receiptNo, emailFailed: result.emailFailed });
      setRcptName(""); setRcptEmail(""); setRcptAmount(""); setRcptNote(""); setRcptUpiId(""); setRcptUtr("");
      setRcptDate(new Date().toISOString().slice(0, 10));
      setRcptPurpose("Donation");
      setActiveRequestId(null);
    } else {
      setRcptError("Could not issue receipt. Please try again.");
    }
  };

  const downloadPDF = async (r) => {
    setDownloadingId(r.id);
    try {
      await generateReceiptPDF(r);
    } catch (err) {
      console.error("generateReceiptPDF error:", err);
      toast_("Couldn't generate the PDF — try again.");
    }
    setDownloadingId(null);
  };

  return (
    <>
      {pendingRequests.length > 0 && (
        <div className="card" style={{ maxWidth: 480, marginBottom: 16 }}>
          <div className="lbl">Receipt Requests ({pendingRequests.length} pending)</div>
          <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.6 }}>
            Donors have asked for these — verify the payment actually came in, then "Fill Form" to issue.
          </p>
          {pendingRequests.map(req => (
            <div key={req.id} style={{ padding: "10px 12px", marginBottom: 8, borderRadius: 7, background: activeRequestId === req.id ? "rgba(0,200,230,.1)" : "rgba(0,200,230,.04)", border: activeRequestId === req.id ? "1px solid rgba(0,200,230,.4)" : "1px solid rgba(0,200,230,.12)" }}>
              <div style={{ fontSize: 13.5, color: "var(--text)", fontWeight: 500 }}>{req.donorName}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{req.donorEmail}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                {req.amount ? `₹${Number(req.amount).toLocaleString("en-IN")}` : "Amount not given"}
                {req.donationDate ? ` · ${new Date(req.donationDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
              </div>
              {req.note && <div style={{ fontSize: 11.5, color: "var(--gold3)", marginTop: 2 }}>Note: {req.note}</div>}
              <div style={{ fontSize: 11.5, color: "var(--cyan2)", marginTop: 2, fontFamily: "monospace" }}>UTR: {req.utrReference || "—"}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="copy-btn" onClick={() => fillFromRequest(req)}>Fill Form</button>
                <button className="copy-btn" style={{ color: "var(--err)", borderColor: "rgba(220,90,90,.35)" }} onClick={() => dismiss(req.id)}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ maxWidth: 480, marginBottom: 16 }}>
        <div className="lbl">Issue Donation Receipt</div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
          Only issue after the finance team confirms payment was received.
        </p>

        {activeRequestId && (
          <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 7, background: "rgba(0,200,230,.08)", border: "1px solid rgba(0,200,230,.25)", fontSize: 12, color: "var(--cyan2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Filled from donor's request</span>
            <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setActiveRequestId(null)}>Clear</span>
          </div>
        )}

        {/* User search — auto-populates name + email from registered members */}
        <div className="field" style={{ position: "relative" }}>
          <label>Search Registered Member (optional)</label>
          <input
            value={userSearch}
            onChange={e => { setUserSearch(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Type name, user ID or email..."
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: "rgba(9,30,46,.97)", border: "1px solid rgba(0,200,230,.25)", borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.5)" }}>
              {suggestions.map(p => (
                <div key={p.userId} onClick={() => selectUser(p)}
                  style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid rgba(0,200,230,.08)", transition: "background .12s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(0,200,230,.08)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{p.userId} · {p.email}</div>
                </div>
              ))}
            </div>
          )}
          {userSearch && suggestions.length === 0 && showSuggestions && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>No matching member — fill details manually below</div>
          )}
        </div>

        <div className="field"><label>Donor Name</label><input value={rcptName} onChange={e => { setRcptName(e.target.value); setRcptError(""); }} placeholder="Full name" /></div>
        <div className="field"><label>Donor Email</label><input type="email" value={rcptEmail} onChange={e => { setRcptEmail(e.target.value); setRcptError(""); }} placeholder="donor@email.com" /></div>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="field" style={{ flex: 1 }}><label>Amount (₹)</label><input type="number" value={rcptAmount} onChange={e => { setRcptAmount(e.target.value); setRcptError(""); }} placeholder="1000" /></div>
          <div className="field" style={{ flex: 1 }}><label>Date Received</label><input type="date" value={rcptDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setRcptDate(e.target.value)} /></div>
        </div>
        <div className="field"><label>Purpose</label><input value={rcptPurpose} onChange={e => setRcptPurpose(e.target.value)} placeholder="Donation" /></div>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="field" style={{ flex: 1 }}><label>UPI ID</label><input value={rcptUpiId} onChange={e => { setRcptUpiId(e.target.value); setRcptError(""); }} placeholder="username@bank" /></div>
          <div className="field" style={{ flex: 1 }}><label>UTR Number (12 digits)</label><input value={rcptUtr} onChange={e => { setRcptUtr(e.target.value); setRcptError(""); }} placeholder="123456789012" maxLength={12} /></div>
        </div>
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
            <thead><tr><th>Receipt #</th><th>Donor</th><th>Amount</th><th>Date</th><th>UTR</th><th>Issued</th><th></th></tr></thead>
            <tbody>
              {receipts.map(r => (
                <tr key={r.id}>
                  <td style={{ color: "var(--gold3)", fontFamily: "monospace" }}>{r.receiptNo}</td>
                  <td>{r.donorName}<br/><span style={{ color: "var(--muted)", fontSize: 11 }}>{r.donorEmail}</span></td>
                  <td style={{ color: "var(--ok)" }}>₹{r.amount}</td>
                  <td>{new Date(r.donationDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td style={{ color: "var(--cyan2)", fontSize: 11, fontFamily: "monospace" }}>{r.utrReference || "—"}</td>
                  <td style={{ color: "var(--muted)", fontSize: 11 }}>{new Date(r.issuedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                  <td><button className="copy-btn" onClick={() => downloadPDF(r)} disabled={downloadingId === r.id}>{downloadingId === r.id ? "…" : "PDF"}</button></td>
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
function FinancePage({ receipts, receiptRequests, onIssueReceipt, onDismissRequest, toast_, participants = [] }) {
  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <div className="lbl" style={{ marginBottom: 4 }}>Finance Panel</div>
        <h2 style={{ fontSize: 20 }}>Donation Receipts</h2>
      </div>
      <ReceiptManager receipts={receipts} receiptRequests={receiptRequests} onIssueReceipt={onIssueReceipt} onDismissRequest={onDismissRequest} toast_={toast_} participants={participants} />
    </div>
  );
}

// ─── Words Table with inline editing ─────────────────────────────────────────
// Small file-picker + upload button, used inline in the words admin table.
// Shows the current image thumbnail (if any) as a visual confirmation, and
// a compact status while uploading.
function AyahImageUploadButton({ surahNumber, ayahNumber }) {
  const [status, setStatus] = useState("idle"); // idle | uploading | done | error
  const inputRef = React.useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("uploading");
    const result = await uploadAyahImage(file, surahNumber, ayahNumber);
    setStatus(result?.ok ? "done" : "error");
    setTimeout(() => setStatus("idle"), 2000);
    e.target.value = ""; // allow re-selecting the same file later if needed
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      <button
        className="btn bh bsm" style={{ fontSize: 10, padding: "3px 8px" }}
        onClick={() => inputRef.current?.click()}
        disabled={status === "uploading"}
        title="Upload a custom image for this ayah — used by every word that references it"
      >
        {status === "uploading" ? "…" : status === "error" ? "⚠ retry" : status === "done" ? "✓ saved" : "🖼 Ayah Img"}
      </button>
    </div>
  );
}

function WordsTable({ allWords, onEditWord, onDeleteWord }) {
  const [editIdx, setEditIdx] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const openEdit = (w, i) => {
    setEditIdx(i);
    setEditForm({ ...w });
  };
  const cancelEdit = () => { setEditIdx(null); setEditForm({}); };
  const saveEdit = async () => {
    const target = allWords[editIdx];
    setSaving(true);
    const ok = await onEditWord(target.dbId, editForm);
    setSaving(false);
    if (ok) { setEditIdx(null); setEditForm({}); }
  };
  const remove = async (w) => {
    await onDeleteWord(w.dbId);
  };

  return (
    <div style={{ maxHeight: 500, overflowY: "auto" }}>
      <table className="tbl">
        <thead><tr><th>Arabic</th><th>Translit</th><th>English</th><th>Urdu</th><th>Surah:Ayah</th><th>Image</th><th></th></tr></thead>
        <tbody>
          {allWords.map((w, i) => {
            if (editIdx === i) {
              return (
                <tr key={w.dbId || i} style={{ background: "rgba(0,200,230,.06)" }}>
                  <td><input value={editForm.arabic || ""} onChange={e => setEditForm(f => ({ ...f, arabic: e.target.value }))} style={{ direction: "rtl", fontSize: 18, fontFamily: "serif", width: 90, background: "transparent", border: "1px solid var(--cyan2)", borderRadius: 4, color: "var(--text)", padding: "2px 6px" }} /></td>
                  <td><input value={editForm.translit || ""} onChange={e => setEditForm(f => ({ ...f, translit: e.target.value }))} style={{ width: 90, background: "transparent", border: "1px solid rgba(255,255,255,.15)", borderRadius: 4, color: "var(--text)", padding: "2px 6px" }} /></td>
                  <td><input value={editForm.english || ""} onChange={e => setEditForm(f => ({ ...f, english: e.target.value }))} style={{ width: 90, background: "transparent", border: "1px solid rgba(255,255,255,.15)", borderRadius: 4, color: "var(--text)", padding: "2px 6px" }} /></td>
                  <td><input value={editForm.urdu || ""} onChange={e => setEditForm(f => ({ ...f, urdu: e.target.value }))} style={{ direction: "rtl", fontFamily: "'Noto Nastaliq Urdu',serif", fontSize: 13, width: 70, background: "transparent", border: "1px solid rgba(255,255,255,.15)", borderRadius: 4, color: "var(--text)", padding: "2px 6px" }} /></td>
                  <td style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
                    <div>
                      <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 2 }}>Surah #</div>
                      <input type="number" min="1" max="114" value={editForm.surahNumber ?? ""} onChange={e => setEditForm(f => ({ ...f, surahNumber: e.target.value ? parseInt(e.target.value, 10) : null }))} style={{ width: 42, background: "transparent", border: "1px solid rgba(255,255,255,.15)", borderRadius: 4, color: "var(--text)", padding: "2px 4px" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 2 }}>Ayah #</div>
                      <input type="number" min="1" value={editForm.ayahNumber ?? ""} onChange={e => setEditForm(f => ({ ...f, ayahNumber: e.target.value ? parseInt(e.target.value, 10) : null }))} style={{ width: 42, background: "transparent", border: "1px solid rgba(255,255,255,.15)", borderRadius: 4, color: "var(--text)", padding: "2px 4px" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 2 }}>Word #</div>
                      <input type="number" min="1" value={editForm.wordPosition ?? ""} onChange={e => setEditForm(f => ({ ...f, wordPosition: e.target.value ? parseInt(e.target.value, 10) : null }))} title="Word position within the ayah" style={{ width: 42, background: "transparent", border: "1px solid rgba(255,255,255,.15)", borderRadius: 4, color: "var(--text)", padding: "2px 4px" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 110 }}>
                      <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 2 }}>Displayed Reference Text</div>
                      <input value={editForm.ayahRef || ""} onChange={e => setEditForm(f => ({ ...f, ayahRef: e.target.value }))} placeholder="e.g. Surah Al-Baqarah 2:144" title="The text shown to learners — this does NOT auto-update from Surah#/Ayah# above, update both together" style={{ width: "100%", background: "transparent", border: "1px solid rgba(255,255,255,.15)", borderRadius: 4, color: "var(--text)", padding: "2px 4px", fontSize: 11 }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 2 }}>Partial Ayah Text (optional)</div>
                      <input value={editForm.partialAyahText || ""} onChange={e => setEditForm(f => ({ ...f, partialAyahText: e.target.value }))} placeholder="Paste from Quran.com — plays word 1 through here" dir="rtl" style={{ width: "100%", background: "transparent", border: "1px solid rgba(255,255,255,.15)", borderRadius: 4, color: "var(--text)", padding: "2px 4px", fontSize: 12, fontFamily: "serif" }} />
                    </div>
                  </td>
                  <td>
                    {editForm.surahNumber && editForm.ayahNumber
                      ? <AyahImageUploadButton surahNumber={editForm.surahNumber} ayahNumber={editForm.ayahNumber} />
                      : <span style={{ fontSize: 10, color: "var(--muted)" }}>Set Surah/Ayah first</span>}
                  </td>
                  <td style={{ display: "flex", gap: 4 }}>
                    <button className="btn bg bsm" onClick={saveEdit} disabled={saving}>{saving ? "…" : "✓"}</button>
                    <button className="btn bh bsm" onClick={cancelEdit} disabled={saving}>✕</button>
                  </td>
                </tr>
              );
            }
            return (
              <tr key={w.dbId || i}>
                <td><span className="arabic" style={{ fontSize: 20 }}>{w.arabic}</span></td>
                <td style={{ color: "var(--muted)", fontStyle: "italic" }}>{w.translit}</td>
                <td>{w.english}</td>
                <td><span style={{ fontFamily: "'Noto Nastaliq Urdu',serif", fontSize: 14, color: "var(--teal2)", direction: "rtl" }}>{w.urdu || "—"}</span></td>
                <td style={{ fontSize: 12, color: "var(--muted)" }}>
                  {w.surahNumber && w.ayahNumber ? `${w.surahNumber}:${w.ayahNumber}${w.wordPosition ? ` (w${w.wordPosition})` : ""}` : "—"}
                  {w.ayahRef && <div style={{ fontSize: 10, color: "var(--gold2)", marginTop: 2 }}>"{w.ayahRef}"</div>}
                </td>
                <td>
                  {w.surahNumber && w.ayahNumber
                    ? <AyahImageUploadButton surahNumber={w.surahNumber} ayahNumber={w.ayahNumber} />
                    : <span style={{ fontSize: 10, color: "var(--muted)" }}>—</span>}
                </td>
                <td style={{ display: "flex", gap: 4 }}>
                  <button className="btn bh bsm" style={{ fontSize: 10 }} onClick={() => openEdit(w, i)}>✏</button>
                  {w.isCustom ? <button className="del" onClick={() => remove(w)}>✕</button> : <span style={{ fontSize: 10, color: "var(--muted)" }}>built-in</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Bulk Word Upload — CSV file or paste ────────────────────────────────────
function BulkUploadPanel({ onBulkAddWords, allWords, toast_ }) {
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState(null); // { headerError, words } | null
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null); // { count } | null
  const fileInputRef = React.useRef(null);

  // Set of existing Arabic words, for duplicate detection against a
  // re-uploaded "existing words + newly appended" file.
  const existingArabicSet = React.useMemo(
    () => new Set(allWords.map(w => normalizeArabic(w.arabic))),
    [allWords]
  );

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setRawText(e.target.result);
      setParsed(parseWordsCSV(e.target.result, existingArabicSet));
      setResult(null);
    };
    reader.readAsText(file);
  };

  const handlePasteChange = (text) => {
    setRawText(text);
    setResult(null);
    if (text.trim()) setParsed(parseWordsCSV(text, existingArabicSet));
    else setParsed(null);
  };

  // Escapes a CSV field: wraps in quotes and doubles any embedded quotes,
  // needed since Arabic/Urdu text or notes could contain commas.
  const csvField = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  // "\uFEFF" is a UTF-8 byte-order-mark — without it, Excel (especially on
  // Windows) guesses the wrong character encoding when opening a CSV and
  // garbles any Arabic/Urdu text into junk characters. Prepending this one
  // invisible character tells Excel explicitly "this file is UTF-8."
  const UTF8_BOM = "\uFEFF";

  // Exports every current word (built-in + custom) so Admin can review
  // what's already there and simply append new rows below before
  // re-uploading — the upload step itself skips anything matching an
  // existing Arabic word, so re-uploading the existing rows is harmless.
  const downloadExistingWords = () => {
    const header = "Arabic,Transliteration,English Meaning,Urdu Meaning,Ayah Reference,Surah Number,Ayah Number,Word Position,Partial Ayah Text";
    const lines = allWords.map(w => [
      csvField(w.arabic), csvField(w.translit), csvField(w.english), csvField(w.urdu),
      csvField(w.ayahRef),
      csvField(w.surahNumber ?? ""), csvField(w.ayahNumber ?? ""), csvField(w.wordPosition ?? ""),
      csvField(w.partialAyahText ?? ""),
    ].join(","));
    const csv = UTF8_BOM + [header, ...lines].join("\n") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "quranvocab_words.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadBlankTemplate = () => {
    const csv = UTF8_BOM + 'Arabic,Transliteration,English Meaning,Urdu Meaning,Ayah Reference,Surah Number,Ayah Number,Word Position,Partial Ayah Text\n'
      + '"مَسْجِدٌ",Masjid,Mosque,مسجد,"Surah Al-Baqarah 2:144",2,144,13,\n';
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "word_upload_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const validWords = parsed?.words.filter(w => w.errors.length === 0 && !w.isDuplicate) || [];
  const invalidWords = parsed?.words.filter(w => w.errors.length > 0) || [];
  const duplicateWords = parsed?.words.filter(w => w.errors.length === 0 && w.isDuplicate) || [];

  const doUpload = async () => {
    if (validWords.length === 0) return;
    setUploading(true);
    const res = await onBulkAddWords(validWords);
    setUploading(false);
    if (res.ok) {
      setResult({ count: res.count });
      setRawText(""); setParsed(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast_(`✅ ${res.count} word${res.count === 1 ? "" : "s"} uploaded!`);
    } else {
      toast_("⚠ Upload failed — please try again.");
    }
  };

  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <div className="lbl" style={{ marginBottom: 4 }}>Bulk Upload Words</div>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
        Upload a CSV file, or paste CSV content directly. Arabic and English Meaning are required for every row — everything else is optional.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="copy-btn" onClick={downloadExistingWords}>⬇ Download Existing Words ({allWords.length})</button>
        <button className="copy-btn" onClick={downloadBlankTemplate}>⬇ Blank Template</button>
      </div>
      <p style={{ fontSize: 11, color: "var(--muted)", marginTop: -10, marginBottom: 16, lineHeight: 1.6 }}>
        Tip: download existing words, append your new ones below the last row, then upload the whole file — rows matching an existing word are automatically skipped, so nothing gets duplicated.
      </p>

      <div className="field">
        <label>Upload CSV File</label>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={e => handleFile(e.target.files[0])} />
      </div>

      <div className="field">
        <label>...or Paste CSV Content</label>
        <textarea
          value={rawText}
          onChange={e => handlePasteChange(e.target.value)}
          placeholder="Arabic,Transliteration,English Meaning,...&#10;مَسْجِدٌ,Masjid,Mosque,..."
          rows={6}
          style={{ width: "100%", fontFamily: "monospace", fontSize: 12.5, background: "rgba(0,200,230,.04)", border: "1px solid rgba(0,200,230,.15)", borderRadius: 8, color: "var(--text)", padding: 10 }}
        />
      </div>

      {parsed?.headerError && <div className="enroll-error">⚠ {parsed.headerError}</div>}

      {parsed && !parsed.headerError && (
        <>
          <div style={{ display: "flex", gap: 16, margin: "14px 0", fontSize: 13, flexWrap: "wrap" }}>
            <span style={{ color: "var(--ok)" }}>✓ {validWords.length} ready to upload</span>
            {duplicateWords.length > 0 && <span style={{ color: "var(--gold3)" }}>⏭ {duplicateWords.length} already exist (skipped)</span>}
            {invalidWords.length > 0 && <span style={{ color: "var(--err)" }}>⚠ {invalidWords.length} skipped (errors)</span>}
          </div>

          {parsed.words.length > 0 && (
            <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid rgba(0,200,230,.12)", borderRadius: 8, marginBottom: 16 }}>
              <table className="tbl" style={{ margin: 0 }}>
                <thead><tr><th>Row</th><th>Arabic</th><th>English</th><th>Status</th></tr></thead>
                <tbody>
                  {parsed.words.map(w => (
                    <tr key={w.rowNum}>
                      <td style={{ color: "var(--muted)" }}>{w.rowNum}</td>
                      <td style={{ fontFamily: "'Scheherazade New','Amiri',serif", fontSize: 16, direction: "rtl" }}>{w.arabic || "—"}</td>
                      <td>{w.english || "—"}</td>
                      <td>{w.errors.length > 0
                        ? <span style={{ color: "var(--err)", fontSize: 11.5 }}>{w.errors.join(", ")}</span>
                        : w.isDuplicate
                          ? <span style={{ color: "var(--gold3)", fontSize: 11.5 }}>⏭ Already exists</span>
                          : <span style={{ color: "var(--ok)" }}>✓ OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button className="btn bg" onClick={doUpload} disabled={validWords.length === 0 || uploading}>
            {uploading ? "Uploading…" : `Upload ${validWords.length} Word${validWords.length === 1 ? "" : "s"}`}
          </button>
        </>
      )}

      {result && (
        <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 7, background: "rgba(74,158,92,.08)", border: "1px solid rgba(74,158,92,.25)" }}>
          <div style={{ fontSize: 13, color: "var(--ok)" }}>✅ {result.count} word{result.count === 1 ? "" : "s"} added successfully.</div>
        </div>
      )}

      <BulkAyahImageUploader toast_={toast_} />
    </div>
  );
}

// ─── Bulk ayah-image uploader — sits under the CSV panel. Filenames encode
// the target: "2_255.jpg" → Surah 2, Ayah 255. Any image format; each is
// canvas-normalized to PNG by uploadAyahImage. ────────────────────────────────
function BulkAyahImageUploader({ toast_ }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null); // { ok: [], failed: [] } | null
  const inputRef = React.useRef(null);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setBusy(true);
    const ok = [], failed = [];
    for (const file of files) {
      // Accept "2_255.png", "002_255.jpg", "2-255.webp" etc.
      const m = file.name.match(/^(\d{1,3})[_-](\d{1,3})\./);
      if (!m) { failed.push(`${file.name} — name must be Surah_Ayah (e.g. 2_255.jpg)`); continue; }
      const surah = parseInt(m[1], 10), ayah = parseInt(m[2], 10);
      if (surah < 1 || surah > 114 || ayah < 1) { failed.push(`${file.name} — invalid surah/ayah number`); continue; }
      const result = await uploadAyahImage(file, surah, ayah);
      if (result?.ok) ok.push(`${surah}:${ayah}`);
      else failed.push(`${file.name} — upload failed`);
    }
    setBusy(false);
    setReport({ ok, failed });
    if (ok.length > 0) toast_(`${ok.length} ayah image${ok.length === 1 ? "" : "s"} uploaded.`);
    e.target.value = "";
  };

  return (
    <div style={{ marginTop: 26, paddingTop: 20, borderTop: "1px solid rgba(0,200,230,.15)" }}>
      <div className="lbl" style={{ marginBottom: 8 }}>Bulk Ayah Images</div>
      <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7, marginBottom: 12 }}>
        Upload multiple ayah images at once. Name each file <strong style={{ color: "var(--gold3)" }}>Surah_Ayah</strong> (e.g. <code style={{ color: "var(--cyan2)" }}>2_255.jpg</code> for Ayat al-Kursi). Each image is shared automatically by every word referencing that ayah. Re-uploading the same name replaces the previous image.
      </p>
      <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleFiles} />
      <button className="btn bh" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? "Uploading…" : "🖼 Select Images"}
      </button>
      {report && (
        <div style={{ marginTop: 12, fontSize: 12.5 }}>
          {report.ok.length > 0 && <div style={{ color: "var(--ok)", marginBottom: 4 }}>✅ Uploaded: {report.ok.join(", ")}</div>}
          {report.failed.length > 0 && report.failed.map((f, i) => <div key={i} style={{ color: "var(--err)" }}>⚠ {f}</div>)}
        </div>
      )}
    </div>
  );
}

// ─── Rewards Tab — Certificate for 100+ mastered words ───────────────────────
function RewardsTab({ participants, toast_, allWords }) {
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState({});

  // Find eligible users — those with scores (mastery computed from scores)
  const eligible = participants.filter(p => (p.scores || []).length > 0);

  const getMastered = (p) => {
    const masteredSet = getMasteredWords(p.scores || [], allWords);
    return masteredSet.size;
  };

  const sendCertificate = async (p) => {
    setSending(true);
    const masteredCount = getMastered(p);
    const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    const certHtml = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0d1f2d;border-radius:12px;overflow:hidden;border:1px solid rgba(255,210,80,.3);">
      <div style="background:linear-gradient(135deg,#071c2a,#1a2d1a);padding:28px 24px;text-align:center;border-bottom:1px solid rgba(255,210,80,.2);">
        <div style="font-size:40px;margin-bottom:8px">🏆</div>
        <div style="font-size:13px;color:rgba(255,210,80,.7);letter-spacing:.15em;text-transform:uppercase;margin-bottom:4px">Certificate of Achievement</div>
        <div style="font-size:22px;font-weight:700;color:#f0f8ff">Quranic Vocab</div>
        <div style="font-size:12px;color:rgba(122,184,212,.6);margin-top:4px">Awami Baitulmaal Committee (Reg.)</div>
      </div>
      <div style="padding:32px 24px;text-align:center;background:#0d1f2d;">
        <p style="color:#7ab8d4;font-size:14px;margin:0 0 6px">This is to certify that</p>
        <h2 style="color:#ffd96b;font-size:26px;margin:0 0 6px;font-weight:700">${escapeHtml(p.name)}</h2>
        <p style="color:#7ab8d4;font-size:14px;margin:0 0 20px">has successfully mastered</p>
        <div style="background:rgba(255,210,80,.08);border:1px solid rgba(255,210,80,.25);border-radius:10px;padding:18px;display:inline-block;margin-bottom:20px;">
          <div style="font-size:48px;font-weight:300;color:#ffd96b;line-height:1">${masteredCount}</div>
          <div style="font-size:13px;color:rgba(255,210,80,.7);margin-top:4px">Quranic Vocabulary Words</div>
        </div>
        <p style="font-family:serif;font-size:22px;color:#ffd96b;margin:0 0 8px">مَاشَاءَ اللَّه</p>
        <p style="color:#7ab8d4;font-size:13px;margin:0 0 20px;line-height:1.6">May Allah grant you continued growth in understanding His Noble Book.</p>
        <p style="color:rgba(122,184,212,.5);font-size:12px;margin:0">Awarded on ${date}</p>
      </div>
      <div style="padding:12px 24px;background:#071c2a;text-align:center;border-top:1px solid rgba(255,210,80,.1)">
        <p style="margin:0;font-size:11px;color:rgba(122,184,212,.4)">Awami Baitulmaal Committee (Reg.) · support@awamibaitulmaal.org.in</p>
      </div>
    </div>`;

    try {
      const emailjs = await loadEmailJS();
      await emailjs.send(EMAILJS_RECEIPT_SERVICE_ID, EMAILJS_RECEIPT_TEMPLATE_ID, {
        to_email: p.email,
        recipient_name: p.name,
        from_email: "admin@awamibaitulmaal.org.in", // must match the admin@ Titan SMTP auth user on EMAILJS_RECEIPT_SERVICE_ID (see deploy notes)
        reply_to: "admin@awamibaitulmaal.org.in",
        email_heading: `🏆 Certificate of Achievement — Quranic Vocab`,
        email_body_html: certHtml,
      });
      setSent(prev => ({ ...prev, [p.userId]: true }));
      toast_(`✅ Certificate sent to ${p.name}!`);
    } catch (err) {
      toast_("⚠ Failed to send certificate — check EmailJS connection.");
    }
    setSending(false);
  };

  return (
    <div className="card">
      <div className="lbl" style={{ marginBottom: 8 }}>🏆 Mastery Certificates</div>
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
        Send a personalised certificate to learners who have mastered <strong style={{ color: "var(--gold2)" }}>{CERTIFICATE_MASTERY_THRESHOLD}+</strong> words. Each certificate is emailed directly to the learner.
      </p>
      {eligible.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>No participants with quiz history yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {eligible.map(p => {
            const mastered = getMastered(p);
            const isEligible = mastered >= CERTIFICATE_MASTERY_THRESHOLD;
            const alreadySent = sent[p.userId];
            return (
              <div key={p.userId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "rgba(255,255,255,.03)", borderRadius: 8, border: `1px solid ${isEligible ? "rgba(255,210,80,.2)" : "rgba(255,255,255,.06)"}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, color: "var(--text)" }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{p.userId} · {mastered} words mastered</div>
                </div>
                {isEligible ? (
                  <button className="btn bg bsm" disabled={sending || alreadySent}
                    onClick={() => sendCertificate(p)}>
                    {alreadySent ? "✅ Sent" : sending ? "Sending…" : "🏆 Send Certificate"}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{mastered}/100 words</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminPage({ allWords, onAddWord, onBulkAddWords, onEditWord, onDeleteWord, participants, toast_, onSendResetLink, messages, onMarkRead, onMarkResolved, onUpdateParticipant, onDeleteParticipant, onResendVerification, onResetAllTestData, onClearAllReceipts, passwordChangeRequests, onApprovePasswordChange, onRejectPasswordChange }) {
  const [resetTarget, setResetTarget] = useState(null); // userId being reset, or null
  const [resetMessageId, setResetMessageId] = useState(null); // linked message, if reset was triggered from Messages tab
  const [resetSending, setResetSending] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // userId being edited, or null
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState("");
  const [editChecking, setEditChecking] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);
  const [tab, setTab] = useState("words");
  const [arabic, setArabic] = useState(""), [translit, setTranslit] = useState(""), [english, setEnglish] = useState("");
  const [urdu, setUrdu] = useState("");
  const [ayahRef, setAyahRef] = useState("");
  const [surahNumber, setSurahNumber] = useState(""), [ayahNumber, setAyahNumber] = useState("");
  const [wordPosition, setWordPosition] = useState("");
  const [adding, setAdding] = useState(false);

  const submitReset = async () => {
    setResetError("");
    setResetSending(true);
    const result = await onSendResetLink(resetTarget, resetMessageId);
    setResetSending(false);
    if (result.ok) {
      setResetSent(true);
      toast_(`Reset code emailed to ${resetTarget}.`);
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
    setEditError("");
  };
  const closeEdit = () => { setEditTarget(null); setEditError(""); };

  const submitEdit = async () => {
    setEditError("");
    if (!editName.trim()) { setEditError("Name is required."); return; }
    setEditChecking(true);
    const result = await onUpdateParticipant(editTarget, editName);
    setEditChecking(false);
    if (result.ok) {
      toast_(`Account updated for ${editTarget}.`);
      closeEdit();
    } else if (result.reason === "db-update-failed") {
      setEditError("The save didn't reach the database — if this persists, the users_admin_update policy may be missing (see fix_users_admin_update.sql).");
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

  const add = async () => {
    if (!arabic || !english) { toast_("Arabic and English required"); return; }
    setAdding(true);
    const ok = await onAddWord({
      arabic: arabic.trim(), translit: translit.trim(), english: english.trim(),
      urdu: urdu.trim() || "—",
      ayahRef: ayahRef.trim() || "",
      surahNumber: surahNumber ? parseInt(surahNumber, 10) || null : null,
      ayahNumber: ayahNumber ? parseInt(ayahNumber, 10) || null : null,
      wordPosition: wordPosition ? parseInt(wordPosition, 10) || null : null,
    });
    setAdding(false);
    if (ok) {
      setArabic(""); setTranslit(""); setEnglish(""); setUrdu(""); setAyahRef(""); setSurahNumber(""); setAyahNumber(""); setWordPosition("");
      toast_("Word added!");
    } else {
      toast_("⚠ Couldn't add the word — please try again.");
    }
  };

  return (
    <div className="page">
      <div className="lbl" style={{ marginBottom: 16 }}>Administration</div>
      <div className="tabs">
        <button className={`tab ${tab === "words" ? "on" : ""}`} onClick={() => setTab("words")}>All Words ({allWords.length})</button>
        <button className={`tab ${tab === "add" ? "on" : ""}`} onClick={() => setTab("add")}>Add Word</button>
        <button className={`tab ${tab === "bulk" ? "on" : ""}`} onClick={() => setTab("bulk")}>Bulk Upload</button>
        <button className={`tab ${tab === "parts" ? "on" : ""}`} onClick={() => setTab("parts")}>Participants ({participants.length})</button>
        <button className={`tab ${tab === "rewards" ? "on" : ""}`} onClick={() => setTab("rewards")}>🏆 Rewards</button>
        <button className={`tab ${tab === "settings" ? "on" : ""}`} onClick={() => setTab("settings")}>⚙ Settings</button>
      </div>
      {tab === "words" && (
        <div className="card">
          <WordsTable allWords={allWords} onEditWord={onEditWord} onDeleteWord={onDeleteWord} />
        </div>
      )}
      {tab === "add" && (
        <div className="card" style={{ maxWidth: 480 }}>
          <div className="field"><label>Arabic Word *</label><input value={arabic} onChange={e => setArabic(e.target.value)} placeholder="e.g. مَسْجِدٌ" style={{ direction: "rtl", fontSize: 22, fontFamily: "'Scheherazade New','Amiri',serif" }} /></div>
          <div className="field"><label>Transliteration</label><input value={translit} onChange={e => setTranslit(e.target.value)} placeholder="e.g. Masjid" /></div>
          <div className="field"><label>English Meaning *</label><input value={english} onChange={e => setEnglish(e.target.value)} placeholder="e.g. Mosque" /></div>
          <div className="field"><label>Urdu Meaning</label><input value={urdu} onChange={e => setUrdu(e.target.value)} placeholder="e.g. مسجد" style={{ direction: "rtl", fontFamily: "'Noto Nastaliq Urdu',serif", fontSize: 15 }} /></div>
          <div className="field"><label>Qur'an Reference (optional)</label><input value={ayahRef} onChange={e => setAyahRef(e.target.value)} placeholder="e.g. Surah Al-Baqarah 2:144" /></div>
          <div style={{ display: "flex", gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Surah # (for audio/image)</label><input type="number" min="1" max="114" value={surahNumber} onChange={e => setSurahNumber(e.target.value)} placeholder="e.g. 2" /></div>
            <div className="field" style={{ flex: 1 }}><label>Ayah #</label><input type="number" min="1" value={ayahNumber} onChange={e => setAyahNumber(e.target.value)} placeholder="e.g. 144" /></div>
            <div className="field" style={{ flex: 1 }}><label>Word # in Ayah</label><input type="number" min="1" value={wordPosition} onChange={e => setWordPosition(e.target.value)} placeholder="e.g. 3" /></div>
          </div>
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: -4, marginBottom: 11 }}>Word # is this word's position (1st, 2nd, 3rd…) within the ayah text — needed for the single-word pronunciation button. Leave blank if unsure; the ayah-level audio and image will still work with just Surah/Ayah #.</p>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Ayah Image (optional)</label>
            {surahNumber && ayahNumber
              ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <AyahImageUploadButton surahNumber={parseInt(surahNumber, 10)} ayahNumber={parseInt(ayahNumber, 10)} />
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>Uploads for {surahNumber}:{ayahNumber} — shared by every word referencing this ayah</span>
                </div>
              : <span style={{ fontSize: 11, color: "var(--muted)" }}>Enter Surah # and Ayah # above first to enable image upload.</span>}
          </div>
          <button className="btn bg" onClick={add} disabled={adding}>{adding ? "Adding…" : "Add Word"}</button>
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 11 }}>Custom words unlock day-by-day after the built-in words.</p>
        </div>
      )}
      {tab === "bulk" && <BulkUploadPanel onBulkAddWords={onBulkAddWords} allWords={allWords} toast_={toast_} />}
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
                  <td style={{ color: "var(--gold2)" }}>{getUnlockedDays(p.enrolledAt, p.dayProgress, Math.ceil(allWords.length / WORDS_PER_DAY))}</td>
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
      {tab === "rewards" && (
        <RewardsTab participants={participants} toast_={toast_} allWords={allWords} />
      )}
      {tab === "settings" && <ResetTestDataPanel onResetAllTestData={onResetAllTestData} />}
      {tab === "settings" && <ClearReceiptsPanel onClearAllReceipts={onClearAllReceipts} />}
      {/* Finance password change requests moved to the top-level 🔔 notification center */}

      {resetTarget && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeReset(); }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-head">
              <h3>Send Reset Code — {resetTarget}</h3>
              <button className="modal-close" onClick={closeReset}>✕</button>
            </div>
            <div className="modal-body">
              {!resetSent ? (
                <>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
                    This emails a 6-digit code to <strong style={{ color: "var(--gold3)" }}>{resetTarget}</strong>'s registered email address. The code lets them set a new password themselves — no password is sent or typed by you. The code expires in 1 hour.
                  </p>
                  {resetError && <div className="enroll-error">⚠ {resetError}</div>}
                  <button className="btn bg bfw" onClick={submitReset} disabled={resetSending}>
                    {resetSending ? "Sending…" : "Send Reset Code →"}
                  </button>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "10px 0" }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
                  <p style={{ fontSize: 14, color: "var(--text)", marginBottom: 6 }}>Reset code sent!</p>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>{resetTarget} will receive an email with a 6-digit code (expires in 1 hour).</p>
                  <div style={{ textAlign: "left", background: "rgba(0,200,230,.06)", border: "1px solid rgba(0,200,230,.2)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: "var(--cyan2)", fontWeight: 600, marginBottom: 6, letterSpacing: ".03em" }}>TELL THEM TO:</div>
                    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--muted)", lineHeight: 1.8 }}>
                      <li>Go to the Login screen</li>
                      <li>Tap "Forgot Password?"</li>
                      <li>Enter their User ID + email</li>
                      <li>Enter the 6-digit code from the email + set a new password</li>
                    </ol>
                  </div>
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
                Use this to correct a learner's name. Email can't be changed here — a wrong email needs to be corrected by the learner themselves via Profile → Change Email (or ask them to, if you're doing this on their behalf), so it stays verified and in sync with their actual login.
              </p>
              <div className="field"><label>Full Name</label><input value={editName} onChange={e => { setEditName(e.target.value); setEditError(""); }} placeholder="Learner's name" /></div>
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
        Permanently erases <strong style={{ color: "var(--text)" }}>every participant, score, and day progress</strong> created so far. Use this once, right before going live, to start with a clean slate. Words (built-in and custom, however added) are never touched — Admin/Finance accounts and passwords are untouched too. Donation receipts are handled separately below.
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

// ─── Clear All Receipts (one-time, pre-launch only) ───────────────────────────
// Deliberately separate from Reset All Test Data above: receipts are real
// financial/bookkeeping records, not disposable QA data, so this gets its
// own explicit, clearly-labeled, equally-guarded action — never bundled into
// routine test-data cleanup where it could be erased by accident.
function ClearReceiptsPanel({ onClearAllReceipts }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [clearing, setClearing] = useState(false);
  const CONFIRM_PHRASE = "DELETE RECEIPTS";

  const close = () => { setOpen(false); setConfirmText(""); };
  const confirm = async () => {
    setClearing(true);
    const ok = await onClearAllReceipts();
    setClearing(false);
    if (ok) close();
  };

  return (
    <div className="card" style={{ maxWidth: 440, marginTop: 16, borderColor: "rgba(192,80,74,.3)" }}>
      <div className="lbl" style={{ color: "var(--err)" }}>⚠ Danger Zone — Receipts</div>
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14, lineHeight: 1.6 }}>
        Permanently erases <strong style={{ color: "var(--text)" }}>every donation receipt</strong> issued so far. Use this once, right before going live, to start real receipt numbering fresh at 001. This does not affect participants, scores, or words.
      </p>
      {!open ? (
        <button className="btn" style={{ background: "var(--err)", color: "#fff" }} onClick={() => setOpen(true)}>
          🧾 Clear All Receipts
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
              disabled={confirmText !== CONFIRM_PHRASE || clearing}
              onClick={confirm}
            >
              {clearing ? "Clearing…" : "Permanently Delete All Receipts"}
            </button>
            <button className="btn bh" onClick={close} disabled={clearing}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Finance Password Change Requests — Admin approval queue ────────────────
// Approving doesn't set a password (see the note above
// approvePasswordChangeRequest() in the main app) — it just emails Finance
// a reset code, same as the learner Forgot Password flow. Admin never sees
// or chooses the actual new password.
// ─── Admin Notification Center — dropdown from the 🔔 badge in the nav ──────
// Consolidates everything Admin needs to act on or be aware of, in one place
// reachable from anywhere in the Admin panel, instead of buried in a
// specific tab. Replaces the old localStorage-only "messages" badge, which
// nothing had actually written to since the Supabase migration — it was
// dead weight, always showing zero.
function AdminNotificationCenter({ passwordChangeRequests, receiptRequests, onApprovePasswordChange, onRejectPasswordChange, onClose, toast_ }) {
  const [busyId, setBusyId] = useState(null);
  const pendingPasswordReqs = passwordChangeRequests.filter(r => r.status === "pending");
  const pendingReceiptReqs = receiptRequests.filter(r => r.status === "pending");

  const approve = async (req) => {
    setBusyId(req.id);
    const ok = await onApprovePasswordChange(req.id, req.requesterEmail);
    setBusyId(null);
    toast_(ok ? `Approved — reset code emailed to ${req.requesterEmail}.` : "Couldn't approve — check the Titan/Supabase email connection and try again.");
  };
  const reject = async (req) => {
    setBusyId(req.id);
    const ok = await onRejectPasswordChange(req.id);
    setBusyId(null);
    toast_(ok ? "Request declined." : "Couldn't decline — try again.");
  };

  return (
    <div className="nuser-menu" style={{ minWidth: 340, maxWidth: 380, maxHeight: 480, overflowY: "auto" }} onMouseLeave={onClose}>
      <div className="nuser-menu-email" style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>🔔 Notifications</div>

      {pendingPasswordReqs.length > 0 && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(0,200,230,.1)" }}>
          <div style={{ fontSize: 12, color: "var(--cyan2)", fontWeight: 600, marginBottom: 8 }}>🔑 Finance Password Requests ({pendingPasswordReqs.length})</div>
          {pendingPasswordReqs.map(req => (
            <div key={req.id} style={{ padding: "8px 10px", marginBottom: 6, borderRadius: 7, background: "rgba(0,200,230,.04)", border: "1px solid rgba(0,200,230,.12)" }}>
              <div style={{ fontSize: 12.5, color: "var(--text)" }}>{req.requesterEmail}</div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>
                {new Date(req.requestedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button className="copy-btn" style={{ color: "var(--ok)", borderColor: "rgba(74,158,92,.35)", fontSize: 11 }} disabled={busyId === req.id} onClick={() => approve(req)}>
                  {busyId === req.id ? "…" : "Approve"}
                </button>
                <button className="copy-btn" style={{ color: "var(--err)", borderColor: "rgba(220,90,90,.35)", fontSize: 11 }} disabled={busyId === req.id} onClick={() => reject(req)}>
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingReceiptReqs.length > 0 && (
        <div style={{ padding: "10px 14px" }}>
          <div style={{ fontSize: 12, color: "var(--gold3)", fontWeight: 600, marginBottom: 8 }}>🧾 Receipt Requests ({pendingReceiptReqs.length})</div>
          {pendingReceiptReqs.map(req => (
            <div key={req.id} style={{ padding: "8px 10px", marginBottom: 6, borderRadius: 7, background: "rgba(255,217,107,.05)", border: "1px solid rgba(255,217,107,.15)" }}>
              <div style={{ fontSize: 12.5, color: "var(--text)" }}>{req.donorName}</div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>
                {req.amount ? `₹${Number(req.amount).toLocaleString("en-IN")}` : "Amount not given"}
                {req.utrReference ? ` · UTR: ${req.utrReference}` : ""}
              </div>
            </div>
          ))}
          <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>Issue these from the Finance Panel.</p>
        </div>
      )}

      {pendingPasswordReqs.length === 0 && pendingReceiptReqs.length === 0 && (
        <div style={{ padding: "16px 14px", textAlign: "center", color: "var(--muted)", fontSize: 12.5 }}>You're all caught up.</div>
      )}
    </div>
  );
}

// ─── Donate Modal ─────────────────────────────────────────────────────────────
function DonateModal({ onClose, toast_, user, onRequestReceipt }) {
  const [frequency, setFrequency] = useState("once"); // once | monthly | yearly

  const copy = (text, label) => {
    navigator.clipboard.writeText(text).then(() => toast_(`${label} copied!`)).catch(() => toast_("Copy manually from screen"));
  };

  // Donations aren't wired up until the real UPI ID replaces the placeholder
  // — this automatically shows a clean "opening soon" message instead of
  // fake payment details, and switches back to the real payment UI the
  // moment DONATE.upiId is filled in for real. No flag to remember to flip.
  const donationsConfigured = DONATE.upiId && DONATE.upiId !== "yourcharity@upi";
  const displayCharityName = DONATE.charityName && DONATE.charityName !== "Your Charity Name Here"
    ? DONATE.charityName
    : "Awami Baitulmaal Committee (Reg.)";

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
            Your donation supports <strong style={{ color: "var(--gold2)" }}>{displayCharityName}</strong> — enabling free Quranic learning for all.
          </div>

          {!donationsConfigured ? (
            <div style={{ textAlign: "center", padding: "28px 16px" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🚧</div>
              <p style={{ fontSize: 15, color: "var(--text)", fontWeight: 600, marginBottom: 8 }}>Donations are opening soon</p>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, maxWidth: 360, margin: "0 auto" }}>
                We're finishing setup so every donation gets a proper receipt. Check back shortly — thank you for your patience!
              </p>
            </div>
          ) : (
          <>
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

          {onRequestReceipt && (
            <div className="bank-login-prompt" style={{ marginTop: 8 }}>
              Already donated? <span style={{ color: "var(--cyan)", cursor: "pointer", textDecoration: "underline" }} onClick={onRequestReceipt}>Request your receipt</span>
            </div>
          )}

          <p style={{ fontSize: 10.5, color: "var(--muted)", textAlign: "center", marginTop: 12, lineHeight: 1.6, opacity: .75 }}>
            🔒 Your name, email, and payment reference are used only to verify your donation and issue your receipt — never shared or used for anything else.
          </p>
          </>
          )}

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

// ── Invite a Friend modal ───────────────────────────────────────────────────
function InviteModal({ onClose, toast_, user }) {
  const [friendName, setFriendName] = useState("");
  const [friendEmail, setFriendEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleOverlay = (e) => { if (e.target === e.currentTarget) onClose(); };

  const submit = async () => {
    setError("");
    const emailTrim = friendEmail.trim();
    if (!friendName.trim()) { setError("Please enter your friend's name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) { setError("Please enter a valid email address."); return; }
    setSending(true);
    try {
      await sendInviteEmail({ toEmail: emailTrim, friendName: friendName.trim(), inviterName: user?.name || "A fellow learner" });
      setSent(true);
    } catch (err) {
      console.error("sendInviteEmail error:", err);
      setError("Couldn't send the invite right now — please try again in a moment.");
    }
    setSending(false);
  };

  return (
    <div className="modal-overlay" onClick={handleOverlay}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-head">
          <h3>💌 Invite a Friend</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {!sent ? (
            <>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
                Share the blessing of learning Qur'anic vocabulary — invite someone to join you on this journey.
              </p>
              <div className="field"><label>Friend's Name</label><input value={friendName} onChange={e => setFriendName(e.target.value)} placeholder="e.g. Ahmed" /></div>
              <div className="field"><label>Friend's Email</label><input type="email" value={friendEmail} onChange={e => setFriendEmail(e.target.value)} placeholder="friend@example.com" /></div>
              {error && <div className="enroll-error">⚠ {error}</div>}
              <button className="btn bg bfw" onClick={submit} disabled={sending} style={{ marginTop: 8 }}>
                {sending ? "Sending…" : "Send Invite →"}
              </button>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🤲</div>
              <p style={{ fontSize: 14, color: "var(--text)", marginBottom: 6 }}>Invite sent to <strong style={{ color: "var(--gold2)" }}>{friendName}</strong>!</p>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>May Allah reward you for sharing knowledge.</p>
              <button className="btn bh" style={{ marginTop: 16 }} onClick={onClose}>Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Request a Receipt modal — self-service, donor-initiated ──────────────────
// Does NOT issue anything automatically. Logs the donor's claim into the
// receipt_requests queue for Finance to verify against funds actually
// received, then issue normally (see the note above insertReceiptRow()).
function RequestReceiptModal({ onClose, toast_, user, onSubmit }) {
  const [donorName, setDonorName] = useState(user?.name || "");
  const [donorEmail, setDonorEmail] = useState(user?.email || "");
  const [amount, setAmount] = useState("");
  const [donationDate, setDonationDate] = useState("");
  const [upiId, setUpiId] = useState("");
  const [utrReference, setUtrReference] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleOverlay = (e) => { if (e.target === e.currentTarget) onClose(); };

  const submit = async () => {
    setError("");
    if (!donorName.trim()) { setError("Please enter your name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail.trim())) { setError("Please enter a valid email address."); return; }
    if (donationDate && donationDate > new Date().toISOString().slice(0, 10)) { setError("Date paid can't be in the future."); return; }
    if (!upiId.trim()) { setError("UPI ID is required — check your UPI app's transaction history."); return; }
    if (!/^[a-zA-Z0-9]+$/.test(upiId.trim())) { setError("UPI ID should only contain letters and numbers."); return; }
    if (!/^[0-9]{12}$/.test(utrReference.trim())) { setError("UTR must be exactly 12 digits — check your UPI app's transaction history."); return; }
    setSending(true);
    const ok = await onSubmit({
      donorName: donorName.trim(), donorEmail: donorEmail.trim(),
      amount: amount ? Number(amount) : null, donationDate: donationDate || null,
      note: note.trim(), utrReference: `UPI: ${upiId.trim()} | UTR: ${utrReference.trim()}`,
    });
    setSending(false);
    if (ok) setSent(true);
    else setError("Couldn't submit your request right now — please check your UPI ID and UTR Number and try again.");
  };

  return (
    <div className="modal-overlay" onClick={handleOverlay}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <h3>🧾 Request a Receipt</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {!sent ? (
            <>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
                Already made a donation? Let us know and our finance team will verify the payment and email your official receipt.
              </p>
              <div className="field"><label>Your Name</label><input value={donorName} onChange={e => setDonorName(e.target.value)} placeholder="Full name" /></div>
              <div className="field"><label>Your Email</label><input type="email" value={donorEmail} onChange={e => setDonorEmail(e.target.value)} placeholder="you@email.com" /></div>
              <div className="field-row" style={{ display: "flex", gap: 12 }}>
                <div className="field" style={{ flex: 1 }}><label>Amount Paid (₹, optional)</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1000" /></div>
                <div className="field" style={{ flex: 1 }}><label>Date Paid (optional)</label><input type="date" value={donationDate} max={new Date().toISOString().slice(0, 10)} onChange={e => {
                  const v = e.target.value;
                  const todayStr = new Date().toISOString().slice(0, 10);
                  setDonationDate(v > todayStr ? todayStr : v);
                }} /></div>
              </div>
              <div className="field-row" style={{ display: "flex", gap: 12 }}>
                <div className="field" style={{ flex: 1 }}><label>UPI ID</label><input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="username@bank" /></div>
                <div className="field" style={{ flex: 1 }}><label>UTR Number (12 digits)</label><input value={utrReference} onChange={e => setUtrReference(e.target.value)} placeholder="123456789012" maxLength={12} /></div>
              </div>
              <p style={{ fontSize: 11, color: "var(--muted)", marginTop: -8, marginBottom: 12, lineHeight: 1.5 }}>Found in your UPI app's transaction/payment history — this is how we match your payment to your receipt.</p>
              <div className="field"><label>Note (optional)</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="Anything else that helps us identify your payment" /></div>
              {error && <div className="enroll-error">⚠ {error}</div>}
              <button className="btn bg bfw" onClick={submit} disabled={sending} style={{ marginTop: 8 }}>
                {sending ? "Submitting…" : "Submit Request →"}
              </button>
              <p style={{ fontSize: 10.5, color: "var(--muted)", textAlign: "center", marginTop: 10, lineHeight: 1.6, opacity: .75 }}>
                🔒 Used only to verify your donation and issue your receipt — never shared or used for anything else.
              </p>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🧾</div>
              <p style={{ fontSize: 14, color: "var(--text)", marginBottom: 6 }}>Request received!</p>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>Our finance team will verify your payment and email your receipt soon.</p>
              <button className="btn bh" style={{ marginTop: 16 }} onClick={onClose}>Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Download Receipt PDF — no login required. Reached either via the link
// in the receipt email (?receipt=ABM-2026-001, pre-fills the receipt number)
// or by typing both fields in manually. Only ever returns a match when BOTH
// the receipt number AND email match (see get_receipt_for_download() SQL) —
// so a donor can only ever pull their own receipt, never anyone else's.
function DownloadReceiptPage({ prefillReceiptNo, toast_, user, setView }) {
  const [receiptNo, setReceiptNo] = useState(prefillReceiptNo || "");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Logged-in donor's own receipt list — fetched server-side by account
  // email (see get_my_receipts() deploy notes), so this can never show
  // anyone else's receipts.
  const [myReceipts, setMyReceipts] = useState(null); // null = not loaded yet, [] = loaded, none found
  const [downloadingNo, setDownloadingNo] = useState(null);

  useEffect(() => {
    if (user) fetchMyReceipts().then(r => { if (r) setMyReceipts(r); });
  }, [user]);

  const submit = async () => {
    setError("");
    if (!receiptNo.trim() || !email.trim()) {
      setError("Enter both your Receipt Number and the email it was issued to.");
      return;
    }
    setLoading(true);
    const receipt = await fetchReceiptForDownload(receiptNo, email);
    if (!receipt) {
      setLoading(false);
      setError("No matching receipt found. Double-check the Receipt Number and email address.");
      return;
    }
    try {
      await generateReceiptPDF(receipt);
      setDone(true);
    } catch (err) {
      console.error("generateReceiptPDF error:", err);
      setError("Found your receipt, but couldn't generate the PDF — please try again.");
    }
    setLoading(false);
  };

  const downloadFromList = async (r) => {
    setDownloadingNo(r.receiptNo);
    try {
      await generateReceiptPDF(r);
    } catch (err) {
      console.error("generateReceiptPDF error:", err);
      toast_("Couldn't generate the PDF — try again.");
    }
    setDownloadingNo(null);
  };

  return (
    <div className="page">
      <button className="btn bh" style={{ maxWidth: 420, margin: "24px auto 0", display: "block" }} onClick={() => setView(user ? "profileHub" : "home")}>← Back</button>
      {user && myReceipts && myReceipts.length > 0 && (
        <div className="card" style={{ maxWidth: 420, margin: "16px auto 16px" }}>
          <div className="lbl">🧾 Your Receipts</div>
          <p style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.5 }}>
            Only shows receipts issued to your account email ({user.email}).
          </p>
          {myReceipts.map(r => (
            <div key={r.receiptNo} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid rgba(0,200,230,.08)" }}>
              <div>
                <div style={{ fontSize: 12.5, color: "var(--gold3)", fontFamily: "monospace" }}>{r.receiptNo}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  ₹{Number(r.amount).toLocaleString("en-IN")} · {new Date(r.donationDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </div>
              </div>
              <button className="copy-btn" onClick={() => downloadFromList(r)} disabled={downloadingNo === r.receiptNo}>
                {downloadingNo === r.receiptNo ? "…" : "PDF"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ maxWidth: 420, margin: "0 auto 24px" }}>
        <div className="lbl">📄 {user ? "Look Up Another Receipt" : "Download Receipt PDF"}</div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
          {user
            ? "For a receipt issued under a different email than your account."
            : "Enter your Receipt Number and the email address it was issued to."}
        </p>
        <div className="field"><label>Receipt Number</label><input value={receiptNo} onChange={e => setReceiptNo(e.target.value)} placeholder="ABM-2026-001-X7K9" /></div>
        <div className="field"><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" /></div>
        {error && <div className="enroll-error">⚠ {error}</div>}
        <button className="btn bg bfw" onClick={submit} disabled={loading}>
          {loading ? "Looking up…" : "Download PDF"}
        </button>
        {done && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 7, background: "rgba(74,158,92,.08)", border: "1px solid rgba(74,158,92,.25)" }}>
            <div style={{ fontSize: 13, color: "var(--ok)" }}>✅ PDF downloaded.</div>
          </div>
        )}
      </div>
    </div>
  );
}