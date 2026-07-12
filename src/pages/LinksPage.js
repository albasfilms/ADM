import { createLink, deleteLink, getLinks, updateLink } from '../services/linksService.js';
import { createModal } from '../components/Modal.js';
import { createEmptyState } from '../components/EmptyState.js';
import { showConfirmModal } from '../components/ConfirmModal.js';
import { createSkeletonRows } from '../components/Skeleton.js';
import { formatDateTime } from '../utils/dates.js';
import { escapeHtml, getFirestoreErrorMessage, renderIcons, showToast } from '../utils/dom.js';

function buildLinkForm(link = null) {
  const form = document.createElement('form');
  form.className = 'link-form';
  form.innerHTML = `
    <div class="form-field">
      <label class="form-field__label" for="link-name">Nome</label>
      <input
        type="text"
        class="form-field__input"
        id="link-name"
        name="name"
        value="${escapeHtml(link?.name || '')}"
        placeholder="Ex.: Contrato padrão, Pasta do Drive, Site da empresa..."
        maxlength="120"
        required
      />
    </div>
    <div class="form-field">
      <label class="form-field__label" for="link-url">Endereço (URL)</label>
      <input
        type="url"
        class="form-field__input"
        id="link-url"
        name="url"
        value="${escapeHtml(link?.url || '')}"
        placeholder="https://..."
        maxlength="500"
        required
      />
    </div>
    <div class="form-field">
      <label class="form-field__label" for="link-description">Descrição (opcional)</label>
      <textarea
        class="form-field__textarea"
        id="link-description"
        name="description"
        rows="4"
        placeholder="Para que serve este link, observações..."
      >${escapeHtml(link?.description || '')}</textarea>
    </div>
  `;
  return form;
}

function openLinkModal(link, onSaved) {
  const isEdit = Boolean(link);
  const form = buildLinkForm(link);

  const footer = document.createElement('div');
  footer.className = 'modal__actions';
  footer.innerHTML = `
    <button type="button" class="btn btn--secondary" data-action="cancel">Cancelar</button>
    <button type="submit" class="btn btn--primary" form="link-form-submit" id="link-save-btn">
      <i data-lucide="save" aria-hidden="true"></i>
      ${isEdit ? 'Salvar alterações' : 'Salvar link'}
    </button>
  `;

  form.id = 'link-form-submit';

  const { close } = createModal({
    title: isEdit ? 'Editar link' : 'Novo link',
    content: form,
    footer,
    size: 'md',
  });

  footer.querySelector('[data-action="cancel"]').addEventListener('click', close);
  renderIcons(footer);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = form.querySelector('#link-name')?.value || '';
    const url = form.querySelector('#link-url')?.value || '';
    const description = form.querySelector('#link-description')?.value || '';

    if (!name.trim()) {
      showToast('Informe o nome do link.', 'error');
      form.querySelector('#link-name')?.focus();
      return;
    }

    if (!url.trim()) {
      showToast('Informe o endereço do link.', 'error');
      form.querySelector('#link-url')?.focus();
      return;
    }

    const saveBtn = footer.querySelector('#link-save-btn');
    saveBtn.disabled = true;
    saveBtn.classList.add('btn--loading');

    try {
      if (isEdit) {
        await updateLink(link.id, { name, url, description });
        showToast('Link atualizado.', 'success');
      } else {
        await createLink({ name, url, description });
        showToast('Link salvo com sucesso.', 'success');
      }
      close();
      await onSaved?.();
    } catch (error) {
      console.error('[Links] Erro ao salvar link:', error);
      showToast(getFirestoreErrorMessage(error, error.message || 'Erro ao salvar link.'), 'error');
      saveBtn.disabled = false;
      saveBtn.classList.remove('btn--loading');
    }
  });

  setTimeout(() => {
    form.querySelector('#link-name')?.focus();
  }, 0);
}

function renderLinkCard(link) {
  const descriptionHtml = link.description
    ? `<p class="link-card__description">${escapeHtml(link.description)}</p>`
    : '';

  return `
    <article class="link-card" data-link-id="${link.id}">
      <div class="link-card__header">
        <a
          href="${escapeHtml(link.url)}"
          target="_blank"
          rel="noopener noreferrer"
          class="link-card__name"
        >${escapeHtml(link.name)}</a>
        <div class="link-card__toolbar">
          <button type="button" class="btn btn--ghost btn--sm link-card__icon-btn" data-action="open" data-link-id="${link.id}" data-url="${escapeHtml(link.url)}" aria-label="Abrir link">
            <i data-lucide="external-link" aria-hidden="true"></i>
          </button>
          <button type="button" class="btn btn--ghost btn--sm link-card__icon-btn" data-action="edit" data-link-id="${link.id}" aria-label="Editar link">
            <i data-lucide="pencil" aria-hidden="true"></i>
          </button>
          <button type="button" class="btn btn--ghost btn--sm link-card__icon-btn" data-action="delete" data-link-id="${link.id}" aria-label="Excluir link">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      ${descriptionHtml}
      <p class="link-card__url">${escapeHtml(link.url)}</p>
      <footer class="link-card__meta">
        <span>${escapeHtml(link.updatedBy?.name || link.createdBy?.name || 'Usuário')}</span>
        <span>${formatDateTime(link.updatedAt || link.createdAt)}</span>
      </footer>
    </article>
  `;
}

function renderLinksGrid(links) {
  return `
    <div class="links-grid" id="links-grid">
      ${links.map((link) => renderLinkCard(link)).join('')}
    </div>
  `;
}

function bindLinksPage(container, state) {
  const render = () => {
    const listEl = container.querySelector('#links-list');
    if (!listEl) return;

    if (state.loading) {
      listEl.innerHTML = '';
      listEl.appendChild(createSkeletonRows(3, 3));
      return;
    }

    if (!state.links.length) {
      listEl.innerHTML = '';
      const emptyState = createEmptyState({
        icon: 'link',
        title: 'Nenhum link cadastrado',
        description: 'Clique em "Novo link" para cadastrar seu primeiro link.',
      });
      listEl.appendChild(emptyState);
      return;
    }

    listEl.innerHTML = renderLinksGrid(state.links);
    renderIcons(listEl);
  };

  const loadLinks = async () => {
    state.loading = true;
    render();

    try {
      state.links = await getLinks();
    } catch (error) {
      console.error('[Links] Erro ao carregar links:', error);
      showToast(getFirestoreErrorMessage(error, 'Erro ao carregar links.'), 'error');
      state.links = [];
    } finally {
      state.loading = false;
      render();
    }
  };

  container.querySelector('#new-link-btn')?.addEventListener('click', () => {
    openLinkModal(null, loadLinks);
  });

  container.querySelector('#links-list')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const { action, linkId, url } = button.dataset;
    if (!linkId) return;

    if (action === 'open') {
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    if (action === 'edit') {
      const link = state.links.find((item) => item.id === linkId);
      if (link) {
        openLinkModal(link, loadLinks);
      }
      return;
    }

    if (action === 'delete') {
      const link = state.links.find((item) => item.id === linkId);
      showConfirmModal({
        title: 'Excluir link',
        message: `Tem certeza que deseja excluir "${escapeHtml(link?.name || 'este link')}"?`,
        confirmLabel: 'Excluir',
        variant: 'danger',
        onConfirm: async () => {
          await deleteLink(linkId);
          showToast('Link excluído.', 'success');
          await loadLinks();
        },
      });
    }
  });

  loadLinks();
}

export function renderLinksPage(container) {
  container.innerHTML = `
    <div class="page-header page-header--with-action">
      <div>
        <h2 class="page-header__title">Links</h2>
        <p class="page-header__subtitle">Cadastre links úteis com nome e descrição para acesso rápido</p>
      </div>
      <button type="button" class="btn btn--primary" id="new-link-btn">
        <i data-lucide="plus" aria-hidden="true"></i>
        Novo link
      </button>
    </div>

    <section class="links-section">
      <div id="links-list"></div>
    </section>
  `;

  renderIcons(container);

  bindLinksPage(container, {
    links: [],
    loading: true,
  });
}
