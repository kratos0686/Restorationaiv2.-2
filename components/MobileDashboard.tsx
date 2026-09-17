import React, { useState, useEffect } from 'react';
import { MapPin, CheckSquare, Camera, ScanLine, ChevronRight, Settings, Clock } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { getProjects } from '../services/api';
import { Project, Tab } from '../types';

const MobileDashboard: React.FC = () => {
  const { setActiveTab, setSelectedProjectId, currentUser } = useAppContext();
  const [assignedJobs, setAssignedJobs] = useState<Project[]>([]);
  const [checklistItems, setChecklistItems] = useState<{id: string, text: string, projectId: string, projectInfo: string}[]>([]);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        if (currentUser?.companyId) {
            const data = await getProjects(currentUser.companyId);
            let active = (data as Project[]).filter(p => !p.status?.toLowerCase().includes('completed'));
            
            if (currentUser?.role === 'Technician') {
                active = active.filter(p => 
                    p.assignedTeam?.some(member => 
                        member.toLowerCase() === currentUser.name.toLowerCase() || 
                        member === currentUser.id
                    )
                );
            }
            setAssignedJobs(active);
            
            // Mock pending checklist items
            const mockChecklist = active.slice(0, 3).map(p => ({
                id: `chk-${p.id}`,
                text: 'Record Daily Moisture Readings',
                projectId: p.id,
                projectInfo: p.client
            }));
            setChecklistItems(mockChecklist);
        }
      } catch (e) {
          console.error("Failed to load projects", e);
      }
    };
    fetchJobs();
  }, [currentUser]);

  const handleLaunchJob = (id: string) => {
    setSelectedProjectId(id);
    setActiveTab('loss-detail');
  };

  const handleQuickLaunch = (tab: string) => {
      setActiveTab(tab as Tab);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200 p-4 pb-28">
      {/* Header */}
      <header className="mb-6 mt-4 flex justify-between items-start">
        <div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-1">Today's Schedule</h1>
            <p className="text-slate-400 text-sm font-medium">Hello, {currentUser?.name || 'Technician'}</p>
        </div>
        <button onClick={() => setActiveTab('settings')} className="bg-slate-900 border border-white/10 p-2 text-slate-400 hover:text-white rounded-full">
            <Settings size={20} />
        </button>
      </header>

      {/* Quick Launch Actions */}
      <section className="grid grid-cols-3 gap-3 mb-8">
          <button 
              onClick={() => handleQuickLaunch('time-clock')}
              className="flex flex-col items-center justify-center bg-brand-cyan/10 border border-brand-cyan/20 rounded-2xl p-4 min-h-[90px] active:scale-95 transition-all text-brand-cyan hover:bg-brand-cyan/20"
          >
              <Clock size={28} className="mb-2" />
              <span className="text-[10px] font-bold text-slate-200 uppercase text-center leading-tight">Time<br/>Clock</span>
          </button>

          <button 
              onClick={() => handleQuickLaunch('scanner')}
              className="flex flex-col items-center justify-center bg-slate-900 border border-white/10 rounded-2xl p-4 min-h-[90px] active:scale-95 transition-all text-emerald-400 hover:bg-white/5"
          >
              <ScanLine size={28} className="mb-2" />
              <span className="text-[10px] font-bold text-slate-300 uppercase text-center leading-tight">AR<br/>Scan</span>
          </button>
          
          {/* We assume 'loss-detail' active tab defaults to something with photos, or we add photo-docs route */}
          <button 
              onClick={() => handleQuickLaunch('losses')}
              className="flex flex-col items-center justify-center bg-slate-900 border border-white/10 rounded-2xl p-4 min-h-[90px] active:scale-95 transition-all text-blue-400 hover:bg-white/5"
          >
              <Camera size={28} className="mb-2" />
              <span className="text-[10px] font-bold text-slate-300 uppercase text-center leading-tight">Photo<br/>Docs</span>
          </button>
      </section>

      {/* Dispatch Locations */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center">
                <MapPin size={14} className="mr-2 text-brand-cyan" /> Dispatch Locations
            </h2>
            <span className="text-xs text-slate-500 font-bold">{assignedJobs.length} Assigned</span>
        </div>
        
        <div className="space-y-3">
            {assignedJobs.map(job => (
                <div 
                    key={job.id} 
                    onClick={() => handleLaunchJob(job.id)}
                    className="bg-slate-900 border border-white/10 rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition-all min-h-[80px]"
                >
                    <div>
                        <h3 className="text-sm font-bold text-white">{job.client}</h3>
                        <p className="text-xs text-slate-400 mt-1">{job.address}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-400">
                        <ChevronRight size={18} />
                    </div>
                </div>
            ))}
            {assignedJobs.length === 0 && (
                <div className="text-center py-6 text-sm text-slate-500 border border-dashed border-white/10 rounded-2xl">
                    No dispatch locations assigned for today.
                </div>
            )}
        </div>
      </section>

      {/* Pending Tasks */}
      <section className="mb-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center mb-4">
            <CheckSquare size={14} className="mr-2 text-brand-cyan" /> Pending Actions
        </h2>
        
        <div className="space-y-3">
            {checklistItems.map(item => (
                <div key={item.id} className="bg-slate-900 border border-white/10 rounded-2xl p-4 min-h-[70px] flex items-center">
                    <div className="w-6 h-6 rounded-full border-2 border-slate-600 mr-4 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-bold text-slate-200">{item.text}</p>
                        <p className="text-xs text-brand-cyan mt-1">{item.projectInfo}</p>
                    </div>
                </div>
            ))}
            {checklistItems.length === 0 && (
                <div className="text-center py-6 text-sm text-slate-500 border border-dashed border-white/10 rounded-2xl">
                    All caught up!
                </div>
            )}
        </div>
      </section>

    </div>
  );
};

export default MobileDashboard;
