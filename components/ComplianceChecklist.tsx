import React, { useState, useEffect } from 'react';
import { Project, ComplianceCheck } from '../types';
import { 
    Microscope, CheckCircle2, AlertTriangle, Clock, BrainCircuit, 
    Loader2, Sparkles, X, ShieldCheck, 
    Search, LayoutList, ChevronRight, CheckSquare, Square,
    History, AlertCircle, FileText
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { useAppContext } from '../context/AppContext';
import { EventBus } from '../services/EventBus';
import { motion, AnimatePresence } from 'motion/react';

interface ComplianceChecklistProps {
    project: Project;
    onUpdate?: (updates: Partial<Project>) => void;
}

type ComplianceSection = 'Evidence' | 'Inventory' | 'Audit' | 'Gap';

const AsbestosStatusBadge: React.FC<{ status: NonNullable<Project['complianceChecks']>['asbestos'] }> = ({ status }) => {
    const statusMap = {
        not_tested: { text: 'Testing Required', icon: <AlertTriangle size={14} />, color: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20', darkColor: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
        pending: { text: 'Lab Results Pending', icon: <Clock size={14} />, color: 'bg-blue-500/10 text-blue-300 border-blue-500/20', darkColor: 'bg-blue-100 text-blue-800 border-blue-200' },
        clear: { text: 'No Asbestos Detected', icon: <CheckCircle2 size={14} />, color: 'bg-green-500/10 text-green-300 border-green-500/20', darkColor: 'bg-green-100 text-green-800 border-green-200' },
        abatement_required: { text: 'Abatement Required', icon: <AlertTriangle size={14} />, color: 'bg-red-500/10 text-red-300 border-red-500/20', darkColor: 'bg-red-100 text-red-800 border-red-200' },
    };
    const current = statusMap[status];
    return (
        <div className={`inline-flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-bold border ${current.color} md:${current.darkColor}`}>
            {current.icon}
            <span>{current.text}</span>
        </div>
    );
};

const ComplianceChecklist: React.FC<ComplianceChecklistProps> = ({ project, onUpdate }) => {
    const { isOnline } = useAppContext();
    const [activeSection, setActiveSection] = useState<ComplianceSection>('Evidence');
    const [checklist, setChecklist] = useState<ComplianceCheck[]>(project.complianceChecks?.aiChecklist || []);
    const [analyzingId, setAnalyzingId] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [suggestions, setSuggestions] = useState<Record<string, string>>({});

    useEffect(() => {
        setChecklist(project.complianceChecks?.aiChecklist || []);
    }, [project.complianceChecks?.aiChecklist]);
    
    const toggleCheck = (checkId: string) => {
        const updatedList = checklist.map(c => c.id === checkId ? { ...c, isCompleted: !c.isCompleted } : c);
        setChecklist(updatedList);
        
        const toggledItem = updatedList.find(c => c.id === checkId);
        if (toggledItem) {
            EventBus.publish(
                'com.restorationai.compliance.updated',
                { checkId: toggledItem.id, text: toggledItem.text, status: toggledItem.isCompleted },
                project.id,
                `Compliance Item "${toggledItem.text}" marked as ${toggledItem.isCompleted ? 'Complete' : 'Incomplete'}`,
                'info'
            );
        }

        if (onUpdate) {
            onUpdate({
                complianceChecks: {
                    ...(project.complianceChecks || { asbestos: 'not_tested' }),
                    aiChecklist: updatedList
                }
            });
        }
    };

    const handleGenerateChecklist = async () => {
        if (!isOnline) return;
        setIsGenerating(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
            const prompt = `Based on the project's water category: "${project.waterCategory}" and current stage: "${project.currentStage}", suggest 3 to 6 relevant compliance checklist items for IICRC S500 standards. Include items from the "Mitigation Compliance Tracker" provided in the context if applicable.
            Return ONLY a valid JSON array of objects, where each object has a "text" property with the checklist item string, and "isCompleted" set to false. Do not use markdown formatting blocks. Example: [{"text": "Wear appropriate PPE", "isCompleted": false}]`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
            });
            
            let jsonText = response.text || "[]";
            jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
            const newItems = JSON.parse(jsonText);
            
            const formattedItems = newItems.map((item: { text: string }) => ({
                id: crypto.randomUUID(),
                text: item.text,
                isCompleted: false
            }));

            const updatedList = [...checklist, ...formattedItems];
            setChecklist(updatedList);

            if (onUpdate) {
                onUpdate({
                    complianceChecks: {
                        ...(project.complianceChecks || { asbestos: 'not_tested' }),
                        aiChecklist: updatedList
                    }
                });
            }
        } catch (error) {
            console.error('Failed to generate compliance checklist:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGetSuggestion = async (e: React.MouseEvent, checkId: string, text: string) => {
        e.stopPropagation();
        if (!isOnline) return;
        setAnalyzingId(checkId);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `For the water mitigation compliance check: "${text}", provide a very brief (1 sentence) suggestion on what specific evidence or documentation (e.g., "Photo", "Moisture Map", "Signed COS") is typically needed to verify this step is complete according to IICRC S500/S520.`,
            });
            setSuggestions(prev => ({ ...prev, [checkId]: response.text || "No specific suggestion available." }));
        } catch (error) {
            console.error(error);
        } finally {
            setAnalyzingId(null);
        }
    };

    const inventoryData = [
        { id: 'WTR-01', fw: 'S500', control: 'Initial inspection + Category/Class determination', owner: 'Lead Tech', evidence: 'Project form, moisture map', cadence: 'Per Job' },
        { id: 'WTR-02', fw: 'S500', control: 'Daily moisture readings documented', owner: 'Lead Tech', evidence: 'Daily drying log', cadence: 'Daily' },
        { id: 'WTR-03', fw: 'S500', control: 'Drying chamber calculations logged', owner: 'Lead Tech', evidence: 'RazorSync equipment log', cadence: 'Per Job' },
        { id: 'MLD-01', fw: 'S520', control: 'Pre-remediation IEP assessment confirmed', owner: 'PM', evidence: 'IEP report', cadence: 'Per Job' },
        { id: 'OSHA-01', fw: 'OSHA', control: 'Respirator fit tests current', owner: 'Safety Lead', evidence: 'Fit-test records', cadence: 'Annual' },
        { id: 'LIC-01', fw: 'State', control: 'Company contractor/mold license current', owner: 'Owner', evidence: 'License certificate', cadence: 'Annual' }
    ];

    const auditChecklist = [
        "Pull last 12 months of jobs — ensure each has matching drying log",
        "Spot-check 10% of files for inspection forms, moisture maps, and COS",
        "Confirm every active tech's IICRC certification is current",
        "Verify last respirator fit-test date for every tech",
        "Confirm SDS access for every chemical currently on every truck",
        "Verify insurance COIs (GL + pollution + workers' comp) are current"
    ];

    const gapAnalysis = [
        { req: 'IICRC S500 Drying Logs', state: 'Partially documented', gap: 'Inconsistent daily updates', action: 'Lead tech training on documentation interface', owner: 'Operations Mgr', due: '2024-06-01' },
        { req: 'Respirator Fit Tests', state: '70% Compliant', gap: 'New hires pending testing', action: 'Schedule clinic visit for new staff', owner: 'Safety Lead', due: '2024-05-20' },
        { req: 'SDS Accessibility', state: 'Digital access only', gap: 'Dead zones prevent access', action: 'Install physical binders on all units', owner: 'Safety Lead', due: '2024-05-30' }
    ];

    return (
        <section className="glass-card p-4 md:p-6 rounded-[2rem] md:rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex items-center space-x-3">
                    <div className="p-3 bg-red-500/10 text-red-500 rounded-2xl border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-black text-white tracking-tight uppercase text-lg">Compliance Mastery</h3>
                            <div className="px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/30 text-[8px] font-black text-red-400 uppercase tracking-widest mt-0.5">S-500 / S-520</div>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">IICRC, OSHA & EPA Regulatory Oversight</p>
                    </div>
                </div>
                
                <div className="flex bg-slate-950 p-1 rounded-xl border border-white/5 self-start md:self-center">
                    {(['Evidence', 'Inventory', 'Audit', 'Gap'] as ComplianceSection[]).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveSection(tab)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeSection === tab ? 'bg-brand-cyan text-slate-900 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            <AnimatePresence mode="wait">
                {activeSection === 'Evidence' && (
                    <motion.div 
                        key="evidence"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="space-y-4"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-xs font-black text-brand-cyan uppercase tracking-widest flex items-center gap-2">
                                <FileText size={14} /> Per-Job Evidence Checklist
                            </h4>
                            <button 
                                onClick={handleGenerateChecklist}
                                disabled={isGenerating || !isOnline}
                                className="px-3 py-1.5 bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan/20 border border-brand-cyan/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50 flex items-center space-x-2"
                            >
                                {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                <span>Refine Checklist</span>
                            </button>
                        </div>

                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex justify-between items-center bg-gradient-to-r from-white/[0.02] to-transparent">
                            <div className="flex items-center space-x-3">
                                <Microscope size={18} className="text-slate-400" />
                                <div className="flex flex-col">
                                    <h4 className="font-bold text-xs text-slate-200">Toxicological Guard</h4>
                                    <p className="text-[8px] text-slate-500 uppercase font-black">Asbestos & Lead Protocol</p>
                                </div>
                            </div>
                            <AsbestosStatusBadge status={project.complianceChecks?.asbestos || 'not_tested'} />
                        </div>

                        <div className="space-y-2">
                            {checklist.map(item => (
                                <motion.div 
                                    key={item.id} 
                                    className={`flex flex-col p-4 rounded-2xl border transition-all ${item.isCompleted ? 'bg-green-500/5 border-green-500/20' : 'bg-slate-900/50 border-white/5 hover:border-white/10'}`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-4 cursor-pointer flex-1" onClick={() => toggleCheck(item.id)}>
                                            <div className={`mt-0.5 shrink-0 transition-all ${item.isCompleted ? 'text-green-500 scale-110' : 'text-slate-600'}`}>
                                                {item.isCompleted ? <CheckSquare size={18} /> : <Square size={18} />}
                                            </div>
                                            <p className={`text-xs font-medium leading-relaxed transition-all ${item.isCompleted ? 'text-slate-500 line-through opacity-60' : 'text-slate-200'}`}>
                                                {item.text}
                                            </p>
                                        </div>
                                        <button 
                                            onClick={(e) => handleGetSuggestion(e, item.id, item.text)}
                                            className={`p-2 bg-slate-950 border border-white/10 text-brand-cyan rounded-lg transition-all active:scale-90 ${!isOnline ? 'opacity-50' : 'hover:border-brand-cyan/50 hover:bg-brand-cyan/5'}`}
                                            disabled={analyzingId === item.id || !isOnline}
                                            title="Get AI Suggestion"
                                        >
                                            {analyzingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <BrainCircuit size={12} />}
                                        </button>
                                    </div>
                                    <AnimatePresence>
                                        {suggestions[item.id] && (
                                            <motion.div 
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                className="mt-3 ml-8 p-3 bg-brand-cyan/5 rounded-xl border border-brand-cyan/20 text-[10px] text-brand-cyan flex items-start"
                                            >
                                                <AlertCircle size={12} className="mr-2 mt-0.5 shrink-0" />
                                                <p className="flex-1 font-medium italic">{suggestions[item.id]}</p>
                                                <button onClick={(e) => { e.stopPropagation(); setSuggestions(prev => { const n = {...prev}; delete n[item.id]; return n; }); }} className="ml-2 text-brand-cyan/50 hover:text-brand-cyan"><X size={12} /></button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {activeSection === 'Inventory' && (
                    <motion.div 
                        key="inventory"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="space-y-4"
                    >
                        <h4 className="text-xs font-black text-brand-cyan uppercase tracking-widest flex items-center gap-2">
                            <LayoutList size={14} /> Control Master Inventory
                        </h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        <th className="py-2 text-[9px] font-black text-slate-500 uppercase tracking-widest">FW</th>
                                        <th className="py-2 text-[9px] font-black text-slate-500 uppercase tracking-widest">Control</th>
                                        <th className="py-2 text-[9px] font-black text-slate-500 uppercase tracking-widest">Owner</th>
                                        <th className="py-2 text-[9px] font-black text-slate-500 uppercase tracking-widest">Evidence</th>
                                        <th className="py-2 text-[9px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inventoryData.map(row => (
                                        <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                            <td className="py-3 text-[10px] font-black text-brand-cyan">{row.fw}</td>
                                            <td className="py-3 text-[10px] text-slate-200 font-medium max-w-[150px]">{row.control}</td>
                                            <td className="py-3 text-[10px] text-slate-400">{row.owner}</td>
                                            <td className="py-3 text-[10px] text-slate-500 italic">{row.evidence}</td>
                                            <td className="py-3"><CheckCircle2 className="text-green-500" size={14} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )}

                {activeSection === 'Audit' && (
                    <motion.div 
                        key="audit"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="space-y-4"
                    >
                        <h4 className="text-xs font-black text-brand-cyan uppercase tracking-widest flex items-center gap-2 text-brand-cyan">
                            <Search size={14} /> Audit & Inspection Prep
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {auditChecklist.map((item, idx) => (
                                <div key={idx} className="flex items-start gap-3 p-3 bg-slate-900/50 border border-white/5 rounded-2xl group hover:border-brand-cyan/30 transition-all">
                                    <div className="w-5 h-5 rounded-lg bg-brand-cyan/20 flex items-center justify-center text-brand-cyan text-[10px] font-black shrink-0">
                                        {idx + 1}
                                    </div>
                                    <p className="text-[11px] text-slate-300 font-medium leading-relaxed group-hover:text-white transition-colors">{item}</p>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-start gap-3">
                            <AlertCircle size={18} className="text-yellow-400 mt-1 shrink-0" />
                            <div>
                                <h5 className="text-[11px] font-black text-yellow-400 uppercase tracking-widest mb-1">Trigger Awareness</h5>
                                <p className="text-[10px] text-slate-400 leading-relaxed font-medium">Triggers include state mold inspections, insurance audits, or carrier program reviews. Always maintain physical bindery as a backup to digital records.</p>
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeSection === 'Gap' && (
                    <motion.div 
                        key="gap"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="space-y-4"
                    >
                        <h4 className="text-xs font-black text-brand-cyan uppercase tracking-widest flex items-center gap-2">
                            <History size={14} /> Deficiency Gap Analysis
                        </h4>
                        <div className="space-y-3">
                            {gapAnalysis.map((item, idx) => (
                                <div key={idx} className="p-4 bg-slate-900/50 border border-white/5 rounded-2xl space-y-3">
                                    <div className="flex justify-between items-start">
                                        <h5 className="text-[11px] font-black text-white uppercase tracking-wider">{item.req}</h5>
                                        <span className="text-[9px] font-black px-2 py-0.5 rounded bg-red-500/20 text-red-400 uppercase tracking-widest">Needs Action</span>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div>
                                            <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">State</p>
                                            <p className="text-[10px] text-slate-300 font-medium">{item.state}</p>
                                        </div>
                                        <div>
                                            <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">Gap</p>
                                            <p className="text-[10px] text-slate-400">{item.gap}</p>
                                        </div>
                                        <div>
                                            <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">Assigned</p>
                                            <div className="flex items-center gap-2">
                                                <div className="w-4 h-4 rounded-full bg-brand-cyan/20 flex items-center justify-center text-brand-cyan text-[8px] font-bold">
                                                    {item.owner.charAt(0)}
                                                </div>
                                                <p className="text-[10px] text-slate-300 font-medium">{item.owner}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">Deadline</p>
                                            <p className="text-[10px] text-red-400 font-mono">{item.due}</p>
                                        </div>
                                    </div>
                                    <div className="pt-3 border-t border-white/5 flex items-center gap-3">
                                        <ChevronRight size={14} className="text-brand-cyan" />
                                        <p className="text-[10px] text-slate-400 font-medium"><span className="text-brand-cyan font-bold">Mitigation:</span> {item.action}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
};

export default ComplianceChecklist;
