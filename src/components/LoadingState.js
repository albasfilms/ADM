export function createLoadingState(message = 'Carregando...') {
  const container = document.createElement('div');
  container.className = 'app-loading';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  container.innerHTML = `
    <div class="app-loading__spinner" aria-hidden="true"></div>
    <p>${message}</p>
  `;
  return container;
}
