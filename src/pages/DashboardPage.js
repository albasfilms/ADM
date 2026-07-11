import { getCurrentUser } from '../appState.js';
import { ROLE_LABELS } from '../utils/permissions.js';
import { renderIcons } from '../utils/dom.js';
import { BRAND_LOGO } from '../utils/brandAssets.js';
import { getDashboardData } from '../services/dashboardService.js';
import { createSummaryCard } from '../components/SummaryCard.js';
import { createSkeletonCards } from '../components/Skeleton.js';
import { formatCurrency } from '../utils/currency.js';
import { formatDate } from '../utils/dates.js';
import { getInstallmentRemaining } from '../utils/installmentStatus.js';
import { escapeHtml } from '../utils/dom.js';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

function renderAlerts(container, alerts) {
  const items = [];

  if (alerts.dueToday.length) {
    items.push({ type: 'warning', text: `${alerts.dueToday.length} parcela(s) vence(m) hoje` });
  }
  if (alerts.dueWeek.length) {
    items.push({ type: 'info', text: `${alerts.dueWeek.length} parcela(s) vence(m) nos próximos 7 dias` });
  }
  if (alerts.overdue.length) {
    items.push({ type: 'danger', text: `${alerts.overdue.length} parcela(s) atrasada(s)` });
  }
  if (alerts.awaitingEntry.length) {
    items.push({ type: 'warning', text: `${alerts.awaitingEntry.length} contrato(s) aguardando entrada` });
  }
  if (alerts.eventsSoon.length) {
    items.push({ type: 'info', text: `${alerts.eventsSoon.length} evento(s) nos próximos 7 dias` });
  }

  if (!items.length) {
    container.innerHTML = `<p class="text-muted">Nenhum alerta no momento.</p>`;
    return;
  }

  container.innerHTML = items
    .map(
      (a) => `
    <div class="alert alert--${a.type}">
      <i data-lucide="bell" aria-hidden="true"></i>
      <span>${a.text}</span>
    </div>
  `
    )
    .join('');
  renderIcons(container);
}

function renderChart(canvas, labels, data, label) {
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label,
          data: data.map((v) => v / 100),
          backgroundColor: 'rgba(200, 169, 110, 0.7)',
          borderColor: 'rgba(200, 169, 110, 1)',
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                ctx.raw
              ),
          },
        },
      },
      scales: {
        y: {
          ticks: {
            callback: (v) =>
              new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                maximumFractionDigits: 0,
              }).format(v),
          },
        },
      },
    },
  });
}

export async function renderDashboardPage(container) {
  const user = getCurrentUser();
  const roleLabel = ROLE_LABELS[user?.role] || 'Usuário';

  container.innerHTML = `
    <div class="brand-hero brand-hero--compact">
      <div class="brand-hero__content">
        <img class="brand-hero__logo" src="${BRAND_LOGO}" alt="Albas Films" />
        <div>
          <h2 class="brand-hero__title">Bem-vindo, ${user?.name || 'usuário'}</h2>
          <p class="brand-hero__subtitle">Painel administrativo — ${roleLabel}</p>
        </div>
      </div>
    </div>

    <div id="dashboard-metrics" class="summary-grid"></div>

    <div class="dashboard-grid">
      <div class="card">
        <div class="card__header"><h3 class="card__title">Alertas</h3></div>
        <div class="card__body" id="dashboard-alerts"></div>
      </div>

      <div class="card">
        <div class="card__header"><h3 class="card__title">Próximos vencimentos</h3></div>
        <div class="card__body" id="dashboard-upcoming"></div>
      </div>

      <div class="card">
        <div class="card__header"><h3 class="card__title">Pagamentos atrasados</h3></div>
        <div class="card__body" id="dashboard-overdue"></div>
      </div>

      <div class="card">
        <div class="card__header"><h3 class="card__title">Últimos pagamentos</h3></div>
        <div class="card__body" id="dashboard-payments"></div>
      </div>

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

      <div class="card dashboard-grid__full">
        <div class="card__header"><h3 class="card__title">Contratos recentes</h3></div>
        <div class="card__body" id="dashboard-contracts"></div>
      </div>
    </div>
  `;

  renderIcons(container);

  const metricsEl = container.querySelector('#dashboard-metrics');
  metricsEl.appendChild(createSkeletonCards(4));

  try {
    const data = await getDashboardData();
    const { metrics } = data;

    metricsEl.innerHTML = '';
    const cards = [
      { label: 'Total contratado', value: formatCurrency(metrics.totalContracted), icon: 'file-text' },
      { label: 'Total recebido', value: formatCurrency(metrics.totalReceived), icon: 'trending-up' },
      { label: 'Total pendente', value: formatCurrency(metrics.totalPending), icon: 'clock' },
      { label: 'Total vencido', value: formatCurrency(metrics.totalOverdue), icon: 'alert-triangle' },
      { label: 'Previsto este mês', value: formatCurrency(metrics.expectedThisMonth), icon: 'calendar' },
      { label: 'Clientes ativos', value: metrics.activeClients, icon: 'users' },
      { label: 'Contratos ativos', value: metrics.activeContracts, icon: 'briefcase' },
      { label: 'Parcelas atrasadas', value: metrics.overdueCount, icon: 'alert-circle' },
      { label: 'Contratos quitados', value: metrics.paidOffContracts, icon: 'check-circle' },
    ];
    cards.forEach((c) => metricsEl.appendChild(createSummaryCard(c)));
    renderIcons(metricsEl);

    renderAlerts(container.querySelector('#dashboard-alerts'), data.alerts);

    const upcomingEl = container.querySelector('#dashboard-upcoming');
    if (!data.upcomingDue.length) {
      upcomingEl.innerHTML = '<p class="text-muted">Nenhum vencimento próximo.</p>';
    } else {
      upcomingEl.innerHTML = `<ul class="dashboard-list">${data.upcomingDue
        .map(
          ({ contract, installment }) => `
        <li class="dashboard-list__item">
          <a href="#/contratos/${contract.id}" class="link">
            <strong>${escapeHtml(contract.clientName)}</strong> — ${installment.number === 0 ? 'Entrada' : `Parcela ${installment.number}`}
          </a>
          <span>${formatDate(installment.dueDate)} · ${formatCurrency(getInstallmentRemaining(installment))}</span>
        </li>
      `
        )
        .join('')}</ul>`;
    }

    const overdueEl = container.querySelector('#dashboard-overdue');
    if (!data.overdueInstallments.length) {
      overdueEl.innerHTML = '<p class="text-muted">Nenhum pagamento atrasado.</p>';
    } else {
      overdueEl.innerHTML = `<ul class="dashboard-list">${data.overdueInstallments
        .map(
          ({ contract, installment }) => `
        <li class="dashboard-list__item dashboard-list__item--danger">
          <a href="#/contratos/${contract.id}" class="link">${escapeHtml(contract.title)}</a>
          <span>${formatDate(installment.dueDate)} · ${formatCurrency(getInstallmentRemaining(installment))}</span>
        </li>
      `
        )
        .join('')}</ul>`;
    }

    const paymentsEl = container.querySelector('#dashboard-payments');
    if (!data.recentPayments.length) {
      paymentsEl.innerHTML = '<p class="text-muted">Nenhum pagamento registrado.</p>';
    } else {
      paymentsEl.innerHTML = `<ul class="dashboard-list">${data.recentPayments
        .map(
          (p) => `
        <li class="dashboard-list__item">
          <span>${formatDate(p.paymentDate)}</span>
          <strong>${formatCurrency(p.amount)}</strong>
        </li>
      `
        )
        .join('')}</ul>`;
    }

    const contractsEl = container.querySelector('#dashboard-contracts');
    contractsEl.innerHTML = `<div class="data-table-wrapper"><table class="data-table">
      <thead><tr><th>Contrato</th><th>Cliente</th><th>Total</th><th>Recebido</th></tr></thead>
      <tbody>${data.recentContracts
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
        .join('')}</tbody></table></div>`;

    renderChart(
      container.querySelector('#chart-received'),
      data.charts.monthlyReceived.map((m) => m.label),
      data.charts.monthlyReceived.map((m) => m.value),
      'Recebido'
    );

    renderChart(
      container.querySelector('#chart-expected'),
      data.charts.monthlyExpected.map((m) => m.label),
      data.charts.monthlyExpected.map((m) => m.value),
      'Previsto'
    );
  } catch (error) {
    console.error('[Dashboard] Erro:', error);
    metricsEl.innerHTML = '<p class="text-error">Erro ao carregar dashboard. Verifique as regras do Firestore.</p>';
  }
}

export function renderPlaceholderPage(container, title, description, icon = 'construction') {
  container.innerHTML = `
    <div class="page-header">
      <h2 class="page-header__title">${title}</h2>
      <p class="page-header__subtitle">${description}</p>
    </div>
    <div class="placeholder-page">
      <i data-lucide="${icon}" class="placeholder-page__icon" width="48" height="48" aria-hidden="true"></i>
      <h3 class="placeholder-page__title">Em breve</h3>
      <p class="placeholder-page__text">Esta seção será implementada nas próximas etapas do projeto.</p>
    </div>
  `;
  renderIcons(container);
}
