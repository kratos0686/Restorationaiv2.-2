import React, { useState } from 'react';
import { Project, ProjectMilestone } from '../types';
import { CheckCircle2, Circle, Clock, Activity, Plus, RefreshCw } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

interface ProjectTrackingProps {
    project: Project;
    onUpdate: (updates: Partial<Project>) => void;
}

const DEFAULT_MILESTONES = [
    'Initial Inspection Completed',
    'Water Extraction Started',
    'Drying Equipment Deployed',
    'Content Pack-out Complete',
    'Remediation Complete',
    'Project Closed'
];

const ProjectTracking: React.FC<ProjectTrackingProps> = ({ project, onUpdate }) => {
    const { currentUser } = useAppContext();
    const [newMilestoneText, setNewMilestoneText] = useState('');

    const milestones = project.milestones || DEFAULT_MILESTONES.map((name, index) => ({
        id: `m-def-${index}`,
        name,
        status: 'pending' as const,
    }));

    // If project.milestones was not initialized, we initialize it on first edit, or we can just render the defaults.
    const handleUpdateMilestone = (id: string, status: 'pending' | 'in_progress' | 'completed') => {
        const currentMilestones = project.milestones || milestones;
        const updated = currentMilestones.map(m => {
            if (m.id === id) {
                return { 
                    ...m, 
                    status, 
                    updatedAt: Date.now(), 
                    updatedBy: currentUser?.name || 'Unknown User' 
                };
            }
            return m;
        });
        onUpdate({ milestones: updated });
    };

    const handleAddMilestone = () => {
        if (!newMilestoneText.trim()) return;
        const currentMilestones = project.milestones || milestones;
        const newMilestone: ProjectMilestone = {
            id: `m-custom-${Date.now()}`,
            name: newMilestoneText.trim(),
            status: 'pending'
        };
        onUpdate({ milestones: [...currentMilestones, newMilestone] });
        setNewMilestoneText('');
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle2 size={24} className="text-emerald-400" />;
            case 'in_progress': return <RefreshCw size={24} className="text-brand-cyan animate-spin-slow" />;
            default: return <Circle size={24} className="text-slate-600" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'border-emerald-500/30 bg-emerald-500/10';
            case 'in_progress': return 'border-brand-cyan/30 bg-brand-cyan/10';
            default: return 'border-white/5 bg-slate-900';
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 p-6 space-y-6">
            <header className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <div className="p-3 bg-brand-cyan/10 text-brand-cyan rounded-2xl border border-brand-cyan/20">
                        <Activity size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white tracking-tight">Real-Time Tracking</h2>
                        <p className="text-xs text-slate-400 mt-0.5">Live project milestones and status updates.</p>
                    </div>
                </div>
            </header>

            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(project.milestones || milestones).map((milestone) => (
                        <div key={milestone.id} className={`p-5 rounded-2xl border transition-all ${getStatusColor(milestone.status)}`}>
                            <div className="flex items-start justify-between">
                                <div className="flex items-center space-x-4">
                                    {getStatusIcon(milestone.status)}
                                    <div>
                                        <h3 className="text-white font-bold">{milestone.name}</h3>
                                        <div className="flex items-center space-x-2 mt-1">
                                            {milestone.updatedAt ? (
                                                <div className="flex items-center space-x-1 text-xs text-slate-400">
                                                    <Clock size={12} />
                                                    <span>{new Date(milestone.updatedAt).toLocaleString()}</span>
                                                    <span>by {milestone.updatedBy}</span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-500">Not started</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Action Buttons for Technicians/Managers */}
                            <div className="mt-4 flex items-center space-x-2">
                                <button 
                                    onClick={() => handleUpdateMilestone(milestone.id, 'pending')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${milestone.status === 'pending' ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                >
                                    Pending
                                </button>
                                <button 
                                    onClick={() => handleUpdateMilestone(milestone.id, 'in_progress')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${milestone.status === 'in_progress' ? 'bg-brand-cyan text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                >
                                    In Progress
                                </button>
                                <button 
                                    onClick={() => handleUpdateMilestone(milestone.id, 'completed')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${milestone.status === 'completed' ? 'bg-emerald-500 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                >
                                    Completed
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="pt-4 border-t border-white/5">
                    <div className="flex items-center space-x-2 max-w-md">
                        <input 
                            type="text"
                            placeholder="Add a custom milestone..."
                            value={newMilestoneText}
                            onChange={(e) => setNewMilestoneText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddMilestone()}
                            className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-cyan/50"
                        />
                        <button 
                            onClick={handleAddMilestone}
                            disabled={!newMilestoneText.trim()}
                            className="p-3 bg-brand-cyan text-slate-900 rounded-xl disabled:opacity-50 hover:bg-brand-cyan/90 transition-colors"
                        >
                            <Plus size={20} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProjectTracking;
