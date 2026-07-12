import { getDashboardData } from '../services/dashboardService.js';
import { getCalendarData } from '../services/calendarService.js';
import { getContracts } from '../services/contractService.js';
import { getClients } from '../services/clientService.js';
import { getNotes } from '../services/notesService.js';
import { getLinks } from '../services/linksService.js';
import { getAllBudgetEntries } from '../services/calendarService.js';
import { getActiveClients } from '../services/contractService.js';

const PREFETCHERS = {
  '/': () => getDashboardData(),
  '/clientes': () => getClients({ pageSize: 20 }),
  '/contratos': () => getContracts({ pageSize: 20 }),
  '/calendario': () => getCalendarData(),
  '/orcamentos': () => getAllBudgetEntries(),
  '/notas': () => getNotes(),
  '/links': () => getLinks(),
  '/relatorios': () => getActiveClients(),
};

const prefetched = new Set();

export function prefetchRoute(path) {
  const basePath = resolveBasePath(path);
  const prefetcher = PREFETCHERS[basePath];
  if (!prefetcher || prefetched.has(basePath)) return;

  prefetched.add(basePath);
  prefetcher().catch(() => {
    prefetched.delete(basePath);
  });
}

function resolveBasePath(path) {
  if (PREFETCHERS[path]) return path;
  if (path.startsWith('/clientes')) return '/clientes';
  if (path.startsWith('/contratos')) return '/contratos';
  if (path.startsWith('/calendario')) return '/calendario';
  if (path.startsWith('/relatorios')) return '/relatorios';
  if (path.startsWith('/notas')) return '/notas';
  if (path.startsWith('/links')) return '/links';
  if (path.startsWith('/orcamentos')) return '/orcamentos';
  return '/';
}

export function resetPrefetchState() {
  prefetched.clear();
}
