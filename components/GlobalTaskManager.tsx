import React, { useMemo } from 'react';
import { Project, AITask } from '../types';
import { Calendar, CheckCircle2, Circle, Flag } from 'lucide-react';

interface GlobalTaskManagerProps {
    projects: Project[];
    onSelectProject: (id: string) => void;
}

const GlobalTaskManager: React.FC<GlobalTaskManagerProps> = ({ projects, onSelectProject }) => {
    // Gather all tasks across all active projects
    const allTasks = useMemo(() => {
        const tasks: { task: AITask, project: Project }[] = [];
        projects.forEach(p => {
            if (p.tasks) {
                p.tasks.forEach(t => {
                    if (!t.isCompleted) {
                        tasks.push({ task: t, project: p });
                    }
                });
            }
        });
        
        // Sort by priority and due date
        return tasks.sort((a, b) => {
            const priorityMap: Record<string, number> = { high: 0, medium: 1, low: 2 };
            const aP = a.task.priority ? priorityMap[a.task.priority] : 3;
            const bP = b.task.priority ? priorityMap[b.task.priority] : 3;
            if (aP !== bP) return aP - bP;

            if (!a.task.dueDate) return 1;
            if (!b.task.dueDate) return -1;
            return new Date(a.task.dueDate).getTime() - new Date(b.task.dueDate).getTime();
        });
    }, [projects]);

    return (
        <div className="flex h-full bg-slate-950 text-slate-200">
            <div className="flex-1 p-8 overflow-y-auto">
                <header className="mb-8 border-b border-white/5 pb-4">
                    <h1 className="text-3xl font-black text-white tracking-tight">Global Tasks</h1>
                    <p className="text-slate-400 font-medium mt-1">Outstanding action items across all your active jobs.</p>
                </header>

                <div className="space-y-4 max-w-4xl">
                    {allTasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-500 bg-slate-900 border border-white/5 rounded-2xl">
                            <CheckCircle2 size={48} className="mb-4 text-slate-700" />
                            <h3 className="text-lg font-bold text-white mb-2">No Active Tasks</h3>
                            <p className="text-sm text-center max-w-sm">All clear! Check individual jobs to create new tasks or use AI generation.</p>
                        </div>
                    ) : (
                        allTasks.map(({ task, project }) => (
                            <div 
                                key={`${project.id}-${task.id}`}
                                className="group flex items-start space-x-4 p-4 rounded-xl border border-white/10 bg-slate-900 hover:bg-slate-800 transition-colors"
                            >
                                <button className="mt-1 flex-shrink-0 text-slate-500 hover:text-[#00d4aa] transition-colors">
                                    <Circle size={20} />
                                </button>
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-1">
                                        <p className="text-sm font-semibold text-white group-hover:text-[#00d4aa] transition-colors line-clamp-2">
                                            {task.text}
                                        </p>
                                        {task.priority && (
                                            <span className={`ml-3 flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                                                task.priority === 'high' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                task.priority === 'medium' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                                'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                            }`}>
                                                {task.priority}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                        <button 
                                            onClick={() => onSelectProject(project.id)}
                                            className="font-bold flex items-center hover:text-white transition-colors"
                                        >
                                            <Flag size={12} className="mr-1" />
                                            {project.client}
                                        </button>
                                        
                                        {task.dueDate && (
                                            <span className="flex items-center">
                                                <Calendar size={12} className="mr-1" />
                                                Due: {new Date(task.dueDate).toLocaleDateString()}
                                            </span>
                                        )}
                                        
                                        {task.subtasks && task.subtasks.length > 0 && (
                                            <span className="flex items-center bg-white/5 px-2 py-0.5 rounded">
                                                {task.subtasks.filter(st => st.isCompleted).length} / {task.subtasks.length} subtasks
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default GlobalTaskManager;
