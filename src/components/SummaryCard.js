export function createSummaryCard({ label, value, icon = 'circle' }) {
  const card = document.createElement('div');
  card.className = 'summary-card';
  card.innerHTML = `
    <div class="summary-card__icon"><i data-lucide="${icon}" aria-hidden="true"></i></div>
    <div class="summary-card__content">
      <span class="summary-card__label">${label}</span>
      <strong class="summary-card__value">${value}</strong>
    </div>
  `;
  return card;
}
