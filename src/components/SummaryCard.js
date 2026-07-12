export function createSummaryCard({ label, value, icon = 'circle', clickable = false, action = '' }) {
  const card = document.createElement('div');
  card.className = `summary-card${clickable ? ' summary-card--clickable' : ''}`;
  if (action) card.dataset.action = action;
  if (clickable) {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${label}: ${value}. Clique para ver detalhes.`);
  }
  card.innerHTML = `
    <div class="summary-card__icon"><i data-lucide="${icon}" aria-hidden="true"></i></div>
    <div class="summary-card__content">
      <span class="summary-card__label">${label}</span>
      <strong class="summary-card__value">${value}</strong>
    </div>
  `;
  return card;
}
