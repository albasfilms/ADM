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
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config.js';
import {
  CONTRACT_STATUS,
  INSTALLMENT_STATUS,
  PAGE_SIZE,
} from '../utils/constants.js';
import { sumCents } from '../utils/currency.js';

const COLLECTION = 'contracts';

function matchesSearch(contract, search) {
  if (!search) return true;
  const term = search.toLowerCase().trim();
  return (
    contract.title?.toLowerCase().includes(term) ||
    contract.clientName?.toLowerCase().includes(term)
  );
}

export async function getActiveClients() {
  const snapshot = await getDocs(
    query(
      collection(db, 'clients'),
      where('status', '==', 'active'),
      orderBy('name', 'asc')
    )
  );
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getContracts({
  status = 'all',
  sortBy = 'createdAt',
  sortDir = 'desc',
  search = '',
  pageSize = PAGE_SIZE,
  cursor = null,
} = {}) {
  const constraints = [];

  if (status && status !== 'all') {
    constraints.push(where('status', '==', status));
  }

  const field = sortBy === 'title' ? 'title' : sortBy === 'eventDate' ? 'eventDate' : 'createdAt';
  constraints.push(orderBy(field, sortDir === 'asc' ? 'asc' : 'desc'));

  if (search) {
    constraints.push(limit(300));
  } else {
    constraints.push(limit(pageSize));
    if (cursor) constraints.push(startAfter(cursor));
  }

  const snapshot = await getDocs(query(collection(db, COLLECTION), ...constraints));
  let contracts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (search) {
    contracts = contracts.filter((c) => matchesSearch(c, search));
    const start = cursor ? Number(cursor) : 0;
    const paginated = contracts.slice(start, start + pageSize);
    return {
      contracts: paginated,
      lastCursor: start + pageSize < contracts.length ? String(start + pageSize) : null,
      hasMore: start + pageSize < contracts.length,
    };
  }

  return {
    contracts,
    lastCursor: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null,
    hasMore: snapshot.docs.length === pageSize,
  };
}

export async function getContractById(id) {
  const snapshot = await getDoc(doc(db, COLLECTION, id));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

export async function getContractItems(contractId) {
  const snapshot = await getDocs(
    query(collection(db, COLLECTION, contractId, 'items'), orderBy('order', 'asc'))
  );
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getContractInstallments(contractId) {
  const snapshot = await getDocs(
    query(collection(db, COLLECTION, contractId, 'installments'), orderBy('number', 'asc'))
  );
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getContractFull(contractId) {
  const [contract, items, installments] = await Promise.all([
    getContractById(contractId),
    getContractItems(contractId),
    getContractInstallments(contractId),
  ]);
  return { contract, items, installments };
}

function buildContractDoc(data, client, totalAmount) {
  return {
    clientId: data.clientId,
    clientName: client.name,
    title: data.title.trim(),
    description: data.description?.trim() || '',
    serviceType: data.serviceType,
    eventDate: data.eventDate ? Timestamp.fromDate(new Date(data.eventDate)) : null,
    eventTime: data.eventTime?.trim() || '',
    eventLocation: data.eventLocation?.trim() || '',
    city: data.city?.trim() || '',
    state: data.state?.trim() || '',
    closingDate: data.closingDate ? Timestamp.fromDate(new Date(data.closingDate)) : null,
    totalAmount,
    entryPercent: Number(data.entryPercent) || 0,
    entryAmount: Number(data.entryAmount) || 0,
    entryPaymentMethod: data.entryPaymentMethod || '',
    installmentCount: Number(data.installmentCount) || 0,
    firstDueDate: data.firstDueDate ? Timestamp.fromDate(new Date(data.firstDueDate)) : null,
    installmentIntervalMonths: Number(data.installmentIntervalMonths) || 1,
    driveLink: data.driveLink?.trim() || '',
    contractLink: data.contractLink?.trim() || '',
    notes: data.notes?.trim() || '',
    status: data.status || CONTRACT_STATUS.BUDGET,
    receivedAmount: 0,
    pendingAmount: totalAmount,
    overdueAmount: 0,
  };
}

export async function createContract(data, items, installments, client) {
  const totalAmount = sumCents(items.map((i) => i.amount));
  const batch = writeBatch(db);
  const contractRef = doc(collection(db, COLLECTION));

  batch.set(contractRef, {
    ...buildContractDoc(data, client, totalAmount),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  items.forEach((item, index) => {
    const itemRef = doc(collection(db, COLLECTION, contractRef.id, 'items'));
    batch.set(itemRef, {
      description: item.description.trim(),
      serviceType: item.serviceType,
      amount: item.amount,
      order: index,
    });
  });

  installments.forEach((inst) => {
    const instRef = doc(collection(db, COLLECTION, contractRef.id, 'installments'));
    batch.set(instRef, {
      number: inst.number,
      description: inst.description,
      expectedAmount: inst.expectedAmount,
      dueDate: Timestamp.fromDate(inst.dueDate),
      paidAmount: 0,
      paymentDate: null,
      paymentMethod: inst.number === 0 ? data.entryPaymentMethod || '' : '',
      status: INSTALLMENT_STATUS.PENDING,
      notes: '',
      createdAt: serverTimestamp(),
    });
  });

  await batch.commit();
  return contractRef.id;
}

export async function updateContract(contractId, data, items, client, existingContract) {
  const totalAmount = sumCents(items.map((i) => i.amount));
  const receivedAmount = existingContract?.receivedAmount || 0;
  const batch = writeBatch(db);
  const contractRef = doc(db, COLLECTION, contractId);

  const docData = buildContractDoc(data, client, totalAmount);
  batch.update(contractRef, {
    ...docData,
    receivedAmount,
    pendingAmount: Math.max(0, totalAmount - receivedAmount),
    overdueAmount: existingContract?.overdueAmount || 0,
    updatedAt: serverTimestamp(),
  });

  const existingItems = await getContractItems(contractId);
  existingItems.forEach((item) => {
    batch.delete(doc(db, COLLECTION, contractId, 'items', item.id));
  });

  items.forEach((item, index) => {
    const itemRef = doc(collection(db, COLLECTION, contractId, 'items'));
    batch.set(itemRef, {
      description: item.description.trim(),
      serviceType: item.serviceType,
      amount: item.amount,
      order: index,
    });
  });

  await batch.commit();
}

export async function cancelContract(contractId) {
  await updateDoc(doc(db, COLLECTION, contractId), {
    status: CONTRACT_STATUS.CANCELLED,
    updatedAt: serverTimestamp(),
  });
}

export async function finalizeContract(contractId) {
  await updateDoc(doc(db, COLLECTION, contractId), {
    status: CONTRACT_STATUS.FINISHED,
    updatedAt: serverTimestamp(),
  });
}
