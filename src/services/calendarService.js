import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config.js';
import { CONTRACT_STATUS } from '../utils/constants.js';
import { toJsDate } from '../utils/installmentStatus.js';

const SETTINGS_REF = doc(db, 'settings', 'calendar');

export function toDateKey(value) {
  const date = toJsDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getCalendarSettings() {
  const snapshot = await getDoc(SETTINGS_REF);
  if (!snapshot.exists()) {
    return { blockedDates: [], maxEventsPerDay: 1 };
  }

  const data = snapshot.data();
  return {
    blockedDates: Array.isArray(data.blockedDates) ? data.blockedDates : [],
    maxEventsPerDay: data.maxEventsPerDay || 1,
  };
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
    blockedDates: settings.blockedDates,
    maxEventsPerDay: settings.maxEventsPerDay,
  };
}

export async function toggleBlockedDate(dateKey) {
  const settings = await getCalendarSettings();
  const blocked = new Set(settings.blockedDates || []);

  if (blocked.has(dateKey)) {
    blocked.delete(dateKey);
  } else {
    blocked.add(dateKey);
  }

  await setDoc(
    SETTINGS_REF,
    {
      blockedDates: [...blocked].sort(),
      maxEventsPerDay: settings.maxEventsPerDay || 1,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return [...blocked].sort();
}
