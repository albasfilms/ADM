import {
  BLOCK_PRESETS,
  getCalendarData,
  removeBlockedDate,
  removeBudgetEntry,
  setBlockedDate,
  toDateKey,
} from '../services/calendarService.js';
import { openBudgetEntryModal } from '../components/BudgetEntryModal.js';
import { showConfirmModal } from '../components/ConfirmModal.js';
import { CONTRACT_STATUS } from '../utils/constants.js';
import { escapeHtml, getFirestoreErrorMessage, renderIcons, showToast } from '../utils/dom.js';
import { formatBudgetPhone } from '../utils/budgetDisplay.js';
import { formatCurrency } from '../utils/currency.js';
import { toJsDate, startOfDay } from '../utils/installmentStatus.js';
import { createContractStatusBadge } from '../components/StatusBadge.js';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WEEKDAYS_MINI = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function groupContractsByDate(contracts) {
  const map = new Map();

  contracts.forEach((contract) => {
    const key = toDateKey(contract.eventDate);
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(contract);
  });

  map.forEach((items) => {
    items.sort((a, b) => String(a.eventTime || '').localeCompare(String(b.eventTime || '')));
  });

  return map;
}

function getBudgetsForDate(budgetEntries, dateKey) {
  return budgetEntries[dateKey] || [];
}

function countDateOccupancy(contracts, budgets) {
  return contracts.length + budgets.length;
}

function getDayState(dateKey, contracts, budgetEntries, blockedDays, maxEventsPerDay) {
  if (blockedDays[dateKey]) return 'blocked';

  const budgets = getBudgetsForDate(budgetEntries, dateKey);
  const totalEvents = countDateOccupancy(contracts, budgets);

  if (totalEvents >= maxEventsPerDay) {
    const hasConfirmed = contracts.some((event) => event.status !== CONTRACT_STATUS.BUDGET);
    return hasConfirmed ? 'booked' : 'tentative';
  }

  if (totalEvents > 0) return 'partial';
  return 'available';
}

function buildMonthMatrix(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const cells = [];

  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function formatMonthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
}

function formatYearLabel(year) {
  return String(year);
}

function renderDayButton(date, { eventsByDate, budgetEntries, blockedDays, maxEventsPerDay, selectedDateKey, compact = false }) {
  const dateKey = toDateKey(date);
  const contracts = eventsByDate.get(dateKey) || [];
  const budgets = getBudgetsForDate(budgetEntries, dateKey);
  const state = getDayState(dateKey, contracts, budgetEntries, blockedDays, maxEventsPerDay);
  const todayKey = toDateKey(new Date());
  const isToday = dateKey === todayKey;
  const isSelected = dateKey === selectedDateKey;
  const isPast = startOfDay(date) < startOfDay(new Date());
  const compactClass = compact ? ' calendar-day--mini' : '';
  const eventCount = countDateOccupancy(contracts, budgets);

  return `
    <button
      type="button"
      class="calendar-day calendar-day--${state}${compactClass}${isToday ? ' calendar-day--today' : ''}${isSelected ? ' calendar-day--selected' : ''}${isPast ? ' calendar-day--past' : ''}"
      data-date-key="${dateKey}"
      aria-label="${date.getDate()} — ${eventCount} evento(s)"
    >
      <span class="calendar-day__number">${date.getDate()}</span>
      ${
        !compact && eventCount
          ? `<span class="calendar-day__dots" aria-hidden="true">${Array.from({ length: Math.min(eventCount, 3) })
              .map(() => '<span></span>')
              .join('')}</span>`
          : ''
      }
    </button>
  `;
}

function renderDayDetail(dateKey, contracts, budgetEntries, blockedDays, maxEventsPerDay) {
  if (!dateKey) {
    return `<p class="text-muted">Selecione um dia no calendário para ver detalhes.</p>`;
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  const dateLabel = new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const budgets = getBudgetsForDate(budgetEntries, dateKey);
  const state = getDayState(dateKey, contracts, budgetEntries, blockedDays, maxEventsPerDay);
  const blockReason = blockedDays[dateKey];
  const isBlocked = Boolean(blockReason);

  const stateLabels = {
    available: 'Disponível',
    booked: 'Ocupado',
    tentative: 'Orçamento',
    partial: 'Parcialmente ocupado',
    blocked: 'Indisponível',
  };

  const contractEventsHtml = contracts.length
    ? contracts
        .map(
          (contract) => `
        <a href="#/contratos/${contract.id}" class="calendar-event-item">
          <div class="calendar-event-item__header">
            <strong>${escapeHtml(contract.title)}</strong>
            <span data-status-slot="${contract.id}"></span>
          </div>
          <span class="calendar-event-item__meta">${escapeHtml(contract.clientName)}${contract.eventTime ? ` · ${escapeHtml(contract.eventTime)}` : ''}</span>
        </a>
      `
        )
        .join('')
    : '';

  const budgetEventsHtml = budgets.length
    ? budgets
        .map(
          (entry) => `
        <article class="calendar-budget-item" data-budget-id="${entry.id}">
          <div class="calendar-budget-item__header">
            <div>
              <span class="calendar-budget-item__badge">Orçamento</span>
              <strong class="calendar-budget-item__name">${escapeHtml(entry.clientName)}</strong>
            </div>
            <button
              type="button"
              class="btn btn--ghost btn--sm calendar-budget-item__delete"
              data-action="delete-budget"
              data-date-key="${dateKey}"
              data-entry-id="${entry.id}"
              aria-label="Excluir orçamento"
            >
              <i data-lucide="trash-2" aria-hidden="true"></i>
            </button>
          </div>
          ${entry.phone ? `<span class="calendar-budget-item__meta">${escapeHtml(formatBudgetPhone(entry.phone))}</span>` : ''}
          ${entry.amount ? `<span class="calendar-budget-item__amount">${formatCurrency(entry.amount)}</span>` : ''}
          ${entry.notes ? `<p class="calendar-budget-item__notes">${escapeHtml(entry.notes)}</p>` : ''}
        </article>
      `
        )
        .join('')
    : '';

  const eventsHtml =
    contractEventsHtml || budgetEventsHtml
      ? `${contractEventsHtml}${budgetEventsHtml}`
      : '<p class="text-muted">Nenhum evento neste dia.</p>';

  const budgetSection = isBlocked
    ? ''
    : `
      <div class="calendar-budget-actions">
        <button type="button" class="btn btn--primary btn--sm btn--full" id="register-budget-btn" data-date-key="${dateKey}">
          <i data-lucide="file-plus" aria-hidden="true"></i>
          Registrar orçamento
        </button>
      </div>
    `;

  const blockSection = isBlocked
    ? `
      <div class="calendar-block-reason">
        <span class="calendar-block-reason__label">Motivo do bloqueio</span>
        <p>${escapeHtml(blockReason)}</p>
      </div>
      <button type="button" class="btn btn--secondary btn--sm btn--full" id="unblock-date-btn" data-date-key="${dateKey}">
        Liberar data
      </button>
    `
    : `
      <div class="calendar-block-form">
        <p class="calendar-block-form__title">Bloqueio rápido</p>
        <div class="calendar-block-presets">
          ${BLOCK_PRESETS.map(
            (preset) => `
            <button
              type="button"
              class="btn btn--secondary btn--sm calendar-block-preset"
              data-date-key="${dateKey}"
              data-block-reason="${escapeHtml(preset)}"
            >${escapeHtml(preset)}</button>
          `
          ).join('')}
        </div>
        <input
          type="text"
          class="form-field__input"
          id="block-reason-input"
          placeholder="Outro motivo (opcional)"
          maxlength="80"
        />
        <button type="button" class="btn btn--danger btn--sm btn--full" id="confirm-block-btn" data-date-key="${dateKey}">
          Bloquear data
        </button>
      </div>
    `;

  return `
    <div class="calendar-detail">
      <h4 class="calendar-detail__title">${dateLabel}</h4>
      <p class="calendar-detail__status calendar-detail__status--${state}">
        ${stateLabels[state] || '—'}
      </p>
      <div class="calendar-detail__events">${eventsHtml}</div>
      ${budgetSection}
      ${blockSection}
    </div>
  `;
}

function renderMonthGrid({ year, month, eventsByDate, budgetEntries, blockedDays, maxEventsPerDay, selectedDateKey }) {
  const cells = buildMonthMatrix(year, month);
  const weekdays = WEEKDAYS.map((day) => `<div class="calendar-weekday">${day}</div>`).join('');
  const dayCells = cells
    .map((date) => {
      if (!date) return `<div class="calendar-day calendar-day--empty" aria-hidden="true"></div>`;
      return renderDayButton(date, { eventsByDate, budgetEntries, blockedDays, maxEventsPerDay, selectedDateKey });
    })
    .join('');

  return `
    <div class="calendar-weekdays">${weekdays}</div>
    <div class="calendar-days">${dayCells}</div>
  `;
}

function isPastMonth(year, month) {
  const now = new Date();
  if (year < now.getFullYear()) return true;
  if (year > now.getFullYear()) return false;
  return month < now.getMonth();
}

function isCurrentMonth(year, month) {
  const now = new Date();
  return year === now.getFullYear() && month === now.getMonth();
}

function renderMiniMonth(year, month, context) {
  const cells = buildMonthMatrix(year, month);
  const weekdays = WEEKDAYS_MINI.map((day) => `<div class="calendar-mini-weekday">${day}</div>`).join('');
  const dayCells = cells
    .map((date) => {
      if (!date) return `<div class="calendar-day calendar-day--empty calendar-day--mini" aria-hidden="true"></div>`;
      return renderDayButton(date, { ...context, compact: true });
    })
    .join('');
  const monthClasses = [
    isPastMonth(year, month) ? 'calendar-mini-month--past' : '',
    isCurrentMonth(year, month) ? 'calendar-mini-month--current' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const monthClassAttr = monthClasses ? ` ${monthClasses}` : '';

  return `
    <section class="calendar-mini-month${monthClassAttr}">
      <button type="button" class="calendar-mini-month__title" data-go-month="${month}">
        ${MONTH_SHORT[month]}
      </button>
      <div class="calendar-mini-weekdays">${weekdays}</div>
      <div class="calendar-mini-days">${dayCells}</div>
    </section>
  `;
}

function renderYearGrid({ year, eventsByDate, budgetEntries, blockedDays, maxEventsPerDay, selectedDateKey }) {
  const context = { eventsByDate, budgetEntries, blockedDays, maxEventsPerDay, selectedDateKey };
  const months = Array.from({ length: 12 }, (_, month) => renderMiniMonth(year, month, context)).join('');

  return `<div class="calendar-year-grid">${months}</div>`;
}

function countMonthStats(year, month, eventsByDate, budgetEntries, blockedDaysMap, maxEventsPerDay) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let eventDays = 0;
  let availableDays = 0;
  let blockedCount = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = toDateKey(new Date(year, month, day));
    const contracts = eventsByDate.get(dateKey) || [];
    const state = getDayState(dateKey, contracts, budgetEntries, blockedDaysMap, maxEventsPerDay);

    if (countDateOccupancy(contracts, getBudgetsForDate(budgetEntries, dateKey))) eventDays += 1;
    if (state === 'blocked') blockedCount += 1;
    if (state === 'available') availableDays += 1;
  }

  return { eventDays, availableDays, blockedDays: blockedCount };
}

function countYearStats(year, eventsByDate, budgetEntries, blockedDays, maxEventsPerDay) {
  return Array.from({ length: 12 }, (_, month) =>
    countMonthStats(year, month, eventsByDate, budgetEntries, blockedDays, maxEventsPerDay)
  ).reduce(
    (acc, stats) => ({
      eventDays: acc.eventDays + stats.eventDays,
      availableDays: acc.availableDays + stats.availableDays,
      blockedDays: acc.blockedDays + stats.blockedDays,
    }),
    { eventDays: 0, availableDays: 0, blockedDays: 0 }
  );
}

function setViewToggleActive(container, viewMode) {
  container.querySelectorAll('[data-calendar-view]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.calendarView === viewMode);
  });
}

function bindCalendarPage(container, state) {
  const refreshDetailBadges = () => {
    state.eventsByDate.get(state.selectedDateKey)?.forEach((contract) => {
      const slot = container.querySelector(`[data-status-slot="${contract.id}"]`);
      if (!slot) return;
      slot.innerHTML = '';
      slot.appendChild(createContractStatusBadge(contract.status));
    });
    renderIcons(container.querySelector('#calendar-detail'));
  };

  const render = () => {
    const { year, month, viewMode, eventsByDate, budgetEntries, blockedDays, maxEventsPerDay, selectedDateKey } = state;

    container.querySelector('#calendar-period-label').textContent =
      viewMode === 'year' ? formatYearLabel(year) : formatMonthLabel(year, month);

    container.querySelector('#calendar-prev').setAttribute(
      'aria-label',
      viewMode === 'year' ? 'Ano anterior' : 'Mês anterior'
    );
    container.querySelector('#calendar-next').setAttribute(
      'aria-label',
      viewMode === 'year' ? 'Próximo ano' : 'Próximo mês'
    );

    container.querySelector('#calendar-summary-title').textContent =
      viewMode === 'year' ? 'Resumo do ano' : 'Resumo do mês';

    container.querySelector('#calendar-grid').innerHTML =
      viewMode === 'year'
        ? renderYearGrid({ year, eventsByDate, budgetEntries, blockedDays, maxEventsPerDay, selectedDateKey })
        : renderMonthGrid({ year, month, eventsByDate, budgetEntries, blockedDays, maxEventsPerDay, selectedDateKey });

    const stats =
      viewMode === 'year'
        ? countYearStats(year, eventsByDate, budgetEntries, blockedDays, maxEventsPerDay)
        : countMonthStats(year, month, eventsByDate, budgetEntries, blockedDays, maxEventsPerDay);

    container.querySelector('#calendar-stat-events').textContent = String(stats.eventDays);
    container.querySelector('#calendar-stat-available').textContent = String(stats.availableDays);
    container.querySelector('#calendar-stat-blocked').textContent = String(stats.blockedDays);

    const selectedContracts = eventsByDate.get(selectedDateKey) || [];
    container.querySelector('#calendar-detail').innerHTML = renderDayDetail(
      selectedDateKey,
      selectedContracts,
      budgetEntries,
      blockedDays,
      maxEventsPerDay
    );

    setViewToggleActive(container, viewMode);
    refreshDetailBadges();
  };

  container.querySelectorAll('[data-calendar-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.viewMode = btn.dataset.calendarView;
      if (state.selectedDateKey) {
        const [year, month] = state.selectedDateKey.split('-').map(Number);
        state.year = year;
        state.month = month - 1;
      }
      render();
    });
  });

  container.querySelector('#calendar-prev')?.addEventListener('click', () => {
    if (state.viewMode === 'year') {
      state.year -= 1;
    } else {
      state.month -= 1;
      if (state.month < 0) {
        state.month = 11;
        state.year -= 1;
      }
    }
    render();
  });

  container.querySelector('#calendar-next')?.addEventListener('click', () => {
    if (state.viewMode === 'year') {
      state.year += 1;
    } else {
      state.month += 1;
      if (state.month > 11) {
        state.month = 0;
        state.year += 1;
      }
    }
    render();
  });

  container.querySelector('#calendar-today')?.addEventListener('click', () => {
    const today = new Date();
    state.year = today.getFullYear();
    state.month = today.getMonth();
    state.selectedDateKey = toDateKey(today);
    render();
  });

  container.querySelector('#calendar-grid')?.addEventListener('click', (event) => {
    const monthTitle = event.target.closest('[data-go-month]');
    if (monthTitle) {
      state.viewMode = 'month';
      state.month = Number(monthTitle.dataset.goMonth);
      render();
      return;
    }

    const dayButton = event.target.closest('.calendar-day[data-date-key]');
    if (!dayButton) return;

    state.selectedDateKey = dayButton.dataset.dateKey;
    const [year, month] = state.selectedDateKey.split('-').map(Number);
    state.year = year;
    state.month = month - 1;
    render();
  });

  container.querySelector('#calendar-detail')?.addEventListener('click', async (event) => {
    const registerBudgetBtn = event.target.closest('#register-budget-btn');
    if (registerBudgetBtn?.dataset.dateKey) {
      openBudgetEntryModal({
        dateKey: registerBudgetBtn.dataset.dateKey,
        onSaved: (result) => {
          state.budgetEntries = result.budgetEntries;
          render();
        },
      });
      return;
    }

    const deleteBudgetBtn = event.target.closest('[data-action="delete-budget"]');
    if (deleteBudgetBtn?.dataset.entryId) {
      const { dateKey, entryId } = deleteBudgetBtn.dataset;
      const entry = getBudgetsForDate(state.budgetEntries, dateKey).find((item) => item.id === entryId);
      showConfirmModal({
        title: 'Excluir orçamento',
        message: `Tem certeza que deseja excluir o orçamento de "${escapeHtml(entry?.clientName || 'este cliente')}"?`,
        confirmLabel: 'Excluir',
        variant: 'danger',
        onConfirm: async () => {
          state.budgetEntries = await removeBudgetEntry(dateKey, entryId);
          showToast('Orçamento excluído.', 'success');
          render();
        },
      });
      return;
    }

    const presetBtn = event.target.closest('[data-block-reason]');
    if (presetBtn?.dataset.dateKey) {
      const button = presetBtn;
      button.disabled = true;
      try {
        state.blockedDays = await setBlockedDate(presetBtn.dataset.dateKey, presetBtn.dataset.blockReason);
        showToast('Data bloqueada.', 'success');
        render();
      } catch (error) {
        console.error('[Calendar] Erro ao bloquear:', error);
        showToast(getFirestoreErrorMessage(error, 'Erro ao bloquear data.'), 'error');
      } finally {
        button.disabled = false;
      }
      return;
    }

    const confirmBtn = event.target.closest('#confirm-block-btn');
    if (confirmBtn) {
      const dateKey = confirmBtn.dataset.dateKey;
      const input = container.querySelector('#block-reason-input');
      const reason = input?.value.trim() || 'Indisponível';
      confirmBtn.disabled = true;
      try {
        state.blockedDays = await setBlockedDate(dateKey, reason);
        showToast('Data bloqueada.', 'success');
        render();
      } catch (error) {
        console.error('[Calendar] Erro ao bloquear:', error);
        showToast(getFirestoreErrorMessage(error, 'Erro ao bloquear data.'), 'error');
      } finally {
        confirmBtn.disabled = false;
      }
      return;
    }

    const unblockBtn = event.target.closest('#unblock-date-btn');
    if (!unblockBtn) return;

    const dateKey = unblockBtn.dataset.dateKey;
    if (!dateKey) return;

    unblockBtn.disabled = true;
    try {
      state.blockedDays = await removeBlockedDate(dateKey);
      showToast('Data liberada com sucesso.', 'success');
      render();
    } catch (error) {
      console.error('[Calendar] Erro ao liberar data:', error);
      showToast(getFirestoreErrorMessage(error, 'Erro ao liberar data.'), 'error');
    } finally {
      unblockBtn.disabled = false;
    }
  });

  render();
}

export async function renderCalendarPage(container) {
  const now = new Date();

  container.innerHTML = `
    <div class="page-header calendar-page-header">
      <h2 class="page-header__title">Calendário</h2>
      <div class="calendar-header-summary">
        <span class="calendar-header-summary__label" id="calendar-summary-title">Resumo do ano</span>
        <div class="calendar-header-summary__stats">
          <div class="calendar-header-summary__chip">
            <strong id="calendar-stat-events">0</strong>
            <span>com evento</span>
          </div>
          <div class="calendar-header-summary__chip">
            <strong id="calendar-stat-available">0</strong>
            <span>disponíveis</span>
          </div>
          <div class="calendar-header-summary__chip">
            <strong id="calendar-stat-blocked">0</strong>
            <span>bloqueados</span>
          </div>
        </div>
      </div>
      <div class="calendar-page-header__spacer" aria-hidden="true"></div>
    </div>

    <div class="calendar-layout">
      <div class="card calendar-card">
        <div class="card__header card__header--split">
          <div class="calendar-toolbar">
            <button type="button" class="btn btn--ghost btn--icon" id="calendar-prev" aria-label="Mês anterior">
              <i data-lucide="chevron-left" aria-hidden="true"></i>
            </button>
            <h3 class="calendar-toolbar__label" id="calendar-period-label"></h3>
            <button type="button" class="btn btn--ghost btn--icon" id="calendar-next" aria-label="Próximo mês">
              <i data-lucide="chevron-right" aria-hidden="true"></i>
            </button>
          </div>
          <div class="calendar-header-actions">
            <div class="calendar-view-toggle">
              <button type="button" class="btn btn--secondary btn--sm dashboard-filter-btn" data-calendar-view="month">Mensal</button>
              <button type="button" class="btn btn--secondary btn--sm dashboard-filter-btn is-active" data-calendar-view="year">Anual</button>
            </div>
            <button type="button" class="btn btn--secondary btn--sm" id="calendar-today">Hoje</button>
          </div>
        </div>
        <div class="calendar-card-legend">
          <ul class="calendar-legend calendar-legend--inline" aria-label="Legenda do calendário">
            <li><span class="calendar-legend__dot calendar-legend__dot--available"></span> Disponível</li>
            <li><span class="calendar-legend__dot calendar-legend__dot--booked"></span> Ocupado</li>
            <li><span class="calendar-legend__dot calendar-legend__dot--tentative"></span> Orçamento</li>
            <li><span class="calendar-legend__dot calendar-legend__dot--blocked"></span> Indisponível</li>
          </ul>
        </div>
        <div class="card__body">
          <div class="calendar-grid" id="calendar-grid">
            <p class="text-muted">Carregando calendário...</p>
          </div>
        </div>
      </div>

      <aside class="calendar-sidebar">
        <div class="card">
          <div class="card__header"><h3 class="card__title">Detalhes do dia</h3></div>
          <div class="card__body" id="calendar-detail">
            <p class="text-muted">Carregando...</p>
          </div>
        </div>
      </aside>
    </div>
  `;

  renderIcons(container);

  try {
    const data = await getCalendarData();
    const state = {
      year: now.getFullYear(),
      month: now.getMonth(),
      viewMode: 'year',
      selectedDateKey: toDateKey(now),
      eventsByDate: groupContractsByDate(data.contracts),
      blockedDays: data.blockedDays,
      budgetEntries: data.budgetEntries,
      maxEventsPerDay: data.maxEventsPerDay,
    };

    bindCalendarPage(container, state);
  } catch (error) {
    console.error('[Calendar] Erro:', error);
    container.querySelector('#calendar-grid').innerHTML =
      '<p class="text-error">Erro ao carregar calendário. Verifique as regras do Firestore.</p>';
  }
}
