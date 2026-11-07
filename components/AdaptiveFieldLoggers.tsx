import React, { useState } from 'react';
import { 
  X, 
  FlaskConical, 
  Wind, 
  Gauge, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Zap 
} from 'lucide-react';
import { 
  MoistureReadingEntry, 
  EquipmentDeployedLog, 
  ChemicalTreatmentLog,
  WaterCategory 
} from '../types';

/* -------------------------------------------------------------------------- */
/* 1. Moisture Reading Modal                                                  */
/* -------------------------------------------------------------------------- */
interface MoistureReadingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (reading: MoistureReadingEntry) => void;
  defaultRoom?: string;
}

export const MoistureReadingModal: React.FC<MoistureReadingModalProps> = ({
  isOpen,
  onClose,
  onSave,
  defaultRoom = 'Living Room'
}) => {
  const [roomName, setRoomName] = useState(defaultRoom);
  const [materialName, setMaterialName] = useState('Drywall 5/8"');
  const [readingType, setReadingType] = useState<MoistureReadingEntry['readingType']>('Penetrating Pin');
  const [dryGoalMC, setDryGoalMC] = useState(10.0);
  const [baselineWetMC] = useState(38.0);
  const [currentMC, setCurrentMC] = useState(16.5);
  const [locationDetails, setLocationDetails] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isDry = currentMC <= dryGoalMC;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    onSave({
      id: `mr-${Date.now()}`,
      roomName: roomName.trim() || 'General Area',
      materialName: materialName.trim(),
      readingType,
      dryGoalMC: Number(dryGoalMC),
      baselineWetMC: Number(baselineWetMC),
      currentMC: Number(currentMC),
      dateRecorded: dateStr,
      isDry,
      locationDetails: locationDetails.trim() || undefined
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
        <header className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 text-brand-cyan flex items-center justify-center border border-cyan-500/20">
              <Gauge size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Record Material Moisture Pin Reading</h3>
              <p className="text-xs text-slate-400">IICRC S500 Psychrometric Monitoring Matrix</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Room / Chamber</label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-semibold text-sm focus:border-brand-cyan focus:outline-none"
                placeholder="e.g. Master Bedroom"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Material Tracked</label>
              <select
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-semibold text-sm focus:border-brand-cyan focus:outline-none"
              >
                <option value='Drywall 5/8"'>Drywall 5/8" (Sheetrock)</option>
                <option value='Drywall 1/2"'>Drywall 1/2"</option>
                <option value="Bottom Sill Plate (2x4 Pine)">Bottom Sill Plate (2x4 Pine)</option>
                <option value="Framing Studs (Fir/Pine)">Framing Studs (Fir/Pine)</option>
                <option value="OSB Subfloor">OSB Subfloor</option>
                <option value="Plywood Subfloor">Plywood Subfloor</option>
                <option value="Solid Hardwood (Oak/Maple)">Solid Hardwood (Oak/Maple)</option>
                <option value="Concrete Slab">Concrete Slab</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Reading Method</label>
              <select
                value={readingType}
                onChange={(e) => setReadingType(e.target.value as MoistureReadingEntry['readingType'])}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-2 py-2 text-white font-semibold text-xs focus:border-brand-cyan focus:outline-none"
              >
                <option value="Penetrating Pin">Penetrating Pin</option>
                <option value="Non-Destructive RF">Non-Destructive RF</option>
                <option value="RH Probe">In-Situ RH Probe</option>
                <option value="Concrete In-Situ">Concrete In-Situ</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-black text-emerald-400 uppercase tracking-wider block mb-1">Dry Goal (MC %)</label>
              <input
                type="number"
                step="0.1"
                value={dryGoalMC}
                onChange={(e) => setDryGoalMC(parseFloat(e.target.value))}
                className="w-full bg-slate-950 border border-emerald-500/30 rounded-xl px-3 py-2 text-emerald-400 font-bold text-sm focus:border-brand-cyan focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-black text-cyan-400 uppercase tracking-wider block mb-1">Current MC %</label>
              <input
                type="number"
                step="0.1"
                value={currentMC}
                onChange={(e) => setCurrentMC(parseFloat(e.target.value))}
                className="w-full bg-slate-950 border border-cyan-500/30 rounded-xl px-3 py-2 text-cyan-400 font-black text-sm focus:border-brand-cyan focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Specific Pin Location & Elevation Details</label>
            <input
              type="text"
              value={locationDetails}
              onChange={(e) => setLocationDetails(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:border-brand-cyan focus:outline-none"
              placeholder="e.g. 6 inches above floor, east wall beneath window"
            />
          </div>

          {/* Quick status preview badge */}
          <div className="p-3 rounded-2xl bg-slate-950/70 border border-white/5 flex items-center justify-between">
            <span className="text-xs text-slate-400">Current Status:</span>
            {currentMC <= dryGoalMC ? (
              <span className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                <CheckCircle size={14} /> DRY STANDARD ATTAINED (≤ {dryGoalMC}%)
              </span>
            ) : (
              <span className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                <AlertCircle size={14} /> ACTIVE DRYING REQUIRED (+{(currentMC - dryGoalMC).toFixed(1)}% above goal)
              </span>
            )}
          </div>

          <footer className="pt-2 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-brand-cyan hover:bg-cyan-400 text-slate-900 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition"
            >
              Save Moisture Reading
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. Equipment Deployment Logger Modal                                      */
/* -------------------------------------------------------------------------- */
interface EquipmentLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (equipment: EquipmentDeployedLog) => void;
  defaultRoom?: string;
}

export const EquipmentLoggerModal: React.FC<EquipmentLoggerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  defaultRoom = 'Living Room'
}) => {
  const [equipmentType, setEquipmentType] = useState<EquipmentDeployedLog['equipmentType']>('Air Mover (Axial/Centrifugal)');
  const [model, setModel] = useState('Phoenix AirMax Radial / Axial Air Mover');
  const [serialNumber, setSerialNumber] = useState('');
  const [roomLocation, setRoomLocation] = useState(defaultRoom);
  const [amperage, setAmperage] = useState(1.9);
  const [circuitVerified, setCircuitVerified] = useState(true);
  const [targetRunHours, setTargetRunHours] = useState(72);

  if (!isOpen) return null;

  const handleTypeChange = (type: EquipmentDeployedLog['equipmentType']) => {
    setEquipmentType(type);
    if (type === 'Air Mover (Axial/Centrifugal)') {
      setModel('Phoenix AirMax Radial / Axial Air Mover');
      setAmperage(1.9);
    } else if (type === 'LGR Dehumidifier') {
      setModel('Dri-Eaz LGR 3500i (170 PPD)');
      setAmperage(8.2);
    } else if (type === 'Desiccant Dehumidifier') {
      setModel('Phoenix D850 Desiccant (850 CFM)');
      setAmperage(14.0);
    } else if (type === 'HEPA Air Scrubber') {
      setModel('DefendAir HEPA 500 CFM Air Scrubber');
      setAmperage(2.5);
    } else if (type === 'Injectidry Wall/Floor System') {
      setModel('Injectidry Floor Drying Mat System HP60');
      setAmperage(5.5);
    } else if (type === 'Air Scrubber - Negative Air') {
      setModel('Abatement Technologies Predator 750 Negative Air');
      setAmperage(3.5);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    onSave({
      id: `eq-${Date.now()}`,
      equipmentType,
      model,
      serialNumber: serialNumber.trim() || `SN-${Math.floor(1000 + Math.random() * 9000)}`,
      roomLocation: roomLocation.trim() || 'Main Mitigation Area',
      amperage: Number(amperage),
      circuitVerified,
      targetRunHours: Number(targetRunHours),
      actualHours: 0,
      deployedDate: dateStr,
      status: 'Running'
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
        <header className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 text-brand-cyan flex items-center justify-center border border-cyan-500/20">
              <Wind size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Deploy & Log Drying Equipment</h3>
              <p className="text-xs text-slate-400">Track Amperage, Placement & Runtime Hours</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
          <div>
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Equipment Category</label>
            <select
              value={equipmentType}
              onChange={(e) => handleTypeChange(e.target.value as EquipmentDeployedLog['equipmentType'])}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-semibold text-sm focus:border-brand-cyan focus:outline-none"
            >
              <option value="Air Mover (Axial/Centrifugal)">Air Mover (Axial / Centrifugal)</option>
              <option value="LGR Dehumidifier">LGR Dehumidifier (Low-Grain Refrigerant)</option>
              <option value="Desiccant Dehumidifier">Desiccant Dehumidifier (Specialty Class 4)</option>
              <option value="HEPA Air Scrubber">HEPA Air Scrubber (Air Filtration Device)</option>
              <option value="Air Scrubber - Negative Air">Air Scrubber - Negative Air Containment</option>
              <option value="Injectidry Wall/Floor System">Injectidry Wall / Hardwood Cavity System</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Make & Model</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-semibold text-xs focus:border-brand-cyan focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Serial Number / Barcode</label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="e.g. AM-4029"
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-brand-cyan focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Room Location</label>
              <input
                type="text"
                value={roomLocation}
                onChange={(e) => setRoomLocation(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-semibold focus:border-brand-cyan focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-black text-amber-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Zap size={11} /> Amp Draw (A)
              </label>
              <input
                type="number"
                step="0.1"
                value={amperage}
                onChange={(e) => setAmperage(parseFloat(e.target.value))}
                className="w-full bg-slate-950 border border-amber-500/30 rounded-xl px-3 py-2 text-amber-400 font-bold text-xs focus:border-brand-cyan focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Clock size={11} /> Target Run Hours
              </label>
              <input
                type="number"
                value={targetRunHours}
                onChange={(e) => setTargetRunHours(parseInt(e.target.value))}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-semibold text-xs focus:border-brand-cyan focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-white/5 rounded-2xl">
            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={circuitVerified}
                onChange={(e) => setCircuitVerified(e.target.checked)}
                className="rounded border-white/20 bg-slate-900 text-brand-cyan focus:ring-brand-cyan h-4 w-4"
              />
              <span className="text-xs text-slate-300 font-medium">
                Circuit load verified (&lt;12A load on 15A branch circuit per NEC 80% rule)
              </span>
            </label>
          </div>

          <footer className="pt-2 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-brand-cyan hover:bg-cyan-400 text-slate-900 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition"
            >
              Deploy & Log Equipment
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. EPA Chemical Treatment Logger Modal                                     */
/* -------------------------------------------------------------------------- */
interface ChemicalTreatmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (treatment: ChemicalTreatmentLog) => void;
  defaultCategory?: WaterCategory;
}

export const ChemicalTreatmentModal: React.FC<ChemicalTreatmentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  defaultCategory = WaterCategory.CAT_1
}) => {
  const isCat3 = defaultCategory === WaterCategory.CAT_3;

  const [productName, setProductName] = useState(
    isCat3 ? 'Benefect Decon 30 Disinfectant' : 'Mediclean QGC Germicidal Cleaner'
  );
  const [epaRegNumber, setEpaRegNumber] = useState(
    isCat3 ? 'EPA Reg. No. 84683-3-74771' : 'EPA Reg. No. 70385-6'
  );
  const [activeIngredient, setActiveIngredient] = useState(
    isCat3 ? 'Botanical Thymol (0.05%)' : 'Quaternary Ammonium Chloride (0.12%)'
  );
  const [applicationMethod, setApplicationMethod] = useState<ChemicalTreatmentLog['applicationMethod']>('Low-Pressure Coarse Spray');
  const [targetAreas, setTargetAreas] = useState('Exposed 2x4 framing studs, bottom plates, subfloor');
  const [dwellTimeMinutes, setDwellTimeMinutes] = useState(10);
  const [sqFtTreated, setSqFtTreated] = useState(350);
  const [appliedBy, setAppliedBy] = useState('Lead Mitigation Tech');
  const [clientNotifiedOfReEntry, setClientNotifiedOfReEntry] = useState(true);
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleProductPreset = (prod: string) => {
    setProductName(prod);
    if (prod.includes('Benefect')) {
      setEpaRegNumber('EPA Reg. No. 84683-3-74771');
      setActiveIngredient('Botanical Thymol (0.05%)');
      setDwellTimeMinutes(10);
    } else if (prod.includes('Mediclean') || prod.includes('Microban')) {
      setEpaRegNumber('EPA Reg. No. 70385-6');
      setActiveIngredient('Quaternary Ammonium Chloride (0.12%)');
      setDwellTimeMinutes(10);
    } else if (prod.includes('Sporicidin')) {
      setEpaRegNumber('EPA Reg. No. 8383-3');
      setActiveIngredient('Phenol / Sodium Phenate');
      setDwellTimeMinutes(10);
    } else if (prod.includes('Concrobium')) {
      setEpaRegNumber('EPA Reg. No. 86910-1');
      setActiveIngredient('Inorganic Salt Polymer / Antimicrobial');
      setDwellTimeMinutes(15);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    onSave({
      id: `chem-${Date.now()}`,
      productName,
      epaRegNumber,
      activeIngredient,
      applicationMethod,
      targetAreas,
      dwellTimeMinutes: Number(dwellTimeMinutes),
      sqFtTreated: Number(sqFtTreated),
      appliedBy,
      appliedAt: dateStr,
      ppeUsed: ['Half-Face P100 / Organic Vapor Respirator', 'Nitrile Chemical Gloves', 'Splash Goggles', 'Tyvek Sleeves'],
      clientNotifiedOfReEntry,
      notes: notes.trim() || undefined
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
        <header className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/15 text-purple-400 flex items-center justify-center border border-purple-500/20">
              <FlaskConical size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Log EPA-Registered Chemical Treatment</h3>
              <p className="text-xs text-slate-400">Antimicrobial Application, Dwell Times & Safety Compliance</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
          <div>
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Product Preset</label>
            <select
              value={productName}
              onChange={(e) => handleProductPreset(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-semibold text-sm focus:border-brand-cyan focus:outline-none"
            >
              <option value="Benefect Decon 30 Disinfectant">Benefect Decon 30 (Botanical Thymol - Zero Rinse)</option>
              <option value="Mediclean QGC Germicidal Cleaner">Mediclean QGC / Microban (Quat Broad Spectrum)</option>
              <option value="Sporicidin Disinfectant Solution">Sporicidin Disinfectant (Hospital Grade / Mold)</option>
              <option value="Concrobium Broad Spectrum Disinfectant">Concrobium Mold Control / Broad Spectrum</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">EPA Registration #</label>
              <input
                type="text"
                value={epaRegNumber}
                onChange={(e) => setEpaRegNumber(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-brand-cyan focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Active Ingredient</label>
              <input
                type="text"
                value={activeIngredient}
                onChange={(e) => setActiveIngredient(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-semibold focus:border-brand-cyan focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Application Method</label>
              <select
                value={applicationMethod}
                onChange={(e) => setApplicationMethod(e.target.value as ChemicalTreatmentLog['applicationMethod'])}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-2 py-2 text-white text-xs font-semibold focus:border-brand-cyan focus:outline-none"
              >
                <option value="Low-Pressure Coarse Spray">Low-Pressure Coarse Spray</option>
                <option value="ULV Cold Fog">ULV Cold Fog</option>
                <option value="Direct Surface Saturation">Direct Saturation / Mop</option>
                <option value="Electrostatic Spray">Electrostatic Spray</option>
                <option value="HEPA Wipe Down">HEPA Wipe Down</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-black text-purple-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Clock size={11} /> Dwell (Minutes)
              </label>
              <input
                type="number"
                value={dwellTimeMinutes}
                onChange={(e) => setDwellTimeMinutes(parseInt(e.target.value))}
                className="w-full bg-slate-950 border border-purple-500/30 rounded-xl px-3 py-2 text-purple-400 font-bold text-xs focus:border-brand-cyan focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Area Treated (Sq Ft)</label>
              <input
                type="number"
                value={sqFtTreated}
                onChange={(e) => setSqFtTreated(parseInt(e.target.value))}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white font-semibold text-xs focus:border-brand-cyan focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Target Framing & Building Assemblies</label>
            <input
              type="text"
              value={targetAreas}
              onChange={(e) => setTargetAreas(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:border-brand-cyan focus:outline-none"
              placeholder="e.g. Subfloor, bottom 2ft studs, concrete foundation"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Applied By (Technician)</label>
              <input
                type="text"
                value={appliedBy}
                onChange={(e) => setAppliedBy(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:border-brand-cyan focus:outline-none font-semibold"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1">Notes / Observations</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Saturation complete, fan off during dwell"
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:border-brand-cyan focus:outline-none"
              />
            </div>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-white/5 rounded-2xl">
            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={clientNotifiedOfReEntry}
                onChange={(e) => setClientNotifiedOfReEntry(e.target.checked)}
                className="rounded border-white/20 bg-slate-900 text-brand-cyan focus:ring-brand-cyan h-4 w-4"
              />
              <span className="text-xs text-slate-300 font-medium">
                Client / occupants notified of safety protocol, dwell time, and re-entry guidelines
              </span>
            </label>
          </div>

          <footer className="pt-2 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-brand-cyan hover:bg-cyan-400 text-slate-900 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition"
            >
              Save Chemical Log
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
