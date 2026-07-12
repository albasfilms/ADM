import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  archiveClient,
  getClientContracts,
} from '../services/clientService.js';
import { createModal } from '../components/Modal.js';
import { showConfirmModal } from '../components/ConfirmModal.js';
import { createEmptyState } from '../components/EmptyState.js';
import { createSkeletonRows } from '../components/Skeleton.js';
import { createStatusBadge } from '../components/StatusBadge.js';
import { createPagination } from '../components/Pagination.js';
import {
  CLIENT_STATUS,
  PERSON_TYPES,
  PERSON_TYPE_LABELS,
  BRAZILIAN_STATES,
  PAGE_SIZE,
} from '../utils/constants.js';
import {
  validateClientForm,
  formatPhone,
  formatDocument,
} from '../utils/validators.js';
import { parseQuickClientText } from '../utils/parseQuickClient.js';
import { formatDate, formatDateTime } from '../utils/dates.js';
import { escapeHtml, renderIcons, showToast } from '../utils/dom.js';
let listState = {
  search: '',
  status: 'all',
  sortBy: 'name',
  sortDir: 'asc',
  page: 1,
  cursors: [null],
};

function resetPagination() {
  listState.page = 1;
  listState.cursors = [null];
}

function navigateTo(path) {
  window.location.hash = `#${path}`;
}

function getClientIdFromPath() {
  const hash = window.location.hash.replace('#', '') || '/';
  const match = hash.match(/^\/clientes\/([^/]+)$/);
  return match ? match[1] : null;
}

function applyQuickClientParse(form, parsed) {
  const personTypeSelect = form.querySelector('#client-personType');
  const documentInput = form.querySelector('#client-document');
  const docLabelEl = form.querySelector('[data-doc-label]');

  if (parsed.name) form.querySelector('#client-name').value = parsed.name;

  if (parsed.personType) {
    personTypeSelect.value = parsed.personType;
    docLabelEl.textContent = parsed.personType === PERSON_TYPES.COMPANY ? 'CNPJ' : 'CPF';
    documentInput.placeholder =
      parsed.personType === PERSON_TYPES.COMPANY ? '00.000.000/0000-00' : '000.000.000-00';
  }

  if (parsed.document) {
    documentInput.value = formatDocument(parsed.document, personTypeSelect.value);
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

  if (parsed.notes) form.querySelector('#client-notes').value = parsed.notes;
}

function bindQuickClientRegister(form) {
  const quickInput = form.querySelector('#client-quick-register');
  const parseBtn = form.querySelector('#client-quick-parse-btn');
  if (!quickInput || !parseBtn) return;

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
    showToast('Campos preenchidos automaticamente.', 'success');
  };

  parseBtn.addEventListener('click', runParse);
  quickInput.addEventListener('paste', () => {
    setTimeout(runParse, 0);
  });
}

function buildClientForm(client = null) {
  const form = document.createElement('form');
  form.className = 'client-form';
  form.noValidate = true;

  const personType = client?.personType || PERSON_TYPES.INDIVIDUAL;
  const docLabel = personType === PERSON_TYPES.COMPANY ? 'CNPJ' : 'CPF';

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
        rows="4"
        placeholder="Cole as informações do cliente. Funciona com ou sem rótulos — ex: Maria e João na primeira linha"
      ></textarea>
      <div class="quick-register__actions">
        <button type="button" class="btn btn--secondary btn--sm" id="client-quick-parse-btn">
          Preencher automaticamente
        </button>
        <span class="quick-register__hint text-muted">Funciona com texto livre: a primeira linha vira o nome se não tiver rótulo.</span>
      </div>
    </div>
    `
    }
    <div class="form-grid">
      <div class="form-field form-field--full">
        <label class="form-field__label" for="client-name">Nome completo *</label>
        <input class="form-field__input" id="client-name" name="name" required
          value="${escapeHtml(client?.name || '')}" placeholder="Nome do cliente" />
        <span class="form-field__error" data-error="name" hidden></span>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="client-personType">Tipo de pessoa *</label>
        <select class="form-field__input" id="client-personType" name="personType">
          <option value="${PERSON_TYPES.INDIVIDUAL}" ${personType === PERSON_TYPES.INDIVIDUAL ? 'selected' : ''}>Pessoa física</option>
          <option value="${PERSON_TYPES.COMPANY}" ${personType === PERSON_TYPES.COMPANY ? 'selected' : ''}>Pessoa jurídica</option>
        </select>
        <span class="form-field__error" data-error="personType" hidden></span>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="client-document" data-doc-label>${docLabel}</label>
        <input class="form-field__input" id="client-document" name="document"
          value="${escapeHtml(client?.document ? formatDocument(client.document, personType) : '')}"
          placeholder="${personType === PERSON_TYPES.COMPANY ? '00.000.000/0000-00' : '000.000.000-00'}" />
        <span class="form-field__error" data-error="document" hidden></span>
      </div>

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

      <div class="form-field form-field--full">
        <label class="form-field__label" for="client-notes">Observações</label>
        <textarea class="form-field__input form-field__textarea" id="client-notes" name="notes"
          rows="3" placeholder="Anotações sobre o cliente">${escapeHtml(client?.notes || '')}</textarea>
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

  const personTypeSelect = form.querySelector('#client-personType');
  const documentInput = form.querySelector('#client-document');
  const docLabelEl = form.querySelector('[data-doc-label]');
  const phoneInput = form.querySelector('#client-phone');
  const whatsappInput = form.querySelector('#client-whatsapp');

  personTypeSelect.addEventListener('change', () => {
    const type = personTypeSelect.value;
    docLabelEl.textContent = type === PERSON_TYPES.COMPANY ? 'CNPJ' : 'CPF';
    documentInput.placeholder =
      type === PERSON_TYPES.COMPANY ? '00.000.000/0000-00' : '000.000.000-00';
    documentInput.value = formatDocument(documentInput.value, type);
  });

  documentInput.addEventListener('input', () => {
    documentInput.value = formatDocument(documentInput.value, personTypeSelect.value);
  });

  phoneInput.addEventListener('input', () => {
    phoneInput.value = formatPhone(phoneInput.value);
  });

  whatsappInput.addEventListener('input', () => {
    whatsappInput.value = formatPhone(whatsappInput.value);
  });

  if (!client) {
    bindQuickClientRegister(form);
  }

  return form;
}

function getFormData(form) {
  const data = Object.fromEntries(new FormData(form));
  if (!form.querySelector('[name="status"]')) {
    data.status = CLIENT_STATUS.ACTIVE;
  }
  return data;
}

function showFormErrors(form, errors) {
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

function openClientFormModal(client = null, onSaved) {
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
    const data = getFormData(form);
    const errors = validateClientForm(data);

    if (Object.keys(errors).length > 0) {
      showFormErrors(form, errors);
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

async function renderClientDetail(container, clientId) {
  container.innerHTML = `
    <div class="page-header page-header--with-action">
      <div>
        <button type="button" class="btn btn--ghost btn--sm" id="back-to-list">
          <i data-lucide="arrow-left" aria-hidden="true"></i> Voltar
        </button>
        <h2 class="page-header__title" id="detail-name">Carregando...</h2>
        <p class="page-header__subtitle" id="detail-subtitle"></p>
      </div>
      <div class="page-header__actions" id="detail-actions"></div>
    </div>
    <div id="detail-content"></div>
  `;

  renderIcons(container);

  container.querySelector('#back-to-list').addEventListener('click', () => {
    navigateTo('/clientes');
  });

  const content = container.querySelector('#detail-content');
  content.appendChild(createSkeletonRows(3, 2));

  try {
    const client = await getClientById(clientId);

    if (!client) {
      content.innerHTML = '';
      content.appendChild(
        createEmptyState({
          icon: 'user-x',
          title: 'Cliente não encontrado',
          description: 'O cliente solicitado não existe ou foi removido.',
          action: (() => {
            const btn = document.createElement('button');
            btn.className = 'btn btn--secondary';
            btn.textContent = 'Voltar para lista';
            btn.addEventListener('click', () => navigateTo('/clientes'));
            return btn;
          })(),
        })
      );
      return;
    }

    const contracts = await getClientContracts(clientId);

    container.querySelector('#detail-name').textContent = client.name;
    container.querySelector('#detail-subtitle').appendChild(
      createStatusBadge(client.status)
    );

    const actions = container.querySelector('#detail-actions');
    actions.innerHTML = `
      <button type="button" class="btn btn--secondary" id="edit-client-btn">
        <i data-lucide="pencil" aria-hidden="true"></i> Editar
      </button>
      ${
        client.whatsapp
          ? `<a href="https://wa.me/55${client.whatsapp}" target="_blank" rel="noopener" class="btn btn--secondary">
              <i data-lucide="message-circle" aria-hidden="true"></i> WhatsApp
            </a>`
          : ''
      }
      ${
        client.status === CLIENT_STATUS.ACTIVE
          ? `<button type="button" class="btn btn--ghost" id="archive-client-btn">Arquivar</button>`
          : ''
      }
    `;

    const personLabel = PERSON_TYPE_LABELS[client.personType] || '—';
    const docFormatted = client.document
      ? formatDocument(client.document, client.personType)
      : '—';

    content.innerHTML = `
      <div class="detail-grid">
        <div class="card">
          <div class="card__header"><h3 class="card__title">Informações de contato</h3></div>
          <div class="card__body">
            <dl class="detail-list">
              <div class="detail-list__item"><dt>Tipo</dt><dd>${personLabel}</dd></div>
              <div class="detail-list__item"><dt>${client.personType === PERSON_TYPES.COMPANY ? 'CNPJ' : 'CPF'}</dt><dd>${docFormatted}</dd></div>
              <div class="detail-list__item"><dt>Telefone</dt><dd>${client.phone ? formatPhone(client.phone) : '—'}</dd></div>
              <div class="detail-list__item"><dt>WhatsApp</dt><dd>${client.whatsapp ? formatPhone(client.whatsapp) : '—'}</dd></div>
              <div class="detail-list__item"><dt>E-mail</dt><dd>${client.email || '—'}</dd></div>
              <div class="detail-list__item"><dt>Instagram</dt><dd>${client.instagram || '—'}</dd></div>
            </dl>
          </div>
        </div>

        <div class="card">
          <div class="card__header"><h3 class="card__title">Endereço</h3></div>
          <div class="card__body">
            <dl class="detail-list">
              <div class="detail-list__item"><dt>Endereço</dt><dd>${client.address || '—'}</dd></div>
              <div class="detail-list__item"><dt>Cidade</dt><dd>${client.city || '—'}</dd></div>
              <div class="detail-list__item"><dt>Estado</dt><dd>${client.state || '—'}</dd></div>
            </dl>
          </div>
        </div>

        <div class="card detail-grid__full">
          <div class="card__header"><h3 class="card__title">Observações</h3></div>
          <div class="card__body">
            <p class="detail-notes">${client.notes || 'Nenhuma observação registrada.'}</p>
          </div>
        </div>

        <div class="card detail-grid__full">
          <div class="card__header"><h3 class="card__title">Contratos vinculados</h3></div>
          <div class="card__body" id="contracts-list"></div>
        </div>

        <div class="card detail-grid__full">
          <div class="card__body">
            <dl class="detail-list detail-list--inline">
              <div class="detail-list__item"><dt>Cadastrado em</dt><dd>${formatDate(client.createdAt)}</dd></div>
              <div class="detail-list__item"><dt>Atualizado em</dt><dd>${formatDateTime(client.updatedAt)}</dd></div>
            </dl>
          </div>
        </div>
      </div>
    `;

    const contractsList = content.querySelector('#contracts-list');
    if (contracts.length === 0) {
      contractsList.innerHTML = `<p class="text-muted">Nenhum contrato vinculado a este cliente.</p>`;
    } else {
      contractsList.innerHTML = `
        <div class="data-table-wrapper">
          <table class="data-table">
            <thead>
              <tr><th>Título</th><th>Status</th><th>Valor total</th><th>Evento</th></tr>
            </thead>
            <tbody>
              ${contracts
                .map(
                  (c) => `
                <tr>
                  <td>${escapeHtml(c.title || '—')}</td>
                  <td>${escapeHtml(c.status || '—')}</td>
                  <td>—</td>
                  <td>${formatDate(c.eventDate)}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    renderIcons(container);

    container.querySelector('#edit-client-btn')?.addEventListener('click', () => {
      openClientFormModal(client, () => renderClientDetail(container, clientId));
    });

    if (client.status === CLIENT_STATUS.ACTIVE) {
      container.querySelector('#archive-client-btn')?.addEventListener('click', () => {
        showConfirmModal({
          title: 'Arquivar cliente',
          message: `Deseja arquivar <strong>${escapeHtml(client.name)}</strong>? O cliente ficará inativo, mas os dados serão preservados.`,
          confirmLabel: 'Arquivar',
          onConfirm: async () => {
            await archiveClient(clientId);
            showToast('Cliente arquivado.', 'success');
            renderClientDetail(container, clientId);
          },
        });
      });
    }
  } catch (error) {
    console.error('[Clients] Erro ao carregar detalhe:', error);
    content.innerHTML = `<p class="text-error">Erro ao carregar cliente. Verifique sua conexão.</p>`;
  }
}

async function loadClientsList(listContainer, paginationContainer) {
  listContainer.innerHTML = '';
  listContainer.appendChild(createSkeletonRows(6, 5));

  try {
    const cursor = listState.cursors[listState.page - 1] ?? null;
    const result = await getClients({
      status: listState.status,
      sortBy: listState.sortBy,
      sortDir: listState.sortDir,
      search: listState.search,
      cursor,
    });

    if (!listState.cursors[listState.page] && result.lastCursor) {
      listState.cursors[listState.page] = result.lastCursor;
    }

    listContainer.innerHTML = '';

    if (result.clients.length === 0) {
      listContainer.appendChild(
        createEmptyState({
          icon: 'users',
          title: 'Nenhum cliente encontrado',
          description: listState.search
            ? 'Tente outro termo de busca ou limpe os filtros.'
            : 'Cadastre o primeiro cliente para começar.',
          action: (() => {
            const btn = document.createElement('button');
            btn.className = 'btn btn--primary';
            btn.textContent = 'Novo cliente';
            btn.addEventListener('click', () =>
              openClientFormModal(null, () => {
                resetPagination();
                loadClientsList(listContainer, paginationContainer);
              })
            );
            return btn;
          })(),
        })
      );
      paginationContainer.innerHTML = '';
      return;
    }

    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'data-table-wrapper';
    tableWrapper.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Contato</th>
            <th>Cidade</th>
            <th>Status</th>
            <th>Cadastro</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${result.clients
            .map(
              (client) => `
            <tr data-client-id="${client.id}">
              <td>
                <div class="table-cell__primary">${escapeHtml(client.name)}</div>
                <div class="table-cell__secondary">${PERSON_TYPE_LABELS[client.personType] || ''}</div>
              </td>
              <td>
                <div class="table-cell__primary">${client.phone ? formatPhone(client.phone) : '—'}</div>
                <div class="table-cell__secondary">${client.email || ''}</div>
              </td>
              <td>${client.city ? `${escapeHtml(client.city)}${client.state ? ` / ${client.state}` : ''}` : '—'}</td>
              <td data-status-cell="${client.id}"></td>
              <td>${formatDate(client.createdAt)}</td>
              <td>
                <button type="button" class="btn btn--ghost btn--sm" data-action="view" data-id="${client.id}">
                  Ver
                </button>
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;

    listContainer.appendChild(tableWrapper);

    result.clients.forEach((client) => {
      const cell = tableWrapper.querySelector(`[data-status-cell="${client.id}"]`);
      cell?.appendChild(createStatusBadge(client.status));
    });

    tableWrapper.querySelectorAll('[data-action="view"]').forEach((btn) => {
      btn.addEventListener('click', () => navigateTo(`/clientes/${btn.dataset.id}`));
    });

    paginationContainer.innerHTML = '';
    paginationContainer.appendChild(
      createPagination({
        page: listState.page,
        hasMore: result.hasMore,
        hasPrev: listState.page > 1,
        onPageChange: (newPage) => {
          listState.page = newPage;
          loadClientsList(listContainer, paginationContainer);
        },
      })
    );
  } catch (error) {
    console.error('[Clients] Erro ao listar:', error);
    listContainer.innerHTML = `<p class="text-error">Erro ao carregar clientes. Verifique as regras do Firestore.</p>`;
    paginationContainer.innerHTML = '';
  }
}

function renderClientsList(container) {
  container.innerHTML = `
    <div class="page-header page-header--with-action">
      <div>
        <h2 class="page-header__title">Clientes</h2>
        <p class="page-header__subtitle">Gerencie clientes, contatos e histórico</p>
      </div>
      <button type="button" class="btn btn--primary" id="new-client-btn">
        <i data-lucide="plus" aria-hidden="true"></i> Novo cliente
      </button>
    </div>

    <div class="card">
      <div class="card__body">
        <div class="toolbar">
          <div class="toolbar__search">
            <i data-lucide="search" class="toolbar__search-icon" aria-hidden="true"></i>
            <input type="search" class="form-field__input" id="search-input"
              placeholder="Buscar por nome, telefone ou e-mail..." value="${escapeHtml(listState.search)}" />
          </div>
          <select class="form-field__input toolbar__filter" id="status-filter">
            <option value="all" ${listState.status === 'all' ? 'selected' : ''}>Todos os status</option>
            <option value="active" ${listState.status === 'active' ? 'selected' : ''}>Ativos</option>
            <option value="inactive" ${listState.status === 'inactive' ? 'selected' : ''}>Inativos</option>
          </select>
          <select class="form-field__input toolbar__filter" id="sort-filter">
            <option value="name-asc" ${listState.sortBy === 'name' && listState.sortDir === 'asc' ? 'selected' : ''}>Nome A–Z</option>
            <option value="name-desc" ${listState.sortBy === 'name' && listState.sortDir === 'desc' ? 'selected' : ''}>Nome Z–A</option>
            <option value="createdAt-desc" ${listState.sortBy === 'createdAt' && listState.sortDir === 'desc' ? 'selected' : ''}>Mais recentes</option>
            <option value="createdAt-asc" ${listState.sortBy === 'createdAt' && listState.sortDir === 'asc' ? 'selected' : ''}>Mais antigos</option>
          </select>
        </div>

        <div id="clients-list" class="clients-list"></div>
        <div id="clients-pagination" class="clients-pagination"></div>
      </div>
    </div>
  `;

  renderIcons(container);

  const listContainer = container.querySelector('#clients-list');
  const paginationContainer = container.querySelector('#clients-pagination');

  let searchTimeout;

  container.querySelector('#new-client-btn').addEventListener('click', () => {
    openClientFormModal(null, () => {
      resetPagination();
      loadClientsList(listContainer, paginationContainer);
    });
  });

  container.querySelector('#search-input').addEventListener('input', (event) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      listState.search = event.target.value;
      resetPagination();
      loadClientsList(listContainer, paginationContainer);
    }, 350);
  });

  container.querySelector('#status-filter').addEventListener('change', (event) => {
    listState.status = event.target.value;
    resetPagination();
    loadClientsList(listContainer, paginationContainer);
  });

  container.querySelector('#sort-filter').addEventListener('change', (event) => {
    const [sortBy, sortDir] = event.target.value.split('-');
    listState.sortBy = sortBy;
    listState.sortDir = sortDir;
    resetPagination();
    loadClientsList(listContainer, paginationContainer);
  });

  loadClientsList(listContainer, paginationContainer);
}

export function renderClientsPage(container) {
  const clientId = getClientIdFromPath();

  if (clientId && clientId !== 'novo') {
    renderClientDetail(container, clientId);
  } else {
    renderClientsList(container);
  }
}
