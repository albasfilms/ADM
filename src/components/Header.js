import { getState, toggleSidebar } from '../appState.js';
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
    const { sidebarOpen } = getState();
    button.setAttribute('aria-expanded', String(sidebarOpen));
    button.setAttribute('aria-label', sidebarOpen ? 'Fechar menu' : 'Abrir menu');
  });

  renderIcons(button);
  return button;
}
