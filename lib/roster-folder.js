'use client';

// Shared roster-folder library for the Chalk & Circuit ecosystem.
// Standard pattern for any product holding student data that needs a
// local roster file (parent-portal, TeacherAssist, Math Mastery,
// Assessment Tool, Lesson Planner, Writing Checker, and future products).
//
// Uses the File System Access API (Chrome/Edge only - not Safari/Firefox,
// this is a hard browser limitation, not something workable-around).
// First use requires one explicit folder picker (browser security
// requirement - no site can silently access the filesystem). After that,
// the browser remembers the granted folder handle (stored in IndexedDB)
// and subsequent calls can check/open/save automatically without
// re-prompting, until the browser periodically asks to reconfirm
// permission (a security measure, not something apps can disable).
//
// Folder convention: "Roster Manager" folder, created inside whatever
// parent folder the user picks (Documents or Downloads are the natural
// choices, but the picker lets them choose anywhere).

const DB_NAME = 'chalk-circuit-roster-handles';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'roster-manager-folder';

function isSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHandle(handle) {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandle() {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function ensurePermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

/**
 * One-time setup: opens the native folder picker, creates (or reuses) a
 * "Roster Manager" subfolder inside whatever the user picks, and
 * remembers it for future calls. Must be called from a direct user
 * gesture (button click) - browsers block this API otherwise.
 */
export async function setupRosterFolder() {
  if (!isSupported()) {
    return { ok: false, error: 'Your browser doesn\'t support this (Chrome or Edge only) - use the manual file upload instead.' };
  }
  try {
    const parentHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const rosterHandle = await parentHandle.getDirectoryHandle('Roster Manager', { create: true });
    await saveHandle(rosterHandle);
    return { ok: true, folderName: rosterHandle.name };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, error: 'Folder selection cancelled.' };
    return { ok: false, error: err.message };
  }
}

/**
 * Looks for a specific roster file inside the remembered Roster Manager
 * folder. Call this after a button press (per Aj's spec) - not
 * automatically on page load, so it never surprises the user with a
 * permission prompt.
 */
export async function findRosterFile(filename) {
  if (!isSupported()) return { ok: false, error: 'not_supported' };
  const handle = await loadHandle();
  if (!handle) return { ok: false, error: 'no_folder_set_up' };
  if (!(await ensurePermission(handle))) return { ok: false, error: 'permission_denied' };
  try {
    const fileHandle = await handle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return { ok: true, text, fileHandle };
  } catch (err) {
    if (err.name === 'NotFoundError') return { ok: false, error: 'file_not_found' };
    return { ok: false, error: err.message };
  }
}

/**
 * Saves (creates or overwrites) a roster file in the remembered folder.
 */
export async function saveRosterFile(filename, contents) {
  if (!isSupported()) return { ok: false, error: 'not_supported' };
  const handle = await loadHandle();
  if (!handle) return { ok: false, error: 'no_folder_set_up' };
  if (!(await ensurePermission(handle))) return { ok: false, error: 'permission_denied' };
  try {
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(contents);
    await writable.close();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function hasRosterFolderSetUp() {
  if (!isSupported()) return false;
  const handle = await loadHandle();
  return !!handle;
}

export { isSupported as isRosterFolderSupported };
