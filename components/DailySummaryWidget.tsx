import React, { useState, useEffect, useMemo } from 'react';
import { Project, DailyNarrative } from '../types';
import { generateDailyDryingNarrative } from '../services/api';
import { useAppContext } from '../context/AppContext';
import { EventBus } from '../services/EventBus';
import { Sparkles, Brain, FileText, Check, Edit2, Save, RefreshCw, Calendar, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DailySummaryWidgetProps {
  project: Project;
  onUpdate?: (updates: Partial<Project>) => void;
}

export const DailySummaryWidget: React.FC<DailySummaryWidgetProps> = ({ project, onUpdate }) => {
  const { currentUser } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryText, setSummaryText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Parse today's date in string format (e.g. "6/21/2026")
  const todayStr = useMemo(() => new Date().toLocaleDateString(), []);

  // See if there's already a saved AI daily narrative for today
  const existingTodayNarrative = useMemo(() => {
    return (project.dailyNarratives || []).find(
      (n) => n.date === todayStr && n.tags.includes('AI Generated')
    );
  }, [project.dailyNarratives, todayStr]);

  // Extract other daily summary narratives from history
  const historyNarratives = useMemo(() => {
    return (project.dailyNarratives || []).filter(
      (n) => n.date !== todayStr && n.tags.includes('AI Generated')
    );
  }, [project.dailyNarratives, todayStr]);

  // Extract all psychrometric readings across all rooms
  const psychrometricReadings = useMemo(() => {
    return (project.rooms || []).flatMap((r) =>
      (r.readings || []).map((reading) => ({
        ...reading,
        roomName: r.name,
      }))
    );
  }, [project.rooms]);

  // Extract tracked materials
  const trackedMaterials = useMemo(() => {
    return (project.dryingMonitor || []).map((m) => ({
      name: m.name,
      location: m.location,
      type: m.type,
      dryGoal: m.dryGoal,
      initialReading: m.initialReading,
      status: m.status,
      readings: m.readings || [],
    }));
  }, [project.dryingMonitor]);

  // Total readings count to check if there is enough data
  const hasReadings = psychrometricReadings.length > 0 || trackedMaterials.length > 0;

  // Initialize summaryText on render / load
  useEffect(() => {
    if (existingTodayNarrative) {
      setSummaryText(existingTodayNarrative.content);
    } else if (hasReadings && !summaryText && !loading && !error) {
      // Auto-trigger generation if we have readings but no narrative yet
      triggerGeneration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingTodayNarrative, hasReadings]);

  const triggerGeneration = async () => {
    setLoading(true);
    setError(null);
    try {
      // Format context data
      const context = {
        date: todayStr,
        psychrometricReadings: psychrometricReadings.slice(-15), // Last 15 readings
        trackedMaterials: trackedMaterials,
      };

      const generated = await generateDailyDryingNarrative(context);
      if (generated) {
        setSummaryText(generated);
      } else {
        throw new Error('Could not generate text recap from Gemini API');
      }
    } catch (err) {
      console.error('[DailySummaryWidget] Automation error', err);
      setError('Gemini AI was unable to structure the psychrometric logs. Ensure you have network connectivity.');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = () => {
    setEditText(summaryText);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  const saveEdit = () => {
    setSummaryText(editText);
    setIsEditing(false);

    // If there is already a saved narrative for today, auto-propagate change to firestore
    if (existingTodayNarrative && onUpdate) {
      const updatedNarratives = (project.dailyNarratives || []).map((n) =>
        n.id === existingTodayNarrative.id ? { ...n, content: editText } : n
      );
      onUpdate({ dailyNarratives: updatedNarratives });
      EventBus.publish('com.restorationai.narrative.updated', { projectId: project.id }, project.id, 'Daily Summary Updated', 'success');
    }
  };

  const saveToProjectLogs = () => {
    if (!onUpdate) return;

    const timestamp = Date.now();
    const newLog: DailyNarrative = {
      id: `log-ai-${timestamp}`,
      date: todayStr,
      timestamp: timestamp,
      content: summaryText,
      author: currentUser?.name || 'AI Scribe',
      tags: ['Psychrometrics', 'Daily Log', 'AI Generated'],
      generated: true,
      entryType: 'drying',
    };

    // Prepend today's log to dailyNarratives, replacing any existing one for today if applicable
    const filteredNarratives = (project.dailyNarratives || []).filter(
      (n) => !(n.date === todayStr && n.tags.includes('AI Generated'))
    );

    onUpdate({
      dailyNarratives: [newLog, ...filteredNarratives],
    });

    EventBus.publish(
      'com.restorationai.narrative.created',
      { projectId: project.id, logId: newLog.id },
      project.id,
      'S500 Summary Saved to Logs',
      'success'
    );
  };

  // Convert raw markdown codes or block markers nicely to text if they are there
  const formatRecapText = (text: string) => {
    if (!text) return '';
    return text.replace(/```markdown/g, '').replace(/```/g, '').trim();
  };

  // Safe checks for rendering
  if (!hasReadings) {
    return (
      <div id="ai-daily-summary-section" className="bg-slate-900 border border-white/5 rounded-[2rem] p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-slate-500">
          <Brain className="text-slate-400 animate-pulse" size={24} />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-white flex items-center justify-center gap-1.5 focus:outline-none">
            <Sparkles size={14} className="text-brand-cyan" />
            AI Daily Summary
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Log room psychrometric specs or material dryer inputs to automatically compile an IICRC-compliant daily drying trend recap.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div id="ai-daily-summary-section" className="bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-[2rem] p-6 space-y-5">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="p-1 px-2.5 bg-brand-cyan/10 text-brand-cyan rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1 animate-pulse">
              <Brain size={10} /> AI Scribe Active
            </span>
            <span className="text-[10px] text-slate-500 font-medium">Mitigation Intelligence</span>
          </div>
          <h3 className="text-base font-black text-white tracking-tight flex items-center gap-2">
            <Sparkles size={16} className="text-brand-cyan shrink-0" />
            Atmospheric & Psychrometric recap
          </h3>
          <p className="text-xs text-slate-400">Gemini-certified text log mapping daily humidity thresholds.</p>
        </div>

        {/* Action button */}
        {!isEditing && summaryText && (
          <button
            onClick={triggerGeneration}
            disabled={loading}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-all self-start sm:self-auto disabled:opacity-50"
          >
            <RefreshCw size={11} className={`${loading ? 'animate-spin' : ''}`} />
            <span>Regenerate Summary</span>
          </button>
        )}
      </div>

      {/* Main content or loader */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3.5 py-4"
          >
            {/* Pulsing loading skeleton */}
            <div className="flex items-center space-x-3 text-brand-cyan animate-pulse">
              <RefreshCw className="animate-spin" size={14} />
              <span className="text-xs font-bold font-mono">Synthesizing drying arrays with Gemini...</span>
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-white/5 rounded-lg w-full animate-pulse" />
              <div className="h-4 bg-white/5 rounded-lg w-5/6 animate-pulse" />
              <div className="h-4 bg-white/5 rounded-lg w-4/5 animate-pulse" />
            </div>
          </motion.div>
        ) : error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-start space-x-2.5"
          >
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-black text-red-400 uppercase tracking-wider">AI Generation Interrupted</h4>
              <p className="text-xs text-slate-300 leading-relaxed">{error}</p>
              <button
                onClick={triggerGeneration}
                className="text-[10px] font-bold text-brand-cyan underline uppercase mt-1 tracking-wider block hover:text-cyan-300"
              >
                Retry Analysis
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {isEditing ? (
              <div className="space-y-3">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full text-xs text-slate-200 bg-slate-950 border border-white/10 rounded-2xl p-4 min-h-[140px] outline-none focus:border-brand-cyan leading-relaxed"
                />
                <div className="flex items-center justify-end space-x-2">
                  <button
                    onClick={cancelEdit}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEdit}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-cyan text-slate-900 transition-all flex items-center space-x-1"
                  >
                    <Save size={12} />
                    <span>Save Edit</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Visual block summarizing the draft recap */}
                <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5 space-y-3.5 relative group">
                  <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={startEdit}
                      className="p-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-400 hover:text-white transition-colors"
                      title="Edit summary text"
                    >
                      <Edit2 size={12} />
                    </button>
                  </div>

                  <div className="prose prose-invert prose-xs">
                    <p className="text-xs text-slate-200 leading-relaxed font-medium whitespace-pre-wrap">
                      {formatRecapText(summaryText) || "Drafting summary..."}
                    </p>
                  </div>
                </div>

                {/* Status and Action bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-slate-900/60 p-3 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-2">
                    <Calendar size={13} className="text-slate-500" />
                    <span className="text-[11px] text-slate-400 font-medium">Dated Today ({todayStr})</span>
                    {existingTodayNarrative && (
                      <span className="p-1 px-2 bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase rounded-md flex items-center gap-0.5">
                        <Check size={9} /> Saved
                      </span>
                    )}
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={startEdit}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-white/10 rounded-xl text-slate-300 font-bold transition-all text-xs"
                    >
                      <Edit2 size={12} />
                      <span>Edit draft</span>
                    </button>

                    <button
                      onClick={saveToProjectLogs}
                      disabled={existingTodayNarrative !== undefined}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold transition-all text-xs ${
                        existingTodayNarrative
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default'
                          : 'bg-brand-cyan hover:bg-opacity-95 text-slate-900'
                      }`}
                    >
                      {existingTodayNarrative ? <Check size={12} /> : <FileText size={12} />}
                      <span>{existingTodayNarrative ? 'Saved to Project Feed' : 'Save to Project Logs'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* History section dropdown converter */}
      {historyNarratives.length > 0 && (
        <div className="border-t border-white/5 pt-4">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full text-left text-xs font-black text-slate-400 hover:text-white uppercase tracking-wider select-none focus:outline-none"
          >
            <span className="flex items-center space-x-1.5">
              <Calendar size={13} className="text-purple-400" />
              <span>Prior AI Summaries History ({historyNarratives.length})</span>
            </span>
            {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden space-y-3 mt-3.5"
              >
                {historyNarratives.map((n) => (
                  <div key={n.id} className="bg-slate-950/40 p-4 rounded-2xl border border-white/5 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                      <span className="font-mono">{n.date}</span>
                      <span className="text-[9px] uppercase bg-white/5 px-2 py-0.5 rounded-full">by {n.author}</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {formatRecapText(n.content)}
                    </p>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
