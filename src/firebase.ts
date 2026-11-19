import { initializeApp } from 'firebase/app';
import {
  doc,
  enableNetwork,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

function createFirestoreInstance(): Firestore {
  const isBrowser = typeof window !== 'undefined';
  const transportSettings = isBrowser
    ? {
        experimentalAutoDetectLongPolling: true,
      }
    : {};

  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
        ...transportSettings,
      },
      firebaseConfig.firestoreDatabaseId,
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          localCache: memoryLocalCache(),
          ...transportSettings,
        },
        firebaseConfig.firestoreDatabaseId,
      );
    } catch {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
}

export const db = createFirestoreInstance();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  const probeRef = doc(db, 'app_config', 'season');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (attempt > 0) {
        await enableNetwork(db).catch(() => {});
      }
      await getDocFromServer(probeRef);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isOfflineErr =
        msg.includes('the client is offline') ||
        msg.includes('Could not reach Cloud Firestore backend');
      if (!isOfflineErr) {
        return true;
      }
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }
      console.error('Please check your Firebase configuration.');
      return false;
    }
  }
  return false;
}
