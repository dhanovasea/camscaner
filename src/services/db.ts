import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { DocumentRecord } from '../types';

interface DokuScanDB extends DBSchema {
  documents: {
    key: string;
    value: DocumentRecord;
    indexes: { 'by-date': number; 'by-title': string };
  };
}

const DB_NAME = 'dokuscan_pwa_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<DokuScanDB>> | null = null;

export const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<DokuScanDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('documents')) {
          const store = db.createObjectStore('documents', { keyPath: 'id' });
          store.createIndex('by-date', 'updatedAt');
          store.createIndex('by-title', 'title');
        }
      },
    });
  }
  return dbPromise;
};

export async function saveDocument(doc: DocumentRecord): Promise<void> {
  const db = await getDB();
  await db.put('documents', doc);
}

export async function getDocument(id: string): Promise<DocumentRecord | undefined> {
  const db = await getDB();
  return db.get('documents', id);
}

export async function getAllDocuments(): Promise<DocumentRecord[]> {
  const db = await getDB();
  const docs = await db.getAllFromIndex('documents', 'by-date');
  // Return sorted newest first
  return docs.reverse();
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('documents', id);
}

export async function clearAllDocuments(): Promise<void> {
  const db = await getDB();
  await db.clear('documents');
}

export async function getStorageQuota(): Promise<{ usedMB: number; quotaMB: number; percent: number }> {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const { usage, quota } = await navigator.storage.estimate();
      const usedMB = usage ? Number((usage / (1024 * 1024)).toFixed(1)) : 0;
      const quotaMB = quota ? Number((quota / (1024 * 1024)).toFixed(0)) : 0;
      const percent = quota ? Math.min(100, Math.round((usage || 0) / quota * 100)) : 0;
      return { usedMB, quotaMB, percent };
    } catch {
      return { usedMB: 0, quotaMB: 0, percent: 0 };
    }
  }
  return { usedMB: 0, quotaMB: 0, percent: 0 };
}
