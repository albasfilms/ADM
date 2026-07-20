import { createModal } from '../components/Modal.js';
import {
  createClient,
  updateClient,
  validateClientSubmission,
  resolveClientCoupleFields,
  splitCoupleName,
} from '../services/clientService.js';
import {
  CLIENT_STATUS,
  PERSON_TYPES,
  BRAZILIAN_STATES,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
} from '../utils/constants.js';
import {
  formatPhone,
  formatDocument,
} from '../utils/validators.js';
import {
  parseQuickClientText,
  QUICK_CLIENT_COUPLE_TEMPLATE,
  QUICK_CLIENT_SINGLE_TEMPLATE,
  isPlaceholderValue,
} from '../utils/parseQuickClient.js';
import { copyToClipboard } from '../utils/whatsapp.js';
import { escapeHtml, showToast } from '../utils/dom.js';

export const NEW_CLIENT_ID = '__new_client__';

export function isNewClientSelected(clientId) {
  return clientId === NEW_CLIENT_ID;
}

function getFirstName(fullName = '') {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0];
}

function getCoupleFirstNames(clientData) {
  let brideName = clientData.name?.trim() || '';
  let groomName = clientData.partnerName?.trim() || '';

  if (!groomName && /\s+e\s+/i.test(brideName)) {
    const split = splitCoupleName(brideName);
    brideName = split.name;
    groomName = split.partnerName;
  }

  return {
    brideFirst: getFirstName(brideName),
    groomFirst: getFirstName(groomName),
  };
}

function isWeddingEventType(eventType) {
  return eventType === EVENT_TYPES.WEDDING;
}

function getContractEventType(contractForm) {
  return contractForm?.querySelector('[name="eventType"]')?.value || EVENT_TYPES.WEDDING;
}

function isClientFormWedding(form) {
  return form?.dataset.weddingEvent !== 'false';
}

function setElementHidden(element, hidden) {
  if (!element) return;
  element.hidden = hidden;
  element.toggleAttribute('hidden', hidden);
  element.setAttribute('aria-hidden', hidden ? 'true' : 'false');
}

function getClientFormLabels({ wedding, coupleActive, personType }) {
  const isCompany = personType === PERSON_TYPES.COMPANY;

  if (wedding && coupleActive) {
    return {
      nameLabel: 'Noiva *',
      docLabel: 'CPF noiva',
      partnerNameLabel: 'Noivo *',
      partnerDocLabel: 'CPF noivo *',
      namePlaceholder: 'Nome da noiva',
    };
  }

  if (!wedding) {
    return {
      nameLabel: 'Cliente *',
      docLabel: isCompany ? 'CNPJ' : 'CPF',
      partnerNameLabel: '',
      partnerDocLabel: '',
      namePlaceholder: 'Nome do cliente',
    };
  }

  return {
    nameLabel: 'Nome completo *',
    docLabel: isCompany ? 'CNPJ' : 'CPF',
    partnerNameLabel: 'Nome completo (noivo/a 2) *',
    partnerDocLabel: 'CPF (noivo/a 2) *',
    namePlaceholder: 'Nome da noiva ou cliente',
  };
}

function updateQuickRegisterUi(form, contractForm) {
  const wedding = isWeddingEventType(getContractEventType(contractForm));
  const quickInput = form.querySelector('#client-quick-register');
  const quickHint = form.querySelector('.quick-register__hint');

  if (quickInput) {
    quickInput.placeholder = wedding
      ? 'Cole aqui os dados preenchidos pelos noivos e do evento'
      : 'Cole aqui os dados do cliente e do evento';
  }

  if (quickHint) {
    quickHint.textContent = wedding
      ? 'Copie o modelo e envie aos noivos; depois cole aqui a resposta.'
      : 'Copie o modelo e envie ao cliente; depois cole aqui a resposta.';
  }
}

export function syncClientFormForEventType(clientForm, contractForm) {
  if (!clientForm || !contractForm) return;

  const wedding = isWeddingEventType(getContractEventType(contractForm));
  clientForm.dataset.weddingEvent = wedding ? 'true' : 'false';
  clientForm.classList.toggle('client-form--single-client', !wedding);

  const coupleToggleWrap = clientForm.querySelector('#client-couple-toggle');
  const isCoupleCheckbox = clientForm.querySelector('#client-isCouple');
  const personType = clientForm.querySelector('[name="personType"]')?.value || PERSON_TYPES.INDIVIDUAL;

  if (!wedding) {
    setCoupleMode(clientForm, false, { preserveNames: true, wedding: false });
    setElementHidden(coupleToggleWrap, true);
  } else {
    setElementHidden(coupleToggleWrap, personType === PERSON_TYPES.COMPANY);
    setCoupleMode(clientForm, isCoupleCheckbox?.checked ?? true, {
      preserveNames: true,
      wedding: true,
    });
  }

  updateQuickRegisterUi(clientForm, contractForm);
}

export function buildSuggestedContractTitle(contractForm, clientData) {
  const eventType = contractForm.querySelector('[name="eventType"]')?.value;
  const eventLabel = EVENT_TYPE_LABELS[eventType] || 'Casamento';
  const wedding = isWeddingEventType(eventType);
  const { brideFirst, groomFirst } = getCoupleFirstNames(clientData);

  if (wedding && brideFirst && groomFirst) {
    return `${eventLabel} ${brideFirst} e ${groomFirst}`;
  }

  if (brideFirst) {
    return `${eventLabel} ${brideFirst}`;
  }

  return '';
}

export function syncContractTitleFromClient(contractForm, clientForm) {
  const titleInput = contractForm?.querySelector('[name="title"]');
  if (!titleInput || titleInput.dataset.userEdited === 'true') return;

  const suggestedTitle = buildSuggestedContractTitle(contractForm, getClientFormData(clientForm));
  if (suggestedTitle) {
    titleInput.value = suggestedTitle;
  }
}

export function bindContractFieldsFromClient(contractForm, clientForm) {
  if (!contractForm || !clientForm) return;

  const syncTitle = () => {
    syncContractTitleFromClient(contractForm, clientForm);
  };

  const syncLocation = () => {
    const citySelect = contractForm.querySelector('[name="city"]');
    const stateSelect = contractForm.querySelector('[name="state"]');
    const clientCity = clientForm.querySelector('#client-city')?.value?.trim();
    const clientState = clientForm.querySelector('#client-state')?.value?.trim();

    if (stateSelect && clientState) {
      if (!stateSelect.value || stateSelect.value !== clientState) {
        stateSelect.value = clientState;
        stateSelect.dispatchEvent(new Event('change'));
      }
    }

    if (citySelect && clientCity) {
      const ensureCityOption = (select, city) => {
        const exists = [...select.options].some((option) => option.value === city);
        if (!exists) {
          const option = document.createElement('option');
          option.value = city;
          option.textContent = city;
          select.prepend(option);
        }
      };

      ensureCityOption(citySelect, clientCity);
      if (!citySelect.value || citySelect.value !== clientCity) {
        citySelect.value = clientCity;
      }
    }
  };

  const markTitleEdited = () => {
    const titleInput = contractForm.querySelector('[name="title"]');
    if (titleInput) titleInput.dataset.userEdited = 'true';
  };

  contractForm.querySelector('[name="title"]')?.addEventListener('input', markTitleEdited);
  contractForm.querySelector('[name="eventType"]')?.addEventListener('change', () => {
    syncClientFormForEventType(clientForm, contractForm);
    syncTitle();
  });

  syncClientFormForEventType(clientForm, contractForm);

  ['#client-name', '#client-partnerName', '#client-isCouple'].forEach((selector) => {
    clientForm.querySelector(selector)?.addEventListener('input', syncTitle);
    clientForm.querySelector(selector)?.addEventListener('change', syncTitle);
  });

  ['#client-city', '#client-state'].forEach((selector) => {
    clientForm.querySelector(selector)?.addEventListener('change', syncLocation);
    clientForm.querySelector(selector)?.addEventListener('input', syncLocation);
  });

  syncTitle();
}

function setCoupleMode(form, enabled, { preserveNames = true, wedding = null } = {}) {
  const coupleFields = form.querySelector('#client-couple-fields');
  const coupleToggleWrap = form.querySelector('#client-couple-toggle');
  const isCoupleCheckbox = form.querySelector('#client-isCouple');
  const nameLabel = form.querySelector('[data-name-label]');
  const docLabelEl = form.querySelector('[data-doc-label]');
  const nameInput = form.querySelector('#client-name');
  const partnerNameInput = form.querySelector('#client-partnerName');
  const personType = form.querySelector('[name="personType"]')?.value || PERSON_TYPES.INDIVIDUAL;

  if (!coupleFields || !isCoupleCheckbox) return;

  const isWedding = wedding ?? form.dataset.weddingEvent !== 'false';
  const isCompany = personType === PERSON_TYPES.COMPANY;
  const active = enabled && !isCompany && isWedding;

  isCoupleCheckbox.checked = active;
  setElementHidden(coupleFields, !active);
  setElementHidden(coupleToggleWrap, isCompany || !isWedding);

  const labels = getClientFormLabels({
    wedding: isWedding,
    coupleActive: active,
    personType,
  });

  if (nameLabel) nameLabel.textContent = labels.nameLabel;
  if (docLabelEl) docLabelEl.textContent = labels.docLabel;
  if (nameInput && labels.namePlaceholder) nameInput.placeholder = labels.namePlaceholder;

  const partnerNameLabel = form.querySelector('[data-partner-name-label]');
  const partnerDocLabel = form.querySelector('[data-partner-doc-label]');
  if (partnerNameLabel) partnerNameLabel.textContent = labels.partnerNameLabel;
  if (partnerDocLabel) partnerDocLabel.textContent = labels.partnerDocLabel;

  if (!active && partnerNameInput) {
    const partnerDocumentInput = form.querySelector('#client-partnerDocument');

    if (preserveNames && isWedding && partnerNameInput.value.trim() && nameInput) {
      const first = nameInput.value.trim();
      const second = partnerNameInput.value.trim();
      if (first && second && !/\s+e\s+/i.test(first)) {
        nameInput.value = `${first} e ${second}`;
      }
    }

    partnerNameInput.value = '';
    if (partnerDocumentInput) partnerDocumentInput.value = '';
  }

  if (active && preserveNames && nameInput && partnerNameInput && !partnerNameInput.value.trim()) {
    const split = splitCoupleName(nameInput.value);
    if (split.partnerName) {
      nameInput.value = split.name;
      partnerNameInput.value = split.partnerName;
    }
  }
}

function applyQuickClientParse(form, parsed, { contractForm = null } = {}) {
  const documentInput = form.querySelector('#client-document');
  const wedding = contractForm
    ? isWeddingEventType(getContractEventType(contractForm))
    : form.dataset.weddingEvent !== 'false';

  if (parsed.name) form.querySelector('#client-name').value = parsed.name;

  if (parsed.document) {
    documentInput.value = formatDocument(parsed.document, PERSON_TYPES.INDIVIDUAL);
  }

  if (parsed.isCouple && wedding) {
    if (parsed.partnerName) {
      form.querySelector('#client-partnerName').value = parsed.partnerName;
    }

    if (parsed.partnerDocument) {
      form.querySelector('#client-partnerDocument').value = formatDocument(
        parsed.partnerDocument,
        PERSON_TYPES.INDIVIDUAL
      );
    }

    setCoupleMode(form, true, { wedding: true });
  } else {
    setCoupleMode(form, false, { wedding });
  }

  if (parsed.whatsapp) {
    form.querySelector('#client-whatsapp').value = formatPhone(parsed.whatsapp);
  }

  if (parsed.email) form.querySelector('#client-email').value = parsed.email;
  if (parsed.instagram) form.querySelector('#client-instagram').value = parsed.instagram;
  if (parsed.address) form.querySelector('#client-address').value = parsed.address;

  const clientCity =
    parsed.city && !isPlaceholderValue(parsed.city)
      ? parsed.city
      : parsed.eventCity && !isPlaceholderValue(parsed.eventCity)
        ? parsed.eventCity
        : '';
  if (clientCity) form.querySelector('#client-city').value = clientCity;

  const clientState =
    parsed.state && !isPlaceholderValue(parsed.state)
      ? parsed.state
      : parsed.eventState && !isPlaceholderValue(parsed.eventState)
        ? parsed.eventState
        : '';
  if (clientState) {
    const stateSelect = form.querySelector('#client-state');
    const option = [...stateSelect.options].find((opt) => opt.value === clientState);
    if (option) stateSelect.value = clientState;
  }

  form.querySelector('#client-name')?.dispatchEvent(new Event('input', { bubbles: true }));
  form.querySelector('#client-partnerName')?.dispatchEvent(new Event('input', { bubbles: true }));
  form.querySelector('#client-city')?.dispatchEvent(new Event('change', { bubbles: true }));
  form.querySelector('#client-state')?.dispatchEvent(new Event('change', { bubbles: true }));

  if (contractForm) {
    syncClientFormForEventType(form, contractForm);
  }
}

export function applyQuickContractParse(contractForm, parsed) {
  if (!contractForm || !parsed) return;

  if (parsed.eventDate) {
    const input = contractForm.querySelector('[name="eventDate"]');
    if (input) {
      input.value = parsed.eventDate;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  if (parsed.eventTime) {
    const input = contractForm.querySelector('[name="eventTime"]');
    if (input) input.value = parsed.eventTime;
  }

  if (parsed.eventLocation) {
    const input = contractForm.querySelector('[name="eventLocation"]');
    if (input) input.value = parsed.eventLocation;
  }

  const stateSelect = contractForm.querySelector('[name="state"]');
  const citySelect = contractForm.querySelector('[name="city"]');
  const eventState =
    parsed.eventState && !isPlaceholderValue(parsed.eventState) ? parsed.eventState : '';
  const eventCity =
    parsed.eventCity && !isPlaceholderValue(parsed.eventCity) ? parsed.eventCity : '';

  const ensureCityOption = (select, city) => {
    const exists = [...select.options].some((option) => option.value === city);
    if (!exists) {
      const option = document.createElement('option');
      option.value = city;
      option.textContent = city;
      select.prepend(option);
    }
  };

  const applyEventCity = () => {
    if (!eventCity || !citySelect) return;
    ensureCityOption(citySelect, eventCity);
    citySelect.value = eventCity;
  };

  if (eventState && stateSelect) {
    stateSelect.value = eventState;
    stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  applyEventCity();
  if (eventState) {
    setTimeout(applyEventCity, 0);
  }

  if (parsed.notes) {
    const input = contractForm.querySelector('[name="description"]');
    if (input) input.value = parsed.notes;
  }
}

function bindQuickClientRegister(form, contractForm = null) {
  const quickInput = form.querySelector('#client-quick-register');
  const copyTemplateBtn = form.querySelector('#client-quick-copy-template-btn');
  if (!quickInput) return;

  const runParse = () => {
    const text = quickInput.value.trim();
    if (!text) {
      showToast('Cole as informações do cliente na caixa de cadastro rápido.', 'info');
      return;
    }

    const parsed = parseQuickClientText(text);
    const filledCount = Object.values(parsed).filter((value) => Boolean(value)).length;

    if (!filledCount) {
      showToast('Não foi possível identificar dados no texto colado.', 'warning');
      return;
    }

    applyQuickClientParse(form, parsed, { contractForm });
    applyQuickContractParse(contractForm, parsed);
    if (contractForm) {
      syncContractTitleFromClient(contractForm, form);
    }
    showToast('Campos preenchidos automaticamente.', 'success');
  };

  quickInput.addEventListener('paste', () => {
    setTimeout(runParse, 0);
  });

  copyTemplateBtn?.addEventListener('click', async () => {
    const wedding = isWeddingEventType(getContractEventType(contractForm));
    const template = wedding ? QUICK_CLIENT_COUPLE_TEMPLATE : QUICK_CLIENT_SINGLE_TEMPLATE;

    try {
      await copyToClipboard(template);
      showToast(
        wedding ? 'Modelo copiado! Envie para os noivos preencherem.' : 'Modelo copiado! Envie ao cliente preencher.',
        'success'
      );
    } catch (error) {
      console.error('[Clients] Erro ao copiar modelo:', error);
      showToast('Não foi possível copiar o modelo.', 'error');
    }
  });
}

export function buildClientForm(client = null, { contractForm = null } = {}) {
  const form = document.createElement('form');
  form.className = 'client-form';
  form.noValidate = true;

  const coupleFields = resolveClientCoupleFields(client);
  const eventType = getContractEventType(contractForm);
  const wedding = isWeddingEventType(eventType);
  form.dataset.weddingEvent = wedding ? 'true' : 'false';
  if (!wedding) {
    form.classList.add('client-form--single-client');
  }

  const personType = client?.personType || PERSON_TYPES.INDIVIDUAL;
  const isCoupleMode = client ? coupleFields.isCouple : wedding;
  const coupleActive = isCoupleMode && personType !== PERSON_TYPES.COMPANY && wedding;
  const labels = getClientFormLabels({ wedding, coupleActive, personType });
  const quickRegisterPlaceholder = wedding
    ? 'Cole aqui os dados preenchidos pelos noivos e do evento'
    : 'Cole aqui os dados do cliente e do evento';
  const quickRegisterHint = wedding
    ? 'Copie o modelo e envie aos noivos; depois cole aqui a resposta.'
    : 'Copie o modelo e envie ao cliente; depois cole aqui a resposta.';

  form.innerHTML = `
    ${
      client
        ? ''
        : `
    <div class="quick-register form-field form-field--full">
      <label class="form-field__label" for="client-quick-register">Cadastro rápido</label>
      <textarea
        class="form-field__input form-field__textarea quick-register__input"
        id="client-quick-register"
        rows="6"
        placeholder="${quickRegisterPlaceholder}"
      ></textarea>
      <div class="quick-register__actions">
        <button type="button" class="btn btn--secondary btn--sm" id="client-quick-copy-template-btn">
          <i data-lucide="copy" aria-hidden="true"></i> Copiar modelo
        </button>
        <span class="quick-register__hint text-muted">${quickRegisterHint}</span>
      </div>
    </div>
    `
    }
    <div class="form-grid">
      <div class="form-field form-field--full" id="client-couple-toggle" ${!wedding || personType === PERSON_TYPES.COMPANY ? 'hidden' : ''}>
        <label class="form-checkbox" for="client-isCouple">
          <input
            type="checkbox"
            id="client-isCouple"
            name="isCouple"
            value="true"
            ${coupleActive ? 'checked' : ''}
          />
          Cadastro de noivos (casamento)
        </label>
      </div>

      <div class="form-field form-field--full">
        <label class="form-field__label" for="client-name" data-name-label>${labels.nameLabel}</label>
        <input class="form-field__input" id="client-name" name="name" required
          value="${escapeHtml(coupleFields.name || '')}" placeholder="${labels.namePlaceholder}" />
        <span class="form-field__error" data-error="name" hidden></span>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="client-document" data-doc-label>${labels.docLabel}</label>
        <input class="form-field__input" id="client-document" name="document"
          value="${escapeHtml(client?.document ? formatDocument(client.document, personType) : '')}"
          placeholder="${personType === PERSON_TYPES.COMPANY ? '00.000.000/0000-00' : '000.000.000-00'}" />
        <span class="form-field__error" data-error="document" hidden></span>
      </div>

      <div
        class="client-couple-fields form-field form-field--full"
        id="client-couple-fields"
        ${coupleActive ? '' : 'hidden'}
      >
        <div class="form-grid">
          <div class="form-field form-field--full">
            <label class="form-field__label" for="client-partnerName" data-partner-name-label>${labels.partnerNameLabel}</label>
            <input
              class="form-field__input"
              id="client-partnerName"
              name="partnerName"
              value="${escapeHtml(coupleFields.partnerName || '')}"
              placeholder="Nome completo do noivo"
            />
            <span class="form-field__error" data-error="partnerName" hidden></span>
          </div>

          <div class="form-field">
            <label class="form-field__label" for="client-partnerDocument" data-partner-doc-label>${labels.partnerDocLabel}</label>
            <input
              class="form-field__input"
              id="client-partnerDocument"
              name="partnerDocument"
              value="${escapeHtml(
                coupleFields.partnerDocument
                  ? formatDocument(coupleFields.partnerDocument, PERSON_TYPES.INDIVIDUAL)
                  : ''
              )}"
              placeholder="000.000.000-00"
            />
            <span class="form-field__error" data-error="partnerDocument" hidden></span>
          </div>
        </div>
      </div>

      <input type="hidden" name="personType" value="${personType}" />

      <div class="form-field">
        <label class="form-field__label" for="client-whatsapp">WhatsApp</label>
        <input class="form-field__input" id="client-whatsapp" name="whatsapp"
          value="${escapeHtml((client?.whatsapp || client?.phone) ? formatPhone(client.whatsapp || client.phone) : '')}" placeholder="(00) 00000-0000" />
        <span class="form-field__error" data-error="whatsapp" hidden></span>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="client-email">E-mail</label>
        <input class="form-field__input" type="email" id="client-email" name="email"
          value="${escapeHtml(client?.email || '')}" placeholder="email@exemplo.com" />
        <span class="form-field__error" data-error="email" hidden></span>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="client-instagram">Instagram</label>
        <input class="form-field__input" id="client-instagram" name="instagram"
          value="${escapeHtml(client?.instagram || '')}" placeholder="@usuario" />
      </div>

      <div class="form-field form-field--full">
        <label class="form-field__label" for="client-address">Endereço</label>
        <input class="form-field__input" id="client-address" name="address"
          value="${escapeHtml(client?.address || '')}" placeholder="Rua, número, bairro" />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="client-city">Cidade</label>
        <input class="form-field__input" id="client-city" name="city"
          value="${escapeHtml(client?.city || '')}" />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="client-state">Estado</label>
        <select class="form-field__input" id="client-state" name="state">
          <option value="">Selecione</option>
          ${BRAZILIAN_STATES.map(
            (uf) =>
              `<option value="${uf}" ${client?.state === uf ? 'selected' : ''}>${uf}</option>`
          ).join('')}
        </select>
      </div>

      ${
        client
          ? `
        <div class="form-field">
          <label class="form-field__label" for="client-status">Status</label>
          <select class="form-field__input" id="client-status" name="status">
            <option value="${CLIENT_STATUS.ACTIVE}" ${client.status === CLIENT_STATUS.ACTIVE ? 'selected' : ''}>Ativo</option>
            <option value="${CLIENT_STATUS.INACTIVE}" ${client.status === CLIENT_STATUS.INACTIVE ? 'selected' : ''}>Inativo</option>
          </select>
        </div>
      `
          : ''
      }
    </div>
  `;

  const documentInput = form.querySelector('#client-document');
  const whatsappInput = form.querySelector('#client-whatsapp');
  const isCoupleCheckbox = form.querySelector('#client-isCouple');
  const partnerDocumentInput = form.querySelector('#client-partnerDocument');

  isCoupleCheckbox?.addEventListener('change', () => {
    setCoupleMode(form, isCoupleCheckbox.checked, { wedding: isClientFormWedding(form) });
  });

  documentInput.addEventListener('input', () => {
    documentInput.value = formatDocument(
      documentInput.value,
      form.querySelector('[name="personType"]')?.value || PERSON_TYPES.INDIVIDUAL
    );
  });

  partnerDocumentInput?.addEventListener('input', () => {
    partnerDocumentInput.value = formatDocument(partnerDocumentInput.value, PERSON_TYPES.INDIVIDUAL);
  });

  whatsappInput.addEventListener('input', () => {
    whatsappInput.value = formatPhone(whatsappInput.value);
  });

  if (!client) {
    bindQuickClientRegister(form, contractForm);
  }

  if (contractForm) {
    syncClientFormForEventType(form, contractForm);
  }

  return form;
}

export function getClientFormData(form) {
  const data = Object.fromEntries(new FormData(form));
  data.isCouple = form.querySelector('#client-isCouple')?.checked || false;
  data.personType = data.personType || PERSON_TYPES.INDIVIDUAL;

  if (!data.isCouple) {
    data.partnerName = '';
    data.partnerDocument = '';
  }

  if (!form.querySelector('[name="status"]')) {
    data.status = CLIENT_STATUS.ACTIVE;
  }
  return data;
}

export function showClientFormErrors(form, errors) {
  form.querySelectorAll('[data-error]').forEach((el) => {
    el.hidden = true;
    el.textContent = '';
  });
  form.querySelectorAll('.form-field__input--error').forEach((el) => {
    el.classList.remove('form-field__input--error');
  });

  Object.entries(errors).forEach(([field, message]) => {
    const errorEl = form.querySelector(`[data-error="${field}"]`);
    const input = form.querySelector(`[name="${field}"]`);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }
    if (input) input.classList.add('form-field__input--error');
  });
}

export function openClientFormModal(client = null, onSaved) {
  const isEdit = Boolean(client);
  const form = buildClientForm(client);

  const footer = document.createElement('div');
  footer.className = 'modal__actions';
  footer.innerHTML = `
    <button type="button" class="btn btn--secondary" data-action="cancel">Cancelar</button>
    <button type="submit" class="btn btn--primary" form="client-form-submit" id="client-save-btn">
      ${isEdit ? 'Salvar alterações' : 'Cadastrar cliente'}
    </button>
  `;

  form.id = 'client-form-submit';

  const { close } = createModal({
    title: isEdit ? 'Editar cliente' : 'Novo cliente',
    content: form,
    footer,
    size: 'lg',
  });

  footer.querySelector('[data-action="cancel"]').addEventListener('click', close);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = getClientFormData(form);
    const errors = await validateClientSubmission(data, { excludeClientId: client?.id });

    if (Object.keys(errors).length > 0) {
      showClientFormErrors(form, errors);
      return;
    }

    const saveBtn = footer.querySelector('#client-save-btn');
    saveBtn.disabled = true;
    saveBtn.classList.add('btn--loading');

    try {
      if (isEdit) {
        await updateClient(client.id, data);
        showToast('Cliente atualizado com sucesso.', 'success');
      } else {
        const id = await createClient(data);
        showToast('Cliente cadastrado com sucesso.', 'success');
        onSaved?.(id);
      }
      close();
      onSaved?.();
    } catch (error) {
      console.error('[Clients] Erro ao salvar:', error);
      showToast(error.message || 'Não foi possível salvar o cliente. Tente novamente.', 'error');
      saveBtn.disabled = false;
      saveBtn.classList.remove('btn--loading');
    }
  });
}
export function buildInlineClientFormSection(contractForm = null) {
  const section = document.createElement('div');
  section.className = 'contract-form__client-panel';

  const heading = document.createElement('h3');
  heading.className = 'form-section__title';
  heading.textContent = 'Cadastro do cliente';

  const form = buildClientForm(null, { contractForm });
  form.id = 'client-inline-form';
  form.addEventListener('submit', (event) => event.preventDefault());

  section.appendChild(heading);
  section.appendChild(form);
  return { section, form };
}
