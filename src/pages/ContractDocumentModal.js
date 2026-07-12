import { createModal } from '../components/Modal.js';
import { showConfirmModal } from '../components/ConfirmModal.js';
import { getContractFull } from '../services/contractService.js';
import { getClientById } from '../services/clientService.js';
import {
  createContractTemplate,
  deleteContractTemplate,
  getContractTemplates,
  getTemplateForEventType,
  updateContractTemplate,
} from '../services/contractTemplateService.js';
import {
  generateContractDocumentHtml,
  openContractDocumentPrint,
} from '../services/contractDocumentService.js';
import { TEMPLATE_PLACEHOLDERS_HELP } from '../templates/defaultContractTemplate.js';
import { EVENT_TYPE_LABELS, EVENT_TYPES } from '../utils/constants.js';
import { resolveContractEventType } from '../utils/contractEventType.js';
import { escapeHtml, renderIcons, showToast } from '../utils/dom.js';

function buildEventTypeOptions(selected = '') {
  const options = Object.entries(EVENT_TYPE_LABELS)
    .map(
      ([value, label]) =>
        `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`
    )
    .join('');

  return `<option value="" ${!selected ? 'selected' : ''}>Qualquer modelo</option>${options}`;
}

async function loadContractBundle(contractId) {
  const full = await getContractFull(contractId);
  if (!full?.contract) {
    throw new Error('Contrato não encontrado.');
  }

  const client = await getClientById(full.contract.clientId);
  return {
    contract: full.contract,
    items: full.items || [],
    installments: full.installments || [],
    client,
  };
}

function buildTemplateOptions(templates, selectedId) {
  return templates
    .map(
      (template) =>
        `<option value="${template.id}" ${template.id === selectedId ? 'selected' : ''}>${escapeHtml(template.name)}${template.isDefault ? ' (padrão)' : ''}</option>`
    )
    .join('');
}

export function openContractTemplatesModal({ onChanged } = {}) {
  const state = { templates: [], editingId: null };

  const { body, modal, close } = createModal({
    title: 'Modelos de contrato',
    content: '<p class="text-muted">Carregando modelos...</p>',
    size: 'lg',
  });

  const refresh = async () => {
    state.templates = await getContractTemplates();
    const editing =
      state.editingId === 'new'
        ? { id: 'new', name: '', html: '', eventType: EVENT_TYPES.WEDDING, isDefault: state.templates.length === 0 }
        : state.editingId
          ? state.templates.find((item) => item.id === state.editingId)
          : null;

    body.innerHTML = `
      <div class="contract-templates">
        <div class="contract-templates__toolbar">
          <button type="button" class="btn btn--primary btn--sm" data-action="new-template">
            <i data-lucide="plus" aria-hidden="true"></i> Novo modelo
          </button>
        </div>

        <div class="contract-templates__list">
          ${
            state.templates.length
              ? state.templates
                  .map(
                    (template) => `
              <div class="contract-templates__item ${editing?.id === template.id ? 'is-editing' : ''}">
                <div class="contract-templates__item-info">
                  <strong>${escapeHtml(template.name)}</strong>
                  ${template.eventType ? `<span class="status-badge">${escapeHtml(EVENT_TYPE_LABELS[template.eventType] || template.eventType)}</span>` : ''}
                  ${template.isDefault ? '<span class="status-badge status-badge--info">Padrão</span>' : ''}
                </div>
                <div class="contract-templates__item-actions">
                  <button type="button" class="btn btn--ghost btn--sm" data-action="edit-template" data-id="${template.id}">Editar</button>
                  ${
                    state.templates.length > 1
                      ? `<button type="button" class="btn btn--ghost btn--sm" data-action="delete-template" data-id="${template.id}">Excluir</button>`
                      : ''
                  }
                </div>
              </div>
            `
                  )
                  .join('')
              : '<p class="text-muted">Nenhum modelo cadastrado.</p>'
          }
        </div>

        ${
          editing
            ? `
          <form class="contract-templates__editor" id="template-editor-form">
            <h3 class="form-section__title">${state.editingId === 'new' ? 'Novo modelo' : 'Editar modelo'}</h3>
            <div class="form-field">
              <label class="form-field__label">Nome do modelo *</label>
              <input class="form-field__input" name="name" value="${escapeHtml(editing.name || '')}" required />
            </div>
            <div class="form-field">
              <label class="form-field__label">Modelo do evento</label>
              <select class="form-field__input" name="eventType">${buildEventTypeOptions(editing.eventType || '')}</select>
            </div>
            <div class="form-field">
              <label class="form-field__label">
                <span>Conteúdo HTML do modelo *</span>
                <span class="text-muted">Cole aqui o contrato com placeholders</span>
              </label>
              <textarea class="form-field__input form-field__textarea contract-templates__textarea" name="html" rows="14" required>${escapeHtml(editing.html || '')}</textarea>
            </div>
            <label class="form-checkbox">
              <input type="checkbox" name="isDefault" ${editing.isDefault ? 'checked' : ''} />
              <span>Usar como modelo padrão</span>
            </label>
            <div class="contract-templates__editor-actions">
              <button type="button" class="btn btn--secondary" data-action="cancel-edit">Cancelar</button>
              <button type="submit" class="btn btn--primary">Salvar modelo</button>
            </div>
          </form>
        `
            : ''
        }

        <details class="contract-templates__help">
          <summary>Ver placeholders disponíveis</summary>
          <div class="contract-templates__help-body">${TEMPLATE_PLACEHOLDERS_HELP}</div>
        </details>
      </div>
    `;

    renderIcons(modal);

    body.querySelector('[data-action="new-template"]')?.addEventListener('click', () => {
      state.editingId = 'new';
      refresh();
    });

    body.querySelectorAll('[data-action="edit-template"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingId = btn.dataset.id;
        refresh();
      });
    });

    body.querySelector('[data-action="cancel-edit"]')?.addEventListener('click', () => {
      state.editingId = null;
      refresh();
    });

    body.querySelectorAll('[data-action="delete-template"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const template = state.templates.find((item) => item.id === btn.dataset.id);
        showConfirmModal({
          title: 'Excluir modelo',
          message: `Deseja excluir o modelo "${template?.name || ''}"?`,
          confirmLabel: 'Excluir',
          variant: 'danger',
          onConfirm: async () => {
            await deleteContractTemplate(btn.dataset.id);
            if (state.editingId === btn.dataset.id) state.editingId = null;
            showToast('Modelo excluído.', 'success');
            await refresh();
            onChanged?.();
          },
        });
      });
    });

    body.querySelector('#template-editor-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = {
        name: form.name.value,
        html: form.html.value,
        eventType: form.eventType.value,
        isDefault: form.isDefault.checked,
      };

      try {
        if (state.editingId === 'new') {
          await createContractTemplate(payload);
          showToast('Modelo criado.', 'success');
        } else {
          await updateContractTemplate(state.editingId, payload);
          showToast('Modelo atualizado.', 'success');
        }
        state.editingId = null;
        await refresh();
        onChanged?.();
      } catch (error) {
        showToast(error.message || 'Erro ao salvar modelo.', 'error');
      }
    });
  };

  refresh();

  return { close };
}

export async function openContractDocumentModal({ contractId, templateId = null } = {}) {
  if (!contractId) {
    showToast('Contrato não informado.', 'error');
    return;
  }

  let bundle;
  let templates;
  let selectedTemplateId = templateId;
  let previewHtml = '';

  try {
    [bundle, templates] = await Promise.all([
      loadContractBundle(contractId),
      getContractTemplates(),
    ]);
  } catch (error) {
    showToast(error.message || 'Erro ao carregar contrato.', 'error');
    return;
  }

  if (!templates.length) {
    showToast('Nenhum modelo de contrato disponível.', 'error');
    return;
  }

  const contractEventType = resolveContractEventType(bundle.contract);
  const suggestedTemplate = templateId
    ? templates.find((item) => item.id === templateId)
    : await getTemplateForEventType(contractEventType);

  selectedTemplateId = suggestedTemplate?.id || templates.find((item) => item.isDefault)?.id || templates[0].id;

  const updatePreview = async () => {
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) return;

    previewHtml = await generateContractDocumentHtml({
      templateHtml: template.html,
      contract: bundle.contract,
      client: bundle.client,
      items: bundle.items,
      installments: bundle.installments,
    });

    const previewEl = body.querySelector('#contract-doc-preview');
    if (previewEl) {
      previewEl.innerHTML = previewHtml;
    }
  };

  const { body, modal, close } = createModal({
    title: 'Gerar contrato',
    content: '',
    size: 'xl',
    footer: `
      <button type="button" class="btn btn--secondary" data-action="manage-templates">Gerenciar modelos</button>
      <button type="button" class="btn btn--secondary" data-action="close-modal">Fechar</button>
      <button type="button" class="btn btn--primary" data-action="print-contract">
        <i data-lucide="printer" aria-hidden="true"></i> Imprimir / Salvar PDF
      </button>
    `,
  });

  body.innerHTML = `
    <div class="contract-document-modal">
      <div class="form-field">
        <label class="form-field__label">Modelo de contrato</label>
        <select class="form-field__input" id="contract-template-select">
          ${buildTemplateOptions(templates, selectedTemplateId)}
        </select>
      </div>
      <p class="text-muted contract-document-modal__hint">
        Evento: <strong>${escapeHtml(EVENT_TYPE_LABELS[contractEventType] || contractEventType)}</strong>.
        O modelo sugerido foi escolhido automaticamente; você pode trocar abaixo.
      </p>
      <div class="contract-document-modal__preview-wrap">
        <div id="contract-doc-preview" class="contract-document-modal__preview"></div>
      </div>
    </div>
  `;

  renderIcons(modal);

  body.querySelector('#contract-template-select')?.addEventListener('change', async (event) => {
    selectedTemplateId = event.target.value;
    await updatePreview();
  });

  modal.querySelector('[data-action="close-modal"]')?.addEventListener('click', close);

  modal.querySelector('[data-action="manage-templates"]')?.addEventListener('click', () => {
    openContractTemplatesModal({
      onChanged: async () => {
        templates = await getContractTemplates();
        const select = body.querySelector('#contract-template-select');
        if (select) {
          select.innerHTML = buildTemplateOptions(templates, selectedTemplateId);
        }
        await updatePreview();
      },
    });
  });

  modal.querySelector('[data-action="print-contract"]')?.addEventListener('click', () => {
    try {
      if (!previewHtml) {
        showToast('Nenhum conteúdo para imprimir.', 'error');
        return;
      }
      openContractDocumentPrint(previewHtml, bundle.contract.title || 'Contrato');
    } catch (error) {
      showToast(error.message || 'Erro ao abrir impressão.', 'error');
    }
  });

  await updatePreview();

  return { close };
}

export async function promptGenerateContractAfterCreate(contractId) {
  showConfirmModal({
    title: 'Contrato criado',
    message: 'Deseja gerar o documento do contrato agora com os dados preenchidos?',
    confirmLabel: 'Gerar contrato',
    cancelLabel: 'Depois',
    variant: 'primary',
    onConfirm: () => {
      openContractDocumentModal({ contractId });
    },
  });
}
