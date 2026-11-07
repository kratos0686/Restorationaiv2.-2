import React, { useState } from 'react';
import { 
  Project, 
  DigitalChecklistPhase, 
  PhaseSignature,
  AdaptiveMitigationConfig,
  MitigationProjectType,
  MitigationLossSource,
  WaterCategory,
  LossClass,
  ChemicalTreatmentLog,
  EquipmentDeployedLog,
  MoistureReadingEntry,
  ChecklistItem
} from '../types';
import { 
  CheckCircle, 
  Circle, 
  ChevronDown, 
  ChevronRight, 
  ShieldCheck, 
  SlidersHorizontal, 
  Sparkles, 
  PenTool, 
  Wind, 
  FlaskConical, 
  Gauge, 
  Plus, 
  Check, 
  Lock,
  FileText,
  User,
  Calendar,
  MapPin,
  Layers,
  Wrench,
  ClipboardCheck,
  X,
  RefreshCw,
  Copy
} from 'lucide-react';
import { 
  deriveAdaptiveConfig, 
  generateAdaptiveChecklistPhases, 
  calculateEquipmentMetrics,
  generateSummarySOP,
  generateSeedChemicalLogs,
  generateSeedEquipmentLogs,
  generateSeedMoistureMatrix
} from '../services/adaptiveMitigationEngine';
import { DigitalSignatureModal, SignatureResult } from './DigitalSignatureModal';
import { 
  MoistureReadingModal, 
  EquipmentLoggerModal, 
  ChemicalTreatmentModal 
} from './AdaptiveFieldLoggers';
import { EventBus } from '../services/EventBus';

interface DigitalChecklistProps {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
}

const PRESET_AREAS = [
  'Living Room',
  'Kitchen',
  'Master Bedroom',
  'Master Bath',
  'Hallway',
  'Basement / Crawlspace',
  'Utility / Mechanical Room',
  'Commercial Lobby'
];

const PRESET_MATERIALS = [
  '5/8" Drywall',
  'Baseboard Trim',
  '2x4 Wood Framing Studs',
  'Bottom Sill Plates',
  'OSB / Plywood Subfloor',
  'Carpet & Cushion Pad',
  'Solid Oak Hardwood',
  'Fiberglass Batt Insulation',
  'Concrete Slab'
];

const PRESET_EQUIPMENT = [
  'Axial Air Movers',
  'Centrifugal Air Movers',
  'LGR Dehumidifier (110-170 PPD)',
  'Desiccant Dehumidifier',
  'HEPA 500 CFM Air Scrubber',
  'Weighted Extraction Rover',
  'Injectidry Cavity System',
  'HEPA Vacuum'
];

export const DigitalChecklist: React.FC<DigitalChecklistProps> = ({ project, onUpdate }) => {
  // 1. Adaptive Configuration State
  const [adaptiveConfig, setAdaptiveConfig] = useState<AdaptiveMitigationConfig>(() => {
    const base = project.adaptiveConfig || deriveAdaptiveConfig(project);
    return {
      ...base,
      clientName: base.clientName || project.client || 'Property Owner',
      clientPhone: base.clientPhone || project.clientPhone || '(555) 234-5678',
      clientEmail: base.clientEmail || project.clientEmail || 'client@property.com',
      propertyAddress: base.propertyAddress || project.address || 'Site Address',
      inspectionDate: base.inspectionDate || project.inspectedDate || project.startDate || new Date().toISOString().slice(0, 10),
      technicianName: base.technicianName || project.assignedTeam?.[0] || 'Alex M. (IICRC WRT/AMRT Lead)',
      affectedAreas: base.affectedAreas && base.affectedAreas.length > 0
        ? base.affectedAreas
        : project.rooms?.map((r) => r.name) || ['Living Room', 'Hallway'],
      materialsImpacted: base.materialsImpacted && base.materialsImpacted.length > 0
        ? base.materialsImpacted
        : ['5/8" Drywall', 'Baseboard Trim', '2x4 Wood Framing Studs', 'OSB / Plywood Subfloor'],
      equipmentUsed: base.equipmentUsed && base.equipmentUsed.length > 0
        ? base.equipmentUsed
        : ['Axial Air Movers', 'LGR Dehumidifier (110-170 PPD)', 'HEPA 500 CFM Air Scrubber'],
      generatedSOP: base.generatedSOP || generateSummarySOP(base)
    };
  });

  const [showConfigEditor, setShowConfigEditor] = useState(true);
  const [showSOPPanel, setShowSOPPanel] = useState(true);
  const [customAreaInput, setCustomAreaInput] = useState('');
  const [customMaterialInput, setCustomMaterialInput] = useState('');
  const [customEquipmentInput, setCustomEquipmentInput] = useState('');
  const [newTaskInput, setNewTaskInput] = useState<Record<string, string>>({});

  // 2. Checklist Phases State (Ensure all 7 core sections exist)
  const [phases, setPhases] = useState<DigitalChecklistPhase[]>(() => {
    if (project.digitalChecklists && project.digitalChecklists.length === 7) {
      return project.digitalChecklists;
    }
    return generateAdaptiveChecklistPhases(adaptiveConfig, project);
  });

  const [expandedPhases, setExpandedPhases] = useState<string[]>([
    'phase_1_inspection',
    'phase_2_containment'
  ]);

  // 3. Dynamic Field Logs
  const [moistureLogs, setMoistureLogs] = useState<MoistureReadingEntry[]>(() => {
    return project.moistureMatrix || generateSeedMoistureMatrix(project);
  });
  const [equipmentLogs, setEquipmentLogs] = useState<EquipmentDeployedLog[]>(() => {
    return project.equipmentLogs || generateSeedEquipmentLogs(project);
  });
  const [chemicalLogs, setChemicalLogs] = useState<ChemicalTreatmentLog[]>(() => {
    return project.chemicalLogs || generateSeedChemicalLogs(project);
  });

  // 4. Modals State
  const [sigModalState, setSigModalState] = useState<{
    isOpen: boolean;
    phaseId: string | null; // 'MASTER_COMPLETION' or specific phase.id
    signerType: 'technician' | 'client';
    title: string;
  }>({
    isOpen: false,
    phaseId: null,
    signerType: 'technician',
    title: ''
  });

  const [isMoistureModalOpen, setIsMoistureModalOpen] = useState(false);
  const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);
  const [isChemicalModalOpen, setIsChemicalModalOpen] = useState(false);

  // Sync to parent project whenever core state updates
  const syncToProject = (
    newPhases = phases,
    newConfig = adaptiveConfig,
    newMoisture = moistureLogs,
    newEquip = equipmentLogs,
    newChem = chemicalLogs
  ) => {
    onUpdate({
      client: newConfig.clientName || project.client,
      address: newConfig.propertyAddress || project.address,
      waterCategory: newConfig.waterCategory,
      lossClass: newConfig.lossClass,
      digitalChecklists: newPhases,
      adaptiveConfig: newConfig,
      moistureMatrix: newMoisture,
      equipmentLogs: newEquip,
      chemicalLogs: newChem
    });
  };

  // Re-generate / adapt checklist phases and SOP whenever configuration changes
  const handleConfigChange = (updatedConfig: Partial<AdaptiveMitigationConfig>, regeneratePhases = true) => {
    const nextConfig: AdaptiveMitigationConfig = {
      ...adaptiveConfig,
      ...updatedConfig
    };
    nextConfig.generatedSOP = generateSummarySOP(nextConfig);
    setAdaptiveConfig(nextConfig);

    if (regeneratePhases) {
      const adaptedPhases = generateAdaptiveChecklistPhases(nextConfig, project);
      // Preserve completion states where item IDs match
      const completionMap = new Map<string, boolean>();
      phases.forEach((p) => p.items.forEach((i) => completionMap.set(i.id, i.completed)));
      const mergedPhases = adaptedPhases.map((p) => {
        const items = p.items.map((item) => ({
          ...item,
          completed: completionMap.has(item.id) ? !!completionMap.get(item.id) : item.completed
        }));
        const allCompleted = items.length > 0 && items.every((i) => i.completed);
        const someCompleted = items.some((i) => i.completed);
        return {
          ...p,
          items,
          status: (allCompleted ? 'completed' : someCompleted ? 'in_progress' : 'pending') as DigitalChecklistPhase['status']
        };
      });
      setPhases(mergedPhases);
      syncToProject(mergedPhases, nextConfig);
    } else {
      syncToProject(phases, nextConfig);
    }
  };

  const handleRegenerateChecklistAndSOP = () => {
    const freshSOP = generateSummarySOP(adaptiveConfig);
    const nextConfig = { ...adaptiveConfig, generatedSOP: freshSOP };
    const adaptedPhases = generateAdaptiveChecklistPhases(nextConfig, project);
    setAdaptiveConfig(nextConfig);
    setPhases(adaptedPhases);
    syncToProject(adaptedPhases, nextConfig);

    EventBus.publish(
      'com.restorationai.checklist.updated',
      { projectId: project.id, config: nextConfig },
      project.id,
      `Checklist & SOP calibrated for ${nextConfig.projectType} • ${nextConfig.waterCategory.split(' (')[0]}`,
      'success'
    );
  };

  const toggleArrayTag = (
    field: 'affectedAreas' | 'materialsImpacted' | 'equipmentUsed',
    value: string
  ) => {
    const current = adaptiveConfig[field] || [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    handleConfigChange({ [field]: next });
  };

  const addCustomTag = (
    field: 'affectedAreas' | 'materialsImpacted' | 'equipmentUsed',
    value: string,
    clearInput: () => void
  ) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const current = adaptiveConfig[field] || [];
    if (!current.includes(trimmed)) {
      handleConfigChange({ [field]: [...current, trimmed] });
    }
    clearInput();
  };

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) =>
      prev.includes(phaseId) ? prev.filter((id) => id !== phaseId) : [...prev, phaseId]
    );
  };

  const expandAllPhases = () => {
    if (expandedPhases.length === phases.length) {
      setExpandedPhases([]);
    } else {
      setExpandedPhases(phases.map((p) => p.id));
    }
  };

  const toggleItem = (phaseId: string, itemId: string) => {
    const updatedPhases = phases.map((phase) => {
      if (phase.id !== phaseId) return phase;
      const updatedItems = phase.items.map((item) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item
      );
      const allCompleted = updatedItems.every((i) => i.completed);
      const someCompleted = updatedItems.some((i) => i.completed);
      const nextStatus: DigitalChecklistPhase['status'] = allCompleted
        ? 'completed'
        : someCompleted
        ? 'in_progress'
        : 'pending';

      return {
        ...phase,
        items: updatedItems,
        status: nextStatus
      };
    });

    setPhases(updatedPhases);
    syncToProject(updatedPhases);
  };

  const handleAddCustomTask = (phaseId: string) => {
    const text = (newTaskInput[phaseId] || '').trim();
    if (!text) return;

    const newItem: ChecklistItem = {
      id: `custom_${Date.now()}`,
      label: text,
      completed: false,
      iicrcStandard: 'Field Protocol',
      category: 'Technician Addition',
      priority: 'normal',
      isAdaptive: false
    };

    const updatedPhases = phases.map((p) =>
      p.id === phaseId ? { ...p, items: [...p.items, newItem] } : p
    );
    setPhases(updatedPhases);
    setNewTaskInput((prev) => ({ ...prev, [phaseId]: '' }));
    syncToProject(updatedPhases);
  };

  // Signature Handling
  const handleOpenSignature = (phaseId: string, signerType: 'technician' | 'client') => {
    if (phaseId === 'MASTER_COMPLETION') {
      setSigModalState({
        isOpen: true,
        phaseId: 'MASTER_COMPLETION',
        signerType,
        title: `Project Mitigation Completion Sign-Off (${signerType === 'technician' ? 'Lead Technician Attestation' : 'Client / Owner Acceptance'})`
      });
      return;
    }
    const targetPhase = phases.find((p) => p.id === phaseId);
    setSigModalState({
      isOpen: true,
      phaseId,
      signerType,
      title: `${targetPhase?.title || 'Phase Sign-Off'} (${signerType === 'technician' ? 'Technician Attestation' : 'Client Authorization'})`
    });
  };

  const handleSaveSignature = (result: SignatureResult) => {
    if (!sigModalState.phaseId) return;

    if (sigModalState.phaseId === 'MASTER_COMPLETION') {
      const existingMaster = adaptiveConfig.completionSignOff || {
        technicianName: adaptiveConfig.technicianName || 'Lead Technician',
        clientName: adaptiveConfig.clientName || project.client || 'Property Owner',
        signedAt: new Date().toISOString()
      };

      const nextSignOff =
        sigModalState.signerType === 'technician'
          ? {
              ...existingMaster,
              technicianName: result.name,
              technicianSignature: result.dataUrl,
              signedAt: new Date(result.timestamp).toLocaleString(),
              auditHash: result.auditHash
            }
          : {
              ...existingMaster,
              clientName: result.name,
              clientSignature: result.dataUrl,
              signedAt: new Date(result.timestamp).toLocaleString(),
              auditHash: result.auditHash
            };

      const nextConfig = { ...adaptiveConfig, completionSignOff: nextSignOff };
      setAdaptiveConfig(nextConfig);
      syncToProject(phases, nextConfig);

      EventBus.publish(
        'com.restorationai.checklist.signed',
        { phaseId: 'MASTER_COMPLETION', signer: result.name },
        project.id,
        `Final Completion Sign-Off recorded by ${result.name}`,
        'success'
      );
      return;
    }

    const updatedPhases = phases.map((phase) => {
      if (phase.id !== sigModalState.phaseId) return phase;
      const existingSig = phase.signature || {
        technicianName: '',
        technicianSignature: '',
        clientName: '',
        clientSignature: '',
        date: Date.now()
      };

      let updatedSig: PhaseSignature;
      if (sigModalState.signerType === 'technician') {
        updatedSig = {
          ...existingSig,
          technicianName: result.name,
          technicianSignature: result.dataUrl,
          signeeRole: result.role,
          date: result.timestamp,
          ipStamp: result.auditHash
        };
      } else {
        updatedSig = {
          ...existingSig,
          clientName: result.name,
          clientSignature: result.dataUrl,
          date: result.timestamp,
          ipStamp: result.auditHash
        };
      }

      return {
        ...phase,
        signature: updatedSig,
        status: phase.items.every((i) => i.completed) ? 'completed' : phase.status
      };
    });

    setPhases(updatedPhases);
    syncToProject(updatedPhases);

    EventBus.publish(
      'com.restorationai.checklist.signed',
      { phaseId: sigModalState.phaseId, signer: result.name },
      project.id,
      `Phase signed electronically by ${result.name}`,
      'success'
    );
  };

  // Field log handlers
  const handleSaveMoistureReading = (reading: MoistureReadingEntry) => {
    const updated = [reading, ...moistureLogs];
    setMoistureLogs(updated);
    syncToProject(phases, adaptiveConfig, updated);
  };

  const handleSaveEquipment = (equip: EquipmentDeployedLog) => {
    const updated = [equip, ...equipmentLogs];
    setEquipmentLogs(updated);
    syncToProject(phases, adaptiveConfig, moistureLogs, updated);
  };

  const handleSaveChemical = (chem: ChemicalTreatmentLog) => {
    const updated = [chem, ...chemicalLogs];
    setChemicalLogs(updated);
    syncToProject(phases, adaptiveConfig, moistureLogs, equipmentLogs, updated);
  };

  const handleCopySOP = () => {
    const sop = adaptiveConfig.generatedSOP || generateSummarySOP(adaptiveConfig);
    const text = [
      `${sop.title} (${sop.sopId})`,
      `Client: ${adaptiveConfig.clientName} | Date: ${adaptiveConfig.inspectionDate} | Tech: ${adaptiveConfig.technicianName}`,
      `Water Category: ${sop.waterCategory} | Loss Class: ${sop.lossClass}`,
      `Affected Areas: ${(adaptiveConfig.affectedAreas || []).join(', ')}`,
      `Materials Impacted: ${(adaptiveConfig.materialsImpacted || []).join(', ')}`,
      `Equipment Used: ${(adaptiveConfig.equipmentUsed || []).join(', ')}`,
      '',
      `EXECUTIVE DIRECTIVE: ${sop.executiveDirective}`,
      `CONTAINMENT: ${sop.containmentAndAirflowProtocol}`,
      `EXTRACTION & DEMO: ${sop.demolitionAndSalvageThreshold}`,
      `MOLD PREVENTION: ${sop.antimicrobialAndMoldProtocol}`,
      `DRYING VERIFICATION: ${sop.dryingTargetAndVerification}`,
      '',
      ...sop.steps.map((s) => `${s.phase} [${s.standardRef}]: ${s.directive} (CCP: ${s.criticalControlPoint})`)
    ].join('\n');

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    EventBus.publish(
      'com.restorationai.sop.copied',
      { projectId: project.id },
      project.id,
      'Summary SOP copied to clipboard',
      'success'
    );
  };

  // Calculations
  const metrics = calculateEquipmentMetrics(adaptiveConfig);
  const sop = adaptiveConfig.generatedSOP || generateSummarySOP(adaptiveConfig);
  const totalTasks = phases.reduce((acc, p) => acc + p.items.length, 0);
  const completedTasks = phases.reduce(
    (acc, p) => acc + p.items.filter((i) => i.completed).length,
    0
  );
  const percentComplete = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-6 pb-20">
      {/* ------------------------------------------------------------------ */}
      {/* 1. Top Adaptive Header & IICRC Metrics Control Bar                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-1.5">
              <span className="text-brand-cyan font-bold flex items-center gap-1">
                <Sparkles size={13} /> Adaptive IICRC S500 / S520 Mitigation Protocol
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-300 font-semibold">{adaptiveConfig.projectType}</span>
              <span aria-hidden="true">·</span>
              <span className={
                adaptiveConfig.waterCategory === WaterCategory.CAT_3
                  ? 'text-red-400 font-bold'
                  : adaptiveConfig.waterCategory === WaterCategory.CAT_2
                  ? 'text-amber-400 font-bold'
                  : 'text-emerald-400 font-bold'
              }>
                {adaptiveConfig.waterCategory}
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-300 font-mono tabular-nums">{adaptiveConfig.affectedSqFt} sq ft</span>
            </div>
            <h2 className="text-xl lg:text-2xl font-black text-white tracking-tight">
              Comprehensive Water Mitigation Checklist & Summary SOP
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Covers Initial Inspection, Containment, Water Extraction, Drying, Dehumidification, Mold Prevention, and Final Walkthrough with real-time SOP generation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setShowSOPPanel(!showSOPPanel)}
              className="px-4 py-2.5 rounded-xl bg-brand-cyan/15 hover:bg-brand-cyan/25 text-brand-cyan font-bold text-xs flex items-center gap-2 border border-brand-cyan/30 transition whitespace-nowrap"
            >
              <FileText size={14} />
              {showSOPPanel ? 'Hide Summary SOP' : 'View Summary SOP'}
            </button>
            <button
              onClick={() => setShowConfigEditor(!showConfigEditor)}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs flex items-center gap-2 border border-white/10 transition whitespace-nowrap"
            >
              <SlidersHorizontal size={14} className="text-brand-cyan" />
              {showConfigEditor ? 'Hide Job Fields' : 'Edit Job Fields'}
            </button>
            <button
              onClick={handleRegenerateChecklistAndSOP}
              className="px-4 py-2.5 rounded-xl bg-brand-cyan hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-lg transition whitespace-nowrap"
            >
              <RefreshCw size={13} />
              Recalibrate SOP
            </button>
          </div>
        </div>

        {/* Overall Completion Bar */}
        <div className="mt-5 pt-4 border-t border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-4">
            <div className="text-2xl font-black text-white font-mono tabular-nums">{percentComplete}%</div>
            <div>
              <div className="text-xs font-bold text-slate-300 tabular-nums">
                {completedTasks} of {totalTasks} Mitigation Steps Verified Across 7 Phases
              </div>
              <div className="text-[11px] text-slate-400">
                Lead Tech: <span className="text-slate-200 font-semibold">{adaptiveConfig.technicianName}</span> · Client: <span className="text-slate-200 font-semibold">{adaptiveConfig.clientName}</span> · Date: <span className="text-slate-200 font-mono">{adaptiveConfig.inspectionDate}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="flex-1 bg-slate-950 rounded-full h-2.5 overflow-hidden border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-300"
                style={{ width: `${percentComplete}%` }}
              />
            </div>
            <button
              onClick={expandAllPhases}
              className="text-xs font-semibold text-brand-cyan hover:underline whitespace-nowrap"
            >
              {expandedPhases.length === phases.length ? 'Collapse All' : 'Expand All 7 Phases'}
            </button>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* IICRC S500 Dynamic Formula KPIs                                  */}
        {/* ---------------------------------------------------------------- */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-white/5">
          <div className="p-3 bg-slate-950/70 border border-white/5 rounded-2xl">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Wind size={11} className="text-cyan-400" /> Air Movers (Drying)
            </div>
            <div className="text-lg font-black text-white mt-0.5 font-mono tabular-nums">
              {metrics.airMovers} Units
            </div>
            <div className="text-[10px] text-slate-400 font-mono tabular-nums">~{metrics.approxPerimeterLF} LF Perimeter</div>
          </div>

          <div className="p-3 bg-slate-950/70 border border-white/5 rounded-2xl">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Gauge size={11} className="text-blue-400" /> Dehumidification
            </div>
            <div className="text-lg font-black text-white mt-0.5 font-mono tabular-nums">
              {metrics.ahamPintsRequired} PPD
            </div>
            <div className="text-[10px] text-slate-400 font-mono tabular-nums">{metrics.lgrCount} LGR ({adaptiveConfig.lossClass.split(' (')[0]})</div>
          </div>

          <div className="p-3 bg-slate-950/70 border border-white/5 rounded-2xl">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <FlaskConical size={11} className="text-purple-400" /> HEPA Filtration
            </div>
            <div className="text-lg font-black text-white mt-0.5 font-mono tabular-nums">
              {metrics.scrubberCount > 0 ? `${metrics.scrubberCount} HEPA Units` : '1 HEPA Unit'}
            </div>
            <div className="text-[10px] text-slate-400 font-mono tabular-nums">{metrics.requiredCFM} CFM (6 ACH Target)</div>
          </div>

          <div className="p-3 bg-slate-950/70 border border-white/5 rounded-2xl">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <ShieldCheck size={11} className="text-emerald-400" /> Containment Spec
            </div>
            <div className="text-xs font-bold text-white mt-1 truncate" title={metrics.containmentLevel}>
              {adaptiveConfig.waterCategory === WaterCategory.CAT_3 || adaptiveConfig.moldIdentified ? 'Critical (-0.02 in. w.g.)' : 'Chamber Isolation'}
            </div>
            <div className="text-[10px] text-slate-400 font-mono tabular-nums">{metrics.cuFt.toLocaleString()} cu. ft. Volume</div>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Key Job Fields & Adaptive Parameter Intake Panel                 */}
        {/* ---------------------------------------------------------------- */}
        {showConfigEditor && (
          <div className="mt-5 p-5 bg-slate-950 border border-white/10 rounded-2xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/5">
              <div>
                <h3 className="text-sm font-black text-white tracking-tight">
                  Key Mitigation Intake Fields & Adaptive Parameters
                </h3>
                <p className="text-xs text-slate-400">
                  Client information, date, technician name, water category, affected areas, materials impacted, and equipment used.
                </p>
              </div>
              <span className="text-[11px] text-brand-cyan font-semibold">
                All changes automatically adapt the 7-phase checklist & SOP
              </span>
            </div>

            {/* Row 1: Client Info, Date, Technician Name, Address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <User size={11} className="text-brand-cyan" /> Client Name
                </label>
                <input
                  type="text"
                  value={adaptiveConfig.clientName || ''}
                  onChange={(e) => handleConfigChange({ clientName: e.target.value }, false)}
                  placeholder="Client Full Name"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white font-semibold focus:border-brand-cyan focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <MapPin size={11} className="text-brand-cyan" /> Property Address / Client Contact
                </label>
                <input
                  type="text"
                  value={adaptiveConfig.propertyAddress || ''}
                  onChange={(e) => handleConfigChange({ propertyAddress: e.target.value }, false)}
                  placeholder="Property Address"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white font-semibold focus:border-brand-cyan focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Calendar size={11} className="text-brand-cyan" /> Inspection / Mitigation Date
                </label>
                <input
                  type="date"
                  value={adaptiveConfig.inspectionDate || ''}
                  onChange={(e) => handleConfigChange({ inspectionDate: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white font-mono font-semibold focus:border-brand-cyan focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <ClipboardCheck size={11} className="text-brand-cyan" /> Lead Technician Name
                </label>
                <input
                  type="text"
                  value={adaptiveConfig.technicianName || ''}
                  onChange={(e) => handleConfigChange({ technicianName: e.target.value })}
                  placeholder="Technician Name & Cert #"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white font-semibold focus:border-brand-cyan focus:outline-none"
                />
              </div>
            </div>

            {/* Row 2: Project Type, Loss Source, Water Category, Loss Class, Sq Ft, Water Depth */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs pt-2 border-t border-white/5">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Project Type (Drives SOP Protocol)
                </label>
                <select
                  value={adaptiveConfig.projectType}
                  onChange={(e) => handleConfigChange({ projectType: e.target.value as MitigationProjectType })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white font-semibold focus:border-brand-cyan focus:outline-none"
                >
                  <option value="Residential - Single Family">Residential - Single Family</option>
                  <option value="Residential - Multi-Family / Condo">Residential - Multi-Family / Condo</option>
                  <option value="Commercial - Office / Corporate">Commercial - Office / Corporate</option>
                  <option value="Commercial - Retail / Hospitality">Commercial - Retail / Hospitality</option>
                  <option value="Commercial - Healthcare / Clinic">Commercial - Healthcare / Clinic</option>
                  <option value="Commercial - Institutional / School">Commercial - Institutional / School</option>
                  <option value="Industrial / Warehouse Facility">Industrial / Warehouse Facility</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Water Intrusion Origin / Source
                </label>
                <select
                  value={adaptiveConfig.lossSource}
                  onChange={(e) => handleConfigChange({ lossSource: e.target.value as MitigationLossSource })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white font-semibold focus:border-brand-cyan focus:outline-none"
                >
                  <option value="Clean Water Pipe Burst / Supply Line">Clean Water Pipe Burst / Supply Line</option>
                  <option value="Appliance Failure / Overflow">Appliance Failure / Overflow</option>
                  <option value="Groundwater Infiltration / Overland Flood">Groundwater Infiltration / Overland Flood</option>
                  <option value="Sewage Backup / Blackwater Backflow">Sewage Backup / Blackwater Backflow</option>
                  <option value="Roof Leak / Storm Intrusion">Roof Leak / Storm Intrusion</option>
                  <option value="Fire Sprinkler System Discharge">Fire Sprinkler System Discharge</option>
                  <option value="Microbial / Mold Amplification">Microbial / Mold Amplification</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Water Category (IICRC S500)
                </label>
                <select
                  value={adaptiveConfig.waterCategory}
                  onChange={(e) => {
                    const cat = e.target.value as WaterCategory;
                    handleConfigChange({
                      waterCategory: cat,
                      containmentRequired: cat === WaterCategory.CAT_3 || adaptiveConfig.containmentRequired,
                      negativeAirRequired: cat === WaterCategory.CAT_3 || adaptiveConfig.negativeAirRequired
                    });
                  }}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white font-semibold focus:border-brand-cyan focus:outline-none"
                >
                  <option value={WaterCategory.CAT_1}>{WaterCategory.CAT_1}</option>
                  <option value={WaterCategory.CAT_2}>{WaterCategory.CAT_2}</option>
                  <option value={WaterCategory.CAT_3}>{WaterCategory.CAT_3}</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Loss Class (Evaporation Load)
                </label>
                <select
                  value={adaptiveConfig.lossClass}
                  onChange={(e) => handleConfigChange({ lossClass: e.target.value as LossClass })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white font-semibold focus:border-brand-cyan focus:outline-none"
                >
                  <option value={LossClass.CLASS_1}>{LossClass.CLASS_1}</option>
                  <option value={LossClass.CLASS_2}>{LossClass.CLASS_2}</option>
                  <option value={LossClass.CLASS_3}>{LossClass.CLASS_3}</option>
                  <option value={LossClass.CLASS_4}>{LossClass.CLASS_4}</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Affected Area (Sq Ft)
                </label>
                <input
                  type="number"
                  value={adaptiveConfig.affectedSqFt}
                  onChange={(e) => handleConfigChange({ affectedSqFt: Math.max(50, parseInt(e.target.value) || 100) })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white font-mono font-semibold focus:border-brand-cyan focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Standing Water Depth (Inches)
                </label>
                <input
                  type="number"
                  step="0.25"
                  value={adaptiveConfig.standingWaterDepthInches}
                  onChange={(e) => handleConfigChange({ standingWaterDepthInches: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white font-mono font-semibold focus:border-brand-cyan focus:outline-none"
                />
              </div>
            </div>

            {/* Row 3: Affected Areas, Materials Impacted, Equipment Used Multi-Selectors */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-3 border-t border-white/5">
              {/* Affected Areas */}
              <div className="bg-slate-900/70 border border-white/5 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin size={12} className="text-brand-cyan" /> Affected Areas ({(adaptiveConfig.affectedAreas || []).length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(new Set([...PRESET_AREAS, ...(adaptiveConfig.affectedAreas || [])])).map((area) => {
                    const active = (adaptiveConfig.affectedAreas || []).includes(area);
                    return (
                      <button
                        key={area}
                        type="button"
                        onClick={() => toggleArrayTag('affectedAreas', area)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition border whitespace-nowrap ${
                          active
                            ? 'bg-brand-cyan text-slate-950 border-brand-cyan font-bold'
                            : 'bg-slate-950 text-slate-400 border-white/10 hover:text-white'
                        }`}
                      >
                        {area}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-1.5 pt-1">
                  <input
                    type="text"
                    value={customAreaInput}
                    onChange={(e) => setCustomAreaInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTag('affectedAreas', customAreaInput, () => setCustomAreaInput('')))}
                    placeholder="Add custom room/zone..."
                    className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-brand-cyan focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => addCustomTag('affectedAreas', customAreaInput, () => setCustomAreaInput(''))}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs font-bold"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Materials Impacted */}
              <div className="bg-slate-900/70 border border-white/5 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Layers size={12} className="text-amber-400" /> Materials Impacted ({(adaptiveConfig.materialsImpacted || []).length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(new Set([...PRESET_MATERIALS, ...(adaptiveConfig.materialsImpacted || [])])).map((mat) => {
                    const active = (adaptiveConfig.materialsImpacted || []).includes(mat);
                    return (
                      <button
                        key={mat}
                        type="button"
                        onClick={() => toggleArrayTag('materialsImpacted', mat)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition border whitespace-nowrap ${
                          active
                            ? 'bg-amber-400 text-slate-950 border-amber-400 font-bold'
                            : 'bg-slate-950 text-slate-400 border-white/10 hover:text-white'
                        }`}
                      >
                        {mat}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-1.5 pt-1">
                  <input
                    type="text"
                    value={customMaterialInput}
                    onChange={(e) => setCustomMaterialInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTag('materialsImpacted', customMaterialInput, () => setCustomMaterialInput('')))}
                    placeholder="Add impacted material..."
                    className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-brand-cyan focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => addCustomTag('materialsImpacted', customMaterialInput, () => setCustomMaterialInput(''))}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs font-bold"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Equipment Used */}
              <div className="bg-slate-900/70 border border-white/5 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Wrench size={12} className="text-emerald-400" /> Equipment Used ({(adaptiveConfig.equipmentUsed || []).length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(new Set([...PRESET_EQUIPMENT, ...(adaptiveConfig.equipmentUsed || [])])).map((eq) => {
                    const active = (adaptiveConfig.equipmentUsed || []).includes(eq);
                    return (
                      <button
                        key={eq}
                        type="button"
                        onClick={() => toggleArrayTag('equipmentUsed', eq)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition border whitespace-nowrap ${
                          active
                            ? 'bg-emerald-400 text-slate-950 border-emerald-400 font-bold'
                            : 'bg-slate-950 text-slate-400 border-white/10 hover:text-white'
                        }`}
                      >
                        {eq}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-1.5 pt-1">
                  <input
                    type="text"
                    value={customEquipmentInput}
                    onChange={(e) => setCustomEquipmentInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTag('equipmentUsed', customEquipmentInput, () => setCustomEquipmentInput('')))}
                    placeholder="Add deployed unit..."
                    className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-brand-cyan focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => addCustomTag('equipmentUsed', customEquipmentInput, () => setCustomEquipmentInput(''))}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs font-bold"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Row 4: Hazard Flags */}
            <div className="flex flex-wrap items-center gap-5 pt-2 border-t border-white/5 text-xs text-slate-300">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={adaptiveConfig.pre1985Structure}
                  onChange={(e) => handleConfigChange({ pre1985Structure: e.target.checked })}
                  className="rounded border-white/20 bg-slate-900 text-brand-cyan focus:ring-brand-cyan"
                />
                <span>Pre-1985 Structure (Triggers Asbestos/Lead NESHAP & EPA RRP Hold)</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={adaptiveConfig.moldIdentified}
                  onChange={(e) => handleConfigChange({ moldIdentified: e.target.checked })}
                  className="rounded border-white/20 bg-slate-900 text-brand-cyan focus:ring-brand-cyan"
                />
                <span>Visible Microbial / Mold Growth (Triggers ANSI/IICRC S520 Protocol)</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={adaptiveConfig.negativeAirRequired}
                  onChange={(e) => handleConfigChange({ negativeAirRequired: e.target.checked, containmentRequired: e.target.checked })}
                  className="rounded border-white/20 bg-slate-900 text-brand-cyan focus:ring-brand-cyan"
                />
                <span>Negative Air Pressure (-0.02 in. w.g.) Containment Required</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Generated Summary SOP Panel (Based on Project Type & Category)  */}
      {/* ------------------------------------------------------------------ */}
      {showSOPPanel && (
        <div className="bg-slate-900 border border-brand-cyan/30 rounded-3xl p-6 shadow-xl space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-white/10">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-brand-cyan font-mono mb-1">
                <span>{sop.sopId}</span>
                <span aria-hidden="true">·</span>
                <span>Generated for {sop.projectType}</span>
                <span aria-hidden="true">·</span>
                <span>{sop.lossSource}</span>
              </div>
              <h3 className="text-lg font-black text-white tracking-tight">
                {sop.title}
              </h3>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleCopySOP}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 font-bold text-xs flex items-center gap-1.5 border border-white/10 transition whitespace-nowrap"
              >
                <Copy size={13} /> Copy Summary SOP
              </button>
            </div>
          </div>

          {/* Executive Summary Blocks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-white/5 space-y-1.5">
              <div className="text-[10px] font-black text-brand-cyan uppercase tracking-wider">
                Executive Field Directive ({sop.projectType})
              </div>
              <p className="text-slate-200 leading-relaxed">{sop.executiveDirective}</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/80 border border-white/5 space-y-1.5">
              <div className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">
                Containment & Negative Air Specification
              </div>
              <p className="text-slate-200 leading-relaxed">{sop.containmentAndAirflowProtocol}</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/80 border border-white/5 space-y-1.5">
              <div className="text-[10px] font-black text-amber-400 uppercase tracking-wider">
                Material Salvageability & Demolition Thresholds
              </div>
              <p className="text-slate-200 leading-relaxed">{sop.demolitionAndSalvageThreshold}</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/80 border border-white/5 space-y-1.5">
              <div className="text-[10px] font-black text-purple-400 uppercase tracking-wider">
                Mold Prevention & Drying Target Verification
              </div>
              <p className="text-slate-200 leading-relaxed">
                {sop.antimicrobialAndMoldProtocol} {sop.dryingTargetAndVerification}
              </p>
            </div>
          </div>

          {/* 7-Step SOP Protocol Matrix */}
          <div className="overflow-x-auto border border-white/5 rounded-2xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 border-b border-white/10 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">SOP Phase</th>
                  <th className="py-3 px-4">Standard Ref</th>
                  <th className="py-3 px-4">Field Procedure & Equipment Directive</th>
                  <th className="py-3 px-4">Critical Control Point</th>
                  <th className="py-3 px-4">Required PPE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-slate-950/40">
                {sop.steps.map((step, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4 font-bold text-white whitespace-nowrap">{step.phase}</td>
                    <td className="py-3 px-4 font-mono text-brand-cyan whitespace-nowrap">{step.standardRef}</td>
                    <td className="py-3 px-4 text-slate-300 leading-relaxed min-w-[260px]">{step.directive}</td>
                    <td className="py-3 px-4 text-amber-300/90 font-medium min-w-[200px]">{step.criticalControlPoint}</td>
                    <td className="py-3 px-4 text-slate-400 min-w-[160px]">{step.requiredPPE}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3. Interactive Data Logging Quick Action Bar                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          onClick={() => setIsMoistureModalOpen(true)}
          className="p-4 bg-slate-900 hover:bg-slate-800 border border-cyan-500/20 hover:border-cyan-500/50 rounded-2xl flex items-center justify-between text-left transition group shadow-lg"
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center group-hover:scale-105 transition">
              <Gauge size={20} />
            </div>
            <div>
              <div className="text-xs font-black text-white uppercase tracking-wider">
                Record Moisture Reading · <span className="text-cyan-400 font-mono tabular-nums">{moistureLogs.length}</span>
              </div>
              <div className="text-[11px] text-slate-400">Log material MC % & dry standard goals</div>
            </div>
          </div>
          <Plus size={16} className="text-cyan-400" />
        </button>

        <button
          onClick={() => setIsEquipmentModalOpen(true)}
          className="p-4 bg-slate-900 hover:bg-slate-800 border border-blue-500/20 hover:border-blue-500/50 rounded-2xl flex items-center justify-between text-left transition group shadow-lg"
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center group-hover:scale-105 transition">
              <Wind size={20} />
            </div>
            <div>
              <div className="text-xs font-black text-white uppercase tracking-wider">
                Deploy Equipment · <span className="text-blue-400 font-mono tabular-nums">{equipmentLogs.length}</span>
              </div>
              <div className="text-[11px] text-slate-400">Track air movers, LGR dehus & amp draws</div>
            </div>
          </div>
          <Plus size={16} className="text-blue-400" />
        </button>

        <button
          onClick={() => setIsChemicalModalOpen(true)}
          className="p-4 bg-slate-900 hover:bg-slate-800 border border-purple-500/20 hover:border-purple-500/50 rounded-2xl flex items-center justify-between text-left transition group shadow-lg"
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center group-hover:scale-105 transition">
              <FlaskConical size={20} />
            </div>
            <div>
              <div className="text-xs font-black text-white uppercase tracking-wider">
                Log Mold / Biocide Treatment · <span className="text-purple-400 font-mono tabular-nums">{chemicalLogs.length}</span>
              </div>
              <div className="text-[11px] text-slate-400">EPA reg #, dwell time & SDS compliance</div>
            </div>
          </div>
          <Plus size={16} className="text-purple-400" />
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 4. 7-Section Adaptive Checklist Cards                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-4">
        {phases.map((phase, pIdx) => {
          const isExpanded = expandedPhases.includes(phase.id);
          const completedCount = phase.items.filter((i) => i.completed).length;
          const isAllComplete = completedCount === phase.items.length && phase.items.length > 0;
          const hasSignature = !!phase.signature?.technicianSignature;

          return (
            <div
              key={phase.id}
              className={`bg-slate-900 border rounded-3xl transition-all duration-200 overflow-hidden shadow-xl ${
                isAllComplete
                  ? 'border-emerald-500/30'
                  : isExpanded
                  ? 'border-brand-cyan/30'
                  : 'border-white/5'
              }`}
            >
              {/* Phase Header */}
              <div
                onClick={() => togglePhase(phase.id)}
                className="p-5 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition"
              >
                <div className="flex items-center space-x-4">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm border transition font-mono tabular-nums ${
                      isAllComplete
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-white/5 text-brand-cyan border-white/10'
                    }`}
                  >
                    {isAllComplete ? <Check size={20} /> : `0${pIdx + 1}`}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm md:text-base font-black text-white tracking-tight">
                        {phase.title}
                      </h3>
                      {isAllComplete && (
                        <span className="text-xs font-bold text-emerald-400">
                          · Section Complete
                        </span>
                      )}
                    </div>
                    {phase.subtitle && (
                      <p className="text-xs text-slate-400 mt-0.5">{phase.subtitle}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="text-right hidden sm:block">
                    <div className="text-xs font-bold text-white font-mono tabular-nums">
                      {completedCount} / {phase.items.length} Completed
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {hasSignature ? `Signed by ${phase.signature?.technicianName}` : 'Awaiting Phase Sign-Off'}
                    </div>
                  </div>
                  <div className="p-2 text-slate-400">
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </div>
                </div>
              </div>

              {/* Phase Body (Expanded) */}
              {isExpanded && (
                <div className="px-5 pb-6 pt-2 border-t border-white/5 space-y-4">
                  {/* Phase Tasks List */}
                  <div className="space-y-2.5">
                    {phase.items.map((item) => (
                      <div
                        key={item.id}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          item.completed
                            ? 'bg-emerald-950/20 border-emerald-500/20 text-slate-300'
                            : 'bg-slate-950/60 border-white/5 text-white hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div
                            onClick={() => toggleItem(phase.id, item.id)}
                            className="flex items-start space-x-3 cursor-pointer flex-1"
                          >
                            <div className="mt-0.5 text-brand-cyan">
                              {item.completed ? (
                                <CheckCircle size={18} className="text-emerald-400" />
                              ) : (
                                <Circle size={18} className="text-slate-600 hover:text-slate-400" />
                              )}
                            </div>
                            <div className="space-y-1">
                              <p
                                className={`text-xs md:text-sm font-bold leading-snug ${
                                  item.completed ? 'line-through text-slate-400' : 'text-slate-100'
                                }`}
                              >
                                {item.label}
                              </p>
                              {item.notes && (
                                <p className="text-[11px] text-slate-400 font-medium">
                                  {item.notes}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Standard Reference Metadata (Unboxed per Zero-Pill rule) */}
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono shrink-0">
                            {item.iicrcStandard && <span>{item.iicrcStandard}</span>}
                            {item.isAdaptive && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-brand-cyan font-sans font-bold">Adaptive</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add Custom Checklist Item to this Section */}
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={newTaskInput[phase.id] || ''}
                      onChange={(e) => setNewTaskInput((prev) => ({ ...prev, [phase.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCustomTask(phase.id))}
                      placeholder={`Add custom field check to ${phase.title}...`}
                      className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-brand-cyan focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddCustomTask(phase.id)}
                      className="px-3.5 py-2 bg-white/5 hover:bg-white/10 text-slate-200 rounded-xl text-xs font-bold border border-white/10 whitespace-nowrap"
                    >
                      + Add Step
                    </button>
                  </div>

                  {/* Embedded Equipment Logs in Section 4 (Drying) & Section 5 (Dehumidification) */}
                  {(phase.id === 'phase_4_drying' || phase.id === 'phase_5_dehumidification') && (
                    <div className="p-4 bg-slate-950 rounded-2xl border border-white/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Wind size={15} className="text-blue-400" />
                          <h4 className="text-xs font-black text-white uppercase tracking-wider">
                            Deployed Drying & Dehumidification Assets
                          </h4>
                        </div>
                        <button
                          onClick={() => setIsEquipmentModalOpen(true)}
                          className="text-[11px] font-bold text-brand-cyan hover:underline flex items-center gap-1"
                        >
                          <Plus size={12} /> Log Equipment
                        </button>
                      </div>

                      {equipmentLogs.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">No equipment logged yet.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {equipmentLogs.map((eq) => (
                            <div
                              key={eq.id}
                              className="p-3 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-between text-xs"
                            >
                              <div>
                                <div className="font-bold text-white">{eq.model}</div>
                                <div className="text-[11px] text-slate-400">
                                  SN: {eq.serialNumber || 'N/A'} · {eq.roomLocation}
                                </div>
                              </div>
                              <div className="text-right font-mono tabular-nums">
                                <div className="text-xs text-amber-400 font-bold">
                                  {eq.amperage}A
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {eq.actualHours || 0} / {eq.targetRunHours} hrs
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Embedded Moisture Matrix in Section 1, 5, or 7 */}
                  {(phase.id === 'phase_1_inspection' || phase.id === 'phase_5_dehumidification' || phase.id === 'phase_7_final_walkthrough') && (
                    <div className="p-4 bg-slate-950 rounded-2xl border border-white/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Gauge size={15} className="text-cyan-400" />
                          <h4 className="text-xs font-black text-white uppercase tracking-wider">
                            Material Moisture Matrix & Dry Standard Verification
                          </h4>
                        </div>
                        <button
                          onClick={() => setIsMoistureModalOpen(true)}
                          className="text-[11px] font-bold text-brand-cyan hover:underline flex items-center gap-1"
                        >
                          <Plus size={12} /> Log Pin Reading
                        </button>
                      </div>

                      {moistureLogs.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">No moisture readings entered yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {moistureLogs.map((mr) => (
                            <div
                              key={mr.id}
                              className="p-3 rounded-xl bg-slate-900 border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs"
                            >
                              <div>
                                <div className="font-bold text-white">
                                  {mr.materialName} <span className="text-slate-400 font-normal">· {mr.roomName}</span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  Method: {mr.readingType} {mr.locationDetails ? `· ${mr.locationDetails}` : ''}
                                </div>
                              </div>
                              <div className="flex items-center space-x-3 font-mono tabular-nums">
                                <div className="text-right">
                                  <div className="text-[10px] text-slate-400">Dry Goal: ≤{mr.dryGoalMC}%</div>
                                  <div className={`font-black text-sm ${mr.currentMC <= mr.dryGoalMC ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {mr.currentMC}% MC · {mr.currentMC <= mr.dryGoalMC ? 'DRY' : 'WET'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Embedded Chemical Logs in Section 6 (Mold Prevention) */}
                  {phase.id === 'phase_6_mold_prevention' && (
                    <div className="p-4 bg-slate-950 rounded-2xl border border-white/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FlaskConical size={15} className="text-purple-400" />
                          <h4 className="text-xs font-black text-white uppercase tracking-wider">
                            EPA-Registered Mold Prevention & Antimicrobial Log
                          </h4>
                        </div>
                        <button
                          onClick={() => setIsChemicalModalOpen(true)}
                          className="text-[11px] font-bold text-brand-cyan hover:underline flex items-center gap-1"
                        >
                          <Plus size={12} /> Add Biocide Record
                        </button>
                      </div>

                      {chemicalLogs.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">No antimicrobial treatments logged yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {chemicalLogs.map((chem) => (
                            <div
                              key={chem.id}
                              className="p-3 rounded-xl bg-slate-900 border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs"
                            >
                              <div>
                                <div className="font-bold text-white">
                                  {chem.productName} <span className="text-purple-400 font-mono">· {chem.epaRegNumber}</span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  Active: {chem.activeIngredient} · Method: {chem.applicationMethod} · Dwell: {chem.dwellTimeMinutes} mins
                                </div>
                              </div>
                              <div className="text-right text-[11px] text-slate-400 font-mono tabular-nums">
                                <div>{chem.sqFtTreated} Sq Ft · {chem.appliedAt}</div>
                                <div className="text-emerald-400 font-sans font-semibold">
                                  {chem.clientNotifiedOfReEntry ? '✓ Occupant Re-Entry Cleared' : 'Notice Pending'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Phase Electronic Sign-Off Section */}
                  <div className="pt-3 border-t border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950/40 p-3.5 rounded-2xl">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Lock size={12} className="text-brand-cyan" /> Section Verification Sign-Off
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {hasSignature
                          ? `Verified by ${phase.signature?.technicianName} on ${new Date(phase.signature?.date || 0).toLocaleDateString()}`
                          : 'Requires technician attestation upon completing section tasks.'}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {hasSignature ? (
                        <div className="flex items-center space-x-2">
                          <img
                            src={phase.signature?.technicianSignature}
                            alt="Technician Signature"
                            className="h-9 px-2 bg-slate-950 border border-white/10 rounded-xl object-contain"
                          />
                          <button
                            onClick={() => handleOpenSignature(phase.id, 'technician')}
                            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition"
                          >
                            Re-sign
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenSignature(phase.id, 'technician')}
                          className="px-4 py-2 bg-brand-cyan hover:bg-cyan-400 text-slate-900 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow transition active:scale-95 whitespace-nowrap"
                        >
                          <PenTool size={13} /> Sign Section
                        </button>
                      )}

                      {!phase.signature?.clientSignature ? (
                        <button
                          onClick={() => handleOpenSignature(phase.id, 'client')}
                          className="px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition whitespace-nowrap"
                        >
                          Client Witness
                        </button>
                      ) : (
                        <span className="text-xs text-emerald-400 font-bold px-2">
                          ✓ Client Witnessed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 5. Master Project Mitigation Completion Sign-Off Card              */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-white/5">
          <div>
            <h3 className="text-base md:text-lg font-black text-white tracking-tight flex items-center gap-2">
              <ShieldCheck size={18} className="text-emerald-400" />
              Final Mitigation Completion Sign-Off & Certificate of Satisfaction
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Attests that Initial Inspection, Containment, Water Extraction, Drying, Dehumidification, Mold Prevention, and Final Walkthrough have been completed to IICRC S500/S520 standards.
            </p>
          </div>
          <div className="text-xs text-slate-400 font-mono tabular-nums">
            {completedTasks}/{totalTasks} Checklist Items Completed ({percentComplete}%)
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Lead Technician Sign-off Box */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-white/5 flex flex-col justify-between space-y-3">
            <div>
              <div className="text-[10px] font-black text-brand-cyan uppercase tracking-wider">
                Lead Restoration Technician Sign-Off
              </div>
              <div className="text-sm font-bold text-white mt-1">
                {adaptiveConfig.completionSignOff?.technicianName || adaptiveConfig.technicianName || 'Lead Technician'}
              </div>
              <div className="text-xs text-slate-400">
                Date: {adaptiveConfig.completionSignOff?.signedAt || adaptiveConfig.inspectionDate}
              </div>
            </div>

            {adaptiveConfig.completionSignOff?.technicianSignature ? (
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <img
                  src={adaptiveConfig.completionSignOff.technicianSignature}
                  alt="Lead Technician Signature"
                  className="h-12 bg-slate-900 border border-white/10 rounded-xl px-3 object-contain"
                />
                <button
                  onClick={() => handleOpenSignature('MASTER_COMPLETION', 'technician')}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300"
                >
                  Update Signature
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleOpenSignature('MASTER_COMPLETION', 'technician')}
                className="w-full py-2.5 bg-brand-cyan hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition"
              >
                <PenTool size={14} /> Sign Technician Completion
              </button>
            )}
          </div>

          {/* Client / Property Owner Sign-off Box */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-white/5 flex flex-col justify-between space-y-3">
            <div>
              <div className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">
                Client / Property Owner Walkthrough Acceptance
              </div>
              <div className="text-sm font-bold text-white mt-1">
                {adaptiveConfig.completionSignOff?.clientName || adaptiveConfig.clientName || project.client}
              </div>
              <div className="text-xs text-slate-400">
                Property: {adaptiveConfig.propertyAddress || project.address}
              </div>
            </div>

            {adaptiveConfig.completionSignOff?.clientSignature ? (
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <img
                  src={adaptiveConfig.completionSignOff.clientSignature}
                  alt="Client Signature"
                  className="h-12 bg-slate-900 border border-white/10 rounded-xl px-3 object-contain"
                />
                <button
                  onClick={() => handleOpenSignature('MASTER_COMPLETION', 'client')}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300"
                >
                  Update Signature
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleOpenSignature('MASTER_COMPLETION', 'client')}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition"
              >
                <PenTool size={14} /> Capture Client Sign-Off
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 6. Modals                                                          */}
      {/* ------------------------------------------------------------------ */}
      <DigitalSignatureModal
        isOpen={sigModalState.isOpen}
        onClose={() => setSigModalState((prev) => ({ ...prev, isOpen: false }))}
        onSave={handleSaveSignature}
        documentTitle={sigModalState.title}
        defaultName={
          sigModalState.signerType === 'technician'
            ? adaptiveConfig.technicianName || project.assignedTeam?.[0] || 'Lead Mitigation Tech'
            : adaptiveConfig.clientName || project.client
        }
        defaultRole={
          sigModalState.signerType === 'technician'
            ? 'Lead Mitigation Technician'
            : 'Property Owner'
        }
      />

      <MoistureReadingModal
        isOpen={isMoistureModalOpen}
        onClose={() => setIsMoistureModalOpen(false)}
        onSave={handleSaveMoistureReading}
        defaultRoom={adaptiveConfig.affectedAreas?.[0] || project.rooms?.[0]?.name || 'Living Room'}
      />

      <EquipmentLoggerModal
        isOpen={isEquipmentModalOpen}
        onClose={() => setIsEquipmentModalOpen(false)}
        onSave={handleSaveEquipment}
        defaultRoom={adaptiveConfig.affectedAreas?.[0] || project.rooms?.[0]?.name || 'Living Room'}
      />

      <ChemicalTreatmentModal
        isOpen={isChemicalModalOpen}
        onClose={() => setIsChemicalModalOpen(false)}
        onSave={handleSaveChemical}
        defaultCategory={adaptiveConfig.waterCategory}
      />
    </div>
  );
};

export default DigitalChecklist;
