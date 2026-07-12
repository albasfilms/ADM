import { getState, toggleSidebar } from '../appState.js';
import { updateShellUI } from '../router.js';
import { renderIcons } from '../utils/dom.js';

export function createMobileMenuButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mobile-menu-btn';
  button.id = 'menu-toggle';
  button.setAttribute('aria-label', 'Abrir menu');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<i data-lucide="menu" aria-hidden="true"></i>';

  button.addEventListener('click', () => {
    toggleSidebar();
    updateShellUI();
  });

  renderIcons(button);
  return button;
}
