import { formatCurrency } from './currency.js';
import { formatDate } from './dates.js';
import { SERVICE_TYPE_LABELS } from './constants.js';
import {
  getInstallmentRemaining,
  toJsDate,
  startOfDay,
} from './installmentStatus.js';

export function buildWhatsAppSummary({ client, contract, installments }) {
  const pending = (contract.totalAmount || 0) - (contract.receivedAmount || 0);
  const serviceLabel = SERVICE_TYPE_LABELS[contract.serviceType] || contract.title;

  const upcoming = installments
    .filter((inst) => getInstallmentRemaining(inst) > 0)
    .sort((a, b) => toJsDate(a.dueDate) - toJsDate(b.dueDate))[0];

  let nextDueText = 'Nenhuma parcela pendente.';
  if (upcoming) {
    const label = upcoming.number === 0 ? 'Entrada' : `Parcela ${upcoming.number}`;
    nextDueText = `${label} — ${formatDate(upcoming.dueDate)} — ${formatCurrency(getInstallmentRemaining(upcoming))}`;
  }

  return `Olá, ${client?.name || contract.clientName}! Tudo bem?

Segue o resumo financeiro do seu contrato com a Albas Films:

Serviço: ${serviceLabel}
Valor total: ${formatCurrency(contract.totalAmount)}
Valor recebido: ${formatCurrency(contract.receivedAmount)}
Saldo pendente: ${formatCurrency(pending)}

Próximo vencimento:
${nextDueText}

Qualquer dúvida, estamos à disposição.`;
}

export async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

export function openWhatsApp(phone, message) {
  const digits = String(phone).replace(/\D/g, '');
  const url = `https://wa.me/55${digits}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener');
}
