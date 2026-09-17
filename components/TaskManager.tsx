import React, { useState, useMemo, useCallback } from 'react';
import { Project, AITask } from '../types';
import { ListChecks, Plus, ChevronRight, CheckCircle2, Circle, Calendar, Flag, BrainCircuit, Loader2 } from 'lucide-react';
import TaskDetailView from './TaskDetailView';
import { AIRouterClient } from '../services/AIRouterClient';
import { useAppContext } from '../context/AppContext';

interface TaskManagerProps {
    project: Project;
    onUpdate: (updates: Partial<Project>) => void;
}

const TaskManager: React.FC<TaskManagerProps> = ({ project, onUpdate }) => {
    const { isOnline } = useAppContext();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [newTaskText, setNewTaskText] = useState('');
    const [sortBy, setSortBy] = useState<'dueDate' | 'priority' | 'none'>('none');
    const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);

    const tasks = useMemo(() => project.tasks || [], [project.tasks]);

    const sortedTasks = useMemo(() => {
        return [...tasks].sort((a, b) => {
            if (sortBy === 'dueDate') {
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            }
            if (sortBy === 'priority') {
                const priorityMap = { high: 0, medium: 1, low: 2 };
                const aP = a.priority ? priorityMap[a.priority] : 3;
                const bP = b.priority ? priorityMap[b.priority] : 3;
                return aP - bP;
            }
            return 0;
        });
    }, [tasks, sortBy]);

    const handleAddTask = useCallback(() => {
        if (!newTaskText.trim()) return;
        const newTask: AITask = {
            id: `task-${Date.now()}`,
            text: newTaskText,
            isCompleted: false,
            subtasks: []
        };
        onUpdate({ tasks: [...tasks, newTask] });
        setNewTaskText('');
    }, [newTaskText, tasks, onUpdate]);

    const handleGenerateAITasks = async () => {
        if (!isOnline) return;
        setIsGeneratingTasks(true);
        try {
            const router = new AIRouterClient();
            const trackedMaterialsInfo = project.dryingMonitor?.map(m => `${m.name} in ${m.location} (Status: ${m.status}, Goal: ${m.dryGoal})`).join(', ') || 'No tracked materials yet.';
            const roomsScanned = project.roomScans?.map(s => s.roomName).join(', ') || 'No rooms scanned.';
            const context = `Project: ${project.client}, Category: ${project.waterCategory}, Class: ${project.lossClass}, Risk: ${project.riskLevel}, Rooms: ${roomsScanned}, Materials: ${trackedMaterialsInfo}, Summary: ${project.summary}`;
            const response = await router.generateTasks(context);
            
            const generatedTasks = JSON.parse(response.text || "[]");
            const newTasks: AITask[] = generatedTasks.map((t: {text: string, priority: 'low' | 'medium' | 'high', subtasks?: string[]}, i: number) => ({
                id: `ai-task-${Date.now()}-${i}`,
                text: t.text,
                isCompleted: false,
                priority: t.priority,
                subtasks: (t.subtasks || []).map((subText, subI) => ({
                    id: `ai-subtask-${Date.now()}-${i}-${subI}`,
                    text: subText,
                    isCompleted: false
                }))
            }));

            onUpdate({ tasks: [...tasks, ...newTasks] });
        } catch (error) {
            console.error("Failed to generate tasks:", error);
        } finally {
            setIsGeneratingTasks(false);
        }
    };

    const handleApplyIICRCTemplate = (templateKey: 's500_cat1' | 's500_cat3' | 's520_mold') => {
        const timestamp = Date.now();
        let templateTasks: AITask[] = [];
        
        if (templateKey === 's500_cat1') {
            templateTasks = [
                {
                    id: `temp-task-1-${timestamp}`,
                    text: 'S500 Cat 1: Initial Assessment & Source Safety',
                    isCompleted: false,
                    priority: 'high',
                    subtasks: [
                        { id: `temp-sub-1-1-${timestamp}`, text: 'Verify water source is sanitary (Category 1 Sanitary Water)', isCompleted: false },
                        { id: `temp-sub-1-2-${timestamp}`, text: 'Inspect electrical hazard risk & secure power in affected rooms', isCompleted: false },
                        { id: `temp-sub-1-3-${timestamp}`, text: 'Take initial temperature & RH baseline readings', isCompleted: false },
                        { id: `temp-sub-1-4-${timestamp}`, text: 'Define dry standards using unaffected reference areas', isCompleted: false }
                    ]
                },
                {
                    id: `temp-task-2-${timestamp}`,
                    text: 'S500 Cat 1: Equipment Sizing & Airflow Setup',
                    isCompleted: false,
                    priority: 'medium',
                    subtasks: [
                        { id: `temp-sub-2-1-${timestamp}`, text: 'Size air movers (1 base per room + 1 per 50-70 sq ft of wet floor)', isCompleted: false },
                        { id: `temp-sub-2-2-${timestamp}`, text: 'Position air movers blowing in continuous circuit at 5-45° angle', isCompleted: false },
                        { id: `temp-sub-2-3-${timestamp}`, text: 'Calculate and locate refrigerant dehumidifier (LGR) base needs', isCompleted: false },
                        { id: `temp-sub-2-4-${timestamp}`, text: 'Verify all equipment is connected and logging hours', isCompleted: false }
                    ]
                },
                {
                    id: `temp-task-3-${timestamp}`,
                    text: 'S500 Cat 1: Daily Monitoring & Log Management',
                    isCompleted: false,
                    priority: 'medium',
                    subtasks: [
                        { id: `temp-sub-3-1-${timestamp}`, text: 'Record dry log parameters (Temp, RH, GPP) for inside, outside, and dehumidifier exhaust', isCompleted: false },
                        { id: `temp-sub-3-2-${timestamp}`, text: 'Take wood moisture content percentages and drywall relative readings', isCompleted: false },
                        { id: `temp-sub-3-3-${timestamp}`, text: 'Ensure drying progress is recorded continuously in the psychrometric chart', isCompleted: false }
                    ]
                }
            ];
        } else if (templateKey === 's500_cat3') {
            templateTasks = [
                {
                    id: `temp-task-4-${timestamp}`,
                    text: 'S500 Cat 3: Containment & Engineering Controls',
                    isCompleted: false,
                    priority: 'high',
                    subtasks: [
                        { id: `temp-sub-4-1-${timestamp}`, text: 'Build critical plastic barriers separating affected areas', isCompleted: false },
                        { id: `temp-sub-4-2-${timestamp}`, text: 'Establish negative pressure with HEPA air filtration devices (AFDs)', isCompleted: false },
                        { id: `temp-sub-4-3-${timestamp}`, text: 'Validate negative pressure differential is maintained with manometer', isCompleted: false },
                        { id: `temp-sub-4-4-${timestamp}`, text: 'Install warning signs and restrict entry to authorized crew only', isCompleted: false }
                    ]
                },
                {
                    id: `temp-task-5-${timestamp}`,
                    text: 'S500 Cat 3: Controlled Material Removal (Porous)',
                    isCompleted: false,
                    priority: 'high',
                    subtasks: [
                        { id: `temp-sub-5-1-${timestamp}`, text: 'Don full body PPE (Tyvek, rubber gloves/boots, HEPA respirator)', isCompleted: false },
                        { id: `temp-sub-5-2-${timestamp}`, text: 'Remove porous flooded items: carpet, pad, underlayments, drywall base', isCompleted: false },
                        { id: `temp-sub-5-3-${timestamp}`, text: 'Cut drywall at least 2 feet above highest level of water intrusion', isCompleted: false },
                        { id: `temp-sub-5-4-${timestamp}`, text: 'Double bag or seal contaminated waste prior to containment egress', isCompleted: false }
                    ]
                },
                {
                    id: `temp-task-6-${timestamp}`,
                    text: 'S500 Cat 3: Decontamination & Washdown',
                    isCompleted: false,
                    priority: 'medium',
                    subtasks: [
                        { id: `temp-sub-6-1-${timestamp}`, text: 'Physically clean remaining non-porous structure using surfactant', isCompleted: false },
                        { id: `temp-sub-6-2-${timestamp}`, text: 'Apply EPA-registered disinfectant/biocide on framing', isCompleted: false },
                        { id: `temp-sub-6-3-${timestamp}`, text: 'HEPA vacuum the entire enclosed containment space floor to ceiling', isCompleted: false }
                    ]
                }
            ];
        } else if (templateKey === 's520_mold') {
            templateTasks = [
                {
                    id: `temp-task-7-${timestamp}`,
                    text: 'S520 Mold: Work Plan & IEP Verification',
                    isCompleted: false,
                    priority: 'high',
                    subtasks: [
                        { id: `temp-sub-7-1-${timestamp}`, text: 'Verify Independent Environmental Professional (IEP) survey is current', isCompleted: false },
                        { id: `temp-sub-7-2-${timestamp}`, text: 'Review and post Mold Remediation Work Plan (MRWP) in tech dock', isCompleted: false },
                        { id: `temp-sub-7-3-${timestamp}`, text: 'Check asbestos, lead, and hazardous building material assessments', isCompleted: false }
                    ]
                },
                {
                    id: `temp-task-8-${timestamp}`,
                    text: 'S520 Mold: Engineering Containment Setup',
                    isCompleted: false,
                    priority: 'high',
                    subtasks: [
                        { id: `temp-sub-8-1-${timestamp}`, text: 'Construct local containment or isolation chamber using 6-mil poly', isCompleted: false },
                        { id: `temp-sub-8-2-${timestamp}`, text: 'Install and test a 3-chamber decontamination/airlock system', isCompleted: false },
                        { id: `temp-sub-8-3-${timestamp}`, text: 'Verify HEPA filtration is operating continuous air changes (min 4 ACH)', isCompleted: false }
                    ]
                },
                {
                    id: `temp-task-9-${timestamp}`,
                    text: 'S520 Mold: Physical Source Removal & Cleaning',
                    isCompleted: false,
                    priority: 'high',
                    subtasks: [
                        { id: `temp-sub-9-1-${timestamp}`, text: 'Isolate and bag Condition 3 (active growth) porous assemblies', isCompleted: false },
                        { id: `temp-sub-9-2-${timestamp}`, text: 'Sand or wire brush timber framing to remove mold roots/hyphae', isCompleted: false },
                        { id: `temp-sub-9-3-${timestamp}`, text: 'Implement "HEPA vacuum - Damp Wipe - HEPA vacuum" triple passes', isCompleted: false },
                        { id: `temp-sub-9-4-${timestamp}`, text: 'Schedule Post-Remediation Verification (PRV) testing with IEP', isCompleted: false }
                    ]
                }
            ];
        }

        onUpdate({ tasks: [...tasks, ...templateTasks] });
    };

    const handleUpdateTask = (updatedTask: AITask) => {
        const updatedTasks = tasks.map(t => t.id === updatedTask.id ? updatedTask : t);
        onUpdate({ tasks: updatedTasks });
    };

    const toggleTaskCompletion = (taskId: string) => {
        const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, isCompleted: !t.isCompleted } : t);
        onUpdate({ tasks: updatedTasks });
    };

    const selectedTask = tasks.find(t => t.id === selectedTaskId);

    if (selectedTaskId && selectedTask) {
        return (
            <TaskDetailView 
                task={selectedTask} 
                onUpdate={handleUpdateTask} 
                onBack={() => setSelectedTaskId(null)} 
            />
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 p-6 space-y-6">
            <header className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <div className="p-3 bg-brand-cyan/10 text-brand-cyan rounded-2xl border border-brand-cyan/20">
                        <ListChecks size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white tracking-tight">Project Tasks</h2>
                        <p className="text-xs text-slate-400 mt-0.5">Manage job-specific action items.</p>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <button 
                        onClick={() => setSortBy(sortBy === 'dueDate' ? 'none' : 'dueDate')}
                        className={`p-2 rounded-xl border transition-all flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest ${sortBy === 'dueDate' ? 'bg-brand-cyan text-slate-900 border-brand-cyan' : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'}`}
                    >
                        <Calendar size={14} />
                        <span>Date</span>
                    </button>
                    <button 
                        onClick={() => setSortBy(sortBy === 'priority' ? 'none' : 'priority')}
                        className={`p-2 rounded-xl border transition-all flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest ${sortBy === 'priority' ? 'bg-brand-cyan text-slate-900 border-brand-cyan' : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'}`}
                    >
                        <Flag size={14} />
                        <span>Priority</span>
                    </button>
                </div>
            </header>

            <div className="space-y-4">
                <div className="relative group flex space-x-2">
                    <div className="relative flex-1">
                        <input 
                            type="text"
                            placeholder="Create a new task..."
                            value={newTaskText}
                            onChange={(e) => setNewTaskText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                            className="w-full bg-slate-900 border border-white/10 rounded-2xl py-4 pl-4 pr-12 text-sm font-medium text-white focus:outline-none focus:border-brand-cyan/50 transition-all"
                        />
                        <button 
                            onClick={handleAddTask}
                            disabled={!newTaskText.trim()}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-brand-cyan text-slate-900 rounded-xl disabled:opacity-50 transition-all"
                        >
                            <Plus size={18} />
                        </button>
                    </div>
                    <button 
                        onClick={handleGenerateAITasks}
                        disabled={isGeneratingTasks || !isOnline}
                        className="px-4 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-2xl hover:bg-indigo-600/30 transition-all flex items-center justify-center disabled:opacity-50"
                        title="Auto-Generate Tasks with AI"
                    >
                        {isGeneratingTasks ? <Loader2 size={20} className="animate-spin" /> : <BrainCircuit size={20} />}
                    </button>
                </div>

                {/* Standard IICRC S500 / S520 Checklists */}
                <div id="iicrc-standards-templates" className="bg-slate-900/40 border border-white/5 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-[#00d4aa]">compliance standards</span>
                            <h3 className="text-sm font-bold text-white tracking-tight">IICRC Standard Task Templates</h3>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pr-0.5">
                        <button
                            id="btn-template-s500-cat1"
                            onClick={() => handleApplyIICRCTemplate('s500_cat1')}
                            className="bg-white/5 border border-white/5 hover:border-[#00d4aa]/40 hover:bg-white/10 text-left p-3 rounded-xl transition-all group flex flex-col justify-between"
                        >
                            <div>
                                <h4 className="text-xs font-bold text-slate-200 group-hover:text-[#00d4aa] transition-colors font-mono">S500 Cat 1</h4>
                                <p className="text-[10px] text-slate-500 mt-1">Clean water loss guidelines, drying protocols, and equipment requirements.</p>
                            </div>
                            <span className="text-[9px] font-black uppercase text-[#00d4aa]/70 mt-3 block group-hover:underline">Apply Checklist +</span>
                        </button>

                        <button
                            id="btn-template-s500-cat3"
                            onClick={() => handleApplyIICRCTemplate('s500_cat3')}
                            className="bg-white/5 border border-white/5 hover:border-red-500/40 hover:bg-white/10 text-left p-3 rounded-xl transition-all group flex flex-col justify-between"
                        >
                            <div>
                                <h4 className="text-xs font-bold text-slate-200 group-hover:text-red-400 transition-colors font-mono font-bold">S500 Cat 3</h4>
                                <p className="text-[10px] text-slate-500 mt-1">Grossly unsanitary black water loss, containment setup, and PPE requirements.</p>
                            </div>
                            <span className="text-[9px] font-black uppercase text-red-400/70 mt-3 block group-hover:underline">Apply Checklist +</span>
                        </button>

                        <button
                            id="btn-template-s520-mold"
                            onClick={() => handleApplyIICRCTemplate('s520_mold')}
                            className="bg-white/5 border border-white/5 hover:border-indigo-500/40 hover:bg-white/10 text-left p-3 rounded-xl transition-all group flex flex-col justify-between"
                        >
                            <div>
                                <h4 className="text-xs font-bold text-slate-200 group-hover:text-indigo-400 transition-colors font-mono font-bold">S520 Mold</h4>
                                <p className="text-[10px] text-slate-500 mt-1">Remediation work plans, mini-containments, and PRVs.</p>
                            </div>
                            <span className="text-[9px] font-black uppercase text-indigo-400/70 mt-3 block group-hover:underline">Apply Checklist +</span>
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    {sortedTasks.map(task => (
                        <div 
                            key={task.id}
                            className="group bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:bg-white/10 hover:border-white/10 transition-all cursor-pointer"
                            onClick={() => setSelectedTaskId(task.id)}
                        >
                            <div className="flex items-center space-x-4 flex-1">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); toggleTaskCompletion(task.id); }}
                                    className={`p-1 rounded-md transition-colors ${task.isCompleted ? 'text-emerald-500 bg-emerald-500/10' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    {task.isCompleted ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                                </button>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <p className={`text-sm font-bold ${task.isCompleted ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                                            {task.text}
                                        </p>
                                        <div className="flex items-center space-x-2">
                                            {task.priority && (
                                                <div className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-full border ${
                                                    task.priority === 'high' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                                    task.priority === 'medium' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                                                    'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                                }`}>
                                                    <div className={`w-1 h-1 rounded-full ${
                                                        task.priority === 'high' ? 'bg-red-500' :
                                                        task.priority === 'medium' ? 'bg-yellow-500' :
                                                        'bg-blue-500'
                                                    }`} />
                                                    <span className="text-[8px] font-black uppercase tracking-widest">
                                                        {task.priority}
                                                    </span>
                                                </div>
                                            )}
                                            {task.dueDate && (
                                                <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-slate-950 border border-white/5 text-slate-500">
                                                    <Calendar size={10} />
                                                    <span className="text-[8px] font-mono">
                                                        {task.dueDate}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {task.subtasks && task.subtasks.length > 0 && (
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                                            {task.subtasks.filter(st => st.isCompleted).length} / {task.subtasks.length} Subtasks
                                        </p>
                                    )}
                                </div>
                            </div>
                            <ChevronRight size={18} className="text-slate-600 group-hover:text-white transition-colors ml-4" />
                        </div>
                    ))}
                    {tasks.length === 0 && (
                        <div className="text-center py-12 text-slate-600">
                            <ListChecks size={48} strokeWidth={1} className="mx-auto mb-4 opacity-20" />
                            <p className="text-sm font-medium">No tasks created yet.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TaskManager;
