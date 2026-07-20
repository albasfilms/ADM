import { formatCurrency } from './currency.js';
import { formatDate } from './dates.js';
import { EVENT_TYPE_LABELS } from './constants.js';
import { resolveContractEventType } from './contractEventType.js';
import { escapeHtml } from './dom.js';
import { formatPhone } from './validators.js';
import {
  getInstallmentRemaining,
  isDueToday,
  isInstallmentOverdue,
  toJsDate,
  startOfDay,
} from './installmentStatus.js';

function getFirstName(name = '') {
  return name.trim().split(/\s+/)[0] || name;
}

function getInstallmentLabel(installment, capitalized = false) {
  if (installment.number === 0) {
    return capitalized ? 'Entrada' : 'entrada';
  }
  return capitalized ? `Parcela ${installment.number}` : `parcela ${installment.number}`;
}

export function buildInstallmentCollectionMessage({ client, contract, installment }) {
  const firstName = getFirstName(client?.name || contract.clientName || '');
  const label = getInstallmentLabel(installment, true);
  const remaining = getInstallmentRemaining(installment);
  const dueDate = formatDate(installment.dueDate);
  const amount = formatCurrency(remaining);
  const contractTitle = contract.title;

  if (isInstallmentOverdue(installment)) {
    return `Olá, ${firstName}! Tudo bem?

Espero que esteja tudo ótimo por aí! Passando para lembrar gentilmente que a ${label} do seu contrato com a Albas Films (${contractTitle}) venceu em ${dueDate}, no valor de ${amount}.

Se já realizou o pagamento, pode desconsiderar esta mensagem. Caso ainda não tenha conseguido, fico à disposição para ajudar com qualquer dúvida ou combinar a melhor forma de pagamento.

Um abraço!`;
  }

  if (isDueToday(installment)) {
    return `Olá, ${firstName}! Tudo bem?

Só passando para lembrar que a ${label} do seu contrato com a Albas Films (${contractTitle}) vence hoje, ${dueDate}, no valor de ${amount}.

Qualquer dúvida sobre o pagamento, é só me chamar. Estou à disposição!

Um abraço!`;
  }

  return `Olá, ${firstName}! Tudo bem?

Passando para avisar que a ${label} do seu contrato com a Albas Films (${contractTitle}) está chegando — vencimento em ${dueDate}, no valor de ${amount}.

Se precisar de algo ou tiver alguma dúvida, é só me chamar. Fico à disposição!

Um abraço!`;
}

export function buildWhatsAppSummary({ client, contract, installments }) {
  const pending = (contract.totalAmount || 0) - (contract.receivedAmount || 0);
  const serviceLabel = EVENT_TYPE_LABELS[resolveContractEventType(contract)] || contract.title;

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

function normalizeBrazilPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return `55${digits}`;
}

export function buildWhatsAppHref(phone, message = '') {
  const digits = normalizeBrazilPhone(phone);
  if (!digits) return '';
  const url = `https://wa.me/${digits}`;
  return message ? `${url}?text=${encodeURIComponent(message)}` : url;
}

export function renderWhatsAppContactLink(phone) {
  if (!phone) return '—';
  const formatted = formatPhone(phone);
  const href = buildWhatsAppHref(phone);
  return `<a href="${href}" target="_blank" rel="noopener" class="link">${escapeHtml(formatted)}</a>`;
}

export function openWhatsApp(phone, message) {
  const url = buildWhatsAppHref(phone, message);
  if (!url) return;
  window.open(url, '_blank', 'noopener');
}
