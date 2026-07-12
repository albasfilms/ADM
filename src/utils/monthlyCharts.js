import { toJsDate, getInstallmentRemaining } from './installmentStatus.js';

export function buildMonthlyReceived(payments) {
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

  return toChartSeries(months);
}

export function buildMonthlyExpected(allInstallments) {
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

  return toChartSeries(months);
}

function toChartSeries(months) {
  return Object.entries(months).map(([key, value]) => {
    const [year, month] = key.split('-');
    const label = new Date(year, month - 1).toLocaleDateString('pt-BR', {
      month: 'short',
      year: '2-digit',
    });
    return { label, value };
  });
}
