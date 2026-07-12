import { collection, getDocs, query, orderBy, limit, collectionGroup } from 'firebase/firestore';
import { db } from '../firebase/config.js';
import {
  CLIENT_STATUS,
  CONTRACT_STATUS,
  EVENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../utils/constants.js';
import { resolveContractEventType } from '../utils/contractEventType.js';
import { formatCurrency } from '../utils/currency.js';
import { formatDate } from '../utils/dates.js';
import { getContractInstallments } from './contractService.js';
import { getRecentPayments } from './paymentService.js';
import { isInstallmentOverdue, toJsDate } from '../utils/installmentStatus.js';
import { buildMonthlyExpected, buildMonthlyReceived } from '../utils/monthlyCharts.js';

export async function getReportData(filters = {}) {
  const contractsSnap = await getDocs(
    query(collection(db, 'contracts'), orderBy('createdAt', 'desc'), limit(500))
  );

  let contracts = contractsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (filters.status && filters.status !== 'all') {
    contracts = contracts.filter((c) => c.status === filters.status);
  }

  if (filters.clientId && filters.clientId !== 'all') {
    contracts = contracts.filter((c) => c.clientId === filters.clientId);
  }

  if (filters.eventType && filters.eventType !== 'all') {
    contracts = contracts.filter((c) => resolveContractEventType(c) === filters.eventType);
  }

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    contracts = contracts.filter((c) => {
      const created = toJsDate(c.createdAt);
      return created && created >= from;
    });
  }

  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    contracts = contracts.filter((c) => {
      const created = toJsDate(c.createdAt);
      return created && created <= to;
    });
  }

  const nonCancelled = contracts.filter((c) => c.status !== CONTRACT_STATUS.CANCELLED);

  const contracted = nonCancelled.reduce((s, c) => s + (c.totalAmount || 0), 0);
  const received = nonCancelled.reduce((s, c) => s + (c.receivedAmount || 0), 0);
  const pending = nonCancelled.reduce((s, c) => s + (c.pendingAmount || 0), 0);
  const overdue = nonCancelled.reduce((s, c) => s + (c.overdueAmount || 0), 0);
  const avgTicket = nonCancelled.length ? Math.round(contracted / nonCancelled.length) : 0;

  const paymentsSnap = await getDocs(query(collectionGroup(db, 'payments'), limit(500)));
  let payments = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (filters.paymentMethod && filters.paymentMethod !== 'all') {
    payments = payments.filter((p) => p.paymentMethod === filters.paymentMethod);
  }

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    payments = payments.filter((p) => {
      const date = toJsDate(p.paymentDate);
      return date && date >= from;
    });
  }

  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    payments = payments.filter((p) => {
      const date = toJsDate(p.paymentDate);
      return date && date <= to;
    });
  }

  const byPaymentMethod = {};
  payments.forEach((p) => {
    const key = p.paymentMethod || 'other';
    byPaymentMethod[key] = (byPaymentMethod[key] || 0) + (p.amount || 0);
  });

  const byEventType = {};
  nonCancelled.forEach((c) => {
    const key = resolveContractEventType(c);
    byEventType[key] = (byEventType[key] || 0) + (c.receivedAmount || 0);
  });

  const clientIds = new Set(nonCancelled.map((c) => c.clientId));

  return {
    summary: {
      contracted,
      received,
      pending,
      overdue,
      avgTicket,
      contractCount: nonCancelled.length,
      clientCount: clientIds.size,
    },
    byPaymentMethod,
    byEventType,
    contracts: nonCancelled,
    payments,
  };
}

export async function getReportAnalytics() {
  const [clientsSnap, contractsSnap] = await Promise.all([
    getDocs(collection(db, 'clients')),
    getDocs(query(collection(db, 'contracts'), orderBy('createdAt', 'desc'), limit(500))),
  ]);

  let recentPayments = [];
  try {
    recentPayments = await getRecentPayments(10);
  } catch (error) {
    console.warn('[Reports] Pagamentos recentes indisponíveis:', error);
  }

  const clients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const contracts = contractsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const nonCancelled = contracts.filter((c) => c.status !== CONTRACT_STATUS.CANCELLED);

  const activeClients = clients.filter((c) => c.status === CLIENT_STATUS.ACTIVE).length;
  const activeContracts = contracts.filter(
    (c) => c.status !== CONTRACT_STATUS.CANCELLED && c.status !== CONTRACT_STATUS.PAID_OFF
  ).length;
  const paidOffContracts = contracts.filter((c) => c.status === CONTRACT_STATUS.PAID_OFF).length;
  const totalContracted = nonCancelled.reduce((s, c) => s + (c.totalAmount || 0), 0);

  const allInstallments = [];
  for (const contract of nonCancelled.slice(0, 100)) {
    const installments = await getContractInstallments(contract.id);
    installments.forEach((inst) => {
      allInstallments.push({ contract, installment: inst });
    });
  }

  const overdueAll = allInstallments.filter(({ installment }) =>
    isInstallmentOverdue(installment)
  );
  const overdueInstallments = overdueAll.slice(0, 10);

  const recentContracts = nonCancelled.slice(0, 8);

  return {
    operational: {
      totalContracted,
      activeClients,
      activeContracts,
      paidOffContracts,
      overdueCount: overdueAll.length,
    },
    charts: {
      monthlyReceived: buildMonthlyReceived(recentPayments),
      monthlyExpected: buildMonthlyExpected(allInstallments),
    },
    recentPayments,
    recentContracts,
    overdueInstallments,
  };
}

export function exportToCSV(rows, filename = 'relatorio.csv') {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(';'),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h] ?? '';
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(';')
    ),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function contractsToCSV(contracts) {
  return contracts.map((c) => ({
    Cliente: c.clientName,
    Contrato: c.title,
    Modelo: EVENT_TYPE_LABELS[resolveContractEventType(c)] || resolveContractEventType(c),
    Status: c.status,
    'Valor total': formatCurrency(c.totalAmount),
    Recebido: formatCurrency(c.receivedAmount),
    Pendente: formatCurrency(c.pendingAmount),
    Vencido: formatCurrency(c.overdueAmount),
    'Data evento': formatDate(c.eventDate),
    'Criado em': formatDate(c.createdAt),
  }));
}

export function paymentsToCSV(payments, contractsMap = {}) {
  return payments.map((p) => ({
    Cliente: contractsMap[p.contractId]?.clientName || p.clientId,
    Contrato: contractsMap[p.contractId]?.title || p.contractId,
    Valor: formatCurrency(p.amount),
    Data: formatDate(p.paymentDate),
    'Forma de pagamento': PAYMENT_METHOD_LABELS[p.paymentMethod] || p.paymentMethod,
    Observações: p.notes || '',
  }));
}
