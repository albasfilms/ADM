import { INSTALLMENT_STATUS } from './constants.js';

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toJsDate(value) {
  if (!value) return null;
  return value?.toDate ? value.toDate() : new Date(value);
}

export function calculateInstallmentStatus(expectedAmount, paidAmount, dueDate, manualStatus) {
  if (manualStatus === INSTALLMENT_STATUS.CANCELLED) {
    return INSTALLMENT_STATUS.CANCELLED;
  }

  const paid = paidAmount || 0;
  const expected = expectedAmount || 0;

  if (paid >= expected && expected > 0) {
    return INSTALLMENT_STATUS.PAID;
  }

  if (paid > 0 && paid < expected) {
    const due = toJsDate(dueDate);
    if (due && startOfDay(due) < startOfDay()) {
      return INSTALLMENT_STATUS.OVERDUE;
    }
    return INSTALLMENT_STATUS.PARTIAL;
  }

  const due = toJsDate(dueDate);
  if (due && startOfDay(due) < startOfDay()) {
    return INSTALLMENT_STATUS.OVERDUE;
  }

  return INSTALLMENT_STATUS.PENDING;
}

export function getInstallmentRemaining(installment) {
  return Math.max(0, (installment.expectedAmount || 0) - (installment.paidAmount || 0));
}

export function recalculateContractFinancials(contract, installments) {
  const activeInstallments = installments.filter(
    (i) => i.status !== INSTALLMENT_STATUS.CANCELLED
  );

  const receivedAmount = activeInstallments.reduce(
    (sum, i) => sum + (i.paidAmount || 0),
    0
  );

  const today = startOfDay();
  let overdueAmount = 0;

  activeInstallments.forEach((inst) => {
    const remaining = getInstallmentRemaining(inst);
    if (remaining <= 0) return;
    const due = toJsDate(inst.dueDate);
    if (due && startOfDay(due) < today) {
      overdueAmount += remaining;
    }
  });

  const pendingAmount = Math.max(0, (contract.totalAmount || 0) - receivedAmount);

  return { receivedAmount, pendingAmount, overdueAmount };
}

export function isInstallmentOverdue(installment) {
  const remaining = getInstallmentRemaining(installment);
  if (remaining <= 0) return false;
  const due = toJsDate(installment.dueDate);
  return due ? startOfDay(due) < startOfDay() : false;
}

export function isDueWithinDays(installment, days) {
  const remaining = getInstallmentRemaining(installment);
  if (remaining <= 0) return false;
  const due = toJsDate(installment.dueDate);
  if (!due) return false;

  const today = startOfDay();
  const limit = new Date(today);
  limit.setDate(limit.getDate() + days);
  const dueDay = startOfDay(due);

  return dueDay >= today && dueDay <= limit;
}

export function isDueToday(installment) {
  const remaining = getInstallmentRemaining(installment);
  if (remaining <= 0) return false;
  const due = toJsDate(installment.dueDate);
  if (!due) return false;
  return startOfDay(due).getTime() === startOfDay().getTime();
}
