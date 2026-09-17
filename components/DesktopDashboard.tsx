
import React, { useState, useEffect } from 'react';
import { Project } from '../types';
import { Briefcase, DollarSign, Users, TrendingUp, TrendingDown, ChevronRight, ChevronLeft, Activity, Radio, AlertTriangle, Fan, ShieldAlert, Clock, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import { EventBus, CloudEvent } from '../services/EventBus';
import HistoricalPredictiveModel from './HistoricalPredictiveModel';
import { AggregateMoistureTrends } from './AggregateMoistureTrends';
import { useAppContext } from '../context/AppContext';
import { motion } from 'motion/react';
import { DashboardSyncService } from '../services/DashboardSyncService';
import { interpretTelemetry } from '../utils/telemetryFormatter';

interface DesktopDashboardProps {
    projects: Project[];
    onProjectSelect: (id: string) => void;
    onUpdateProject?: (id: string, updates: Partial<Project>) => Promise<void>;
}

const DesktopDashboard: React.FC<DesktopDashboardProps> = ({ projects, onProjectSelect }) => {
    const { setActiveTab, setSelectedProjectId, notificationPermission, requestNotificationPermission, currentUser } = useAppContext();
    const [events, setEvents] = useState<CloudEvent[]>([]);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1100);

    // Initial Default Mock Data
    const initialRevenueData = [
        { name: 'Aug', revenue: 120450 },
        { name: 'Sep', revenue: 185600 },
        { name: 'Oct', revenue: 157800 },
        { name: 'Nov', revenue: 215000 },
        { name: 'Dec (Proj.)', revenue: 250000 },
    ];
    
    const [revenueChartData, setRevenueChartData] = useState(initialRevenueData);
    const [equipmentData, setEquipmentData] = useState([
        { type: 'Air Mover', deployed: 85, total: 150, utilization: 56 },
        { type: 'Dehumidifier', deployed: 20, total: 45, utilization: 44 },
        { type: 'HEPA Scrubber', deployed: 6, total: 15, utilization: 40 },
        { type: 'Heater', deployed: 2, total: 10, utilization: 20 }
    ]);
    
    // Subscribe to the global EventBus to visualize Field Telemetry
    useEffect(() => {
        const handleEvent = (e: CloudEvent) => {
            const readableMessage = interpretTelemetry(e as any);
            if (readableMessage) {
                // Ensure e.ui exists and has the message for rendering below
                const displayEvent = { ...e, ui: { ...e.ui, message: readableMessage } };
                setEvents(prev => [displayEvent, ...prev].slice(0, 15)); // Keep last 15 events
            }
        };
        const unsub = EventBus.on('*', handleEvent);
        return () => unsub();
    }, []);

    // Sync Service effect
    useEffect(() => {
        DashboardSyncService.start(3000); // Poll every 3 seconds for real-time visualization
        
        const unsubRev = EventBus.on('com.restorationai.sync.revenue', (e) => {
            if ((e.data as any)?.data) {
                setRevenueChartData((e.data as any).data);
            }
        });
        
        const unsubEq = EventBus.on('com.restorationai.sync.equipment', (e) => {
            if ((e.data as any)?.data) {
                setEquipmentData((e.data as any).data);
            }
        });
        
        return () => {
            unsubRev();
            unsubEq();
            DashboardSyncService.stop();
        };
    }, []);

    const displayedProjects = currentUser?.role === 'Technician' 
        ? projects.filter(l => 
            l.assignedTeam?.some(member => 
                member.toLowerCase() === currentUser.name.toLowerCase() || 
                member === currentUser.id
            )
          )
        : projects;

    const totalProjects = displayedProjects.length;
    const activeProjects = displayedProjects.filter(p => p.status?.toLowerCase().includes('active') || p.status?.toLowerCase().includes('drying')).length;
    const totalRevenue = displayedProjects.reduce((sum, p) => sum + p.totalCost, 0);
    const totalBudget = displayedProjects.reduce((sum, p) => sum + (p.budget || 0), 0);
    const budgetVariance = totalRevenue - totalBudget;

    const projectsByStatus = displayedProjects.reduce((acc, p) => {
        const status = p.currentStage || 'Intake';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const statusChartData = Object.keys(projectsByStatus).map(key => ({ name: key, projects: projectsByStatus[key] }));

    const activeProjectsList = displayedProjects.filter(p => p.status?.toLowerCase().includes('active') || p.status?.toLowerCase().includes('drying'));

    // 2. SLA & Compliance Exceptions
    const exceptions = displayedProjects.flatMap(p => {
        const issues = [];
        if (p.status?.toLowerCase().includes('active') || p.status?.toLowerCase().includes('drying')) {
            // Check for missing daily logs (mock logic: if no logs in last 24h)
            const hasRecentLog = p.dailyNarratives && p.dailyNarratives.length > 0; // Simplified for demo
            if (!hasRecentLog) {
                issues.push({ id: `${p.id}-log`, projectId: p.id, client: p.client, issue: 'Missing Daily Log (>24h)', severity: 'high' });
            }
            
            // Check for high moisture persisting (mock logic)
            const hasHighMoisture = p.dryingMonitor?.some(m => m.status === 'Wet' && m.readings.length > 3);
            if (hasHighMoisture) {
                issues.push({ id: `${p.id}-moisture`, projectId: p.id, client: p.client, issue: 'Stubborn Moisture (Day 4+)', severity: 'medium' });
            }

            // Check compliance
            if (p.complianceChecks?.asbestos === 'pending') {
                issues.push({ id: `${p.id}-asbestos`, projectId: p.id, client: p.client, issue: 'Asbestos Results Pending', severity: 'medium' });
            }
        }
        return issues;
    });

    // 3. Crew Status (Mock)
    const crews = [
        { id: 'C1', name: 'Alpha Team (Water)', status: 'On Site', project: 'Smith Residence', eta: null },
        { id: 'C2', name: 'Bravo Team (Mold)', status: 'En Route', project: 'Johnson Commercial', eta: '15 min' },
        { id: 'C3', name: 'Charlie Team (Demo)', status: 'Available', project: null, eta: null },
        { id: 'C4', name: 'Delta Team (Water)', status: 'On Site', project: 'Williams Estate', eta: null },
    ];

    // Removed unused tag management code

    return (
        <div className="flex h-full">
            {/* Main Dashboard Area */}
            <div className="flex-1 p-8 space-y-8 overflow-y-auto">
                <header className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight">Mission Control</h1>
                        <p className="text-slate-400 font-medium">Field Operations & Financial Intelligence</p>
                    </div>
                    {notificationPermission === 'default' && (
                        <motion.div 
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-4 p-4 rounded-2xl bg-brand-cyan/10 border border-brand-cyan/20 backdrop-blur-md"
                        >
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-brand-cyan uppercase tracking-widest">Notification Sync Requested</span>
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Enable high-priority field signals</span>
                            </div>
                            <button 
                                onClick={() => requestNotificationPermission()}
                                className="px-4 py-2 bg-brand-cyan text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                            >
                                Authorize
                            </button>
                        </motion.div>
                    )}
                </header>

                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <KpiCard 
                        icon={<Briefcase />} 
                        title="Active Jobs" 
                        value={activeProjects.toString()} 
                        subtitle={`${totalProjects} total files`} 
                        onClick={() => { setSelectedProjectId(null); setActiveTab('losses'); }}
                    />
                    <KpiCard 
                        icon={<DollarSign />} 
                        title="Revenue (Q4)" 
                        value={`$${(totalRevenue / 1000).toFixed(1)}k`} 
                        positive={true} 
                        onClick={() => setActiveTab('billing')}
                    />
                    <KpiCard
                        icon={budgetVariance > 0 ? <TrendingUp /> : <TrendingDown />}
                        title="Budget Delta"
                        value={`$${(Math.abs(budgetVariance) / 1000).toFixed(1)}k`}
                        subtitle={budgetVariance > 0 ? 'Under Budget' : 'Over Budget'}
                        positive={budgetVariance >= 0}
                        onClick={() => setActiveTab('reporting')}
                    />
                    <KpiCard 
                        icon={<Fan />} 
                        title="Equip. Deployed" 
                        value={equipmentData.reduce((acc, eq) => acc + eq.deployed, 0).toString()} 
                        subtitle={`${equipmentData.reduce((acc, eq) => acc + eq.total, 0)} total units`} 
                        onClick={() => setActiveTab('inventory')}
                    />
                </section>

                <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Equipment Utilization */}
                    <div className="glass-card rounded-2xl p-6 border border-white/5">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold text-white flex items-center gap-2"><Activity size={18} className="text-brand-cyan" /> Equipment Utilization</h3>
                        </div>
                        <div className="space-y-5">
                            {equipmentData.map(eq => (
                                <div key={eq.type}>
                                    <div className="flex justify-between text-xs mb-1.5">
                                        <span className="text-slate-300 font-medium">{eq.type}</span>
                                        <span className="text-slate-500 font-mono">{eq.deployed} / {eq.total}</span>
                                    </div>
                                    <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                                        <div 
                                            className={`h-full rounded-full ${eq.utilization > 85 ? 'bg-red-500' : eq.utilization > 60 ? 'bg-amber-500' : 'bg-brand-cyan'}`} 
                                            style={{ width: `${Math.min(eq.utilization, 100)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* SLA & Compliance Exceptions */}
                    <div className="glass-card rounded-2xl p-6 border border-white/5">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold text-white flex items-center gap-2"><ShieldAlert size={18} className="text-amber-500" /> SLA Exceptions</h3>
                            <span className="bg-amber-500/20 text-amber-400 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">{exceptions.length} Alerts</span>
                        </div>
                        <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                            {exceptions.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 flex flex-col items-center">
                                    <CheckCircle2 size={32} className="text-emerald-500/50 mb-2" />
                                    <p className="text-xs">All SLAs met. No exceptions.</p>
                                </div>
                            ) : (
                                exceptions.map(exc => (
                                    <div key={exc.id} className="p-3 bg-slate-900/50 rounded-xl border border-white/5 flex items-start justify-between group cursor-pointer hover:bg-white/5 transition-colors" onClick={() => onProjectSelect(exc.projectId)}>
                                        <div>
                                            <p className="text-xs font-bold text-white mb-0.5">{exc.client}</p>
                                            <p className={`text-[10px] font-medium ${exc.severity === 'high' ? 'text-red-400' : 'text-amber-400'}`}>{exc.issue}</p>
                                        </div>
                                        <ChevronRight size={14} className="text-slate-600 group-hover:text-brand-cyan" />
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Crew Status */}
                    <div className="glass-card rounded-2xl p-6 border border-white/5">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold text-white flex items-center gap-2"><Users size={18} className="text-blue-400" /> Crew Dispatch</h3>
                            <button onClick={() => setActiveTab('crew-dispatch')} className="text-[10px] font-black uppercase text-brand-cyan hover:text-white transition-colors">View All</button>
                        </div>
                        <div className="space-y-3">
                            {crews.map(crew => (
                                <motion.div 
                                    key={crew.id} 
                                    whileHover={{ x: 4 }}
                                    className="p-3 bg-slate-900/50 rounded-xl border border-white/5 flex items-center justify-between cursor-pointer hover:bg-white/5 hover:border-[#00d4aa]/30 transition-all group"
                                    onClick={() => setActiveTab('crew-dispatch')}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${crew.status === 'Available' ? 'bg-emerald-500' : crew.status === 'En Route' ? 'bg-amber-500' : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'}`} />
                                        <div>
                                            <p className="text-xs font-bold text-white group-hover:text-[#00d4aa] transition-colors">{crew.name}</p>
                                            <p className="text-[10px] text-slate-500 font-medium">{crew.status} {crew.project ? `• ${crew.project}` : ''}</p>
                                        </div>
                                    </div>
                                    {crew.eta ? (
                                        <div className="flex items-center gap-1 text-[10px] text-amber-400 font-black bg-amber-400/10 px-2 py-1 rounded border border-amber-400/20">
                                            <Clock size={10} /> {crew.eta}
                                        </div>
                                    ) : (
                                        <ChevronRight size={14} className="text-slate-700 group-hover:text-white transition-colors" />
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    <div className="lg:col-span-2 glass-card rounded-2xl p-6 border border-white/5">
                        <h3 className="font-bold text-white mb-4">Pipeline Status</h3>
                        <div className="h-64">
                             <ResponsiveContainer width="99%" height="100%">
                                <BarChart data={statusChartData} layout="vertical" margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={80} />
                                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.02)' }} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.5rem', color: '#fff' }} />
                                    <Bar dataKey="projects" fill="#06b6d4" radius={[0, 4, 4, 0]} barSize={24} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="lg:col-span-3 glass-card rounded-2xl p-6 border border-white/5">
                         <h3 className="font-bold text-white mb-4">Revenue Trajectory</h3>
                         <div className="h-64">
                            <ResponsiveContainer width="99%" height="100%">
                                <LineChart data={revenueChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} axisLine={false} tickLine={false} />
                                    <YAxis stroke="#64748b" fontSize={12} tickFormatter={(val) => `$${val/1000}k`} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.5rem', color: '#fff' }} />
                                    <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{r: 4, fill: '#3b82f6'}} activeDot={{r: 6, fill: '#fff'}} />
                                </LineChart>
                            </ResponsiveContainer>
                         </div>
                    </div>
                </section>

                <section className="mt-8">
                    <AggregateMoistureTrends projects={displayedProjects} />
                </section>
                
                <section className="mt-8">
                    <HistoricalPredictiveModel projects={displayedProjects} />
                </section>
                
                <section className="mt-8">
                    <div className="glass-card rounded-2xl p-6 border border-white/5">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold text-white flex items-center gap-2"><Briefcase size={18} className="text-brand-cyan" /> Active Projects</h3>
                            <span className="text-xs text-slate-400">{activeProjectsList.length} Active</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-white/5 text-xs text-slate-400 uppercase tracking-wider">
                                        <th className="py-3 px-4 font-medium">Project / Client</th>
                                        <th className="py-3 px-4 font-medium">Risk Level</th>
                                        <th className="py-3 px-4 font-medium">Stage</th>
                                        <th className="py-3 px-4 font-medium">Crew</th>
                                        <th className="py-3 px-4 font-medium">Equipment</th>
                                        <th className="py-3 px-4 font-medium">Timeline</th>
                                        <th className="py-3 px-4 font-medium">Alerts</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {activeProjectsList.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="py-8 text-center text-slate-500">
                                                <Briefcase size={32} className="mx-auto mb-2 opacity-20" />
                                                <p className="text-xs">No active projects found.</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        activeProjectsList.map(p => {
                                            const crew = crews.find(c => c.project === p.client) || { name: 'Unassigned' };
                                            const eqCount = p.equipment?.filter(e => e.status === 'Running').length || 0;
                                            const projectAlerts = exceptions.filter(e => e.projectId === p.id);
                                            // Mock estimating pipeline
                                            const startDate = p.startDate ? new Date(p.startDate) : new Date();
                                            // Fallback days running just for visual data since we're using mock data that didn't provide dates frequently
                                            const daysRunning = p.startDate ? Math.floor((new Date().getTime() - startDate.getTime()) / (1000 * 3600 * 24)) : p.id === 'proj-1' ? 2 : 5;
                                            const phaseEstimateDays = p.currentStage === 'Monitor' ? 4 : (p.currentStage === 'Intake' ? 1 : 2);
                                            const scheduleStatus = daysRunning > phaseEstimateDays ? 'Behind' : 'On Track';
                                            
                                            // Determine risk colors
                                            const getRiskColor = (level: string) => {
                                                switch(level) {
                                                    case 'high': return 'text-red-400 bg-red-400/10 border-red-400/20';
                                                    case 'medium': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
                                                    case 'low': return 'text-green-400 bg-green-400/10 border-green-400/20';
                                                    default: return 'text-slate-400 bg-slate-800 border-slate-700';
                                                }
                                            };

                                            return (
                                                <tr key={p.id} className="hover:bg-white/5 transition-colors cursor-pointer group" onClick={() => onProjectSelect(p.id)}>
                                                    <td className="py-3 px-4">
                                                        <p className="text-sm font-bold text-slate-200">{p.client}</p>
                                                        <p className="text-xs text-slate-500">{p.address}</p>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className={`border px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${getRiskColor(p.riskLevel || 'low')}`}>
                                                            {p.riskLevel || 'LOW'}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className="bg-slate-900 border border-white/10 px-2 py-1 rounded text-xs text-slate-300 font-medium">
                                                            {p.currentStage}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-sm text-slate-300">{crew.name}</td>
                                                    <td className="py-3 px-4 text-sm text-slate-300">
                                                        {eqCount} running
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="flex flex-col gap-1 w-32">
                                                            <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                                                                <span>Day {daysRunning}</span>
                                                                <span>Est. {phaseEstimateDays} Days</span>
                                                            </div>
                                                            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5">
                                                                <div 
                                                                    className={`h-full rounded-full ${scheduleStatus === 'Behind' ? 'bg-red-500' : 'bg-brand-cyan'}`} 
                                                                    style={{ width: `${Math.min((daysRunning / phaseEstimateDays) * 100, 100)}%` }}
                                                                />
                                                            </div>
                                                            <p className={`text-[10px] font-bold ${scheduleStatus === 'Behind' ? 'text-amber-400' : 'text-emerald-400'}`}>{scheduleStatus}</p>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        {projectAlerts.length > 0 ? (
                                                            <div className="flex -space-x-1">
                                                                {projectAlerts.map(a => (
                                                                    <div key={a.id} className={`w-6 h-6 rounded-full flex items-center justify-center border-2 border-[#0f172a] ${a.severity === 'high' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`} title={a.issue}>
                                                                        <AlertTriangle size={12} />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-600 text-xs">None</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            </div>

            {/* Right Sidebar: Live EventArc Feed */}
            <aside className={`absolute xl:relative right-0 h-full border-l border-white/5 bg-slate-950 flex flex-col transition-all duration-300 z-40 xl:z-0 shadow-2xl xl:shadow-none ${isSidebarCollapsed ? 'w-0 border-l-0' : 'w-80 md:w-96'}`}>
                {/* Collapse Toggle */}
                <button 
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
                    className={`absolute top-6 w-6 h-6 bg-slate-800 rounded-full border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors z-30 ${isSidebarCollapsed ? '-left-9' : '-left-3'}`}
                >
                    {isSidebarCollapsed ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
                </button>

                <div className={`flex flex-col flex-1 overflow-hidden transition-opacity duration-300 ${isSidebarCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
                    <div className="p-6 border-b border-white/5 bg-slate-900/50 flex-shrink-0">
                        <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <Radio size={16} className="text-red-500 animate-pulse" /> Live Telemetry
                        </h2>
                        <p className="text-[10px] text-slate-500 mt-1 font-mono">EventArc Stream • {events.length} Events</p>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {events.length === 0 && (
                            <div className="text-center py-10 opacity-30">
                                <Activity size={32} className="mx-auto mb-2" />
                                <p className="text-xs">Waiting for field signals...</p>
                            </div>
                        )}
                        
                        {events.map((e) => {
                            const isWarning = e.ui?.level === 'warning' || e.ui?.level === 'error';
                            const isSuccess = e.ui?.level === 'success';
                            
                            return (
                                <div key={e.id} className={`p-4 rounded-xl border relative overflow-hidden group animate-in slide-in-from-right duration-300 ${isWarning ? 'bg-red-500/5 border-red-500/20' : 'bg-white/5 border-white/5 hover:border-white/10'}`}>
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${isWarning ? 'bg-red-500/20 text-red-400' : isSuccess ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                            {e.type.split('.').pop()}
                                        </span>
                                        <span className="text-[9px] text-slate-600 font-mono">{new Date(e.time).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-xs font-medium text-slate-200 leading-relaxed mb-2">{e.ui?.message}</p>
                                    
                                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                                        <span className="truncate max-w-[150px]">{e.subject || e.source}</span>
                                        {(e.data as Record<string, unknown>)?.projectId && (
                                            <button onClick={() => onProjectSelect((e.data as Record<string, unknown>).projectId as string)} className="flex items-center text-brand-cyan hover:text-white transition-colors">
                                                View <ChevronRight size={10} />
                                            </button>
                                        )}
                                    </div>
                                    {isWarning && <div className="absolute top-0 right-0 p-2"><AlertTriangle size={12} className="text-red-500" /></div>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </aside>
        </div>
    );
};

const KpiCard: React.FC<{ icon: React.ReactNode, title: string, value: string, subtitle?: string, positive?: boolean, onClick?: () => void }> = ({ icon, title, value, subtitle, positive, onClick }) => (
    <motion.button 
        whileHover={{ y: -4, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        className="glass-card rounded-2xl p-5 border border-white/5 bg-gradient-to-b from-white/5 to-transparent text-left w-full transition-all hover:border-[#00d4aa]/30 focus:outline-none focus:ring-1 focus:ring-[#00d4aa]/40"
    >
        <div className="flex items-center space-x-3 mb-3">
            <div className="p-2 bg-slate-900 rounded-lg text-slate-400 border border-white/5 group-hover:text-[#00d4aa] transition-colors">{icon}</div>
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">{title}</h4>
        </div>
        <p className="text-3xl font-black text-white tracking-tight leading-none mb-1">{value}</p>
        {subtitle && <p className={`text-[10px] font-black uppercase tracking-tight mt-1 ${positive === true ? 'text-emerald-400' : positive === false ? 'text-red-400' : 'text-slate-500'}`}>{subtitle}</p>}
    </motion.button>
);

export default DesktopDashboard;
