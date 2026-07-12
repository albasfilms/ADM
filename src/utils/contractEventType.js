import { EVENT_TYPES, SERVICE_TYPES } from './constants.js';

const WEDDING_LEGACY_SERVICES = new Set([
  SERVICE_TYPES.STORYMAKER,
  SERVICE_TYPES.TEASER,
  SERVICE_TYPES.PRE_WEDDING,
  SERVICE_TYPES.MAKING_OF,
  SERVICE_TYPES.FRESTA,
  SERVICE_TYPES.WEDDING,
]);

export function resolveContractEventType(contract = {}) {
  if (contract.eventType && Object.values(EVENT_TYPES).includes(contract.eventType)) {
    return contract.eventType;
  }

  const legacy = contract.serviceType;
  if (!legacy) return EVENT_TYPES.WEDDING;

  if (legacy === SERVICE_TYPES.CORPORATE || legacy === EVENT_TYPES.CORPORATE) {
    return EVENT_TYPES.CORPORATE;
  }

  if (legacy === EVENT_TYPES.EVENTS) {
    return EVENT_TYPES.EVENTS;
  }

  if (legacy === SERVICE_TYPES.WEDDING || WEDDING_LEGACY_SERVICES.has(legacy)) {
    return EVENT_TYPES.WEDDING;
  }

  return EVENT_TYPES.EVENTS;
}
