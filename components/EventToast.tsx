
import React, { useState, useEffect } from 'react';
import { EventBus, CloudEvent } from '../services/EventBus';
import { CheckCircle, AlertTriangle, X, Activity } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

interface Toast {
    id: string;
    title: string;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
    subject?: string;
    type_raw: string;
}

const EventToast: React.FC = () => {
    const { setActiveTab, setSelectedProjectId, markNotificationAsRead } = useAppContext();
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const handleToastClick = (toast: Toast) => {
        markNotificationAsRead(toast.id);
        
        // Navigation Logic based on event type or subject
        if (toast.subject) {
            setSelectedProjectId(toast.subject);
            setActiveTab('project');
        } else if (toast.type_raw.includes('project')) {
            setActiveTab('losses');
        } else if (toast.type_raw.includes('compliance')) {
            setActiveTab('dashboard');
        }
        
        removeToast(toast.id);
    };

    useEffect(() => {
        const handleCloudEvent = (event: CloudEvent) => {
            // Only show toast if UI information is present
            if (event.ui) {
                const toast: Toast = { 
                    id: event.id, 
                    title: event.type.split('.').pop()?.toUpperCase() || 'NOTIFICATION', 
                    message: event.ui.message, 
                    type: event.ui.level,
                    subject: event.subject,
                    type_raw: event.type
                };
                setToasts(prev => [toast, ...prev].slice(0, 4));
                setTimeout(() => removeToast(toast.id), 5000);
            }
        };

        const unsub = EventBus.on('*', handleCloudEvent);
        return () => unsub();
    }, []);

    return (
        <div className="fixed top-4 right-4 z-[100] flex flex-col space-y-3 pointer-events-none">
            {toasts.map(toast => (
                <div 
                    key={toast.id} 
                    onClick={() => handleToastClick(toast)}
                    className="pointer-events-auto bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl animate-in slide-in-from-right duration-300 max-w-xs flex items-start gap-3 cursor-pointer group hover:bg-slate-800/90 hover:border-brand-cyan/30 transition-all"
                >
                    <div className={`p-2 rounded-full shrink-0 ${
                        toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 
                        toast.type === 'error' ? 'bg-red-500/20 text-red-400' :
                        toast.type === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-blue-500/20 text-blue-400'
                    }`}>
                        {toast.type === 'success' ? <CheckCircle size={16} /> : 
                         toast.type === 'error' ? <AlertTriangle size={16} /> :
                         toast.type === 'warning' ? <AlertTriangle size={16} /> :
                         <Activity size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-black text-white uppercase tracking-wide group-hover:text-brand-cyan transition-colors">{toast.title}</h4>
                        <p className="text-xs text-slate-300 mt-1 leading-snug font-medium line-clamp-2">{toast.message}</p>
                    </div>
                    <button 
                        onClick={(e) => { e.stopPropagation(); removeToast(toast.id); }} 
                        className="text-slate-500 hover:text-white transition-colors"
                    >
                        <X size={14}/>
                    </button>
                </div>
            ))}
        </div>
    );
};

export default EventToast;
