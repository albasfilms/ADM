import { createModal } from '../components/Modal.js';
import {
  createContract,
  updateContract,
} from '../services/contractService.js';
import { createClient, getClientById, getClientDisplayName } from '../services/clientService.js';
import {
  NEW_CLIENT_ID,
  isNewClientSelected,
  buildInlineClientFormSection,
  getClientFormData,
  showClientFormErrors,
  bindContractFieldsFromClient,
} from './clientForm.js';
import { validateClientForm } from '../utils/validators.js';
import {
  CONTRACT_STATUS,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
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
  calculateEntryAmount,
} from '../utils/installments.js';
import { escapeHtml, renderIcons, showToast } from '../utils/dom.js';
import { toDateInputValue } from '../utils/dates.js';
import {
  DEFAULT_CITY,
  DEFAULT_STATE,
  getCitiesForState,
  getDefaultCityForState,
} from '../utils/brazilLocations.js';
import {
  addMonths,
  getFirstDueBeforeEvent,
  getPaymentPlanParams,
  parseFormDate,
  toDateInputString,
} from '../utils/paymentPlanPresets.js';
import {
  CATALOG_SERVICE_ORDER,
  getServicePrice,
  hasCatalogPrice,
} from '../utils/servicePricing.js';
import { CONTRACT_ITEM_SERVICE_ORDER } from '../utils/contractServices.js';
import { resolveContractEventType } from '../utils/contractEventType.js';

function getItemsSubtotalCents(form) {
  const items = collectItems(form);
  return sumCents(items.map((item) => item.amount));
}

function isDiscountEnabled(form) {
  return Boolean(form.querySelector('#contract-discount-enabled')?.checked);
}

function getDiscountCents(form) {
  if (!isDiscountEnabled(form)) return 0;
  return parseCurrencyInput(form.querySelector('[name="discountAmount"]')?.value || '');
}

function getContractTotalCents(form) {
  return Math.max(0, getItemsSubtotalCents(form) - getDiscountCents(form));
}

function syncDiscountUI(form) {
  const field = form.querySelector('#contract-discount-field');
  const breakdown = form.querySelector('#contract-total-breakdown');
  const enabled = isDiscountEnabled(form);

  field?.classList.toggle('is-visible', enabled);
  breakdown?.classList.toggle('is-visible', enabled);

  if (!enabled) {
    const discountInput = form.querySelector('[name="discountAmount"]');
    if (discountInput) discountInput.value = '';
  }

  updateTotalDisplay(form);
}

function bindContractDiscountFields(form) {
  form.querySelector('#contract-discount-enabled')?.addEventListener('change', () => {
    syncDiscountUI(form);
  });

  form.querySelector('[name="discountAmount"]')?.addEventListener('input', () => {
    updateTotalDisplay(form);
  });

  syncDiscountUI(form);
}

function getContractDefaults(contract) {
  if (contract) {
    return {
      closingDate: toDateInputValue(contract.closingDate),
      eventTime: contract.eventTime || '16:00',
      state: contract.state || '',
      city: contract.city || '',
    };
  }

  return {
    closingDate: toDateInputString(new Date()),
    eventTime: '16:00',
    state: DEFAULT_STATE,
    city: DEFAULT_CITY,
  };
}

function renderCityOptions(state, selectedCity = '') {
  const cities = getCitiesForState(state);
  const options = cities
    .map((city) => `<option value="${escapeHtml(city)}" ${selectedCity === city ? 'selected' : ''}>${escapeHtml(city)}</option>`)
    .join('');

  if (selectedCity && !cities.includes(selectedCity)) {
    return `<option value="${escapeHtml(selectedCity)}" selected>${escapeHtml(selectedCity)}</option>${options}`;
  }

  if (!selectedCity && cities.length) {
    return options.replace(`value="${escapeHtml(cities[0])}"`, `value="${escapeHtml(cities[0])}" selected`);
  }

  return options || `<option value="">Selecione</option>`;
}

function bindStateCityFields(form) {
  const stateSelect = form.querySelector('[name="state"]');
  const citySelect = form.querySelector('[name="city"]');
  if (!stateSelect || !citySelect) return;

  const refreshCities = (preferredCity = '') => {
    const currentCity = preferredCity || citySelect.value;
    citySelect.innerHTML = renderCityOptions(stateSelect.value, currentCity);

    if (!citySelect.value && stateSelect.value) {
      citySelect.value = getDefaultCityForState(stateSelect.value);
    }
  };

  stateSelect.addEventListener('change', () => {
    refreshCities(getDefaultCityForState(stateSelect.value));
  });

  refreshCities(citySelect.value);
}

function syncInstallmentBreakdown(form) {
  const hint = form.querySelector('#installment-breakdown-hint');
  if (!hint) return;

  if (getSelectedPaymentPlanType(form) !== PAYMENT_PLAN_TYPES.ENTRY_BEFORE_WEDDING) {
    hint.hidden = true;
    hint.textContent = '';
    return;
  }

  const totalCents = getContractTotalCents(form);
  const installmentCount = parseInt(form.querySelector('[name="installmentCount"]')?.value, 10) || 0;
  const entryAmount = parseCurrencyInput(form.querySelector('[name="entryAmount"]')?.value || '');
  const entryPercent = parseFloat(form.querySelector('[name="entryPercent"]')?.value) || 0;
  const entry = entryAmount > 0 ? entryAmount : calculateEntryAmount(totalCents, entryPercent, null);

  if (totalCents <= 0 || installmentCount <= 0) {
    hint.hidden = true;
    hint.textContent = '';
    return;
  }

  const remaining = Math.max(0, totalCents - entry);

  if (remaining <= 0) {
    hint.textContent = 'Sem saldo para parcelar após a entrada.';
    hint.hidden = false;
    return;
  }

  const baseAmount = Math.floor(remaining / installmentCount);
  const lastAmount = remaining - baseAmount * (installmentCount - 1);

  if (installmentCount === 1) {
    hint.textContent = `Restante: ${formatCurrency(remaining)} em 1 parcela de ${formatCurrency(lastAmount)}.`;
  } else if (baseAmount === lastAmount) {
    hint.textContent = `Restante: ${formatCurrency(remaining)} em ${installmentCount} parcelas de ${formatCurrency(baseAmount)}.`;
  } else {
    hint.textContent = `Restante: ${formatCurrency(remaining)} — ${installmentCount - 1}x de ${formatCurrency(baseAmount)} + 1x de ${formatCurrency(lastAmount)}.`;
  }

  hint.hidden = false;
}

function formatInstallmentDescription(inst) {
  if (inst.number === 0) {
    return `Entrada — ${formatCurrency(inst.expectedAmount)}`;
  }
  return `Parcela ${inst.number} — ${formatCurrency(inst.expectedAmount)}`;
}

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
  form.querySelectorAll('[data-payment-field]').forEach((field) => {
    const key = field.dataset.paymentField;
    field.classList.toggle('is-visible', visibleFields.includes(key));
  });
}

function updatePaymentFieldLabels(form, planType) {
  const entryAmountLabel = form.querySelector('[data-payment-label="entryAmount"]');
  const entryPaymentLabel = form.querySelector('[data-payment-label="entryPaymentMethod"]');
  const installmentLabel = form.querySelector('#installment-count-label');
  const firstDueLabel = form.querySelector('#first-due-label');

  if (planType === PAYMENT_PLAN_TYPES.CASH) {
    if (entryAmountLabel) entryAmountLabel.textContent = 'Valor do pagamento';
    if (entryPaymentLabel) entryPaymentLabel.textContent = 'Forma de pagamento';
    if (firstDueLabel) firstDueLabel.textContent = 'Data do pagamento';
    return;
  }

  if (entryAmountLabel) entryAmountLabel.textContent = 'Valor da entrada';
  if (entryPaymentLabel) entryPaymentLabel.textContent = 'Forma de pagamento da entrada';

  if (planType === PAYMENT_PLAN_TYPES.CREDIT_CARD) {
    if (installmentLabel) installmentLabel.textContent = 'Parcelas no cartão (até 10x)';
    if (firstDueLabel) firstDueLabel.textContent = 'Primeira parcela no cartão';
    return;
  }

  if (installmentLabel) installmentLabel.textContent = 'Nº de parcelas antes do casamento';
  if (firstDueLabel) firstDueLabel.textContent = 'Primeiro vencimento';
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
    updatePaymentFieldLabels(form, planType);
    if (entryPercent) entryPercent.value = '30';
    if (entryAmount) entryAmount.readOnly = false;
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
    syncInstallmentBreakdown(form);
    return;
  }

  if (planType === PAYMENT_PLAN_TYPES.CREDIT_CARD) {
    setFieldVisibility(form, ['installmentCount']);
    updatePaymentFieldLabels(form, planType);
    if (entryPercent) entryPercent.value = '0';
    if (entryAmount) {
      entryAmount.value = '';
      entryAmount.readOnly = false;
    }
    if (entryPaymentMethod) entryPaymentMethod.value = PAYMENT_METHODS.CREDIT_CARD;
    if (installmentCount) {
      installmentCount.value = '10';
      installmentCount.min = '1';
      installmentCount.max = '10';
    }
    if (hint) hint.hidden = true;
    syncInstallmentBreakdown(form);
    return;
  }

  setFieldVisibility(form, ['entryAmount', 'firstDueDate', 'entryPaymentMethod']);
  updatePaymentFieldLabels(form, PAYMENT_PLAN_TYPES.CASH);
  if (entryPercent) entryPercent.value = '100';
  if (installmentCount) installmentCount.value = '0';
  if (entryPaymentMethod && !entryPaymentMethod.value) {
    entryPaymentMethod.value = PAYMENT_METHODS.PIX;
  }
  if (entryAmount) entryAmount.readOnly = true;
  if (firstDueDate) {
    firstDueDate.readOnly = false;
    if (!firstDueDate.value) firstDueDate.value = toDateInputString(closingDate);
  }
  if (hint) hint.hidden = true;
  updateTotalDisplay(form);
  syncInstallmentBreakdown(form);
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
      description: `Cartão de crédito em ${params.cardInstallmentCount || params.installmentCount || 1}x — ${formatCurrency(inst.expectedAmount)}`,
    }));
  }

  if (planType === PAYMENT_PLAN_TYPES.CASH) {
    return plan.map((inst) => ({
      ...inst,
      description: `Pagamento à vista — ${formatCurrency(inst.expectedAmount)}`,
    }));
  }

  return plan.map((inst) => ({
    ...inst,
    description: formatInstallmentDescription(inst),
  }));
}

function eventTypeOptions(selected = EVENT_TYPES.WEDDING) {
  return Object.entries(EVENT_TYPE_LABELS)
    .map(
      ([value, label]) =>
        `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`
    )
    .join('');
}

function contractItemServiceOptions(selected = '') {
  const extraServices = CONTRACT_ITEM_SERVICE_ORDER.filter(
    (value) => !CATALOG_SERVICE_ORDER.includes(value)
  );

  return [...CATALOG_SERVICE_ORDER, ...extraServices]
    .map(
      (value) =>
        `<option value="${value}" ${selected === value ? 'selected' : ''}>${SERVICE_TYPE_LABELS[value] || value}</option>`
    )
    .join('');
}

function getNextContractItem(form) {
  const selectedTypes = getSelectedServiceTypes(form);
  const lastType = selectedTypes[selectedTypes.length - 1];
  const lastIndex = lastType ? CONTRACT_ITEM_SERVICE_ORDER.indexOf(lastType) : -1;

  let nextType = CONTRACT_ITEM_SERVICE_ORDER[0];

  if (lastIndex !== -1 && lastIndex < CONTRACT_ITEM_SERVICE_ORDER.length - 1) {
    nextType = CONTRACT_ITEM_SERVICE_ORDER[lastIndex + 1];
  } else {
    const unused = CONTRACT_ITEM_SERVICE_ORDER.find((type) => !selectedTypes.includes(type));
    if (unused) nextType = unused;
  }

  const allTypes = [...selectedTypes, nextType];

  return {
    serviceType: nextType,
    description: SERVICE_TYPE_LABELS[nextType] || '',
    amount: hasCatalogPrice(nextType) ? getServicePrice(nextType, allTypes) : 0,
  };
}

function getSelectedServiceTypes(form) {
  const types = [];
  form.querySelectorAll('.contract-item-row').forEach((row) => {
    const index = row.dataset.itemIndex;
    const serviceType = form.querySelector(`[name="itemServiceType_${index}"]`)?.value;
    if (serviceType) types.push(serviceType);
  });
  return types;
}

function syncServicePrices(form) {
  const selectedTypes = getSelectedServiceTypes(form);

  form.querySelectorAll('.contract-item-row').forEach((row) => {
    const index = row.dataset.itemIndex;
    const serviceType = form.querySelector(`[name="itemServiceType_${index}"]`)?.value;
    const amountInput = form.querySelector(`[name="itemAmount_${index}"]`);
    const descriptionInput = form.querySelector(`[name="itemDescription_${index}"]`);

    if (!serviceType || !amountInput || !hasCatalogPrice(serviceType)) return;
    if (amountInput.dataset.autoPrice === 'false') return;

    const price = getServicePrice(serviceType, selectedTypes);
    amountInput.value = formatCurrencyInput(price);

    const label = SERVICE_TYPE_LABELS[serviceType] || '';
    if (descriptionInput && (!descriptionInput.value.trim() || descriptionInput.dataset.autoDescription === 'true')) {
      descriptionInput.value = label;
      descriptionInput.dataset.autoDescription = 'true';
    }
  });

  updateTotalDisplay(form);
}

function bindServiceItemPricing(form) {
  const itemsContainer = form.querySelector('#contract-items');
  if (!itemsContainer || itemsContainer.dataset.pricingBound === 'true') return;
  itemsContainer.dataset.pricingBound = 'true';

  itemsContainer.addEventListener('change', (event) => {
    const select = event.target.closest('select[name^="itemServiceType_"]');
    if (!select) return;

    const index = select.name.replace('itemServiceType_', '');
    const amountInput = form.querySelector(`[name="itemAmount_${index}"]`);
    const descriptionInput = form.querySelector(`[name="itemDescription_${index}"]`);

    if (amountInput) amountInput.dataset.autoPrice = 'true';
    if (descriptionInput) descriptionInput.dataset.autoDescription = 'true';

    if (descriptionInput && !descriptionInput.value.trim()) {
      descriptionInput.value = SERVICE_TYPE_LABELS[select.value] || '';
    }

    syncServicePrices(form);
  });

  itemsContainer.addEventListener('input', (event) => {
    if (event.target.name?.startsWith('itemAmount_')) {
      event.target.dataset.autoPrice = 'false';
    }
    if (event.target.name?.startsWith('itemDescription_')) {
      event.target.dataset.autoDescription = 'false';
    }
  });
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
  const serviceType = item.serviceType || SERVICE_TYPES.STORYMAKER;
  const autoPrice = item.amount ? '' : 'true';
  const autoDescription = item.description ? '' : 'true';
  const amount = item.amount || (hasCatalogPrice(serviceType) ? getServicePrice(serviceType, [serviceType]) : 0);
  const description = item.description || (hasCatalogPrice(serviceType) ? SERVICE_TYPE_LABELS[serviceType] : '');

  return `
    <div class="contract-item-row" data-item-index="${index}">
      <select class="form-field__input" name="itemServiceType_${index}">
        ${contractItemServiceOptions(serviceType)}
      </select>
      <input class="form-field__input" name="itemDescription_${index}" placeholder="Descrição do serviço"
        value="${escapeHtml(description)}" data-auto-description="${autoDescription}" />
      <input class="form-field__input currency-input" name="itemAmount_${index}" placeholder="0,00"
        value="${amount ? formatCurrencyInput(amount) : ''}" data-auto-price="${autoPrice}" />
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
  const clientMode = form.querySelector('[name="clientMode"]:checked')?.value;
  const clientId =
    clientMode === 'new'
      ? NEW_CLIENT_ID
      : clientMode === 'existing'
        ? getValue('existingClientId')
        : getValue('clientId');

  return {
    clientId,
    title: getValue('title'),
    eventType: getValue('eventType') || resolveContractEventType(existingContract || {}),
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
    discountEnabled: isDiscountEnabled(form),
    discountAmount: getDiscountCents(form),
    driveLink: getValue('driveLink'),
    contractLink: getValue('contractLink'),
    notes: '',
    status: getValue('status') || getContractFormStatus(existingContract),
  };
}

function validateContractForm(data, items, { isEdit = false, isNewClient = false } = {}) {
  const errors = {};
  if (!isNewClient && !data.clientId) errors.clientId = 'Selecione um cliente.';
  if (!data.title?.trim()) errors.title = 'O título é obrigatório.';
  if (items.length === 0) errors.items = 'Adicione pelo menos um serviço.';
  if (items.some((i) => i.amount <= 0)) errors.items = 'Todos os serviços precisam ter valor.';

  const subtotal = sumCents(items.map((i) => i.amount));
  const discount = data.discountEnabled ? Number(data.discountAmount) || 0 : 0;

  if (data.discountEnabled && discount <= 0) {
    errors.discountAmount = 'Informe o valor do desconto.';
  }

  if (data.discountEnabled && discount >= subtotal) {
    errors.discountAmount = 'O desconto deve ser menor que o subtotal dos serviços.';
  }

  const total = Math.max(0, subtotal - discount);
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
  const subtotal = getItemsSubtotalCents(form);
  const discount = getDiscountCents(form);
  const total = Math.max(0, subtotal - discount);
  const totalEl = form.querySelector('#contract-total');
  const subtotalEl = form.querySelector('#contract-subtotal');
  const discountEl = form.querySelector('#contract-discount-display');

  if (totalEl) totalEl.textContent = formatCurrency(total);
  if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
  if (discountEl) discountEl.textContent = formatCurrency(discount);

  syncEntryFromPercent(form, total);
  syncInstallmentBreakdown(form);
  return total;
}

function syncEntryFromPercent(form, totalCents) {
  const percentInput = form.querySelector('[name="entryPercent"]');
  const entryInput = form.querySelector('[name="entryAmount"]');
  if (!percentInput || !entryInput) return;

  const planType = getSelectedPaymentPlanType(form);
  if (planType === PAYMENT_PLAN_TYPES.CREDIT_CARD) {
    entryInput.value = '';
    entryInput.readOnly = false;
    return;
  }

  if (planType === PAYMENT_PLAN_TYPES.CASH) {
    if (totalCents > 0) {
      entryInput.value = formatCurrencyInput(totalCents);
    }
    entryInput.readOnly = true;
    return;
  }

  entryInput.readOnly = false;

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

async function resolveClientForContract(form, clientInlineForm, clientPanel, clients, data) {
  if (isNewClientSelected(data.clientId)) {
    const clientData = getClientFormData(clientInlineForm);
    const clientErrors = validateClientForm(clientData);

    if (Object.keys(clientErrors).length > 0) {
      showClientFormErrors(clientInlineForm, clientErrors);
      clientPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      throw new Error('client-validation');
    }

    const clientId = await createClient(clientData);
    data.clientId = clientId;
    const client = await getClientById(clientId);
    if (!client) {
      showToast('Cliente criado, mas não foi possível carregá-lo.', 'error');
      throw new Error('client-not-found');
    }
    return client;
  }

  const client = clients.find((c) => c.id === data.clientId);
  if (!client) {
    showToast('Cliente não encontrado.', 'error');
    throw new Error('client-not-found');
  }

  return client;
}

function showContractClientIdError(contentWrapper, message = '') {
  const errorEl = contentWrapper.querySelector('#existing-client-field [data-error="clientId"]');
  const select = contentWrapper.querySelector('#existing-client-select');

  if (!message) {
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
    select?.classList.remove('form-field__input--error');
    return;
  }

  if (errorEl) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }
  select?.classList.add('form-field__input--error');
  contentWrapper.querySelector('#existing-client-field')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildClientModeSection(clients) {
  const section = document.createElement('div');
  section.className = 'form-section contract-client-mode';
  section.id = 'contract-client-mode';

  const existingClientOptions = clients
    .map(
      (c) =>
        `<option value="${c.id}">${escapeHtml(getClientDisplayName(c))}</option>`
    )
    .join('');

  const hasExistingClients = clients.length > 0;

  section.innerHTML = `
    <h3 class="form-section__title">Cliente</h3>
    <div class="contract-client-mode__choices">
      <label class="form-radio">
        <input type="radio" name="clientMode" value="new" checked />
        Cadastrar novo cliente
      </label>
      <label class="form-radio ${hasExistingClients ? '' : 'form-radio--disabled'}">
        <input type="radio" name="clientMode" value="existing" ${hasExistingClients ? '' : 'disabled'} />
        Usar cliente cadastrado
      </label>
    </div>
    <div class="form-field form-field--full" id="existing-client-field">
      <label class="form-field__label" for="existing-client-select">Selecione o cliente *</label>
      <select class="form-field__input" id="existing-client-select" name="existingClientId">
        <option value="">Selecione um cliente</option>
        ${existingClientOptions}
      </select>
      <span class="form-field__error" data-error="clientId" hidden></span>
    </div>
    ${
      hasExistingClients
        ? ''
        : '<p class="text-muted contract-client-mode__hint">Nenhum cliente cadastrado ainda. Use a opção acima para cadastrar agora.</p>'
    }
  `;

  return section;
}

export function openContractFormModal({
  clients,
  contract = null,
  items = [],
  onSaved,
  onCreated,
}) {
  const isEdit = Boolean(contract);
  const defaults = getContractDefaults(contract);
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'contract-form-wrapper';

  let clientPanel = null;
  let clientInlineForm = null;

  const form = document.createElement('form');
  form.id = 'contract-form';
  form.className = 'contract-form';
  form.noValidate = true;

  const existingClientOptions = clients
    .map(
      (c) =>
        `<option value="${c.id}" ${contract?.clientId === c.id ? 'selected' : ''}>${escapeHtml(getClientDisplayName(c))}</option>`
    )
    .join('');

  const initialItems =
    items.length > 0
      ? items
      : [{ serviceType: SERVICE_TYPES.STORYMAKER, description: SERVICE_TYPE_LABELS[SERVICE_TYPES.STORYMAKER], amount: 0 }];
  const initialSubtotalCents = sumCents(initialItems.map((item) => item.amount));
  const initialDiscountAmount = contract?.discountAmount || 0;
  const initialDiscountEnabled = initialDiscountAmount > 0;
  const initialTotalCents = Math.max(0, initialSubtotalCents - initialDiscountAmount);

  form.innerHTML = `
    <div class="form-section contract-form__overview">
      <div class="form-grid">
        <div class="form-field">
          <label class="form-field__label">Título do contrato *</label>
          <input class="form-field__input" name="title" value="${escapeHtml(contract?.title || '')}" placeholder="Ex: Casamento Ana e Rafael" />
          <span class="form-field__error" data-error="title" hidden></span>
        </div>
        <div class="form-field">
          <label class="form-field__label">Modelo do evento</label>
          <select class="form-field__input" name="eventType">${eventTypeOptions(resolveContractEventType(contract || {}))}</select>
        </div>
      </div>
    </div>
    ${
      isEdit
        ? `
    <div class="form-section">
      <h3 class="form-section__title">Cliente</h3>
      <div class="form-grid">
        <div class="form-field form-field--full">
          <label class="form-field__label">Cliente *</label>
          <select class="form-field__input" name="clientId" required>
            <option value="">Selecione um cliente</option>
            ${existingClientOptions}
          </select>
          <span class="form-field__error" data-error="clientId" hidden></span>
        </div>
      </div>
    </div>
    `
        : ''
    }
    <div class="form-section">
      <h3 class="form-section__title">Dados do contrato</h3>
      <div class="form-grid">
        <div class="form-field form-field--full">
          <label class="form-field__label">Descrição</label>
          <textarea class="form-field__input form-field__textarea" name="description" rows="2">${escapeHtml(contract?.description || contract?.notes || '')}</textarea>
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
          <input class="form-field__input" type="time" name="eventTime" value="${defaults.eventTime}" />
        </div>
        <div class="form-field form-field--full">
          <label class="form-field__label">Local</label>
          <input class="form-field__input" name="eventLocation" value="${escapeHtml(contract?.eventLocation || '')}" />
        </div>
        <div class="form-field">
          <label class="form-field__label">Cidade</label>
          <select class="form-field__input" name="city">
            ${renderCityOptions(defaults.state, defaults.city)}
          </select>
        </div>
        <div class="form-field">
          <label class="form-field__label">Estado</label>
          <select class="form-field__input" name="state">
            <option value="">UF</option>
            ${BRAZILIAN_STATES.map((uf) => `<option value="${uf}" ${defaults.state === uf ? 'selected' : ''}>${uf}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label class="form-field__label">Data de fechamento</label>
          <input class="form-field__input" type="date" name="closingDate" value="${defaults.closingDate}" />
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
        <div class="contract-total__summary">
          <span>Total do contrato</span>
          <strong id="contract-total">${formatCurrency(initialTotalCents)}</strong>
        </div>
        <div class="contract-total__discount">
          <label class="form-checkbox" for="contract-discount-enabled">
            <input
              type="checkbox"
              id="contract-discount-enabled"
              name="discountEnabled"
              ${initialDiscountEnabled ? 'checked' : ''}
            />
            Dar desconto
          </label>
          <div class="contract-total__discount-field${initialDiscountEnabled ? ' is-visible' : ''}" id="contract-discount-field">
            <label class="form-field__label" for="contract-discount-amount">Valor do desconto</label>
            <input
              class="form-field__input currency-input"
              id="contract-discount-amount"
              name="discountAmount"
              value="${initialDiscountAmount ? formatCurrencyInput(initialDiscountAmount) : ''}"
              placeholder="0,00"
            />
            <span class="form-field__error" data-error="discountAmount" hidden></span>
          </div>
        </div>
        <div class="contract-total__breakdown${initialDiscountEnabled ? ' is-visible' : ''}" id="contract-total-breakdown">
          <span>Subtotal: <strong id="contract-subtotal">${formatCurrency(initialSubtotalCents)}</strong></span>
          <span>Desconto: -<strong id="contract-discount-display">${formatCurrency(initialDiscountAmount)}</strong></span>
        </div>
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
        <div class="form-field payment-plan-field is-visible" data-payment-field="entryPercent">
          <label class="form-field__label">Percentual de entrada (%)</label>
          <input class="form-field__input" type="number" name="entryPercent" min="0" max="100" step="1"
            value="30" />
          <span class="form-field__error" data-error="entryPercent" hidden></span>
        </div>
        <div class="form-field payment-plan-field is-visible" data-payment-field="entryAmount">
          <label class="form-field__label" data-payment-label="entryAmount">Valor da entrada</label>
          <input class="form-field__input currency-input" name="entryAmount"
            title="Informe o valor da entrada ou use o percentual acima" />
        </div>
        <div class="form-field payment-plan-field is-visible" data-payment-field="entryPaymentMethod">
          <label class="form-field__label" data-payment-label="entryPaymentMethod">Forma de pagamento da entrada</label>
          <select class="form-field__input" name="entryPaymentMethod">${paymentMethodOptions(PAYMENT_METHODS.PIX)}</select>
        </div>
        <div class="form-field payment-plan-field is-visible" data-payment-field="installmentCount">
          <label class="form-field__label" id="installment-count-label">Nº de parcelas antes do casamento</label>
          <input class="form-field__input" type="number" name="installmentCount" min="1" max="24" value="4" />
          <p class="form-field__hint" id="installment-breakdown-hint" hidden></p>
          <span class="form-field__error" data-error="installmentCount" hidden></span>
        </div>
        <div class="form-field payment-plan-field is-visible" data-payment-field="firstDueDate">
          <label class="form-field__label" id="first-due-label">Primeiro vencimento</label>
          <input class="form-field__input" type="date" name="firstDueDate" />
          <p class="form-field__hint" id="first-due-hint"></p>
        </div>
        <div class="form-field payment-plan-field is-visible" data-payment-field="intervalMonths">
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
      <h3 class="form-section__title">Links</h3>
      <div class="form-grid">
        <div class="form-field form-field--full">
          <label class="form-field__label">Pasta no Google Drive</label>
          <input class="form-field__input" type="url" name="driveLink" value="${escapeHtml(contract?.driveLink || '')}" placeholder="https://drive.google.com/..." />
        </div>
        <div class="form-field form-field--full">
          <label class="form-field__label">Contrato assinado</label>
          <input class="form-field__input" type="url" name="contractLink" value="${escapeHtml(contract?.contractLink || '')}" placeholder="https://..." />
        </div>
      </div>
    </div>
  `;

  contentWrapper.appendChild(form);

  if (!isEdit) {
    const overviewSection = form.querySelector('.contract-form__overview');
    const clientModeSection = buildClientModeSection(clients);
    const inlineClient = buildInlineClientFormSection(form);
    clientPanel = inlineClient.section;
    clientInlineForm = inlineClient.form;

    overviewSection.insertAdjacentElement('afterend', clientModeSection);
    clientModeSection.insertAdjacentElement('afterend', clientPanel);
  }

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
    <button type="submit" class="btn btn--primary" form="contract-form">${isEdit ? 'Salvar alterações' : 'Salvar cliente e contrato'}</button>
  `;

  const { close } = createModal({
    title: isEdit ? 'Editar contrato' : 'Novo contrato',
    content: contentWrapper,
    footer,
    size: 'lg',
  });

  const updateClientModeUI = () => {
    if (isEdit) return;

    const mode = contentWrapper.querySelector('[name="clientMode"]:checked')?.value || 'new';
    const isNew = mode === 'new';

    if (clientPanel) {
      clientPanel.classList.toggle('is-visible', isNew);
    }

    const existingField = contentWrapper.querySelector('#existing-client-field');
    if (existingField) {
      existingField.classList.toggle('is-visible', !isNew);
    }

    const submitBtn = footer.querySelector('[type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = isNew ? 'Salvar cliente e contrato' : 'Salvar contrato';
    }
  };

  contentWrapper.querySelectorAll('[name="clientMode"]').forEach((input) => {
    input.addEventListener('change', updateClientModeUI);
  });
  updateClientModeUI();

  if (clientInlineForm) {
    bindContractFieldsFromClient(form, clientInlineForm);
    renderIcons(clientPanel);
  }

  form.querySelectorAll('.currency-input').forEach(bindCurrencyInput);

  form.addEventListener('input', (event) => {
    if (event.target.classList.contains('currency-input')) {
      updateTotalDisplay(form);
    }
  });

  form.querySelector('#add-item-btn')?.addEventListener('click', () => {
    const container = form.querySelector('#contract-items');
    const nextItem = getNextContractItem(form);
    container.insertAdjacentHTML('beforeend', buildItemRow(nextItem, itemIndex));
    itemIndex += 1;
    renderIcons(container);
    const newRow = container.lastElementChild;
    newRow?.querySelectorAll('.currency-input').forEach(bindCurrencyInput);
    bindItemEvents();
    syncServicePrices(form);
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
        syncServicePrices(form);
      };
    });
  }

  bindItemEvents();
  bindServiceItemPricing(form);
  bindStateCityFields(form);
  bindContractDiscountFields(form);
  if (!isEdit) {
    applyPaymentPlanPreset(form);
    syncServicePrices(form);
  } else {
    updateTotalDisplay(form);
  }

  form.querySelector('[name="paymentPlanType"]')?.addEventListener('change', () => {
    applyPaymentPlanPreset(form);
  });

  form.querySelector('[name="eventDate"]')?.addEventListener('change', () => {
    syncFirstDueFromEvent(form);
  });

  form.querySelector('[name="closingDate"]')?.addEventListener('change', () => {
    if (getSelectedPaymentPlanType(form) === PAYMENT_PLAN_TYPES.CASH) {
      const firstDueDate = form.querySelector('[name="firstDueDate"]');
      const closingDate = parseFormDate(form.querySelector('[name="closingDate"]')?.value);
      if (firstDueDate && closingDate && !firstDueDate.value) {
        firstDueDate.value = toDateInputString(closingDate);
      }
    }
  });

  form.querySelector('[name="installmentCount"]')?.addEventListener('input', () => {
    syncFirstDueFromEvent(form);
    syncInstallmentBreakdown(form);
  });

  form.querySelector('[name="entryPercent"]')?.addEventListener('input', () => {
    updateTotalDisplay(form);
  });

  form.querySelector('[name="entryAmount"]')?.addEventListener('input', () => {
    syncInstallmentBreakdown(form);
  });

  footer.querySelector('[data-action="cancel"]').addEventListener('click', close);

  footer.querySelector('[data-action="preview"]')?.addEventListener('click', () => {
    const data = getFormData(form);
    const itemsCollected = collectItems(form);
    const isNewClient = isNewClientSelected(data.clientId);
    const errors = validateContractForm(data, itemsCollected, { isNewClient });

    if (Object.keys(errors).length > 0) {
      showFormErrors(form, errors);
      showContractClientIdError(contentWrapper, errors.clientId);
      return;
    }

    showContractClientIdError(contentWrapper);

    if (isNewClient) {
      const clientErrors = validateClientForm(getClientFormData(clientInlineForm));
      if (Object.keys(clientErrors).length > 0) {
        showClientFormErrors(clientInlineForm, clientErrors);
        clientPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }

    const totalCents = getContractTotalCents(form);
    const plan = buildPaymentPlan(form, data, totalCents);

    openPreviewModal({
      installments: plan,
      totalCents,
      onConfirm: async (confirmedPlan) => {
        try {
          const client = await resolveClientForContract(
            form,
            clientInlineForm,
            clientPanel,
            clients,
            data
          );
          const contractId = await createContract(data, itemsCollected, confirmedPlan, client);
          showToast('Cliente e contrato criados com sucesso.', 'success');
          onCreated?.(contractId);
          onSaved?.();
          close();
        } catch (error) {
          if (error.message !== 'client-validation' && error.message !== 'client-not-found') {
            console.error('[Contracts] Erro ao criar contrato:', error);
            showToast('Não foi possível salvar o contrato.', 'error');
          }
        }
      },
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = footer.querySelector('[type="submit"]');

    try {
      const data = getFormData(form, contract);
      const itemsCollected = collectItems(form);
      const isNewClient = isNewClientSelected(data.clientId);
      const errors = validateContractForm(data, itemsCollected, { isEdit, isNewClient });

      if (Object.keys(errors).length > 0) {
        showFormErrors(form, errors);
        showContractClientIdError(contentWrapper, errors.clientId);
        return;
      }

      showContractClientIdError(contentWrapper);

      const client = await resolveClientForContract(
        form,
        clientInlineForm,
        clientPanel,
        clients,
        data
      );

      submitBtn.disabled = true;
      submitBtn.classList.add('btn--loading');

      if (isEdit) {
        await updateContract(contract.id, data, itemsCollected, client, contract);
        showToast('Contrato atualizado.', 'success');
      } else {
        const totalCents = getContractTotalCents(form);
        const plan = buildPaymentPlan(form, data, totalCents);
        const contractId = await createContract(data, itemsCollected, plan, client);
        showToast('Cliente e contrato criados com sucesso.', 'success');
        close();
        onSaved?.();
        onCreated?.(contractId);
        return;
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
