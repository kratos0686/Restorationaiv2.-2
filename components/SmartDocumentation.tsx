
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
    Sparkles, Mic, Loader2, ArrowLeft, Droplets, ShieldCheck, Send, MoreHorizontal, 
    User, Wind
, FileText, Image as ImageIcon } from 'lucide-react';
import { Project, DailyNarrative } from '../types';
import { useAppContext } from '../context/AppContext';
import { AIRouterClient } from '../services/AIRouterClient';
import { EventBus, CloudEvent } from '../services/EventBus';

interface SmartDocumentationProps {
    project: Project;
    onUpdate: (updates: Partial<Project>) => void;
    onBack?: () => void;
}

interface SpeechRecognitionEvent extends Event {
    results: {
        [index: number]: {
            [index: number]: {
                transcript: string;
            };
        };
    };
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
}

interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: (event: SpeechRecognitionEvent) => void;
    onerror: (event: SpeechRecognitionErrorEvent) => void;
    onend: () => void;
    start: () => void;
    stop: () => void;
}

const SmartDocumentation: React.FC<SmartDocumentationProps> = ({ project, onUpdate, onBack }) => {
    const { isOnline, currentUser } = useAppContext();
    const [narratives, setNarratives] = useState<DailyNarrative[]>(project.dailyNarratives || []);
    const [isThinking, setIsThinking] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [draftInput, setDraftInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const handleMagicInputRef = useRef<((overrideInput?: string) => Promise<void>) | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const SpeechRecognitionConstructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognitionConstructor) {
                recognitionRef.current = new SpeechRecognitionConstructor();
                if (recognitionRef.current) {
                    recognitionRef.current.continuous = false;
                    recognitionRef.current.interimResults = false;
                    recognitionRef.current.lang = 'en-US';

                    recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
                        const transcript = event.results[0][0].transcript;
                        setDraftInput(transcript);
                        setIsRecording(false);
                        if (transcript.trim()) {
                            handleMagicInputRef.current?.(transcript);
                        }
                    };

                    recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
                        console.error('Speech recognition error', event.error);
                        setIsRecording(false);
                    };

                    recognitionRef.current.onend = () => {
                        setIsRecording(false);
                    };
                }
            }
        }
    }, []);

    const toggleRecording = () => {
        if (isRecording) {
            recognitionRef.current?.stop();
        } else {
            setDraftInput('');
            recognitionRef.current?.start();
            setIsRecording(true);
        }
    };

    useEffect(() => {
        setNarratives(project.dailyNarratives || []);
    }, [project.dailyNarratives]);

    // Listen for System Events to populate the Feed
    useEffect(() => {
        const handleCloudEvent = (event: CloudEvent) => {
            const typeMap: Record<string, DailyNarrative['entryType']> = {
                'com.restorationai.drying.recorded': 'drying',
                'com.restorationai.equipment.state.changed': 'equipment',
                'com.restorationai.compliance.updated': 'compliance',
                'com.restorationai.scan.captured': 'photo'
            };

            const entryType = typeMap[event.type] || 'general';

            if (event.ui?.message) {
                const newLog: DailyNarrative = {
                    id: `ev-${event.id}`,
                    date: new Date(event.time).toLocaleDateString(),
                    timestamp: new Date(event.time).getTime(),
                    content: event.ui.message,
                    author: 'System',
                    tags: ['Auto-Log', entryType],
                    generated: true,
                    entryType: entryType,
                    data: event.data
                };
                setNarratives(prev => [newLog, ...prev]);
                // In production, update backend here
            }
        };

        const unsubscribe = EventBus.on('*', handleCloudEvent);
        return () => unsubscribe();
    }, []);

    const handleMagicInput = useCallback(async (overrideInput?: string) => {
        const inputText = overrideInput || draftInput;
        if (!inputText.trim() || !isOnline) return;
        setIsThinking(true);
        if (!overrideInput) setDraftInput('');

        try {
            const router = new AIRouterClient();
            // Parse intent using AI
            const response = await router.parseFieldIntent(inputText, {
                currentEquipment: project.equipment?.length || 0,
                lastReading: project.rooms[0]?.readings.slice(-1)[0]
            });
            
            const result = JSON.parse(response.text || '{}');
            const { category, structuredData, summary } = result;

            // 1. Create the Narrative Log
            const newLog: DailyNarrative = {
                id: `nl-${Date.now()}`,
                date: new Date().toLocaleDateString(),
                timestamp: Date.now(),
                content: summary || inputText, // Use AI summary or fallback
                author: currentUser?.name || 'Technician',
                tags: [category || 'Manual Entry'],
                generated: false,
                entryType: category === 'Psychrometrics' ? 'drying' : category === 'Equipment' ? 'equipment' : 'general',
                data: structuredData
            };
            
            const updatedNarratives = [newLog, ...narratives];
            setNarratives(updatedNarratives);
            onUpdate({ dailyNarratives: updatedNarratives });

            // 2. Trigger System Actions based on Intent (Simulation)
            if (category === 'Equipment' && structuredData?.action) {
                 EventBus.publish('com.restorationai.equipment.state.changed', structuredData, project.id, summary, 'success');
            }

        } catch (error) {
            console.error("Magic Input Failed", error);
            // Fallback to simple text log
            const fallbackLog: DailyNarrative = {
                id: `man-${Date.now()}`,
                date: new Date().toLocaleDateString(),
                timestamp: Date.now(),
                content: inputText,
                author: currentUser?.name || 'Technician',
                tags: ['Manual Note'],
                generated: false,
                entryType: 'general'
            };
            setNarratives(prev => [fallbackLog, ...prev]);
            onUpdate({ dailyNarratives: [fallbackLog, ...narratives] });
        } finally {
            setIsThinking(false);
        }
    }, [draftInput, isOnline, currentUser, narratives, onUpdate, project.id, project.equipment, project.rooms]);

    useEffect(() => {
        handleMagicInputRef.current = handleMagicInput;
    }, [handleMagicInput]);

    const renderCardContent = (log: DailyNarrative) => {
        switch (log.entryType) {
            case 'drying':
                return (
                    <div className="mt-2 p-3 bg-black/20 rounded-xl border border-white/5 flex items-center space-x-4">
                        <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                            <Droplets size={20} />
                        </div>
                        <div className="flex-1">
                             <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Psychrometrics</div>
                             <div className="text-sm font-medium text-white">{log.content}</div>
                             {(log.data as Record<string, unknown>)?.physics && (
                                 <div className="mt-2 flex space-x-2 text-[10px] font-mono text-slate-400">
                                     <span className="bg-white/5 px-2 py-1 rounded">GPP: {((log.data as Record<string, unknown>).physics as Record<string, unknown>)?.aff ? (((log.data as Record<string, unknown>).physics as Record<string, unknown>).aff as Record<string, unknown>).gpp as string : 'N/A'}</span>
                                     <span className="bg-white/5 px-2 py-1 rounded">DewPt: {((log.data as Record<string, unknown>).physics as Record<string, unknown>)?.aff ? (((log.data as Record<string, unknown>).physics as Record<string, unknown>).aff as Record<string, unknown>).dewPoint as string : 'N/A'}</span>
                                 </div>
                             )}
                        </div>
                    </div>
                );
                        case 'field_update':
                return (
                    <div className="mt-2 p-3 bg-brand-cyan/10 rounded-xl border border-brand-cyan/20 flex flex-col space-y-2">
                        <div className="flex items-center space-x-4">
                            <div className="p-2 bg-brand-cyan/20 rounded-lg text-brand-cyan">
                                <FileText size={20} />
                            </div>
                            <div className="flex-1">
                                <div className="text-xs font-bold text-brand-cyan/80 uppercase tracking-widest">Field Update</div>
                                <div className="text-sm font-medium text-white">{log.content}</div>
                                {log.timeSpent && <div className="text-[10px] text-slate-400 mt-1 font-mono">Time Logged: {log.timeSpent} Hrs</div>}
                            </div>
                        </div>
                        {log.attachments && log.attachments.length > 0 && (
                            <div className="flex gap-2 mt-2 pt-2 border-t border-brand-cyan/10">
                                {log.attachments.map((a, i) => (
                                    <div key={i} className="w-16 h-16 bg-black/40 rounded-lg border border-white/5 flex items-center justify-center overflow-hidden relative">
                                        <ImageIcon size={16} className="text-slate-500 absolute" />
                                        {/* Fake image representation for demo */}
                                        <div className="absolute inset-0 bg-gradient-to-tr from-brand-cyan/20 to-transparent mix-blend-overlay" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            case 'equipment':
                return (
                    <div className="mt-2 p-3 bg-emerald-900/10 rounded-xl border border-emerald-500/10 flex items-center space-x-4">
                        <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
                            <Wind size={20} />
                        </div>
                         <div className="flex-1">
                             <div className="text-xs font-bold text-emerald-500/80 uppercase tracking-widest">Asset Management</div>
                             <div className="text-sm font-medium text-white">{log.content}</div>
                        </div>
                    </div>
                );
            case 'compliance':
                 return (
                    <div className="mt-2 p-3 bg-indigo-900/10 rounded-xl border border-indigo-500/10 flex items-center space-x-4">
                        <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                            <ShieldCheck size={20} />
                        </div>
                         <div className="flex-1">
                             <div className="text-xs font-bold text-indigo-500/80 uppercase tracking-widest">Protocol Verified</div>
                             <div className="text-sm font-medium text-white">{log.content}</div>
                        </div>
                    </div>
                );
            default:
                return <p className="text-sm text-slate-300 leading-relaxed font-medium mt-1">{log.content}</p>;
        }
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-200 font-sans relative">
            <header className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 p-4 sticky top-0 z-20 flex justify-between items-center shadow-lg">
                <div className="flex items-center space-x-3">
                    {onBack && <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors"><ArrowLeft size={24} /></button>}
                    <div>
                        <h1 className="text-lg font-black text-white tracking-tight">Job Feed</h1>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{project.id} • {project.client}</p>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                     <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
                     <span className="text-[10px] font-mono text-slate-500">{isOnline ? 'LIVE' : 'OFFLINE'}</span>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24" ref={scrollRef}>
                <div className="relative border-l-2 border-white/5 ml-4 space-y-8 pb-4">
                    {narratives.map((log, index) => (
                        <div key={log.id} className="ml-8 relative group animate-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${index * 50}ms` }}>
                            {/* Timeline Node */}
                            <span className={`absolute -left-[2.4rem] top-4 w-3 h-3 rounded-full border-2 transition-all duration-300 shadow-[0_0_10px_rgba(0,0,0,0.5)] z-10 ${log.entryType === 'drying' ? 'bg-blue-500 border-blue-400' : log.entryType === 'equipment' ? 'bg-emerald-500 border-emerald-400' : log.entryType === 'field_update' ? 'bg-brand-cyan border-cyan-400' : 'bg-slate-700 border-slate-500'}`} />
                            
                            <div className="glass-card rounded-2xl p-4 hover:bg-white/5 transition-all shadow-sm group-hover:shadow-md border border-white/5">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center space-x-2">
                                        <div className={`p-1 rounded-md border border-white/5 ${log.generated ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-700/50 text-slate-300'}`}>
                                            {log.generated ? <Sparkles size={10} /> : <User size={10} />}
                                        </div>
                                        <div>
                                            <span className="block text-xs font-bold text-white">{log.author}</span>
                                            <span className="flex items-center text-[9px] text-slate-500 font-mono mt-0.5">
                                                {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </span>
                                        </div>
                                    </div>
                                    <button className="text-slate-600 hover:text-white transition-colors"><MoreHorizontal size={14}/></button>
                                </div>
                                
                                {renderCardContent(log)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Magic Input Bar */}
            <div className="p-4 bg-slate-900 border-t border-white/10 z-30">
                <div className="relative">
                     <input 
                        type="text" 
                        value={draftInput}
                        onChange={(e) => setDraftInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleMagicInput()}
                        disabled={isThinking}
                        className="w-full bg-slate-950 border border-white/10 rounded-2xl pl-12 pr-12 py-4 text-sm font-medium text-white focus:outline-none focus:border-brand-cyan/50 focus:ring-1 focus:ring-brand-cyan/20 placeholder-slate-600 shadow-xl transition-all"
                        placeholder={isThinking ? "Processing field data..." : "Log reading, equipment move, or note..."}
                     />
                     <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                         {isThinking ? (
                             <Loader2 size={20} className="animate-spin text-brand-cyan" />
                         ) : (
                             <Mic 
                                 size={20} 
                                 onClick={toggleRecording}
                                 className={`hover:text-white cursor-pointer transition-colors ${isRecording ? 'text-red-500 animate-pulse' : ''}`} 
                             />
                         )}
                     </div>
                     <button 
                        onClick={() => handleMagicInput()}
                        disabled={!draftInput.trim() || isThinking}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-brand-cyan text-slate-900 rounded-xl hover:bg-cyan-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-600 transition-all active:scale-95"
                     >
                         <Send size={16} />
                     </button>
                </div>
            </div>
        </div>
    );
};

export default SmartDocumentation;
