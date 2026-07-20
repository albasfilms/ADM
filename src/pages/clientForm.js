import { createModal } from '../components/Modal.js';
import {
  createClient,
  updateClient,
  resolveClientCoupleFields,
  splitCoupleName,
} from '../services/clientService.js';
import {
  CLIENT_STATUS,
  PERSON_TYPES,
  BRAZILIAN_STATES,
  EVENT_TYPE_LABELS,
} from '../utils/constants.js';
import {
  validateClientForm,
  formatPhone,
  formatDocument,
} from '../utils/validators.js';
import { parseQuickClientText, QUICK_CLIENT_COUPLE_TEMPLATE } from '../utils/parseQuickClient.js';
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

export function buildSuggestedContractTitle(contractForm, clientData) {
  const eventType = contractForm.querySelector('[name="eventType"]')?.value;
  const eventLabel = EVENT_TYPE_LABELS[eventType] || 'Casamento';
  const { brideFirst, groomFirst } = getCoupleFirstNames(clientData);

  if (brideFirst && groomFirst) {
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

    if (stateSelect && clientState && !stateSelect.value) {
      stateSelect.value = clientState;
      stateSelect.dispatchEvent(new Event('change'));
    }

    if (citySelect && clientCity && !citySelect.value) {
      const option = [...citySelect.options].find((opt) => opt.value === clientCity);
      if (option) citySelect.value = clientCity;
    }
  };

  const markTitleEdited = () => {
    const titleInput = contractForm.querySelector('[name="title"]');
    if (titleInput) titleInput.dataset.userEdited = 'true';
  };

  contractForm.querySelector('[name="title"]')?.addEventListener('input', markTitleEdited);
  contractForm.querySelector('[name="eventType"]')?.addEventListener('change', syncTitle);

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

function setCoupleMode(form, enabled, { preserveNames = true } = {}) {
  const coupleFields = form.querySelector('#client-couple-fields');
  const coupleToggleWrap = form.querySelector('#client-couple-toggle');
  const isCoupleCheckbox = form.querySelector('#client-isCouple');
  const nameLabel = form.querySelector('[data-name-label]');
  const docLabelEl = form.querySelector('[data-doc-label]');
  const nameInput = form.querySelector('#client-name');
  const partnerNameInput = form.querySelector('#client-partnerName');
  const personType = form.querySelector('[name="personType"]')?.value || PERSON_TYPES.INDIVIDUAL;

  if (!coupleFields || !isCoupleCheckbox) return;

  const isCompany = personType === PERSON_TYPES.COMPANY;
  const active = enabled && !isCompany;

  isCoupleCheckbox.checked = active;
  coupleFields.hidden = !active;
  if (coupleToggleWrap) {
    coupleToggleWrap.hidden = isCompany;
  }

  if (nameLabel) {
    nameLabel.textContent = active ? 'Noiva *' : 'Nome completo *';
  }

  if (docLabelEl) {
    docLabelEl.textContent = active ? 'CPF noiva' : isCompany ? 'CNPJ' : 'CPF';
  }

  const partnerNameLabel = form.querySelector('[data-partner-name-label]');
  const partnerDocLabel = form.querySelector('[data-partner-doc-label]');
  if (partnerNameLabel) {
    partnerNameLabel.textContent = active ? 'Noivo *' : 'Nome completo (noivo/a 2) *';
  }
  if (partnerDocLabel) {
    partnerDocLabel.textContent = active ? 'CPF noivo *' : 'CPF (noivo/a 2) *';
  }

  if (!active && preserveNames && partnerNameInput?.value.trim() && nameInput) {
    const first = nameInput.value.trim();
    const second = partnerNameInput.value.trim();
    if (first && second && !/\s+e\s+/i.test(first)) {
      nameInput.value = `${first} e ${second}`;
    }
    partnerNameInput.value = '';
    const partnerDocumentInput = form.querySelector('#client-partnerDocument');
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

function applyQuickClientParse(form, parsed) {
  const documentInput = form.querySelector('#client-document');

  if (parsed.name) form.querySelector('#client-name').value = parsed.name;

  if (parsed.document) {
    documentInput.value = formatDocument(parsed.document, PERSON_TYPES.INDIVIDUAL);
  }

  if (parsed.isCouple) {
    if (parsed.partnerName) {
      form.querySelector('#client-partnerName').value = parsed.partnerName;
    }

    if (parsed.partnerDocument) {
      form.querySelector('#client-partnerDocument').value = formatDocument(
        parsed.partnerDocument,
        PERSON_TYPES.INDIVIDUAL
      );
    }

    setCoupleMode(form, true);
  } else {
    setCoupleMode(form, false);
  }

  if (parsed.phone) {
    form.querySelector('#client-phone').value = formatPhone(parsed.phone);
  }

  if (parsed.whatsapp) {
    form.querySelector('#client-whatsapp').value = formatPhone(parsed.whatsapp);
  }

  if (parsed.email) form.querySelector('#client-email').value = parsed.email;
  if (parsed.instagram) form.querySelector('#client-instagram').value = parsed.instagram;
  if (parsed.address) form.querySelector('#client-address').value = parsed.address;
  if (parsed.city) form.querySelector('#client-city').value = parsed.city;

  if (parsed.state) {
    const stateSelect = form.querySelector('#client-state');
    const option = [...stateSelect.options].find((opt) => opt.value === parsed.state);
    if (option) stateSelect.value = parsed.state;
  }

  form.querySelector('#client-name')?.dispatchEvent(new Event('input', { bubbles: true }));
  form.querySelector('#client-partnerName')?.dispatchEvent(new Event('input', { bubbles: true }));
  form.querySelector('#client-city')?.dispatchEvent(new Event('change', { bubbles: true }));
  form.querySelector('#client-state')?.dispatchEvent(new Event('change', { bubbles: true }));
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

  if (parsed.eventState) {
    const stateSelect = contractForm.querySelector('[name="state"]');
    if (stateSelect && !stateSelect.value) {
      stateSelect.value = parsed.eventState;
      stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  if (parsed.eventCity) {
    const citySelect = contractForm.querySelector('[name="city"]');
    if (citySelect && !citySelect.value) {
      const setCity = () => {
        const option = [...citySelect.options].find((opt) => opt.value === parsed.eventCity);
        if (option) citySelect.value = parsed.eventCity;
      };

      if (parsed.eventState) {
        setTimeout(setCity, 0);
      } else {
        setCity();
      }
    }
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

    applyQuickClientParse(form, parsed);
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
    try {
      await copyToClipboard(QUICK_CLIENT_COUPLE_TEMPLATE);
      showToast('Modelo copiado! Envie para os noivos preencherem.', 'success');
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
  const isCoupleMode = client ? coupleFields.isCouple : true;
  const personType = client?.personType || PERSON_TYPES.INDIVIDUAL;
  const coupleActive = isCoupleMode && personType !== PERSON_TYPES.COMPANY;
  const docLabel = coupleActive ? 'CPF noiva' : personType === PERSON_TYPES.COMPANY ? 'CNPJ' : 'CPF';
  const nameLabel = coupleActive ? 'Noiva *' : 'Nome completo *';
  const partnerNameLabel = coupleActive ? 'Noivo *' : 'Nome completo (noivo/a 2) *';
  const partnerDocLabel = coupleActive ? 'CPF noivo *' : 'CPF (noivo/a 2) *';

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
        placeholder="Cole aqui os dados preenchidos pelos noivos e do evento"
      ></textarea>
      <div class="quick-register__actions">
        <button type="button" class="btn btn--secondary btn--sm" id="client-quick-copy-template-btn">
          <i data-lucide="copy" aria-hidden="true"></i> Copiar modelo
        </button>
        <span class="quick-register__hint text-muted">Copie o modelo e envie aos noivos; depois cole aqui a resposta.</span>
      </div>
    </div>
    `
    }
    <div class="form-grid">
      <div class="form-field form-field--full" id="client-couple-toggle" ${personType === PERSON_TYPES.COMPANY ? 'hidden' : ''}>
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
        <label class="form-field__label" for="client-name" data-name-label>${nameLabel}</label>
        <input class="form-field__input" id="client-name" name="name" required
          value="${escapeHtml(coupleFields.name || '')}" placeholder="Nome da noiva ou cliente" />
        <span class="form-field__error" data-error="name" hidden></span>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="client-document" data-doc-label>${docLabel}</label>
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
            <label class="form-field__label" for="client-partnerName" data-partner-name-label>${partnerNameLabel}</label>
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
            <label class="form-field__label" for="client-partnerDocument" data-partner-doc-label>${partnerDocLabel}</label>
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
        <label class="form-field__label" for="client-phone">Telefone</label>
        <input class="form-field__input" id="client-phone" name="phone"
          value="${escapeHtml(client?.phone ? formatPhone(client.phone) : '')}" placeholder="(00) 00000-0000" />
        <span class="form-field__error" data-error="phone" hidden></span>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="client-whatsapp">WhatsApp</label>
        <input class="form-field__input" id="client-whatsapp" name="whatsapp"
          value="${escapeHtml(client?.whatsapp ? formatPhone(client.whatsapp) : '')}" placeholder="(00) 00000-0000" />
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
  const phoneInput = form.querySelector('#client-phone');
  const whatsappInput = form.querySelector('#client-whatsapp');
  const isCoupleCheckbox = form.querySelector('#client-isCouple');
  const partnerDocumentInput = form.querySelector('#client-partnerDocument');

  isCoupleCheckbox?.addEventListener('change', () => {
    setCoupleMode(form, isCoupleCheckbox.checked);
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

  phoneInput.addEventListener('input', () => {
    phoneInput.value = formatPhone(phoneInput.value);
  });

  whatsappInput.addEventListener('input', () => {
    whatsappInput.value = formatPhone(whatsappInput.value);
  });

  if (!client) {
    bindQuickClientRegister(form, contractForm);
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
    const errors = validateClientForm(data);

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
      showToast('Não foi possível salvar o cliente. Tente novamente.', 'error');
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
