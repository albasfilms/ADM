const BASE = `${import.meta.env.BASE_URL}images`;

function asset(filename) {
  return `${BASE}/${encodeURI(filename)}`;
}

export const BRAND_LOGO = asset('Logo.webp');

export const BRAND_GALLERY = [
  { src: asset('Casamento .webp'), alt: 'Casamentos' },
  { src: asset('Captação aerea-mobile.webp'), alt: 'Captação aérea' },
  { src: asset('Ensaios fotográficos.webp'), alt: 'Ensaios fotográficos' },
  { src: asset('Edição .webp'), alt: 'Edição e pós-produção' },
];

export const BRAND_HERO = asset('Casamento .webp');
