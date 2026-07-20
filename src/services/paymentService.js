import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
  collectionGroup,
  limit,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config.js';
import { CONTRACT_STATUS, INSTALLMENT_STATUS } from '../utils/constants.js';
import {
  calculateInstallmentStatus,
  recalculateContractFinancials,
} from '../utils/installmentStatus.js';
import { createAuditLog } from './auditService.js';
import { getContractById, getContractInstallmentsFresh } from './contractService.js';
import { parseDateInput } from '../utils/dates.js';
import { invalidateCache, invalidateCacheByPrefix } from '../utils/dataCache.js';

const CONTRACTS = 'contracts';

function invalidateFinancialCache(contractId) {
  invalidateCacheByPrefix('installments:');
  invalidateCacheByPrefix('contracts:');
  invalidateCacheByPrefix('dashboard:');
  invalidateCacheByPrefix('calendar:');
  invalidateCache(`installments:${contractId}`);
}

export async function getPaymentsForInstallment(contractId, installmentId) {
  const snapshot = await getDocs(
    collection(db, CONTRACTS, contractId, 'installments', installmentId, 'payments')
  );
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || a.paymentDate?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || b.paymentDate?.toMillis?.() || 0;
      return aTime - bTime;
    });
}

export async function updateContractTotals(contractId) {
  const contract = await getContractById(contractId);
  if (!contract) return;

  const installments = await getContractInstallmentsFresh(contractId);
  const batch = writeBatch(db);

  const refreshed = installments.map((inst) => {
    const status = calculateInstallmentStatus(
      inst.expectedAmount,
      inst.paidAmount || 0,
      inst.dueDate,
      inst.status
    );
    if (status !== inst.status) {
      batch.update(doc(db, CONTRACTS, contractId, 'installments', inst.id), { status });
    }
    return { ...inst, status };
  });

  const { receivedAmount, pendingAmount, overdueAmount } = recalculateContractFinancials(
    contract,
    refreshed
  );

  let status = contract.status;
  if (
    receivedAmount >= contract.totalAmount &&
    contract.totalAmount > 0 &&
    status !== CONTRACT_STATUS.CANCELLED &&
    status !== CONTRACT_STATUS.FINISHED
  ) {
    status = CONTRACT_STATUS.PAID_OFF;
  } else if (status === CONTRACT_STATUS.PAID_OFF && receivedAmount < contract.totalAmount) {
    status = CONTRACT_STATUS.CONFIRMED;
  }

  batch.update(doc(db, CONTRACTS, contractId), {
    receivedAmount,
    pendingAmount,
    overdueAmount,
    status,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  invalidateFinancialCache(contractId);
}

export async function registerPayment({
  contractId,
  installmentId,
  amount,
  paymentDate,
  paymentMethod,
  notes = '',
  user,
}) {
  if (!amount || amount <= 0) throw new Error('Informe um valor válido.');

  await runTransaction(db, async (transaction) => {
    const contractRef = doc(db, CONTRACTS, contractId);
    const installmentRef = doc(db, CONTRACTS, contractId, 'installments', installmentId);
    const paymentRef = doc(
      collection(db, CONTRACTS, contractId, 'installments', installmentId, 'payments')
    );

    const [contractSnap, installmentSnap] = await Promise.all([
      transaction.get(contractRef),
      transaction.get(installmentRef),
    ]);

    if (!contractSnap.exists() || !installmentSnap.exists()) {
      throw new Error('Contrato ou parcela não encontrados.');
    }

    const contract = contractSnap.data();
    const installment = installmentSnap.data();

    if (installment.status === INSTALLMENT_STATUS.CANCELLED) {
      throw new Error('Esta parcela está cancelada.');
    }

    const newPaidAmount = (installment.paidAmount || 0) + amount;
    const newStatus = calculateInstallmentStatus(
      installment.expectedAmount,
      newPaidAmount,
      installment.dueDate
    );

    transaction.set(paymentRef, {
      contractId,
      installmentId,
      clientId: contract.clientId,
      amount,
      paymentDate: Timestamp.fromDate(parseDateInput(paymentDate)),
      paymentMethod,
      notes: notes.trim(),
      createdBy: user.uid,
      createdByName: user.name || user.email,
      createdAt: serverTimestamp(),
    });

    transaction.update(installmentRef, {
      paidAmount: newPaidAmount,
      paymentMethod: paymentMethod || installment.paymentMethod || '',
      paymentDate:
        newStatus === INSTALLMENT_STATUS.PAID
          ? Timestamp.fromDate(parseDateInput(paymentDate))
          : installment.paymentDate || null,
      status: newStatus,
    });
  });

  await updateContractTotals(contractId);

  await createAuditLog({
    action: 'payment_registered',
    entityType: 'payment',
    entityId: installmentId,
    newData: { contractId, installmentId, amount, paymentDate, paymentMethod },
    user,
  });
}

export async function deletePayment({ contractId, installmentId, paymentId, user }) {
  const payments = await getPaymentsForInstallment(contractId, installmentId);
  const deletedPayment = payments.find((p) => p.id === paymentId);

  if (!deletedPayment) throw new Error('Pagamento não encontrado.');

  const newPaidAmount = payments
    .filter((p) => p.id !== paymentId)
    .reduce((sum, p) => sum + p.amount, 0);

  const installmentRef = doc(db, CONTRACTS, contractId, 'installments', installmentId);
  const installmentSnap = await getDoc(installmentRef);
  const installment = installmentSnap.data();

  const newStatus = calculateInstallmentStatus(
    installment?.expectedAmount,
    newPaidAmount,
    installment?.dueDate
  );

  await runTransaction(db, async (transaction) => {
    transaction.delete(
      doc(db, CONTRACTS, contractId, 'installments', installmentId, 'payments', paymentId)
    );
    transaction.update(installmentRef, {
      paidAmount: newPaidAmount,
      status: newStatus,
      paymentDate: newStatus === INSTALLMENT_STATUS.PAID ? installment?.paymentDate || null : null,
    });
  });

  await updateContractTotals(contractId);

  await createAuditLog({
    action: 'payment_deleted',
    entityType: 'payment',
    entityId: paymentId,
    previousData: deletedPayment,
    user,
  });
}

export async function getRecentPayments(limitCount = 10) {
  try {
    const snapshot = await getDocs(
      query(collectionGroup(db, 'payments'), limit(Math.max(limitCount * 5, 50)))
    );

    return snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || a.paymentDate?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || b.paymentDate?.toMillis?.() || 0;
        return bTime - aTime;
      })
      .slice(0, limitCount);
  } catch (error) {
    console.warn('[Payments] Erro ao listar pagamentos recentes:', error);
    return [];
  }
}
