
import React, { useState, useEffect } from 'react';
import { ArrowLeft, MoreVertical, FileSpreadsheet, Sparkles, Loader2, Wand2, FileText, ClipboardList } from 'lucide-react';
import { LossFile, LineItem } from '../types';
import { useAppContext } from '../context/AppContext';
import { AIRouterClient } from '../services/AIRouterClient';
import { EventBus } from '../services/EventBus';
import ReactMarkdown from 'react-markdown';

interface TicSheetProps {
    project: LossFile;
    isMobile?: boolean;
    onBack?: () => void;
    embedded?: boolean;
}

const TicSheet: React.FC<TicSheetProps> = ({ project, onBack, embedded = false }) => {
    const { accessToken, isOnline } = useAppContext();
    const [isGenerating, setIsGenerating] = useState(false);
    const [lineItems, setLineItems] = useState<LineItem[]>(project.lineItems || []);
    const [view, setView] = useState<'items' | 'report'>('items');

    useEffect(() => {
        setLineItems(project.lineItems || []);
    }, [project.lineItems]);

    const handleAutoScope = async () => {
        if (!isOnline || !accessToken) return;
        setIsGenerating(true);
        try {
            const router = new AIRouterClient();
            // Prepare context from scans and project metadata
            const scanData = project.roomScans?.map(s => `${s.roomName}: ${s.dimensions.sqft} sqft`).join(', ') || 'No scan data';
            const equipData = project.equipment?.map(e => `${e.model} (${e.status})`).join(', ') || 'No equipment logged';
            const materialsData = project.dryingMonitor?.map(m => `${m.name} (${m.status})`).join(', ') || 'No tracking logs';
            const context = `Project at ${project.address}. Scans: ${scanData}. Category: ${project.waterCategory}. Class: ${project.lossClass}. Equipment: ${equipData}. Tracked Materials: ${materialsData}.`;

            
            const response = await router.generateScope(context);
            const data = JSON.parse(response.text || '{}');
            
            if (data.lineItems) {
                const formatted = data.lineItems.map((item: { code: string; description: string; quantity: number; rate: number }, i: number) => ({
                    id: `ai-${Date.now()}-${i}`,
                    code: item.code,
                    description: item.description,
                    quantity: item.quantity,
                    rate: item.rate,
                    total: item.quantity * item.rate,
                    category: 'AI Generated'
                }));
                setLineItems(formatted);
                EventBus.publish('com.restorationai.log.entry', {
                    message: `AI Scope generated ${formatted.length} line items based on scan data.`,
                    category: 'Scoping'
                }, project.id, `AI Scope generated ${formatted.length} items`, 'success');
            }
        } catch (err) {
            console.error("Auto-scope failed", err);
            EventBus.publish('com.restorationai.notification', { title: 'Scope Failed', message: 'Could not generate AI scope.' }, project.id, 'Scope generation failed', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-200">
            {!embedded && (
                <header className="bg-slate-900 border-b border-white/10 p-4 flex justify-between items-center sticky top-0 z-20">
                    <div className="flex items-center space-x-3">
                        <button onClick={onBack}><ArrowLeft size={24} /></button>
                        <div>
                            <h1 className="text-xl font-black text-white">{view === 'items' ? 'Line Items' : 'IICRC Report'}</h1>
                            <p className="text-[10px] text-brand-cyan font-black uppercase tracking-widest">Financial Forensics</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        <div className="flex bg-slate-950 p-1 rounded-xl border border-white/5 mr-2">
                            <button 
                                onClick={() => setView('items')}
                                className={`p-2 rounded-lg transition-all ${view === 'items' ? 'bg-white/10 text-brand-cyan' : 'text-slate-500 hover:text-slate-300'}`}
                                title="Line Items"
                            >
                                <ClipboardList size={18} />
                            </button>
                            <button 
                                onClick={() => setView('report')}
                                className={`p-2 rounded-lg transition-all ${view === 'report' ? 'bg-white/10 text-brand-cyan' : 'text-slate-500 hover:text-slate-300'}`}
                                title="IICRC Report"
                            >
                                <FileText size={18} />
                            </button>
                        </div>
                        <button 
                            onClick={handleAutoScope} 
                            disabled={isGenerating || !isOnline}
                            className="bg-brand-cyan text-slate-950 px-4 py-2 rounded-full text-xs font-black flex items-center space-x-2 shadow-[0_0_15px_rgba(6,182,212,0.4)] disabled:opacity-50"
                        >
                            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                            <span>AI Scope</span>
                        </button>
                    </div>
                </header>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
                {view === 'report' ? (
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-8 prose prose-invert max-w-none">
                        {project.iicrcReport ? (
                            <div className="markdown-body">
                                <ReactMarkdown>{project.iicrcReport}</ReactMarkdown>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                                <FileText size={64} className="mb-4" />
                                <p className="font-bold text-sm">No IICRC Report generated yet.<br/>Compile the report from the Project Overview.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    lineItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                            <FileSpreadsheet size={64} className="mb-4" />
                            <p className="font-bold text-sm">No items documented.<br/>Run AI Scope to generate from field scans.</p>
                        </div>
                    ) : (
                        lineItems.map((item) => (
                            <div key={item.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 group hover:border-brand-cyan/50 transition-all">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <span className="text-[10px] font-black text-brand-cyan bg-brand-cyan/10 px-2 py-0.5 rounded uppercase mr-2">{item.code}</span>
                                        <h4 className="inline font-bold text-white text-sm">{item.description}</h4>
                                    </div>
                                    <button className="p-1.5 hover:bg-white/10 rounded-lg"><MoreVertical size={14}/></button>
                                </div>
                                <div className="flex justify-between items-end">
                                    <div className="flex space-x-4">
                                        <div><span className="block text-[8px] font-black text-slate-500 uppercase">Qty</span><span className="font-mono text-xs text-slate-300">{item.quantity}</span></div>
                                        <div><span className="block text-[8px] font-black text-slate-500 uppercase">Rate</span><span className="font-mono text-xs text-slate-300">${item.rate.toFixed(2)}</span></div>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-[8px] font-black text-slate-500 uppercase">Total</span>
                                        <span className="font-black text-brand-cyan text-lg">${item.total.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )
                )}
            </div>

            {embedded && (
                <div className="absolute bottom-4 right-4">
                    <button 
                        onClick={handleAutoScope} 
                        disabled={isGenerating || !isOnline}
                        className="bg-brand-cyan text-slate-950 p-4 rounded-2xl shadow-xl active:scale-95 transition-all disabled:opacity-50"
                    >
                        {isGenerating ? <Loader2 size={24} className="animate-spin" /> : <Sparkles size={24} />}
                    </button>
                </div>
            )}
        </div>
    );
};

export default TicSheet;
