import React, { useState, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
  Trash2,
  X,
  Database,
  ShieldCheck,
  Radio
} from 'lucide-react';
import { BackgroundSyncService } from '../services/SyncService';
import { SyncQueueItem } from '../types';

interface SyncStatusDrawerProps {
  compact?: boolean;
}

const OPERATION_LABELS: Record<string, string> = {
  UPDATE_READINGS: 'Psychrometric / Moisture Telemetry',
  UPDATE_PINS: '2D Floorplan Moisture Pin Map',
  UPDATE_EQUIPMENT: 'S500 Equipment Deployment',
  ADD_SIGNATURE: 'Digital Signature & Attestation',
  UPDATE_DOCUMENTS: 'External Report Attachment',
  UPDATE_PROFILES: 'Carrier Report Profile Config',
  FULL_PROJECT_SAVE: 'Full Project Dossier Snapshot'
};

export const SyncStatusDrawer: React.FC<SyncStatusDrawerProps> = ({ compact = false }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() => BackgroundSyncService.isEffectivelyOnline());
  const [isSimOffline, setIsSimOffline] = useState<boolean>(() => BackgroundSyncService.isSimulatedOffline());
  const [queue, setQueue] = useState<SyncQueueItem[]>(() => BackgroundSyncService.getOutboxQueue());
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => BackgroundSyncService.getLastSyncedAt());
  const [isFlushing, setIsFlushing] = useState(false);

  const refreshState = () => {
    setIsOnline(BackgroundSyncService.isEffectivelyOnline());
    setIsSimOffline(BackgroundSyncService.isSimulatedOffline());
    setQueue(BackgroundSyncService.getOutboxQueue());
    setLastSyncedAt(BackgroundSyncService.getLastSyncedAt());
  };

  useEffect(() => {
    refreshState();
    const handleUpdate = () => refreshState();
    window.addEventListener('outbox-updated', handleUpdate);
    window.addEventListener('online', handleUpdate);
    window.addEventListener('offline', handleUpdate);
    window.addEventListener('sync-completed', handleUpdate);

    return () => {
      window.removeEventListener('outbox-updated', handleUpdate);
      window.removeEventListener('online', handleUpdate);
      window.removeEventListener('offline', handleUpdate);
      window.removeEventListener('sync-completed', handleUpdate);
    };
  }, []);

  const pendingItems = queue.filter(i => i.status === 'pending' || i.status === 'failed' || i.status === 'syncing');
  const pendingCount = pendingItems.length;

  const handleSyncNow = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsFlushing(true);
    try {
      if (isSimOffline) {
        // Restore online connectivity and flush
        BackgroundSyncService.setSimulatedOffline(false);
      } else {
        await BackgroundSyncService.flushOutboxQueue();
      }
      refreshState();
    } finally {
      setTimeout(() => setIsFlushing(false), 250);
    }
  };

  const handleToggleOfflineSimulation = () => {
    BackgroundSyncService.setSimulatedOffline(!isSimOffline);
    refreshState();
  };

  const formatRelativeTime = (ts: number | null) => {
    if (!ts) return 'Ready';
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 15) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      {/* Unboxed Utilitarian Field-Precision Status Trigger */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-colors whitespace-nowrap ${
            !isOnline
              ? 'bg-amber-950/60 border-amber-500/40 text-amber-300 hover:bg-amber-950'
              : pendingCount > 0
              ? 'bg-sky-950/60 border-sky-500/40 text-sky-300 hover:bg-sky-950'
              : 'bg-slate-800/70 border-white/10 text-slate-300 hover:text-white hover:border-white/20'
          }`}
          title="Open Offline-First Outbox Queue & Sync Audit Trail"
        >
          {!isOnline ? (
            <WifiOff size={13} className="text-amber-400 shrink-0" />
          ) : pendingCount > 0 ? (
            <Clock size={13} className="text-sky-400 shrink-0" />
          ) : (
            <Wifi size={13} className="text-emerald-400 shrink-0" />
          )}

          <span className="font-semibold tracking-tight">
            {!isOnline ? 'Offline' : pendingCount > 0 ? 'Outbox Active' : 'Synced'}
          </span>

          <span className="text-slate-500">·</span>

          <span className="font-mono text-[11px] tabular-nums">
            {pendingCount > 0
              ? `${pendingCount} queued ${pendingCount === 1 ? 'change' : 'changes'}`
              : !compact
              ? formatRelativeTime(lastSyncedAt)
              : '0 queued'}
          </span>
        </button>

        {pendingCount > 0 && (
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={isFlushing}
            className="px-2.5 py-1.5 rounded-xl bg-brand-cyan hover:bg-cyan-400 text-slate-950 font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition shrink-0 shadow-sm"
            title={isSimOffline ? 'Reconnect & Flush Outbox Queue' : 'Flush Outbox Queue Now'}
          >
            <RefreshCw size={12} className={isFlushing ? 'animate-spin' : ''} />
            <span>Sync Outbox</span>
          </button>
        )}
      </div>

      {/* Outbox Queue Drawer Modal */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-slate-900 border-l border-white/10 h-full flex flex-col shadow-2xl">
            {/* Header */}
            <header className="px-6 py-4 border-b border-white/10 bg-slate-950/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand-cyan/15 border border-brand-cyan/30 text-brand-cyan flex items-center justify-center">
                  <Database size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Offline-First Outbox & Sync Engine
                  </h3>
                  <p className="text-xs text-slate-400">
                    Local Dossier Store · &lt;50ms Commit · Sequenced Mutation Log
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition"
              >
                <X size={18} />
              </button>
            </header>

            {/* Telemetry Summary Strip */}
            <div className="px-6 py-3.5 bg-slate-950/80 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    !isOnline ? 'bg-amber-400' : pendingCount > 0 ? 'bg-sky-400' : 'bg-emerald-400'
                  }`}
                />
                <span className="font-bold text-white">
                  {!isOnline ? 'Dead-Zone / Offline Mode' : 'Cloud Link Active'}
                </span>
                <span className="text-slate-600">·</span>
                <span className="font-mono text-slate-400 tabular-nums">
                  {pendingCount} pending
                </span>
                <span className="text-slate-600">·</span>
                <span className="font-mono text-slate-400 tabular-nums">
                  Last sync: {formatRelativeTime(lastSyncedAt)}
                </span>
              </div>

              <button
                type="button"
                onClick={handleToggleOfflineSimulation}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1.5 ${
                  isSimOffline
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                }`}
                title="Simulate basement / catastrophe dead-zone to verify offline outbox queueing"
              >
                <Radio size={12} />
                <span>{isSimOffline ? 'Exit Basement Mode' : 'Simulate Basement Offline'}</span>
              </button>
            </div>

            {/* Action Toolbar */}
            <div className="px-6 py-3 border-b border-white/10 flex items-center justify-between gap-2 bg-slate-900">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={isFlushing || (pendingCount === 0 && isOnline)}
                  className="px-3.5 py-2 rounded-xl bg-brand-cyan hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition"
                >
                  <RefreshCw size={13} className={isFlushing ? 'animate-spin' : ''} />
                  <span>{isSimOffline ? 'Reconnect & Sync Outbox' : `Sync Outbox (${pendingCount})`}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    BackgroundSyncService.clearSyncedOutboxItems();
                    refreshState();
                  }}
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Trash2 size={13} />
                  <span>Clear Synced</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => BackgroundSyncService.exportEmergencyOfflineBundle()}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition"
                title="Download complete local dossier & outbox backup JSON"
              >
                <Download size={13} className="text-brand-cyan" />
                <span>Backup Bundle</span>
              </button>
            </div>

            {/* Outbox Mutation Log */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {queue.length === 0 ? (
                <div className="text-center py-16 border border-white/5 rounded-2xl bg-slate-950/40 p-6">
                  <ShieldCheck size={36} className="mx-auto text-emerald-400/60 mb-3" />
                  <p className="text-sm font-bold text-white">All Field Telemetry Synchronized</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                    Every psychrometric reading, moisture pin coordinate, equipment change, and digital signature commits to local storage in &lt;50ms and queues here automatically.
                  </p>
                </div>
              ) : (
                queue.map((item) => {
                  const isPending = item.status === 'pending' || item.status === 'syncing';
                  const isFailed = item.status === 'failed';
                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl bg-slate-950/60 border border-white/10 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-xs">
                            {isFailed ? (
                              <AlertTriangle size={13} className="text-rose-400 shrink-0" />
                            ) : isPending ? (
                              <Clock size={13} className="text-amber-400 shrink-0" />
                            ) : (
                              <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                            )}
                            <span className="font-bold text-white">
                              {OPERATION_LABELS[item.operation] || item.operation}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 mt-1">
                            {item.description || `Mutation on project ${item.projectId}`}
                          </p>
                        </div>

                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border shrink-0 ${
                            isFailed
                              ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                              : isPending
                              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-500 tabular-nums">
                        <span>
                          {item.projectId} · {item.operation}
                        </span>
                        <span>
                          {new Date(item.queuedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <footer className="px-6 py-4 border-t border-white/10 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
              <span>Deterministic Conflict Resolution: Chronological Replay</span>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold"
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
};

export default SyncStatusDrawer;
