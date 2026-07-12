import { toJsDate, startOfDay } from './installmentStatus.js';

function pad(value) {
  return String(value).padStart(2, '0');
}

export function getEventDateTime(contract) {
  const date = toJsDate(contract.eventDate);
  if (!date) return null;

  const event = new Date(date);
  if (contract.eventTime) {
    const [hours, minutes] = contract.eventTime.split(':').map(Number);
    event.setHours(hours || 0, minutes || 0, 0, 0);
  } else {
    event.setHours(12, 0, 0, 0);
  }

  return event;
}

export function getEventTimestamp(contract) {
  return getEventDateTime(contract)?.getTime() ?? null;
}

export function formatCountdown(targetMs) {
  const diff = targetMs - Date.now();

  if (diff <= 0) {
    return { text: 'Evento realizado', variant: 'done' };
  }

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (days > 0) {
    return {
      text: `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
      variant: days <= 3 ? 'soon' : 'upcoming',
    };
  }

  return {
    text: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
    variant: 'soon',
  };
}

export function formatDaysUntilEvent(targetMs) {
  if (!targetMs) return { text: 'Sem data', variant: 'none' };

  const today = startOfDay();
  const eventDay = startOfDay(new Date(targetMs));
  const days = Math.round((eventDay - today) / 86400000);

  if (days < 0 || targetMs < Date.now()) {
    return { text: 'Evento realizado', variant: 'done' };
  }
  if (days === 0) return { text: 'É hoje!', variant: 'soon' };
  if (days === 1) return { text: 'Falta 1 dia', variant: 'soon' };
  if (days <= 7) return { text: `Faltam ${days} dias`, variant: 'soon' };
  return { text: `Faltam ${days} dias`, variant: 'upcoming' };
}

export function formatEventDateTime(contract) {
  const event = getEventDateTime(contract);
  if (!event) return '—';

  const date = event.toLocaleDateString('pt-BR');
  const time = contract.eventTime || '';
  return time ? `${date} · ${time}` : date;
}
