import { SERVICE_TYPES } from './constants.js';
import { CATALOG_SERVICE_ORDER } from './servicePricing.js';

export const PRE_WEDDING_DEFAULTS = {
  time: '06:00',
};

export const MAKING_OF_BRIDE_DEFAULTS = {
  location: 'No local da festa',
  hoursBeforeCeremony: 2,
};

export function calculateMakingOfBrideTime(eventTime, hoursBefore = MAKING_OF_BRIDE_DEFAULTS.hoursBeforeCeremony) {
  if (!eventTime || !/^\d{1,2}:\d{2}$/.test(eventTime)) return '';

  const [hours, minutes] = eventTime.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return '';

  const totalMinutes = hours * 60 + minutes - hoursBefore * 60;
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const resultHours = Math.floor(normalized / 60);
  const resultMinutes = normalized % 60;

  return `${String(resultHours).padStart(2, '0')}:${String(resultMinutes).padStart(2, '0')}`;
}

export function isTimeValue(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

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
