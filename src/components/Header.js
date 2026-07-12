import { getState, toggleSidebar } from '../appState.js';
import { renderIcons } from '../utils/dom.js';

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/clientes': 'Clientes',
  '/contratos': 'Contratos',
  '/calendario': 'Calendário',
  '/orcamentos': 'Orçamentos',
  '/notas': 'Notas',
  '/links': 'Links',
  '/relatorios': 'Relatórios',
};

function getPageTitle(path) {
  if (path.startsWith('/clientes/')) return 'Detalhes do cliente';
  if (path.startsWith('/contratos/')) return 'Detalhes do contrato';
  return PAGE_TITLES[path] || 'Albas Films';
}

export function createHeader(currentPath) {
  const header = document.createElement('header');
  header.className = 'header';
  header.innerHTML = `
    <div class="header__left">
      <button
        type="button"
        class="header__menu-btn"
        id="menu-toggle"
        aria-label="Abrir menu"
        aria-expanded="false"
      >
        <i data-lucide="menu" aria-hidden="true"></i>
      </button>
      <h1 class="header__title">${getPageTitle(currentPath)}</h1>
    </div>
  `;

  header.querySelector('#menu-toggle').addEventListener('click', () => {
    toggleSidebar();
    const { sidebarOpen } = getState();
    const button = header.querySelector('#menu-toggle');
    button.setAttribute('aria-expanded', String(sidebarOpen));
    button.setAttribute('aria-label', sidebarOpen ? 'Fechar menu' : 'Abrir menu');
  });

  renderIcons(header);
  return header;
}
