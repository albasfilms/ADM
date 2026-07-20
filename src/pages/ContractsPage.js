import {
  getContracts,
  getContractFull,
  getActiveClients,
  cancelContract,
  finalizeContract,
  deleteContract,
} from '../services/contractService.js';
import { openContractFormModal } from './contractForm.js';
import {
  openContractDocumentModal,
  openContractTemplatesModal,
  promptGenerateContractAfterCreate,
} from './ContractDocumentModal.js';
import { createEmptyState } from '../components/EmptyState.js';
import { createSkeletonRows } from '../components/Skeleton.js';
import { createContractStatusBadge } from '../components/StatusBadge.js';
import { createPagination } from '../components/Pagination.js';
import { showConfirmModal } from '../components/ConfirmModal.js';
import { openPaymentModal } from './PaymentModal.js';
import {
  getPaymentsForInstallment,
  deletePayment,
  updateContractTotals,
} from '../services/paymentService.js';
import { getClientById } from '../services/clientService.js';
import { buildWhatsAppSummary, buildInstallmentCollectionMessage, copyToClipboard, openWhatsApp } from '../utils/whatsapp.js';
import { getInstallmentRemaining } from '../utils/installmentStatus.js';
import {
  CONTRACT_STATUS,
  CONTRACT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPES,
  INSTALLMENT_STATUS,
  INSTALLMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../utils/constants.js';
import { formatCurrency } from '../utils/currency.js';
import { formatDate, formatDateTime } from '../utils/dates.js';
import { escapeHtml, renderIcons, showToast } from '../utils/dom.js';
import { isAdmin, canDeleteContracts } from '../utils/permissions.js';
import { getCurrentUser } from '../appState.js';
import { formatDaysUntilEvent, getEventTimestamp } from '../utils/eventCountdown.js';
import { resolveContractEventType } from '../utils/contractEventType.js';
import { isTimeValue } from '../utils/contractServices.js';

let listState = {
  search: '',
  status: 'all',
  sortBy: 'createdAt',
  sortDir: 'desc',
  page: 1,
  cursors: [null],
};

function resetPagination() {
  listState.page = 1;
  listState.cursors = [null];
}

function formatEventLocation(contract) {
  const parts = [contract.eventLocation, contract.city, contract.state].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Local não informado';
}

function formatPreWeddingDetails(item) {
  if (!item.preWeddingDate && !item.preWeddingTime && !item.preWeddingLocation) return '';

  const scheduleParts = [];
  if (item.preWeddingDate) scheduleParts.push(formatDate(item.preWeddingDate));
  if (item.preWeddingTime) scheduleParts.push(`às ${item.preWeddingTime}`);
  const schedule = scheduleParts.join(' ');
  const location = item.preWeddingLocation ? escapeHtml(item.preWeddingLocation) : '';

  if (schedule && location) {
    return `<div class="table-cell__secondary">Pré wedding: ${schedule} — ${location}</div>`;
  }
  if (schedule) {
    return `<div class="table-cell__secondary">Pré wedding: ${schedule}</div>`;
  }
  return `<div class="table-cell__secondary">Pré wedding: ${location}</div>`;
}

function formatMakingOfBrideDetails(item) {
  if (item.serviceType !== SERVICE_TYPES.MAKING_OF_BRIDE) return '';
  if (!item.makingOfLocation && !item.makingOfSchedule) return '';

  const schedule = item.makingOfSchedule
    ? isTimeValue(item.makingOfSchedule)
      ? `às ${escapeHtml(item.makingOfSchedule)}`
      : escapeHtml(item.makingOfSchedule)
    : '';
  const location = item.makingOfLocation ? escapeHtml(item.makingOfLocation) : '';

  if (schedule && location) {
    return `<div class="table-cell__secondary">Making of noiva: ${schedule} — ${location}</div>`;
  }
  if (schedule) {
    return `<div class="table-cell__secondary">Making of noiva: ${schedule}</div>`;
  }
  return `<div class="table-cell__secondary">Making of noiva: ${location}</div>`;
}

function buildContractCardHTML(contract) {
  const eventLabel = EVENT_TYPE_LABELS[resolveContractEventType(contract)] || 'Evento';
  const location = formatEventLocation(contract);
  const eventTs = getEventTimestamp(contract);
  const countdown = eventTs ? formatDaysUntilEvent(eventTs) : null;
  const percent =
    contract.totalAmount > 0
      ? Math.min(100, Math.round((contract.receivedAmount / contract.totalAmount) * 100))
      : 0;

  return `
    <article class="contract-card" data-contract-id="${contract.id}" tabindex="0" role="button" aria-label="Ver contrato ${escapeHtml(contract.title)}">
      <div class="contract-card__header">
        <div class="contract-card__heading">
          <h3 class="contract-card__title">${escapeHtml(contract.title)}</h3>
          <p class="contract-card__client">${escapeHtml(contract.clientName)}</p>
        </div>
        <div class="contract-card__status" data-status="${contract.id}"></div>
      </div>
      <span class="contract-card__service">${escapeHtml(eventLabel)}</span>
      ${
        countdown
          ? `
      <div class="contract-card__countdown contract-card__countdown--${countdown.variant}" data-event-ts="${eventTs}">
        <i data-lucide="timer" aria-hidden="true"></i>
        <span class="contract-card__countdown-value">${countdown.text}</span>
      </div>
      `
          : ''
      }
      <ul class="contract-card__meta">
        <li>
          <i data-lucide="calendar" aria-hidden="true"></i>
          <span>${formatDate(contract.eventDate)}</span>
        </li>
        ${
          contract.eventTime
            ? `<li><i data-lucide="clock" aria-hidden="true"></i><span>${escapeHtml(contract.eventTime)}</span></li>`
            : ''
        }
        <li>
          <i data-lucide="map-pin" aria-hidden="true"></i>
          <span>${escapeHtml(location)}</span>
        </li>
      </ul>
      <div class="contract-card__actions">
        <button
          type="button"
          class="btn btn--secondary btn--sm contract-card__link-btn${contract.contractLink ? '' : ' contract-card__link-btn--empty'}"
          data-contract-link="${escapeHtml(contract.contractLink || '')}"
          aria-label="Link do contrato ${escapeHtml(contract.title)}"
        >
          <i data-lucide="external-link" aria-hidden="true"></i>
          Link do contrato
        </button>
      </div>
      <div class="contract-card__footer">
        <div class="contract-card__amount">
          <span class="contract-card__label">Total</span>
          <strong>${formatCurrency(contract.totalAmount)}</strong>
        </div>
        <div class="contract-card__amount">
          <span class="contract-card__label">Recebido</span>
          <strong>${formatCurrency(contract.receivedAmount)}</strong>
        </div>
      </div>
      <div class="contract-card__progress" aria-hidden="true">
        <div class="contract-card__progress-fill" style="width: ${percent}%"></div>
      </div>
    </article>
  `;
}

function createContractsGridSkeleton(count = 6) {
  const grid = document.createElement('div');
  grid.className = 'contracts-grid';
  grid.innerHTML = Array.from({ length: count })
    .map(
      () => `
    <div class="contract-card contract-card--skeleton">
      <div class="skeleton skeleton--text" style="width: 70%"></div>
      <div class="skeleton skeleton--text" style="width: 45%"></div>
      <div class="skeleton skeleton--text" style="width: 90%"></div>
      <div class="skeleton skeleton--text" style="width: 60%"></div>
    </div>
  `
    )
    .join('');
  return grid;
}

function bindContractCards(container) {
  container.querySelectorAll('.contract-card[data-contract-id]').forEach((card) => {
    const open = () => navigateTo(`/contratos/${card.dataset.contractId}`);
    card.addEventListener('click', (event) => {
      if (event.target.closest('.contract-card__link-btn')) return;
      open();
    });
    card.addEventListener('keydown', (event) => {
      if (event.target.closest('.contract-card__link-btn')) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });

    card.querySelector('.contract-card__link-btn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      const link = event.currentTarget.dataset.contractLink?.trim();
      if (link) {
        window.open(link, '_blank', 'noopener,noreferrer');
        return;
      }
      showToast('Este contrato ainda não tem link cadastrado. Edite o contrato para adicionar.', 'info');
    });
  });
}

function startContractCardCountdowns(container) {
  if (container._contractTimerId) {
    clearInterval(container._contractTimerId);
  }

  const tick = () => {
    container.querySelectorAll('[data-event-ts]').forEach((el) => {
      const ts = Number(el.dataset.eventTs);
      if (!ts) return;

      const { text, variant } = formatDaysUntilEvent(ts);
      const valueEl = el.querySelector('.contract-card__countdown-value');
      if (valueEl) valueEl.textContent = text;

      el.classList.remove(
        'contract-card__countdown--upcoming',
        'contract-card__countdown--soon',
        'contract-card__countdown--done',
        'contract-card__countdown--none'
      );
      el.classList.add(`contract-card__countdown--${variant}`);
    });
  };

  tick();
  container._contractTimerId = setInterval(tick, 60000);
}

function navigateTo(path) {
  window.location.hash = `#${path}`;
}

function getContractIdFromPath() {
  const hash = window.location.hash.replace('#', '') || '/';
  const match = hash.match(/^\/contratos\/([^/]+)$/);
  return match ? match[1] : null;
}

async function openNewContractModal(onSaved) {
  try {
    const clients = await getActiveClients();
    openContractFormModal({
      clients,
      onSaved,
      onCreated: (contractId) => {
        promptGenerateContractAfterCreate(contractId);
      },
    });
  } catch (error) {
    console.error('[Contracts] Erro ao carregar clientes:', error);
    const message =
      error.code === 'failed-precondition'
        ? 'Índice do Firestore pendente. Tente novamente em instantes.'
        : 'Erro ao carregar clientes.';
    showToast(message, 'error');
  }
}

async function openEditContractModal(contractId, onSaved) {
  try {
    const [{ contract, items, installments }, clients] = await Promise.all([
      getContractFull(contractId),
      getActiveClients(),
    ]);
    openContractFormModal({ clients, contract, items, installments, onSaved });
  } catch (error) {
    showToast('Erro ao carregar contrato.', 'error');
  }
}

function buildProgressBar(received, total) {
  const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
  return `
    <div class="progress-bar">
      <div class="progress-bar__track">
        <div class="progress-bar__fill" style="width: ${percent}%"></div>
      </div>
      <span class="progress-bar__label">${percent}% pago</span>
    </div>
  `;
}

async function renderContractDetail(container, contractId) {
  container.innerHTML = `
    <div class="page-header page-header--with-action">
      <div>
        <button type="button" class="btn btn--ghost btn--sm" id="back-to-list">
          <i data-lucide="arrow-left" aria-hidden="true"></i> Voltar
        </button>
        <h2 class="page-header__title" id="detail-title">Carregando...</h2>
        <p class="page-header__subtitle" id="detail-status"></p>
      </div>
      <div class="page-header__actions" id="detail-actions"></div>
    </div>
    <div id="detail-content"></div>
  `;

  renderIcons(container);
  container.querySelector('#back-to-list').addEventListener('click', () => navigateTo('/contratos'));

  const content = container.querySelector('#detail-content');
  content.appendChild(createSkeletonRows(4, 2));

  try {
    let { contract, items, installments } = await getContractFull(contractId);
    if (!contract) {
      content.innerHTML = '';
      content.appendChild(
        createEmptyState({
          icon: 'file-x',
          title: 'Contrato não encontrado',
          description: 'Este contrato não existe ou foi removido.',
        })
      );
      return;
    }

    const calculatedReceived = installments
      .filter((inst) => inst.status !== INSTALLMENT_STATUS.CANCELLED)
      .reduce((sum, inst) => sum + (inst.paidAmount || 0), 0);

    if (calculatedReceived !== (contract.receivedAmount || 0)) {
      await updateContractTotals(contractId);
      ({ contract, items, installments } = await getContractFull(contractId));
    }

    if (!contract) return;

    const user = getCurrentUser();
    const paidPercent = contract.totalAmount
      ? Math.round((contract.receivedAmount / contract.totalAmount) * 100)
      : 0;

    container.querySelector('#detail-title').textContent = contract.title;
    container.querySelector('#detail-status').appendChild(
      createContractStatusBadge(contract.status)
    );

    const actions = container.querySelector('#detail-actions');
    actions.innerHTML = `
      <button type="button" class="btn btn--secondary" id="generate-contract-btn">
        <i data-lucide="file-text" aria-hidden="true"></i> Gerar contrato
      </button>
      <button type="button" class="btn btn--secondary" id="whatsapp-btn">
        <i data-lucide="message-circle" aria-hidden="true"></i> WhatsApp
      </button>
      <button type="button" class="btn btn--secondary" id="copy-summary-btn">
        <i data-lucide="copy" aria-hidden="true"></i> Copiar resumo
      </button>
      <button type="button" class="btn btn--secondary" id="edit-contract-btn">
        <i data-lucide="pencil" aria-hidden="true"></i> Editar
      </button>
      ${
        contract.status !== CONTRACT_STATUS.FINISHED &&
        contract.status !== CONTRACT_STATUS.CANCELLED
          ? `<button type="button" class="btn btn--secondary" id="finalize-btn">Finalizar</button>`
          : ''
      }
      ${
        contract.status !== CONTRACT_STATUS.CANCELLED && isAdmin(user)
          ? `<button type="button" class="btn btn--ghost" id="cancel-btn">Cancelar</button>`
          : ''
      }
      ${
        canDeleteContracts(user)
          ? `<button type="button" class="btn btn--danger" id="delete-contract-btn">
        <i data-lucide="trash-2" aria-hidden="true"></i> Excluir
      </button>`
          : ''
      }
    `;

    const paymentsByInstallment = {};
    await Promise.all(
      installments.map(async (inst) => {
        paymentsByInstallment[inst.id] = await getPaymentsForInstallment(contractId, inst.id);
      })
    );

    const client = await getClientById(contract.clientId);

    content.innerHTML = `
      <div class="detail-grid">
        <div class="card">
          <div class="card__header"><h3 class="card__title">Cliente e evento</h3></div>
          <div class="card__body">
            <dl class="detail-list">
              <div class="detail-list__item"><dt>Cliente</dt><dd><a href="#/clientes/${contract.clientId}" class="link">${escapeHtml(contract.clientName)}</a></dd></div>
              <div class="detail-list__item"><dt>Modelo do evento</dt><dd>${EVENT_TYPE_LABELS[resolveContractEventType(contract)] || '—'}</dd></div>
              <div class="detail-list__item"><dt>Data do evento</dt><dd>${formatDate(contract.eventDate)} ${contract.eventTime || ''}</dd></div>
              <div class="detail-list__item"><dt>Local</dt><dd>${contract.eventLocation || '—'}</dd></div>
              <div class="detail-list__item"><dt>Cidade</dt><dd>${contract.city ? `${contract.city}${contract.state ? ` / ${contract.state}` : ''}` : '—'}</dd></div>
              <div class="detail-list__item"><dt>Fechamento</dt><dd>${formatDate(contract.closingDate)}</dd></div>
              ${
                contract.description || contract.notes
                  ? `<div class="detail-list__item"><dt>Descrição</dt><dd>${escapeHtml(contract.description || contract.notes)}</dd></div>`
                  : ''
              }
            </dl>
          </div>
        </div>

        <div class="card">
          <div class="card__header"><h3 class="card__title">Resumo financeiro</h3></div>
          <div class="card__body">
            <dl class="detail-list">
              <div class="detail-list__item"><dt>Valor total</dt><dd><strong>${formatCurrency(contract.totalAmount)}</strong></dd></div>
              ${
                contract.discountAmount
                  ? `<div class="detail-list__item"><dt>Desconto</dt><dd>- ${formatCurrency(contract.discountAmount)}</dd></div>`
                  : ''
              }
              <div class="detail-list__item"><dt>Recebido</dt><dd>${formatCurrency(contract.receivedAmount)}</dd></div>
              <div class="detail-list__item"><dt>Pendente</dt><dd>${formatCurrency(contract.pendingAmount)}</dd></div>
              <div class="detail-list__item"><dt>Vencido</dt><dd>${formatCurrency(contract.overdueAmount)}</dd></div>
            </dl>
            ${buildProgressBar(contract.receivedAmount, contract.totalAmount)}
          </div>
        </div>

        <div class="card detail-grid__full">
          <div class="card__header"><h3 class="card__title">Serviços contratados</h3></div>
          <div class="card__body">
            <div class="data-table-wrapper">
              <table class="data-table">
                <thead><tr><th>Serviço</th><th>Descrição</th><th>Valor</th></tr></thead>
                <tbody>
                  ${items
                    .map(
                      (item) => `
                    <tr>
                      <td>${SERVICE_TYPE_LABELS[item.serviceType] || item.serviceType}</td>
                      <td>
                        ${escapeHtml(item.description)}
                        ${formatPreWeddingDetails(item)}
                        ${formatMakingOfBrideDetails(item)}
                      </td>
                      <td>${formatCurrency(item.amount)}</td>
                    </tr>
                  `
                    )
                    .join('')}
                  <tr class="data-table__total-row">
                    <td colspan="2"><strong>Total</strong></td>
                    <td><strong>${formatCurrency(contract.totalAmount)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="card detail-grid__full">
          <div class="card__header"><h3 class="card__title">Parcelas e pagamentos</h3></div>
          <div class="card__body">
            <div class="data-table-wrapper">
              <table class="data-table">
                <thead><tr><th>#</th><th>Descrição</th><th>Previsto</th><th>Pago</th><th>Vencimento</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  ${installments
                    .map((inst) => {
                      const remaining = getInstallmentRemaining(inst);
                      const canPay =
                        remaining > 0 &&
                        inst.status !== INSTALLMENT_STATUS.CANCELLED &&
                        contract.status !== CONTRACT_STATUS.CANCELLED;
                      return `
                    <tr>
                      <td>${inst.number === 0 ? 'Entrada' : inst.number}</td>
                      <td>${escapeHtml(inst.description)}</td>
                      <td>${formatCurrency(inst.expectedAmount)}</td>
                      <td>${formatCurrency(inst.paidAmount || 0)}</td>
                      <td>${formatDate(inst.dueDate)}</td>
                      <td>${INSTALLMENT_STATUS_LABELS[inst.status] || inst.status}</td>
                      <td class="data-table__actions">
                        ${
                          canPay
                            ? `
                          <button type="button" class="btn btn--ghost btn--sm" data-pay="${inst.id}">Pagar</button>
                          <button type="button" class="btn btn--ghost btn--sm installment-whatsapp-btn" data-whatsapp-collect="${inst.id}" title="Enviar cobrança por WhatsApp">
                            <i data-lucide="message-circle" aria-hidden="true"></i>
                            WhatsApp
                          </button>
                        `
                            : ''
                        }
                      </td>
                    </tr>
                    ${
                      paymentsByInstallment[inst.id]?.length
                        ? paymentsByInstallment[inst.id]
                            .map(
                              (p) => `
                      <tr class="data-table__sub-row">
                        <td></td>
                        <td colspan="2">↳ ${formatDate(p.paymentDate)} — ${PAYMENT_METHOD_LABELS[p.paymentMethod] || p.paymentMethod}</td>
                        <td>${formatCurrency(p.amount)}</td>
                        <td colspan="2" class="text-muted">${escapeHtml(p.notes || '')}</td>
                        <td>${
                          isAdmin(user)
                            ? `<button type="button" class="btn btn--ghost btn--sm" data-delete-payment="${inst.id}" data-payment-id="${p.id}">Estornar</button>`
                            : ''
                        }</td>
                      </tr>
                    `
                            )
                            .join('')
                        : ''
                    }
                  `;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        ${
          contract.driveLink || contract.contractLink
            ? `
        <div class="card detail-grid__full">
          <div class="card__header"><h3 class="card__title">Links</h3></div>
          <div class="card__body">
            <dl class="detail-list">
              ${contract.driveLink ? `<div class="detail-list__item"><dt>Google Drive</dt><dd><a href="${escapeHtml(contract.driveLink)}" target="_blank" rel="noopener" class="link">Abrir pasta</a></dd></div>` : ''}
              ${contract.contractLink ? `<div class="detail-list__item"><dt>Contrato assinado</dt><dd><a href="${escapeHtml(contract.contractLink)}" target="_blank" rel="noopener" class="link">Ver contrato</a></dd></div>` : ''}
            </dl>
          </div>
        </div>
        `
            : ''
        }

        <div class="card detail-grid__full">
          <div class="card__body">
            <dl class="detail-list detail-list--inline">
              <div class="detail-list__item"><dt>Criado em</dt><dd>${formatDate(contract.createdAt)}</dd></div>
              <div class="detail-list__item"><dt>Atualizado em</dt><dd>${formatDateTime(contract.updatedAt)}</dd></div>
            </dl>
          </div>
        </div>
      </div>
    `;

    renderIcons(container);

    const summaryText = buildWhatsAppSummary({ client, contract, installments });

    container.querySelector('#generate-contract-btn')?.addEventListener('click', () => {
      openContractDocumentModal({ contractId });
    });

    container.querySelector('#whatsapp-btn')?.addEventListener('click', () => {
      if (client?.whatsapp) {
        openWhatsApp(client.whatsapp, summaryText);
      } else {
        showToast('Cliente sem WhatsApp cadastrado.', 'error');
      }
    });

    container.querySelector('#copy-summary-btn')?.addEventListener('click', async () => {
      await copyToClipboard(summaryText);
      showToast('Resumo copiado para a área de transferência.', 'success');
    });

    content.querySelectorAll('[data-pay]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inst = installments.find((i) => i.id === btn.dataset.pay);
        openPaymentModal({
          contractId,
          installment: inst,
          onSaved: () => renderContractDetail(container, contractId),
        });
      });
    });

    content.querySelectorAll('[data-whatsapp-collect]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inst = installments.find((i) => i.id === btn.dataset.whatsappCollect);
        if (!client?.whatsapp) {
          showToast('Cliente sem WhatsApp cadastrado.', 'error');
          return;
        }
        const message = buildInstallmentCollectionMessage({ client, contract, installment: inst });
        openWhatsApp(client.whatsapp, message);
      });
    });

    content.querySelectorAll('[data-delete-payment]').forEach((btn) => {
      btn.addEventListener('click', () => {
        showConfirmModal({
          title: 'Estornar pagamento',
          message: 'Deseja estornar este pagamento? A ação será registrada na auditoria.',
          confirmLabel: 'Estornar',
          onConfirm: async () => {
            await deletePayment({
              contractId,
              installmentId: btn.dataset.deletePayment,
              paymentId: btn.dataset.paymentId,
              user,
            });
            showToast('Pagamento estornado.', 'success');
            renderContractDetail(container, contractId);
          },
        });
      });
    });

    container.querySelector('#edit-contract-btn')?.addEventListener('click', () => {
      openEditContractModal(contractId, () => renderContractDetail(container, contractId));
    });

    container.querySelector('#finalize-btn')?.addEventListener('click', () => {
      showConfirmModal({
        title: 'Finalizar contrato',
        message: 'Marcar este contrato como finalizado?',
        confirmLabel: 'Finalizar',
        variant: 'primary',
        onConfirm: async () => {
          await finalizeContract(contractId);
          showToast('Contrato finalizado.', 'success');
          renderContractDetail(container, contractId);
        },
      });
    });

    container.querySelector('#cancel-btn')?.addEventListener('click', () => {
      showConfirmModal({
        title: 'Cancelar contrato',
        message: `Deseja cancelar o contrato <strong>${escapeHtml(contract.title)}</strong>?`,
        confirmLabel: 'Cancelar contrato',
        onConfirm: async () => {
          await cancelContract(contractId);
          showToast('Contrato cancelado.', 'success');
          renderContractDetail(container, contractId);
        },
      });
    });

    container.querySelector('#delete-contract-btn')?.addEventListener('click', () => {
      showConfirmModal({
        title: 'Excluir contrato',
        message: `Deseja excluir permanentemente o contrato <strong>${escapeHtml(contract.title)}</strong>? Esta ação não pode ser desfeita e removerá parcelas e pagamentos vinculados.`,
        confirmLabel: 'Excluir contrato',
        onConfirm: async () => {
          await deleteContract(contractId, user);
          showToast('Contrato excluído.', 'success');
          navigateTo('/contratos');
        },
      });
    });
  } catch (error) {
    console.error('[Contracts] Erro:', error);
    content.innerHTML = `<p class="text-error">Erro ao carregar contrato.</p>`;
  }
}

async function loadContractsList(listContainer, paginationContainer) {
  listContainer.innerHTML = '';
  listContainer.appendChild(createContractsGridSkeleton(6));

  try {
    const cursor = listState.cursors[listState.page - 1] ?? null;
    const result = await getContracts({
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

    if (result.contracts.length === 0) {
      listContainer.appendChild(
        createEmptyState({
          icon: 'file-text',
          title: 'Nenhum contrato encontrado',
          description: 'Crie o primeiro contrato para começar.',
          action: (() => {
            const btn = document.createElement('button');
            btn.className = 'btn btn--primary';
            btn.textContent = 'Novo contrato';
            btn.addEventListener('click', () =>
              openNewContractModal(() => {
                resetPagination();
                loadContractsList(listContainer, paginationContainer);
              })
            );
            return btn;
          })(),
        })
      );
      paginationContainer.innerHTML = '';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'contracts-grid';
    grid.innerHTML = result.contracts.map((c) => buildContractCardHTML(c)).join('');

    listContainer.appendChild(grid);

    result.contracts.forEach((c) => {
      grid.querySelector(`[data-status="${c.id}"]`)?.appendChild(createContractStatusBadge(c.status));
    });

    renderIcons(grid);
    bindContractCards(grid);
    startContractCardCountdowns(listContainer);

    paginationContainer.innerHTML = '';
    paginationContainer.appendChild(
      createPagination({
        page: listState.page,
        hasMore: result.hasMore,
        hasPrev: listState.page > 1,
        onPageChange: (p) => {
          listState.page = p;
          loadContractsList(listContainer, paginationContainer);
        },
      })
    );
  } catch (error) {
    console.error('[Contracts] Erro ao listar:', error);
    listContainer.innerHTML = `<p class="text-error">Erro ao carregar contratos. Verifique as regras do Firestore.</p>`;
  }
}

function renderContractsList(container) {
  container.innerHTML = `
    <div class="page-header page-header--with-action">
      <div>
        <h2 class="page-header__title">Contratos</h2>
        <p class="page-header__subtitle">Gerencie contratos, serviços e parcelas</p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--secondary" id="contract-templates-btn">
          <i data-lucide="file-cog" aria-hidden="true"></i> Modelos
        </button>
        <button type="button" class="btn btn--primary" id="new-contract-btn">
          <i data-lucide="plus" aria-hidden="true"></i> Novo contrato
        </button>
      </div>
    </div>

    <div class="card">
      <div class="card__body">
        <div class="toolbar">
          <div class="toolbar__search">
            <i data-lucide="search" class="toolbar__search-icon" aria-hidden="true"></i>
            <input type="search" class="form-field__input" id="search-input"
              placeholder="Buscar por título ou cliente..." value="${escapeHtml(listState.search)}" />
          </div>
          <select class="form-field__input toolbar__filter" id="status-filter">
            <option value="all">Todos os status</option>
            ${Object.entries(CONTRACT_STATUS_LABELS)
              .map(
                ([v, l]) =>
                  `<option value="${v}" ${listState.status === v ? 'selected' : ''}>${l}</option>`
              )
              .join('')}
          </select>
          <select class="form-field__input toolbar__filter" id="sort-filter">
            <option value="createdAt-desc" ${listState.sortBy === 'createdAt' && listState.sortDir === 'desc' ? 'selected' : ''}>Mais recentes</option>
            <option value="createdAt-asc" ${listState.sortBy === 'createdAt' && listState.sortDir === 'asc' ? 'selected' : ''}>Mais antigos</option>
            <option value="title-asc" ${listState.sortBy === 'title' && listState.sortDir === 'asc' ? 'selected' : ''}>Título A–Z</option>
            <option value="eventDate-asc" ${listState.sortBy === 'eventDate' && listState.sortDir === 'asc' ? 'selected' : ''}>Evento (próximos)</option>
          </select>
        </div>
        <div id="contracts-list"></div>
        <div id="contracts-pagination" class="clients-pagination"></div>
      </div>
    </div>
  `;

  renderIcons(container);

  const listEl = container.querySelector('#contracts-list');
  const paginationEl = container.querySelector('#contracts-pagination');
  let searchTimeout;

  container.querySelector('#contract-templates-btn').addEventListener('click', () => {
    openContractTemplatesModal();
  });

  container.querySelector('#new-contract-btn').addEventListener('click', () =>
    openNewContractModal(() => {
      resetPagination();
      loadContractsList(listEl, paginationEl);
    })
  );

  container.querySelector('#search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      listState.search = e.target.value;
      resetPagination();
      loadContractsList(listEl, paginationEl);
    }, 350);
  });

  container.querySelector('#status-filter').addEventListener('change', (e) => {
    listState.status = e.target.value;
    resetPagination();
    loadContractsList(listEl, paginationEl);
  });

  container.querySelector('#sort-filter').addEventListener('change', (e) => {
    const [sortBy, sortDir] = e.target.value.split('-');
    listState.sortBy = sortBy;
    listState.sortDir = sortDir;
    resetPagination();
    loadContractsList(listEl, paginationEl);
  });

  loadContractsList(listEl, paginationEl);
}

export function renderContractsPage(container) {
  const contractId = getContractIdFromPath();
  if (contractId) {
    renderContractDetail(container, contractId);
  } else {
    renderContractsList(container);
  }
}
