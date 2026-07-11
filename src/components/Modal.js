import { renderIcons } from '../utils/dom.js';

export function createModal({ title, content, footer, size = 'md', onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'modal-title');

  const modal = document.createElement('div');
  modal.className = `modal modal--${size}`;
  modal.innerHTML = `
    <div class="modal__header">
      <h2 class="modal__title" id="modal-title">${title}</h2>
      <button type="button" class="modal__close" aria-label="Fechar">
        <i data-lucide="x" aria-hidden="true"></i>
      </button>
    </div>
    <div class="modal__body"></div>
    <div class="modal__footer"></div>
  `;

  const body = modal.querySelector('.modal__body');
  const footerEl = modal.querySelector('.modal__footer');

  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof HTMLElement) {
    body.appendChild(content);
  }

  if (footer) {
    if (typeof footer === 'string') {
      footerEl.innerHTML = footer;
    } else {
      footerEl.appendChild(footer);
    }
  } else {
    footerEl.remove();
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const close = () => {
    overlay.remove();
    document.body.style.overflow = '';
    onClose?.();
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  modal.querySelector('.modal__close').addEventListener('click', close);

  const handleKeydown = (event) => {
    if (event.key === 'Escape') {
      close();
      document.removeEventListener('keydown', handleKeydown);
    }
  };
  document.addEventListener('keydown', handleKeydown);

  renderIcons(modal);

  return { overlay, modal, body, footer: footerEl, close };
}
