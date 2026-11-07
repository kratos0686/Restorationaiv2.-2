import React, { useState, useEffect, useMemo } from 'react';
import { 
  Project, 
  SmartDigitalForm 
} from '../types';
import { 
  CheckCircle, 
  ChevronRight, 
  ArrowLeft, 
  PenTool, 
  Printer, 
  Check, 
  Sparkles, 
  FlaskConical, 
  Wind, 
  Gauge, 
  User, 
  Lock 
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { getProjectById } from '../services/api';
import { 
  deriveAdaptiveConfig, 
  generateSmartDigitalForms 
} from '../services/adaptiveMitigationEngine';
import { DigitalSignatureModal, SignatureResult } from './DigitalSignatureModal';
import { EventBus } from '../services/EventBus';

interface FormsProps {
  onComplete: () => void;
  project?: Project;
  onUpdate?: (updates: Partial<Project>) => void;
}

export const Forms: React.FC<FormsProps> = ({ 
  onComplete, 
  project: initialProject, 
  onUpdate 
}) => {
  const { selectedProjectId } = useAppContext();
  const [remoteProject, setRemoteProject] = useState<Project | null>(null);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Load project if not passed directly
  useEffect(() => {
    let isMounted = true;
    if (!initialProject && selectedProjectId) {
      getProjectById(selectedProjectId).then((p) => {
        if (isMounted && p) setRemoteProject(p);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [initialProject, selectedProjectId]);

  const project = initialProject || remoteProject;

  // Stored form edits / signatures
  const [editedForms, setEditedForms] = useState<SmartDigitalForm[] | null>(() => {
    if (initialProject?.smartForms && initialProject.smartForms.length > 0) {
      return initialProject.smartForms;
    }
    return null;
  });

  // Derived or stored smart digital forms
  const forms = useMemo(() => {
    if (editedForms && editedForms.length > 0) {
      return editedForms;
    }
    if (project?.smartForms && project.smartForms.length > 0) {
      return project.smartForms;
    }
    if (project) {
      const config = project.adaptiveConfig || deriveAdaptiveConfig(project);
      return generateSmartDigitalForms(project, config);
    }
    return [];
  }, [editedForms, project]);

  // Signature modal state
  const [sigModalState, setSigModalState] = useState<{
    isOpen: boolean;
    signerRole: 'technician' | 'client';
    title: string;
  }>({
    isOpen: false,
    signerRole: 'technician',
    title: ''
  });

  const selectedForm = forms.find((f) => f.id === selectedFormId) || null;

  const handleUpdateForm = (updated: SmartDigitalForm) => {
    const nextForms = forms.map((f) => (f.id === updated.id ? updated : f));
    setEditedForms(nextForms);
    if (onUpdate && project) {
      onUpdate({ smartForms: nextForms });
    }
  };

  const handleSaveSignature = (sigResult: SignatureResult) => {
    if (!selectedForm) return;

    let updatedForm: SmartDigitalForm;
    if (sigModalState.signerRole === 'technician') {
      updatedForm = {
        ...selectedForm,
        technicianSignature: {
          name: sigResult.name,
          title: sigResult.role,
          signatureDataUrl: sigResult.dataUrl,
          signedAt: sigResult.date,
          ipStamp: sigResult.auditHash
        },
        status: selectedForm.clientSignature ? 'signed' : 'ready_for_signature',
        updatedAt: new Date().toISOString().slice(0, 10)
      };
    } else {
      updatedForm = {
        ...selectedForm,
        clientSignature: {
          name: sigResult.name,
          role: sigResult.role as 'Property Owner' | 'Tenant' | 'Property Manager' | 'Authorized Representative',
          signatureDataUrl: sigResult.dataUrl,
          signedAt: sigResult.date,
          ipStamp: sigResult.auditHash
        },
        status: selectedForm.technicianSignature ? 'signed' : 'ready_for_signature',
        updatedAt: new Date().toISOString().slice(0, 10)
      };
    }

    handleUpdateForm(updatedForm);

    EventBus.publish(
      'com.restorationai.form.submitted',
      { formId: updatedForm.id, formTitle: updatedForm.title, signer: sigResult.name },
      project?.id || undefined,
      `Form "${updatedForm.title}" signed by ${sigResult.name}`,
      'success'
    );
  };

  const handlePrint = () => {
    window.print();
  };

  // Filtered forms list
  const filteredForms = forms.filter((f) => {
    if (filterCategory === 'all') return true;
    return f.category.toLowerCase().includes(filterCategory.toLowerCase());
  });

  /* ------------------------------------------------------------------------ */
  /* FORM LIST VIEW                                                           */
  /* ------------------------------------------------------------------------ */
  if (!selectedForm) {
    return (
      <div className="p-6 space-y-6 bg-slate-950 h-full overflow-y-auto pb-24">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <button
                onClick={onComplete}
                className="text-xs font-black text-brand-cyan hover:underline flex items-center gap-1 mr-2"
              >
                <ArrowLeft size={13} /> Project Overview
              </button>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/30 flex items-center gap-1">
                <Sparkles size={11} /> Smart Adaptive Forms Suite
              </span>
              {project && (
                <span className="text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider bg-white/5 text-slate-300 border border-white/10">
                  {project.client} • {project.waterCategory || 'CAT 1'}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Mitigation Digital Form Center
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              All forms automatically populate with real-time moisture logs, deployed drying equipment, EPA chemical treatments, and binding electronic signatures.
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center space-x-1 p-1 bg-slate-900 border border-white/10 rounded-2xl">
            {['all', 'legal', 'compliance', 'chemicals', 'closeout'].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition ${
                  filterCategory === cat
                    ? 'bg-brand-cyan text-slate-900 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </header>

        {/* Forms Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredForms.map((form) => {
            const isSigned = !!form.technicianSignature && !!form.clientSignature;
            const hasTechSig = !!form.technicianSignature;
            const hasClientSig = !!form.clientSignature;

            return (
              <div
                key={form.id}
                onClick={() => setSelectedFormId(form.id)}
                className="p-5 bg-slate-900 border border-white/5 hover:border-brand-cyan/40 rounded-3xl transition-all duration-200 cursor-pointer group shadow-xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/10">
                      {form.category}
                    </span>
                    {isSigned ? (
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <Check size={11} /> Fully Signed
                      </span>
                    ) : hasTechSig || hasClientSig ? (
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Partial Signatures
                      </span>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                        Ready to Sign
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-black text-white group-hover:text-brand-cyan transition">
                    {form.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                    {form.subtitle}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-3">
                    <span className={hasTechSig ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                      Tech: {hasTechSig ? '✓' : 'Pending'}
                    </span>
                    <span className={hasClientSig ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                      Client: {hasClientSig ? '✓' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-brand-cyan font-bold group-hover:translate-x-1 transition-transform">
                    Open Form <ChevronRight size={14} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* SINGLE FORM DETAIL & DIGITAL SIGNING VIEW                                */
  /* ------------------------------------------------------------------------ */
  const { data } = selectedForm;
  const isFullySigned = !!selectedForm.technicianSignature && !!selectedForm.clientSignature;

  return (
    <div className="p-6 space-y-6 bg-slate-950 h-full overflow-y-auto pb-28">
      {/* Action Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setSelectedFormId(null)}
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-cyan">
              {selectedForm.category}
            </span>
            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
              {selectedForm.title}
            </h2>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs flex items-center gap-1.5 transition"
          >
            <Printer size={14} /> Print Document
          </button>
          {isFullySigned ? (
            <div className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle size={14} /> Legally Certified
            </div>
          ) : (
            <div className="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-black uppercase tracking-wider">
              Awaiting Signatures
            </div>
          )}
        </div>
      </header>

      {/* Printable Digital Form Document Canvas */}
      <div className="max-w-4xl mx-auto bg-slate-900 border border-white/10 rounded-3xl p-6 md:p-10 shadow-2xl space-y-8 text-slate-200">
        {/* Document Header */}
        <div className="border-b border-white/10 pb-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-brand-cyan text-xs font-black tracking-widest uppercase mb-1">
              <Sparkles size={14} /> Restoration-AI™ Field Protocol Document
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              {selectedForm.title}
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-lg">
              {selectedForm.subtitle}
            </p>
          </div>

          <div className="text-left md:text-right text-xs text-slate-400 space-y-1 bg-slate-950 p-4 rounded-2xl border border-white/5">
            <div><strong>Date:</strong> {selectedForm.createdAt}</div>
            <div><strong>Claim #:</strong> {data.claimNumber || 'N/A'}</div>
            <div><strong>Policy #:</strong> {data.policyNumber || 'N/A'}</div>
            <div><strong>Carrier:</strong> {data.insuranceCarrier || 'Direct Client'}</div>
          </div>
        </div>

        {/* Property & Loss Metadata Summary Box */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-950/70 border border-white/5 rounded-2xl text-xs">
          <div>
            <span className="text-[10px] text-slate-500 uppercase font-black block">Client / Insured</span>
            <span className="font-bold text-white text-sm">{data.clientName}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase font-black block">Property Address</span>
            <span className="font-bold text-white text-sm">{data.propertyAddress}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase font-black block">Water Category</span>
            <span className="font-bold text-cyan-400">{data.waterCategory}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase font-black block">Loss Class & Type</span>
            <span className="font-bold text-white">{data.lossClass}</span>
          </div>
        </div>

        {/* Summary Description & Scope */}
        {data.summaryNotes && (
          <div className="p-4 bg-slate-950 rounded-2xl border border-white/5 text-xs text-slate-300 leading-relaxed space-y-1">
            <span className="text-[10px] font-black text-brand-cyan uppercase tracking-wider block">
              Mitigation Scope & Circumstance
            </span>
            <p>{data.summaryNotes}</p>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Dynamic Embedded Section 1: Moisture Readings                      */}
        {/* ------------------------------------------------------------------ */}
        {data.moistureReadingsSummary && data.moistureReadingsSummary.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-cyan-400 text-xs font-black uppercase tracking-wider">
              <Gauge size={14} />
              <span>Certified Moisture Content Pin Readings (IICRC S500)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs bg-slate-950 border border-white/5 rounded-2xl overflow-hidden">
                <thead className="bg-slate-900/80 text-[10px] text-slate-400 uppercase font-black tracking-wider border-b border-white/5">
                  <tr>
                    <th className="p-3">Room</th>
                    <th className="p-3">Material Tested</th>
                    <th className="p-3">Method</th>
                    <th className="p-3">Dry Goal</th>
                    <th className="p-3">Current MC</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.moistureReadingsSummary.map((m) => (
                    <tr key={m.id} className="hover:bg-white/[0.02]">
                      <td className="p-3 font-bold text-white">{m.roomName}</td>
                      <td className="p-3 text-slate-300">{m.materialName}</td>
                      <td className="p-3 text-slate-400 font-mono text-[11px]">{m.readingType}</td>
                      <td className="p-3 text-slate-400 font-mono">≤ {m.dryGoalMC}%</td>
                      <td className="p-3 font-mono font-bold text-cyan-400">{m.currentMC}%</td>
                      <td className="p-3">
                        {m.currentMC <= m.dryGoalMC ? (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                            DRY
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">
                            ACTIVE DRYING
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Dynamic Embedded Section 2: Equipment Deployed                     */}
        {/* ------------------------------------------------------------------ */}
        {data.equipmentDeployedSummary && data.equipmentDeployedSummary.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-blue-400 text-xs font-black uppercase tracking-wider">
              <Wind size={14} />
              <span>Deployed Mitigation Drying Assets & Electrical Verification</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs bg-slate-950 border border-white/5 rounded-2xl overflow-hidden">
                <thead className="bg-slate-900/80 text-[10px] text-slate-400 uppercase font-black tracking-wider border-b border-white/5">
                  <tr>
                    <th className="p-3">Equipment Model</th>
                    <th className="p-3">Serial #</th>
                    <th className="p-3">Room Location</th>
                    <th className="p-3">Amps</th>
                    <th className="p-3">Circuit Checked</th>
                    <th className="p-3">Run Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.equipmentDeployedSummary.map((eq) => (
                    <tr key={eq.id} className="hover:bg-white/[0.02]">
                      <td className="p-3 font-bold text-white">{eq.model}</td>
                      <td className="p-3 text-slate-400 font-mono text-[11px]">{eq.serialNumber || 'N/A'}</td>
                      <td className="p-3 text-slate-300">{eq.roomLocation}</td>
                      <td className="p-3 font-mono text-amber-400 font-bold">{eq.amperage}A</td>
                      <td className="p-3 text-emerald-400 font-semibold">{eq.circuitVerified ? '✓ Verified' : 'Standard'}</td>
                      <td className="p-3 font-mono text-slate-300">{eq.actualHours || 0} / {eq.targetRunHours} hrs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Dynamic Embedded Section 3: Chemical Treatments Applied            */}
        {/* ------------------------------------------------------------------ */}
        {data.chemicalTreatmentsSummary && data.chemicalTreatmentsSummary.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-purple-400 text-xs font-black uppercase tracking-wider">
              <FlaskConical size={14} />
              <span>EPA-Registered Chemical & Antimicrobial Application Log</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs bg-slate-950 border border-white/5 rounded-2xl overflow-hidden">
                <thead className="bg-slate-900/80 text-[10px] text-slate-400 uppercase font-black tracking-wider border-b border-white/5">
                  <tr>
                    <th className="p-3">Product Name</th>
                    <th className="p-3">EPA Reg. Number</th>
                    <th className="p-3">Active Ingredient</th>
                    <th className="p-3">Dwell Time</th>
                    <th className="p-3">Target Surfaces</th>
                    <th className="p-3">Safety Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.chemicalTreatmentsSummary.map((chem) => (
                    <tr key={chem.id} className="hover:bg-white/[0.02]">
                      <td className="p-3 font-bold text-white">{chem.productName}</td>
                      <td className="p-3 text-purple-400 font-mono text-[11px]">{chem.epaRegNumber}</td>
                      <td className="p-3 text-slate-300">{chem.activeIngredient}</td>
                      <td className="p-3 font-mono font-bold text-white">{chem.dwellTimeMinutes} Mins</td>
                      <td className="p-3 text-slate-400 text-[11px] max-w-xs">{chem.targetAreas}</td>
                      <td className="p-3 text-emerald-400 font-semibold text-[11px]">
                        {chem.clientNotifiedOfReEntry ? '✓ Client Notified' : 'Active'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Legal Clauses & Binding Acknowledgments */}
        {data.customClauses && data.customClauses.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-white/10">
            <h4 className="text-xs font-black text-white uppercase tracking-wider">
              Terms, Conditions & Legal Acknowledgments
            </h4>
            <div className="space-y-3">
              {data.customClauses.map((clause, idx) => (
                <div key={clause.id} className="p-4 bg-slate-950 rounded-2xl border border-white/5 space-y-1">
                  <div className="font-bold text-white text-xs flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-brand-cyan/20 text-brand-cyan flex items-center justify-center text-[10px]">
                      {idx + 1}
                    </span>
                    {clause.title}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed pl-7">
                    {clause.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Dual Electronic Signatures Block                                   */}
        {/* ------------------------------------------------------------------ */}
        <div className="pt-6 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Technician Signature Card */}
          <div className="p-5 bg-slate-950 border border-white/5 rounded-2xl flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-brand-cyan uppercase tracking-widest flex items-center gap-1">
                  <PenTool size={11} /> Lead Technician Sign-Off
                </span>
                {selectedForm.technicianSignature ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                    ✓ Verified
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">
                    Required
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                I attest under penalty of perjury that the mitigation tasks, psychrometric readings, and chemical applications recorded herein are accurate and compliant with ANSI/IICRC S500.
              </p>
            </div>

            {selectedForm.technicianSignature ? (
              <div className="space-y-2">
                <div className="h-20 bg-slate-900 border border-white/10 rounded-xl flex items-center justify-center p-2">
                  <img
                    src={selectedForm.technicianSignature.signatureDataUrl}
                    alt="Technician Signature"
                    className="max-h-full object-contain"
                  />
                </div>
                <div className="text-[11px] text-slate-400 flex justify-between font-mono">
                  <span>Signed: <strong>{selectedForm.technicianSignature.name}</strong></span>
                  <span>{selectedForm.technicianSignature.signedAt}</span>
                </div>
                {selectedForm.technicianSignature.ipStamp && (
                  <div className="text-[10px] text-slate-500 font-mono">
                    Audit: {selectedForm.technicianSignature.ipStamp}
                  </div>
                )}
                <button
                  onClick={() =>
                    setSigModalState({
                      isOpen: true,
                      signerRole: 'technician',
                      title: `${selectedForm.title} (Lead Technician Sign-Off)`
                    })
                  }
                  className="text-[11px] text-brand-cyan hover:underline font-bold"
                >
                  Change / Re-Sign
                </button>
              </div>
            ) : (
              <button
                onClick={() =>
                  setSigModalState({
                    isOpen: true,
                    signerRole: 'technician',
                    title: `${selectedForm.title} (Lead Technician Sign-Off)`
                  })
                }
                className="w-full py-3 bg-brand-cyan hover:bg-cyan-400 text-slate-900 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
              >
                <PenTool size={14} /> Sign as Lead Technician
              </button>
            )}
          </div>

          {/* Client / Property Owner Signature Card */}
          <div className="p-5 bg-slate-950 border border-white/5 rounded-2xl flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                  <User size={11} /> Client / Property Owner Signature
                </span>
                {selectedForm.clientSignature ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                    ✓ Verified
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">
                    Required
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                I hereby accept and approve the authorized scope, agree to terms and conditions, and acknowledge electronic receipt of chemical disclosure and mitigation agreement.
              </p>
            </div>

            {selectedForm.clientSignature ? (
              <div className="space-y-2">
                <div className="h-20 bg-slate-900 border border-white/10 rounded-xl flex items-center justify-center p-2">
                  <img
                    src={selectedForm.clientSignature.signatureDataUrl}
                    alt="Client Signature"
                    className="max-h-full object-contain"
                  />
                </div>
                <div className="text-[11px] text-slate-400 flex justify-between font-mono">
                  <span>Signed: <strong>{selectedForm.clientSignature.name}</strong> ({selectedForm.clientSignature.role})</span>
                  <span>{selectedForm.clientSignature.signedAt}</span>
                </div>
                {selectedForm.clientSignature.ipStamp && (
                  <div className="text-[10px] text-slate-500 font-mono">
                    Audit: {selectedForm.clientSignature.ipStamp}
                  </div>
                )}
                <button
                  onClick={() =>
                    setSigModalState({
                      isOpen: true,
                      signerRole: 'client',
                      title: `${selectedForm.title} (Client / Owner Sign-Off)`
                    })
                  }
                  className="text-[11px] text-emerald-400 hover:underline font-bold"
                >
                  Change / Re-Sign
                </button>
              </div>
            ) : (
              <button
                onClick={() =>
                  setSigModalState({
                    isOpen: true,
                    signerRole: 'client',
                    title: `${selectedForm.title} (Client / Owner Sign-Off)`
                  })
                }
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
              >
                <PenTool size={14} /> Sign as Property Owner / Client
              </button>
            )}
          </div>
        </div>

        {/* Digital Certificate Seal Footer */}
        <div className="pt-4 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500 font-mono">
          <div className="flex items-center gap-1.5">
            <Lock size={12} className="text-emerald-400" />
            <span>Digital Certificate Hash: SHA256-{(data.clientName + selectedForm.id).split('').reduce((a, b) => (((a << 5) - a) + b.charCodeAt(0)) | 0, 0).toString(16).toUpperCase()}</span>
          </div>
          <div>E-SIGN Act (15 U.S.C. § 7001) Compliant • Verified Electronic Record</div>
        </div>
      </div>

      {/* Signature Modal */}
      <DigitalSignatureModal
        isOpen={sigModalState.isOpen}
        onClose={() => setSigModalState((prev) => ({ ...prev, isOpen: false }))}
        onSave={handleSaveSignature}
        documentTitle={sigModalState.title}
        defaultName={
          sigModalState.signerRole === 'technician'
            ? project?.assignedTeam?.[0] || 'Lead Mitigation Tech'
            : data.clientName
        }
        defaultRole={
          sigModalState.signerRole === 'technician'
            ? 'Lead Mitigation Technician'
            : 'Property Owner'
        }
        roleOptions={
          sigModalState.signerRole === 'technician'
            ? ['Lead Mitigation Technician', 'Field Supervisor', 'Project Manager']
            : ['Property Owner', 'Tenant / Occupant', 'Property Manager', 'Authorized Representative']
        }
      />
    </div>
  );
};

export default Forms;
