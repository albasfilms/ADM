import { login, resetPassword, consumeAuthError } from '../services/authService.js';
import { renderIcons } from '../utils/dom.js';
import { BRAND_LOGO } from '../utils/brandAssets.js';

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function renderLoginPage(container) {
  container.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-card__brand">
          <img class="login-card__logo-img" src="${BRAND_LOGO}" alt="Albas Films" />
          <h1 class="login-card__title">Painel administrativo</h1>
          <p class="login-card__subtitle">Acesse com seu e-mail e senha</p>
        </div>

        <form class="login-form" id="login-form" novalidate>
          <div id="login-error" class="login-form__error" role="alert" hidden></div>

          <div class="form-field">
            <label class="form-field__label" for="email">E-mail</label>
            <input
              class="form-field__input"
              type="email"
              id="email"
              name="email"
              autocomplete="email"
              placeholder="seu@email.com"
              required
            />
            <span class="form-field__error" id="email-error" hidden></span>
          </div>

          <div class="form-field">
            <label class="form-field__label" for="password">Senha</label>
            <div class="password-field">
              <input
                class="form-field__input"
                type="password"
                id="password"
                name="password"
                autocomplete="current-password"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                class="password-field__toggle"
                id="toggle-password"
                aria-label="Mostrar senha"
              >
                <i data-lucide="eye" aria-hidden="true"></i>
              </button>
            </div>
            <span class="form-field__error" id="password-error" hidden></span>
          </div>

          <div class="login-form__actions">
            <button type="submit" class="btn btn--primary btn--full" id="login-btn">
              Entrar
            </button>
            <button type="button" class="login-form__forgot" id="forgot-password">
              Esqueci minha senha
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const form = container.querySelector('#login-form');
  const emailInput = container.querySelector('#email');
  const passwordInput = container.querySelector('#password');
  const loginBtn = container.querySelector('#login-btn');
  const errorBox = container.querySelector('#login-error');
  const emailError = container.querySelector('#email-error');
  const passwordError = container.querySelector('#password-error');
  const togglePassword = container.querySelector('#toggle-password');
  const forgotPassword = container.querySelector('#forgot-password');

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearErrors() {
    errorBox.hidden = true;
    errorBox.textContent = '';
    emailError.hidden = true;
    passwordError.hidden = true;
    emailInput.classList.remove('form-field__input--error');
    passwordInput.classList.remove('form-field__input--error');
  }

  togglePassword.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    togglePassword.setAttribute('aria-label', isPassword ? 'Esconder senha' : 'Mostrar senha');
    togglePassword.innerHTML = `<i data-lucide="${isPassword ? 'eye-off' : 'eye'}" aria-hidden="true"></i>`;
    renderIcons(togglePassword);
  });

  forgotPassword.addEventListener('click', async () => {
    clearErrors();
    const email = emailInput.value.trim();

    if (!email) {
      emailError.textContent = 'Informe seu e-mail para recuperar a senha.';
      emailError.hidden = false;
      emailInput.classList.add('form-field__input--error');
      emailInput.focus();
      return;
    }

    if (!validateEmail(email)) {
      emailError.textContent = 'Informe um e-mail válido.';
      emailError.hidden = false;
      emailInput.classList.add('form-field__input--error');
      emailInput.focus();
      return;
    }

    forgotPassword.disabled = true;
    forgotPassword.textContent = 'Enviando...';

    try {
      await resetPassword(email);
      showError('E-mail de recuperação enviado. Verifique sua caixa de entrada.');
    } catch (error) {
      showError(error.message);
    } finally {
      forgotPassword.disabled = false;
      forgotPassword.textContent = 'Esqueci minha senha';
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    let hasError = false;

    if (!email) {
      emailError.textContent = 'O e-mail é obrigatório.';
      emailError.hidden = false;
      emailInput.classList.add('form-field__input--error');
      hasError = true;
    } else if (!validateEmail(email)) {
      emailError.textContent = 'Informe um e-mail válido.';
      emailError.hidden = false;
      emailInput.classList.add('form-field__input--error');
      hasError = true;
    }

    if (!password) {
      passwordError.textContent = 'A senha é obrigatória.';
      passwordError.hidden = false;
      passwordInput.classList.add('form-field__input--error');
      hasError = true;
    }

    if (hasError) return;

    loginBtn.disabled = true;
    loginBtn.classList.add('btn--loading');

    try {
      await login(email, password);
      window.location.hash = '#/';
    } catch (error) {
      showError(error.message);
    } finally {
      loginBtn.disabled = false;
      loginBtn.classList.remove('btn--loading');
    }
  });

  renderIcons(container);

  const pendingError = consumeAuthError();
  if (pendingError) {
    showError(pendingError);
  }

  emailInput.focus();
}
