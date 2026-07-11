import { getState, isAuthenticated, closeSidebar } from './appState.js';
import { createSidebar } from './components/Sidebar.js';
import { createHeader } from './components/Header.js';
import { createLoadingState } from './components/LoadingState.js';
import { renderLoginPage } from './pages/LoginPage.js';
import {
  renderDashboardPage,
} from './pages/DashboardPage.js';
import { renderClientsPage } from './pages/ClientsPage.js';
import { renderContractsPage } from './pages/ContractsPage.js';
import { renderReportsPage } from './pages/ReportsPage.js';

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
  '/relatorios': {
    title: 'Relatórios',
    requiresAuth: true,
    render: renderReportsPage,
  },
  '/login': {
    title: 'Login',
    requiresAuth: false,
    render: renderLoginPage,
  },
};

export function getCurrentPath() {
  const hash = window.location.hash.replace('#', '') || '/';
  const path = hash.split('?')[0];
  return path.startsWith('/') ? path : `/${path}`;
}

function resolveRoute(path) {
  if (ROUTES[path]) return ROUTES[path];

  if (path.startsWith('/clientes')) return ROUTES['/clientes'];
  if (path.startsWith('/contratos')) return ROUTES['/contratos'];
  if (path.startsWith('/relatorios')) return ROUTES['/relatorios'];

  return ROUTES['/'];
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

function renderAppShell(route, contentContainer) {
  const { sidebarOpen } = getState();
  const app = document.getElementById('app');

  app.innerHTML = '';
  app.className = 'app-shell';

  const sidebar = createSidebar(getCurrentPath());
  if (sidebarOpen) {
    sidebar.classList.add('sidebar--open');
  }

  const overlay = document.createElement('div');
  overlay.className = `sidebar-overlay ${sidebarOpen ? 'sidebar-overlay--visible' : ''}`;
  overlay.addEventListener('click', () => {
    closeSidebar();
    render();
  });

  const main = document.createElement('div');
  main.className = 'app-shell__main';

  const header = createHeader(getCurrentPath());
  const content = document.createElement('main');
  content.className = 'app-shell__content';
  content.id = 'page-content';
  content.appendChild(contentContainer);

  main.appendChild(header);
  main.appendChild(content);
  app.appendChild(sidebar);
  app.appendChild(overlay);
  app.appendChild(main);

  document.title = `${route.title} — Albas Films`;
}

function renderLogin(route) {
  const app = document.getElementById('app');
  app.className = '';
  app.innerHTML = '';
  const container = document.createElement('div');
  app.appendChild(container);
  route.render(container);
  document.title = `${route.title} — Albas Films`;
}

export function render() {
  const { authReady } = getState();

  if (!authReady) {
    const app = document.getElementById('app');
    app.className = '';
    app.innerHTML = '';
    app.appendChild(createLoadingState('Verificando autenticação...'));
    return;
  }

  const path = getCurrentPath();
  const route = resolveRoute(path);
  const authenticated = isAuthenticated();

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

  const pageContent = document.createElement('div');
  route.render(pageContent);
  renderAppShell(route, pageContent);
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
