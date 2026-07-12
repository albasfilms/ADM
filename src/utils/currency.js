export function reaisToCents(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 1000) {
    return value;
  }

  const str = String(value ?? '').trim();
  if (!str) return 0;

  const normalized = str
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const reais = parseFloat(normalized);
  if (Number.isNaN(reais) || reais < 0) return 0;

  return Math.round(reais * 100);
}

export function centsToReais(cents) {
  return (cents || 0) / 100;
}

export function formatCurrency(cents) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(centsToReais(cents));
}

export function formatCurrencyInput(cents) {
  if (!cents && cents !== 0) return '';
  return centsToReais(cents).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function parseCurrencyInput(value) {
  return reaisToCents(value);
}

const MAX_CURRENCY_CENTS = 99999999999;

export function bindCurrencyInput(input) {
  if (input.dataset.currencyBound) return;
  input.dataset.currencyBound = 'true';
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('autocomplete', 'off');

  let cents = parseCurrencyInput(input.value) || 0;

  const applyCents = (nextCents) => {
    cents = Math.max(0, Math.min(nextCents, MAX_CURRENCY_CENTS));
    input.value = cents ? formatCurrencyInput(cents) : '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  if (input.value) {
    applyCents(cents);
  }

  input.addEventListener('keydown', (event) => {
    if (
      event.key === 'Tab' ||
      event.key === 'Enter' ||
      event.key.startsWith('Arrow') ||
      event.key === 'Home' ||
      event.key === 'End' ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      applyCents(Math.floor(cents / 10));
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      applyCents(0);
      return;
    }

    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    applyCents(cents * 10 + parseInt(event.key, 10));
  });

  input.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = event.clipboardData.getData('text') || '';
    applyCents(parseCurrencyInput(text));
  });

  input.addEventListener('blur', () => {
    cents = parseCurrencyInput(input.value) || 0;
    input.value = cents ? formatCurrencyInput(cents) : '';
  });
}

export function sumCents(values) {
  return values.reduce((sum, value) => sum + (Number(value) || 0), 0);
}
