import React, { useState } from 'react';
import { AITask, SubTask } from '../types';
import { CheckCircle2, Circle, Plus, Trash2, ChevronLeft, Calendar, Flag } from 'lucide-react';

interface TaskDetailViewProps {
    task: AITask;
    onUpdate: (updatedTask: AITask) => void;
    onBack: () => void;
}

const TaskDetailView: React.FC<TaskDetailViewProps> = ({ task, onUpdate, onBack }) => {
    const [newSubtaskText, setNewSubtaskText] = useState('');

    const toggleSubtask = (subtaskId: string) => {
        const updatedSubtasks = (task.subtasks || []).map(st => 
            st.id === subtaskId ? { ...st, isCompleted: !st.isCompleted } : st
        );
        onUpdate({ ...task, subtasks: updatedSubtasks });
    };

    const addSubtask = () => {
        if (!newSubtaskText.trim()) return;
        const newSubtask: SubTask = {
            id: `st-${Date.now()}`,
            text: newSubtaskText,
            isCompleted: false
        };
        onUpdate({ 
            ...task, 
            subtasks: [...(task.subtasks || []), newSubtask] 
        });
        setNewSubtaskText('');
    };

    const removeSubtask = (subtaskId: string) => {
        const updatedSubtasks = (task.subtasks || []).filter(st => st.id !== subtaskId);
        onUpdate({ ...task, subtasks: updatedSubtasks });
    };

    const updateSubtaskText = (subtaskId: string, newText: string) => {
        const updatedSubtasks = (task.subtasks || []).map(st => 
            st.id === subtaskId ? { ...st, text: newText } : st
        );
        onUpdate({ ...task, subtasks: updatedSubtasks });
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-200 animate-in fade-in slide-in-from-right duration-300">
            <header className="p-4 border-b border-white/10 flex items-center space-x-4">
                <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                    <ChevronLeft size={20} />
                </button>
                <h2 className="text-lg font-bold text-white truncate">{task.text}</h2>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center">
                            <Calendar size={12} className="mr-1" /> Due Date
                        </label>
                        <input 
                            type="date"
                            value={task.dueDate || ''}
                            onChange={(e) => onUpdate({ ...task, dueDate: e.target.value })}
                            className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-cyan/50"
                        />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center">
                            <Flag size={12} className="mr-1" /> Priority Level
                        </label>
                        <div className="flex p-1 bg-slate-900 border border-white/10 rounded-2xl">
                            {(['low', 'medium', 'high'] as const).map((p) => (
                                <button
                                    key={p}
                                    onClick={() => onUpdate({ ...task, priority: p })}
                                    className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                        (task.priority || 'medium') === p
                                            ? p === 'high' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' :
                                              p === 'medium' ? 'bg-yellow-500 text-slate-900 shadow-lg shadow-yellow-500/20' :
                                              'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                                            : 'text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Subtasks</h3>
                    
                    {/* Visual Progress Indicator */}
                    {(() => {
                        const totalSubtasks = (task.subtasks || []).length;
                        const completedSubtasks = (task.subtasks || []).filter(st => st.isCompleted).length;
                        const completionPercentage = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;
                        
                        if (totalSubtasks === 0) return null;
                        return (
                            <div id="subtask-progress-card" className="bg-slate-900/40 border border-white/5 rounded-2xl p-3.5 mb-4 space-y-2">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    <span>Mitigation Progress</span>
                                    <span className="text-brand-cyan bg-brand-cyan/15 px-2.5 py-1 rounded-full text-[10px] font-black">
                                        {completedSubtasks} / {totalSubtasks} DONE ({completionPercentage}%)
                                    </span>
                                </div>
                                <div className="w-full bg-slate-950/80 rounded-full h-1.5 overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-brand-cyan to-teal-400 rounded-full transition-all duration-500 ease-out"
                                        style={{ width: `${completionPercentage}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })()}

                    {/* Left border line indicating indented block & visual link to parent checklist */}
                    <div className="pl-5 border-l-2 border-slate-800/80 relative ml-3.5 mt-2 space-y-3.5" id="subtasks-container">
                        {(task.subtasks || []).map((st) => (
                            <div 
                                key={st.id} 
                                id={`subtask-row-${st.id}`}
                                className={`group relative flex items-center space-x-3.5 p-3 rounded-2xl border transition-all duration-300 ${
                                    st.isCompleted 
                                        ? 'bg-emerald-950/5 border-emerald-900/15 text-slate-400 shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)]' 
                                        : 'bg-slate-900/40 border-white/5 hover:border-white/12 hover:bg-slate-900/70 text-slate-200'
                                }`}
                            >
                                {/* Left tiny indent guide bubble */}
                                <div className="absolute left-[-26px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-slate-700 bg-slate-950 flex items-center justify-center">
                                    <span className={`w-1.5 h-1.5 rounded-full ${st.isCompleted ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                                </div>

                                <button 
                                    id={`subtask-toggle-${st.id}`}
                                    onClick={() => toggleSubtask(st.id)}
                                    className={`p-1.5 rounded-md transition-all duration-200 shrink-0 ${
                                        st.isCompleted 
                                            ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15 ring-2 ring-emerald-500/10' 
                                            : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-white/10'
                                    }`}
                                >
                                    {st.isCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                                </button>
                                
                                <input 
                                    id={`subtask-input-${st.id}`}
                                    type="text"
                                    value={st.text}
                                    onChange={(e) => updateSubtaskText(st.id, e.target.value)}
                                    className={`flex-1 bg-transparent border-none p-0 outline-none focus:ring-0 text-sm tracking-wide transition-all ${
                                        st.isCompleted 
                                            ? 'text-slate-500 line-through decoration-slate-600/60' 
                                            : 'text-slate-200 focus:text-white'
                                    }`}
                                />

                                <button 
                                    id={`subtask-delete-${st.id}`}
                                    onClick={() => removeSubtask(st.id)}
                                    aria-label={`Delete ${st.text}`}
                                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl opacity-70 md:opacity-0 group-hover:opacity-100 transition-all duration-200 shrink-0 min-w-[32px] min-h-[32px] flex items-center justify-center"
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        ))}

                        <div className="flex items-center space-x-3 pt-1.5" id="add-subtask-container">
                            <div className="p-1.5 text-slate-500 bg-slate-900/30 rounded-xl border border-white/5">
                                <Plus size={16} />
                            </div>
                            <input 
                                id="add-subtask-input"
                                type="text"
                                placeholder="Add a subtask..."
                                value={newSubtaskText}
                                onChange={(e) => setNewSubtaskText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
                                className="flex-1 bg-transparent border-none p-2 focus:ring-0 text-sm text-slate-300 placeholder-slate-600 outline-none focus:outline-none"
                            />
                            {newSubtaskText && (
                                <button 
                                    id="add-subtask-btn"
                                    onClick={addSubtask}
                                    className="px-4.5 py-2 bg-brand-cyan text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand-cyan/15 hover:shadow-brand-cyan/25 active:scale-95 transition-all"
                                >
                                    Add
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TaskDetailView;
