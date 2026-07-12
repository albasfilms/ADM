import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config.js';
import { getCurrentUser } from '../appState.js';
import { getCached, invalidateCache } from '../utils/dataCache.js';

const SETTINGS_REF = doc(db, 'settings', 'links');

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

function createEntryId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeItems(data = {}) {
  return Array.isArray(data.items) ? [...data.items] : [];
}

function sortLinks(items, limitCount = 200) {
  return items
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, limitCount);
}

async function readItems() {
  const snapshot = await getDoc(SETTINGS_REF);
  return normalizeItems(snapshot.exists() ? snapshot.data() : {});
}

export async function getLinks({ limitCount = 200 } = {}) {
  return getCached('links:list', async () => {
    const items = await readItems();
    return sortLinks(items, limitCount);
  });
}

export async function getLink(linkId) {
  const items = await readItems();
  const link = items.find((item) => item.id === linkId);
  return link || null;
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
  const now = Date.now();

  const entry = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(SETTINGS_REF);
    const items = normalizeItems(snapshot.exists() ? snapshot.data() : {});
    const newEntry = {
      id: createEntryId('link'),
      ...normalized,
      createdBy: author,
      updatedBy: author,
      createdAt: now,
      updatedAt: now,
    };

    transaction.set(
      SETTINGS_REF,
      {
        items: [...items, newEntry],
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return newEntry;
  });

  invalidateCache('links:list');
  return entry;
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
  const now = Date.now();

  const updated = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(SETTINGS_REF);
    const items = normalizeItems(snapshot.exists() ? snapshot.data() : {});
    const index = items.findIndex((item) => item.id === linkId);

    if (index === -1) {
      throw new Error('Link não encontrado.');
    }

    const next = {
      ...items[index],
      ...normalized,
      updatedBy: author,
      updatedAt: now,
    };

    items[index] = next;

    transaction.set(
      SETTINGS_REF,
      {
        items,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return next;
  });

  invalidateCache('links:list');
  return updated;
}

export async function deleteLink(linkId) {
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(SETTINGS_REF);
    const items = normalizeItems(snapshot.exists() ? snapshot.data() : {});
    const filtered = items.filter((item) => item.id !== linkId);

    transaction.set(
      SETTINGS_REF,
      {
        items: filtered,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  invalidateCache('links:list');
}

export { normalizeUrl };
