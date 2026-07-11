import './styles/global.css';
import { initAuthListener } from './services/authService.js';
import { subscribe } from './appState.js';
import { initRouter, render } from './router.js';
import { initToastContainer } from './utils/dom.js';

function bootstrap() {
  initToastContainer();
  initAuthListener();
  initRouter();

  subscribe(() => {
    render();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
