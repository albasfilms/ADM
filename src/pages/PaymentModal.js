import { createModal } from '../components/Modal.js';
import { registerPayment } from '../services/paymentService.js';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '../utils/constants.js';
import {
  formatCurrency,
  formatCurrencyInput,
  parseCurrencyInput,
  bindCurrencyInput,
} from '../utils/currency.js';
import { getInstallmentRemaining } from '../utils/installmentStatus.js';
import { renderIcons, showToast } from '../utils/dom.js';
import { getCurrentUser } from '../appState.js';

function paymentMethodOptions() {
  return `<option value="">Selecione</option>${Object.entries(PAYMENT_METHOD_LABELS)
    .map(([v, l]) => `<option value="${v}">${l}</option>`)
    .join('')}`;
}

export function openPaymentModal({ contractId, installment, onSaved }) {
  const remaining = getInstallmentRemaining(installment);
  const form = document.createElement('form');
  form.className = 'payment-form';
  form.innerHTML = `
    <div class="payment-form__info">
      <p><strong>${installment.number === 0 ? 'Entrada' : `Parcela ${installment.number}`}</strong> — ${installment.description}</p>
      <p>Valor previsto: ${formatCurrency(installment.expectedAmount)}</p>
      <p>Saldo restante: <strong>${formatCurrency(remaining)}</strong></p>
    </div>
    <div class="form-grid">
      <div class="form-field">
        <label class="form-field__label">Valor recebido *</label>
        <input class="form-field__input currency-input" name="amount" value="${formatCurrencyInput(remaining)}" required />
        <span class="form-field__error" data-error="amount" hidden></span>
      </div>
      <div class="form-field">
        <label class="form-field__label">Data do pagamento *</label>
        <input class="form-field__input" type="date" name="paymentDate" value="${new Date().toISOString().slice(0, 10)}" required />
      </div>
      <div class="form-field">
        <label class="form-field__label">Forma de pagamento *</label>
        <select class="form-field__input" name="paymentMethod" required>${paymentMethodOptions()}</select>
      </div>
      <div class="form-field form-field--full">
        <label class="form-field__label">Observações</label>
        <textarea class="form-field__input form-field__textarea" name="notes" rows="2"></textarea>
      </div>
    </div>
  `;

  form.querySelectorAll('.currency-input').forEach(bindCurrencyInput);

  const footer = document.createElement('div');
  footer.className = 'modal__actions';
  footer.innerHTML = `
    <button type="button" class="btn btn--secondary" data-action="cancel">Cancelar</button>
    <button type="submit" class="btn btn--primary" form="payment-form">Registrar pagamento</button>
  `;
  form.id = 'payment-form';

  const { close } = createModal({
    title: 'Registrar pagamento',
    content: form,
    footer,
  });

  footer.querySelector('[data-action="cancel"]').addEventListener('click', close);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const amount = parseCurrencyInput(form.querySelector('[name="amount"]').value);
    const paymentDate = form.querySelector('[name="paymentDate"]').value;
    const paymentMethod = form.querySelector('[name="paymentMethod"]').value;
    const notes = form.querySelector('[name="notes"]').value;
    const errorEl = form.querySelector('[data-error="amount"]');

    if (!amount || amount <= 0) {
      errorEl.textContent = 'Informe um valor válido.';
      errorEl.hidden = false;
      return;
    }

    if (!paymentMethod) {
      showToast('Selecione a forma de pagamento.', 'error');
      return;
    }

    const submitBtn = footer.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.classList.add('btn--loading');

    try {
      await registerPayment({
        contractId,
        installmentId: installment.id,
        amount,
        paymentDate,
        paymentMethod,
        notes,
        user: getCurrentUser(),
      });
      showToast('Pagamento registrado com sucesso.', 'success');
      close();
      onSaved?.();
    } catch (error) {
      showToast(error.message || 'Erro ao registrar pagamento.', 'error');
      submitBtn.disabled = false;
      submitBtn.classList.remove('btn--loading');
    }
  });

  renderIcons(form);
}
