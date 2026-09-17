
import React, { useState, useEffect, useRef, Suspense } from 'react';
import {
    LayoutDashboard, DollarSign, FolderOpen, BarChart3, Settings,
    Search, WifiOff, FileText, Image, Wind, ListChecks, LogOut,
    Map, Plus, Users, Wrench, ClipboardList, ChevronLeft, ChevronRight, ChevronDown, Menu, X, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppContext } from '../context/AppContext';
import { Project } from '../types';
import ProjectDetails from './ProjectDetails';
import DesktopDashboard from './DesktopDashboard';
import PhotoDocumentation from './PhotoDocumentation';
import EquipmentManager from './EquipmentManager';
import TicSheet from './TicSheet';
import WaterMitigationDocumentation from './WaterMitigationDocumentation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { updateProject } from '../services/api';

import Billing from './Billing';
import Reporting from './Reporting';
import AdminPanel from './AdminPanel';
import ARMapping from './ARMapping';
import TaskManager from './TaskManager';
import GlobalTaskManager from './GlobalTaskManager';
import InventoryTracker from './InventoryTracker';
import CrewDispatch from './CrewDispatch';
import NewProject from './NewProject';
import CommandCenter from './CommandCenter';
import WeatherWidget from './WeatherWidget';
import { ComplianceMonitor } from '../services/ComplianceMonitor';

import Branding from './Branding';

const SuspenseFallback = () => (
    <div className="flex-1 flex items-center justify-center p-8">
        <div className="animate-spin w-6 h-6 border-2 border-[#00d4aa] border-t-transparent rounded-full" />
    </div>
);

const DesktopApp: React.FC = () => {
    const { activeTab, setActiveTab, selectedProjectId, setSelectedProjectId, isOnline, currentUser, hasPermission, setAuthentication, isSearchOpen, setIsSearchOpen } = useAppContext();
    const [projects, setProjects] = useState<Project[]>([]);
    
    useEffect(() => {
        ComplianceMonitor.updateProjects(projects);
    }, [projects]);

    useEffect(() => {
        ComplianceMonitor.start(60000); // Check compliance in background every minute
        return () => ComplianceMonitor.stop();
    }, []);

    const [jobSearch, setJobSearch] = useState('');
    const [isSecondarySidebarCollapsed, setIsSecondarySidebarCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (_e: KeyboardEvent) => {
            // Placeholder for future bindings
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const loadProjects = async () => {
            if (currentUser?.companyId) {
                try {
                    const q = query(collection(db, 'projects'), where('companyId', '==', currentUser.companyId));
                    const querySnapshot = await getDocs(q);
                    const projectData: Project[] = [];
                    querySnapshot.forEach((doc) => {
                        projectData.push({ id: doc.id, ...doc.data() } as Project);
                    });
                    setProjects(projectData);
                } catch (error) {
                    if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
                        handleFirestoreError(error, OperationType.GET, 'projects');
                    } else {
                        console.error("Error fetching projects:", error);
                    }
                }
            }
        };
        loadProjects();
    }, [currentUser]);

    const handleSelectProject = (id: string) => {
        setSelectedProjectId(id);
        setActiveTab('loss-detail');
    };

    const selectedProject = projects.find(p => p.id === selectedProjectId);

    const handleUpdateProject = async (id: string, updates: Partial<Project>) => {
        const updatedProject = { ...projects.find(p => p.id === id)!, ...updates };
        setProjects(projects.map(p => p.id === id ? updatedProject : p));
        try {
            await updateProject(id, updates);
        } catch (e) {
            console.error("Failed to update project", e);
        }
    };

    const filteredProjects = projects.filter(p =>
        jobSearch === '' ||
        p.client?.toLowerCase().includes(jobSearch.toLowerCase()) ||
        p.address?.toLowerCase().includes(jobSearch.toLowerCase())
    );

    const showProjectSidebar = activeTab === 'losses' || !!selectedProjectId;

    const renderMainContent = () => {
        if (activeTab === 'new-project') {
            return (
                <Suspense fallback={<SuspenseFallback />}>
                    <NewProject />
                </Suspense>
            );
        }
        if (activeTab === 'dashboard') return <DesktopDashboard projects={projects} onProjectSelect={handleSelectProject} onUpdateProject={handleUpdateProject} />;
        if (activeTab === 'reporting') return hasPermission('view_admin') ? <Reporting /> : <AccessDenied />;
        if (activeTab === 'admin' || activeTab === 'settings') return hasPermission('view_admin') ? <AdminPanel /> : <AccessDenied />;
        if (activeTab === 'billing' && !selectedProjectId) return hasPermission('view_billing') ? <div className="p-8"><Billing /></div> : <AccessDenied />;
        if (activeTab === 'inventory') return <Suspense fallback={<SuspenseFallback />}><InventoryTracker /></Suspense>;

        if (activeTab === 'crew-dispatch') {
            return (
                <Suspense fallback={<SuspenseFallback />}>
                    <CrewDispatch projects={projects} />
                </Suspense>
            );
        }

        if (activeTab === 'task-manager') {
            if (!selectedProject) {
                return (
                    <Suspense fallback={<SuspenseFallback />}>
                        <GlobalTaskManager projects={projects} onSelectProject={handleSelectProject} />
                    </Suspense>
                );
            }
            return (
                <Suspense fallback={<SuspenseFallback />}>
                    <div className="p-8 h-full overflow-y-auto">
                        <TaskManager
                            project={selectedProject}
                            onUpdate={(updates) => handleUpdateProject(selectedProject.id, updates)}
                        />
                    </div>
                </Suspense>
            );
        }

        if (activeTab === 'losses' || (selectedProjectId && ['loss-detail', 'project', 'equipment', 'tic-sheet', 'photos', 'ar-mapping', 'mitigation-docs'].includes(activeTab))) {
            if (!selectedProjectId) return <DesktopDashboard projects={projects} onProjectSelect={handleSelectProject} onUpdateProject={handleUpdateProject} />;
            if (!selectedProject) return <div className="p-8 text-center text-slate-500">Project not found.</div>;

            return (
                <div className="flex flex-col h-full bg-slate-950">
                    <header className="px-8 py-6 border-b border-white/5 flex-shrink-0 flex justify-between items-start bg-slate-900/50 backdrop-blur-sm">
                        <div>
                            <h2 className="text-2xl font-black text-white tracking-tight">{selectedProject.client}</h2>
                            <p className="text-sm font-medium text-blue-400 mt-1">{selectedProject.address}</p>
                        </div>
                        <div className="flex items-center space-x-1 p-1 bg-black/20 rounded-xl border border-white/5">
                            <ProjectTabButton icon={<FileText size={16} />} label="Details" active={activeTab === 'loss-detail'} onClick={() => setActiveTab('loss-detail')} />
                            <ProjectTabButton icon={<Sparkles size={16} className="text-[#00d4aa]" />} label="AI Mitigation" active={activeTab === 'mitigation-docs'} onClick={() => setActiveTab('mitigation-docs')} />
                            <ProjectTabButton icon={<Image size={16} />} label="Photos" active={activeTab === 'photos'} onClick={() => setActiveTab('photos')} />
                            <ProjectTabButton icon={<Wind size={16} />} label="Equipment" active={activeTab === 'equipment'} onClick={() => setActiveTab('equipment')} />
                            <ProjectTabButton icon={<ListChecks size={16} />} label="Scope" active={activeTab === 'tic-sheet'} onClick={() => setActiveTab('tic-sheet')} />
                            <ProjectTabButton icon={<Map size={16} />} label="AR Mapping" active={activeTab === 'ar-mapping'} onClick={() => setActiveTab('ar-mapping')} />
                        </div>
                    </header>
                    <div className="flex-1 overflow-y-auto">
                        {activeTab === 'loss-detail' && <ProjectDetails />}
                        {activeTab === 'mitigation-docs' && (
                            <div className="h-full">
                                <WaterMitigationDocumentation 
                                    project={selectedProject} 
                                    onUpdateProject={async (updates) => {
                                        const updatedProject = { ...selectedProject, ...updates };
                                        setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
                                        try {
                                            await updateProject(selectedProject.id, updates);
                                        } catch (e) {
                                            console.error("Failed to update project mitigation data", e);
                                        }
                                    }} 
                                    onBack={() => setActiveTab('loss-detail')} 
                                />
                            </div>
                        )}
                        {activeTab === 'photos' && <div className="p-8 h-full"><PhotoDocumentation project={selectedProject} onStartScan={() => {}} /></div>}
                        {activeTab === 'equipment' && <div className="p-8 h-full"><EquipmentManager project={selectedProject} /></div>}
                        {activeTab === 'tic-sheet' && <TicSheet project={selectedProject} />}
                        {activeTab === 'ar-mapping' && (
                            <div className="p-8 h-full">
                                <Suspense fallback={<SuspenseFallback />}>
                                    <ARMapping project={selectedProject} onUpdate={async (updates) => {
                                        const updatedProject = { ...selectedProject, ...updates };
                                        setProjects(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
                                        try {
                                            await updateProject(selectedProject.id, updates);
                                        } catch (e) {
                                            console.error("Failed to update project mapping", e);
                                        }
                                    }} />
                                </Suspense>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return <DesktopDashboard projects={projects} onProjectSelect={handleSelectProject} onUpdateProject={handleUpdateProject} />;
    };

    return (
        <div className="h-screen w-full bg-slate-950 text-slate-200 flex flex-col overflow-hidden font-sans selection:bg-[#00d4aa]/30 selection:text-white">
            {!isOnline && (
                <div className="w-full bg-red-600 text-white text-[10px] font-black text-center py-1 z-[100] flex items-center justify-center uppercase tracking-widest shadow-lg">
                    <WifiOff size={12} className="mr-2" /> Offline Mode Active
                </div>
            )}
            {/* ── Unified Top Navigation Bar ── */}
            <header className="relative flex items-center justify-between px-6 py-3 bg-[#0b0d14]/90 backdrop-blur-2xl border-b border-white/5 z-30 shrink-0">
                <div className="flex items-center space-x-4 md:space-x-8">
                    {/* Mobile Menu Toggle Button */}
                    <button 
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="md:hidden p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors shrink-0"
                        aria-label="Toggle Menu"
                    >
                        {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                    
                    <Branding isCollapsed={false} className="max-sm:scale-95 origin-left" />
                    
                    {/* Primary Horizontal Navigation */}
                    <nav className="hidden md:flex items-center space-x-1">
                        <TopNavButton 
                            label="Dashboard" 
                            icon={<LayoutDashboard size={16} />} 
                            active={activeTab === 'dashboard'} 
                            onClick={() => setActiveTab('dashboard')} 
                        />
                        <TopNavMenu 
                            label="Jobs" 
                            icon={<FolderOpen size={16} />} 
                            active={activeTab === 'losses' || activeTab === 'new-project'}
                        >
                            {hasPermission('view_projects') && (
                                <DropdownItem 
                                    label="Active Jobs" 
                                    icon={<FolderOpen size={14} />} 
                                    onClick={() => { setSelectedProjectId(null); setActiveTab('losses'); setJobSearch(''); }} 
                                />
                            )}
                            {hasPermission('edit_projects') && (
                                <DropdownItem 
                                    label="Create New Job" 
                                    icon={<Plus size={14} />} 
                                    onClick={() => setActiveTab('new-project')} 
                                    highlight 
                                />
                            )}
                        </TopNavMenu>
                        <TopNavMenu 
                            label="Operations" 
                            icon={<Wrench size={16} />} 
                            active={['billing', 'crew-dispatch', 'inventory', 'task-manager'].includes(activeTab)}
                        >
                            {hasPermission('view_billing') && (
                                <DropdownItem 
                                    label="Billing & Invoices" 
                                    icon={<DollarSign size={14} />} 
                                    onClick={() => { setSelectedProjectId(null); setActiveTab('billing'); }} 
                                />
                            )}
                            <DropdownItem 
                                label="Crew & Dispatch" 
                                icon={<Users size={14} />} 
                                onClick={() => setActiveTab('crew-dispatch')} 
                            />
                            <DropdownItem 
                                label="Global Inventory" 
                                icon={<Wrench size={14} />} 
                                onClick={() => { setSelectedProjectId(null); setActiveTab('inventory'); }} 
                            />
                            <DropdownItem 
                                label="Task Manager" 
                                icon={<ClipboardList size={14} />} 
                                onClick={() => { setSelectedProjectId(null); setActiveTab('task-manager'); }} 
                            />
                        </TopNavMenu>
                        {hasPermission('view_admin') && (
                            <TopNavMenu 
                                label="System" 
                                icon={<Settings size={16} />} 
                                active={['reporting', 'admin', 'settings'].includes(activeTab)}
                            >
                                <DropdownItem 
                                    label="Reports" 
                                    icon={<BarChart3 size={14} />} 
                                    onClick={() => setActiveTab('reporting')} 
                                />
                                <DropdownItem 
                                    label="Admin Settings" 
                                    icon={<Settings size={14} />} 
                                    onClick={() => setActiveTab('admin')} 
                                />
                            </TopNavMenu>
                        )}
                    </nav>
                </div>

                <div className="flex items-center space-x-4">
                    {/* Search */}
                    <div className="relative group w-64 hidden lg:block">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#00d4aa] transition-colors pointer-events-none" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            onFocus={(e) => {
                                e.preventDefault();
                                e.target.blur();
                                setIsSearchOpen(true);
                            }}
                            placeholder="Search or Command (⌘K)"
                            className="w-full bg-white/5 rounded-full pl-8 pr-3 py-1.5 text-[11px] font-medium border border-white/10 focus:ring-1 focus:ring-[#00d4aa]/40 focus:border-[#00d4aa]/40 focus:outline-none placeholder-slate-500 text-white cursor-pointer transition-all hover:bg-white/10"
                        />
                    </div>
                    
                    <div className="h-4 w-px bg-white/10 mx-2 hidden lg:block" />

                    {/* Profile / Logout */}
                    <button
                        onClick={() => setAuthentication(false)}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-colors"
                        title="Sign Out"
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {showProjectSidebar && (
                    <aside className={`absolute md:relative h-full md:h-auto bg-slate-900 border-r border-white/5 flex flex-col z-20 transition-all duration-300 flex-shrink-0 ${isSecondarySidebarCollapsed ? 'w-0 border-r-0 -translate-x-full md:translate-x-0' : 'w-72 translate-x-0 font-sans'}`}>
                        {/* Toggle Button */}
                        <button 
                            onClick={() => setIsSecondarySidebarCollapsed(!isSecondarySidebarCollapsed)} 
                            className={`absolute top-6 w-6 h-6 bg-slate-800 rounded-full border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors z-30 ${isSecondarySidebarCollapsed ? '-right-9' : '-right-3'}`}
                        >
                            {isSecondarySidebarCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
                        </button>
                        
                        <div className={`flex flex-col flex-1 overflow-hidden transition-opacity duration-300 ${isSecondarySidebarCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
                            <div className="p-5 border-b border-white/5 flex-shrink-0">
                                <div className="flex justify-between items-center mb-3">
                                    <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                        {jobSearch ? `Results (${filteredProjects.length})` : 'Active Projects'}
                                    </h2>
                                    {selectedProjectId && (
                                        <button
                                            onClick={() => setSelectedProjectId(null)}
                                            className="text-[10px] text-slate-500 hover:text-[#00d4aa] font-bold uppercase tracking-wider transition-colors"
                                        >
                                            ← All
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                {filteredProjects.length === 0 ? (
                                    <div className="text-center py-10 text-slate-600">
                                        <Search size={24} className="mx-auto mb-2 opacity-50" />
                                        <p className="text-xs font-semibold">No jobs found</p>
                                    </div>
                                ) : (
                                    filteredProjects.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => handleSelectProject(p.id)}
                                            className={`w-full text-left p-3 rounded-xl border transition-all group relative overflow-hidden ${selectedProjectId === p.id ? 'bg-[#00d4aa]/10 border-[#00d4aa]/30' : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/5'}`}
                                        >
                                            <div className="relative z-10">
                                                <div className="flex justify-between items-start mb-1">
                                                    <h3 className={`font-bold text-sm ${selectedProjectId === p.id ? 'text-[#00d4aa]' : 'text-slate-200 group-hover:text-white'}`}>{p.client}</h3>
                                                    {selectedProjectId === p.id && (
                                                        <div className="w-1.5 h-1.5 bg-[#00d4aa] rounded-full shadow-[0_0_5px_rgba(0,212,170,0.8)] flex-shrink-0 mt-1" />
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-500 truncate">{p.address}</p>
                                                <div className="mt-2 flex items-center space-x-2">
                                                    <span className="text-[9px] font-black uppercase bg-slate-950 px-1.5 py-0.5 rounded text-slate-400 border border-white/5">{p.currentStage}</span>
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                            
                            {selectedProject?.address && (
                                <div className="p-4 border-t border-white/5 bg-slate-900 overflow-hidden shrink-0">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center"><Wind size={12} className="mr-1.5"/> Local Weather</h3>
                                    <WeatherWidget address={selectedProject.address} />
                                </div>
                            )}
                        </div>
                    </aside>
                )}

                {/* ── Main Content Area ── */}
                <main className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden min-w-0">
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />
                    <div className="flex-1 overflow-hidden relative z-0">
                        <Suspense fallback={<SuspenseFallback />}>
                            {renderMainContent()}
                        </Suspense>
                    </div>
                </main>
            </div>
            {/* Command Center / Palette Overlay */}
            <CommandCenter isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

            {/* Mobile Slide-Out Drawer Navigation */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.5 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="fixed inset-0 bg-black/60 z-40 md:hidden"
                        />
                        {/* Drawer Content */}
                        <motion.div 
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed top-0 left-0 bottom-0 w-80 max-w-[85vw] bg-slate-950 border-r border-white/10 z-50 p-6 flex flex-col justify-between overflow-y-auto md:hidden shadow-2xl"
                        >
                            <div className="space-y-6">
                                <div className="flex items-center justify-between pb-4 border-b border-white/5">
                                    <Branding isCollapsed={false} />
                                    <button 
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                                
                                {/* Nav Links */}
                                <nav className="space-y-4">
                                    <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Navigation</div>
                                    <div className="space-y-1">
                                        <MobileMenuButton 
                                            label="Dashboard" 
                                            icon={<LayoutDashboard size={18} />} 
                                            active={activeTab === 'dashboard'} 
                                            onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }} 
                                        />
                                    </div>

                                    <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider pt-2">Jobs</div>
                                    <div className="space-y-1">
                                        {hasPermission('view_projects') && (
                                            <MobileMenuButton 
                                                label="Active Jobs" 
                                                icon={<FolderOpen size={18} />} 
                                                active={activeTab === 'losses'} 
                                                onClick={() => { setSelectedProjectId(null); setActiveTab('losses'); setJobSearch(''); setIsMobileMenuOpen(false); }} 
                                            />
                                        )}
                                        {hasPermission('edit_projects') && (
                                            <MobileMenuButton 
                                                label="Create New Job" 
                                                icon={<Plus size={18} />} 
                                                active={activeTab === 'new-project'} 
                                                onClick={() => { setActiveTab('new-project'); setIsMobileMenuOpen(false); }} 
                                                highlight
                                            />
                                        )}
                                    </div>

                                    <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider pt-2">Operations</div>
                                    <div className="space-y-1">
                                        {hasPermission('view_billing') && (
                                            <MobileMenuButton 
                                                label="Billing & Invoices" 
                                                icon={<DollarSign size={18} />} 
                                                active={activeTab === 'billing'} 
                                                onClick={() => { setSelectedProjectId(null); setActiveTab('billing'); setIsMobileMenuOpen(false); }} 
                                            />
                                        )}
                                        <MobileMenuButton 
                                            label="Crew & Dispatch" 
                                            icon={<Users size={18} />} 
                                            active={activeTab === 'crew-dispatch'} 
                                            onClick={() => { setActiveTab('crew-dispatch'); setIsMobileMenuOpen(false); }} 
                                        />
                                        <MobileMenuButton 
                                            label="Global Inventory" 
                                            icon={<Wrench size={18} />} 
                                            active={activeTab === 'inventory'} 
                                            onClick={() => { setSelectedProjectId(null); setActiveTab('inventory'); setIsMobileMenuOpen(false); }} 
                                        />
                                        <MobileMenuButton 
                                            label="Task Manager" 
                                            icon={<ClipboardList size={18} />} 
                                            active={activeTab === 'task-manager'} 
                                            onClick={() => { setSelectedProjectId(null); setActiveTab('task-manager'); setIsMobileMenuOpen(false); }} 
                                        />
                                    </div>

                                    {hasPermission('view_admin') && (
                                        <>
                                            <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider pt-2">System</div>
                                            <div className="space-y-1">
                                                <MobileMenuButton 
                                                    label="Reports" 
                                                    icon={<BarChart3 size={18} />} 
                                                    active={activeTab === 'reporting'} 
                                                    onClick={() => { setActiveTab('reporting'); setIsMobileMenuOpen(false); }} 
                                                />
                                                <MobileMenuButton 
                                                    label="Admin Settings" 
                                                    icon={<Settings size={18} />} 
                                                    active={activeTab === 'admin' || activeTab === 'settings'} 
                                                    onClick={() => { setActiveTab('admin'); setIsMobileMenuOpen(false); }} 
                                                />
                                            </div>
                                        </>
                                    )}
                                </nav>
                            </div>

                            <div className="pt-6 border-t border-white/5 space-y-4">
                                <div className="flex items-center space-x-3 px-3">
                                    <div className="w-10 h-10 rounded-full bg-[#00d4aa]/10 border border-[#00d4aa]/20 flex items-center justify-center text-[#00d4aa] font-black text-sm uppercase">
                                        {currentUser?.name?.[0] || 'T'}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-white truncate">{currentUser?.name || 'Technician'}</p>
                                        <p className="text-[10px] text-slate-500 truncate">{currentUser?.email || ''}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setAuthentication(false); setIsMobileMenuOpen(false); }}
                                    className="w-full flex items-center space-x-3 px-3 py-3 rounded-xl text-sm font-semibold text-red-400 hover:bg-red-400/10 transition-colors"
                                >
                                    <LogOut size={18} />
                                    <span>Sign Out</span>
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

/* ── Unified Top Navigation Bar Components ── */
const TopNavButton: React.FC<{
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
}> = ({ active, onClick, icon, label }) => (
    <button
        onClick={onClick}
        className={`flex items-center px-4 py-2 rounded-full transition-all duration-150 text-sm font-semibold
            ${active
                ? 'bg-[#00d4aa]/10 text-[#00d4aa]'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
            } space-x-2`}
    >
        {icon}
        <span>{label}</span>
    </button>
);

const TopNavMenu: React.FC<{
    active: boolean;
    icon: React.ReactNode;
    label: string;
    children: React.ReactNode;
}> = ({ active, icon, label, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center px-4 py-2 rounded-full transition-all duration-150 text-sm font-semibold
                    ${active
                        ? 'bg-[#00d4aa]/10 text-[#00d4aa]'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                    } space-x-2`}
            >
                {icon}
                <span>{label}</span>
                <ChevronDown size={12} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ml-1`} />
            </button>

            {isOpen && (
                <div className="absolute top-full lg:left-0 right-0 mt-2 w-56 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 zoom-in-95">
                    {React.Children.map(children, child => {
                        if (React.isValidElement(child)) {
                            return React.cloneElement(child as React.ReactElement<any>, {
                                ...(child.props as Record<string, any>),
                                onClick: () => {
                                    if (child.props.onClick) child.props.onClick();
                                    setIsOpen(false);
                                }
                            });
                        }
                        return child;
                    })}
                </div>
            )}
        </div>
    );
};

const DropdownItem: React.FC<{
    onClick?: () => void;
    icon: React.ReactNode;
    label: string;
    highlight?: boolean;
}> = ({ onClick, icon, label, highlight }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center px-4 py-3 text-sm font-semibold transition-colors
            ${highlight 
                ? 'text-[#00d4aa] hover:bg-[#00d4aa]/10' 
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
    >
        <span className="mr-3 opacity-80">{icon}</span>
        {label}
        {highlight && <Plus size={12} className="ml-auto opacity-70" />}
    </button>
);

/* ── Project Tab Button (top sub-nav inside a project) ── */
const ProjectTabButton: React.FC<{
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
}> = ({ icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all text-xs font-bold ${active ? 'bg-[#00d4aa] text-slate-900 shadow-lg shadow-[#00d4aa]/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
    >
        {icon}
        <span>{label}</span>
    </button>
);



/* ── Access Denied ── */
const AccessDenied = () => (
    <div className="h-full flex flex-col items-center justify-center text-slate-600">
        <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mb-4"><LogOut /></div>
        <p className="font-bold">Access Restricted</p>
    </div>
);

/* ── Mobile Menu Navigation Link Button ── */
const MobileMenuButton: React.FC<{
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    highlight?: boolean;
}> = ({ active, onClick, icon, label, highlight }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all text-sm font-semibold ${
            active 
                ? 'bg-[#00d4aa]/10 text-[#00d4aa]' 
                : highlight 
                    ? 'text-[#00d4aa] hover:bg-[#00d4aa]/5' 
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
        }`}
    >
        <div className={`p-1.5 rounded-lg ${active ? 'bg-[#00d4aa]/20 text-[#00d4aa]' : 'text-slate-400'}`}>
            {icon}
        </div>
        <span className="truncate">{label}</span>
    </button>
);

export default DesktopApp;
