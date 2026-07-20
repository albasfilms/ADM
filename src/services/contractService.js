import {
  collection,
  collectionGroup,
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
import { getClientDisplayName } from './clientService.js';
import {
  CONTRACT_STATUS,
  INSTALLMENT_STATUS,
  PAGE_SIZE,
  PAYMENT_PLAN_TYPES,
} from '../utils/constants.js';
import { sumCents } from '../utils/currency.js';
import { parseDateInput } from '../utils/dates.js';
import { contractHasRecordedPayments } from '../utils/paymentPlanPresets.js';
import { createAuditLog } from './auditService.js';
import { getCached, invalidateCache, invalidateCacheByPrefix } from '../utils/dataCache.js';

function invalidateContractsCache() {
  invalidateCacheByPrefix('contracts:');
  invalidateCacheByPrefix('installments:');
  invalidateCacheByPrefix('dashboard:');
  invalidateCacheByPrefix('calendar:');
}

const COLLECTION = 'contracts';

function matchesSearch(contract, search) {
  if (!search) return true;
  const term = search.toLowerCase().trim();
  return (
    contract.title?.toLowerCase().includes(term) ||
    contract.clientName?.toLowerCase().includes(term)
  );
}

import { CLIENT_STATUS } from '../utils/constants.js';

export async function getActiveClients() {
  return getCached('contracts:active-clients', async () => {
    const snapshot = await getDocs(
      query(collection(db, 'clients'), where('status', '==', CLIENT_STATUS.ACTIVE))
    );

    return snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  });
}

export async function getContracts({
  status = 'all',
  sortBy = 'createdAt',
  sortDir = 'desc',
  search = '',
  pageSize = PAGE_SIZE,
  cursor = null,
} = {}) {
  const cacheKey = `contracts:list:${status}:${sortBy}:${sortDir}:${search}:${pageSize}:${cursor || ''}`;

  return getCached(cacheKey, async () => {
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
  }, search ? 15_000 : 60_000);
}

export async function getContractById(id) {
  const snapshot = await getDoc(doc(db, COLLECTION, id));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

export async function getContractItems(contractId) {
  const snapshot = await getDocs(collection(db, COLLECTION, contractId, 'items'));
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getContractInstallments(contractId) {
  return getCached(`installments:${contractId}`, async () => fetchContractInstallments(contractId));
}

async function fetchContractInstallments(contractId) {
  const snapshot = await getDocs(collection(db, COLLECTION, contractId, 'installments'));
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
}

export async function getContractInstallmentsFresh(contractId) {
  return fetchContractInstallments(contractId);
}

async function fetchAllInstallmentRecords() {
  const snapshot = await getDocs(collectionGroup(db, 'installments'));
  return snapshot.docs.map((docSnap) => ({
    contractId: docSnap.ref.parent.parent?.id || '',
    installment: { id: docSnap.id, ...docSnap.data() },
  }));
}

async function fetchInstallmentsFallback(contracts) {
  const pairs = await Promise.all(
    contracts.map(async (contract) => {
      const installments = await getContractInstallments(contract.id);
      return installments.map((installment) => ({ contract, installment }));
    })
  );
  return pairs.flat();
}

export async function getInstallmentsForContracts(contracts = []) {
  const contractMap = new Map(contracts.map((contract) => [contract.id, contract]));
  if (!contractMap.size) return [];

  try {
    const records = await getCached('installments:all', fetchAllInstallmentRecords);

    return records
      .filter(({ contractId }) => contractMap.has(contractId))
      .map(({ contractId, installment }) => ({
        contract: contractMap.get(contractId),
        installment,
      }));
  } catch (error) {
    console.warn('[Contracts] Consulta em lote indisponível, usando fallback por contrato.', error);
    invalidateCache('installments:all');
    return fetchInstallmentsFallback([...contractMap.values()]);
  }
}

export async function getContractFull(contractId) {
  const [contract, items, installments] = await Promise.all([
    getContractById(contractId),
    getContractItems(contractId),
    getContractInstallments(contractId),
  ]);
  return { contract, items, installments };
}

function preserveContractPaymentFields(docData, existingContract) {
  if (!existingContract) return docData;

  return {
    ...docData,
    entryPercent: Number(existingContract.entryPercent) || 0,
    entryAmount: Number(existingContract.entryAmount) || 0,
    entryPaymentMethod: existingContract.entryPaymentMethod || '',
    paymentPlanType:
      existingContract.paymentPlanType ||
      docData.paymentPlanType ||
      PAYMENT_PLAN_TYPES.ENTRY_BEFORE_WEDDING,
    installmentCount: Number(existingContract.installmentCount) || 0,
    firstDueDate: existingContract.firstDueDate || null,
    installmentIntervalMonths: Number(existingContract.installmentIntervalMonths) || 1,
  };
}

function buildContractDoc(data, client, totalAmount) {
  return {
    clientId: data.clientId,
    clientName: getClientDisplayName(client),
    title: data.title.trim(),
    description: data.description?.trim() || '',
    eventType: data.eventType,
    serviceType: data.eventType,
    eventDate: data.eventDate ? Timestamp.fromDate(parseDateInput(data.eventDate)) : null,
    eventTime: data.eventTime?.trim() || '',
    eventLocation: data.eventLocation?.trim() || '',
    city: data.city?.trim() || '',
    state: data.state?.trim() || '',
    closingDate: data.closingDate ? Timestamp.fromDate(parseDateInput(data.closingDate)) : null,
    discountAmount: Number(data.discountAmount) || 0,
    totalAmount,
    entryPercent: Number(data.entryPercent) || 0,
    entryAmount: Number(data.entryAmount) || 0,
    entryPaymentMethod: data.entryPaymentMethod || '',
    paymentPlanType: data.paymentPlanType || PAYMENT_PLAN_TYPES.ENTRY_BEFORE_WEDDING,
    installmentCount: Number(data.installmentCount) || 0,
    firstDueDate: data.firstDueDate ? Timestamp.fromDate(parseDateInput(data.firstDueDate)) : null,
    installmentIntervalMonths: Number(data.installmentIntervalMonths) || 1,
    driveLink: data.driveLink?.trim() || '',
    contractLink: data.contractLink?.trim() || '',
    notes: data.notes?.trim() || '',
    status: data.status || CONTRACT_STATUS.CONFIRMED,
    receivedAmount: 0,
    pendingAmount: totalAmount,
    overdueAmount: 0,
  };
}

function buildContractItemData(item, index) {
  return {
    description: item.description.trim(),
    serviceType: item.serviceType,
    amount: item.amount,
    order: index,
    ...(item.preWeddingDate
      ? { preWeddingDate: Timestamp.fromDate(parseDateInput(item.preWeddingDate)) }
      : {}),
    ...(item.preWeddingLocation?.trim()
      ? { preWeddingLocation: item.preWeddingLocation.trim() }
      : {}),
    ...(item.preWeddingTime?.trim() ? { preWeddingTime: item.preWeddingTime.trim() } : {}),
    ...(item.makingOfLocation?.trim()
      ? { makingOfLocation: item.makingOfLocation.trim() }
      : {}),
    ...(item.makingOfSchedule?.trim()
      ? { makingOfSchedule: item.makingOfSchedule.trim() }
      : {}),
  };
}

export async function createContract(data, items, installments, client) {
  const subtotalAmount = sumCents(items.map((i) => i.amount));
  const discountAmount = Number(data.discountAmount) || 0;
  const totalAmount = Math.max(0, subtotalAmount - discountAmount);
  const batch = writeBatch(db);
  const contractRef = doc(collection(db, COLLECTION));

  batch.set(contractRef, {
    ...buildContractDoc(data, client, totalAmount),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  items.forEach((item, index) => {
    const itemRef = doc(collection(db, COLLECTION, contractRef.id, 'items'));
    batch.set(itemRef, buildContractItemData(item, index));
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
  invalidateContractsCache();
  return contractRef.id;
}

export async function updateContract(
  contractId,
  data,
  items,
  client,
  existingContract,
  installments = null
) {
  const subtotalAmount = sumCents(items.map((i) => i.amount));
  const discountAmount = Number(data.discountAmount) || 0;
  const totalAmount = Math.max(0, subtotalAmount - discountAmount);
  const batch = writeBatch(db);
  const contractRef = doc(db, COLLECTION, contractId);

  const existingInstallments = await getContractInstallments(contractId);
  const hasPayments = contractHasRecordedPayments(existingInstallments);
  const shouldReplaceInstallments = installments && !hasPayments;

  const receivedAmount = shouldReplaceInstallments ? 0 : existingContract?.receivedAmount || 0;
  let docData = buildContractDoc(data, client, totalAmount);
  if (hasPayments) {
    docData = preserveContractPaymentFields(docData, existingContract);
  }

  batch.update(contractRef, {
    ...docData,
    receivedAmount,
    pendingAmount: Math.max(0, totalAmount - receivedAmount),
    overdueAmount: shouldReplaceInstallments ? 0 : existingContract?.overdueAmount || 0,
    updatedAt: serverTimestamp(),
  });

  const existingItems = await getContractItems(contractId);
  existingItems.forEach((item) => {
    batch.delete(doc(db, COLLECTION, contractId, 'items', item.id));
  });

  items.forEach((item, index) => {
    const itemRef = doc(collection(db, COLLECTION, contractId, 'items'));
    batch.set(itemRef, buildContractItemData(item, index));
  });

  if (shouldReplaceInstallments) {
    for (const inst of existingInstallments) {
      const paymentsSnap = await getDocs(
        collection(db, COLLECTION, contractId, 'installments', inst.id, 'payments')
      );
      paymentsSnap.docs.forEach((paymentDoc) => {
        batch.delete(
          doc(db, COLLECTION, contractId, 'installments', inst.id, 'payments', paymentDoc.id)
        );
      });
      batch.delete(doc(db, COLLECTION, contractId, 'installments', inst.id));
    }

    installments.forEach((inst) => {
      const instRef = doc(collection(db, COLLECTION, contractId, 'installments'));
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
  }

  await batch.commit();
  invalidateContractsCache();

  return { installmentsReplaced: shouldReplaceInstallments, hasPayments };
}

export async function cancelContract(contractId) {
  await updateDoc(doc(db, COLLECTION, contractId), {
    status: CONTRACT_STATUS.CANCELLED,
    updatedAt: serverTimestamp(),
  });
  invalidateContractsCache();
}

export async function finalizeContract(contractId) {
  await updateDoc(doc(db, COLLECTION, contractId), {
    status: CONTRACT_STATUS.FINISHED,
    updatedAt: serverTimestamp(),
  });
  invalidateContractsCache();
}

export async function deleteContract(contractId, user) {
  const contract = await getContractById(contractId);
  if (!contract) throw new Error('Contrato não encontrado.');

  const items = await getContractItems(contractId);
  const installments = await getContractInstallments(contractId);
  const refsToDelete = [];

  for (const inst of installments) {
    const paymentsSnap = await getDocs(
      collection(db, COLLECTION, contractId, 'installments', inst.id, 'payments')
    );
    paymentsSnap.docs.forEach((paymentDoc) => {
      refsToDelete.push(
        doc(db, COLLECTION, contractId, 'installments', inst.id, 'payments', paymentDoc.id)
      );
    });
    refsToDelete.push(doc(db, COLLECTION, contractId, 'installments', inst.id));
  }

  items.forEach((item) => {
    refsToDelete.push(doc(db, COLLECTION, contractId, 'items', item.id));
  });
  refsToDelete.push(doc(db, COLLECTION, contractId));

  for (let i = 0; i < refsToDelete.length; i += 500) {
    const batch = writeBatch(db);
    refsToDelete.slice(i, i + 500).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  if (user) {
    await createAuditLog({
      action: 'contract_deleted',
      entityType: 'contract',
      entityId: contractId,
      previousData: {
        title: contract.title,
        clientName: contract.clientName,
        totalAmount: contract.totalAmount,
      },
      user,
    });
  }

  invalidateContractsCache();
}
