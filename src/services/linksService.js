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

const COLLECTION = 'links';

function normalizeUrl(url) {
  const trimmed = url?.trim() || '';
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function normalizeLinkData(data) {
  const name = data.name?.trim() || '';
  const description = data.description?.trim() || '';
  const url = normalizeUrl(data.url);

  return {
    name,
    description,
    url,
    nameLower: name.toLowerCase(),
  };
}

function getAuthor() {
  const user = getCurrentUser();
  return {
    uid: user?.uid || '',
    name: user?.name || user?.email || 'Usuário',
  };
}

export async function getLinks({ limitCount = 200 } = {}) {
  const snapshot = await getDocs(
    query(collection(db, COLLECTION), orderBy('updatedAt', 'desc'), limit(limitCount))
  );

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function getLink(linkId) {
  const snapshot = await getDoc(doc(db, COLLECTION, linkId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

export async function createLink(data) {
  const normalized = normalizeLinkData(data);

  if (!normalized.name) {
    throw new Error('O nome do link é obrigatório.');
  }

  if (!normalized.url) {
    throw new Error('O endereço do link é obrigatório.');
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

export async function updateLink(linkId, data) {
  const normalized = normalizeLinkData(data);

  if (!normalized.name) {
    throw new Error('O nome do link é obrigatório.');
  }

  if (!normalized.url) {
    throw new Error('O endereço do link é obrigatório.');
  }

  const author = getAuthor();
  const payload = {
    ...normalized,
    updatedBy: author,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(doc(db, COLLECTION, linkId), payload);
  return { id: linkId, ...payload };
}

export async function deleteLink(linkId) {
  await deleteDoc(doc(db, COLLECTION, linkId));
}

export { normalizeUrl };
