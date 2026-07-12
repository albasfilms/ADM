import { getState, isAuthenticated, closeSidebar } from './appState.js';
import { createSidebar, updateSidebarActiveState } from './components/Sidebar.js';
import { createMobileMenuButton } from './components/Header.js';
import { createLoadingState } from './components/LoadingState.js';
import { clearDataCache } from './utils/dataCache.js';
import { resetPrefetchState } from './utils/prefetch.js';

const PUBLIC_ROUTES = ['/login'];

const ROUTES = {
  '/': {
    title: 'Dashboard',
    requiresAuth: true,
    load: () => import('./pages/DashboardPage.js'),
    renderKey: 'renderDashboardPage',
  },
  '/clientes': {
    title: 'Clientes',
    requiresAuth: true,
    load: () => import('./pages/ClientsPage.js'),
    renderKey: 'renderClientsPage',
  },
  '/contratos': {
    title: 'Contratos',
    requiresAuth: true,
    load: () => import('./pages/ContractsPage.js'),
    renderKey: 'renderContractsPage',
  },
  '/calendario': {
    title: 'Calendário',
    requiresAuth: true,
    load: () => import('./pages/CalendarPage.js'),
    renderKey: 'renderCalendarPage',
  },
  '/relatorios': {
    title: 'Relatórios',
    requiresAuth: true,
    load: () => import('./pages/ReportsPage.js'),
    renderKey: 'renderReportsPage',
  },
  '/notas': {
    title: 'Notas',
    requiresAuth: true,
    load: () => import('./pages/NotesPage.js'),
    renderKey: 'renderNotesPage',
  },
  '/links': {
    title: 'Links',
    requiresAuth: true,
    load: () => import('./pages/LinksPage.js'),
    renderKey: 'renderLinksPage',
  },
  '/orcamentos': {
    title: 'Orçamentos',
    requiresAuth: true,
    load: () => import('./pages/BudgetsPage.js'),
    renderKey: 'renderBudgetsPage',
  },
  '/login': {
    title: 'Login',
    requiresAuth: false,
    load: () => import('./pages/LoginPage.js'),
    renderKey: 'renderLoginPage',
  },
};

let shellElements = null;
let lastRenderedPath = null;
let lastAuthSignature = null;
const loadedModules = new Map();

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

async function loadRouteModule(route) {
  if (!loadedModules.has(route.renderKey)) {
    loadedModules.set(route.renderKey, route.load());
  }
  return loadedModules.get(route.renderKey);
}

async function renderLogin(route) {
  destroyShell();
  const app = document.getElementById('app');
  app.className = '';
  app.innerHTML = '';
  app.appendChild(createLoadingState('Carregando...'));

  const module = await loadRouteModule(route);
  app.innerHTML = '';
  const container = document.createElement('div');
  app.appendChild(container);
  await module[route.renderKey](container);
  document.title = `${route.title} — Albas Films`;
}

async function renderPage(route, path) {
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
  pageContent.appendChild(createLoadingState('Carregando...'));

  try {
    const module = await loadRouteModule(route);
    const container = document.createElement('div');
    pageContent.innerHTML = '';
    pageContent.appendChild(container);
    await module[route.renderKey](container);
  } catch (error) {
    console.error('[Router] Erro ao carregar página:', error);
    pageContent.innerHTML = '<p class="text-error">Erro ao carregar a página. Tente novamente.</p>';
  }
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
    loadedModules.clear();
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
