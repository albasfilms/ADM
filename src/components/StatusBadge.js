import { CLIENT_STATUS, CLIENT_STATUS_LABELS, CONTRACT_STATUS, CONTRACT_STATUS_LABELS } from '../utils/constants.js';

const CLIENT_STATUS_VARIANTS = {
  [CLIENT_STATUS.ACTIVE]: 'success',
  [CLIENT_STATUS.INACTIVE]: 'neutral',
};

const CONTRACT_STATUS_VARIANTS = {
  [CONTRACT_STATUS.BUDGET]: 'neutral',
  [CONTRACT_STATUS.AWAITING_SIGNATURE]: 'warning',
  [CONTRACT_STATUS.AWAITING_ENTRY]: 'warning',
  [CONTRACT_STATUS.CONFIRMED]: 'info',
  [CONTRACT_STATUS.IN_PROGRESS]: 'info',
  [CONTRACT_STATUS.FINISHED]: 'success',
  [CONTRACT_STATUS.PAID_OFF]: 'success',
  [CONTRACT_STATUS.CANCELLED]: 'danger',
};

export function createStatusBadge(status) {
  const badge = document.createElement('span');
  const variant = CLIENT_STATUS_VARIANTS[status] || 'neutral';
  badge.className = `status-badge status-badge--${variant}`;
  badge.textContent = CLIENT_STATUS_LABELS[status] || status;
  return badge;
}

export function createContractStatusBadge(status) {
  const badge = document.createElement('span');
  const variant = CONTRACT_STATUS_VARIANTS[status] || 'neutral';
  badge.className = `status-badge status-badge--${variant}`;
  badge.textContent = CONTRACT_STATUS_LABELS[status] || status;
  return badge;
}
