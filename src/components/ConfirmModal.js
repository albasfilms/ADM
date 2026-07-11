import { createModal } from './Modal.js';

export function showConfirmModal({
  title = 'Confirmar ação',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  onConfirm,
}) {
  const footer = document.createElement('div');
  footer.className = 'modal__actions';
  footer.innerHTML = `
    <button type="button" class="btn btn--secondary" data-action="cancel">${cancelLabel}</button>
    <button type="button" class="btn btn--${variant === 'danger' ? 'danger' : 'primary'}" data-action="confirm">${confirmLabel}</button>
  `;

  const { close } = createModal({
    title,
    content: `<p class="confirm-modal__message">${message}</p>`,
    footer,
  });

  footer.querySelector('[data-action="cancel"]').addEventListener('click', close);

  footer.querySelector('[data-action="confirm"]').addEventListener('click', async () => {
    const confirmBtn = footer.querySelector('[data-action="confirm"]');
    confirmBtn.disabled = true;
    confirmBtn.classList.add('btn--loading');

    try {
      await onConfirm?.();
      close();
    } catch (error) {
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('btn--loading');
      throw error;
    }
  });
}
