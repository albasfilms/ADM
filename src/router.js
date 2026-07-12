import { getState, isAuthenticated, closeSidebar } from './appState.js';
import { createSidebar, updateSidebarActiveState } from './components/Sidebar.js';
import { createMobileMenuButton } from './components/Header.js';
import { createLoadingState } from './components/LoadingState.js';
import { clearDataCache } from './utils/dataCache.js';
import { resetPrefetchState } from './utils/prefetch.js';
import { renderLoginPage } from './pages/LoginPage.js';
import {
  renderDashboardPage,
} from './pages/DashboardPage.js';
import { renderClientsPage } from './pages/ClientsPage.js';
import { renderContractsPage } from './pages/ContractsPage.js';
import { renderReportsPage } from './pages/ReportsPage.js';
import { renderCalendarPage } from './pages/CalendarPage.js';
import { renderNotesPage } from './pages/NotesPage.js';
import { renderLinksPage } from './pages/LinksPage.js';
import { renderBudgetsPage } from './pages/BudgetsPage.js';

const PUBLIC_ROUTES = ['/login'];

const ROUTES = {
  '/': {
    title: 'Dashboard',
    requiresAuth: true,
    render: renderDashboardPage,
  },
  '/clientes': {
    title: 'Clientes',
    requiresAuth: true,
    render: renderClientsPage,
  },
  '/contratos': {
    title: 'Contratos',
    requiresAuth: true,
    render: renderContractsPage,
  },
  '/calendario': {
    title: 'Calendário',
    requiresAuth: true,
    render: renderCalendarPage,
  },
  '/relatorios': {
    title: 'Relatórios',
    requiresAuth: true,
    render: renderReportsPage,
  },
  '/notas': {
    title: 'Notas',
    requiresAuth: true,
    render: renderNotesPage,
  },
  '/links': {
    title: 'Links',
    requiresAuth: true,
    render: renderLinksPage,
  },
  '/orcamentos': {
    title: 'Orçamentos',
    requiresAuth: true,
    render: renderBudgetsPage,
  },
  '/login': {
    title: 'Login',
    requiresAuth: false,
    render: renderLoginPage,
  },
};

let shellElements = null;
let lastRenderedPath = null;
let lastAuthSignature = null;

export function getCurrentPath() {
  const hash = window.location.hash.replace('#', '') || '/';
  const path = hash.split('?')[0];
  return path.startsWith('/') ? path : `/${path}`;
}

function resolveRoute(path) {
  if (ROUTES[path]) return ROUTES[path];

  if (path.startsWith('/clientes')) return ROUTES['/clientes'];
  if (path.startsWith('/contratos')) return ROUTES['/contratos'];
  if (path.startsWith('/calendario')) return ROUTES['/calendario'];
  if (path.startsWith('/relatorios')) return ROUTES['/relatorios'];
  if (path.startsWith('/notas')) return ROUTES['/notas'];
  if (path.startsWith('/links')) return ROUTES['/links'];
  if (path.startsWith('/orcamentos')) return ROUTES['/orcamentos'];

  return ROUTES['/'];
}

function getAuthSignature() {
  const { authReady, authUser, profile } = getState();
  return `${authReady}:${authUser?.uid || ''}:${profile?.active || ''}`;
}

function destroyShell() {
  shellElements = null;
  lastRenderedPath = null;
}

export function updateShellUI() {
  if (!shellElements) return;

  const { sidebarOpen } = getState();
  shellElements.sidebar.classList.toggle('sidebar--open', sidebarOpen);
  shellElements.overlay.classList.toggle('sidebar-overlay--visible', sidebarOpen);

  const menuBtn = document.getElementById('menu-toggle');
  if (menuBtn) {
    menuBtn.setAttribute('aria-expanded', String(sidebarOpen));
    menuBtn.setAttribute('aria-label', sidebarOpen ? 'Fechar menu' : 'Abrir menu');
  }

  updateSidebarActiveState(shellElements.sidebar, getCurrentPath());
}

function buildShell() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.className = 'app-shell';

  const sidebar = createSidebar(getCurrentPath());
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.addEventListener('click', () => {
    closeSidebar();
    updateShellUI();
  });

  const main = document.createElement('div');
  main.className = 'app-shell__main';

  const pageContent = document.createElement('main');
  pageContent.className = 'app-shell__content';
  pageContent.id = 'page-content';

  main.appendChild(pageContent);
  app.appendChild(sidebar);
  app.appendChild(overlay);
  app.appendChild(createMobileMenuButton());
  app.appendChild(main);

  shellElements = { sidebar, overlay, pageContent, app };
  updateShellUI();
  return pageContent;
}

function navigate(path, replace = false) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const newHash = `#${normalized}`;

  if (window.location.hash === newHash) {
    render();
    return;
  }

  if (replace) {
    window.location.replace(newHash);
  } else {
    window.location.hash = newHash;
  }
}

function renderLogin(route) {
  destroyShell();
  const app = document.getElementById('app');
  app.className = '';
  app.innerHTML = '';
  const container = document.createElement('div');
  app.appendChild(container);
  route.render(container);
  document.title = `${route.title} — Albas Films`;
}

function renderPage(route, path) {
  if (!shellElements) {
    buildShell();
  } else {
    updateShellUI();
  }

  if (lastRenderedPath === path) {
    return;
  }

  lastRenderedPath = path;
  document.title = `${route.title} — Albas Films`;

  const pageContent = shellElements.pageContent;
  pageContent.innerHTML = '';
  const container = document.createElement('div');
  pageContent.appendChild(container);
  route.render(container);
}

export function render() {
  const { authReady } = getState();

  if (!authReady) {
    destroyShell();
    const app = document.getElementById('app');
    app.className = '';
    app.innerHTML = '';
    app.appendChild(createLoadingState('Verificando autenticação...'));
    return;
  }

  const path = getCurrentPath();
  const route = resolveRoute(path);
  const authenticated = isAuthenticated();
  const authSignature = getAuthSignature();

  if (authSignature !== lastAuthSignature) {
    clearDataCache();
    resetPrefetchState();
    destroyShell();
    lastAuthSignature = authSignature;
  }

  if (route.requiresAuth && !authenticated) {
    navigate('/login', true);
    return;
  }

  if (path === '/login' && authenticated) {
    navigate('/', true);
    return;
  }

  if (path === '/login') {
    renderLogin(route);
    return;
  }

  if (!shellElements) {
    renderPage(route, path);
    return;
  }

  if (lastRenderedPath === path) {
    updateShellUI();
    return;
  }

  renderPage(route, path);
}

export function initRouter() {
  if (!window.location.hash) {
    window.location.hash = '#/login';
  }

  window.addEventListener('hashchange', render);
  render();
}

export function isPublicRoute(path) {
  return PUBLIC_ROUTES.includes(path);
}
