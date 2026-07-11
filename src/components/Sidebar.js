import { getState, closeSidebar } from '../appState.js';
import { logout } from '../services/authService.js';
import { ROLE_LABELS } from '../utils/permissions.js';
import { getInitials, renderIcons } from '../utils/dom.js';
import { BRAND_LOGO } from '../utils/brandAssets.js';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: 'layout-dashboard' },
  { path: '/clientes', label: 'Clientes', icon: 'users' },
  { path: '/contratos', label: 'Contratos', icon: 'file-text' },
  { path: '/relatorios', label: 'Relatórios', icon: 'bar-chart-3' },
];

export function createSidebar(currentPath) {
  const { profile } = getState();
  const roleLabel = ROLE_LABELS[profile?.role] || 'Usuário';
  const roleClass = profile?.role === 'admin' ? 'badge--admin' : 'badge--collaborator';

  const navLinks = NAV_ITEMS.map((item) => {
    const isActive =
      item.path === '/'
        ? currentPath === '/'
        : currentPath.startsWith(item.path);

    return `
      <a
        href="#${item.path}"
        class="sidebar__link ${isActive ? 'sidebar__link--active' : ''}"
        data-nav-link
      >
        <i data-lucide="${item.icon}" class="sidebar__icon" aria-hidden="true"></i>
        <span>${item.label}</span>
      </a>
    `;
  }).join('');

  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';
  sidebar.setAttribute('aria-label', 'Menu principal');
  sidebar.innerHTML = `
    <div class="sidebar__brand">
      <img class="sidebar__logo-img" src="${BRAND_LOGO}" alt="Albas Films" />
      <div>
        <div class="sidebar__name">Albas Films</div>
        <div class="sidebar__tagline">Administração</div>
      </div>
    </div>

    <nav class="sidebar__nav" aria-label="Navegação">
      ${navLinks}
    </nav>

    <div class="sidebar__footer">
      <div class="sidebar__user">
        <div class="sidebar__avatar" aria-hidden="true">${getInitials(profile?.name || profile?.email)}</div>
        <div class="sidebar__user-info">
          <div class="sidebar__user-name">${profile?.name || profile?.email || 'Usuário'}</div>
          <div class="sidebar__user-role">
            <span class="badge ${roleClass}">${roleLabel}</span>
          </div>
        </div>
      </div>
      <button type="button" class="btn btn--secondary btn--full" id="logout-btn">
        <i data-lucide="log-out" aria-hidden="true"></i>
        Sair
      </button>
    </div>
  `;

  sidebar.querySelectorAll('[data-nav-link]').forEach((link) => {
    link.addEventListener('click', () => closeSidebar());
  });

  sidebar.querySelector('#logout-btn').addEventListener('click', async () => {
    const button = sidebar.querySelector('#logout-btn');
    button.disabled = true;
    button.classList.add('btn--loading');

    try {
      await logout();
      window.location.hash = '#/login';
    } catch (error) {
      console.error('[Sidebar] Erro ao sair:', error);
      button.disabled = false;
      button.classList.remove('btn--loading');
    }
  });

  renderIcons(sidebar);
  return sidebar;
}
