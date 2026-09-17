
import React, { useState, useEffect } from 'react';
import { 
  Plus, Sparkles, Search, LayoutDashboard, FolderOpen, ClipboardList, Clock
} from 'lucide-react';
import { motion } from 'motion/react';
import Dashboard from './Dashboard';
import MobileDashboard from './MobileDashboard';
import NewProject from './NewProject';
import ProjectDetails from './ProjectDetails';
import TicSheet from './TicSheet';
import SettingsScreen from './Settings';
import TimeClock from './TimeClock';
import Downloads from './Downloads';
import ARScanner from './ARScanner';
import EquipmentManager from './EquipmentManager';
import GlobalTaskManager from './GlobalTaskManager';
import WaterMitigationDocumentation from './WaterMitigationDocumentation';
import { useAppContext } from '../context/AppContext';
import { RoomScan, Project } from '../types';
import { getProjectById, getProjects } from '../services/api';
import GeminiAssistant from './GeminiAssistant';

const MobileApp: React.FC = () => {
    const { activeTab, setActiveTab, selectedProjectId, setSelectedProjectId, addScanToProject, isOnline, hasPermission, setIsSearchOpen } = useAppContext();
    const [project, setProject] = useState<Project | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isAiOpen, setIsAiOpen] = useState(false);
    const [isNavVisible, setIsNavVisible] = useState(true);
    const lastScrollY = React.useRef(0);

    const handleScroll = (e: React.UIEvent<HTMLElement>) => {
        const currentScrollY = e.currentTarget.scrollTop;
        if (currentScrollY > lastScrollY.current + 10) {
            setIsNavVisible(false);
        } else if (currentScrollY < lastScrollY.current - 10) {
            setIsNavVisible(true);
        }
        lastScrollY.current = currentScrollY;
    };

    useEffect(() => {
        const fetchProject = async () => {
            if (selectedProjectId) {
                try {
                    const p = await getProjectById(selectedProjectId);
                    setProject(p);
                } catch (e) {
                    console.error("Failed to load project", e);
                }
            }
        };
        fetchProject();
    }, [selectedProjectId]);

    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const all = await getProjects();
                setProjects(all);
            } catch (e) {
                console.error("Failed to load projects", e);
            }
        };
        fetchProjects();
    }, []);

    const handleScanComplete = async (scanData?: RoomScan) => {
        if (selectedProjectId && scanData) {
            try {
                await addScanToProject(selectedProjectId, scanData);
            } catch (e) {
                console.error("Failed to add scan to project", e);
            }
        }
        setActiveTab('loss-detail');
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard': 
                return <MobileDashboard />;
            case 'losses': 
                return <Dashboard />;
            case 'downloads':
                return <Downloads />;
            case 'new-loss':
            case 'new-project':
                return <NewProject />;
            case 'loss-detail':
            case 'project':
                // Pass isMobile=true to enable the vertical Live Feed layout
                return <ProjectDetails isMobile={true} />;
            case 'line-items':
            case 'tic-sheet':
                return project ? <TicSheet project={project} isMobile={true} onBack={() => setActiveTab('loss-detail')} /> : <div className="p-8 text-center text-slate-500"><div className="animate-spin w-6 h-6 border-2 border-brand-cyan border-t-transparent rounded-full mx-auto" /></div>;
            case 'time-clock':
                return <TimeClock />;
            case 'settings':
                return <SettingsScreen />;
            case 'scanner':
                return <ARScanner onComplete={handleScanComplete} />;
            case 'equipment':
                return project ? <EquipmentManager project={project} /> : <div className="p-8 text-center text-slate-500">Select a loss first.</div>;
            case 'mitigation-docs':
                return project ? (
                    <WaterMitigationDocumentation 
                        project={project} 
                        onUpdateProject={async (updates) => {
                            setProject(prev => prev ? { ...prev, ...updates } : null);
                        }} 
                        onBack={() => setActiveTab('loss-detail')} 
                    />
                ) : <div className="p-8 text-center text-slate-500">Select a loss first.</div>;
            case 'task-manager':
                return <GlobalTaskManager projects={projects} onSelectProject={(id) => { setSelectedProjectId(id); setActiveTab('loss-detail'); }} />;
            default:
                return <MobileDashboard />;
        }
    };

    const hideBottomNav = ['scanner', 'new-loss', 'new-project'].includes(activeTab);

    return (
        <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-950 shadow-2xl relative font-sans overflow-hidden border-x border-white/5">
            {/* Offline Banner */}
            {!isOnline && (
                <div className="absolute top-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md text-amber-500 text-xs font-bold text-center py-2 z-[60] border-b border-amber-500/20 shadow-md flex items-center justify-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>Working Offline - Sync Paused</span>
                </div>
            )}

            {/* Main Content Area */}
            <main className={`flex-1 overflow-y-auto bg-slate-950 relative z-0`} onScroll={handleScroll}>
                {/* Ambient Background Glow */}
                <div className="fixed top-0 left-0 w-full h-[500px] bg-blue-900/20 rounded-full blur-[100px] pointer-events-none -z-10" />
                {renderContent()}
            </main>

            {/* Floating Tools (AI/CLI) */}
            {!hideBottomNav && (
                <div className={`absolute bottom-24 right-4 flex flex-col space-y-3 z-40 pointer-events-auto transition-all duration-300 ${isNavVisible ? 'translate-y-0 opacity-100 visible' : 'translate-y-32 opacity-0 invisible'}`}>
                    {hasPermission('use_ai_tools') && activeTab !== 'scanner' && (
                        <button 
                            onClick={() => setIsAiOpen(true)} 
                            className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-full shadow-lg flex items-center justify-center text-brand-cyan border border-white/20 active:scale-90 transition-transform animate-in zoom-in duration-300"
                        >
                            <Sparkles size={20} />
                        </button>
                    )}
                    {activeTab !== 'scanner' && (
                        <button 
                            onClick={() => setIsSearchOpen(true)} 
                            className="w-12 h-12 bg-slate-900/80 backdrop-blur-md rounded-full shadow-lg flex items-center justify-center text-white border border-white/10 active:scale-90 transition-transform animate-in zoom-in duration-300 delay-75"
                        >
                            <Search size={18} />
                        </button>
                    )}
                </div>
            )}

            {/* AI Modals */}
            {isOnline && <GeminiAssistant context={activeTab} isOpen={isAiOpen} onClose={() => setIsAiOpen(false)} />}

            {/* Bottom Navigation */}
            {!hideBottomNav && (
                <div className="flex-shrink-0 bg-slate-950 px-4 pb-6 pt-2 relative z-50 flex flex-col items-center">
                    {/* Manual Collapse/Expand Toggle */}
                    <button 
                        onClick={() => setIsNavVisible(!isNavVisible)}
                        className="w-10 h-6 mb-1 bg-slate-900 border border-white/5 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                    >
                        <svg className={`w-4 h-4 transition-transform ${isNavVisible ? 'rotate-180' : 'rotate-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                    </button>
                    
                    <div className={`w-full overflow-hidden transition-all duration-300 ${isNavVisible ? 'h-16 opacity-100' : 'h-0 opacity-0'}`}>
                        <nav className="h-16 bg-[#0b0d14]/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] flex justify-between items-center px-6 shadow-2xl">
                            <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={24} strokeWidth={2.5} />} />
                            <NavButton active={activeTab === 'losses'} onClick={() => setActiveTab('losses')} icon={<FolderOpen size={24} strokeWidth={2.5} />} />
                            
                            <div className="relative mx-2 z-10">
                                <button onClick={() => setActiveTab('new-loss')} className="w-12 h-12 bg-[#00d4aa] rounded-full flex items-center justify-center text-[#0b0d14] shadow-[0_0_15px_rgba(0,212,170,0.4)] active:scale-95 transition-transform hover:scale-105">
                                    <Plus size={24} strokeWidth={3} />
                                </button>
                            </div>

                            <NavButton active={activeTab === 'task-manager'} onClick={() => setActiveTab('task-manager')} icon={<ClipboardList size={24} strokeWidth={2.5} />} />
                            <NavButton active={activeTab === 'time-clock'} onClick={() => setActiveTab('time-clock')} icon={<Clock size={24} strokeWidth={2.5} />} />
                        </nav>
                    </div>
                </div>
            )}
        </div>
    );
};

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; count?: number }> = ({ active, onClick, icon, count }) => (
    <button onClick={onClick} className={`relative flex flex-col items-center justify-center min-w-[44px] min-h-[44px] w-12 h-12 rounded-full transition-all duration-300 active:scale-90 ${active ? 'text-[#00d4aa] bg-[#00d4aa]/10' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>
        <div className="relative">
            {icon}
            {count && (
                <motion.div 
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    key={count}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-black border-2 border-[#0b0d14] shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                >
                    {count}
                </motion.div>
            )}
        </div>
    </button>
);

export default MobileApp;
