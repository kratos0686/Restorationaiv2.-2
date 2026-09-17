import React, { useState, useEffect } from 'react';
import { InventoryEquipment, Project } from '../types';
import { getInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, getProjects } from '../services/api';
import { Settings, Plus, Box, Search, Tag, History, MapPin, X, CheckCircle, Wrench, AlertTriangle } from 'lucide-react';
import { EventBus } from '../services/EventBus';
import { useAppContext } from '../context/AppContext';

const InventoryTracker: React.FC = () => {
    const { currentUser } = useAppContext();
    const [inventory, setInventory] = useState<InventoryEquipment[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    
    // Modals
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState<InventoryEquipment | null>(null);
    const [showHistoryModal, setShowHistoryModal] = useState<InventoryEquipment | null>(null);
    const [showAssignModal, setShowAssignModal] = useState<{item: InventoryEquipment, newStatus: InventoryEquipment['status']} | null>(null);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            const [invData, projData] = await Promise.all([
                getInventory(),
                getProjects(currentUser?.companyId)
            ]);
            setInventory(invData);
            setProjects(projData);
            setLoading(false);
        };
        void fetchAll();
    }, [currentUser?.companyId]);

    const handleAddItem = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        
        const newItem = {
            type: formData.get('type') as string,
            model: formData.get('model') as string,
            status: formData.get('status') as 'available' | 'in_use' | 'maintenance_needed',
            notes: formData.get('notes') as string,
            history: [{
                date: new Date().toISOString(),
                action: 'checked_in' as const,
                notes: 'Added to inventory'
            }]
        };

        const result = await addInventoryItem(newItem);
        if (result) {
            setInventory([...inventory, result]);
            setShowAddModal(false);
            EventBus.publish('com.restorationai.inventory.added', { id: result.id }, undefined, 'Equipment Added', 'success');
        }
    };

    const handleDeleteItem = async (id: string) => {
        if (!confirm('Are you sure you want to delete this item?')) return;
        const success = await deleteInventoryItem(id);
        if (success) {
            setInventory(inventory.filter(i => i.id !== id));
            setShowEditModal(null);
            EventBus.publish('com.restorationai.inventory.deleted', { id }, undefined, 'Equipment Deleted', 'info');
        }
    };

    const handleUpdateItem = async (id: string, updates: Partial<InventoryEquipment>) => {
        setInventory(inventory.map(i => i.id === id ? { ...i, ...updates } : i));
        await updateInventoryItem(id, updates);
        if (showEditModal && showEditModal.id === id) {
            setShowEditModal({ ...showEditModal, ...updates });
        }
    };

    const handleStatusChangeRequest = (item: InventoryEquipment, newStatus: InventoryEquipment['status']) => {
        if (item.status === newStatus) return;

        if (newStatus === 'in_use') {
            setShowAssignModal({ item, newStatus });
        } else if (item.status === 'in_use' && (newStatus === 'available' || newStatus === 'maintenance_needed')) {
            // Checking back in
            const historyEntry = {
                date: new Date().toISOString(),
                action: newStatus === 'maintenance_needed' ? 'maintenance' as const : 'checked_in' as const,
                projectId: item.currentProjectId,
                notes: `Returned from ${projects.find(p => p.id === item.currentProjectId)?.client || 'project'}`
            };
            const updates = {
                status: newStatus,
                currentProjectId: null as unknown as undefined, // clear project
                history: [...(item.history || []), historyEntry]
            };
            handleUpdateItem(item.id, updates);
            EventBus.publish('com.restorationai.inventory.checked_in', { id: item.id }, undefined, 'Equipment Checked In', 'success');
        } else {
            // General status change (e.g. maintenance to available)
            const historyEntry = {
                date: new Date().toISOString(),
                action: newStatus === 'maintenance_needed' ? 'maintenance' as const : 'checked_in' as const,
                notes: `Status changed to ${newStatus}`
            };
            handleUpdateItem(item.id, { status: newStatus, history: [...(item.history || []), historyEntry] });
            EventBus.publish('com.restorationai.inventory.updated', { id: item.id }, undefined, 'Status Updated', 'info');
        }
    };

    const handleAssignProject = (projectId: string) => {
        if (!showAssignModal) return;
        const { item, newStatus } = showAssignModal;
        const historyEntry = {
            date: new Date().toISOString(),
            action: 'checked_out' as const,
            projectId,
            notes: `Checked out to ${projects.find(p => p.id === projectId)?.client || 'project'}`
        };
        const updates = {
            status: newStatus,
            currentProjectId: projectId,
            history: [...(item.history || []), historyEntry]
        };
        handleUpdateItem(item.id, updates);
        setShowAssignModal(null);
        EventBus.publish('com.restorationai.inventory.checked_out', { id: item.id }, undefined, 'Equipment Dispatched', 'success');
    };

    const filteredInventory = inventory.filter(item => {
        if (filterStatus !== 'all' && item.status !== filterStatus) return false;
        if (search && !item.model.toLowerCase().includes(search.toLowerCase()) && !item.id.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const getStatusColor = (status: string) => {
        switch(status) {
            case 'available': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
            case 'in_use': return 'text-brand-cyan bg-brand-cyan/10 border-brand-cyan/20';
            case 'maintenance_needed': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
            default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
        }
    };

    return (
        <div className="p-8 h-full flex flex-col space-y-6 animate-fade-in max-w-7xl mx-auto">
            <header className="flex justify-between items-center bg-slate-900 border border-white/10 p-6 rounded-2xl shadow-xl">
                <div className="flex items-center space-x-4">
                    <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl">
                        <Box size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-white">Global Inventory</h1>
                        <p className="text-sm text-slate-400 font-medium mt-1">Manage, dispatch, and maintain equipment</p>
                    </div>
                </div>
                <button 
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center px-4 py-2 bg-brand-cyan hover:bg-cyan-400 text-slate-900 rounded-lg font-bold transition-all shadow-lg shadow-brand-cyan/20"
                >
                    <Plus size={18} className="mr-2" />
                    Add Equipment
                </button>
            </header>

            <div className="flex space-x-4 items-center">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Search by ID or Model..." 
                        className="w-full bg-slate-900 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-white font-medium focus:ring-2 focus:ring-brand-cyan focus:outline-none"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <select 
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="bg-slate-900 border border-white/10 text-white font-medium py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-cyan"
                >
                    <option value="all">All Statuses</option>
                    <option value="available">Available</option>
                    <option value="in_use">In Use</option>
                    <option value="maintenance_needed">Maintenance Needed</option>
                </select>
            </div>

            <div className="flex-1 bg-slate-900 border border-white/10 rounded-2xl shadow-xl overflow-hidden flex flex-col relative min-h-[400px]">
                {loading && (
                    <div className="absolute inset-0 z-10 flex flex-col justify-center items-center bg-slate-900/50 backdrop-blur-sm">
                         <div className="animate-spin w-8 h-8 border-4 border-brand-cyan border-t-transparent rounded-full mb-4"></div>
                         <p className="text-slate-400 font-medium uppercase tracking-widest text-xs">Loading Inventory</p>
                    </div>
                )}
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white/5 border-b border-white/10 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                                <th className="p-4">ID</th>
                                <th className="p-4">Model & Type</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">Assigned Project</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredInventory.map(item => (
                                <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center space-x-2">
                                            <Tag size={14} className="text-slate-500" />
                                            <span className="font-mono text-sm text-slate-300 font-bold">{item.id}</span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <p className="text-white font-bold">{item.model}</p>
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">{item.type}</p>
                                    </td>
                                    <td className="p-4">
                                        <select 
                                            value={item.status}
                                            onChange={(e) => handleStatusChangeRequest(item, e.target.value as 'available' | 'in_use' | 'maintenance_needed')}
                                            className={`text-xs font-bold px-2 py-1 rounded-md border appearance-none cursor-pointer focus:outline-none ${getStatusColor(item.status)}`}
                                        >
                                            <option value="available">Available</option>
                                            <option value="in_use">In Use</option>
                                            <option value="maintenance_needed">Maintenance</option>
                                        </select>
                                    </td>
                                    <td className="p-4">
                                        {item.status === 'in_use' && item.currentProjectId ? (
                                            <div className="flex items-center space-x-2">
                                                <MapPin size={14} className="text-blue-400" />
                                                <span className="text-xs text-blue-400 font-bold">
                                                    {projects.find(p => p.id === item.currentProjectId)?.client || 'Unknown'}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-slate-600 font-medium flex items-center">-</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end space-x-2">
                                            <button onClick={() => setShowHistoryModal(item)} className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors tooltip" title="View History">
                                                <History size={16} />
                                            </button>
                                            <button onClick={() => setShowEditModal(item)} className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors tooltip" title="Edit Details">
                                                <Settings size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!loading && filteredInventory.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center">
                                        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Box size={24} className="text-slate-500" />
                                        </div>
                                        <p className="text-slate-400 font-medium">No inventory items found.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Modal */}
            {showAddModal && (
                 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                     <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                         <div className="p-6 border-b border-white/10">
                             <h2 className="text-xl font-bold text-white flex items-center">
                                 <Plus className="mr-2 text-brand-cyan" /> Add New Equipment
                             </h2>
                         </div>
                         <form onSubmit={handleAddItem} className="p-6 space-y-4">
                             <div>
                                 <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Equipment Type</label>
                                 <select name="type" required className="w-full bg-slate-950 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-cyan outline-none">
                                     <option value="Dehumidifier">Dehumidifier</option>
                                     <option value="Air Mover">Air Mover</option>
                                     <option value="HEPA Scrubber">HEPA Scrubber</option>
                                     <option value="Heater">Heater</option>
                                 </select>
                             </div>
                             <div>
                                 <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Model Name</label>
                                 <input type="text" name="model" required placeholder="e.g. Dri-Eaz LGR 7000XLi" className="w-full bg-slate-950 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-cyan outline-none" />
                             </div>
                             <div>
                                 <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Initial Status</label>
                                 <select name="status" required className="w-full bg-slate-950 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-cyan outline-none">
                                     <option value="available">Available</option>
                                     <option value="in_use">In Use</option>
                                     <option value="maintenance_needed">Needs Maintenance</option>
                                 </select>
                             </div>
                             <div>
                                 <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Notes</label>
                                 <textarea name="notes" placeholder="Optional notes" className="w-full bg-slate-950 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-cyan outline-none resize-none h-24"></textarea>
                             </div>
                             <div className="flex justify-end space-x-3 pt-4 border-t border-white/10">
                                 <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition-colors">Cancel</button>
                                 <button type="submit" className="px-4 py-2 bg-brand-cyan hover:bg-cyan-400 text-slate-900 rounded-lg font-bold transition-colors">Add Equipment</button>
                             </div>
                         </form>
                     </div>
                 </div>
            )}

            {/* Assign Project Modal */}
            {showAssignModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-white/10 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white flex items-center">
                                <MapPin className="mr-2 text-blue-400" /> Dispatch Equipment
                            </h2>
                            <button onClick={() => setShowAssignModal(null)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-slate-300">Select the active project to dispatch <strong>{showAssignModal.item.model}</strong> ({showAssignModal.item.id}):</p>
                            
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                {projects.filter(p => ['Intake', 'Inspection', 'Scope', 'Stabilize', 'Monitor'].includes(p.currentStage)).length === 0 ? (
                                    <p className="text-sm text-amber-400">No active projects found.</p>
                                ) : (
                                    projects
                                        .filter(p => ['Intake', 'Inspection', 'Scope', 'Stabilize', 'Monitor'].includes(p.currentStage))
                                        .map(p => (
                                            <button 
                                                key={p.id}
                                                onClick={() => handleAssignProject(p.id)}
                                                className="w-full text-left p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors flex justify-between items-center group"
                                            >
                                                <div>
                                                    <p className="font-bold text-white text-sm">{p.client}</p>
                                                    <p className="text-xs text-slate-400 truncate mt-0.5">{p.address}</p>
                                                </div>
                                                <div className="text-brand-cyan opacity-0 group-hover:opacity-100 transition-opacity">
                                                    Assign <CheckCircle size={14} className="inline ml-1 mb-0.5"/>
                                                </div>
                                            </button>
                                        ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {showHistoryModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-6 border-b border-white/10 flex justify-between items-center shrink-0">
                            <h2 className="text-xl font-bold text-white flex items-center">
                                <History className="mr-2 text-brand-cyan" /> Equipment Log: {showHistoryModal.id}
                            </h2>
                            <button onClick={() => setShowHistoryModal(null)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            {!showHistoryModal.history || showHistoryModal.history.length === 0 ? (
                                <div className="text-center p-8 text-slate-400">No history available for this equipment.</div>
                            ) : (
                                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
                                    {[...showHistoryModal.history].reverse().map((entry, idx) => (
                                        <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-slate-900 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                                                {entry.action === 'checked_out' && <MapPin size={16} className="text-blue-400" />}
                                                {entry.action === 'checked_in' && <Box size={16} className="text-emerald-400" />}
                                                {entry.action === 'maintenance' && <Wrench size={16} className="text-amber-400" />}
                                            </div>
                                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-white/10 bg-white/5 shadow">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="font-bold text-white text-sm capitalize">{entry.action.replace('_', ' ')}</div>
                                                    <div className="text-xs font-medium text-slate-400">{new Date(entry.date).toLocaleDateString()} {new Date(entry.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                                </div>
                                                {entry.projectId && (
                                                    <div className="text-xs text-blue-400 font-medium mb-1">Project ID: {entry.projectId}</div>
                                                )}
                                                <div className="text-slate-300 text-sm">{entry.notes}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-white/10 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white flex items-center">
                                <Settings className="mr-2 text-slate-400" /> Edit {showEditModal.id}
                            </h2>
                            <button onClick={() => setShowEditModal(null)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                        </div>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            handleUpdateItem(showEditModal.id, {
                                model: formData.get('model') as string,
                                type: formData.get('type') as string,
                                notes: formData.get('notes') as string,
                            });
                            setShowEditModal(null);
                        }} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Model</label>
                                <input type="text" name="model" defaultValue={showEditModal.model} required className="w-full bg-slate-950 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-cyan outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Type</label>
                                <input type="text" name="type" defaultValue={showEditModal.type} required className="w-full bg-slate-950 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-cyan outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Notes</label>
                                <textarea name="notes" defaultValue={showEditModal.notes || ''} className="w-full bg-slate-950 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-cyan outline-none resize-none h-24"></textarea>
                            </div>
                            
                            <div className="pt-4 mt-6 border-t border-red-500/20">
                                <p className="text-xs text-slate-400 mb-3">Danger Zone</p>
                                <button type="button" onClick={() => handleDeleteItem(showEditModal.id)} className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 rounded-lg font-bold flex items-center justify-center transition-colors">
                                    <AlertTriangle size={16} className="mr-2" /> Delete Equipment
                                </button>
                            </div>

                            <div className="flex justify-end space-x-3 pt-4 border-t border-white/10">
                                <button type="button" onClick={() => setShowEditModal(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition-colors">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-brand-cyan hover:bg-cyan-400 text-slate-900 rounded-lg font-bold transition-colors">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};

export default InventoryTracker;
