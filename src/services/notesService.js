import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config.js';
import { getCurrentUser } from '../appState.js';

const COLLECTION = 'notes';

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

export async function getNotes({ limitCount = 200 } = {}) {
  const snapshot = await getDocs(
    query(collection(db, COLLECTION), orderBy('updatedAt', 'desc'), limit(limitCount))
  );

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function getNote(noteId) {
  const snapshot = await getDoc(doc(db, COLLECTION, noteId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

export async function createNote(data) {
  const normalized = normalizeNoteData(data);
  if (!normalized.content) {
    throw new Error('O conteúdo da nota não pode estar vazio.');
  }

  const author = getAuthor();
  const payload = {
    ...normalized,
    createdBy: author,
    updatedBy: author,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, COLLECTION), payload);
  return { id: ref.id, ...payload };
}

export async function updateNote(noteId, data) {
  const normalized = normalizeNoteData(data);
  if (!normalized.content) {
    throw new Error('O conteúdo da nota não pode estar vazio.');
  }

  const author = getAuthor();
  const payload = {
    ...normalized,
    updatedBy: author,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(doc(db, COLLECTION, noteId), payload);
  return { id: noteId, ...payload };
}

export async function deleteNote(noteId) {
  await deleteDoc(doc(db, COLLECTION, noteId));
}
