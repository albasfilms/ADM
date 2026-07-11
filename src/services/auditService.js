import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config.js';

export async function createAuditLog({
  action,
  entityType,
  entityId,
  previousData = null,
  newData = null,
  user,
}) {
  await addDoc(collection(db, 'auditLogs'), {
    action,
    entityType,
    entityId,
    previousData,
    newData,
    userId: user.uid,
    userName: user.name || user.email,
    createdAt: serverTimestamp(),
  });
}
