import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config.js';
import { getCurrentUser } from '../appState.js';
import { getCached, invalidateCache } from '../utils/dataCache.js';
import {
  DEFAULT_CONTRACT_TEMPLATE_HTML,
} from '../templates/defaultContractTemplate.js';
import { EVENT_TYPES, EVENT_TYPE_LABELS } from '../utils/constants.js';

const SETTINGS_REF = doc(db, 'settings', 'contractTemplates');
const CACHE_KEY = 'contractTemplates:list';

function getAuthor() {
  const user = getCurrentUser();
  return {
    uid: user?.uid || '',
    name: user?.name || user?.email || 'Usuário',
  };
}

function createEntryId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeItems(data = {}) {
  return Array.isArray(data.items) ? [...data.items] : [];
}

function normalizeTemplateData(data) {
  const name = data.name?.trim() || 'Modelo sem nome';
  const html = data.html?.trim() || '';

  if (!html) {
    throw new Error('O conteúdo do modelo não pode estar vazio.');
  }

  return {
    name,
    html,
    nameLower: name.toLowerCase(),
    eventType: data.eventType || '',
    isDefault: Boolean(data.isDefault),
  };
}

function sortTemplates(items, limitCount = 50) {
  return items
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    })
    .slice(0, limitCount);
}

async function readItems() {
  const snapshot = await getDoc(SETTINGS_REF);
  return normalizeItems(snapshot.exists() ? snapshot.data() : {});
}

async function ensureDefaultTemplate(items) {
  if (items.length > 0) return items;

  const author = getAuthor();
  const now = Date.now();
  const defaultEntries = [
    {
      id: createEntryId('template'),
      name: 'Contrato — Casamento',
      html: DEFAULT_CONTRACT_TEMPLATE_HTML,
      nameLower: 'contrato — casamento',
      eventType: EVENT_TYPES.WEDDING,
      isDefault: true,
      createdBy: author,
      updatedBy: author,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: createEntryId('template'),
      name: 'Contrato — Corporativo',
      html: DEFAULT_CONTRACT_TEMPLATE_HTML.replace(
        'CONTRATO DE PRESTAÇÃO DE SERVIÇOS AUDIOVISUAIS',
        'CONTRATO DE PRESTAÇÃO DE SERVIÇOS — EVENTO CORPORATIVO'
      ),
      nameLower: 'contrato — corporativo',
      eventType: EVENT_TYPES.CORPORATE,
      isDefault: false,
      createdBy: author,
      updatedBy: author,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: createEntryId('template'),
      name: 'Contrato — Eventos',
      html: DEFAULT_CONTRACT_TEMPLATE_HTML.replace(
        'CONTRATO DE PRESTAÇÃO DE SERVIÇOS AUDIOVISUAIS',
        'CONTRATO DE PRESTAÇÃO DE SERVIÇOS — EVENTOS'
      ),
      nameLower: 'contrato — eventos',
      eventType: EVENT_TYPES.EVENTS,
      isDefault: false,
      createdBy: author,
      updatedBy: author,
      createdAt: now,
      updatedAt: now,
    },
  ];

  await runTransaction(db, async (transaction) => {
    transaction.set(
      SETTINGS_REF,
      {
        items: defaultEntries,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  return defaultEntries;
}

export async function getContractTemplates({ limitCount = 50 } = {}) {
  return getCached(CACHE_KEY, async () => {
    const items = await readItems();
    const resolved = items.length ? items : await ensureDefaultTemplate(items);
    return sortTemplates(resolved, limitCount);
  });
}

export async function getDefaultContractTemplate() {
  const templates = await getContractTemplates();
  return templates.find((item) => item.isDefault) || templates[0] || null;
}

export async function getTemplateForEventType(eventType) {
  const templates = await getContractTemplates();
  const match = templates.find((item) => item.eventType === eventType);
  if (match) return match;

  const fallback = templates.find((item) => item.isDefault) || templates[0] || null;
  return fallback;
}

export async function getContractTemplateById(templateId) {
  const templates = await getContractTemplates();
  return templates.find((item) => item.id === templateId) || null;
}

function clearDefaultFlag(items, exceptId = null) {
  return items.map((item) => ({
    ...item,
    isDefault: item.id === exceptId,
  }));
}

export async function createContractTemplate(data) {
  const normalized = normalizeTemplateData(data);
  const author = getAuthor();
  const now = Date.now();

  const entry = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(SETTINGS_REF);
    let items = normalizeItems(snapshot.exists() ? snapshot.data() : []);

    if (normalized.isDefault || items.length === 0) {
      items = clearDefaultFlag(items);
      normalized.isDefault = true;
    }

    const newEntry = {
      id: createEntryId('template'),
      ...normalized,
      createdBy: author,
      updatedBy: author,
      createdAt: now,
      updatedAt: now,
    };

    transaction.set(
      SETTINGS_REF,
      {
        items: [...items, newEntry],
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return newEntry;
  });

  invalidateCache(CACHE_KEY);
  return entry;
}

export async function updateContractTemplate(templateId, data) {
  const normalized = normalizeTemplateData(data);
  const author = getAuthor();
  const now = Date.now();

  const updated = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(SETTINGS_REF);
    const items = normalizeItems(snapshot.exists() ? snapshot.data() : {});
    const index = items.findIndex((item) => item.id === templateId);

    if (index === -1) {
      throw new Error('Modelo não encontrado.');
    }

    let nextItems = [...items];
    const next = {
      ...nextItems[index],
      ...normalized,
      updatedBy: author,
      updatedAt: now,
    };

    if (normalized.isDefault) {
      nextItems = clearDefaultFlag(nextItems, templateId);
      const updatedIndex = nextItems.findIndex((item) => item.id === templateId);
      nextItems[updatedIndex] = next;
    } else {
      nextItems[index] = next;
    }

    transaction.set(
      SETTINGS_REF,
      {
        items: nextItems,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return next;
  });

  invalidateCache(CACHE_KEY);
  return updated;
}

export async function deleteContractTemplate(templateId) {
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(SETTINGS_REF);
    const items = normalizeItems(snapshot.exists() ? snapshot.data() : {});
    const filtered = items.filter((item) => item.id !== templateId);

    if (filtered.length === items.length) {
      throw new Error('Modelo não encontrado.');
    }

    if (!filtered.some((item) => item.isDefault) && filtered.length > 0) {
      filtered[0] = { ...filtered[0], isDefault: true };
    }

    transaction.set(
      SETTINGS_REF,
      {
        items: filtered,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  invalidateCache(CACHE_KEY);
}
