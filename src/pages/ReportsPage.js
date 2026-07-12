import { getReportData, getReportAnalytics, exportToCSV, contractsToCSV, paymentsToCSV } from '../services/reportService.js';
import { getActiveClients } from '../services/contractService.js';
import {
  CONTRACT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../utils/constants.js';
import { formatCurrency } from '../utils/currency.js';
import { formatDate } from '../utils/dates.js';
import { createSkeletonRows } from '../components/Skeleton.js';
import { renderIcons, showToast, escapeHtml } from '../utils/dom.js';
import { renderBarChart } from '../components/BarChart.js';
import { getInstallmentRemaining } from '../utils/installmentStatus.js';

let filters = {
  dateFrom: '',
  dateTo: '',
  clientId: 'all',
  eventType: 'all',
  status: 'all',
  paymentMethod: 'all',
};

function renderOperationalCards(operational) {
  return `
    <div class="summary-grid">
      <div class="summary-card"><div class="summary-card__content"><span class="summary-card__label">Total contratado</span><strong class="summary-card__value">${formatCurrency(operational.totalContracted)}</strong></div></div>
      <div class="summary-card"><div class="summary-card__content"><span class="summary-card__label">Clientes ativos</span><strong class="summary-card__value">${operational.activeClients}</strong></div></div>
      <div class="summary-card"><div class="summary-card__content"><span class="summary-card__label">Contratos ativos</span><strong class="summary-card__value">${operational.activeContracts}</strong></div></div>
      <div class="summary-card"><div class="summary-card__content"><span class="summary-card__label">Contratos quitados</span><strong class="summary-card__value">${operational.paidOffContracts}</strong></div></div>
      <div class="summary-card"><div class="summary-card__content"><span class="summary-card__label">Parcelas atrasadas</span><strong class="summary-card__value">${operational.overdueCount}</strong></div></div>
    </div>
  `;
}

async function loadReport(container) {
  const summaryEl = container.querySelector('#report-summary');
  const breakdownEl = container.querySelector('#report-breakdown');
  const tableEl = container.querySelector('#report-table');
  const analyticsEl = container.querySelector('#report-analytics');

  summaryEl.innerHTML = '';
  summaryEl.appendChild(createSkeletonRows(2, 4));
  analyticsEl.innerHTML = '<p class="text-muted">Carregando análises...</p>';
  tableEl.innerHTML = '';

  try {
    const [data, analytics] = await Promise.all([getReportData(filters), getReportAnalytics()]);
    const { summary } = data;

    summaryEl.innerHTML = `
      <h3 class="report-section__title">Resumo financeiro</h3>
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

    const eventRows = Object.entries(data.byEventType)
      .map(([k, v]) => `<tr><td>${EVENT_TYPE_LABELS[k] || k}</td><td>${formatCurrency(v)}</td></tr>`)
      .join('');

    breakdownEl.innerHTML = `
      <div class="detail-grid">
        <div class="card"><div class="card__header"><h3 class="card__title">Por forma de pagamento</h3></div>
          <div class="card__body"><table class="data-table"><tbody>${methodRows || '<tr><td colspan="2" class="text-muted">Sem dados</td></tr>'}</tbody></table></div>
        </div>
        <div class="card"><div class="card__header"><h3 class="card__title">Por modelo de evento</h3></div>
          <div class="card__body"><table class="data-table"><tbody>${eventRows || '<tr><td colspan="2" class="text-muted">Sem dados</td></tr>'}</tbody></table></div>
        </div>
      </div>
    `;

    const paymentsList = analytics.recentPayments.length
      ? `<ul class="dashboard-list">${analytics.recentPayments
          .map(
            (p) => `
          <li class="dashboard-list__item">
            <span>${formatDate(p.paymentDate)}</span>
            <strong>${formatCurrency(p.amount)}</strong>
          </li>
        `
          )
          .join('')}</ul>`
      : '<p class="text-muted">Nenhum pagamento registrado.</p>';

    const overdueList = analytics.overdueInstallments.length
      ? `<ul class="dashboard-list">${analytics.overdueInstallments
          .map(
            ({ contract, installment }) => `
          <li class="dashboard-list__item dashboard-list__item--danger">
            <a href="#/contratos/${contract.id}" class="link">${escapeHtml(contract.title)}</a>
            <span>${formatDate(installment.dueDate)} · ${formatCurrency(getInstallmentRemaining(installment))}</span>
          </li>
        `
          )
          .join('')}</ul>`
      : '<p class="text-muted">Nenhum pagamento atrasado.</p>';

    const recentContractsTable = `
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead><tr><th>Contrato</th><th>Cliente</th><th>Total</th><th>Recebido</th></tr></thead>
          <tbody>${analytics.recentContracts
            .map(
              (c) => `
            <tr>
              <td><a href="#/contratos/${c.id}" class="link">${escapeHtml(c.title)}</a></td>
              <td>${escapeHtml(c.clientName)}</td>
              <td>${formatCurrency(c.totalAmount)}</td>
              <td>${formatCurrency(c.receivedAmount)}</td>
            </tr>
          `
            )
            .join('')}</tbody>
        </table>
      </div>
    `;

    analyticsEl.innerHTML = `
      <h3 class="report-section__title">Indicadores operacionais</h3>
      ${renderOperationalCards(analytics.operational)}

      <div class="dashboard-grid report-charts">
        <div class="card dashboard-grid__full">
          <div class="card__header"><h3 class="card__title">Recebidos por mês</h3></div>
          <div class="card__body chart-container">
            <canvas id="chart-received"></canvas>
          </div>
        </div>
        <div class="card dashboard-grid__full">
          <div class="card__header"><h3 class="card__title">Previstos por mês</h3></div>
          <div class="card__body chart-container">
            <canvas id="chart-expected"></canvas>
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="card">
          <div class="card__header"><h3 class="card__title">Últimos pagamentos</h3></div>
          <div class="card__body">${paymentsList}</div>
        </div>
        <div class="card">
          <div class="card__header"><h3 class="card__title">Parcelas atrasadas</h3></div>
          <div class="card__body">${overdueList}</div>
        </div>
      </div>

      <div class="card">
        <div class="card__header"><h3 class="card__title">Contratos recentes</h3></div>
        <div class="card__body">${recentContractsTable}</div>
      </div>
    `;

    renderBarChart(
      analyticsEl.querySelector('#chart-received'),
      analytics.charts.monthlyReceived.map((m) => m.label),
      analytics.charts.monthlyReceived.map((m) => m.value),
      'Recebido'
    );

    renderBarChart(
      analyticsEl.querySelector('#chart-expected'),
      analytics.charts.monthlyExpected.map((m) => m.label),
      analytics.charts.monthlyExpected.map((m) => m.value),
      'Previsto'
    );

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
                <td>${escapeHtml(c.clientName)}</td>
                <td><a href="#/contratos/${c.id}" class="link">${escapeHtml(c.title)}</a></td>
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
    analyticsEl.innerHTML = '';
  }
}

export async function renderReportsPage(container) {
  const clients = await getActiveClients();

  container.innerHTML = `
    <div class="page-header page-header--with-action">
      <div>
        <h2 class="page-header__title">Relatórios</h2>
        <p class="page-header__subtitle">Análise financeira, gráficos e exportação de dados</p>
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
            ${clients.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
          </select>
          <select class="form-field__input toolbar__filter" id="filter-event-type">
            <option value="all">Todos os modelos</option>
            ${Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
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
    <div id="report-analytics" class="report-analytics"></div>
    <div id="report-breakdown" class="report-breakdown"></div>
    <div class="card">
      <div class="card__header"><h3 class="card__title">Contratos filtrados</h3></div>
      <div class="card__body" id="report-table"></div>
    </div>

    <p class="text-muted dashboard-hint">Geração de PDF planejada para versão futura.</p>
  `;

  renderIcons(container);

  container.querySelector('#apply-filters').addEventListener('click', () => {
    filters = {
      dateFrom: container.querySelector('#filter-from').value,
      dateTo: container.querySelector('#filter-to').value,
      clientId: container.querySelector('#filter-client').value,
      eventType: container.querySelector('#filter-event-type').value,
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
