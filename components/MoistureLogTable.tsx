import React, { useMemo, useState } from 'react';
import { Project } from '../types';
import { History, Thermometer, Droplets, Search, BrainCircuit, AlertTriangle, Loader2, X } from 'lucide-react';
import { AIRouterClient } from '../services/AIRouterClient';

interface MoistureLogTableProps {
  project: Project;
}

interface LogEntry {
  id: string;
  timestamp: number;
  dateStr: string;
  type: 'Atmospheric' | 'Material';
  location: string;
  material?: string;
  reading: string;
  target?: string;
}

export const MoistureLogTable: React.FC<MoistureLogTableProps> = ({ project }) => {
  const [filterType, setFilterType] = useState<'All' | 'Atmospheric' | 'Material'>('All');
  const [search, setSearch] = useState('');

  
  const [isCheckingAnomalies, setIsCheckingAnomalies] = useState(false);
  const [anomalies, setAnomalies] = useState<{ severity: string; location: string; material: string; description: string; recommendedAction: string }[] | null>(null);

  const checkAnomalies = async () => {
    if (!project.dryingMonitor || project.dryingMonitor.length === 0) return;
    setIsCheckingAnomalies(true);
    setAnomalies(null);
    try {
      const router = new AIRouterClient();
      const response = await router.detectMoistureAnomalies(project.dryingMonitor);
      if (response && response.text) {
        const text = response.text;
        const parsed = JSON.parse(text);
        setAnomalies(parsed);
      }
    } catch (e) {
      console.error("Failed to detect anomalies", e);
      setAnomalies([]);
    } finally {
      setIsCheckingAnomalies(false);
    }
  };

  const logs = useMemo(() => {

    const entries: LogEntry[] = [];
    
    // Atmospheric Readings
    (project.rooms || []).forEach(room => {
      (room.readings || []).forEach(r => {
        if (r.timestamp) {
          entries.push({
            id: `atm-${room.id}-${r.timestamp}`,
            timestamp: r.timestamp,
            dateStr: new Date(r.timestamp).toLocaleString(),
            type: 'Atmospheric',
            location: room.name,
            reading: `T: ${r.temp}° | RH: ${r.rh}% | GPP: ${r.gpp}`,
          });
        }
      });
    });

    (project.dryingChambers || []).forEach(chamber => {
      (chamber.readings || []).forEach(r => {
        if (r.timestamp) {
          entries.push({
            id: `atm-ch-${chamber.id}-${r.timestamp}`,
            timestamp: r.timestamp,
            dateStr: new Date(r.timestamp).toLocaleString(),
            type: 'Atmospheric',
            location: chamber.name,
            reading: `T: ${r.temp}° | RH: ${r.rh}% | GPP: ${r.gpp}`,
          });
        }
      });
    });

    // Material Readings
    (project.dryingMonitor || []).forEach(mat => {
      if (mat.initialReading !== undefined && mat.readings?.length === 0) {
        // Just show initial if no history?
      }
      (mat.readings || []).forEach(r => {
        entries.push({
          id: `mat-${mat.id}-${r.timestamp}`,
          timestamp: r.timestamp,
          dateStr: new Date(r.timestamp).toLocaleString(),
          type: 'Material',
          location: mat.location,
          material: mat.name,
          reading: `${r.value}% MC`,
          target: `${mat.dryGoal}% MC`
        });
      });
    });

    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }, [project]);

  const filteredLogs = logs.filter(log => {
    if (filterType !== 'All' && log.type !== filterType) return false;
    if (search) {
      const s = search.toLowerCase();
      return log.location.toLowerCase().includes(s) || 
             log.material?.toLowerCase().includes(s) || 
             log.reading.toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="bg-slate-900 border border-white/10 rounded-[2rem] overflow-hidden flex flex-col h-full min-h-[400px]">
      
      <div className="p-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-black/20">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-widest">
            <History size={18} className="text-brand-cyan" /> Historical Digital Log
          </h3>
          <button
            onClick={checkAnomalies}
            disabled={isCheckingAnomalies}
            className="flex items-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
          >
            {isCheckingAnomalies ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
            AI Anomaly Scan
          </button>
        </div>

        
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search location..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-xs text-white outline-none focus:border-brand-cyan transition-colors"
            />
          </div>
          <div className="flex bg-black/40 border border-white/10 rounded-lg p-1">
            <button 
              onClick={() => setFilterType('All')}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded ${filterType === 'All' ? 'bg-brand-cyan text-slate-900' : 'text-slate-400 hover:text-white'}`}
            >All</button>
            <button 
              onClick={() => setFilterType('Atmospheric')}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded flex items-center gap-1 ${filterType === 'Atmospheric' ? 'bg-brand-cyan text-slate-900' : 'text-slate-400 hover:text-white'}`}
            ><Thermometer size={12}/> Env</button>
            <button 
              onClick={() => setFilterType('Material')}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded flex items-center gap-1 ${filterType === 'Material' ? 'bg-brand-cyan text-slate-900' : 'text-slate-400 hover:text-white'}`}
            ><Droplets size={12}/> Mat</button>
          </div>
        </div>
      
      </div>

      {anomalies !== null && (
        <div className="p-4 bg-black/40 border-b border-white/5">
          <div className="flex justify-between items-start mb-4">
            <h4 className="text-sm font-bold flex items-center gap-2 text-indigo-400">
              <BrainCircuit size={16} /> AI Analysis Results
            </h4>
            <button onClick={() => setAnomalies(null)} className="text-slate-500 hover:text-white">
              <X size={16} />
            </button>
          </div>
          {anomalies.length === 0 ? (
            <div className="text-sm text-emerald-400 flex items-center gap-2 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
              <Droplets size={16} /> All drying curves appear normal. No anomalies detected.
            </div>
          ) : (
            <div className="space-y-3">
              {anomalies.map((anomaly: { severity: string; location: string; material: string; description: string; recommendedAction: string }, i: number) => (
                <div key={i} className={`p-4 rounded-xl border ${anomaly.severity === 'high' ? 'bg-red-500/10 border-red-500/20 text-red-200' : anomaly.severity === 'medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-200' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-200'}`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className={`shrink-0 ${anomaly.severity === 'high' ? 'text-red-400' : anomaly.severity === 'medium' ? 'text-amber-400' : 'text-yellow-400'}`} />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm text-white">{anomaly.location} - {anomaly.material}</span>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${anomaly.severity === 'high' ? 'bg-red-500/20 text-red-400' : anomaly.severity === 'medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {anomaly.severity} Priority
                        </span>
                      </div>
                      <p className="text-sm opacity-90 mb-2">{anomaly.description}</p>
                      <p className="text-xs font-bold opacity-80 flex gap-1">
                        <span className="opacity-70">Action Required:</span> {anomaly.recommendedAction}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto">

        <table className="w-full text-left border-collapse">
          <thead className="bg-black/40 sticky top-0 z-10 backdrop-blur-md">
            <tr>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5">Date / Time</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5">Type</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5">Location / Material</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5">Reading</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5">Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">
                  No readings recorded yet.
                </td>
              </tr>
            ) : (
              filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-xs font-medium text-slate-300">{log.dateStr}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                      log.type === 'Atmospheric' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {log.type === 'Atmospheric' ? <Thermometer size={10} /> : <Droplets size={10} />}
                      {log.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-slate-200">{log.location}</div>
                    {log.material && <div className="text-xs text-slate-500">{log.material}</div>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-mono text-brand-cyan">{log.reading}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-xs font-mono text-slate-500">{log.target || '--'}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
