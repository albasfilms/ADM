import { createNote, deleteNote, getNotes, updateNote } from '../services/notesService.js';
import { createModal } from '../components/Modal.js';
import { createEmptyState } from '../components/EmptyState.js';
import { showConfirmModal } from '../components/ConfirmModal.js';
import { createSkeletonRows } from '../components/Skeleton.js';
import { formatDateTime } from '../utils/dates.js';
import { escapeHtml, getFirestoreErrorMessage, renderIcons, showToast } from '../utils/dom.js';

function buildNoteForm(note = null) {
  const form = document.createElement('form');
  form.className = 'note-form';
  form.innerHTML = `
    <div class="form-field">
      <label class="form-field__label" for="note-title">Título (opcional)</label>
      <input
        type="text"
        class="form-field__input"
        id="note-title"
        name="title"
        value="${escapeHtml(note?.title || '')}"
        placeholder="Ex.: Mensagem para cliente, lembrete de reunião..."
        maxlength="120"
      />
    </div>
    <div class="form-field">
      <label class="form-field__label" for="note-content">Mensagem</label>
      <textarea
        class="form-field__textarea"
        id="note-content"
        name="content"
        rows="8"
        placeholder="Escreva aqui o que quiser salvar..."
        required
      >${escapeHtml(note?.content || '')}</textarea>
    </div>
  `;
  return form;
}

function openNoteModal(note, onSaved) {
  const isEdit = Boolean(note);
  const form = buildNoteForm(note);

  const footer = document.createElement('div');
  footer.className = 'modal__actions';
  footer.innerHTML = `
    <button type="button" class="btn btn--secondary" data-action="cancel">Cancelar</button>
    <button type="submit" class="btn btn--primary" form="note-form-submit" id="note-save-btn">
      <i data-lucide="save" aria-hidden="true"></i>
      ${isEdit ? 'Salvar alterações' : 'Salvar nota'}
    </button>
  `;

  form.id = 'note-form-submit';

  const { close } = createModal({
    title: isEdit ? 'Editar nota' : 'Nova nota',
    content: form,
    footer,
    size: 'md',
  });

  footer.querySelector('[data-action="cancel"]').addEventListener('click', close);
  renderIcons(footer);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const title = form.querySelector('#note-title')?.value || '';
    const content = form.querySelector('#note-content')?.value || '';

    if (!content.trim()) {
      showToast('Escreva uma mensagem antes de salvar.', 'error');
      form.querySelector('#note-content')?.focus();
      return;
    }

    const saveBtn = footer.querySelector('#note-save-btn');
    saveBtn.disabled = true;
    saveBtn.classList.add('btn--loading');

    try {
      if (isEdit) {
        await updateNote(note.id, { title, content });
        showToast('Nota atualizada.', 'success');
      } else {
        await createNote({ title, content });
        showToast('Nota salva com sucesso.', 'success');
      }
      close();
      await onSaved?.();
    } catch (error) {
      console.error('[Notes] Erro ao salvar nota:', error);
      showToast(getFirestoreErrorMessage(error, error.message || 'Erro ao salvar nota.'), 'error');
      saveBtn.disabled = false;
      saveBtn.classList.remove('btn--loading');
    }
  });

  setTimeout(() => {
    const focusTarget = form.querySelector(isEdit ? '#note-content' : '#note-title');
    focusTarget?.focus();
  }, 0);
}

function renderNoteCard(note) {
  return `
    <article class="note-card" data-note-id="${note.id}">
      <div class="note-card__header">
        <h3 class="note-card__title">${escapeHtml(note.title || 'Sem título')}</h3>
        <div class="note-card__toolbar">
          <button type="button" class="btn btn--ghost btn--sm note-card__icon-btn" data-action="edit" data-note-id="${note.id}" aria-label="Editar nota">
            <i data-lucide="pencil" aria-hidden="true"></i>
          </button>
          <button type="button" class="btn btn--ghost btn--sm note-card__icon-btn" data-action="delete" data-note-id="${note.id}" aria-label="Excluir nota">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <p class="note-card__content">${escapeHtml(note.content || '')}</p>
      <footer class="note-card__meta">
        <span>${escapeHtml(note.updatedBy?.name || note.createdBy?.name || 'Usuário')}</span>
        <span>${formatDateTime(note.updatedAt || note.createdAt)}</span>
      </footer>
    </article>
  `;
}

function renderNotesGrid(notes) {
  return `
    <div class="notes-grid" id="notes-grid">
      ${notes.map((note) => renderNoteCard(note)).join('')}
    </div>
  `;
}

function bindNotesPage(container, state) {
  const render = () => {
    const listEl = container.querySelector('#notes-list');
    if (!listEl) return;

    if (state.loading) {
      listEl.innerHTML = '';
      listEl.appendChild(createSkeletonRows(3, 3));
      return;
    }

    if (!state.notes.length) {
      listEl.innerHTML = '';
      const emptyState = createEmptyState({
        icon: 'sticky-note',
        title: 'Nenhuma nota salva',
        description: 'Clique em "Nova nota" para criar sua primeira anotação.',
      });
      listEl.appendChild(emptyState);
      return;
    }

    listEl.innerHTML = renderNotesGrid(state.notes);
    renderIcons(listEl);
  };

  const loadNotes = async () => {
    state.loading = true;
    render();

    try {
      state.notes = await getNotes();
    } catch (error) {
      console.error('[Notes] Erro ao carregar notas:', error);
      showToast(getFirestoreErrorMessage(error, 'Erro ao carregar notas.'), 'error');
      state.notes = [];
    } finally {
      state.loading = false;
      render();
    }
  };

  container.querySelector('#new-note-btn')?.addEventListener('click', () => {
    openNoteModal(null, loadNotes);
  });

  container.querySelector('#notes-list')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const { action, noteId } = button.dataset;
    if (!noteId) return;

    if (action === 'edit') {
      const note = state.notes.find((item) => item.id === noteId);
      if (note) {
        openNoteModal(note, loadNotes);
      }
      return;
    }

    if (action === 'delete') {
      const note = state.notes.find((item) => item.id === noteId);
      showConfirmModal({
        title: 'Excluir nota',
        message: `Tem certeza que deseja excluir "${escapeHtml(note?.title || 'esta nota')}"?`,
        confirmLabel: 'Excluir',
        variant: 'danger',
        onConfirm: async () => {
          await deleteNote(noteId);
          showToast('Nota excluída.', 'success');
          await loadNotes();
        },
      });
    }
  });

  loadNotes();
}

export function renderNotesPage(container) {
  container.innerHTML = `
    <div class="page-header page-header--with-action">
      <div>
        <h2 class="page-header__title">Notas</h2>
        <p class="page-header__subtitle">Escreva e salve mensagens, lembretes e anotações rápidas</p>
      </div>
      <button type="button" class="btn btn--primary" id="new-note-btn">
        <i data-lucide="plus" aria-hidden="true"></i>
        Nova nota
      </button>
    </div>

    <section class="notes-section">
      <div id="notes-list"></div>
    </section>
  `;

  renderIcons(container);

  bindNotesPage(container, {
    notes: [],
    loading: true,
  });
}
