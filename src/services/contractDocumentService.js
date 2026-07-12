import { BRAND_LOGO } from '../utils/brandAssets.js';
import { formatCurrency } from '../utils/currency.js';
import { formatDate } from '../utils/dates.js';
import {
  CONTRACT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  PERSON_TYPE_LABELS,
  SERVICE_TYPE_LABELS,
} from '../utils/constants.js';
import { resolveContractEventType } from '../utils/contractEventType.js';
import { formatDocument, formatPhone } from '../utils/validators.js';

export const DEFAULT_COMPANY = {
  name: 'Albas Films',
  legalName: 'Albas Films Produções Audiovisuais',
  document: '',
  address: 'Curitiba, PR',
  email: '',
  phone: '',
  logoUrl: BRAND_LOGO,
};

function getValue(context, path) {
  return path.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), context);
}

function formatOptional(value, fallback = '—') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function buildFullLocation(contract) {
  const parts = [contract.eventLocation, contract.city, contract.state].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

function buildInstallmentNumberLabel(number) {
  if (number === 0) return 'Entrada';
  return `Parcela ${number}`;
}

export function buildContractDocumentContext({ contract, client, items = [], installments = [], company = DEFAULT_COMPANY }) {
  const today = new Date();
  const todayFormatted = formatDate(today);

  const clientContext = {
    name: formatOptional(client?.name || contract.clientName),
    personTypeLabel: PERSON_TYPE_LABELS[client?.personType] || 'Pessoa física',
    documentFormatted: client?.document
      ? formatDocument(client.document, client.personType)
      : '—',
    phoneFormatted: client?.phone ? formatPhone(client.phone) : '—',
    whatsappFormatted: client?.whatsapp ? formatPhone(client.whatsapp) : '—',
    email: formatOptional(client?.email),
    instagram: formatOptional(client?.instagram),
    address: formatOptional(client?.address),
    city: formatOptional(client?.city),
    state: formatOptional(client?.state),
    notes: formatOptional(client?.notes, ''),
  };

  const contractContext = {
    title: formatOptional(contract.title),
    description: formatOptional(contract.description, ''),
    eventTypeLabel: EVENT_TYPE_LABELS[resolveContractEventType(contract)] || '—',
    serviceTypeLabel: EVENT_TYPE_LABELS[resolveContractEventType(contract)] || '—',
    eventDateFormatted: formatDate(contract.eventDate),
    eventTime: formatOptional(contract.eventTime),
    eventLocation: formatOptional(contract.eventLocation),
    city: formatOptional(contract.city),
    state: formatOptional(contract.state),
    fullLocation: buildFullLocation(contract),
    closingDateFormatted: formatDate(contract.closingDate),
    totalAmountFormatted: formatCurrency(contract.totalAmount || 0),
    entryAmountFormatted: formatCurrency(contract.entryAmount || 0),
    entryPercent: contract.entryPercent ?? 0,
    entryPaymentMethodLabel:
      PAYMENT_METHOD_LABELS[contract.entryPaymentMethod] || formatOptional(contract.entryPaymentMethod),
    installmentCount: contract.installmentCount ?? 0,
    notes: formatOptional(contract.notes, ''),
    statusLabel: CONTRACT_STATUS_LABELS[contract.status] || contract.status || '—',
  };

  const itemsContext = [...items]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((item) => ({
      serviceLabel: SERVICE_TYPE_LABELS[item.serviceType] || item.serviceType || 'Serviço',
      description: formatOptional(item.description),
      amountFormatted: formatCurrency(item.amount || 0),
    }));

  const installmentsContext = [...installments]
    .sort((a, b) => a.number - b.number)
    .map((inst) => ({
      number: inst.number,
      numberLabel: buildInstallmentNumberLabel(inst.number),
      description: formatOptional(inst.description),
      expectedAmountFormatted: formatCurrency(inst.expectedAmount || 0),
      dueDateFormatted: formatDate(inst.dueDate),
    }));

  const itemsListText = itemsContext
    .map((item) => `${item.serviceLabel} — ${item.description} — ${item.amountFormatted}`)
    .join('\n');

  const installmentsListText = installmentsContext
    .map((inst) => `${inst.numberLabel} — ${inst.dueDateFormatted} — ${inst.expectedAmountFormatted}`)
    .join('\n');

  return {
    company: { ...DEFAULT_COMPANY, ...company },
    client: clientContext,
    contract: contractContext,
    items: itemsContext,
    installments: installmentsContext,
    itemsList: itemsListText,
    installmentsList: installmentsListText,
    todayFormatted,
    today: todayFormatted,
  };
}

function renderSimple(template, context) {
  return template.replace(/\{\{([^#/][^}]*)\}\}/g, (match, rawPath) => {
    const path = rawPath.trim();
    const value = getValue(context, path);
    if (value == null) return '';
    return String(value);
  });
}

function renderLoops(template, context) {
  return template.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (match, key, block) => {
    const list = context[key];
    if (!Array.isArray(list) || list.length === 0) return '';
    return list.map((item) => renderTemplate(block, { ...context, ...item })).join('');
  });
}

export function renderContractTemplate(html, context) {
  if (!html) return '';
  const withLoops = renderLoops(html, context);
  return renderSimple(withLoops, context);
}

export function getContractPrintStyles() {
  return `
    @page { margin: 2cm; size: A4; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #111;
      background: #fff;
    }
    .contract-doc { max-width: 18cm; margin: 0 auto; }
    .contract-doc__header { text-align: center; margin-bottom: 2rem; }
    .contract-doc__logo { max-height: 72px; margin-bottom: 1rem; }
    .contract-doc__title { font-size: 14pt; margin: 0 0 0.5rem; text-transform: uppercase; }
    .contract-doc__subtitle { margin: 0; font-size: 11pt; color: #444; }
    h2 { font-size: 12pt; margin: 1.5rem 0 0.5rem; text-transform: uppercase; }
    p { margin: 0 0 0.75rem; text-align: justify; }
    .contract-doc__list { margin: 0 0 1rem 1.25rem; padding: 0; }
    .contract-doc__list li { margin-bottom: 0.35rem; }
    .contract-doc__closing { margin-top: 1.5rem; }
    .contract-doc__date { margin-top: 2rem; }
    .contract-doc__signatures {
      display: flex;
      justify-content: space-between;
      gap: 2rem;
      margin-top: 4rem;
      page-break-inside: avoid;
    }
    .contract-doc__signature { flex: 1; text-align: center; }
    .contract-doc__signature-line {
      border-top: 1px solid #111;
      margin: 3rem 0 0.5rem;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

export function openContractDocumentPrint(html, title = 'Contrato') {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) {
    throw new Error('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.');
  }

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>${getContractPrintStyles()}</style>
</head>
<body>${html}</body>
</html>`);
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };

  return printWindow;
}

export async function generateContractDocumentHtml({ templateHtml, contract, client, items, installments, company }) {
  const context = buildContractDocumentContext({ contract, client, items, installments, company });
  return renderContractTemplate(templateHtml, context);
}
