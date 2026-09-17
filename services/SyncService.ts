import { db } from '../firebase';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

export interface SyncTask {
  id: string;
  collection: string;
  documentId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  payload?: Record<string, unknown>;
  timestamp: number;
  retryCount?: number;
  nextRetryAt?: number;
}

const LOCAL_STORAGE_KEY = 'offline-sync-queue';

export class BackgroundSyncService {
  private static retryTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly BASE_DELAY_MS = 2000;

  private static getQueue(): SyncTask[] {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  private static saveQueue(queue: SyncTask[]) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(queue));
  }

  public static enqueueTask(task: Omit<SyncTask, 'id' | 'timestamp'>) {
    const queue = this.getQueue();
    const newTask: SyncTask = {
      ...task,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    queue.push(newTask);
    this.saveQueue(queue);

    // If we're currently online, try syncing right away
    if (navigator.onLine) {
      this.syncPendingChanges();
    }
  }

  public static async syncPendingChanges(force = false) {
    if (!navigator.onLine) return;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    const queue = this.getQueue();
    if (queue.length === 0) return;

    const now = Date.now();
    const tasksToRun = queue.filter(task => force || !task.nextRetryAt || task.nextRetryAt <= now);
    const tasksToWait = queue.filter(task => !force && task.nextRetryAt && task.nextRetryAt > now);

    if (tasksToRun.length === 0) {
      this.scheduleNextRetry(tasksToWait);
      return;
    }

    console.log(`Starting sync for ${tasksToRun.length} pending local changes to Firestore...`);

    const failedTasks: SyncTask[] = [...tasksToWait];

    for (const task of tasksToRun) {
      try {
        const docRef = doc(db, task.collection, task.documentId);
        
        if (task.operation === 'CREATE') {
          await setDoc(docRef, task.payload);
        } else if (task.operation === 'UPDATE') {
          await updateDoc(docRef, task.payload);
        } else if (task.operation === 'DELETE') {
          await deleteDoc(docRef);
        }

        console.log(`Successfully synced task ${task.id} (${task.operation} ${task.collection}/${task.documentId})`);
      } catch (error) {
        console.error(`Failed to sync task ${task.id}:`, error);
        
        const retryCount = (task.retryCount || 0) + 1;
        // Exponential backoff: 2s, 4s, 8s, 16s... up to 5 mins
        const delayMs = Math.min(this.BASE_DELAY_MS * Math.pow(2, retryCount - 1), 60000 * 5);
        
        failedTasks.push({
          ...task,
          retryCount,
          nextRetryAt: Date.now() + delayMs
        });
        // We could use handleFirestoreError here potentially if we want the standard app error handling
      }
    }

    // Save remaining (failed) tasks back to the queue
    this.saveQueue(failedTasks);
    
    if (failedTasks.length === 0 && queue.length > 0) {
      console.log('Sync complete!');
      // Dispatch a success event if needed
      window.dispatchEvent(new CustomEvent('sync-completed'));
    } else if (failedTasks.length > 0) {
      this.scheduleNextRetry(failedTasks);
    }
  }

  private static scheduleNextRetry(queue: SyncTask[]) {
    const now = Date.now();
    let earliest = Number.MAX_SAFE_INTEGER;
    for (const task of queue) {
      if (task.nextRetryAt && task.nextRetryAt < earliest) {
        earliest = task.nextRetryAt;
      }
    }

    if (earliest !== Number.MAX_SAFE_INTEGER) {
      const delay = Math.max(0, earliest - now);
      this.retryTimer = setTimeout(() => {
        this.syncPendingChanges();
      }, delay);
    }
  }

  public static getPendingCount(): number {
    return this.getQueue().length;
  }
}
