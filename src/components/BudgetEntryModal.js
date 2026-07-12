import { addBudgetEntry } from '../services/calendarService.js';
import { createModal } from './Modal.js';
import { getDefaultBudgetDateValue } from '../utils/budgetDisplay.js';
import { bindCurrencyInput, parseCurrencyInput } from '../utils/currency.js';
import { getFirestoreErrorMessage, renderIcons, showToast } from '../utils/dom.js';

export function openBudgetEntryModal({ dateKey = '', onSaved } = {}) {
  const fixedDate = Boolean(dateKey);
  const defaultDate = dateKey || getDefaultBudgetDateValue();

  const form = document.createElement('form');
  form.className = 'calendar-budget-form';
  form.innerHTML = `
    ${
      fixedDate
        ? `<input type="hidden" id="budget-date" name="eventDate" value="${defaultDate}" />`
        : `
      <div class="form-field">
        <label class="form-field__label" for="budget-date">Data do evento *</label>
        <input
          type="date"
          class="form-field__input"
          id="budget-date"
          name="eventDate"
          value="${defaultDate}"
          required
        />
      </div>
    `
    }
    <div class="form-field">
      <label class="form-field__label" for="budget-client-name">Nome do cliente *</label>
      <input
        type="text"
        class="form-field__input"
        id="budget-client-name"
        name="clientName"
        placeholder="Ex.: Ana e Rafael"
        maxlength="120"
        required
      />
    </div>
    <div class="form-field">
      <label class="form-field__label" for="budget-phone">Telefone</label>
      <input
        type="tel"
        class="form-field__input"
        id="budget-phone"
        name="phone"
        placeholder="(11) 99999-9999"
        maxlength="20"
      />
    </div>
    <div class="form-field">
      <label class="form-field__label" for="budget-amount">Valor</label>
      <input
        type="text"
        class="form-field__input currency-input"
        id="budget-amount"
        name="amount"
        placeholder="0,00"
        inputmode="decimal"
      />
    </div>
    <div class="form-field">
      <label class="form-field__label" for="budget-notes">Observação</label>
      <textarea
        class="form-field__textarea"
        id="budget-notes"
        name="notes"
        rows="4"
        placeholder="Detalhes do orçamento, tipo de evento..."
      ></textarea>
    </div>
  `;

  const footer = document.createElement('div');
  footer.className = 'modal__actions';
  footer.innerHTML = `
    <button type="button" class="btn btn--secondary" data-action="cancel">Cancelar</button>
    <button type="submit" class="btn btn--primary" form="calendar-budget-form" id="budget-save-btn">
      <i data-lucide="save" aria-hidden="true"></i>
      Salvar orçamento
    </button>
  `;

  form.id = 'calendar-budget-form';

  const { close } = createModal({
    title: 'Registrar orçamento',
    content: form,
    footer,
    size: 'md',
  });

  footer.querySelector('[data-action="cancel"]').addEventListener('click', close);
  renderIcons(footer);
  form.querySelectorAll('.currency-input').forEach(bindCurrencyInput);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const selectedDateKey = form.querySelector('#budget-date')?.value || '';
    const clientName = form.querySelector('#budget-client-name')?.value || '';
    const phone = form.querySelector('#budget-phone')?.value || '';
    const amount = parseCurrencyInput(form.querySelector('#budget-amount')?.value || '');
    const notes = form.querySelector('#budget-notes')?.value || '';

    if (!selectedDateKey) {
      showToast('Informe a data do evento.', 'error');
      form.querySelector('#budget-date')?.focus();
      return;
    }

    if (!clientName.trim()) {
      showToast('Informe o nome do cliente.', 'error');
      form.querySelector('#budget-client-name')?.focus();
      return;
    }

    const saveBtn = footer.querySelector('#budget-save-btn');
    saveBtn.disabled = true;
    saveBtn.classList.add('btn--loading');

    try {
      const result = await addBudgetEntry(selectedDateKey, { clientName, phone, notes, amount });
      showToast('Orçamento registrado com sucesso.', 'success');
      close();
      await onSaved?.(result);
    } catch (error) {
      console.error('[Budget] Erro ao registrar orçamento:', error);
      showToast(getFirestoreErrorMessage(error, error.message || 'Erro ao registrar orçamento.'), 'error');
      saveBtn.disabled = false;
      saveBtn.classList.remove('btn--loading');
    }
  });

  setTimeout(() => {
    const focusTarget = fixedDate
      ? form.querySelector('#budget-client-name')
      : form.querySelector('#budget-date');
    focusTarget?.focus();
  }, 0);
}
