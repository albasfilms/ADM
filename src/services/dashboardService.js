import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/config.js';
import { CONTRACT_STATUS } from '../utils/constants.js';
import {
  isDueToday,
  isDueWithinDays,
  isInstallmentOverdue,
  getInstallmentRemaining,
  toJsDate,
  startOfDay,
} from '../utils/installmentStatus.js';
import { getContractInstallments } from './contractService.js';

function getMonthRange(year, month) {
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0, 23, 59, 59, 999),
  };
}

function isDateInMonth(value, year, month) {
  const date = toJsDate(value);
  if (!date) return false;
  const { start, end } = getMonthRange(year, month);
  return date >= start && date <= end;
}

export async function getDashboardData() {
  const contractsSnap = await getDocs(
    query(collection(db, 'contracts'), orderBy('createdAt', 'desc'), limit(500))
  );

  const contracts = contractsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const nonCancelled = contracts.filter((c) => c.status !== CONTRACT_STATUS.CANCELLED);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const totalPending = nonCancelled.reduce((s, c) => s + (c.pendingAmount || 0), 0);
  const totalOverdue = nonCancelled.reduce((s, c) => s + (c.overdueAmount || 0), 0);

  const allInstallments = [];
  for (const contract of nonCancelled.slice(0, 100)) {
    const installments = await getContractInstallments(contract.id);
    installments.forEach((inst) => {
      allInstallments.push({ contract, installment: inst });
    });
  }

  const { start: monthStart, end: monthEnd } = getMonthRange(currentYear, currentMonth);

  const expectedThisMonth = allInstallments.reduce((sum, { installment }) => {
    const due = toJsDate(installment.dueDate);
    const remaining = getInstallmentRemaining(installment);
    if (!due || remaining <= 0) return sum;
    if (due >= monthStart && due <= monthEnd) return sum + remaining;
    return sum;
  }, 0);

  const closedThisMonthContracts = nonCancelled.filter((c) =>
    isDateInMonth(c.closingDate, currentYear, currentMonth)
  );

  const pendingContracts = nonCancelled
    .filter((c) => (c.pendingAmount || 0) > 0)
    .sort((a, b) => (b.pendingAmount || 0) - (a.pendingAmount || 0));

  const overdueContracts = nonCancelled
    .filter((c) => (c.overdueAmount || 0) > 0)
    .sort((a, b) => (b.overdueAmount || 0) - (a.overdueAmount || 0));

  const expectedThisMonthInstallments = allInstallments
    .filter(({ installment }) => {
      const due = toJsDate(installment.dueDate);
      const remaining = getInstallmentRemaining(installment);
      return due && remaining > 0 && due >= monthStart && due <= monthEnd;
    })
    .sort((a, b) => toJsDate(a.installment.dueDate) - toJsDate(b.installment.dueDate));

  const dueInstallments = allInstallments
    .filter(({ installment }) => getInstallmentRemaining(installment) > 0)
    .sort((a, b) => toJsDate(a.installment.dueDate) - toJsDate(b.installment.dueDate));

  const overdueInstallments = allInstallments.filter(({ installment }) =>
    isInstallmentOverdue(installment)
  );

  const dueToday = allInstallments.filter(({ installment }) => isDueToday(installment));
  const dueWeek = allInstallments.filter(({ installment }) => isDueWithinDays(installment, 7));
  const awaitingEntry = contracts.filter((c) => c.status === CONTRACT_STATUS.AWAITING_ENTRY);

  const eventsSoon = contracts.filter((c) => {
    const event = toJsDate(c.eventDate);
    if (!event) return false;
    const today = startOfDay();
    const limitDate = new Date(today);
    limitDate.setDate(limitDate.getDate() + 7);
    return startOfDay(event) >= today && startOfDay(event) <= limitDate;
  });

  const eventsThisMonth = nonCancelled
    .filter((c) => isDateInMonth(c.eventDate, currentYear, currentMonth))
    .sort((a, b) => {
      const aDate = toJsDate(a.eventDate);
      const bDate = toJsDate(b.eventDate);
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return aDate - bDate;
    });

  return {
    metrics: {
      totalPending,
      totalOverdue,
      expectedThisMonth,
      closedThisMonthCount: closedThisMonthContracts.length,
    },
    details: {
      pendingContracts,
      overdueContracts,
      expectedThisMonthInstallments,
      closedThisMonthContracts,
    },
    dueInstallments,
    eventsThisMonth,
    alerts: {
      dueToday,
      dueWeek,
      overdue: overdueInstallments,
      awaitingEntry,
      eventsSoon,
    },
  };
}
