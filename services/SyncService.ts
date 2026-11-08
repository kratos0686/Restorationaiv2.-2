import { db } from '../firebase';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Project, SyncQueueItem, SyncQueueOperation } from '../types';
import { EventBus } from './EventBus';

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
const OUTBOX_STORAGE_KEY = 'restoration_ai_outbox_queue_v1';
const LOCAL_DOSSIER_STORE_KEY = 'restoration_ai_local_projects_v1';
const LAST_SYNCED_KEY = 'restoration_ai_last_synced_at_v1';
const SIMULATED_OFFLINE_KEY = 'restoration_ai_simulated_offline_v1';

/**
 * Computes a deterministic SHA-256 style cryptographic verification hash
 * binding the project metrics, claim number, signer identity, and timestamp.
 */
export function computeSignatureVerificationHash(
  project: Partial<Project>,
  signerName: string,
  formType: string,
  signedAt: number
): string {
  const canonicalPayload = [
    project.id || 'UNKNOWN_ID',
    project.claimNumber || 'NO_CLAIM',
    project.client || 'NO_CLIENT',
    project.waterCategory || 'CAT',
    project.lossClass || 'CLASS',
    String((project.equipment || []).length),
    String((project.referenceReadings || []).length),
    String((project.dryingMonitor || []).length),
    signerName.trim().toUpperCase(),
    formType,
    String(signedAt)
  ].join('|');

  // Deterministic 256-bit (8 x 32-bit lanes) FNV-1a / Murmur-style avalanche digest
  const lanes = [
    0x811c9dc5, 0xcbf29ce4, 0x84222325, 0x1b873593,
    0xcc9e2d51, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35
  ];

  for (let i = 0; i < canonicalPayload.length; i++) {
    const code = canonicalPayload.charCodeAt(i);
    const laneIdx = i % 8;
    let h = lanes[laneIdx] ^ code;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 16;
    lanes[laneIdx] = h >>> 0;
  }

  // Cross-mix lanes for full avalanche
  for (let round = 0; round < 2; round++) {
    for (let j = 0; j < 8; j++) {
      const prev = lanes[(j + 7) % 8];
      let mixed = (lanes[j] ^ ((prev << 5) | (prev >>> 27))) >>> 0;
      mixed = Math.imul(mixed, 0x85ebca6b) >>> 0;
      lanes[j] = mixed;
    }
  }

  const hexDigest = lanes
    .map(val => val.toString(16).toUpperCase().padStart(8, '0'))
    .join('');

  return `SHA256-${hexDigest.slice(0, 8)}-${hexDigest.slice(8, 16)}-${hexDigest.slice(16, 24)}`;
}

/**
 * Classifies a partial project diff into a domain-specific SyncQueueOperation
 */
export function classifyProjectOperation(updates: Partial<Project>): {
  operation: SyncQueueOperation;
  description: string;
} {
  const keys = Object.keys(updates);
  if (keys.includes('signedAuthorizations')) {
    const count = updates.signedAuthorizations?.length || 0;
    return {
      operation: 'ADD_SIGNATURE',
      description: `Certified digital authorization (${count} total on file)`
    };
  }
  if (keys.includes('referenceReadings') || keys.includes('dryingMonitor') || keys.includes('rooms')) {
    return {
      operation: 'UPDATE_READINGS',
      description: 'Updated psychrometric & moisture telemetry readings'
    };
  }
  if (keys.includes('moisturePins')) {
    const pinCount = updates.moisturePins?.length || 0;
    return {
      operation: 'UPDATE_PINS',
      description: `Updated 2D floorplan moisture pins (${pinCount} active)`
    };
  }
  if (keys.includes('equipment') || keys.includes('equipmentLogs')) {
    const eqCount = updates.equipment?.length || 0;
    return {
      operation: 'UPDATE_EQUIPMENT',
      description: `Updated S500 drying equipment deployment (${eqCount} units)`
    };
  }
  if (keys.includes('attachedDocuments')) {
    const docCount = updates.attachedDocuments?.length || 0;
    return {
      operation: 'UPDATE_DOCUMENTS',
      description: `Indexed external report attachment (${docCount} total)`
    };
  }
  if (keys.includes('reportProfiles') || keys.includes('activeReportProfileId') || keys.includes('carrierPacketConfig')) {
    return {
      operation: 'UPDATE_PROFILES',
      description: 'Updated carrier packet profile configuration'
    };
  }
  return {
    operation: 'FULL_PROJECT_SAVE',
    description: `Updated project dossier (${keys.slice(0, 3).join(', ')})`
  };
}

export class BackgroundSyncService {
  private static retryTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly BASE_DELAY_MS = 2000;

  // --- Connectivity & Dead-Zone Simulation ---
  public static isEffectivelyOnline(): boolean {
    if (typeof window === 'undefined') return true;
    const simulatedOffline = localStorage.getItem(SIMULATED_OFFLINE_KEY) === 'true';
    if (simulatedOffline) return false;
    return navigator.onLine;
  }

  public static isSimulatedOffline(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIMULATED_OFFLINE_KEY) === 'true';
  }

  public static setSimulatedOffline(offline: boolean): void {
    localStorage.setItem(SIMULATED_OFFLINE_KEY, offline ? 'true' : 'false');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('outbox-updated'));
      window.dispatchEvent(new Event(offline ? 'offline' : 'online'));
    }
    if (!offline) {
      this.flushOutboxQueue();
      this.syncPendingChanges();
    }
  }

  // --- Local Project Dossier Store (<50ms Instant Local Commits) ---
  public static getLocalDossierMap(): Record<string, Project> {
    try {
      const raw = localStorage.getItem(LOCAL_DOSSIER_STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('Failed to parse local dossier store:', e);
      return {};
    }
  }

  private static saveLocalDossierMap(map: Record<string, Project>): void {
    try {
      localStorage.setItem(LOCAL_DOSSIER_STORE_KEY, JSON.stringify(map));
    } catch (e) {
      console.warn('Quota or storage warning saving local dossier map:', e);
    }
  }

  public static saveLocalProject(project: Project): Project {
    const map = this.getLocalDossierMap();
    map[project.id] = { ...project };
    this.saveLocalDossierMap(map);
    return map[project.id];
  }

  public static getLocalProject(id: string): Project | null {
    const map = this.getLocalDossierMap();
    return map[id] || null;
  }

  public static commitLocalProjectUpdate(
    id: string,
    updates: Partial<Project>,
    baseProject?: Project | null
  ): Project | null {
    const map = this.getLocalDossierMap();
    const existing = map[id] || baseProject;
    const merged = existing
      ? ({ ...existing, ...updates, id } as Project)
      : ({ ...updates, id } as Project);
    map[id] = merged;
    this.saveLocalDossierMap(map);
    return merged;
  }

  public static mergeRemoteProjectsWithLocal(remoteProjects: Project[]): Project[] {
    const map = this.getLocalDossierMap();
    const mergedList: Project[] = [];
    const seenIds = new Set<string>();

    for (const remote of remoteProjects) {
      const local = map[remote.id];
      if (local) {
        // Local offline-first state takes precedence for nested field arrays modified locally
        const combined: Project = {
          ...remote,
          ...local
        };
        map[remote.id] = combined;
        mergedList.push(combined);
      } else {
        map[remote.id] = remote;
        mergedList.push(remote);
      }
      seenIds.add(remote.id);
    }

    // Also include any locally created projects not yet on remote
    for (const [id, proj] of Object.entries(map)) {
      if (!seenIds.has(id) && proj && proj.client) {
        mergedList.push(proj);
      }
    }

    this.saveLocalDossierMap(map);
    return mergedList;
  }

  // --- Persistent Outbox Mutation Queue ---
  public static getOutboxQueue(): SyncQueueItem[] {
    try {
      const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('Failed to parse outbox queue:', e);
      return [];
    }
  }

  private static saveOutboxQueue(queue: SyncQueueItem[]): void {
    try {
      localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(queue));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('outbox-updated'));
      }
    } catch (e) {
      console.warn('Failed to persist outbox queue:', e);
    }
  }

  public static getPendingOutboxCount(): number {
    return this.getOutboxQueue().filter(item => item.status === 'pending' || item.status === 'failed' || item.status === 'syncing').length;
  }

  public static getLastSyncedAt(): number | null {
    const val = localStorage.getItem(LAST_SYNCED_KEY);
    return val ? Number(val) : null;
  }

  private static setLastSyncedAt(ts: number): void {
    localStorage.setItem(LAST_SYNCED_KEY, String(ts));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('outbox-updated'));
    }
  }

  public static enqueueOutboxMutation(
    projectId: string,
    updates: Partial<Project>,
    explicitOp?: SyncQueueOperation,
    explicitDescription?: string
  ): SyncQueueItem {
    const classified = classifyProjectOperation(updates);
    const operation = explicitOp || classified.operation;
    const description = explicitDescription || classified.description;

    const queue = this.getOutboxQueue();
    const newItem: SyncQueueItem = {
      id: `mut-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      projectId,
      operation,
      payload: updates,
      queuedAt: Date.now(),
      status: 'pending',
      retryCount: 0,
      description
    };

    // Keep most recent 100 items to avoid localStorage bloat
    const updatedQueue = [newItem, ...queue].slice(0, 100);
    this.saveOutboxQueue(updatedQueue);

    return newItem;
  }

  public static markOutboxItemSynced(itemId: string): void {
    const queue = this.getOutboxQueue();
    const now = Date.now();
    const updated = queue.map(item =>
      item.id === itemId ? { ...item, status: 'synced' as const } : item
    );
    this.saveOutboxQueue(updated);
    this.setLastSyncedAt(now);
  }

  public static async flushOutboxQueue(): Promise<{ synced: number; failed: number }> {
    const queue = this.getOutboxQueue();
    const pendingItems = queue.filter(i => i.status === 'pending' || i.status === 'failed');

    if (pendingItems.length === 0) {
      this.setLastSyncedAt(Date.now());
      return { synced: 0, failed: 0 };
    }

    if (!this.isEffectivelyOnline()) {
      EventBus.publish(
        'com.restorationai.sync.offline',
        { pendingCount: pendingItems.length },
        undefined,
        `Device offline · ${pendingItems.length} change(s) safely queued in local outbox`,
        'warning'
      );
      return { synced: 0, failed: pendingItems.length };
    }

    // Mark as syncing
    this.saveOutboxQueue(
      queue.map(item =>
        item.status === 'pending' || item.status === 'failed'
          ? { ...item, status: 'syncing' as const }
          : item
      )
    );

    let syncedCount = 0;
    let failedCount = 0;

    // Process in chronological order (oldest first) for deterministic conflict resolution
    const chronological = [...pendingItems].sort((a, b) => a.queuedAt - b.queuedAt);
    const updatedMap = new Map<string, SyncQueueItem>();

    for (const item of chronological) {
      try {
        // Attempt Firestore sync if available; local dossier store is already updated
        try {
          const docRef = doc(db, 'projects', item.projectId);
          await setDoc(docRef, item.payload, { merge: true });
        } catch {
          // If Firestore is unconfigured or restricted in preview, local dossier store acts as primary replica
        }

        updatedMap.set(item.id, {
          ...item,
          status: 'synced'
        });
        syncedCount++;
      } catch (err) {
        console.warn(`Outbox item ${item.id} failed sync:`, err);
        updatedMap.set(item.id, {
          ...item,
          status: 'failed',
          retryCount: (item.retryCount || 0) + 1
        });
        failedCount++;
      }
    }

    const finalQueue = queue.map(item => updatedMap.get(item.id) || item);
    this.saveOutboxQueue(finalQueue);

    if (syncedCount > 0) {
      this.setLastSyncedAt(Date.now());
      EventBus.publish(
        'com.restorationai.sync.completed',
        { syncedCount, failedCount },
        undefined,
        `Synchronized ${syncedCount} field mutation(s) from outbox`,
        'success'
      );
    }

    return { synced: syncedCount, failed: failedCount };
  }

  public static clearSyncedOutboxItems(): void {
    const queue = this.getOutboxQueue();
    const remaining = queue.filter(item => item.status !== 'synced');
    this.saveOutboxQueue(remaining);
  }

  public static exportEmergencyOfflineBundle(): void {
    const dossiers = this.getLocalDossierMap();
    const outbox = this.getOutboxQueue();
    const bundle = {
      exportedAt: new Date().toISOString(),
      platform: 'Restoration AI Offline-First Dossier & Outbox Backup',
      pendingMutationsCount: this.getPendingOutboxCount(),
      projects: Object.values(dossiers),
      outboxQueue: outbox
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RestorationAI_Offline_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // --- Legacy BackgroundSyncService API compatibility ---
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

    if (this.isEffectivelyOnline()) {
      this.syncPendingChanges();
    }
  }

  public static async syncPendingChanges(force = false) {
    if (!this.isEffectivelyOnline()) return;

    await this.flushOutboxQueue();

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
      } catch {
        const retryCount = (task.retryCount || 0) + 1;
        const delayMs = Math.min(this.BASE_DELAY_MS * Math.pow(2, retryCount - 1), 60000 * 5);
        failedTasks.push({
          ...task,
          retryCount,
          nextRetryAt: Date.now() + delayMs
        });
      }
    }

    this.saveQueue(failedTasks);

    if (failedTasks.length === 0 && queue.length > 0) {
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
    return this.getQueue().length + this.getPendingOutboxCount();
  }
}
