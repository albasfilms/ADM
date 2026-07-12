import { SERVICE_TYPES } from './constants.js';
import { CATALOG_SERVICE_ORDER } from './servicePricing.js';

export const CONTRACT_ITEM_SERVICE_ORDER = [
  ...CATALOG_SERVICE_ORDER,
  SERVICE_TYPES.FILMMAKER,
  SERVICE_TYPES.PHOTOGRAPHY,
  SERVICE_TYPES.PORTRAIT,
  SERVICE_TYPES.CONTENT,
  SERVICE_TYPES.OTHER,
];

export function isContractItemService(serviceType) {
  return CONTRACT_ITEM_SERVICE_ORDER.includes(serviceType);
}
