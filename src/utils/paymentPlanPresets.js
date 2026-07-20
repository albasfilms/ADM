import { INSTALLMENT_STATUS, PAYMENT_PLAN_TYPES } from './constants.js';

export function contractHasRecordedPayments(installments = []) {
  return installments.some(
    (i) =>
      (i.paidAmount || 0) > 0 ||
      i.status === INSTALLMENT_STATUS.PAID ||
      i.status === INSTALLMENT_STATUS.PARTIAL
  );
}

export function resolvePaymentPlanType(contract, installments = []) {
  if (contract?.paymentPlanType) {
    return contract.paymentPlanType;
  }

  if (!contract) return PAYMENT_PLAN_TYPES.ENTRY_BEFORE_WEDDING;

  const entryPercent = Number(contract.entryPercent) || 0;
  const installmentCount = Number(contract.installmentCount) || 0;
  const regularInstallments = installments.filter((i) => i.number > 0);
  const hasEntry = installments.some((i) => i.number === 0);

  if (entryPercent >= 100 && regularInstallments.length === 0) {
    return PAYMENT_PLAN_TYPES.CASH;
  }

  const cardHint = installments.some((i) =>
    (i.description || '').toLowerCase().includes('cartão')
  );

  if (
    entryPercent === 0 &&
    !hasEntry &&
    (cardHint || regularInstallments.length <= 1 || (installmentCount >= 1 && installmentCount <= 10))
  ) {
    return PAYMENT_PLAN_TYPES.CREDIT_CARD;
  }

  return PAYMENT_PLAN_TYPES.ENTRY_BEFORE_WEDDING;
}

export function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function subtractMonths(date, months) {
  return addMonths(date, -months);
}

export function toDateInputString(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseFormDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getFirstDueBeforeEvent(eventDate, installmentCount) {
  if (!eventDate || !installmentCount) return null;
  return subtractMonths(eventDate, installmentCount);
}

export function getPaymentPlanParams({ planType, totalCents, data }) {
  const closingDate = parseFormDate(data.closingDate) || new Date();
  const eventDate = parseFormDate(data.eventDate);
  const firstDueFromForm = parseFormDate(data.firstDueDate);

  if (planType === PAYMENT_PLAN_TYPES.CASH) {
    const paymentDate = firstDueFromForm || closingDate;
    return {
      entryPercent: 100,
      entryAmountCents: totalCents,
      installmentCount: 0,
      firstDueDate: paymentDate,
      intervalMonths: 1,
      entryDueDate: paymentDate,
    };
  }

  if (planType === PAYMENT_PLAN_TYPES.CREDIT_CARD) {
    const cardInstallmentCount = Math.min(10, Math.max(1, parseInt(data.installmentCount, 10) || 10));
    return {
      entryPercent: 0,
      entryAmountCents: null,
      installmentCount: 0,
      cardInstallmentCount,
      firstDueDate: closingDate,
      intervalMonths: 1,
      entryDueDate: closingDate,
    };
  }

  const installmentCount = Math.max(1, parseInt(data.installmentCount, 10) || 4);
  const firstDueDate =
    getFirstDueBeforeEvent(eventDate, installmentCount) || firstDueFromForm || new Date();

  return {
    entryPercent: parseFloat(data.entryPercent) || 30,
    entryAmountCents: data.entryAmount || null,
    installmentCount,
    firstDueDate,
    intervalMonths: parseInt(data.installmentIntervalMonths, 10) || 1,
    entryDueDate: closingDate,
  };
}
