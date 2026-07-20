import { SERVICE_TYPES } from './constants.js';

export const CATALOG_SERVICE_ORDER = [
  SERVICE_TYPES.STORYMAKER,
  SERVICE_TYPES.TEASER,
  SERVICE_TYPES.PRE_WEDDING,
  SERVICE_TYPES.DRONE,
  SERVICE_TYPES.MAKING_OF_BRIDE,
  SERVICE_TYPES.MAKING_OF_GROOM,
  SERVICE_TYPES.FRESTA,
];

const BASE_PRICES_CENTS = {
  [SERVICE_TYPES.STORYMAKER]: 149000,
  [SERVICE_TYPES.TEASER]: 249000,
  [SERVICE_TYPES.PRE_WEDDING]: 179900,
  [SERVICE_TYPES.DRONE]: 40000,
  [SERVICE_TYPES.MAKING_OF]: 70000,
  [SERVICE_TYPES.MAKING_OF_BRIDE]: 70000,
  [SERVICE_TYPES.MAKING_OF_GROOM]: 70000,
  [SERVICE_TYPES.FRESTA]: 40000,
};

const PACKAGE_PRICES_CENTS = {
  [SERVICE_TYPES.TEASER]: 199900,
  [SERVICE_TYPES.PRE_WEDDING]: 139900,
};

export function hasCatalogPrice(serviceType) {
  return Object.prototype.hasOwnProperty.call(BASE_PRICES_CENTS, serviceType);
}

export function hasStorymakerPackage(selectedTypes = []) {
  return selectedTypes.includes(SERVICE_TYPES.STORYMAKER);
}

export function getServicePrice(serviceType, selectedTypes = []) {
  if (!hasCatalogPrice(serviceType)) return 0;

  if (hasStorymakerPackage(selectedTypes) && PACKAGE_PRICES_CENTS[serviceType] != null) {
    return PACKAGE_PRICES_CENTS[serviceType];
  }

  return BASE_PRICES_CENTS[serviceType];
}

export function getCatalogServiceOptions() {
  return CATALOG_SERVICE_ORDER.map((serviceType) => ({
    serviceType,
    price: BASE_PRICES_CENTS[serviceType],
  }));
}
