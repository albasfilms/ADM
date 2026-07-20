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
  deleteField,
} from 'firebase/firestore';
import { db } from '../firebase/config.js';
import { CONTRACT_STATUS, INSTALLMENT_STATUS } from '../utils/constants.js';
import { toJsDate, getInstallmentRemaining } from '../utils/installmentStatus.js';
import { toDateInputValue } from '../utils/dates.js';
import { getCurrentUser } from '../appState.js';
import { onlyDigits } from '../utils/validators.js';
import { getInstallmentsForContracts } from './contractService.js';
import { getCached, invalidateCache, invalidateCacheByPrefix } from '../utils/dataCache.js';

const SETTINGS_REF = doc(db, 'settings', 'calendar');

export const BLOCK_PRESETS = ['Férias', 'Compromisso pessoal', 'Viagem', 'Folga'];

export function toDateKey(value) {
  return toDateInputValue(value);
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
          amount: Number(entry.amount) || 0,
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

function saveCalendarSettings(transaction, settings) {
  // O merge do Firestore combina mapas sem remover chaves ausentes.
  // Apagamos os mapas antes de regravar para que desbloqueios e exclusões persistam.
  transaction.set(
    SETTINGS_REF,
    {
      blockedDays: deleteField(),
      budgetEntries: deleteField(),
      blockedDates: deleteField(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

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

function invalidateCalendarCache() {
  invalidateCache('calendar:data');
  invalidateCache('calendar:settings');
  invalidateCache('calendar:budgets');
}

function getSettingsPayload(data = {}) {
  return {
    blockedDays: normalizeBlockedDays(data),
    budgetEntries: normalizeBudgetEntries(data),
    maxEventsPerDay: data.maxEventsPerDay || 1,
  };
}

export async function setBlockedDate(dateKey, reason) {
  const blockedDays = await runTransaction(db, async (transaction) => {
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

  invalidateCalendarCache();
  return blockedDays;
}

export async function removeBlockedDate(dateKey) {
  const blockedDays = await runTransaction(db, async (transaction) => {
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

  invalidateCalendarCache();
  return blockedDays;
}

export async function addBudgetEntry(dateKey, { clientName, phone, notes, amount = 0 }) {
  const name = clientName?.trim();
  if (!name) {
    throw new Error('O nome do cliente é obrigatório.');
  }

  const result = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(SETTINGS_REF);
    const data = snapshot.exists() ? snapshot.data() : {};
    const settings = getSettingsPayload(data);
    const budgetEntries = { ...settings.budgetEntries };
    const entry = {
      id: createBudgetEntryId(),
      clientName: name,
      phone: phone ? onlyDigits(phone) : '',
      notes: notes?.trim() || '',
      amount: Math.max(0, Number(amount) || 0),
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

  invalidateCalendarCache();
  return result;
}

export async function removeBudgetEntry(dateKey, entryId) {
  const budgetEntries = await runTransaction(db, async (transaction) => {
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

  invalidateCalendarCache();
  return budgetEntries;
}

export async function getCalendarSettings() {
  return getCached('calendar:settings', async () => {
    const snapshot = await getDoc(SETTINGS_REF);
    if (!snapshot.exists()) {
      return { blockedDays: {}, budgetEntries: {}, maxEventsPerDay: 1 };
    }

    const data = snapshot.data();
    return getSettingsPayload(data);
  });
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
  return getCached('calendar:budgets', async () => {
    const settings = await getCalendarSettings();
    return flattenBudgetEntries(settings.budgetEntries);
  });
}

async function getPendingPayments(contracts = []) {
  const activeContracts = contracts.filter((contract) => contract.status !== CONTRACT_STATUS.CANCELLED);
  const pairs = await getInstallmentsForContracts(activeContracts);

  return pairs
    .filter(({ installment }) => installment.status !== INSTALLMENT_STATUS.CANCELLED)
    .filter(({ installment }) => getInstallmentRemaining(installment) > 0);
}

export function groupPendingPaymentsByDate(pendingPayments = []) {
  const map = new Map();

  pendingPayments.forEach((item) => {
    const dateKey = toDateKey(item.installment.dueDate);
    if (!dateKey) return;
    if (!map.has(dateKey)) map.set(dateKey, []);
    map.get(dateKey).push(item);
  });

  map.forEach((items) => {
    items.sort((a, b) => {
      const numberCompare = (a.installment.number ?? 0) - (b.installment.number ?? 0);
      if (numberCompare !== 0) return numberCompare;
      return String(a.contract.clientName || '').localeCompare(String(b.contract.clientName || ''), 'pt-BR');
    });
  });

  return map;
}

export async function getCalendarData() {
  return getCached('calendar:data', async () => {
    const snapshot = await getDocs(
      query(collection(db, 'contracts'), orderBy('createdAt', 'desc'), limit(500))
    );

    const allContracts = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    const contracts = allContracts.filter((contract) => contract.eventDate && contract.status !== CONTRACT_STATUS.CANCELLED);
    const pendingPayments = await getPendingPayments(allContracts);
    const settings = await getCalendarSettings();

    return {
      contracts,
      blockedDays: settings.blockedDays,
      budgetEntries: settings.budgetEntries,
      maxEventsPerDay: settings.maxEventsPerDay,
      paymentsByDate: groupPendingPaymentsByDate(pendingPayments),
    };
  });
}
