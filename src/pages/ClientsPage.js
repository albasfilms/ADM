import {
  getClients,
  getClientById,
  archiveClient,
  deleteClient,
  getClientContracts,
  getClientDisplayName,
} from '../services/clientService.js';
import { openClientFormModal } from './clientForm.js';
import { showConfirmModal } from '../components/ConfirmModal.js';
import { createEmptyState } from '../components/EmptyState.js';
import { createSkeletonRows } from '../components/Skeleton.js';
import { createStatusBadge } from '../components/StatusBadge.js';
import { createPagination } from '../components/Pagination.js';
import {
  CLIENT_STATUS,
  PERSON_TYPES,
  PERSON_TYPE_LABELS,
  PAGE_SIZE,
} from '../utils/constants.js';
import { formatPhone, formatDocument } from '../utils/validators.js';
import { formatDate, formatDateTime } from '../utils/dates.js';
import { escapeHtml, renderIcons, showToast, getFirestoreErrorMessage } from '../utils/dom.js';
import { getCurrentUser } from '../appState.js';
import { canDeleteClients } from '../utils/permissions.js';
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
    const user = getCurrentUser();
    const canDelete = canDeleteClients(user);
    const hasLinkedContracts = contracts.length > 0;

    container.querySelector('#detail-name').textContent = getClientDisplayName(client);
    container.querySelector('#detail-subtitle').appendChild(
      createStatusBadge(client.status)
    );

    const actions = container.querySelector('#detail-actions');
    actions.innerHTML = `
      <button type="button" class="btn btn--secondary" id="edit-client-btn">
        <i data-lucide="pencil" aria-hidden="true"></i> Editar
      </button>
      ${
        client.whatsapp || client.phone
          ? `<a href="https://wa.me/55${client.whatsapp || client.phone}" target="_blank" rel="noopener" class="btn btn--secondary">
              <i data-lucide="message-circle" aria-hidden="true"></i> WhatsApp
            </a>`
          : ''
      }
      ${
        client.status === CLIENT_STATUS.ACTIVE
          ? `<button type="button" class="btn btn--ghost" id="archive-client-btn">Arquivar</button>`
          : ''
      }
      ${
        canDelete && !hasLinkedContracts
          ? `<button type="button" class="btn btn--danger" id="delete-client-btn">
              <i data-lucide="trash-2" aria-hidden="true"></i> Excluir
            </button>`
          : ''
      }
    `;

    const personLabel = PERSON_TYPE_LABELS[client.personType] || '—';
    const docFormatted = client.document
      ? formatDocument(client.document, client.personType)
      : '—';
    const partnerDocFormatted = client.partnerDocument
      ? formatDocument(client.partnerDocument, PERSON_TYPES.INDIVIDUAL)
      : '—';

    content.innerHTML = `
      <div class="detail-grid">
        <div class="card">
          <div class="card__header"><h3 class="card__title">Informações de contato</h3></div>
          <div class="card__body">
            <dl class="detail-list">
              <div class="detail-list__item"><dt>Tipo</dt><dd>${personLabel}</dd></div>
              ${
                client.isCouple
                  ? `
              <div class="detail-list__item"><dt>Noivo/a 1</dt><dd>${escapeHtml(client.name || '—')}</dd></div>
              <div class="detail-list__item"><dt>CPF (noivo/a 1)</dt><dd>${docFormatted}</dd></div>
              <div class="detail-list__item"><dt>Noivo/a 2</dt><dd>${escapeHtml(client.partnerName || '—')}</dd></div>
              <div class="detail-list__item"><dt>CPF (noivo/a 2)</dt><dd>${partnerDocFormatted}</dd></div>
              `
                  : `
              <div class="detail-list__item"><dt>${client.personType === PERSON_TYPES.COMPANY ? 'CNPJ' : 'CPF'}</dt><dd>${docFormatted}</dd></div>
              `
              }
              <div class="detail-list__item"><dt>WhatsApp</dt><dd>${client.whatsapp || client.phone ? formatPhone(client.whatsapp || client.phone) : '—'}</dd></div>
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
        <p class="form-field__hint">Este cliente possui ${contracts.length} contrato(s) vinculado(s). Exclua os contratos antes de remover o cliente.</p>
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
          message: `Deseja arquivar <strong>${escapeHtml(getClientDisplayName(client))}</strong>? O cliente ficará inativo, mas os dados serão preservados.`,
          confirmLabel: 'Arquivar',
          onConfirm: async () => {
            await archiveClient(clientId);
            showToast('Cliente arquivado.', 'success');
            renderClientDetail(container, clientId);
          },
        });
      });
    }

    container.querySelector('#delete-client-btn')?.addEventListener('click', () => {
      showConfirmModal({
        title: 'Excluir cliente',
        message: `Deseja excluir permanentemente <strong>${escapeHtml(getClientDisplayName(client))}</strong>? Esta ação não pode ser desfeita.`,
        confirmLabel: 'Excluir cliente',
        onConfirm: async () => {
          try {
            await deleteClient(clientId, user);
            showToast('Cliente excluído.', 'success');
            navigateTo('/clientes');
          } catch (error) {
            console.error('[Clients] Erro ao excluir cliente:', error);
            showToast(error.message || 'Não foi possível excluir o cliente.', 'error');
            throw error;
          }
        },
      });
    });
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
                <div class="table-cell__primary">${escapeHtml(getClientDisplayName(client))}</div>
                <div class="table-cell__secondary">${PERSON_TYPE_LABELS[client.personType] || ''}</div>
              </td>
              <td>
                <div class="table-cell__primary">${client.whatsapp || client.phone ? formatPhone(client.whatsapp || client.phone) : '—'}</div>
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
    const message = getFirestoreErrorMessage(
      error,
      'Erro ao carregar clientes. Verifique login, índices e regras do Firestore.'
    );
    listContainer.innerHTML = `<p class="text-error">${escapeHtml(message)}</p>`;
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
