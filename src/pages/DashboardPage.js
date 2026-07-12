import { getCurrentUser } from '../appState.js';
import { renderIcons } from '../utils/dom.js';
import { getDashboardData } from '../services/dashboardService.js';
import { createSummaryCard } from '../components/SummaryCard.js';
import { createSkeletonCards } from '../components/Skeleton.js';
import { createModal } from '../components/Modal.js';
import { formatCurrency } from '../utils/currency.js';
import { formatDate } from '../utils/dates.js';
import { getInstallmentRemaining, toJsDate } from '../utils/installmentStatus.js';
import { escapeHtml } from '../utils/dom.js';
import { CONTRACT_STATUS_LABELS } from '../utils/constants.js';
import {
  formatCountdown,
  formatEventDateTime,
  getEventTimestamp,
} from '../utils/eventCountdown.js';

function formatEventLocation(contract) {
  const parts = [contract.eventLocation, contract.city, contract.state].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Local não informado';
}

function buildEventBoxHTML(contract) {
  const ts = getEventTimestamp(contract);
  const countdown = formatCountdown(ts);
  return `
    <a href="#/contratos/${contract.id}" class="event-box event-box--${countdown.variant}">
      <div class="event-box__header">
        <span class="event-box__date">${formatEventDateTime(contract)}</span>
        <span class="event-box__timer" data-event-ts="${ts}">
          <span class="event-box__timer-value">${countdown.text}</span>
        </span>
      </div>
      <h4 class="event-box__title">${escapeHtml(contract.title)}</h4>
      <p class="event-box__client">${escapeHtml(contract.clientName)}</p>
      <p class="event-box__location">${escapeHtml(formatEventLocation(contract))}</p>
      <span class="event-box__timer-label">para o evento</span>
    </a>
  `;
}

function renderEventsThisMonth(events) {
  if (!events.length) {
    return '<p class="text-muted">Nenhum evento agendado para este mês.</p>';
  }

  const showNav = events.length > 1;

  return `
    <div class="events-carousel-wrap">
      ${
        showNav
          ? `<button type="button" class="events-carousel__btn events-carousel__btn--prev" aria-label="Evento anterior">
        <i data-lucide="chevron-left" aria-hidden="true"></i>
      </button>`
          : ''
      }
      <div class="events-carousel" id="events-carousel">
        ${events.map((contract) => buildEventBoxHTML(contract)).join('')}
      </div>
      ${
        showNav
          ? `<button type="button" class="events-carousel__btn events-carousel__btn--next" aria-label="Próximo evento">
        <i data-lucide="chevron-right" aria-hidden="true"></i>
      </button>`
          : ''
      }
    </div>
  `;
}

function bindEventsCarousel(container) {
  const carousel = container.querySelector('#events-carousel');
  if (!carousel) return;

  const scrollStep = () => {
    const card = carousel.querySelector('.event-box');
    return (card?.offsetWidth || 300) + 16;
  };

  container.querySelector('.events-carousel__btn--prev')?.addEventListener('click', () => {
    carousel.scrollBy({ left: -scrollStep(), behavior: 'smooth' });
  });

  container.querySelector('.events-carousel__btn--next')?.addEventListener('click', () => {
    carousel.scrollBy({ left: scrollStep(), behavior: 'smooth' });
  });
}

function startEventCountdowns(container) {
  if (container._eventTimerId) {
    clearInterval(container._eventTimerId);
  }

  const tick = () => {
    container.querySelectorAll('[data-event-ts]').forEach((el) => {
      const ts = Number(el.dataset.eventTs);
      if (!ts) return;

      const { text, variant } = formatCountdown(ts);
      const valueEl = el.querySelector('.event-box__timer-value');
      if (valueEl) valueEl.textContent = text;

      const box = el.closest('.event-box');
      if (box) {
        box.classList.remove('event-box--upcoming', 'event-box--soon', 'event-box--done');
        box.classList.add(`event-box--${variant}`);
      }
    });
  };

  tick();
  container._eventTimerId = setInterval(tick, 1000);
}

function getMonthRangeFromFilter(mode, customMonth) {
  const now = new Date();

  if (mode === 'this-month') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
      label: now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    };
  }

  if (mode === 'next-month') {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
      start: next,
      end: new Date(next.getFullYear(), next.getMonth() + 1, 0, 23, 59, 59, 999),
      label: next.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    };
  }

  return getMonthRange(customMonth);
}

function getMonthRange(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return {
    start: date,
    end: new Date(year, month, 0, 23, 59, 59, 999),
    label: date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  };
}

function getMonthOptions(count = 12, startDate = new Date()) {
  const options = [];
  const date = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

  for (let i = 0; i < count; i += 1) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const value = `${year}-${String(month).padStart(2, '0')}`;
    const monthName = date
      .toLocaleDateString('pt-BR', { month: 'short' })
      .replace('.', '')
      .trim();
    const label = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}/${String(year).slice(-2)}`;

    options.push({ value, label });
    date.setMonth(date.getMonth() + 1);
  }

  return options;
}

function renderMonthPickerGrid(selectedMonth, startDate = new Date()) {
  return getMonthOptions(12, startDate)
    .map(
      ({ value, label }) => `
    <button
      type="button"
      class="btn btn--secondary btn--sm month-picker-btn${value === selectedMonth ? ' is-active' : ''}"
      data-month-pick="${value}"
    >${label}</button>
  `
    )
    .join('');
}

function filterDueByRange(dueInstallments, range) {
  return dueInstallments.filter(({ installment }) => {
    const due = toJsDate(installment.dueDate);
    const remaining = getInstallmentRemaining(installment);
    return due && remaining > 0 && due >= range.start && due <= range.end;
  });
}

function renderInstallmentRows(items, emptyText) {
  if (!items.length) {
    return `<p class="text-muted">${emptyText}</p>`;
  }

  return `<ul class="dashboard-list">${items
    .map(
      ({ contract, installment }) => `
    <li class="dashboard-list__item">
      <a href="#/contratos/${contract.id}" class="link">
        <strong>${escapeHtml(contract.clientName)}</strong> — ${escapeHtml(contract.title)}
        <span class="text-muted"> · ${installment.number === 0 ? 'Entrada' : `Parcela ${installment.number}`}</span>
      </a>
      <span>${formatDate(installment.dueDate)} · ${formatCurrency(getInstallmentRemaining(installment))}</span>
    </li>
  `
    )
    .join('')}</ul>`;
}

function renderContractRows(contracts, amountKey, emptyText) {
  if (!contracts.length) {
    return `<p class="text-muted">${emptyText}</p>`;
  }

  return `<div class="data-table-wrapper"><table class="data-table">
    <thead><tr><th>Contrato</th><th>Cliente</th><th>Valor</th><th>Status</th></tr></thead>
    <tbody>${contracts
      .map(
        (c) => `
      <tr>
        <td><a href="#/contratos/${c.id}" class="link">${escapeHtml(c.title)}</a></td>
        <td>${escapeHtml(c.clientName)}</td>
        <td>${formatCurrency(c[amountKey] || 0)}</td>
        <td>${CONTRACT_STATUS_LABELS[c.status] || c.status}</td>
      </tr>
    `
      )
      .join('')}</tbody></table></div>`;
}

function renderClosedContractsRows(contracts, emptyText) {
  if (!contracts.length) {
    return `<p class="text-muted">${emptyText}</p>`;
  }

  return `<div class="data-table-wrapper"><table class="data-table">
    <thead><tr><th>Contrato</th><th>Cliente</th><th>Fechamento</th><th>Total</th></tr></thead>
    <tbody>${contracts
      .map(
        (c) => `
      <tr>
        <td><a href="#/contratos/${c.id}" class="link">${escapeHtml(c.title)}</a></td>
        <td>${escapeHtml(c.clientName)}</td>
        <td>${formatDate(c.closingDate)}</td>
        <td>${formatCurrency(c.totalAmount)}</td>
      </tr>
    `
      )
      .join('')}</tbody></table></div>`;
}

function openDetailModal(title, content) {
  createModal({ title, content, size: 'lg' });
}

function formatAlertCount(count, singular, plural) {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

function renderAlertsSummary(container, alerts) {
  const items = [];

  if (alerts.overdue.length) {
    const n = alerts.overdue.length;
    items.push({
      type: 'danger',
      key: 'overdue',
      icon: 'circle-alert',
      text: formatAlertCount(n, 'parcela atrasada', 'parcelas atrasadas'),
    });
  }
  if (alerts.dueToday.length) {
    const n = alerts.dueToday.length;
    items.push({
      type: 'warning',
      key: 'dueToday',
      icon: 'clock',
      text: formatAlertCount(n, 'parcela vence hoje', 'parcelas vencem hoje'),
    });
  }
  if (alerts.dueWeek.length) {
    const n = alerts.dueWeek.length;
    items.push({
      type: 'info',
      key: 'dueWeek',
      icon: 'calendar-clock',
      text: formatAlertCount(n, 'parcela vence nos próximos 7 dias', 'parcelas vencem nos próximos 7 dias'),
    });
  }
  if (alerts.awaitingEntry.length) {
    const n = alerts.awaitingEntry.length;
    items.push({
      type: 'warning',
      key: 'awaitingEntry',
      icon: 'wallet',
      text: formatAlertCount(n, 'contrato aguardando entrada', 'contratos aguardando entrada'),
    });
  }
  if (alerts.eventsSoon.length) {
    const n = alerts.eventsSoon.length;
    items.push({
      type: 'info',
      key: 'eventsSoon',
      icon: 'calendar-heart',
      text: formatAlertCount(n, 'evento nos próximos 7 dias', 'eventos nos próximos 7 dias'),
    });
  }

  if (!items.length) {
    container.innerHTML = `<p class="text-muted">Tudo em dia. Nenhuma pendência urgente.</p>`;
    return;
  }

  container.innerHTML = items
    .map(
      (a) => `
    <div class="alert alert--${a.type} alert--clickable" data-alert="${a.key}" role="button" tabindex="0">
      <i data-lucide="${a.icon}" aria-hidden="true"></i>
      <span>${a.text}</span>
      <i data-lucide="chevron-right" class="alert__chevron" aria-hidden="true"></i>
    </div>
  `
    )
    .join('');
  renderIcons(container);
}

function openAlertsModal(alerts) {
  const sections = [];

  if (alerts.overdue.length) {
    sections.push(`<h4 class="modal-section__title">Parcelas atrasadas</h4>${renderInstallmentRows(alerts.overdue, '')}`);
  }
  if (alerts.dueToday.length) {
    sections.push(`<h4 class="modal-section__title">Vencem hoje</h4>${renderInstallmentRows(alerts.dueToday, '')}`);
  }
  if (alerts.dueWeek.length) {
    sections.push(`<h4 class="modal-section__title">Vencem nos próximos 7 dias</h4>${renderInstallmentRows(alerts.dueWeek, '')}`);
  }
  if (alerts.awaitingEntry.length) {
    sections.push(
      `<h4 class="modal-section__title">Aguardando entrada</h4>${renderContractRows(alerts.awaitingEntry, 'totalAmount', '')}`
    );
  }
  if (alerts.eventsSoon.length) {
    sections.push(`<h4 class="modal-section__title">Eventos nos próximos 7 dias</h4>
      <ul class="dashboard-list">${alerts.eventsSoon
        .map(
          (c) => `
        <li class="dashboard-list__item">
          <a href="#/contratos/${c.id}" class="link"><strong>${escapeHtml(c.title)}</strong> — ${escapeHtml(c.clientName)}</a>
          <span>${formatDate(c.eventDate)}</span>
        </li>
      `
        )
        .join('')}</ul>`);
  }

  openDetailModal('Precisa de atenção', sections.join('') || '<p class="text-muted">Nenhuma pendência.</p>');
}

function openAlertSectionModal(key, alerts) {
  const titles = {
    overdue: 'Parcelas atrasadas',
    dueToday: 'Vencem hoje',
    dueWeek: 'Vencem nos próximos 7 dias',
    awaitingEntry: 'Aguardando entrada',
    eventsSoon: 'Eventos nos próximos 7 dias',
  };

  let content = '';
  if (key === 'awaitingEntry') {
    content = renderContractRows(alerts.awaitingEntry, 'totalAmount', 'Nenhum contrato.');
  } else if (key === 'eventsSoon') {
    content =
      alerts.eventsSoon.length > 0
        ? `<ul class="dashboard-list">${alerts.eventsSoon
            .map(
              (c) => `
          <li class="dashboard-list__item">
            <a href="#/contratos/${c.id}" class="link"><strong>${escapeHtml(c.title)}</strong> — ${escapeHtml(c.clientName)}</a>
            <span>${formatDate(c.eventDate)}</span>
          </li>
        `
            )
            .join('')}</ul>`
        : '<p class="text-muted">Nenhum evento.</p>';
  } else {
    content = renderInstallmentRows(alerts[key], 'Nenhum item.');
  }

  openDetailModal(titles[key] || 'Detalhes', content);
}

function bindClickableCard(card, onClick) {
  card.addEventListener('click', onClick);
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  });
}

function openMonthPickerModal(currentValue, onConfirm) {
  const { modal, close } = createModal({
    title: 'Selecionar mês',
    content: `<div class="month-picker-grid">${renderMonthPickerGrid(currentValue)}</div>`,
    size: 'sm',
  });

  modal.querySelectorAll('[data-month-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onConfirm(btn.dataset.monthPick);
      close();
    });
  });
}

function getExpectedForMonth(data, mode, customMonth) {
  const range = getMonthRangeFromFilter(mode, customMonth);
  const items = filterDueByRange(data.dueInstallments, range);
  const total = items.reduce((sum, { installment }) => sum + getInstallmentRemaining(installment), 0);
  return { items, total, label: range.label };
}

function renderExpectedMonthModalContent(data, mode, customMonth) {
  const { items, total, label } = getExpectedForMonth(data, mode, customMonth);

  return `
    <div class="dashboard-filters" id="expected-month-filters">
      <button type="button" class="btn btn--secondary btn--sm dashboard-filter-btn${mode === 'this-month' ? ' is-active' : ''}" data-expected-month-filter="this-month">Este mês</button>
      <button type="button" class="btn btn--secondary btn--sm dashboard-filter-btn${mode === 'next-month' ? ' is-active' : ''}" data-expected-month-filter="next-month">Próximo mês</button>
      <button type="button" class="btn btn--secondary btn--sm dashboard-filter-btn${mode === 'custom' ? ' is-active' : ''}" data-expected-month-filter="custom">Selecionar mês</button>
    </div>
    <p class="expected-month-summary">
      <strong class="expected-month-summary__value">${formatCurrency(total)}</strong>
      <span class="text-muted"> previsto em ${label}</span>
    </p>
    ${renderInstallmentRows(items, 'Nenhuma parcela prevista neste período.')}
  `;
}

function openExpectedMonthModal(data, defaultMonthValue) {
  const state = { mode: 'this-month', customMonth: defaultMonthValue };

  const { body, modal } = createModal({
    title: 'Previsto por mês',
    content: '',
    size: 'lg',
  });

  const refresh = () => {
    body.innerHTML = renderExpectedMonthModalContent(data, state.mode, state.customMonth);
    renderIcons(modal);

    body.querySelectorAll('[data-expected-month-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.expectedMonthFilter === 'custom') {
          openMonthPickerModal(state.customMonth, (value) => {
            state.mode = 'custom';
            state.customMonth = value;
            refresh();
          });
          return;
        }

        state.mode = btn.dataset.expectedMonthFilter;
        refresh();
      });
    });
  };

  refresh();
}

function setMonthFilterActive(container, mode) {
  container.querySelectorAll('[data-month-filter]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.monthFilter === mode);
  });
}

function renderDueByMonth(container, data, mode, customMonth) {
  const listEl = container.querySelector('#due-by-month-list');
  const labelEl = container.querySelector('#due-by-month-label');
  const range = getMonthRangeFromFilter(mode, customMonth);
  const items = filterDueByRange(data.dueInstallments, range);

  labelEl.textContent = range.label;
  listEl.innerHTML = renderInstallmentRows(items, 'Nenhum vencimento neste período.');
}

export async function renderDashboardPage(container) {
  const user = getCurrentUser();
  const now = new Date();
  const defaultMonthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  container.innerHTML = `
    <div class="page-header page-header--with-action">
      <div>
        <h2 class="page-header__title">Dashboard</h2>
        <p class="page-header__subtitle">Olá, ${escapeHtml(user?.name || 'usuário')} — visão rápida do dia</p>
      </div>
      <div class="page-header__actions">
        <a href="#/relatorios" class="btn btn--secondary">
          <i data-lucide="bar-chart-3" aria-hidden="true"></i> Ver relatórios
        </a>
      </div>
    </div>

    <div id="dashboard-metrics" class="summary-grid summary-grid--4"></div>

    <div class="dashboard-grid">
    <div class="card dashboard-grid__full">
      <div class="card__header card__header--split">
        <div class="card__header-title-group">
          <h3 class="card__title">Eventos para realizar este mês</h3>
          <span class="events-counter" id="events-count-badge" hidden>0</span>
        </div>
        <span class="text-muted" id="events-month-label"></span>
      </div>
      <div class="card__body" id="dashboard-events"></div>
    </div>

      <div class="card card--clickable" id="dashboard-alerts-card" role="button" tabindex="0" aria-label="Precisa de atenção. Clique para ver detalhes.">
        <div class="card__header card__header--clickable">
          <h3 class="card__title">Precisa de atenção</h3>
          <i data-lucide="chevron-right" aria-hidden="true"></i>
        </div>
        <div class="card__body" id="dashboard-alerts"></div>
      </div>

      <div class="card">
        <div class="card__header card__header--split">
          <h3 class="card__title">Próximos contratos a vencer</h3>
          <span class="text-muted" id="due-by-month-label"></span>
        </div>
        <div class="card__body">
          <div class="dashboard-filters" id="due-month-filters">
            <button type="button" class="btn btn--secondary btn--sm dashboard-filter-btn is-active" data-month-filter="this-month">Este mês</button>
            <button type="button" class="btn btn--secondary btn--sm dashboard-filter-btn" data-month-filter="next-month">Próximo mês</button>
            <button type="button" class="btn btn--secondary btn--sm dashboard-filter-btn" data-month-filter="custom" id="select-month-btn">Selecionar mês</button>
          </div>
          <div id="due-by-month-list"></div>
        </div>
      </div>
    </div>

    <p class="dashboard-hint text-muted">
      Total recebido e análises detalhadas estão em
      <a href="#/relatorios" class="link">Relatórios</a>.
    </p>
  `;

  renderIcons(container);

  const metricsEl = container.querySelector('#dashboard-metrics');
  metricsEl.appendChild(createSkeletonCards(4));

  let monthFilterMode = 'this-month';
  let customMonth = defaultMonthValue;

  try {
    const data = await getDashboardData();
    container._dashboardData = data;
    const { metrics, details } = data;

    metricsEl.innerHTML = '';
    const cards = [
      {
        label: 'Fechados este mês',
        value: String(metrics.closedThisMonthCount),
        icon: 'file-check',
        action: 'closed-month',
      },
      {
        label: 'Previsto este mês',
        value: formatCurrency(metrics.expectedThisMonth),
        icon: 'calendar',
        action: 'expected-month',
      },
      {
        label: 'Total pendente',
        value: formatCurrency(metrics.totalPending),
        icon: 'clock',
        action: 'pending',
      },
      {
        label: 'Total vencido',
        value: formatCurrency(metrics.totalOverdue),
        icon: 'alert-triangle',
        action: 'overdue',
      },
    ];

    cards.forEach((c) => {
      const card = createSummaryCard({ ...c, clickable: true });
      metricsEl.appendChild(card);

      bindClickableCard(card, () => {
        if (c.action === 'closed-month') {
          openDetailModal(
            'Contratos fechados este mês',
            renderClosedContractsRows(details.closedThisMonthContracts, 'Nenhum contrato fechado este mês.')
          );
          return;
        }
        if (c.action === 'pending') {
          openDetailModal(
            'Total pendente',
            renderContractRows(details.pendingContracts, 'pendingAmount', 'Nenhum valor pendente.')
          );
          return;
        }
        if (c.action === 'overdue') {
          openDetailModal(
            'Total vencido',
            renderContractRows(details.overdueContracts, 'overdueAmount', 'Nenhum valor vencido.')
          );
          return;
        }
        if (c.action === 'expected-month') {
          openExpectedMonthModal(data, defaultMonthValue);
        }
      });
    });
    renderIcons(metricsEl);

    renderAlertsSummary(container.querySelector('#dashboard-alerts'), data.alerts);

    const eventsMonthLabel = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const eventsCount = data.eventsThisMonth.length;
    const countBadge = container.querySelector('#events-count-badge');
    container.querySelector('#events-month-label').textContent = eventsMonthLabel;
    if (countBadge) {
      countBadge.textContent = String(eventsCount);
      countBadge.hidden = eventsCount === 0;
      countBadge.title = eventsCount === 1 ? '1 evento este mês' : `${eventsCount} eventos este mês`;
    }
    container.querySelector('#dashboard-events').innerHTML = renderEventsThisMonth(data.eventsThisMonth);
    bindEventsCarousel(container);
    startEventCountdowns(container);
    renderIcons(container.querySelector('#dashboard-events'));

    renderDueByMonth(container, data, monthFilterMode, customMonth);

    container.querySelectorAll('[data-alert]').forEach((alertEl) => {
      const open = () => openAlertSectionModal(alertEl.dataset.alert, data.alerts);
      alertEl.addEventListener('click', (event) => {
        event.stopPropagation();
        open();
      });
      alertEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          open();
        }
      });
    });

    bindClickableCard(container.querySelector('#dashboard-alerts-card'), () => {
      openAlertsModal(data.alerts);
    });

    container.querySelectorAll('[data-month-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.monthFilter === 'custom') {
          openMonthPickerModal(customMonth, (value) => {
            customMonth = value;
            monthFilterMode = 'custom';
            setMonthFilterActive(container, 'custom');
            renderDueByMonth(container, data, monthFilterMode, customMonth);
          });
          return;
        }

        monthFilterMode = btn.dataset.monthFilter;
        setMonthFilterActive(container, monthFilterMode);
        renderDueByMonth(container, data, monthFilterMode, customMonth);
      });
    });
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
