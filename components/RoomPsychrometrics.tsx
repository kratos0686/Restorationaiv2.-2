import React, { useState } from 'react';
import { Plus, Thermometer, Droplets, Wind, History, Save, ChevronRight, ChevronLeft, Activity, Fan, Settings2 } from 'lucide-react';
import { Project, Room, Reading, TrackedMaterial, MaterialReading } from '../types';
import { calculatePsychrometricsFromDryBulb } from '../utils/psychrometrics';

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
}

import { useAppContext } from '../context/AppContext';

export default function RoomPsychrometrics({ project, onUpdate }: Props) {
  const { settings } = useAppContext();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(project.rooms?.[0]?.id || null);
  
  const tempUnit = settings.units.temperature === 'Fahrenheit' ? '°F' : '°C';
  const humUnit = settings.units.humidity === 'Grains / Pound' ? 'GPP' : 'g/kg';
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  
  // Daily log state for the selected room
  const [logForm, setLogForm] = useState<{ temp: string; rh: string; materials: Record<string, string> }>({
    temp: '',
    rh: '',
    materials: {}
  });

  // Room Creation state
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomForm, setNewRoomForm] = useState({ name: '', level: 'Ground', roomType: 'General', isDryingChamber: false });
  
  // Room Edit Metadata 
  const [showEditMetadata, setShowEditMetadata] = useState(false);
  const [editRoomForm, setEditRoomForm] = useState({ name: '', level: '', roomType: '', isDryingChamber: false });

  // Add new material state
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ name: '', goal: '10', initial: '' });

  const handleCreateRoom = () => {
    setShowCreateRoom(true);
  };

  const handleSaveNewRoom = () => {
    if (!newRoomForm.name) return;
    const newRoom: Room = {
      id: `room-${Date.now()}`,
      name: newRoomForm.name,
      level: newRoomForm.level,
      roomType: newRoomForm.roomType,
      isDryingChamber: newRoomForm.isDryingChamber,
      dimensions: { length: 0, width: 0, height: 0 },
      readings: [],
      photos: [],
      status: 'wet'
    };
    onUpdate({ rooms: [...(project.rooms || []), newRoom] });
    setSelectedRoomId(newRoom.id);
    setShowCreateRoom(false);
    setNewRoomForm({ name: '', level: 'Ground', roomType: 'General', isDryingChamber: false });
  };

  const handleSaveEditRoom = () => {
    if (!selectedRoomId) return;
    const updatedRooms = (project.rooms || []).map(r => {
      if (r.id === selectedRoomId) {
        return {
          ...r,
          name: editRoomForm.name,
          level: editRoomForm.level,
          roomType: editRoomForm.roomType,
          isDryingChamber: editRoomForm.isDryingChamber
        };
      }
      return r;
    });
    
    // Also update tracked materials location if name changes
    const updatedMonitor = (project.dryingMonitor || []).map(m => {
      if (m.location === selectedRoom?.name) {
        return { ...m, location: editRoomForm.name };
      }
      return m;
    });
    
    // Update equipment if room renamed
    const updatedEquip = (project.equipment || []).map(e => {
        if (e.room === selectedRoom?.name) {
            return { ...e, room: editRoomForm.name };
        }
        return e;
    });

    onUpdate({ rooms: updatedRooms, dryingMonitor: updatedMonitor, equipment: updatedEquip });
    setShowEditMetadata(false);
  };

  const selectedRoom = project.rooms?.find(r => r.id === selectedRoomId);
  const roomMaterials = project.dryingMonitor?.filter(m => m.location === selectedRoom?.name) || [];
  const roomEquipment = project.equipment?.filter(e => e.room === selectedRoom?.name) || [];

  const handleSaveDailyLog = () => {
    if (!selectedRoomId || !selectedRoom) return;

    let t = parseFloat(logForm.temp);
    const rh = parseFloat(logForm.rh);
    const timestamp = Date.now();
    const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'short' });

    let updatedRooms = [...(project.rooms || [])];
    
    // 1. Save Room Atmospherics if provided
    if (!isNaN(t) && !isNaN(rh)) {
      // Convert to Fahrenheit for math context if input was Celsius
      if (settings.units.temperature === 'Celsius') {
        t = (t * 9 / 5) + 32;
      }

      const psychData = calculatePsychrometricsFromDryBulb(t, rh);
      const reading: Reading = { timestamp, temp: t, rh, gpp: psychData.gpp, mc: 0, vaporPressure: psychData?.vaporPressure, enthalpy: psychData?.enthalpy, dewPoint: psychData?.dewPoint };
      updatedRooms = updatedRooms.map(r => {
        if (r.id === selectedRoomId) {
          return { ...r, readings: [...(r.readings || []), reading] };
        }
        return r;
      });
    }

    // 2. Save Material Readings
    let updatedMonitor = [...(project.dryingMonitor || [])];
    
    Object.entries(logForm.materials).forEach(([matId, valStr]) => {
      const val = parseFloat(valStr);
      if (!isNaN(val)) {
        updatedMonitor = updatedMonitor.map(m => {
          if (m.id === matId) {
            const matReading: MaterialReading = { timestamp, value: val, dateStr };
            return {
              ...m,
              readings: [...(m.readings || []), matReading],
              status: val <= m.dryGoal ? 'Dry' : 'Wet'
            };
          }
          return m;
        });
      }
    });

    onUpdate({ rooms: updatedRooms, dryingMonitor: updatedMonitor });
    
    // Reset Form
    setLogForm({ temp: '', rh: '', materials: {} });
  };

  const handleAddMaterial = () => {
    if (!selectedRoom || !newMaterial.name) return;
    const initial = parseFloat(newMaterial.initial);
    const goal = parseFloat(newMaterial.goal);
    
    if (isNaN(initial) || isNaN(goal)) return;

    const newMat: TrackedMaterial = {
      id: `mat-${Date.now()}`,
      name: newMaterial.name,
      location: selectedRoom.name,
      type: newMaterial.name,
      dryGoal: goal,
      initialReading: initial,
      readings: [{ timestamp: Date.now(), value: initial, dateStr: new Date().toLocaleDateString(undefined, { weekday: 'short' }) }],
      status: initial <= goal ? 'Dry' : 'Wet'
    };

    onUpdate({ dryingMonitor: [...(project.dryingMonitor || []), newMat] });
    setNewMaterial({ name: '', goal: '10', initial: '' });
    setShowAddMaterial(false);
  };

  return (
    <div className="flex relative h-full border border-white/10 rounded-2xl overflow-hidden bg-slate-900/50">
      {/* Sidebar for Rooms */}
      <div className={`absolute md:relative z-20 h-full bg-slate-950 border-r border-white/10 flex flex-col transition-all duration-300 shadow-2xl md:shadow-none ${isSidebarCollapsed ? 'w-0 border-r-0' : 'w-56 md:w-64'}`}>
        {/* Collapse Toggle */}
        <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
            className={`absolute top-6 w-6 h-6 bg-slate-800 rounded-full border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors z-30 ${isSidebarCollapsed ? '-right-9' : '-right-3'}`}
        >
            {isSidebarCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        <div className={`flex flex-col flex-1 overflow-hidden transition-opacity duration-300 ${isSidebarCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
            <div className="p-4 border-b border-white/10 flex justify-between items-center">
              <h3 className="font-bold text-white">Rooms</h3>
              <button title="Create Room" onClick={handleCreateRoom} className="p-2 bg-brand-cyan/20 text-brand-cyan rounded-lg hover:bg-brand-cyan/30 transition-colors">
                <Plus size={16} />
              </button>
            </div>
            {showCreateRoom && (
              <div className="p-3 border-b border-white/5 bg-slate-900/80 animate-in slide-in-from-top-2">
                <input type="text" placeholder="Room Name (e.g. Master Bath)" value={newRoomForm.name} onChange={e => setNewRoomForm({...newRoomForm, name: e.target.value})} className="w-full bg-slate-950 border border-white/10 rounded p-2 text-xs text-white mb-2" />
                <div className="flex gap-2 mb-2">
                    <input type="text" placeholder="Level (Ground, 2nd, etc)" value={newRoomForm.level} onChange={e => setNewRoomForm({...newRoomForm, level: e.target.value})} className="w-1/2 bg-slate-950 border border-white/10 rounded p-2 text-xs text-white" />
                    <select value={newRoomForm.roomType} onChange={e => setNewRoomForm({...newRoomForm, roomType: e.target.value})} className="w-1/2 bg-slate-950 border border-white/10 rounded p-2 text-xs text-white">
                        <option value="General">General</option>
                        <option value="Bathroom">Bathroom</option>
                        <option value="Kitchen">Kitchen</option>
                        <option value="Bedroom">Bedroom</option>
                        <option value="Living">Living</option>
                        <option value="Utility">Utility</option>
                    </select>
                </div>
                <label className="flex items-center space-x-2 text-xs text-slate-300 mb-2">
                    <input type="checkbox" checked={newRoomForm.isDryingChamber} onChange={e => setNewRoomForm({...newRoomForm, isDryingChamber: e.target.checked})} className="rounded bg-slate-900 border-white/10" />
                    <span>Drying Chamber Setup</span>
                </label>
                <div className="flex gap-2">
                    <button onClick={() => setShowCreateRoom(false)} className="flex-1 p-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 rounded">Cancel</button>
                    <button onClick={handleSaveNewRoom} disabled={!newRoomForm.name} className="flex-1 p-1.5 text-xs bg-brand-cyan text-slate-900 font-bold rounded disabled:opacity-50">Save</button>
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              {project.rooms?.map(room => (
                <button
                  key={room.id}
                  onClick={() => {
                    setSelectedRoomId(room.id);
                    setLogForm({ temp: '', rh: '', materials: {} });
                    setShowAddMaterial(false);
                    setShowEditMetadata(false);
                  }}
                  className={`w-full text-left p-4 border-b border-white/5 transition-colors ${selectedRoomId === room.id ? 'bg-white/10 border-l-2 border-l-brand-cyan' : 'hover:bg-white/5'}`}
                >
                  <div className="font-bold text-white text-sm flex items-center gap-2">
                      {room.name} 
                      {room.isDryingChamber && <span title="Drying Chamber" className="w-2 h-2 rounded-full bg-brand-cyan shadow-[0_0_8px_rgba(6,182,212,0.8)]" />}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 uppercase font-bold">{room.level || 'Unknown Level'} • {room.roomType || 'General'}</div>
                  <div className="text-xs text-slate-400 mt-1">{room.readings?.length || 0} readings</div>
                </button>
              ))}
              {(!project.rooms || project.rooms.length === 0) && (
                <div className="p-8 text-center text-slate-500 text-sm">
                  No rooms yet. Add a room.
                </div>
              )}
            </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
        {selectedRoom ? (
          <div className="space-y-8 max-w-4xl mx-auto w-full">
            <header className="border-b border-white/10 pb-4 flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-black text-white flex items-center gap-3">
                    {selectedRoom.name}
                    {selectedRoom.isDryingChamber && (
                        <span className="text-[10px] font-bold bg-brand-cyan/20 text-brand-cyan px-2 py-1 rounded uppercase tracking-widest border border-brand-cyan/30 flex items-center">
                            <Wind size={10} className="mr-1" /> Drying Chamber
                        </span>
                    )}
                </h2>
                <div className="text-slate-400 text-sm mt-1 flex items-center gap-2 uppercase tracking-widest text-[10px] font-bold">
                    <span>Level: {selectedRoom.level || '-'}</span> • <span>Type: {selectedRoom.roomType || '-'}</span>
                </div>
              </div>
              <button 
                  onClick={() => {
                      setEditRoomForm({ name: selectedRoom.name, level: selectedRoom.level || '', roomType: selectedRoom.roomType || 'General', isDryingChamber: selectedRoom.isDryingChamber || false });
                      setShowEditMetadata(!showEditMetadata);
                  }} 
                  className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"
                  title="Edit Room Details"
              >
                  <Settings2 size={16} />
              </button>
            </header>

            {showEditMetadata && (
                <div className="bg-slate-900 border border-white/10 rounded-xl p-4 animate-in slide-in-from-top-2">
                    <h3 className="text-sm font-bold text-white mb-3">Edit Room Settings</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <input type="text" placeholder="Room Name" value={editRoomForm.name} onChange={e => setEditRoomForm({...editRoomForm, name: e.target.value})} className="bg-slate-950 border border-white/10 rounded p-2 text-sm text-white focus:border-brand-cyan outline-none" />
                        <input type="text" placeholder="Level" value={editRoomForm.level} onChange={e => setEditRoomForm({...editRoomForm, level: e.target.value})} className="bg-slate-950 border border-white/10 rounded p-2 text-sm text-white focus:border-brand-cyan outline-none" />
                        <select value={editRoomForm.roomType} onChange={e => setEditRoomForm({...editRoomForm, roomType: e.target.value})} className="bg-slate-950 border border-white/10 rounded p-2 text-sm text-white focus:border-brand-cyan outline-none">
                            <option value="General">General</option>
                            <option value="Bathroom">Bathroom</option>
                            <option value="Kitchen">Kitchen</option>
                            <option value="Bedroom">Bedroom</option>
                            <option value="Living">Living</option>
                            <option value="Utility">Utility</option>
                        </select>
                    </div>
                    <label className="flex items-center space-x-2 text-sm text-slate-300 mb-4">
                        <input type="checkbox" checked={editRoomForm.isDryingChamber} onChange={e => setEditRoomForm({...editRoomForm, isDryingChamber: e.target.checked})} className="rounded bg-slate-900 border-white/10" />
                        <span>Establish as active Drying Chamber</span>
                    </label>
                    <div className="flex gap-3 justify-end border-t border-white/5 pt-3">
                        <button onClick={() => setShowEditMetadata(false)} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors">Cancel</button>
                        <button onClick={handleSaveEditRoom} disabled={!editRoomForm.name} className="px-4 py-2 text-xs font-bold bg-brand-cyan text-slate-900 rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50">Save Changes</button>
                    </div>
                </div>
            )}

            {roomEquipment.length > 0 && (
                <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5 flex flex-wrap gap-3">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest w-full mb-1">Equipment Deployed Here</div>
                    {roomEquipment.map(eq => (
                        <div key={eq.id} className="text-xs bg-slate-950 border border-white/10 rounded-lg p-2 flex items-center gap-2 text-slate-300">
                            <Fan size={12} className={eq.status === 'Running' ? 'text-blue-400' : 'text-slate-600'} />
                            <span>{eq.model}</span>
                            <span className={`text-[9px] px-1 rounded ${eq.status === 'Running' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800'}`}>{eq.status}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Daily Log Form */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-white/10 shadow-xl space-y-6">
              <div className="flex items-center space-x-2 border-b border-white/10 pb-3">
                <Activity size={18} className="text-brand-cyan" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-white">Today's Reading</h3>
              </div>
              
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Room Atmospherics</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Temp ({tempUnit})</label>
                    <div className="relative">
                      <Thermometer size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="number"
                        inputMode="decimal"
                        value={logForm.temp}
                        onChange={e => setLogForm(prev => ({ ...prev, temp: e.target.value }))}
                        className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-10 pr-4 text-lg text-white font-mono focus:outline-none focus:border-brand-cyan transition-colors"
                        placeholder="--"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">RH (%)</label>
                    <div className="relative">
                      <Wind size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="number"
                        inputMode="decimal"
                        value={logForm.rh}
                        onChange={e => setLogForm(prev => ({ ...prev, rh: e.target.value }))}
                        className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-10 pr-4 text-lg text-white font-mono focus:outline-none focus:border-brand-cyan transition-colors"
                        placeholder="--"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {roomMaterials.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-white/5">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Material Moisture Content</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {roomMaterials.map(mat => {
                      const current = mat.readings?.length > 0 ? mat.readings[mat.readings.length - 1].value : mat.initialReading;
                      return (
                        <div key={mat.id} className="bg-black/30 border border-white/5 rounded-xl p-3 flex justify-between items-center">
                          <div>
                            <div className="text-sm font-bold text-slate-200">{mat.name}</div>
                            <div className="text-[10px] text-slate-500">Goal: {mat.dryGoal}% | Last: <span className={current <= mat.dryGoal ? 'text-emerald-400' : 'text-yellow-400'}>{current}%</span></div>
                          </div>
                          <div className="relative w-24">
                            <Droplets size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                              type="number"
                              inputMode="decimal"
                              value={logForm.materials[mat.id] || ''}
                              onChange={e => setLogForm(prev => ({ ...prev, materials: { ...prev.materials, [mat.id]: e.target.value } }))}
                              className="w-full bg-slate-950 border border-white/10 rounded-lg py-3 pl-9 pr-3 text-white font-mono text-base focus:outline-none focus:border-brand-cyan"
                              placeholder="-- %"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button
                  onClick={handleSaveDailyLog}
                  disabled={!logForm.temp && !logForm.rh && Object.keys(logForm.materials).length === 0}
                  className="w-full py-3 bg-brand-cyan text-slate-900 font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-cyan-400 flex justify-center items-center space-x-2 transition-colors"
                >
                  <Save size={18} />
                  <span>Save Room Log</span>
                </button>
              </div>
            </div>

            {/* Manage Materials Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Droplets size={18} className="text-blue-400" />
                  <h3 className="text-sm font-bold uppercase tracking-widest text-white">Tracked Materials</h3>
                </div>
                {!showAddMaterial && (
                  <button onClick={() => setShowAddMaterial(true)} className="text-xs font-bold text-brand-cyan flex items-center bg-brand-cyan/10 px-3 py-1 rounded-full hover:bg-brand-cyan/20">
                    <Plus size={14} className="mr-1" /> Add Material
                  </button>
                )}
              </div>

              {showAddMaterial && (
                <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4 animate-in fade-in slide-in-from-top-2">
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Material Name</label>
                      <input type="text" value={newMaterial.name} onChange={e => setNewMaterial({...newMaterial, name: e.target.value})} placeholder="e.g. Drywall, Baseboard" className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white text-sm" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Initial MC (%)</label>
                      <input type="number" inputMode="decimal" value={newMaterial.initial} onChange={e => setNewMaterial({...newMaterial, initial: e.target.value})} placeholder="99" className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white text-base" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Goal MC (%)</label>
                      <input type="number" inputMode="decimal" value={newMaterial.goal} onChange={e => setNewMaterial({...newMaterial, goal: e.target.value})} placeholder="10" className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white text-base" />
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <button onClick={() => setShowAddMaterial(false)} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white">Cancel</button>
                    <button onClick={handleAddMaterial} disabled={!newMaterial.name || !newMaterial.initial} className="px-4 py-2 text-xs font-bold bg-white text-black rounded-lg hover:bg-slate-200 disabled:opacity-50">Save Material</button>
                  </div>
                </div>
              )}

              {roomMaterials.length === 0 ? (
                <div className="text-sm text-slate-500 py-4 text-center border border-white/5 border-dashed rounded-xl bg-black/20">No materials added for this room.</div>
              ) : (
                <div className="space-y-2">
                  {roomMaterials.map(mat => (
                    <div key={mat.id} className="bg-slate-900 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-200">{mat.name}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Goal: {mat.dryGoal}% • Status: <span className={mat.status === 'Dry' ? 'text-emerald-400' : 'text-yellow-400'}>{mat.status}</span></div>
                      </div>
                      <div className="flex space-x-1">
                        {mat.readings?.slice(-5).map((r, i) => (
                          <div key={i} className="flex flex-col items-center justify-center bg-black/30 rounded w-10 h-10 border border-white/5" title={r.dateStr}>
                            <span className="text-[10px] text-slate-500 leading-none">{r.dateStr.slice(0,2)}</span>
                            <span className={`text-xs font-mono font-bold leading-none mt-1 ${r.value <= mat.dryGoal ? 'text-emerald-400' : 'text-slate-300'}`}>{r.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Historical Room Readings */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 border-b border-white/10 pb-3">
                <History size={18} className="text-yellow-400" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-white">Atmospheric History</h3>
              </div>
              
              {selectedRoom.readings && selectedRoom.readings.length > 0 ? (
                <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-950 border-b border-white/10">
                      <tr>
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Date/Time</th>
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Temp ({tempUnit})</th>
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">RH</th>
                        <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">{humUnit}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {[...selectedRoom.readings].reverse().map((r, i) => (
                        <tr key={i} className="hover:bg-white/5 transition-colors">
                          <td className="p-4 text-sm text-slate-300">
                            {new Date(r.timestamp).toLocaleString()}
                          </td>
                          <td className="p-4 text-sm font-mono text-white">
                            {settings.units.temperature === 'Fahrenheit' ? r.temp : ((r.temp - 32) * 5/9).toFixed(1)}{tempUnit}
                          </td>
                          <td className="p-4 text-sm font-mono text-white">{r.rh}%</td>
                          <td className="p-4 text-sm font-mono text-brand-cyan">
                            {settings.units.humidity === 'Grains / Pound' ? r.gpp : (r.gpp / 7.0).toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center border border-white/10 border-dashed rounded-2xl bg-slate-900/50">
                  <p className="text-slate-500 text-sm">No atmospheric readings recorded for this room yet.</p>
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Select or create a room to manage psychrometrics.
          </div>
        )}
      </div>
    </div>
  );
}
