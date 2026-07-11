import { INSTALLMENT_STATUS } from './constants.js';

export function calculateEntryAmount(totalCents, entryPercent, entryAmountCents) {
  if (entryAmountCents != null && entryAmountCents > 0) {
    return Math.min(entryAmountCents, totalCents);
  }

  if (entryPercent != null && entryPercent > 0) {
    return Math.round(totalCents * entryPercent / 100);
  }

  return 0;
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function calculatePaymentPlan({
  totalCents,
  entryPercent = 0,
  entryAmountCents = null,
  installmentCount = 0,
  firstDueDate = new Date(),
  intervalMonths = 1,
  entryDueDate = new Date(),
}) {
  const entry = calculateEntryAmount(totalCents, entryPercent, entryAmountCents);
  const remaining = totalCents - entry;
  const count = Math.max(0, Number(installmentCount) || 0);
  const installments = [];

  if (entry > 0) {
    installments.push({
      number: 0,
      description: 'Entrada',
      expectedAmount: entry,
      dueDate: new Date(entryDueDate),
      status: INSTALLMENT_STATUS.PENDING,
      paidAmount: 0,
    });
  }

  if (count > 0 && remaining > 0) {
    const baseAmount = Math.floor(remaining / count);
    let distributed = 0;

    for (let i = 0; i < count; i += 1) {
      const isLast = i === count - 1;
      const amount = isLast ? remaining - distributed : baseAmount;
      distributed += amount;

      installments.push({
        number: i + 1,
        description: `Parcela ${i + 1}`,
        expectedAmount: amount,
        dueDate: addMonths(firstDueDate, i * intervalMonths),
        status: INSTALLMENT_STATUS.PENDING,
        paidAmount: 0,
      });
    }
  } else if (remaining > 0 && count === 0) {
    installments.push({
      number: 1,
      description: 'Saldo restante',
      expectedAmount: remaining,
      dueDate: new Date(firstDueDate),
      status: INSTALLMENT_STATUS.PENDING,
      paidAmount: 0,
    });
  }

  return installments;
}

export function validatePaymentPlan(totalCents, installments) {
  const sum = installments.reduce((acc, item) => acc + item.expectedAmount, 0);
  return sum === totalCents;
}

export function getInstallmentSummary(installments) {
  const total = installments.reduce((acc, i) => acc + i.expectedAmount, 0);
  const entry = installments.find((i) => i.number === 0)?.expectedAmount || 0;
  const parcelTotal = total - entry;

  return { total, entry, parcelTotal, count: installments.filter((i) => i.number > 0).length };
}
