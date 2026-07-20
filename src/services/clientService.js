import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config.js';
import { CLIENT_STATUS, PAGE_SIZE, PERSON_TYPES } from '../utils/constants.js';
import { onlyDigits, isValidDocument, validateClientForm } from '../utils/validators.js';
import { getCached, invalidateCacheByPrefix } from '../utils/dataCache.js';
import { createAuditLog } from './auditService.js';

const COLLECTION = 'clients';

function invalidateClientsCache() {
  invalidateCacheByPrefix('clients:');
  invalidateCacheByPrefix('contracts:active-clients');
}

const COUPLE_NAME_SPLIT = /\s+e\s+/i;

export function splitCoupleName(fullName = '') {
  const trimmed = fullName.trim();
  const parts = trimmed.split(COUPLE_NAME_SPLIT);
  if (parts.length === 2 && parts[0]?.trim() && parts[1]?.trim()) {
    return { name: parts[0].trim(), partnerName: parts[1].trim() };
  }
  return { name: trimmed, partnerName: '' };
}

export function resolveClientCoupleFields(client) {
  const data = client ?? {};

  if (data.isCouple || data.partnerName) {
    return {
      isCouple: true,
      name: data.name || '',
      partnerName: data.partnerName || '',
      partnerDocument: data.partnerDocument || '',
    };
  }

  return {
    isCouple: false,
    name: data.name || '',
    partnerName: '',
    partnerDocument: '',
  };
}

export function getClientDisplayName(client) {
  const data = client ?? {};
  if (!data.name) return '';

  if (data.isCouple && data.partnerName) {
    return `${data.name.trim()} e ${data.partnerName.trim()}`;
  }

  return data.name.trim();
}

function normalizeClientData(data) {
  const isCouple = Boolean(data.isCouple) && data.personType !== PERSON_TYPES.COMPANY;
  const name = data.name.trim();
  const partnerName = isCouple ? data.partnerName?.trim() || '' : '';

  const whatsapp = data.whatsapp ? onlyDigits(data.whatsapp) : '';

  return {
    name,
    nameLower: getClientDisplayName({ name, partnerName, isCouple }).toLowerCase(),
    personType: data.personType,
    document: data.document ? onlyDigits(data.document) : '',
    isCouple,
    partnerName,
    partnerDocument: isCouple && data.partnerDocument ? onlyDigits(data.partnerDocument) : '',
    phone: whatsapp,
    whatsapp,
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
    client.partnerName?.toLowerCase().includes(term) ||
    client.nameLower?.includes(term) ||
    client.email?.toLowerCase().includes(term) ||
    (phoneTerm && client.phone?.includes(phoneTerm)) ||
    (phoneTerm && client.whatsapp?.includes(phoneTerm)) ||
    (phoneTerm && client.document?.includes(phoneTerm)) ||
    (phoneTerm && client.partnerDocument?.includes(phoneTerm))
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

function compareClients(a, b, sortBy, sortDir) {
  const dir = sortDir === 'asc' ? 1 : -1;

  if (sortBy === 'createdAt') {
    const av = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds ?? 0;
    const bv = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds ?? 0;
    return (av - bv) * dir;
  }

  return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR') * dir;
}

function paginateClients(clients, { pageSize, cursor, search }) {
  const start = cursor ? Number(cursor) : 0;
  const paginated = clients.slice(start, start + pageSize);

  return {
    clients: paginated,
    lastCursor: start + pageSize < clients.length ? String(start + pageSize) : null,
    totalFiltered: search ? clients.length : null,
    hasMore: start + pageSize < clients.length,
  };
}

async function fetchClientsWithQuery({ status, sortBy, sortDir, search, pageSize, cursor }) {
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
    return paginateClients(clients, { pageSize, cursor, search });
  }

  return {
    clients,
    lastCursor: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null,
    totalFiltered: null,
    hasMore: snapshot.docs.length === pageSize,
  };
}

async function fetchClientsFallback({ status, sortBy, sortDir, search, pageSize, cursor }) {
  const snapshot = await getDocs(collection(db, COLLECTION));
  let clients = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));

  if (status && status !== 'all') {
    clients = clients.filter((client) => client.status === status);
  }

  if (search) {
    clients = clients.filter((client) => matchesSearch(client, search));
  }

  clients.sort((a, b) => compareClients(a, b, sortBy, sortDir));

  return paginateClients(clients, { pageSize, cursor, search });
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
    try {
      return await fetchClientsWithQuery({ status, sortBy, sortDir, search, pageSize, cursor });
    } catch (error) {
      if (error?.code === 'failed-precondition') {
        console.warn('[Clients] Índice do Firestore indisponível, usando fallback em memória.', error);
        return fetchClientsFallback({ status, sortBy, sortDir, search, pageSize, cursor });
      }
      throw error;
    }
  }, search ? 15_000 : 60_000);
}

export async function getClientById(id) {
  const snapshot = await getDoc(doc(db, COLLECTION, id));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

async function queryClientsByDocumentField(field, digits) {
  try {
    const snapshot = await getDocs(
      query(collection(db, COLLECTION), where(field, '==', digits))
    );
    return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    if (error?.code !== 'failed-precondition') throw error;
    return null;
  }
}

export async function findClientsByDocument(document, { excludeClientId } = {}) {
  const digits = onlyDigits(document);
  if (!digits) return [];

  const matches = new Map();
  const addMatches = (clients) => {
    clients.forEach((client) => {
      if (client.id !== excludeClientId) {
        matches.set(client.id, client);
      }
    });
  };

  const [byDocument, byPartnerDocument] = await Promise.all([
    queryClientsByDocumentField('document', digits),
    queryClientsByDocumentField('partnerDocument', digits),
  ]);

  if (byDocument && byPartnerDocument) {
    addMatches(byDocument);
    addMatches(byPartnerDocument);
    return [...matches.values()];
  }

  const snapshot = await getDocs(collection(db, COLLECTION));
  snapshot.docs.forEach((docSnap) => {
    if (docSnap.id === excludeClientId) return;
    const data = docSnap.data();
    if (data.document === digits || data.partnerDocument === digits) {
      matches.set(docSnap.id, { id: docSnap.id, ...data });
    }
  });

  return [...matches.values()];
}

export async function getClientDocumentConflictErrors(data, { excludeClientId } = {}) {
  const errors = {};
  const personType = data.personType || PERSON_TYPES.INDIVIDUAL;
  const isCouple = Boolean(data.isCouple) && personType !== PERSON_TYPES.COMPANY;
  const mainDigits = data.document ? onlyDigits(data.document) : '';
  const partnerDigits = isCouple && data.partnerDocument ? onlyDigits(data.partnerDocument) : '';

  if (mainDigits && partnerDigits && mainDigits === partnerDigits) {
    errors.partnerDocument = 'Os CPFs dos noivos não podem ser iguais.';
  }

  if (mainDigits && isValidDocument(data.document, personType)) {
    const matches = await findClientsByDocument(mainDigits, { excludeClientId });
    if (matches.length > 0) {
      const label = personType === PERSON_TYPES.COMPANY ? 'CNPJ' : 'CPF';
      errors.document = `Este ${label} já está cadastrado para ${getClientDisplayName(matches[0])}.`;
    }
  }

  if (partnerDigits && isValidDocument(data.partnerDocument, PERSON_TYPES.INDIVIDUAL)) {
    const matches = await findClientsByDocument(partnerDigits, { excludeClientId });
    if (matches.length > 0) {
      errors.partnerDocument = `Este CPF já está cadastrado para ${getClientDisplayName(matches[0])}.`;
    }
  }

  return errors;
}

export async function validateClientSubmission(data, { excludeClientId } = {}) {
  return {
    ...validateClientForm(data),
    ...(await getClientDocumentConflictErrors(data, { excludeClientId })),
  };
}

async function assertClientDocumentsAvailable(data, { excludeClientId } = {}) {
  const errors = await getClientDocumentConflictErrors(data, { excludeClientId });
  if (Object.keys(errors).length > 0) {
    throw new Error(Object.values(errors)[0]);
  }
}

export async function createClient(data) {
  await assertClientDocumentsAvailable(data);

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
  await assertClientDocumentsAvailable(data, { excludeClientId: id });

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

export async function deleteClient(id, user) {
  const client = await getClientById(id);
  if (!client) throw new Error('Cliente não encontrado.');

  const contracts = await getClientContracts(id);
  if (contracts.length > 0) {
    throw new Error('Este cliente possui contratos vinculados. Exclua os contratos antes de remover o cliente.');
  }

  await deleteDoc(doc(db, COLLECTION, id));
  invalidateClientsCache();

  if (user) {
    await createAuditLog({
      action: 'client_deleted',
      entityType: 'client',
      entityId: id,
      previousData: {
        name: getClientDisplayName(client),
        email: client.email || '',
        phone: client.phone || '',
      },
      user,
    });
  }
}

export async function getClientContracts(clientId) {
  const snapshot = await getDocs(
    query(collection(db, 'contracts'), where('clientId', '==', clientId))
  );

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}
