import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config.js';
import { getCurrentUser } from '../appState.js';

const SETTINGS_REF = doc(db, 'settings', 'notes');

function normalizeNoteData(data) {
  const content = data.content?.trim() || '';
  const title = data.title?.trim() || deriveTitle(content);

  return {
    title,
    content,
    titleLower: title.toLowerCase(),
    contentPreview: content.slice(0, 200),
  };
}

function deriveTitle(content) {
  const firstLine = content.split('\n').find((line) => line.trim());
  if (!firstLine) return 'Sem título';
  return firstLine.trim().slice(0, 80);
}

function getAuthor() {
  const user = getCurrentUser();
  return {
    uid: user?.uid || '',
    name: user?.name || user?.email || 'Usuário',
  };
}

function createEntryId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeItems(data = {}) {
  return Array.isArray(data.items) ? [...data.items] : [];
}

function sortNotes(items, limitCount = 200) {
  return items
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, limitCount);
}

async function readItems() {
  const snapshot = await getDoc(SETTINGS_REF);
  return normalizeItems(snapshot.exists() ? snapshot.data() : {});
}

export async function getNotes({ limitCount = 200 } = {}) {
  const items = await readItems();
  return sortNotes(items, limitCount);
}

export async function getNote(noteId) {
  const items = await readItems();
  const note = items.find((item) => item.id === noteId);
  return note || null;
}

export async function createNote(data) {
  const normalized = normalizeNoteData(data);
  if (!normalized.content) {
    throw new Error('O conteúdo da nota não pode estar vazio.');
  }

  const author = getAuthor();
  const now = Date.now();

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(SETTINGS_REF);
    const items = normalizeItems(snapshot.exists() ? snapshot.data() : {});
    const entry = {
      id: createEntryId('note'),
      ...normalized,
      createdBy: author,
      updatedBy: author,
      createdAt: now,
      updatedAt: now,
    };

    transaction.set(
      SETTINGS_REF,
      {
        items: [...items, entry],
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return entry;
  });
}

export async function updateNote(noteId, data) {
  const normalized = normalizeNoteData(data);
  if (!normalized.content) {
    throw new Error('O conteúdo da nota não pode estar vazio.');
  }

  const author = getAuthor();
  const now = Date.now();

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(SETTINGS_REF);
    const items = normalizeItems(snapshot.exists() ? snapshot.data() : {});
    const index = items.findIndex((item) => item.id === noteId);

    if (index === -1) {
      throw new Error('Nota não encontrada.');
    }

    const updated = {
      ...items[index],
      ...normalized,
      updatedBy: author,
      updatedAt: now,
    };

    items[index] = updated;

    transaction.set(
      SETTINGS_REF,
      {
        items,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return updated;
  });
}

export async function deleteNote(noteId) {
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(SETTINGS_REF);
    const items = normalizeItems(snapshot.exists() ? snapshot.data() : {});
    const filtered = items.filter((item) => item.id !== noteId);

    transaction.set(
      SETTINGS_REF,
      {
        items: filtered,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}
