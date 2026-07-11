export function createSkeletonRows(count = 5, columns = 5) {
  const container = document.createElement('div');
  container.className = 'skeleton-table';

  for (let i = 0; i < count; i += 1) {
    const row = document.createElement('div');
    row.className = 'skeleton-table__row';
    row.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;

    for (let j = 0; j < columns; j += 1) {
      const cell = document.createElement('div');
      cell.className = 'skeleton skeleton--text';
      row.appendChild(cell);
    }

    container.appendChild(row);
  }

  return container;
}

export function createSkeletonCards(count = 4) {
  const container = document.createElement('div');
  container.className = 'skeleton-cards';

  for (let i = 0; i < count; i += 1) {
    const card = document.createElement('div');
    card.className = 'skeleton-card';
    card.innerHTML = `
      <div class="skeleton skeleton--text" style="width: 60%"></div>
      <div class="skeleton skeleton--text" style="width: 40%"></div>
    `;
    container.appendChild(card);
  }

  return container;
}
