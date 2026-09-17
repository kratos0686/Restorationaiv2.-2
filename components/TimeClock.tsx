import React, { useState, useEffect } from 'react';
import { Clock, Play, Square, MapPin, Briefcase } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { getProjects, updateProject } from '../services/api';
import { Project, TimeEntry } from '../types';

const TimeClock: React.FC = () => {
    const { currentUser } = useAppContext();
    const [projects, setProjects] = useState<Project[]>([]);
    const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
    const [currentTime, setCurrentTime] = useState<number>(() => Date.now());
    
    // Form state
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [visitReason, setVisitReason] = useState<'Monitoring' | 'Emergency Services' | 'Initial Visit' | 'Other'>('Monitoring');
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchProjects = async () => {
            if (currentUser?.companyId) {
                const data = await getProjects(currentUser.companyId);
                const active = data.filter(p => !p.status?.toLowerCase().includes('completed'));
                setProjects(active);

                // See if the current user has any active unfinished clock in in any project
                // For a real app, this would be a specific query or stored in user state
                let found: TimeEntry | null = null;
                for (const proj of data) {
                    const activeP = proj.timeEntries?.find(t => t.technicianId === currentUser.id && !t.clockOutTime);
                    if (activeP) {
                        found = { ...activeP, projectId: proj.id };
                        break;
                    }
                }
                setActiveEntry(found);
            }
        };
        fetchProjects();
    }, [currentUser]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    const formatDuration = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleClockIn = async () => {
        if (!selectedProjectId || !currentUser) return;
        setIsSaving(true);
        
        const newEntry: TimeEntry = {
            id: `time-${Date.now()}`,
            technicianId: currentUser.id,
            technicianName: currentUser.name,
            clockInTime: Date.now(),
            visitReason,
            notes,
            projectId: selectedProjectId
        };

        const targetProject = projects.find(p => p.id === selectedProjectId);
        if (targetProject) {
            const updatedEntries = [...(targetProject.timeEntries || []), newEntry];
            await updateProject(selectedProjectId, { timeEntries: updatedEntries });
            setActiveEntry(newEntry);
            
            // Re-fetch or update local state
            setProjects(projects.map(p => p.id === selectedProjectId ? { ...p, timeEntries: updatedEntries } : p));
        }

        setIsSaving(false);
    };

    const handleClockOut = async () => {
        if (!activeEntry || !activeEntry.projectId || !currentUser) return;
        setIsSaving(true);
        
        const clockOutTime = Date.now();
        const durationHours = (clockOutTime - activeEntry.clockInTime) / (1000 * 60 * 60);

        const targetProject = projects.find(p => p.id === activeEntry.projectId);
        if (targetProject) {
            const updatedEntries = (targetProject.timeEntries || []).map(entry => 
                entry.id === activeEntry.id ? { ...entry, clockOutTime, totalHours: durationHours } : entry
            );
            await updateProject(targetProject.id, { timeEntries: updatedEntries });
            
            setProjects(projects.map(p => p.id === targetProject.id ? { ...p, timeEntries: updatedEntries } : p));
            setActiveEntry(null);
        }
        
        setIsSaving(false);
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 pb-20">
            <header className="p-6 bg-slate-900 border-b border-white/10 shrink-0">
                <h1 className="text-2xl font-black text-white tracking-tight flex items-center">
                    <Clock className="text-brand-cyan mr-3" size={24} /> Time Clock
                </h1>
                <p className="text-sm text-slate-400 mt-1">Record your site hours</p>
            </header>

            <div className="flex-1 overflow-y-auto p-4 md:p-6">
                {!activeEntry ? (
                    <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 space-y-6">
                        <div className="text-center pb-4 border-b border-white/5">
                            <h2 className="text-xl font-bold text-white mb-2">Ready to Work?</h2>
                            <p className="text-sm text-slate-400">Select a site and reason for your visit to clock in.</p>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Job Site</label>
                                <div className="relative">
                                    <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <select 
                                        value={selectedProjectId}
                                        onChange={e => setSelectedProjectId(e.target.value)}
                                        className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm font-bold text-white outline-none focus:border-brand-cyan appearance-none"
                                    >
                                        <option value="">-- Select Project --</option>
                                        {projects.map(p => (
                                            <option key={p.id} value={p.id}>{p.client} - {p.address}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Reason for Visit</label>
                                <div className="relative">
                                    <Briefcase size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <select 
                                        value={visitReason}
                                        onChange={e => setVisitReason(e.target.value as 'Monitoring' | 'Emergency Services' | 'Initial Visit' | 'Other')}
                                        className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm font-bold text-white outline-none focus:border-brand-cyan appearance-none"
                                    >
                                        <option value="Initial Visit">Initial Visit & Inspection</option>
                                        <option value="Emergency Services">Emergency Services</option>
                                        <option value="Monitoring">Daily Monitoring</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Notes (Optional)</label>
                                <input 
                                    type="text"
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="Arrival notes..."
                                    className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-brand-cyan"
                                />
                            </div>
                        </div>

                        <button 
                            onClick={handleClockIn}
                            disabled={!selectedProjectId || isSaving}
                            className="w-full py-4 mt-4 bg-brand-cyan hover:bg-cyan-400 text-slate-900 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center space-x-2 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                        >
                            <Play size={18} fill="currentColor" />
                            <span>{isSaving ? 'Clocking In...' : 'Clock In to Site'}</span>
                        </button>
                    </div>
                ) : (
                    <div className="bg-gradient-to-b from-brand-cyan/20 to-slate-900 border border-brand-cyan/30 rounded-2xl p-6 text-center shadow-lg shadow-brand-cyan/5">
                        <div className="mb-8">
                            <span className="inline-block px-3 py-1 bg-brand-cyan/20 border border-brand-cyan/40 text-brand-cyan rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
                                Currently On Clock
                            </span>
                            <div className="text-5xl font-mono font-black text-white drop-shadow-md">
                                {formatDuration(currentTime - activeEntry.clockInTime)}
                            </div>
                        </div>

                        <div className="bg-black/30 border border-white/5 rounded-xl p-4 text-left space-y-3 mb-8">
                            <div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Site</span>
                                <p className="text-sm font-bold text-white">{projects.find(p => p.id === activeEntry.projectId)?.client || 'Unknown Site'}</p>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Visit Reason</span>
                                <p className="text-sm text-slate-300">{activeEntry.visitReason}</p>
                            </div>
                            <div className="flex justify-between items-end border-t border-white/5 pt-2 mt-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Clock In Time</span>
                                <span className="text-xs text-brand-cyan font-mono">{new Date(activeEntry.clockInTime).toLocaleTimeString()}</span>
                            </div>
                        </div>

                        <button 
                            onClick={handleClockOut}
                            disabled={isSaving}
                            className="w-full py-4 bg-red-500 hover:bg-red-400 text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center space-x-2 transition-all active:scale-95 shadow-lg shadow-red-500/20 disabled:opacity-50 disabled:active:scale-100"
                        >
                            <Square size={18} fill="currentColor" />
                            <span>{isSaving ? 'Clocking Out...' : 'Clock Out'}</span>
                        </button>
                    </div>
                )}
                
                {/* Recent Shifts could go here */}
            </div>
        </div>
    );
};

export default TimeClock;
