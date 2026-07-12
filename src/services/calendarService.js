import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config.js';
import { CONTRACT_STATUS } from '../utils/constants.js';
import { toJsDate } from '../utils/installmentStatus.js';
import { getCurrentUser } from '../appState.js';
import { onlyDigits } from '../utils/validators.js';

const SETTINGS_REF = doc(db, 'settings', 'calendar');

export const BLOCK_PRESETS = ['Férias', 'Compromisso pessoal', 'Viagem', 'Folga'];

export function toDateKey(value) {
  const date = toJsDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeBlockedDays(data = {}) {
  if (data.blockedDays && typeof data.blockedDays === 'object' && !Array.isArray(data.blockedDays)) {
    return { ...data.blockedDays };
  }

  const legacy = Array.isArray(data.blockedDates) ? data.blockedDates : [];
  return Object.fromEntries(legacy.map((dateKey) => [dateKey, 'Indisponível']));
}

function normalizeBudgetEntries(data = {}) {
  if (!data.budgetEntries || typeof data.budgetEntries !== 'object' || Array.isArray(data.budgetEntries)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(data.budgetEntries)
      .filter(([, entries]) => Array.isArray(entries))
      .map(([dateKey, entries]) => [
        dateKey,
        entries.map((entry) => ({
          id: entry.id,
          clientName: entry.clientName || '',
          phone: entry.phone || '',
          notes: entry.notes || '',
          createdAt: entry.createdAt || null,
          createdBy: entry.createdBy || null,
        })),
      ])
  );
}

function getAuthor() {
  const user = getCurrentUser();
  return {
    uid: user?.uid || '',
    name: user?.name || user?.email || 'Usuário',
  };
}

function createBudgetEntryId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `budget-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function saveCalendarSettings(transaction, settings) {
  transaction.set(
    SETTINGS_REF,
    {
      blockedDays: settings.blockedDays ?? {},
      budgetEntries: settings.budgetEntries ?? {},
      maxEventsPerDay: settings.maxEventsPerDay || 1,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function getSettingsPayload(data = {}) {
  return {
    blockedDays: normalizeBlockedDays(data),
    budgetEntries: normalizeBudgetEntries(data),
    maxEventsPerDay: data.maxEventsPerDay || 1,
  };
}

export async function setBlockedDate(dateKey, reason) {
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(SETTINGS_REF);
    const data = snapshot.exists() ? snapshot.data() : {};
    const settings = getSettingsPayload(data);
    const blockedDays = {
      ...settings.blockedDays,
      [dateKey]: reason.trim() || 'Indisponível',
    };

    saveCalendarSettings(transaction, {
      ...settings,
      blockedDays,
    });

    return blockedDays;
  });
}

export async function removeBlockedDate(dateKey) {
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(SETTINGS_REF);
    const data = snapshot.exists() ? snapshot.data() : {};
    const settings = getSettingsPayload(data);
    const blockedDays = { ...settings.blockedDays };
    delete blockedDays[dateKey];

    saveCalendarSettings(transaction, {
      ...settings,
      blockedDays,
    });

    return blockedDays;
  });
}

export async function addBudgetEntry(dateKey, { clientName, phone, notes }) {
  const name = clientName?.trim();
  if (!name) {
    throw new Error('O nome do cliente é obrigatório.');
  }

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(SETTINGS_REF);
    const data = snapshot.exists() ? snapshot.data() : {};
    const settings = getSettingsPayload(data);
    const budgetEntries = { ...settings.budgetEntries };
    const entry = {
      id: createBudgetEntryId(),
      clientName: name,
      phone: phone ? onlyDigits(phone) : '',
      notes: notes?.trim() || '',
      createdAt: Date.now(),
      createdBy: getAuthor(),
    };

    budgetEntries[dateKey] = [...(budgetEntries[dateKey] || []), entry];

    saveCalendarSettings(transaction, {
      ...settings,
      budgetEntries,
    });

    return { budgetEntries, entry };
  });
}

export async function removeBudgetEntry(dateKey, entryId) {
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(SETTINGS_REF);
    const data = snapshot.exists() ? snapshot.data() : {};
    const settings = getSettingsPayload(data);
    const budgetEntries = { ...settings.budgetEntries };
    const current = budgetEntries[dateKey] || [];
    const filtered = current.filter((entry) => entry.id !== entryId);

    if (filtered.length) {
      budgetEntries[dateKey] = filtered;
    } else {
      delete budgetEntries[dateKey];
    }

    saveCalendarSettings(transaction, {
      ...settings,
      budgetEntries,
    });

    return budgetEntries;
  });
}

export async function getCalendarSettings() {
  const snapshot = await getDoc(SETTINGS_REF);
  if (!snapshot.exists()) {
    return { blockedDays: {}, budgetEntries: {}, maxEventsPerDay: 1 };
  }

  const data = snapshot.data();
  const settings = getSettingsPayload(data);
  return settings;
}

export function getBlockedDateKeys(blockedDays = {}) {
  return Object.keys(blockedDays);
}

export function flattenBudgetEntries(budgetEntries = {}) {
  return Object.entries(budgetEntries)
    .flatMap(([dateKey, entries]) =>
      (entries || []).map((entry) => ({
        ...entry,
        dateKey,
      }))
    )
    .sort((a, b) => {
      const dateCompare = b.dateKey.localeCompare(a.dateKey);
      if (dateCompare !== 0) return dateCompare;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
}

export async function getAllBudgetEntries() {
  const settings = await getCalendarSettings();
  return flattenBudgetEntries(settings.budgetEntries);
}

export async function getCalendarData() {
  const snapshot = await getDocs(
    query(collection(db, 'contracts'), orderBy('createdAt', 'desc'), limit(500))
  );

  const contracts = snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((contract) => contract.eventDate && contract.status !== CONTRACT_STATUS.CANCELLED);

  const settings = await getCalendarSettings();

  return {
    contracts,
    blockedDays: settings.blockedDays,
    budgetEntries: settings.budgetEntries,
    maxEventsPerDay: settings.maxEventsPerDay,
  };
}
