import {
  getAllBudgetEntries,
  removeBudgetEntry,
} from '../services/calendarService.js';
import { openBudgetEntryModal } from '../components/BudgetEntryModal.js';
import { createEmptyState } from '../components/EmptyState.js';
import { showConfirmModal } from '../components/ConfirmModal.js';
import { createSkeletonRows } from '../components/Skeleton.js';
import { formatBudgetDate, formatBudgetPhone } from '../utils/budgetDisplay.js';
import { escapeHtml, getFirestoreErrorMessage, renderIcons, showToast } from '../utils/dom.js';

function renderBudgetCard(entry) {
  return `
    <article class="budget-card" data-entry-id="${entry.id}" data-date-key="${entry.dateKey}">
      <div class="budget-card__header">
        <div>
          <span class="budget-card__badge">Orçamento</span>
          <h3 class="budget-card__name">${escapeHtml(entry.clientName)}</h3>
        </div>
        <div class="budget-card__toolbar">
          <a href="#/calendario" class="btn btn--ghost btn--sm budget-card__icon-btn" aria-label="Ver no calendário" title="Ver no calendário">
            <i data-lucide="calendar-days" aria-hidden="true"></i>
          </a>
          <button
            type="button"
            class="btn btn--ghost btn--sm budget-card__icon-btn"
            data-action="delete"
            data-entry-id="${entry.id}"
            data-date-key="${entry.dateKey}"
            aria-label="Excluir orçamento"
          >
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <p class="budget-card__date">
        <i data-lucide="calendar" aria-hidden="true"></i>
        ${escapeHtml(formatBudgetDate(entry.dateKey))}
      </p>
      ${entry.phone ? `<p class="budget-card__phone">${escapeHtml(formatBudgetPhone(entry.phone))}</p>` : ''}
      ${entry.notes ? `<p class="budget-card__notes">${escapeHtml(entry.notes)}</p>` : ''}
      <footer class="budget-card__meta">
        <span>${escapeHtml(entry.createdBy?.name || 'Usuário')}</span>
      </footer>
    </article>
  `;
}

function renderBudgetsGrid(entries) {
  return `
    <div class="budgets-grid" id="budgets-grid">
      ${entries.map((entry) => renderBudgetCard(entry)).join('')}
    </div>
  `;
}

function bindBudgetsPage(container, state) {
  const render = () => {
    const listEl = container.querySelector('#budgets-list');
    if (!listEl) return;

    if (state.loading) {
      listEl.innerHTML = '';
      listEl.appendChild(createSkeletonRows(3, 3));
      return;
    }

    if (!state.entries.length) {
      listEl.innerHTML = '';
      listEl.appendChild(
        createEmptyState({
          icon: 'file-plus',
          title: 'Nenhum orçamento registrado',
          description: 'Clique em "Novo orçamento" para reservar uma data rapidamente.',
        })
      );
      return;
    }

    listEl.innerHTML = renderBudgetsGrid(state.entries);
    renderIcons(listEl);
  };

  const loadBudgets = async () => {
    state.loading = true;
    render();

    try {
      state.entries = await getAllBudgetEntries();
    } catch (error) {
      console.error('[Budgets] Erro ao carregar orçamentos:', error);
      showToast(getFirestoreErrorMessage(error, 'Erro ao carregar orçamentos.'), 'error');
      state.entries = [];
    } finally {
      state.loading = false;
      render();
    }
  };

  container.querySelector('#new-budget-btn')?.addEventListener('click', () => {
    openBudgetEntryModal({
      onSaved: async () => {
        await loadBudgets();
      },
    });
  });

  container.querySelector('#budgets-list')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action="delete"]');
    if (!button) return;

    const { entryId, dateKey } = button.dataset;
    if (!entryId || !dateKey) return;

    const entry = state.entries.find((item) => item.id === entryId);
    showConfirmModal({
      title: 'Excluir orçamento',
      message: `Tem certeza que deseja excluir o orçamento de "${escapeHtml(entry?.clientName || 'este cliente')}"?`,
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        await removeBudgetEntry(dateKey, entryId);
        showToast('Orçamento excluído.', 'success');
        await loadBudgets();
      },
    });
  });

  loadBudgets();
}

export function renderBudgetsPage(container) {
  container.innerHTML = `
    <div class="page-header page-header--with-action">
      <div>
        <h2 class="page-header__title">Orçamentos</h2>
        <p class="page-header__subtitle">Registre orçamentos rápidos com data, cliente e observações</p>
      </div>
      <button type="button" class="btn btn--primary" id="new-budget-btn">
        <i data-lucide="plus" aria-hidden="true"></i>
        Novo orçamento
      </button>
    </div>

    <section class="budgets-section">
      <div id="budgets-list"></div>
    </section>
  `;

  renderIcons(container);

  bindBudgetsPage(container, {
    entries: [],
    loading: true,
  });
}
