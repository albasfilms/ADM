import { getCalendarData, toggleBlockedDate, toDateKey } from '../services/calendarService.js';
import { CONTRACT_STATUS } from '../utils/constants.js';
import { escapeHtml, renderIcons, showToast } from '../utils/dom.js';
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

function getDayState(dateKey, events, blockedDates, maxEventsPerDay) {
  if (blockedDates.includes(dateKey)) return 'blocked';
  if (events.length >= maxEventsPerDay) {
    const hasBudgetOnly = events.every((event) => event.status === CONTRACT_STATUS.BUDGET);
    return hasBudgetOnly ? 'tentative' : 'booked';
  }
  if (events.length > 0) return 'partial';
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

function renderDayButton(date, { eventsByDate, blockedDates, maxEventsPerDay, selectedDateKey, compact = false }) {
  const dateKey = toDateKey(date);
  const events = eventsByDate.get(dateKey) || [];
  const state = getDayState(dateKey, events, blockedDates, maxEventsPerDay);
  const todayKey = toDateKey(new Date());
  const isToday = dateKey === todayKey;
  const isSelected = dateKey === selectedDateKey;
  const isPast = startOfDay(date) < startOfDay(new Date());
  const compactClass = compact ? ' calendar-day--mini' : '';

  return `
    <button
      type="button"
      class="calendar-day calendar-day--${state}${compactClass}${isToday ? ' calendar-day--today' : ''}${isSelected ? ' calendar-day--selected' : ''}${isPast ? ' calendar-day--past' : ''}"
      data-date-key="${dateKey}"
      aria-label="${date.getDate()} — ${events.length} evento(s)"
    >
      <span class="calendar-day__number">${date.getDate()}</span>
      ${
        !compact && events.length
          ? `<span class="calendar-day__dots" aria-hidden="true">${events
              .slice(0, 3)
              .map(() => '<span></span>')
              .join('')}</span>`
          : ''
      }
    </button>
  `;
}

function renderDayDetail(dateKey, events, blockedDates, maxEventsPerDay) {
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
  const state = getDayState(dateKey, events, blockedDates, maxEventsPerDay);
  const isBlocked = blockedDates.includes(dateKey);

  const stateLabels = {
    available: 'Disponível',
    booked: 'Ocupado',
    tentative: 'Orçamento pendente',
    partial: 'Parcialmente ocupado',
    blocked: 'Indisponível',
  };

  const eventsHtml = events.length
    ? events
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
    : '<p class="text-muted">Nenhum evento neste dia.</p>';

  return `
    <div class="calendar-detail">
      <h4 class="calendar-detail__title">${dateLabel}</h4>
      <p class="calendar-detail__status calendar-detail__status--${state}">
        ${stateLabels[state] || '—'}
      </p>
      <div class="calendar-detail__events">${eventsHtml}</div>
      <button
        type="button"
        class="btn btn--secondary btn--sm btn--full"
        id="toggle-availability-btn"
        data-date-key="${dateKey}"
      >
        ${isBlocked ? 'Liberar data' : 'Marcar como indisponível'}
      </button>
    </div>
  `;
}

function renderMonthGrid({ year, month, eventsByDate, blockedDates, maxEventsPerDay, selectedDateKey }) {
  const cells = buildMonthMatrix(year, month);
  const weekdays = WEEKDAYS.map((day) => `<div class="calendar-weekday">${day}</div>`).join('');
  const dayCells = cells
    .map((date) => {
      if (!date) return `<div class="calendar-day calendar-day--empty" aria-hidden="true"></div>`;
      return renderDayButton(date, { eventsByDate, blockedDates, maxEventsPerDay, selectedDateKey });
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

function renderYearGrid({ year, eventsByDate, blockedDates, maxEventsPerDay, selectedDateKey }) {
  const context = { eventsByDate, blockedDates, maxEventsPerDay, selectedDateKey };
  const months = Array.from({ length: 12 }, (_, month) => renderMiniMonth(year, month, context)).join('');

  return `<div class="calendar-year-grid">${months}</div>`;
}

function countMonthStats(year, month, eventsByDate, blockedDates, maxEventsPerDay) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let eventDays = 0;
  let availableDays = 0;
  let blockedDays = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = toDateKey(new Date(year, month, day));
    const events = eventsByDate.get(dateKey) || [];
    const state = getDayState(dateKey, events, blockedDates, maxEventsPerDay);

    if (events.length) eventDays += 1;
    if (state === 'blocked') blockedDays += 1;
    if (state === 'available') availableDays += 1;
  }

  return { eventDays, availableDays, blockedDays };
}

function countYearStats(year, eventsByDate, blockedDates, maxEventsPerDay) {
  return Array.from({ length: 12 }, (_, month) =>
    countMonthStats(year, month, eventsByDate, blockedDates, maxEventsPerDay)
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
    const { year, month, viewMode, eventsByDate, blockedDates, maxEventsPerDay, selectedDateKey } = state;

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
        ? renderYearGrid({ year, eventsByDate, blockedDates, maxEventsPerDay, selectedDateKey })
        : renderMonthGrid({ year, month, eventsByDate, blockedDates, maxEventsPerDay, selectedDateKey });

    const stats =
      viewMode === 'year'
        ? countYearStats(year, eventsByDate, blockedDates, maxEventsPerDay)
        : countMonthStats(year, month, eventsByDate, blockedDates, maxEventsPerDay);

    container.querySelector('#calendar-stat-events').textContent = String(stats.eventDays);
    container.querySelector('#calendar-stat-available').textContent = String(stats.availableDays);
    container.querySelector('#calendar-stat-blocked').textContent = String(stats.blockedDays);

    const selectedEvents = eventsByDate.get(selectedDateKey) || [];
    container.querySelector('#calendar-detail').innerHTML = renderDayDetail(
      selectedDateKey,
      selectedEvents,
      blockedDates,
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
    const button = event.target.closest('#toggle-availability-btn');
    if (!button) return;

    const dateKey = button.dataset.dateKey;
    if (!dateKey) return;

    button.disabled = true;
    try {
      state.blockedDates = await toggleBlockedDate(dateKey);
      showToast(
        state.blockedDates.includes(dateKey)
          ? 'Data marcada como indisponível.'
          : 'Data liberada com sucesso.',
        'success'
      );
      render();
    } catch (error) {
      console.error('[Calendar] Erro ao atualizar disponibilidade:', error);
      showToast('Erro ao atualizar disponibilidade.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  render();
}

export async function renderCalendarPage(container) {
  const now = new Date();

  container.innerHTML = `
    <div class="page-header">
      <h2 class="page-header__title">Calendário</h2>
      <p class="page-header__subtitle">Visualize seus eventos e controle a disponibilidade</p>
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
        <div class="card__body">
          <div class="calendar-grid" id="calendar-grid">
            <p class="text-muted">Carregando calendário...</p>
          </div>
        </div>
      </div>

      <aside class="calendar-sidebar">
        <div class="card">
          <div class="card__header"><h3 class="card__title">Legenda</h3></div>
          <div class="card__body">
            <ul class="calendar-legend">
              <li><span class="calendar-legend__dot calendar-legend__dot--available"></span> Disponível</li>
              <li><span class="calendar-legend__dot calendar-legend__dot--booked"></span> Ocupado</li>
              <li><span class="calendar-legend__dot calendar-legend__dot--tentative"></span> Orçamento</li>
              <li><span class="calendar-legend__dot calendar-legend__dot--blocked"></span> Indisponível</li>
            </ul>
          </div>
        </div>

        <div class="card">
          <div class="card__header"><h3 class="card__title" id="calendar-summary-title">Resumo do ano</h3></div>
          <div class="card__body">
            <dl class="detail-list">
              <div class="detail-list__item"><dt>Dias com evento</dt><dd id="calendar-stat-events">0</dd></div>
              <div class="detail-list__item"><dt>Dias disponíveis</dt><dd id="calendar-stat-available">0</dd></div>
              <div class="detail-list__item"><dt>Dias bloqueados</dt><dd id="calendar-stat-blocked">0</dd></div>
            </dl>
          </div>
        </div>

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
      blockedDates: data.blockedDates,
      maxEventsPerDay: data.maxEventsPerDay,
    };

    bindCalendarPage(container, state);
  } catch (error) {
    console.error('[Calendar] Erro:', error);
    container.querySelector('#calendar-grid').innerHTML =
      '<p class="text-error">Erro ao carregar calendário. Verifique as regras do Firestore.</p>';
  }
}
