export function createPagination({ page, hasMore, hasPrev, onPageChange }) {
  const container = document.createElement('div');
  container.className = 'pagination';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn btn--secondary btn--sm';
  prevBtn.textContent = 'Anterior';
  prevBtn.disabled = !hasPrev;

  const info = document.createElement('span');
  info.className = 'pagination__info';
  info.textContent = `Página ${page}`;

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn btn--secondary btn--sm';
  nextBtn.textContent = 'Próxima';
  nextBtn.disabled = !hasMore;

  prevBtn.addEventListener('click', () => onPageChange(page - 1));
  nextBtn.addEventListener('click', () => onPageChange(page + 1));

  container.appendChild(prevBtn);
  container.appendChild(info);
  container.appendChild(nextBtn);

  return container;
}
