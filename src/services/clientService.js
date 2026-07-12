import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config.js';
import { CLIENT_STATUS, PAGE_SIZE } from '../utils/constants.js';
import { onlyDigits } from '../utils/validators.js';
import { getCached, invalidateCacheByPrefix } from '../utils/dataCache.js';

const COLLECTION = 'clients';

function invalidateClientsCache() {
  invalidateCacheByPrefix('clients:');
  invalidateCacheByPrefix('contracts:active-clients');
}

function normalizeClientData(data) {
  return {
    name: data.name.trim(),
    nameLower: data.name.trim().toLowerCase(),
    personType: data.personType,
    document: data.document ? onlyDigits(data.document) : '',
    phone: data.phone ? onlyDigits(data.phone) : '',
    whatsapp: data.whatsapp ? onlyDigits(data.whatsapp) : '',
    email: data.email?.trim().toLowerCase() || '',
    instagram: data.instagram?.trim() || '',
    address: data.address?.trim() || '',
    city: data.city?.trim() || '',
    state: data.state?.trim().toUpperCase() || '',
    notes: data.notes?.trim() || '',
    status: data.status || CLIENT_STATUS.ACTIVE,
  };
}

function matchesSearch(client, search) {
  if (!search) return true;

  const term = search.toLowerCase().trim();
  const phoneTerm = onlyDigits(search);

  return (
    client.name?.toLowerCase().includes(term) ||
    client.email?.toLowerCase().includes(term) ||
    (phoneTerm && client.phone?.includes(phoneTerm)) ||
    (phoneTerm && client.whatsapp?.includes(phoneTerm))
  );
}

function buildQueryConstraints({ status, sortBy, sortDir }) {
  const constraints = [];

  if (status && status !== 'all') {
    constraints.push(where('status', '==', status));
  }

  const field = sortBy === 'createdAt' ? 'createdAt' : 'name';
  constraints.push(orderBy(field, sortDir === 'asc' ? 'asc' : 'desc'));

  return constraints;
}

export async function getClients({
  status = 'all',
  sortBy = 'name',
  sortDir = 'asc',
  search = '',
  pageSize = PAGE_SIZE,
  cursor = null,
} = {}) {
  const cacheKey = `clients:list:${status}:${sortBy}:${sortDir}:${search}:${pageSize}:${cursor || ''}`;

  return getCached(cacheKey, async () => {
    const constraints = buildQueryConstraints({ status, sortBy, sortDir });

    if (search) {
      constraints.push(limit(300));
    } else {
      constraints.push(limit(pageSize));
      if (cursor) {
        constraints.push(startAfter(cursor));
      }
    }

    const snapshot = await getDocs(query(collection(db, COLLECTION), ...constraints));
    let clients = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    if (search) {
      clients = clients.filter((client) => matchesSearch(client, search));
      const start = cursor ? Number(cursor) : 0;
      const paginated = clients.slice(start, start + pageSize);

      return {
        clients: paginated,
        lastCursor: start + pageSize < clients.length ? String(start + pageSize) : null,
        totalFiltered: clients.length,
        hasMore: start + pageSize < clients.length,
      };
    }

    return {
      clients,
      lastCursor: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null,
      totalFiltered: null,
      hasMore: snapshot.docs.length === pageSize,
    };
  }, search ? 15_000 : 60_000);
}

export async function getClientById(id) {
  const snapshot = await getDoc(doc(db, COLLECTION, id));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

export async function createClient(data) {
  const payload = {
    ...normalizeClientData(data),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, COLLECTION), payload);
  invalidateClientsCache();
  return docRef.id;
}

export async function updateClient(id, data) {
  const payload = {
    ...normalizeClientData(data),
    updatedAt: serverTimestamp(),
  };

  await updateDoc(doc(db, COLLECTION, id), payload);
  invalidateClientsCache();
}

export async function archiveClient(id) {
  await updateDoc(doc(db, COLLECTION, id), {
    status: CLIENT_STATUS.INACTIVE,
    updatedAt: serverTimestamp(),
  });
  invalidateClientsCache();
}

export async function getClientContracts(clientId) {
  try {
    const snapshot = await getDocs(
      query(collection(db, 'contracts'), where('clientId', '==', clientId))
    );
    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
  } catch {
    return [];
  }
}
