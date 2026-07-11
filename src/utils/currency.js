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

export function bindCurrencyInput(input) {
  input.addEventListener('input', () => {
    const cents = parseCurrencyInput(input.value);
    input.value = cents ? formatCurrencyInput(cents) : '';
  });

  input.addEventListener('blur', () => {
    const cents = parseCurrencyInput(input.value);
    input.value = cents ? formatCurrencyInput(cents) : '';
  });
}

export function sumCents(values) {
  return values.reduce((sum, value) => sum + (Number(value) || 0), 0);
}
