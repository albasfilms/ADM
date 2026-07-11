import { renderIcons } from '../utils/dom.js';

export function createEmptyState({ icon = 'inbox', title, description, action }) {
  const container = document.createElement('div');
  container.className = 'empty-state';
  container.innerHTML = `
    <i data-lucide="${icon}" class="empty-state__icon" width="48" height="48" aria-hidden="true"></i>
    <h3 class="empty-state__title">${title}</h3>
    <p class="empty-state__text">${description}</p>
  `;

  if (action) {
    const actionWrap = document.createElement('div');
    actionWrap.className = 'empty-state__action';
    actionWrap.appendChild(action);
    container.appendChild(actionWrap);
  }

  renderIcons(container);
  return container;
}
