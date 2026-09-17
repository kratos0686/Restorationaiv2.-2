import React, { useState, useEffect, useMemo } from 'react';
import { 
    Activity, AlertCircle, CheckCircle2, ChevronRight,
    Map as MapIcon, List, UserPlus, Phone, MoreHorizontal,
    Navigation, ExternalLink, Shield, Settings2, Clock, Search, MapPin
} from 'lucide-react';
import { Project, User } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAppContext } from '../context/AppContext';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || "";
const hasValidKey = Boolean(GOOGLE_MAPS_API_KEY) && GOOGLE_MAPS_API_KEY !== 'YOUR_API_KEY';

interface CrewDispatchProps {
    projects: Project[];
}

interface CrewMember extends User {
    status: 'Available' | 'On Job' | 'Off Duty';
    currentLocation?: { lat: number; lng: number; address: string };
    activeJobId?: string;
}

// Marker component with InfoWindow
const TechnicianMarker = ({ crew, project }: { crew: CrewMember, project?: Project }) => {
    const [markerRef, marker] = useAdvancedMarkerRef();
    const [infoWindowShown, setInfoWindowShown] = useState(false);

    if (!crew.currentLocation) return null;

    return (
        <>
            <AdvancedMarker
                ref={markerRef}
                position={{ lat: crew.currentLocation.lat, lng: crew.currentLocation.lng }}
                onClick={() => setInfoWindowShown(true)}
            >
                <Pin 
                    background={crew.status === 'On Job' ? '#f97316' : '#00d4aa'} 
                    borderColor="#0f172a" 
                    glyphColor="#fff"
                />
            </AdvancedMarker>

            {infoWindowShown && (
                <InfoWindow anchor={marker} onCloseClick={() => setInfoWindowShown(false)}>
                    <div className="p-2 min-w-[200px] text-slate-900 font-sans">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold">
                                {crew.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div>
                                <p className="text-sm font-bold leading-tight">{crew.name}</p>
                                <p className={`text-[10px] font-bold uppercase ${crew.status === 'On Job' ? 'text-orange-500' : 'text-[#00d4aa]'}`}>
                                    {crew.status}
                                </p>
                            </div>
                        </div>
                        {project && (
                            <div className="mt-2 pt-2 border-t border-slate-100">
                                <p className="text-[10px] text-slate-500 font-black uppercase mb-1">Active Assignment</p>
                                <p className="text-xs font-bold">{project.client}</p>
                                <p className="text-[10px] text-slate-400">{project.address}</p>
                            </div>
                        )}
                        <div className="flex gap-2 mt-3">
                            <button className="flex-1 py-1.5 bg-slate-900 text-white rounded text-[10px] font-bold">Dispatch</button>
                            <button className="px-2 py-1.5 bg-slate-100 rounded text-slate-600">
                                <Phone size={12} />
                            </button>
                        </div>
                    </div>
                </InfoWindow>
            )}
        </>
    );
};

const ProjectMarker = ({ project }: { project: Project }) => {
    const [markerRef, marker] = useAdvancedMarkerRef();
    const [infoWindowShown, setInfoWindowShown] = useState(false);

    // Stable seed-based random coordinates for demo
    const coords = useMemo(() => {
        // String hash for stable random offset
        const str = project.id || project.client || "";
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        const latOffset = ((Math.abs(hash) % 100) / 100 - 0.5) * 0.15;
        const lngOffset = ((Math.abs(hash >> 16) % 100) / 100 - 0.5) * 0.15;
        
        return {
            lat: 34.0522 + latOffset,
            lng: -118.2437 + lngOffset
        };
    }, [project.id, project.client]);

    return (
        <>
            <AdvancedMarker
                ref={markerRef}
                position={coords}
                onClick={() => setInfoWindowShown(true)}
            >
                <div className="w-6 h-6 bg-blue-500 rounded-lg flex items-center justify-center text-white shadow-xl border-2 border-white/20">
                    <MapPin size={14} />
                </div>
            </AdvancedMarker>

            {infoWindowShown && (
                <InfoWindow anchor={marker} onCloseClick={() => setInfoWindowShown(false)}>
                    <div className="p-2 min-w-[200px] text-slate-900 font-sans">
                        <p className="text-[10px] font-black text-blue-500 uppercase mb-1">Pending Loss</p>
                        <p className="text-sm font-bold">{project.client}</p>
                        <p className="text-[10px] text-slate-500 mb-2">{project.address}</p>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded w-fit">
                            <Clock size={10} /> 4h response goal
                        </div>
                        <button className="w-full mt-3 py-1.5 bg-blue-500 text-white rounded text-[10px] font-bold">Assign Technician</button>
                    </div>
                </InfoWindow>
            )}
        </>
    );
};

const CrewDispatch: React.FC<CrewDispatchProps> = ({ projects }) => {
    const { currentUser } = useAppContext();
    const [crews, setCrews] = useState<CrewMember[]>([]);
    const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchCrews = async () => {
            if (!currentUser?.companyId) return;
            
            try {
                const q = query(
                    collection(db, 'users'), 
                    where('companyId', '==', currentUser.companyId),
                    where('role', '==', 'Technician')
                );
                const querySnapshot = await getDocs(q);
                const crewData: CrewMember[] = [];
                
                querySnapshot.forEach((doc) => {
                    const data = doc.data() as User;
                    // Mock additional dispatch data for UI demo
                    crewData.push({
                        ...data,
                        status: Math.random() > 0.4 ? (Math.random() > 0.5 ? 'On Job' : 'Available') : 'Off Duty',
                        currentLocation: {
                            lat: 34.0522 + (Math.random() - 0.5) * 0.1,
                            lng: -118.2437 + (Math.random() - 0.5) * 0.1,
                            address: 'Mobile Unit ' + doc.id.substring(0, 4)
                        }
                    });
                });
                
                // If no real technicians found, use some high-quality mock replacements for visualization
                if (crewData.length === 0) {
                    const mockTechnicians: CrewMember[] = [
                        { id: 'tech1', name: 'Alex Rivera', email: 'alex@restoration.ai', role: 'Technician', companyId: currentUser.companyId, permissions: [], status: 'Available' },
                        { id: 'tech2', name: 'Sarah Chen', email: 'sarah@restoration.ai', role: 'Technician', companyId: currentUser.companyId, permissions: [], status: 'On Job', activeJobId: projects[0]?.id },
                        { id: 'tech3', name: 'Mike Miller', email: 'mike@restoration.ai', role: 'Technician', companyId: currentUser.companyId, permissions: [], status: 'Available' },
                        { id: 'tech4', name: 'Jordan Smith', email: 'jordan@restoration.ai', role: 'Technician', companyId: currentUser.companyId, permissions: [], status: 'Off Duty' },
                    ];
                    setCrews(mockTechnicians);
                } else {
                    setCrews(crewData);
                }
            } catch (error) {
                console.error("Error fetching crew:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchCrews();
    }, [currentUser, projects]);

    const unassignedProjects = projects.filter(p => !p.assignedTeam || p.assignedTeam.length === 0);
    const assignedProjects = projects.filter(p => p.assignedTeam && p.assignedTeam.length > 0);

    const filteredCrews = crews.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!hasValidKey) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-slate-950 p-8 text-center">
                <div className="max-w-md w-full bg-slate-900 border border-white/10 p-10 rounded-[32px] shadow-2xl">
                    <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <MapIcon className="text-blue-400" size={32} />
                    </div>
                    <h2 className="text-2xl font-black text-white mb-4 tracking-tight">Interactive Map Required</h2>
                    <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                        To enable real-time field monitoring and interactive dispatch, please add your Google Maps Platform API Key.
                    </p>
                    
                    <div className="text-left space-y-4 mb-8">
                        <div className="flex gap-4">
                            <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400">1</div>
                            <p className="text-xs text-slate-300 font-medium">Get a key from <a href="https://console.cloud.google.com/google/maps-apis/start" target="_blank" rel="noopener" className="text-blue-400 underline">Google Cloud Console</a></p>
                        </div>
                        <div className="flex gap-4">
                            <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400">2</div>
                            <p className="text-xs text-slate-300 font-medium">Add to AI Studio Secrets as <code className="bg-black/40 px-1.5 py-0.5 rounded text-blue-300 font-mono">GOOGLE_MAPS_PLATFORM_KEY</code></p>
                        </div>
                    </div>

                    <button 
                        onClick={() => window.location.reload()}
                        className="w-full py-4 bg-white text-slate-950 font-black rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2 group"
                    >
                         Continue Setup <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                    
                    <p className="text-[10px] text-slate-600 mt-6 font-bold uppercase tracking-widest">App rebuilds automatically</p>
                </div>
            </div>
        );
    }

    return (
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
            <div className="flex h-full bg-slate-950 text-slate-200 overflow-hidden font-sans selection:bg-[#00d4aa]/30">
                {/* Left Sidebar - Crews */}
                <div className="w-80 border-r border-white/5 bg-slate-900/30 flex flex-col relative z-20 shadow-2xl">
                    <div className="p-6 border-b border-white/5 bg-slate-900/40">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-[#00d4aa] animate-pulse" />
                                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Field Assets</h2>
                            </div>
                            <button className="p-1.5 bg-white/5 hover:bg-[#00d4aa]/10 rounded-lg transition-all text-slate-500 hover:text-[#00d4aa] border border-white/5 hover:border-[#00d4aa]/20 active:scale-95">
                                <UserPlus size={14} />
                            </button>
                        </div>
                        <div className="relative group">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-[#00d4aa] transition-colors" />
                            <input 
                                type="text" 
                                placeholder="Locate asset..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-black/40 border border-white/5 rounded-xl pl-9 pr-4 py-2.5 text-xs focus:ring-1 focus:ring-[#00d4aa]/40 focus:outline-none transition-all placeholder:text-slate-700"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {isLoading ? (
                            [...Array(4)].map((_, i) => (
                                <div key={i} className="h-24 bg-white/5 rounded-3xl animate-pulse" />
                            ))
                        ) : filteredCrews.map((crew) => (
                            <motion.div 
                                key={crew.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="p-4 bg-slate-900/40 border border-white/5 rounded-[24px] hover:border-[#00d4aa]/40 hover:bg-[#00d4aa]/5 transition-all cursor-pointer group relative overflow-hidden"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white font-black text-sm border border-white/10 shadow-xl">
                                                {crew.name.split(' ').map(n => n[0]).join('')}
                                            </div>
                                            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-[3px] border-slate-900 group-hover:border-[#00d4aa]/10 transition-colors ${
                                                crew.status === 'Available' ? 'bg-[#00d4aa]' : 
                                                crew.status === 'On Job' ? 'bg-orange-500' : 'bg-slate-600'
                                            }`} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-slate-200 group-hover:text-white tracking-tight leading-none mb-1.5">{crew.name}</p>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{crew.status}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button className="text-slate-700 hover:text-white transition-colors">
                                        <MoreHorizontal size={14} />
                                    </button>
                                </div>
                                
                                {crew.status === 'On Job' ? (
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-tighter">
                                            <span className="text-slate-500">Utilization</span>
                                            <span className="text-orange-400">High Load</span>
                                        </div>
                                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                            <motion.div 
                                                initial={{ width: 0 }}
                                                animate={{ width: '85%' }}
                                                className="h-full bg-gradient-to-r from-orange-600 to-orange-400" 
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 px-2 py-1.5 bg-orange-500/5 rounded-lg border border-orange-500/10">
                                            <Navigation size={10} className="text-orange-500" />
                                            <span className="text-[9px] font-bold text-orange-200/60 truncate">Heading to Main St Loss</span>
                                        </div>
                                    </div>
                                ) : crew.status === 'Available' ? (
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-tighter">
                                            <span className="text-slate-500">Ready State</span>
                                            <span className="text-[#00d4aa]">Available</span>
                                        </div>
                                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                            <div className="h-full bg-[#00d4aa]/30 w-full" />
                                        </div>
                                        <button className="w-full py-2 bg-[#00d4aa] hover:bg-[#00eab9] text-slate-950 text-[10px] font-black rounded-xl transition-all active:scale-95">
                                            DISPATCH UNIT
                                        </button>
                                    </div>
                                ) : (
                                    <div className="opacity-40">
                                        <div className="h-1 bg-slate-800 rounded-full w-full" />
                                        <p className="text-[9px] font-bold text-slate-600 mt-2 uppercase tracking-widest text-center">Terminal Inactive</p>
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Main Board Area */}
                <div className="flex-1 flex flex-col relative overflow-hidden">
                    {/* Mission Control Top Bar */}
                    <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-slate-900/40 backdrop-blur-2xl relative z-10">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-brand-cyan/10 rounded-2xl border border-brand-cyan/20">
                                    <Shield className="text-brand-cyan" size={24} />
                                </div>
                                <div>
                                    <h1 className="text-xl font-black text-white tracking-tighter uppercase italic">
                                        Command Center
                                    </h1>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-[#00d4aa] animate-pulse" />
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Live Operation Feed</p>
                                    </div>
                                </div>
                            </div>

                            {/* View Switch HUD */}
                            <div className="h-10 p-1 bg-black/40 rounded-2xl border border-white/5 flex items-center gap-1">
                                <button 
                                    onClick={() => setViewMode('list')}
                                    className={`flex items-center h-full px-5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'list' ? 'bg-[#00d4aa] text-slate-950 shadow-[0_0_20px_rgba(0,212,170,0.3)]' : 'text-slate-500 hover:text-white'}`}
                                >
                                    <List size={14} className="mr-2" /> Timeline
                                </button>
                                <button 
                                    onClick={() => setViewMode('map')}
                                    className={`flex items-center h-full px-5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'map' ? 'bg-[#00d4aa] text-slate-950 shadow-[0_0_20px_rgba(0,212,170,0.3)]' : 'text-slate-500 hover:text-white'}`}
                                >
                                    <MapIcon size={14} className="mr-2" /> Field Map
                                </button>
                            </div>
                        </div>

                        {/* Field Vitals HUD */}
                        <div className="flex items-center gap-4">
                            <div className="flex gap-1.5">
                                {[
                                    { label: 'Util', val: '78%', color: 'text-[#00d4aa]' },
                                    { label: 'Resp', val: '14m', color: 'text-brand-cyan' },
                                    { label: 'Jobs', val: '24', color: 'text-orange-400' }
                                ].map((stat, i) => (
                                    <div key={i} className="px-4 py-2 bg-white/5 rounded-2xl border border-white/10 text-center min-w-[70px]">
                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">{stat.label}</p>
                                        <p className={`text-sm font-black ${stat.color}`}>{stat.val}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="h-10 w-px bg-white/5 mx-2" />
                            <div className="w-10 h-10 rounded-2xl border border-white/10 hover:bg-white/5 flex items-center justify-center text-slate-400 cursor-pointer transition-all">
                                <Settings2 size={18} />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden relative">
                        <AnimatePresence mode="wait">
                            {viewMode === 'list' ? (
                                <motion.div 
                                    key="list"
                                    initial={{ opacity: 0, scale: 1.01 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.99 }}
                                    className="h-full flex overflow-hidden p-6 gap-6"
                                >
                                    {/* Unassigned Pool - The 'Incoming Radar' */}
                                    <div className="w-[420px] flex flex-col bg-slate-900/40 border border-white/5 rounded-[40px] overflow-hidden shadow-2xl">
                                        <div className="p-8 border-b border-white/5 bg-slate-900/60 backdrop-blur-xl">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                                                        <AlertCircle size={20} className="text-orange-500" />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-sm font-black text-white uppercase tracking-wider">Unassigned Radar</h3>
                                                        <p className="text-[10px] font-bold text-slate-500 italic">Potential Losses detected</p>
                                                    </div>
                                                </div>
                                                <span className="text-[10px] font-black bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full border border-orange-500/20 animate-pulse">{unassignedProjects.length} NEW</span>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                                            {unassignedProjects.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center h-full text-center p-10">
                                                    <div className="w-16 h-16 rounded-full bg-[#00d4aa]/10 flex items-center justify-center mb-4 border border-[#00d4aa]/20">
                                                        <CheckCircle2 size={32} className="text-[#00d4aa]/40" />
                                                    </div>
                                                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Clear Skies</p>
                                                </div>
                                            ) : unassignedProjects.map((project, i) => (
                                                <motion.div 
                                                    key={project.id}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: i * 0.05 }}
                                                    className="p-5 bg-slate-900 border border-white/5 rounded-3xl hover:border-brand-cyan/30 hover:bg-brand-cyan/5 transition-all cursor-grab active:cursor-grabbing group relative"
                                                >
                                                    <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <ExternalLink size={12} className="text-slate-600" />
                                                    </div>
                                                    <div className="mb-4">
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <h4 className="text-sm font-black text-slate-200 group-hover:text-white tracking-tight italic">{project.client}</h4>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${project.riskLevel === 'high' ? 'bg-red-500' : 'bg-orange-400'}`} />
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 font-bold truncate tracking-wide">{project.address}</p>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-black tracking-widest">
                                                                <Clock size={10} className="text-slate-600" /> {project.lossDate || 'ASAP'}
                                                            </div>
                                                        </div>
                                                        <div className="px-3 py-1 bg-slate-800 rounded-lg text-[8px] font-black text-brand-cyan border border-white/5 uppercase">
                                                            {project.currentStage}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Mission Grid View */}
                                    <div className="flex-1 flex flex-col bg-slate-900/20 border border-white/5 rounded-[40px] overflow-hidden">
                                        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-slate-900/40">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-brand-cyan/10 flex items-center justify-center border border-brand-cyan/20">
                                                    <Activity size={24} className="text-brand-cyan" />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-black text-white uppercase tracking-widest leading-none mb-1.5">Sector Activity</h3>
                                                    <p className="text-[10px] font-bold text-slate-500 italic">Assigned team synchronization</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <div className="px-4 py-2 bg-black/40 rounded-xl border border-white/10 flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-[#00d4aa]" />
                                                    <span className="text-[9px] font-black text-white tracking-tighter uppercase">Active Stream</span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                                {assignedProjects.length === 0 ? (
                                                    <div className="col-span-full h-full flex flex-col items-center justify-center p-20 opacity-20 border-2 border-dashed border-white/10 rounded-[40px]">
                                                        <Navigation size={48} className="mb-4" />
                                                        <p className="text-xs font-black uppercase tracking-[0.3em]">No Active Operations</p>
                                                    </div>
                                                ) : assignedProjects.map(project => (
                                                    <motion.div 
                                                        key={project.id} 
                                                        whileHover={{ scale: 1.02 }}
                                                        className="bg-slate-900/60 border border-white/10 rounded-[32px] overflow-hidden hover:border-brand-cyan/30 transition-all group shadow-xl"
                                                    >
                                                        <div className="p-6">
                                                            <div className="flex justify-between items-start mb-6">
                                                                <div>
                                                                    <div className="flex items-center gap-3 mb-2">
                                                                        <h4 className="text-lg font-black text-white italic tracking-tighter">{project.client}</h4>
                                                                        <span className="px-2 py-0.5 bg-[#00d4aa]/10 text-[#00d4aa] text-[8px] font-black rounded border border-[#00d4aa]/20 tracking-widest">LIVE</span>
                                                                    </div>
                                                                    <p className="text-[10px] text-slate-500 font-bold">{project.address}</p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div className="flex -space-x-2 justify-end mb-2">
                                                                        {project.assignedTeam?.map((member, i) => (
                                                                            <div key={i} className="w-8 h-8 rounded-xl bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-[10px] font-black text-slate-400 capitalize">
                                                                                {member[0]}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                    <p className="text-[8px] font-black uppercase text-slate-600 tracking-widest">Active Personnel</p>
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="grid grid-cols-2 gap-4 mb-6">
                                                                <div className="p-4 bg-black/30 rounded-2xl border border-white/5">
                                                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Cycle Start</p>
                                                                    <p className="text-xs font-black text-white font-mono">08:30:45</p>
                                                                </div>
                                                                <div className="p-4 bg-black/30 rounded-2xl border border-white/5">
                                                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Efficiency</p>
                                                                    <p className="text-xs font-black text-brand-cyan">94.2%</p>
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="space-y-2">
                                                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tighter">
                                                                    <span className="text-slate-500">Operation Progress</span>
                                                                    <span className="text-brand-cyan">4 / 12 Milestones completed</span>
                                                                </div>
                                                                <div className="h-2 bg-black/40 rounded-full overflow-hidden p-0.5">
                                                                    <motion.div 
                                                                        initial={{ width: 0 }}
                                                                        animate={{ width: '35%' }}
                                                                        className="h-full bg-gradient-to-r from-brand-cyan to-blue-500 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.4)]" 
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="px-6 py-4 bg-slate-950/40 border-t border-white/5 flex items-center justify-between">
                                                            <button className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors flex items-center gap-2 group/btn">
                                                                <List size={14} className="group-hover/btn:text-brand-cyan transition-colors" /> Detail Feed
                                                            </button>
                                                            <button className="px-5 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border border-white/10">
                                                                Connect Team
                                                            </button>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div 
                                    key="map"
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 1.02 }}
                                    className="h-full relative overflow-hidden bg-slate-950 p-6 flex gap-6"
                                >
                                    <div className="flex-1 relative rounded-[40px] overflow-hidden border border-white/10 shadow-2xl">
                                        <Map
                                            defaultCenter={{ lat: 34.0522, lng: -118.2437 }}
                                            defaultZoom={11}
                                            mapId="DEMO_MAP_ID"
                                            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                                            style={{ width: '100%', height: '100%' }}
                                            disableDefaultUI={true}
                                        >
                                            {/* Technician Markers */}
                                            {crews.filter(c => c.status !== 'Off Duty').map(crew => (
                                                <TechnicianMarker 
                                                    key={crew.id} 
                                                    crew={crew} 
                                                    project={projects.find(p => p.id === crew.activeJobId)} 
                                                />
                                            ))}

                                            {/* Unassigned Project Markers */}
                                            {unassignedProjects.map(project => (
                                                <ProjectMarker key={project.id} project={project} />
                                            ))}
                                        </Map>

                                        {/* Floating Map Overlay */}
                                        <div className="absolute top-8 left-8 p-1 bg-slate-950/80 backdrop-blur-2xl border border-white/10 rounded-2xl flex gap-1 shadow-2xl">
                                            <button className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white rounded-xl transition-all">Satellite</button>
                                            <button className="px-5 py-2 text-[10px] font-black uppercase tracking-widest bg-white text-slate-950 rounded-xl shadow-xl">Topology</button>
                                        </div>

                                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-slate-950/90 backdrop-blur-2xl px-6 py-4 border border-white/10 rounded-3xl flex items-center gap-10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">
                                            <div className="flex items-center gap-3">
                                                <div className="w-2 h-2 rounded-full bg-[#00d4aa]" />
                                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Field Active</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="w-2 h-2 rounded-full bg-orange-500" />
                                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Operational</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Loss Point</p>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Right Pane - The 'Service Pulse' Feed */}
                <div className="w-80 border-l border-white/5 bg-slate-900/60 hidden 2xl:flex flex-col relative z-20">
                    <div className="p-8 border-b border-white/5">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">Service Pulse</h3>
                        <div className="space-y-6">
                            <div className="bg-slate-900/60 rounded-3xl p-5 border border-white/5 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-brand-cyan/5 -mr-8 -mt-8 rounded-full blur-2xl group-hover:bg-brand-cyan/10 transition-colors" />
                                <div className="flex gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-brand-cyan/10 flex items-center justify-center border border-brand-cyan/20">
                                        <Activity size={18} className="text-brand-cyan" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-white italic">Field Pulse</p>
                                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-[0.2em]">Global Sync</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {[
                                        { label: 'Dispatch Velocity', val: '92%' },
                                        { label: 'Asset Utilization', val: '78%' }
                                    ].map((s, i) => (
                                        <div key={i}>
                                            <div className="flex justify-between text-[9px] font-black uppercase mb-1.5 tracking-tighter">
                                                <span className="text-slate-500">{s.label}</span>
                                                <span className="text-brand-cyan">{s.val}</span>
                                            </div>
                                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                <motion.div 
                                                    initial={{ width: 0 }}
                                                    animate={{ width: s.val }}
                                                    className="h-full bg-brand-cyan" 
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                        <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">
                             Event Log <div className="w-1 h-1 rounded-full bg-slate-700" />
                        </h4>
                        <div className="space-y-8 relative">
                            <div className="absolute left-2 top-0 bottom-0 w-px bg-white/5" />
                            {[
                                { status: 'Alert', text: 'Hazard Warning: High moisture detected (95% RH) at Smith Residence.', time: '2m ago', active: true },
                                { status: 'Info', text: 'Log synced: Alex Rivera finalized moisture map for project 2209.', time: '14m ago', active: false },
                                { status: 'Fleet', text: 'Sarah Chen: Arrived at site Alpha, beginning thermal scan.', time: '24m ago', active: false },
                                { status: 'System', text: 'Automated job priority recalibrated based on storm arrival.', time: '1h ago', active: false },
                                { status: 'Alert', text: 'Critical Battery: Field Asset #441 reporting low power (15%).', time: '2h ago', active: false },
                            ].map((evt, i) => (
                                <div key={i} className={`relative pl-8 transition-all hover:translate-x-1 cursor-default group ${evt.active ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}>
                                    <div className={`absolute left-[5px] top-1.5 w-2 h-2 rounded-full border-2 border-slate-900 z-10 ${
                                        evt.status === 'Alert' ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 
                                        evt.status === 'Info' ? 'bg-[#00d4aa]' : 
                                        evt.status === 'Fleet' ? 'bg-brand-cyan' : 'bg-slate-600'
                                    }`} />
                                    <p className={`text-[9px] font-black uppercase tracking-[0.2em] mb-1.5 ${
                                        evt.status === 'Alert' ? 'text-red-400' : 
                                        evt.status === 'Info' ? 'text-[#00d4aa]' : 'text-slate-500'
                                    }`}>{evt.status}</p>
                                    <p className="text-xs font-semibold text-slate-300 leading-relaxed mb-1.5">{evt.text}</p>
                                    <span className="text-[10px] font-mono text-slate-600 italic tracking-tighter group-hover:text-slate-400 transition-colors">{evt.time}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </APIProvider>
    );
};

export default CrewDispatch;

