import { createModal } from '../components/Modal.js';
import {
  createContract,
  updateContract,
} from '../services/contractService.js';
import {
  CONTRACT_STATUS,
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_PLAN_TYPES,
  PAYMENT_PLAN_LABELS,
  BRAZILIAN_STATES,
} from '../utils/constants.js';
import {
  formatCurrency,
  formatCurrencyInput,
  parseCurrencyInput,
  bindCurrencyInput,
  sumCents,
} from '../utils/currency.js';
import {
  calculatePaymentPlan,
  validatePaymentPlan,
  getInstallmentSummary,
} from '../utils/installments.js';
import { escapeHtml, renderIcons, showToast } from '../utils/dom.js';
import { toDateInputValue } from '../utils/dates.js';
import {
  addMonths,
  getFirstDueBeforeEvent,
  getPaymentPlanParams,
  parseFormDate,
  toDateInputString,
} from '../utils/paymentPlanPresets.js';

function paymentPlanTypeOptions(selected = PAYMENT_PLAN_TYPES.ENTRY_BEFORE_WEDDING) {
  return Object.entries(PAYMENT_PLAN_LABELS)
    .map(
      ([value, label]) =>
        `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`
    )
    .join('');
}

function getSelectedPaymentPlanType(form) {
  return form.querySelector('[name="paymentPlanType"]')?.value || PAYMENT_PLAN_TYPES.ENTRY_BEFORE_WEDDING;
}

function setFieldVisibility(form, visibleFields) {
  const map = {
    entryPercent: '[name="entryPercent"]',
    entryAmount: '[name="entryAmount"]',
    entryPaymentMethod: '[name="entryPaymentMethod"]',
    installmentCount: '[name="installmentCount"]',
    firstDueDate: '[name="firstDueDate"]',
    intervalMonths: '[name="installmentIntervalMonths"]',
  };

  Object.entries(map).forEach(([key, selector]) => {
    const field = form.querySelector(selector)?.closest('.form-field');
    if (field) field.hidden = !visibleFields.includes(key);
  });
}

function syncFirstDueFromEvent(form) {
  if (getSelectedPaymentPlanType(form) !== PAYMENT_PLAN_TYPES.ENTRY_BEFORE_WEDDING) return;

  const eventDate = parseFormDate(form.querySelector('[name="eventDate"]')?.value);
  const installmentCount = parseInt(form.querySelector('[name="installmentCount"]')?.value, 10) || 4;
  const firstDueDate = form.querySelector('[name="firstDueDate"]');
  const hint = form.querySelector('#first-due-hint');
  if (!firstDueDate) return;

  if (eventDate) {
    firstDueDate.value = toDateInputString(getFirstDueBeforeEvent(eventDate, installmentCount));
    firstDueDate.readOnly = true;
    if (hint) {
      hint.textContent = `Primeira parcela ${installmentCount} mês(es) antes do evento (${formatDateLabel(eventDate)}).`;
      hint.hidden = false;
    }
  } else {
    firstDueDate.readOnly = false;
    if (hint) {
      hint.textContent = 'Informe a data do evento para calcular os vencimentos automaticamente.';
      hint.hidden = false;
    }
  }
}

function formatDateLabel(date) {
  return date.toLocaleDateString('pt-BR');
}

function applyPaymentPlanPreset(form) {
  const planType = getSelectedPaymentPlanType(form);
  const entryPercent = form.querySelector('[name="entryPercent"]');
  const entryAmount = form.querySelector('[name="entryAmount"]');
  const entryPaymentMethod = form.querySelector('[name="entryPaymentMethod"]');
  const installmentCount = form.querySelector('[name="installmentCount"]');
  const installmentLabel = form.querySelector('#installment-count-label');
  const firstDueDate = form.querySelector('[name="firstDueDate"]');
  const firstDueLabel = form.querySelector('#first-due-label');
  const intervalMonths = form.querySelector('[name="installmentIntervalMonths"]');
  const hint = form.querySelector('#first-due-hint');
  const closingDate = parseFormDate(form.querySelector('[name="closingDate"]')?.value) || new Date();

  if (planType === PAYMENT_PLAN_TYPES.ENTRY_BEFORE_WEDDING) {
    setFieldVisibility(form, [
      'entryPercent',
      'entryAmount',
      'entryPaymentMethod',
      'installmentCount',
      'firstDueDate',
      'intervalMonths',
    ]);
    if (entryPercent) entryPercent.value = '30';
    if (entryPaymentMethod) entryPaymentMethod.value = PAYMENT_METHODS.PIX;
    if (installmentCount) {
      installmentCount.value = '4';
      installmentCount.min = '1';
      installmentCount.max = '24';
    }
    if (installmentLabel) installmentLabel.textContent = 'Nº de parcelas antes do casamento';
    if (firstDueLabel) firstDueLabel.textContent = 'Primeiro vencimento';
    if (intervalMonths) intervalMonths.value = '1';
    syncFirstDueFromEvent(form);
    updateTotalDisplay(form);
    return;
  }

  if (planType === PAYMENT_PLAN_TYPES.CREDIT_CARD) {
    setFieldVisibility(form, ['installmentCount', 'firstDueDate']);
    if (entryPercent) entryPercent.value = '0';
    if (entryAmount) entryAmount.value = '';
    if (entryPaymentMethod) entryPaymentMethod.value = PAYMENT_METHODS.CREDIT_CARD;
    if (installmentCount) {
      installmentCount.value = '10';
      installmentCount.min = '1';
      installmentCount.max = '10';
    }
    if (installmentLabel) installmentLabel.textContent = 'Parcelas no cartão (até 10x)';
    if (firstDueLabel) firstDueLabel.textContent = 'Primeira parcela no cartão';
    if (firstDueDate) {
      firstDueDate.readOnly = false;
      if (!firstDueDate.value) firstDueDate.value = toDateInputString(addMonths(closingDate, 1));
    }
    if (hint) hint.hidden = true;
    return;
  }

  setFieldVisibility(form, ['entryPaymentMethod']);
  if (entryPercent) entryPercent.value = '100';
  if (installmentCount) installmentCount.value = '0';
  if (entryPaymentMethod && !entryPaymentMethod.value) {
    entryPaymentMethod.value = PAYMENT_METHODS.PIX;
  }
  if (hint) hint.hidden = true;
  updateTotalDisplay(form);
}

function buildPaymentPlan(form, data, totalCents) {
  const planType = getSelectedPaymentPlanType(form);
  const params = getPaymentPlanParams({ planType, totalCents, data });
  const plan = calculatePaymentPlan({
    totalCents,
    ...params,
  });

  if (planType === PAYMENT_PLAN_TYPES.CREDIT_CARD) {
    return plan.map((inst) => ({
      ...inst,
      description: inst.number === 0 ? inst.description : `Cartão ${inst.number}/${params.installmentCount}`,
    }));
  }

  if (planType === PAYMENT_PLAN_TYPES.CASH) {
    return plan.map((inst) => ({
      ...inst,
      description: 'Pagamento à vista',
    }));
  }

  return plan;
}

function serviceTypeOptions(selected = '') {
  return Object.entries(SERVICE_TYPE_LABELS)
    .map(
      ([value, label]) =>
        `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`
    )
    .join('');
}

function paymentMethodOptions(selected = '') {
  return `<option value="">Selecione</option>${Object.entries(PAYMENT_METHOD_LABELS)
    .map(
      ([value, label]) =>
        `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`
    )
    .join('')}`;
}

function getContractFormStatus(contract) {
  if (contract?.status === CONTRACT_STATUS.CANCELLED) return CONTRACT_STATUS.CANCELLED;
  if (contract?.status === CONTRACT_STATUS.FINISHED) return CONTRACT_STATUS.FINISHED;
  return CONTRACT_STATUS.CONFIRMED;
}

function buildItemRow(item = {}, index = 0) {
  return `
    <div class="contract-item-row" data-item-index="${index}">
      <select class="form-field__input" name="itemServiceType_${index}">
        ${serviceTypeOptions(item.serviceType || SERVICE_TYPES.OTHER)}
      </select>
      <input class="form-field__input" name="itemDescription_${index}" placeholder="Descrição do serviço"
        value="${escapeHtml(item.description || '')}" />
      <input class="form-field__input currency-input" name="itemAmount_${index}" placeholder="0,00"
        value="${item.amount ? formatCurrencyInput(item.amount) : ''}" />
      <button type="button" class="btn btn--ghost btn--sm" data-remove-item="${index}" aria-label="Remover item">
        <i data-lucide="trash-2" aria-hidden="true"></i>
      </button>
    </div>
  `;
}

function collectItems(form) {
  const rows = form.querySelectorAll('.contract-item-row');
  const items = [];

  rows.forEach((row) => {
    const index = row.dataset.itemIndex;
    const description = form.querySelector(`[name="itemDescription_${index}"]`)?.value;
    const serviceType = form.querySelector(`[name="itemServiceType_${index}"]`)?.value;
    const amount = parseCurrencyInput(
      form.querySelector(`[name="itemAmount_${index}"]`)?.value
    );

    if (description?.trim() || amount > 0) {
      items.push({
        description: description?.trim() || SERVICE_TYPE_LABELS[serviceType] || 'Serviço',
        serviceType,
        amount,
      });
    }
  });

  return items;
}

function getFormData(form, existingContract = null) {
  const getValue = (name) => form.querySelector(`[name="${name}"]`)?.value;

  return {
    clientId: getValue('clientId'),
    title: getValue('title'),
    serviceType: getValue('serviceType'),
    description: getValue('description'),
    eventDate: getValue('eventDate'),
    eventTime: getValue('eventTime'),
    eventLocation: getValue('eventLocation'),
    city: getValue('city'),
    state: getValue('state'),
    closingDate: getValue('closingDate'),
    entryPercent: getValue('entryPercent') ?? existingContract?.entryPercent ?? '',
    entryAmount: getValue('entryAmount')
      ? parseCurrencyInput(getValue('entryAmount'))
      : existingContract?.entryAmount || 0,
    entryPaymentMethod: getValue('entryPaymentMethod') ?? existingContract?.entryPaymentMethod ?? '',
    paymentPlanType: getSelectedPaymentPlanType(form),
    installmentCount: getValue('installmentCount') ?? existingContract?.installmentCount ?? '',
    firstDueDate:
      getValue('firstDueDate') ||
      (existingContract?.firstDueDate ? toDateInputValue(existingContract.firstDueDate) : ''),
    installmentIntervalMonths:
      getValue('installmentIntervalMonths') ?? existingContract?.installmentIntervalMonths ?? 1,
    driveLink: getValue('driveLink'),
    contractLink: getValue('contractLink'),
    notes: getValue('notes'),
    status: getValue('status') || getContractFormStatus(existingContract),
  };
}

function validateContractForm(data, items, { isEdit = false } = {}) {
  const errors = {};
  if (!data.clientId) errors.clientId = 'Selecione um cliente.';
  if (!data.title?.trim()) errors.title = 'O título é obrigatório.';
  if (items.length === 0) errors.items = 'Adicione pelo menos um serviço.';
  if (items.some((i) => i.amount <= 0)) errors.items = 'Todos os serviços precisam ter valor.';
  const total = sumCents(items.map((i) => i.amount));
  if (total <= 0) errors.items = 'O valor total deve ser maior que zero.';
  if (data.entryPercent && (data.entryPercent < 0 || data.entryPercent > 100)) {
    errors.entryPercent = 'Percentual deve ser entre 0 e 100.';
  }
  if (!isEdit) {
    if (data.paymentPlanType === PAYMENT_PLAN_TYPES.ENTRY_BEFORE_WEDDING && !data.eventDate) {
      errors.eventDate = 'Informe a data do evento para calcular as parcelas antes do casamento.';
    }
    if (data.paymentPlanType === PAYMENT_PLAN_TYPES.CREDIT_CARD) {
      const count = parseInt(data.installmentCount, 10);
      if (!count || count < 1 || count > 10) {
        errors.installmentCount = 'Informe entre 1 e 10 parcelas no cartão.';
      }
    }
  }
  return errors;
}

function showFormErrors(form, errors) {
  form.querySelectorAll('[data-error]').forEach((el) => {
    el.hidden = true;
    el.textContent = '';
  });
  Object.entries(errors).forEach(([field, message]) => {
    const el = form.querySelector(`[data-error="${field}"]`);
    if (el) {
      el.textContent = message;
      el.hidden = false;
    }
  });
}

function updateTotalDisplay(form) {
  const items = collectItems(form);
  const total = sumCents(items.map((i) => i.amount));
  const totalEl = form.querySelector('#contract-total');
  if (totalEl) totalEl.textContent = formatCurrency(total);
  syncEntryFromPercent(form, total);
  return total;
}

function syncEntryFromPercent(form, totalCents) {
  const percentInput = form.querySelector('[name="entryPercent"]');
  const entryInput = form.querySelector('[name="entryAmount"]');
  if (!percentInput || !entryInput) return;

  const planType = getSelectedPaymentPlanType(form);
  if (planType === PAYMENT_PLAN_TYPES.CREDIT_CARD) {
    entryInput.value = '';
    return;
  }

  const percent = parseFloat(percentInput.value) || 0;
  if (percent > 0 && totalCents > 0) {
    const entry = Math.round((totalCents * percent) / 100);
    entryInput.value = formatCurrencyInput(entry);
  } else if (percent === 0) {
    entryInput.value = '';
  }
}

function openPreviewModal({ installments, totalCents, onConfirm }) {
  let plan = installments.map((i) => ({ ...i, dueDate: new Date(i.dueDate) }));

  const renderPreviewBody = () => {
    const summary = getInstallmentSummary(plan);
    return `
      <div class="installment-preview">
        <div class="installment-preview__summary">
          <div><span>Total do contrato</span><strong>${formatCurrency(totalCents)}</strong></div>
          <div><span>Entrada</span><strong>${formatCurrency(summary.entry)}</strong></div>
          <div><span>Total parcelado</span><strong>${formatCurrency(summary.parcelTotal)}</strong></div>
        </div>
        <div class="data-table-wrapper">
          <table class="data-table" id="preview-table">
            <thead>
              <tr><th>#</th><th>Descrição</th><th>Valor</th><th>Vencimento</th></tr>
            </thead>
            <tbody>
              ${plan
                .map(
                  (inst, idx) => `
                <tr data-preview-row="${idx}">
                  <td>${inst.number === 0 ? 'Entrada' : inst.number}</td>
                  <td><input class="form-field__input" data-field="description" value="${escapeHtml(inst.description)}" /></td>
                  <td><input class="form-field__input currency-input" data-field="amount" value="${formatCurrencyInput(inst.expectedAmount)}" /></td>
                  <td><input class="form-field__input" type="date" data-field="dueDate" value="${inst.dueDate.toISOString().slice(0, 10)}" /></td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
        <p class="installment-preview__total" id="preview-total-check">
          Soma: ${formatCurrency(plan.reduce((s, i) => s + i.expectedAmount, 0))}
        </p>
        <p class="form-field__error" id="preview-error" hidden></p>
      </div>
    `;
  };

  const footer = document.createElement('div');
  footer.className = 'modal__actions';
  footer.innerHTML = `
    <button type="button" class="btn btn--secondary" data-action="cancel">Voltar</button>
    <button type="button" class="btn btn--primary" data-action="confirm">Confirmar e salvar</button>
  `;

  const { close, body } = createModal({
    title: 'Prévia de parcelas',
    content: renderPreviewBody(),
    footer,
    size: 'lg',
  });

  function readPlanFromTable() {
    body.querySelectorAll('[data-preview-row]').forEach((row, idx) => {
      plan[idx].description = row.querySelector('[data-field="description"]').value;
      plan[idx].expectedAmount = parseCurrencyInput(row.querySelector('[data-field="amount"]').value);
      plan[idx].dueDate = new Date(row.querySelector('[data-field="dueDate"]').value);
    });
    const sum = plan.reduce((s, i) => s + i.expectedAmount, 0);
    body.querySelector('#preview-total-check').textContent = `Soma: ${formatCurrency(sum)}`;
  }

  body.querySelectorAll('.currency-input').forEach((input) => {
    bindCurrencyInput(input);
    input.addEventListener('input', readPlanFromTable);
  });
  body.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('change', readPlanFromTable);
  });

  footer.querySelector('[data-action="cancel"]').addEventListener('click', close);

  footer.querySelector('[data-action="confirm"]').addEventListener('click', async () => {
    readPlanFromTable();
    const errorEl = body.querySelector('#preview-error');

    if (!validatePaymentPlan(totalCents, plan)) {
      errorEl.textContent = `A soma das parcelas (${formatCurrency(sumCents(plan.map((p) => p.expectedAmount)))}) deve ser igual ao total do contrato (${formatCurrency(totalCents)}).`;
      errorEl.hidden = false;
      return;
    }

    errorEl.hidden = true;
    const btn = footer.querySelector('[data-action="confirm"]');
    btn.disabled = true;
    btn.classList.add('btn--loading');

    try {
      await onConfirm(plan);
      close();
    } catch (error) {
      btn.disabled = false;
      btn.classList.remove('btn--loading');
      errorEl.textContent = 'Erro ao salvar. Tente novamente.';
      errorEl.hidden = false;
    }
  });

  renderIcons(body);
}

export function openContractFormModal({
  clients,
  contract = null,
  items = [],
  onSaved,
}) {
  const isEdit = Boolean(contract);
  const form = document.createElement('form');
  form.id = 'contract-form';
  form.className = 'contract-form';
  form.noValidate = true;

  const clientOptions = clients
    .map(
      (c) =>
        `<option value="${c.id}" ${contract?.clientId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
    )
    .join('');

  const initialItems = items.length > 0 ? items : [{ serviceType: SERVICE_TYPES.OTHER, description: '', amount: 0 }];

  form.innerHTML = `
    <div class="form-section">
      <h3 class="form-section__title">Dados do contrato</h3>
      <div class="form-grid">
        <div class="form-field form-field--full">
          <label class="form-field__label">Cliente *</label>
          <select class="form-field__input" name="clientId" required>
            <option value="">Selecione um cliente</option>
            ${clientOptions}
          </select>
          <span class="form-field__error" data-error="clientId" hidden></span>
        </div>
        <div class="form-field">
          <label class="form-field__label">Título do contrato *</label>
          <input class="form-field__input" name="title" value="${escapeHtml(contract?.title || '')}" placeholder="Ex: Casamento Ana e Rafael" />
          <span class="form-field__error" data-error="title" hidden></span>
        </div>
        <div class="form-field">
          <label class="form-field__label">Tipo principal</label>
          <select class="form-field__input" name="serviceType">${serviceTypeOptions(contract?.serviceType)}</select>
        </div>
        <div class="form-field form-field--full">
          <label class="form-field__label">Descrição</label>
          <textarea class="form-field__input form-field__textarea" name="description" rows="2">${escapeHtml(contract?.description || '')}</textarea>
        </div>
        <input type="hidden" name="status" value="${getContractFormStatus(contract)}" />
      </div>
    </div>

    <div class="form-section">
      <h3 class="form-section__title">Evento</h3>
      <div class="form-grid">
        <div class="form-field">
          <label class="form-field__label">Data do evento</label>
          <input class="form-field__input" type="date" name="eventDate" value="${toDateInputValue(contract?.eventDate)}" />
          <span class="form-field__error" data-error="eventDate" hidden></span>
        </div>
        <div class="form-field">
          <label class="form-field__label">Horário</label>
          <input class="form-field__input" type="time" name="eventTime" value="${contract?.eventTime || ''}" />
        </div>
        <div class="form-field form-field--full">
          <label class="form-field__label">Local</label>
          <input class="form-field__input" name="eventLocation" value="${escapeHtml(contract?.eventLocation || '')}" />
        </div>
        <div class="form-field">
          <label class="form-field__label">Cidade</label>
          <input class="form-field__input" name="city" value="${escapeHtml(contract?.city || '')}" />
        </div>
        <div class="form-field">
          <label class="form-field__label">Estado</label>
          <select class="form-field__input" name="state">
            <option value="">UF</option>
            ${BRAZILIAN_STATES.map((uf) => `<option value="${uf}" ${contract?.state === uf ? 'selected' : ''}>${uf}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label class="form-field__label">Data de fechamento</label>
          <input class="form-field__input" type="date" name="closingDate" value="${toDateInputValue(contract?.closingDate)}" />
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section__header">
        <h3 class="form-section__title">Serviços contratados</h3>
        <button type="button" class="btn btn--secondary btn--sm" id="add-item-btn">
          <i data-lucide="plus" aria-hidden="true"></i> Adicionar
        </button>
      </div>
      <div class="contract-items" id="contract-items">
        ${initialItems.map((item, i) => buildItemRow(item, i)).join('')}
      </div>
      <span class="form-field__error" data-error="items" hidden></span>
      <div class="contract-total">
        <span>Total do contrato</span>
        <strong id="contract-total">${formatCurrency(sumCents(initialItems.map((i) => i.amount)))}</strong>
      </div>
    </div>

    ${
      !isEdit
        ? `
    <div class="form-section">
      <h3 class="form-section__title">Entrada e parcelamento</h3>
      <div class="form-grid">
        <div class="form-field form-field--full">
          <label class="form-field__label">Forma de pagamento</label>
          <select class="form-field__input" name="paymentPlanType">
            ${paymentPlanTypeOptions()}
          </select>
        </div>
        <div class="form-field">
          <label class="form-field__label">Percentual de entrada (%)</label>
          <input class="form-field__input" type="number" name="entryPercent" min="0" max="100" step="1"
            value="30" />
          <span class="form-field__error" data-error="entryPercent" hidden></span>
        </div>
        <div class="form-field">
          <label class="form-field__label">Valor da entrada</label>
          <input class="form-field__input" name="entryAmount" readonly
            title="Calculado automaticamente pelo percentual de entrada" />
        </div>
        <div class="form-field">
          <label class="form-field__label">Forma de pagamento da entrada</label>
          <select class="form-field__input" name="entryPaymentMethod">${paymentMethodOptions(PAYMENT_METHODS.PIX)}</select>
        </div>
        <div class="form-field">
          <label class="form-field__label" id="installment-count-label">Nº de parcelas antes do casamento</label>
          <input class="form-field__input" type="number" name="installmentCount" min="1" max="24" value="4" />
          <span class="form-field__error" data-error="installmentCount" hidden></span>
        </div>
        <div class="form-field">
          <label class="form-field__label" id="first-due-label">Primeiro vencimento</label>
          <input class="form-field__input" type="date" name="firstDueDate" />
          <p class="form-field__hint" id="first-due-hint"></p>
        </div>
        <div class="form-field">
          <label class="form-field__label">Intervalo (meses)</label>
          <input class="form-field__input" type="number" name="installmentIntervalMonths" min="1" max="12" value="1" />
        </div>
      </div>
    </div>
    `
        : `
    <p class="text-muted form-section">As parcelas são geradas na criação do contrato. Para alterar parcelas, contate o administrador.</p>
    `
    }

    <div class="form-section">
      <h3 class="form-section__title">Links e observações</h3>
      <div class="form-grid">
        <div class="form-field form-field--full">
          <label class="form-field__label">Pasta no Google Drive</label>
          <input class="form-field__input" type="url" name="driveLink" value="${escapeHtml(contract?.driveLink || '')}" placeholder="https://drive.google.com/..." />
        </div>
        <div class="form-field form-field--full">
          <label class="form-field__label">Contrato assinado</label>
          <input class="form-field__input" type="url" name="contractLink" value="${escapeHtml(contract?.contractLink || '')}" placeholder="https://..." />
        </div>
        <div class="form-field form-field--full">
          <label class="form-field__label">Observações</label>
          <textarea class="form-field__input form-field__textarea" name="notes" rows="2">${escapeHtml(contract?.notes || '')}</textarea>
        </div>
      </div>
    </div>
  `;

  let itemIndex = initialItems.length;

  const footer = document.createElement('div');
  footer.className = 'modal__actions';
  footer.innerHTML = `
    <button type="button" class="btn btn--secondary" data-action="cancel">Cancelar</button>
    ${
      !isEdit
        ? '<button type="button" class="btn btn--secondary" data-action="preview">Gerar prévia de parcelas</button>'
        : ''
    }
    <button type="submit" class="btn btn--primary" form="contract-form">${isEdit ? 'Salvar alterações' : 'Salvar contrato'}</button>
  `;

  const { close } = createModal({
    title: isEdit ? 'Editar contrato' : 'Novo contrato',
    content: form,
    footer,
    size: 'lg',
  });

  form.querySelectorAll('.currency-input').forEach(bindCurrencyInput);

  form.addEventListener('input', (event) => {
    if (event.target.classList.contains('currency-input')) {
      updateTotalDisplay(form);
    }
  });

  form.querySelector('#add-item-btn')?.addEventListener('click', () => {
    const container = form.querySelector('#contract-items');
    container.insertAdjacentHTML('beforeend', buildItemRow({}, itemIndex));
    itemIndex += 1;
    renderIcons(container);
    const newRow = container.lastElementChild;
    newRow?.querySelectorAll('.currency-input').forEach(bindCurrencyInput);
    bindItemEvents();
  });

  function bindItemEvents() {
    form.querySelectorAll('[data-remove-item]').forEach((btn) => {
      btn.onclick = () => {
        const rows = form.querySelectorAll('.contract-item-row');
        if (rows.length <= 1) {
          showToast('O contrato precisa ter pelo menos um serviço.', 'error');
          return;
        }
        btn.closest('.contract-item-row').remove();
        updateTotalDisplay(form);
      };
    });
  }

  bindItemEvents();
  if (!isEdit) {
    applyPaymentPlanPreset(form);
  }
  updateTotalDisplay(form);

  form.querySelector('[name="paymentPlanType"]')?.addEventListener('change', () => {
    applyPaymentPlanPreset(form);
  });

  form.querySelector('[name="eventDate"]')?.addEventListener('change', () => {
    syncFirstDueFromEvent(form);
  });

  form.querySelector('[name="closingDate"]')?.addEventListener('change', () => {
    if (getSelectedPaymentPlanType(form) === PAYMENT_PLAN_TYPES.CREDIT_CARD) {
      const firstDueDate = form.querySelector('[name="firstDueDate"]');
      const closingDate = parseFormDate(form.querySelector('[name="closingDate"]')?.value);
      if (firstDueDate && closingDate && !firstDueDate.value) {
        firstDueDate.value = toDateInputString(addMonths(closingDate, 1));
      }
    }
  });

  form.querySelector('[name="installmentCount"]')?.addEventListener('input', () => {
    syncFirstDueFromEvent(form);
  });

  form.querySelector('[name="entryPercent"]')?.addEventListener('input', () => {
    updateTotalDisplay(form);
  });

  footer.querySelector('[data-action="cancel"]').addEventListener('click', close);

  footer.querySelector('[data-action="preview"]')?.addEventListener('click', () => {
    const data = getFormData(form);
    const itemsCollected = collectItems(form);
    const errors = validateContractForm(data, itemsCollected);
    if (Object.keys(errors).length > 0) {
      showFormErrors(form, errors);
      return;
    }

    const totalCents = sumCents(itemsCollected.map((i) => i.amount));
    const plan = buildPaymentPlan(form, data, totalCents);

    const client = clients.find((c) => c.id === data.clientId);

    openPreviewModal({
      installments: plan,
      totalCents,
      onConfirm: async (confirmedPlan) => {
        await createContract(data, itemsCollected, confirmedPlan, client);
        showToast('Contrato criado com sucesso.', 'success');
        onSaved?.();
        close();
      },
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = footer.querySelector('[type="submit"]');

    try {
      const data = getFormData(form, contract);
      const itemsCollected = collectItems(form);
      const errors = validateContractForm(data, itemsCollected, { isEdit });

      if (Object.keys(errors).length > 0) {
        showFormErrors(form, errors);
        return;
      }

      const client = clients.find((c) => c.id === data.clientId);
      if (!client) {
        showToast('Cliente não encontrado.', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.classList.add('btn--loading');

      if (isEdit) {
        await updateContract(contract.id, data, itemsCollected, client, contract);
        showToast('Contrato atualizado.', 'success');
      } else {
        const totalCents = sumCents(itemsCollected.map((i) => i.amount));
        const plan = buildPaymentPlan(form, data, totalCents);
        await createContract(data, itemsCollected, plan, client);
        showToast('Contrato criado com sucesso.', 'success');
      }
      close();
      onSaved?.();
    } catch (error) {
      console.error('[Contract] Erro ao salvar:', error);
      showToast(error.message || 'Erro ao salvar contrato.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('btn--loading');
    }
  });

  renderIcons(form);
}
