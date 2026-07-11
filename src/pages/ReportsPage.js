import { getReportData, exportToCSV, contractsToCSV, paymentsToCSV } from '../services/reportService.js';
import { getActiveClients } from '../services/contractService.js';
import {
  CONTRACT_STATUS_LABELS,
  SERVICE_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../utils/constants.js';
import { formatCurrency } from '../utils/currency.js';
import { createSkeletonRows } from '../components/Skeleton.js';
import { renderIcons, showToast } from '../utils/dom.js';

let filters = {
  dateFrom: '',
  dateTo: '',
  clientId: 'all',
  serviceType: 'all',
  status: 'all',
  paymentMethod: 'all',
};

async function loadReport(container) {
  const summaryEl = container.querySelector('#report-summary');
  const breakdownEl = container.querySelector('#report-breakdown');
  const tableEl = container.querySelector('#report-table');

  summaryEl.innerHTML = '';
  summaryEl.appendChild(createSkeletonRows(2, 4));
  tableEl.innerHTML = '';

  try {
    const data = await getReportData(filters);
    const { summary } = data;

    summaryEl.innerHTML = `
      <div class="summary-grid">
        <div class="summary-card"><div class="summary-card__content"><span class="summary-card__label">Receita contratada</span><strong class="summary-card__value">${formatCurrency(summary.contracted)}</strong></div></div>
        <div class="summary-card"><div class="summary-card__content"><span class="summary-card__label">Receita recebida</span><strong class="summary-card__value">${formatCurrency(summary.received)}</strong></div></div>
        <div class="summary-card"><div class="summary-card__content"><span class="summary-card__label">Receita pendente</span><strong class="summary-card__value">${formatCurrency(summary.pending)}</strong></div></div>
        <div class="summary-card"><div class="summary-card__content"><span class="summary-card__label">Receita vencida</span><strong class="summary-card__value">${formatCurrency(summary.overdue)}</strong></div></div>
        <div class="summary-card"><div class="summary-card__content"><span class="summary-card__label">Ticket médio</span><strong class="summary-card__value">${formatCurrency(summary.avgTicket)}</strong></div></div>
        <div class="summary-card"><div class="summary-card__content"><span class="summary-card__label">Contratos</span><strong class="summary-card__value">${summary.contractCount}</strong></div></div>
        <div class="summary-card"><div class="summary-card__content"><span class="summary-card__label">Clientes</span><strong class="summary-card__value">${summary.clientCount}</strong></div></div>
      </div>
    `;

    const methodRows = Object.entries(data.byPaymentMethod)
      .map(([k, v]) => `<tr><td>${PAYMENT_METHOD_LABELS[k] || k}</td><td>${formatCurrency(v)}</td></tr>`)
      .join('');

    const serviceRows = Object.entries(data.byService)
      .map(([k, v]) => `<tr><td>${SERVICE_TYPE_LABELS[k] || k}</td><td>${formatCurrency(v)}</td></tr>`)
      .join('');

    breakdownEl.innerHTML = `
      <div class="detail-grid">
        <div class="card"><div class="card__header"><h3 class="card__title">Por forma de pagamento</h3></div>
          <div class="card__body"><table class="data-table"><tbody>${methodRows || '<tr><td colspan="2" class="text-muted">Sem dados</td></tr>'}</tbody></table></div>
        </div>
        <div class="card"><div class="card__header"><h3 class="card__title">Por tipo de serviço</h3></div>
          <div class="card__body"><table class="data-table"><tbody>${serviceRows || '<tr><td colspan="2" class="text-muted">Sem dados</td></tr>'}</tbody></table></div>
        </div>
      </div>
    `;

    tableEl.innerHTML = `
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead><tr><th>Cliente</th><th>Contrato</th><th>Total</th><th>Recebido</th><th>Pendente</th><th>Status</th></tr></thead>
          <tbody>
            ${data.contracts
              .slice(0, 50)
              .map(
                (c) => `
              <tr>
                <td>${c.clientName}</td>
                <td><a href="#/contratos/${c.id}" class="link">${c.title}</a></td>
                <td>${formatCurrency(c.totalAmount)}</td>
                <td>${formatCurrency(c.receivedAmount)}</td>
                <td>${formatCurrency(c.pendingAmount)}</td>
                <td>${CONTRACT_STATUS_LABELS[c.status] || c.status}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    container._reportData = data;
  } catch (error) {
    console.error('[Reports] Erro:', error);
    summaryEl.innerHTML = '<p class="text-error">Erro ao carregar relatório.</p>';
  }
}

export async function renderReportsPage(container) {
  const clients = await getActiveClients();

  container.innerHTML = `
    <div class="page-header page-header--with-action">
      <div>
        <h2 class="page-header__title">Relatórios</h2>
        <p class="page-header__subtitle">Análise financeira e exportação de dados</p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--secondary" id="export-contracts">Exportar contratos CSV</button>
        <button type="button" class="btn btn--secondary" id="export-payments">Exportar pagamentos CSV</button>
      </div>
    </div>

    <div class="card">
      <div class="card__body">
        <div class="toolbar">
          <input type="date" class="form-field__input toolbar__filter" id="filter-from" value="${filters.dateFrom}" />
          <input type="date" class="form-field__input toolbar__filter" id="filter-to" value="${filters.dateTo}" />
          <select class="form-field__input toolbar__filter" id="filter-client">
            <option value="all">Todos os clientes</option>
            ${clients.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
          <select class="form-field__input toolbar__filter" id="filter-service">
            <option value="all">Todos os serviços</option>
            ${Object.entries(SERVICE_TYPE_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
          <select class="form-field__input toolbar__filter" id="filter-status">
            <option value="all">Todos os status</option>
            ${Object.entries(CONTRACT_STATUS_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
          <select class="form-field__input toolbar__filter" id="filter-payment">
            <option value="all">Todas as formas</option>
            ${Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
          <button type="button" class="btn btn--primary" id="apply-filters">Filtrar</button>
        </div>
      </div>
    </div>

    <div id="report-summary" class="report-summary"></div>
    <div id="report-breakdown" class="report-breakdown"></div>
    <div class="card"><div class="card__header"><h3 class="card__title">Contratos filtrados</h3></div><div class="card__body" id="report-table"></div></div>

    <p class="text-muted" style="margin-top: var(--space-4);">Geração de PDF planejada para versão futura.</p>
  `;

  renderIcons(container);

  container.querySelector('#apply-filters').addEventListener('click', () => {
    filters = {
      dateFrom: container.querySelector('#filter-from').value,
      dateTo: container.querySelector('#filter-to').value,
      clientId: container.querySelector('#filter-client').value,
      serviceType: container.querySelector('#filter-service').value,
      status: container.querySelector('#filter-status').value,
      paymentMethod: container.querySelector('#filter-payment').value,
    };
    loadReport(container);
  });

  container.querySelector('#export-contracts').addEventListener('click', () => {
    const data = container._reportData;
    if (!data?.contracts?.length) {
      showToast('Nenhum dado para exportar.', 'error');
      return;
    }
    exportToCSV(contractsToCSV(data.contracts), 'contratos-albasfilms.csv');
    showToast('CSV exportado.', 'success');
  });

  container.querySelector('#export-payments').addEventListener('click', () => {
    const data = container._reportData;
    if (!data?.payments?.length) {
      showToast('Nenhum pagamento para exportar.', 'error');
      return;
    }
    const map = Object.fromEntries(data.contracts.map((c) => [c.id, c]));
    exportToCSV(paymentsToCSV(data.payments, map), 'pagamentos-albasfilms.csv');
    showToast('CSV exportado.', 'success');
  });

  loadReport(container);
}
