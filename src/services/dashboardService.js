import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/config.js';
import { CLIENT_STATUS, CONTRACT_STATUS } from '../utils/constants.js';
import {
  isDueToday,
  isDueWithinDays,
  isInstallmentOverdue,
  getInstallmentRemaining,
  toJsDate,
  startOfDay,
} from '../utils/installmentStatus.js';
import { getContractInstallments } from './contractService.js';
import { getRecentPayments } from './paymentService.js';

const ACTIVE_CONTRACT_STATUSES = [
  CONTRACT_STATUS.CONFIRMED,
  CONTRACT_STATUS.IN_PROGRESS,
  CONTRACT_STATUS.AWAITING_ENTRY,
  CONTRACT_STATUS.AWAITING_SIGNATURE,
  CONTRACT_STATUS.FINISHED,
  CONTRACT_STATUS.PAID_OFF,
  CONTRACT_STATUS.BUDGET,
];

export async function getDashboardData() {
  const [clientsSnap, contractsSnap] = await Promise.all([
    getDocs(collection(db, 'clients')),
    getDocs(query(collection(db, 'contracts'), orderBy('createdAt', 'desc'), limit(500))),
  ]);

  let recentPayments = [];
  try {
    recentPayments = await getRecentPayments(8);
  } catch (error) {
    console.warn('[Dashboard] Pagamentos recentes indisponíveis:', error);
  }

  const clients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const contracts = contractsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const activeClients = clients.filter((c) => c.status === CLIENT_STATUS.ACTIVE).length;
  const activeContracts = contracts.filter(
    (c) => c.status !== CONTRACT_STATUS.CANCELLED && c.status !== CONTRACT_STATUS.PAID_OFF
  ).length;
  const paidOffContracts = contracts.filter((c) => c.status === CONTRACT_STATUS.PAID_OFF).length;

  const nonCancelled = contracts.filter((c) => c.status !== CONTRACT_STATUS.CANCELLED);

  const totalContracted = nonCancelled.reduce((s, c) => s + (c.totalAmount || 0), 0);
  const totalReceived = nonCancelled.reduce((s, c) => s + (c.receivedAmount || 0), 0);
  const totalPending = nonCancelled.reduce((s, c) => s + (c.pendingAmount || 0), 0);
  const totalOverdue = nonCancelled.reduce((s, c) => s + (c.overdueAmount || 0), 0);

  const allInstallments = [];
  for (const contract of nonCancelled.slice(0, 100)) {
    const installments = await getContractInstallments(contract.id);
    installments.forEach((inst) => {
      allInstallments.push({ contract, installment: inst });
    });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const expectedThisMonth = allInstallments.reduce((sum, { installment }) => {
    const due = toJsDate(installment.dueDate);
    const remaining = getInstallmentRemaining(installment);
    if (!due || remaining <= 0) return sum;
    if (due >= monthStart && due <= monthEnd) return sum + remaining;
    return sum;
  }, 0);

  const overdueInstallments = allInstallments.filter(({ installment }) =>
    isInstallmentOverdue(installment)
  );

  const upcomingDue = allInstallments
    .filter(({ installment }) => isDueWithinDays(installment, 30))
    .sort((a, b) => toJsDate(a.installment.dueDate) - toJsDate(b.installment.dueDate))
    .slice(0, 8);

  const dueToday = allInstallments.filter(({ installment }) => isDueToday(installment));
  const dueWeek = allInstallments.filter(({ installment }) => isDueWithinDays(installment, 7));
  const awaitingEntry = contracts.filter((c) => c.status === CONTRACT_STATUS.AWAITING_ENTRY);

  const eventsSoon = contracts.filter((c) => {
    const event = toJsDate(c.eventDate);
    if (!event) return false;
    const today = startOfDay();
    const limit = new Date(today);
    limit.setDate(limit.getDate() + 7);
    return startOfDay(event) >= today && startOfDay(event) <= limit;
  });

  const recentContracts = contracts
    .filter((c) => c.status !== CONTRACT_STATUS.CANCELLED)
    .slice(0, 5);

  const monthlyReceived = buildMonthlySeries(recentPayments, 'received');
  const monthlyExpected = buildMonthlyExpected(allInstallments);

  return {
    metrics: {
      totalContracted,
      totalReceived,
      totalPending,
      totalOverdue,
      expectedThisMonth,
      activeClients,
      activeContracts,
      overdueCount: overdueInstallments.length,
      paidOffContracts,
    },
    upcomingDue,
    overdueInstallments: overdueInstallments.slice(0, 8),
    recentPayments,
    recentContracts,
    alerts: {
      dueToday,
      dueWeek,
      overdue: overdueInstallments,
      awaitingEntry,
      eventsSoon,
    },
    charts: {
      monthlyReceived,
      monthlyExpected,
    },
  };
}

function buildMonthlySeries(payments, type) {
  const months = {};
  const now = new Date();

  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months[key] = 0;
  }

  payments.forEach((payment) => {
    const date = toJsDate(payment.paymentDate || payment.createdAt);
    if (!date) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (months[key] !== undefined) {
      months[key] += payment.amount || 0;
    }
  });

  return Object.entries(months).map(([key, value]) => {
    const [year, month] = key.split('-');
    const label = new Date(year, month - 1).toLocaleDateString('pt-BR', {
      month: 'short',
      year: '2-digit',
    });
    return { label, value };
  });
}

function buildMonthlyExpected(allInstallments) {
  const months = {};
  const now = new Date();

  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months[key] = 0;
  }

  allInstallments.forEach(({ installment }) => {
    const due = toJsDate(installment.dueDate);
    const remaining = getInstallmentRemaining(installment);
    if (!due || remaining <= 0) return;
    const key = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}`;
    if (months[key] !== undefined) months[key] += remaining;
  });

  return Object.entries(months).map(([key, value]) => {
    const [year, month] = key.split('-');
    const label = new Date(year, month - 1).toLocaleDateString('pt-BR', {
      month: 'short',
      year: '2-digit',
    });
    return { label, value };
  });
}
