import { createIcons, icons } from 'lucide';

let toastContainer = null;

export function initToastContainer() {
  if (toastContainer) return toastContainer;

  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  toastContainer.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastContainer);
  return toastContainer;
}

export function showToast(message, type = 'info', duration = 4000) {
  const container = initToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

export function renderIcons(root = document) {
  createIcons({ icons, attrs: { 'stroke-width': 1.75 } });
  void root;
}

export function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function getFirestoreErrorMessage(error, fallback = 'Erro ao salvar. Tente novamente.') {
  if (!error) return fallback;

  const code = error.code || '';
  const message = String(error.message || '').toLowerCase();

  if (code === 'permission-denied' || message.includes('permission')) {
    return 'Sem permissão no Firestore. Publique as regras com: firebase deploy --only firestore:rules';
  }

  if (code === 'failed-precondition') {
    return 'Índice do Firestore pendente. Aguarde alguns minutos e tente novamente.';
  }

  if (code === 'unavailable') {
    return 'Firestore indisponível no momento. Verifique sua conexão.';
  }

  return error.message || fallback;
}
