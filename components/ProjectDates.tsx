import React, { useState } from 'react';
import { Project } from '../types';
import { ArrowLeft, Plus } from 'lucide-react';

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onBack?: () => void;
}

export default function ProjectDates({ project, onUpdate, onBack }: Props) {
  const [activeTab, setActiveTab] = useState<'trips' | 'events'>('events');

  const events = [
    { key: 'lossDate', label: 'Loss Date' },
    { key: 'assignedDate', label: 'Assigned Date' },
    { key: 'contactedDate', label: 'Contacted Date' },
    { key: 'inspectedDate', label: 'Inspected Date' },
    { key: 'startDate', label: 'Job Started' },
    { key: 'jobPausedDate', label: 'Job Paused' },
    { key: 'jobCompletedDate', label: 'Job Completed' },
  ];

  const handleDateChange = (key: string, value: string) => {
    onUpdate({ [key]: value });
  };

  const addTrip = () => {
    const newTrip = {
      id: `trip-${Date.now()}`,
      name: `Trip ${(project.trips || []).length + 1}`,
      startDate: '',
      endDate: ''
    };
    onUpdate({ trips: [...(project.trips || []), newTrip] });
  };

  const updateTrip = (id: string, updates: Partial<{id: string, name: string, startDate: string, endDate: string}>) => {
    const updatedTrips = (project.trips || []).map(t => t.id === id ? { ...t, ...updates } : t);
    onUpdate({ trips: updatedTrips });
  };

  const calculateDuration = () => {
    if (!project.startDate) return '0.0';
    const start = new Date(project.startDate);
    const end = project.jobCompletedDate ? new Date(project.jobCompletedDate) : new Date();
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays.toFixed(1);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-white/5 animate-in slide-in-from-right-4">
      {/* Header */}
      <div className="glass-panel p-6 pb-0 flex flex-col border-b border-white/5 z-10 relative">
        <div className="flex items-center space-x-4 mb-6">
          {onBack && (
            <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
              <ArrowLeft size={20} className="text-slate-400" />
            </button>
          )}
          <div>
            <div className="text-xs font-medium text-brand-cyan mb-1">{project.client}</div>
            <div className="text-2xl font-black text-white tracking-tight">Timeline & Travel</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex w-full mt-auto">
          <button 
            className={`flex-1 py-4 text-center text-sm font-bold border-b-2 transition-colors ${activeTab === 'trips' ? 'border-brand-cyan text-brand-cyan' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            onClick={() => setActiveTab('trips')}
          >
            Crew Trips
          </button>
          <button 
            className={`flex-1 py-4 text-center text-sm font-bold border-b-2 transition-colors ${activeTab === 'events' ? 'border-brand-cyan text-brand-cyan' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            onClick={() => setActiveTab('events')}
          >
            Project Events
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-[#0a0a0b] relative pb-20">
        <div className="p-6">
          {activeTab === 'events' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                 <h2 className="text-sm font-bold tracking-widest uppercase text-slate-500">Key Events</h2>
                 <div className="text-xs text-brand-cyan font-mono bg-brand-cyan/10 px-3 py-1 rounded-full">
                    Duration: {calculateDuration()} Days
                 </div>
              </div>
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.key} className="glass-card rounded-xl p-4 border border-white/5">
                    <label className="block text-xs font-medium text-slate-400 mb-2">{event.label}</label>
                    <div className="flex items-center justify-between">
                      <input 
                        type="datetime-local" 
                        value={project[event.key as keyof Project] as string || ''}
                        onChange={(e) => handleDateChange(event.key, e.target.value)}
                        className="text-sm text-slate-200 bg-slate-950 border border-white/10 rounded-lg p-2 focus:outline-none focus:border-brand-cyan w-full [color-scheme:dark]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-sm font-bold tracking-widest uppercase text-slate-500">Travel Log</h2>
              
              <div className="space-y-4">
                {(project.trips || []).map((trip) => (
                  <div key={trip.id} className="glass-card rounded-xl p-5 border border-white/5 space-y-4">
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1 block">Trip Name</label>
                      <input 
                        type="text" 
                        value={trip.name} 
                        onChange={(e) => updateTrip(trip.id, { name: e.target.value })}
                        className="w-full bg-transparent text-white font-medium border-b border-white/10 p-1 focus:outline-none focus:border-brand-cyan"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1 block">Start Time</label>
                        <input 
                          type="datetime-local" 
                          value={trip.startDate}
                          onChange={(e) => updateTrip(trip.id, { startDate: e.target.value })}
                          className="w-full bg-slate-950 text-xs text-slate-300 border border-white/10 rounded p-2 focus:outline-none focus:border-brand-cyan [color-scheme:dark]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1 block">End Time</label>
                        <input 
                          type="datetime-local" 
                          value={trip.endDate}
                          onChange={(e) => updateTrip(trip.id, { endDate: e.target.value })}
                          className="w-full bg-slate-950 text-xs text-slate-300 border border-white/10 rounded p-2 focus:outline-none focus:border-brand-cyan [color-scheme:dark]"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <button 
                  onClick={addTrip}
                  className="w-full flex justify-center items-center gap-2 border border-dashed border-white/20 rounded-xl p-4 text-slate-400 hover:bg-white/5 transition-colors text-sm font-medium"
                >
                  <Plus size={16} />
                  Log New Trip
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
