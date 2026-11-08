import React, { useState, useEffect, useRef } from 'react';
import {
  Project,
  Photo,
  AttachedDocument,
  AttachedDocumentType,
  ReportProfile,
  SignedAuthorization,
  SignedAuthorizationFormType,
  SignedAuthorizationRole,
  CarrierPacketConfig
} from '../types';
import {
  FileText,
  Edit2,
  Check,
  X,
  Printer,
  Camera,
  Download,
  Paperclip,
  Layers,
  Plus,
  Copy,
  Trash2,
  AlertTriangle,
  Eye,
  Upload,
  ArrowUp,
  ArrowDown,
  ShieldCheck,
  CheckCircle2,
  FolderOpen,
  PenTool,
  Lock,
  MapPin,
  RotateCcw
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

import { LogoIcon } from './Branding';
import {
  BUILTIN_REPORT_PROFILES,
  AVAILABLE_REPORT_SECTIONS,
  compileProfileReportMarkdown,
  getMissingRequiredFields,
  FIELD_DISPLAY_LABELS
} from '../utils/reportProfiles';
import { computeSignatureVerificationHash } from '../services/SyncService';
import { computePinStatus, formatPinStatusLabel } from '../utils/dryingAnalytics';

type ReportType = 'daily' | 'final' | 'insurance' | 'assessment' | 'psychrometric';

interface ReportGeneratorProps {
  reportType?: ReportType;
  project: Project;
  initialProfileId?: string;
  onClose: () => void;
  onUpdate?: (updates: Partial<Project>) => void;
}

const AUTHORIZATION_FORM_DEFS: Record<
  SignedAuthorizationFormType,
  { title: string; subtitle: string; clauses: string[] }
> = {
  work_authorization: {
    title: 'Work Authorization & Direction to Pay',
    subtitle: 'ANSI/IICRC S500 Emergency Water Mitigation & Structural Drying Authorization',
    clauses: [
      'I authorize Restoration AI Field Services to perform emergency water extraction, containment, and structural drying in accordance with ANSI/IICRC S500 standards.',
      'I authorize direct payment of insurance proceeds for mitigation services rendered under this claim.',
      'I understand that drying equipment must run continuously to prevent secondary microbial amplification.'
    ]
  },
  antimicrobial_consent: {
    title: 'Antimicrobial & Biocide Application Informed Consent',
    subtitle: 'EPA-Registered Disinfectant / Sporicidal Treatment Disclosure',
    clauses: [
      'I consent to the application of EPA-registered antimicrobial agents to affected structural surfaces to inhibit microbial growth.',
      'Technician has explained re-entry intervals, ventilation protocols, and SDS availability.'
    ]
  },
  equipment_responsibility: {
    title: 'On-Site Drying Equipment Custody & Operation Agreement',
    subtitle: 'Continuous Psychrometric Control & Equipment Safekeeping',
    clauses: [
      'I acknowledge placement of commercial air movers, LGR dehumidifiers, and HEPA air scrubbers on the premises.',
      'I agree not to power off, reposition, or unplug drying equipment while stabilization is in progress.'
    ]
  },
  certificate_of_satisfaction: {
    title: 'Certificate of Structural Drying Completion & Satisfaction',
    subtitle: 'Final Dry Standard Verification & Project Closeout Attestation',
    clauses: [
      'All monitored structural materials have achieved established dry standards as documented in the moisture pin matrix.',
      'Mitigation work has been completed to my satisfaction and all deployed drying equipment has been retrieved.'
    ]
  }
};

const SIGNER_ROLES: SignedAuthorizationRole[] = [
  'Homeowner',
  'Property Manager',
  'Commercial Tenant',
  'Authorized Agent',
  'Lead Technician'
];

const ReportGenerator: React.FC<ReportGeneratorProps> = ({
  reportType = 'final',
  project,
  initialProfileId,
  onClose,
  onUpdate
}) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Combine built-in profiles and custom project profiles
  const allProfiles: ReportProfile[] = [
    ...BUILTIN_REPORT_PROFILES,
    ...(project.reportProfiles || [])
  ];

  // Determine initial active profile
  const defaultProfileId =
    initialProfileId ||
    project.activeReportProfileId ||
    (reportType === 'daily'
      ? 'progress'
      : reportType === 'assessment'
      ? 'initial'
      : reportType === 'insurance'
      ? 'equipment_justification'
      : reportType === 'psychrometric'
      ? 'progress'
      : 'complete_record');

  const [selectedProfileId, setSelectedProfileId] = useState<string>(() => {
    const found = allProfiles.find(p => p.id === defaultProfileId);
    return found ? found.id : 'complete_record';
  });

  const activeProfile =
    allProfiles.find(p => p.id === selectedProfileId) || BUILTIN_REPORT_PROFILES[0];

  const [isEditing, setIsEditing] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState<Photo[]>([]);
  const [isPhotoSelectorOpen, setIsPhotoSelectorOpen] = useState(false);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isSignatureVaultOpen, setIsSignatureVaultOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<AttachedDocument | null>(null);

  // Carrier Packet Config toggles
  const [packetConfig, setPacketConfig] = useState<CarrierPacketConfig>(() => ({
    profileId: selectedProfileId,
    includeFloorplanMap: project.carrierPacketConfig?.includeFloorplanMap ?? true,
    includeSignatures: project.carrierPacketConfig?.includeSignatures ?? true,
    includeAttachedDocs: project.carrierPacketConfig?.includeAttachedDocs ?? true
  }));

  // Attached Document upload form state
  const [newDocName, setNewDocName] = useState('');
  const [newDocType, setNewDocType] = useState<AttachedDocumentType>('lab results');
  const [newDocFileRef, setNewDocFileRef] = useState('');
  const [newDocFileSize, setNewDocFileSize] = useState('');
  const [newDocFileType, setNewDocFileType] = useState('');
  const [newDocNotes, setNewDocNotes] = useState('');

  // Signature Vault form state
  const [sigFormType, setSigFormType] = useState<SignedAuthorizationFormType>('work_authorization');
  const [signerName, setSignerName] = useState(project.client || '');
  const [signerRole, setSignerRole] = useState<SignedAuthorizationRole>('Homeowner');
  const [sigMode, setSigMode] = useState<'draw' | 'type'>('draw');
  const [isDrawingSig, setIsDrawingSig] = useState(false);
  const [hasDrawnSig, setHasDrawnSig] = useState(false);
  const [acceptedClauses, setAcceptedClauses] = useState<string[]>(
    AUTHORIZATION_FORM_DEFS.work_authorization.clauses
  );

  // Profile Editor modal state
  const [editingProfile, setEditingProfile] = useState<ReportProfile | null>(null);
  const [profileFormName, setProfileFormName] = useState('');
  const [profileFormDesc, setProfileFormDesc] = useState('');
  const [profileFormAudience, setProfileFormAudience] = useState<
    'Carrier' | 'Property Manager' | 'Adjuster' | 'Homeowner' | 'General'
  >('Carrier');
  const [profileFormSections, setProfileFormSections] = useState<string[]>([]);
  const [profileFormRequired, setProfileFormRequired] = useState<string[]>([]);
  const [profileFormLabels, setProfileFormLabels] = useState<Record<string, string>>({});

  // Compile report markdown whenever project or profile changes
  useEffect(() => {
    if (!project || !activeProfile) return;
    const compiled = compileProfileReportMarkdown(project, activeProfile);
    setReportContent(compiled);

    const photos = project.rooms?.flatMap(r => r.photos || []) || [];
    if (selectedPhotos.length === 0 && photos.length > 0) {
      setSelectedPhotos(photos.slice(0, 4));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, selectedProfileId]);

  // Initialize signature canvas when modal opens
  useEffect(() => {
    if (!isSignatureVaultOpen || sigMode !== 'draw') return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(300, rect.width) * dpr;
    canvas.height = Math.max(140, rect.height) * dpr;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [isSignatureVaultOpen, sigMode]);

  const missingFields = getMissingRequiredFields(activeProfile, project);
  const attachedDocs = project.attachedDocuments || [];
  const signedAuths = project.signedAuthorizations || [];
  const moisturePins = project.moisturePins || [];

  const updatePacketConfig = (patch: Partial<CarrierPacketConfig>) => {
    const next = { ...packetConfig, ...patch, profileId: selectedProfileId };
    setPacketConfig(next);
    if (onUpdate) {
      onUpdate({ carrierPacketConfig: next });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;

    await new Promise(r => setTimeout(r, 150));

    const canvas = await html2canvas(reportRef.current, {
      scale: 2,
      useCORS: true,
      logging: false
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: [canvas.width, canvas.height]
    });

    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);

    // Append attached documents as full-page appendices when enabled
    if (packetConfig.includeAttachedDocs && attachedDocs.length > 0) {
      for (const doc of attachedDocs) {
        if (
          doc.fileReference &&
          (doc.fileReference.startsWith('data:image') ||
            doc.fileReference.startsWith('blob:') ||
            doc.fileReference.startsWith('http'))
        ) {
          try {
            pdf.addPage([canvas.width, canvas.height], 'portrait');
            pdf.setFontSize(18);
            pdf.setTextColor(15, 23, 42);
            pdf.text(`Appendix: ${doc.name}`, 40, 50);
            pdf.setFontSize(11);
            pdf.setTextColor(100, 116, 139);
            pdf.text(
              `Type: ${doc.type.toUpperCase()}  |  Reference: ${
                doc.fileSize || 'Standard Document'
              }  |  Indexed for Carrier Audit`,
              40,
              70
            );
            if (doc.notes) {
              pdf.text(`Notes: ${doc.notes}`, 40, 90);
            }
            pdf.addImage(
              doc.fileReference,
              'JPEG',
              40,
              110,
              canvas.width - 80,
              (canvas.width - 80) * 0.7
            );
          } catch (err) {
            console.warn('Could not render image directly into PDF appendix:', err);
          }
        }
      }
    }

    const safeClient = (project?.client || 'Project').replace(/\s+/g, '_');
    const safeProfile = activeProfile.name.replace(/\s+/g, '_');
    pdf.save(`${safeClient}_${safeProfile}_Carrier_Packet.pdf`);
  };

  // --- SIGNATURE VAULT HANDLERS ---
  const handleSelectSigFormType = (type: SignedAuthorizationFormType) => {
    setSigFormType(type);
    setAcceptedClauses([...AUTHORIZATION_FORM_DEFS[type].clauses]);
  };

  const getSigCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    const mouseEvt = e as React.MouseEvent;
    return {
      x: mouseEvt.clientX - rect.left,
      y: mouseEvt.clientY - rect.top
    };
  };

  const startDrawingSig = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawingSig(true);
    setHasDrawnSig(true);
    const coords = getSigCoords(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const drawSig = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingSig) return;
    e.preventDefault();
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const coords = getSigCoords(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawingSig = () => {
    setIsDrawingSig(false);
  };

  const clearSigCanvas = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnSig(false);
  };

  const handleCertifySignature = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signerName.trim()) return;

    let signatureDataUrl = '';
    if (sigMode === 'draw' && sigCanvasRef.current && hasDrawnSig) {
      signatureDataUrl = sigCanvasRef.current.toDataURL('image/png');
    } else {
      const offscreen = document.createElement('canvas');
      offscreen.width = 520;
      offscreen.height = 140;
      const ctx = offscreen.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 520, 140);
        ctx.font = 'italic 42px Georgia, serif';
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(signerName.trim(), 260, 70);
        signatureDataUrl = offscreen.toDataURL('image/png');
      }
    }

    const signedAt = Date.now();
    const verificationHash = computeSignatureVerificationHash(
      project,
      signerName.trim(),
      sigFormType,
      signedAt
    );

    const newAuth: SignedAuthorization = {
      id: `sig-${signedAt}-${Math.random().toString(36).substring(2, 6)}`,
      formType: sigFormType,
      title: AUTHORIZATION_FORM_DEFS[sigFormType].title,
      signerName: signerName.trim(),
      signerRole,
      signatureDataUrl,
      signedAt,
      verificationHash,
      clausesAccepted: acceptedClauses
    };

    const updatedAuths = [...signedAuths, newAuth];
    if (onUpdate) {
      onUpdate({ signedAuthorizations: updatedAuths });
    }
    clearSigCanvas();
  };

  const handleDeleteSignature = (sigId: string) => {
    const updatedAuths = signedAuths.filter(s => s.id !== sigId);
    if (onUpdate) {
      onUpdate({ signedAuthorizations: updatedAuths });
    }
  };

  // --- ATTACHED DOCUMENTS HANDLERS ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!newDocName) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setNewDocName(cleanName);
    }

    const sizeFormatted =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;
    setNewDocFileSize(sizeFormatted);
    setNewDocFileType(file.type || 'application/octet-stream');

    const reader = new FileReader();
    reader.onload = uploadEvent => {
      const result = uploadEvent.target?.result as string;
      if (result) {
        setNewDocFileRef(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocName.trim()) return;

    const newDoc: AttachedDocument = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: newDocName.trim(),
      type: newDocType,
      fileReference: newDocFileRef || `ref-${Date.now()}`,
      fileType: newDocFileType || 'application/pdf',
      fileSize: newDocFileSize || 'Uploaded File',
      notes: newDocNotes.trim() || undefined,
      uploadedAt: Date.now()
    };

    const updated = [...attachedDocs, newDoc];
    if (onUpdate) {
      onUpdate({ attachedDocuments: updated });
    }

    setNewDocName('');
    setNewDocFileRef('');
    setNewDocFileSize('');
    setNewDocFileType('');
    setNewDocNotes('');
  };

  const handleRemoveDocument = (docId: string) => {
    const updated = attachedDocs.filter(d => d.id !== docId);
    if (onUpdate) {
      onUpdate({ attachedDocuments: updated });
    }
  };

  // --- PROFILE MANAGEMENT HANDLERS ---
  const openNewProfileModal = () => {
    setEditingProfile(null);
    setProfileFormName('Custom Carrier Profile');
    setProfileFormDesc('Tailored section order and mandatory compliance criteria.');
    setProfileFormAudience('Carrier');
    setProfileFormSections(BUILTIN_REPORT_PROFILES[0].sectionIds);
    setProfileFormRequired(['client', 'address', 'claimNumber', 'waterCategory', 'lossClass', 'signatures']);
    setProfileFormLabels({});
    setIsProfileModalOpen(true);
  };

  const openDuplicateProfile = (profileToDup: ReportProfile) => {
    setEditingProfile(null);
    setProfileFormName(`${profileToDup.name} (Copy)`);
    setProfileFormDesc(profileToDup.description || '');
    setProfileFormAudience(profileToDup.targetAudience || 'Carrier');
    setProfileFormSections([...profileToDup.sectionIds]);
    setProfileFormRequired([...(profileToDup.requiredFields || [])]);
    setProfileFormLabels({ ...(profileToDup.labelOverrides || {}) });
    setIsProfileModalOpen(true);
  };

  const openEditCustomProfile = (profileToEdit: ReportProfile) => {
    setEditingProfile(profileToEdit);
    setProfileFormName(profileToEdit.name);
    setProfileFormDesc(profileToEdit.description || '');
    setProfileFormAudience(profileToEdit.targetAudience || 'Carrier');
    setProfileFormSections([...profileToEdit.sectionIds]);
    setProfileFormRequired([...(profileToEdit.requiredFields || [])]);
    setProfileFormLabels({ ...(profileToEdit.labelOverrides || {}) });
    setIsProfileModalOpen(true);
  };

  const handleSaveProfileForm = () => {
    if (!profileFormName.trim()) return;

    const customProfiles = [...(project.reportProfiles || [])];
    const profileId = editingProfile ? editingProfile.id : `profile-${Date.now()}`;

    const newProfileData: ReportProfile = {
      id: profileId,
      name: profileFormName.trim(),
      description: profileFormDesc.trim(),
      targetAudience: profileFormAudience,
      isBuiltIn: false,
      sectionIds: profileFormSections,
      labelOverrides: profileFormLabels,
      requiredFields: profileFormRequired
    };

    let updatedList: ReportProfile[];
    if (editingProfile) {
      updatedList = customProfiles.map(p => (p.id === editingProfile.id ? newProfileData : p));
    } else {
      updatedList = [...customProfiles, newProfileData];
    }

    if (onUpdate) {
      onUpdate({
        reportProfiles: updatedList,
        activeReportProfileId: profileId
      });
    }

    setSelectedProfileId(profileId);
    setIsProfileModalOpen(false);
  };

  const handleDeleteCustomProfile = (profileId: string) => {
    const updatedList = (project.reportProfiles || []).filter(p => p.id !== profileId);
    if (onUpdate) {
      onUpdate({ reportProfiles: updatedList });
    }
    if (selectedProfileId === profileId) {
      setSelectedProfileId(BUILTIN_REPORT_PROFILES[0].id);
    }
  };

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= profileFormSections.length) return;
    const copy = [...profileFormSections];
    const item = copy.splice(index, 1)[0];
    copy.splice(newIdx, 0, item);
    setProfileFormSections(copy);
  };

  const toggleSection = (secId: string) => {
    if (profileFormSections.includes(secId)) {
      setProfileFormSections(profileFormSections.filter(s => s !== secId));
    } else {
      setProfileFormSections([...profileFormSections, secId]);
    }
  };

  const toggleRequiredField = (fieldKey: string) => {
    if (profileFormRequired.includes(fieldKey)) {
      setProfileFormRequired(profileFormRequired.filter(f => f !== fieldKey));
    } else {
      setProfileFormRequired([...profileFormRequired, fieldKey]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-hidden print:p-0 print:bg-white print:block pb-10">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-6xl h-full max-h-[92vh] flex flex-col shadow-2xl relative print:border-none print:shadow-none print:max-h-full print:h-auto print:bg-white print:text-black">
        {/* Top Header - Hidden in Print */}
        <div className="flex flex-wrap gap-3 justify-between items-center p-4 border-b border-white/10 print:hidden shrink-0 bg-slate-950/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-brand-cyan/20 text-brand-cyan rounded-xl">
              <FileText size={22} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-bold text-white uppercase tracking-wider text-sm sm:text-base">
                  {activeProfile.name} Carrier Packet
                </h2>
                <span className="text-xs text-slate-400">
                  · {activeProfile.isBuiltIn ? 'Built-In Standard' : 'Custom Profile'}
                </span>
                {missingFields.length > 0 ? (
                  <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                    · <AlertTriangle size={12} /> {missingFields.length} Missing Field(s)
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                    · <CheckCircle2 size={12} /> Packet Ready
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {project.client} · {project.address} · {activeProfile.targetAudience || 'Carrier'} Format
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Digital Signatures Vault Button */}
            <button
              onClick={() => setIsSignatureVaultOpen(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-sm"
              title="Capture & Certify Digital Signatures with SHA-256 Verification Hash"
            >
              <PenTool size={14} className="text-brand-cyan" />
              <span>Signatures ({signedAuths.length})</span>
            </button>

            {/* Profile Manager Button */}
            <button
              onClick={() => setIsProfileModalOpen(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-sm"
              title="Manage Profiles (Initial, Progress, Equipment Justification, Complete Record)"
            >
              <Layers size={14} className="text-brand-cyan" />
              <span>Profiles ({allProfiles.length})</span>
            </button>

            {/* Attached Documents Button */}
            <button
              onClick={() => setIsDocModalOpen(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-sm"
              title="Attach outside documents (lab results, invoices, estimates, etc.)"
            >
              <Paperclip size={14} className="text-emerald-400" />
              <span>Attached Docs ({attachedDocs.length})</span>
            </button>

            {/* Edit Content Toggle */}
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5"
              >
                <Edit2 size={14} /> <span>Edit Text</span>
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 bg-brand-cyan hover:bg-cyan-400 text-slate-900 rounded-xl text-xs font-black flex items-center space-x-1.5"
              >
                <Check size={14} /> <span>Save Edit</span>
              </button>
            )}

            {/* Photo Selector */}
            <button
              onClick={() => setIsPhotoSelectorOpen(true)}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5"
            >
              <Camera size={14} /> <span>Photos ({selectedPhotos.length})</span>
            </button>

            {/* Print */}
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5"
            >
              <Printer size={14} /> <span className="hidden sm:inline">Print</span>
            </button>

            {/* Assemble Carrier Packet PDF */}
            <button
              onClick={handleDownloadPDF}
              className="px-3.5 py-1.5 bg-brand-cyan hover:bg-cyan-400 text-slate-900 rounded-xl text-xs font-black flex items-center space-x-1.5 shadow-md shadow-brand-cyan/20 active:scale-95 whitespace-nowrap"
            >
              <Download size={14} /> <span>Assemble Carrier Packet PDF</span>
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl ml-1"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Profile Switcher & Packet Assembly Options Bar */}
        <div className="px-4 py-2 bg-slate-950/60 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
              Profile:
            </span>
            {allProfiles.map(p => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedProfileId(p.id);
                  if (onUpdate) {
                    onUpdate({ activeReportProfileId: p.id });
                  }
                }}
                className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  selectedProfileId === p.id
                    ? 'bg-brand-cyan text-slate-950 shadow-sm shadow-brand-cyan/20'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300'
                }`}
              >
                {p.name}
                {p.targetAudience && (
                  <span
                    className={`text-[9px] px-1 py-0.2 rounded font-normal ${
                      selectedProfileId === p.id
                        ? 'bg-black/20 text-slate-950'
                        : 'bg-white/10 text-slate-400'
                    }`}
                  >
                    {p.targetAudience}
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={openNewProfileModal}
              className="px-2 py-1 rounded-lg text-xs font-bold text-brand-cyan hover:bg-brand-cyan/10 flex items-center gap-1 shrink-0"
            >
              <Plus size={13} /> New Custom
            </button>
          </div>

          {/* Packet Bundle Toggles */}
          <div className="flex items-center gap-4 text-xs text-slate-300 shrink-0">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={packetConfig.includeFloorplanMap}
                onChange={e => updatePacketConfig({ includeFloorplanMap: e.target.checked })}
                className="rounded border-white/20 bg-slate-900 text-brand-cyan focus:ring-brand-cyan h-3.5 w-3.5"
              />
              <span>2D Pin Map ({moisturePins.length})</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={packetConfig.includeSignatures}
                onChange={e => updatePacketConfig({ includeSignatures: e.target.checked })}
                className="rounded border-white/20 bg-slate-900 text-brand-cyan focus:ring-brand-cyan h-3.5 w-3.5"
              />
              <span>Signature Vault ({signedAuths.length})</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={packetConfig.includeAttachedDocs}
                onChange={e => updatePacketConfig({ includeAttachedDocs: e.target.checked })}
                className="rounded border-white/20 bg-slate-900 text-brand-cyan focus:ring-brand-cyan h-3.5 w-3.5"
              />
              <span>Doc Appendix ({attachedDocs.length})</span>
            </label>
          </div>
        </div>

        {/* Packet Readiness Inspector & Missing Required Fields Banner */}
        {missingFields.length > 0 && (
          <div className="bg-amber-950/40 border-b border-amber-500/20 px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200 print:hidden">
            <div className="flex items-center space-x-2">
              <AlertTriangle size={16} className="text-amber-400 shrink-0" />
              <span>
                <strong>Packet Readiness Inspector:</strong> Missing{' '}
                <span className="font-bold underline">
                  {missingFields.map(m => m.label).join(', ')}
                </span>
                . Marked as visible <strong>[MISSING REQUIRED FIELD]</strong> tags in the packet.
              </span>
            </div>
            <div className="flex items-center gap-2">
              {missingFields.some(m => m.key === 'signatures') && (
                <button
                  onClick={() => setIsSignatureVaultOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-brand-cyan text-slate-950 font-black text-[11px] uppercase tracking-wider"
                >
                  Capture Signature Now
                </button>
              )}
              <span className="text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                Never Silently Filled
              </span>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 print:p-0 print:overflow-visible">
          <div
            ref={reportRef}
            className="max-w-4xl mx-auto bg-white text-slate-900 min-h-full p-6 sm:p-10 rounded-xl shadow-lg print:shadow-none print:p-0 print:m-0 print:max-w-none relative"
          >
            {/* Header Letterhead */}
            <div className="border-b-4 border-slate-900 pb-6 mb-8 flex justify-between items-end print:pb-4 print:mb-6">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-950 p-1 flex-shrink-0 shadow-md">
                  <LogoIcon />
                </div>
                <div>
                  <h1 className="text-3xl font-black uppercase tracking-tighter text-slate-900">
                    RESTORATION AI
                  </h1>
                  <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest leading-none">
                    Water Mitigation & Structural Drying Carrier Packet
                  </p>
                </div>
              </div>
              <div className="text-right text-xs text-slate-500 font-mono">
                <p className="font-bold text-slate-800 font-sans">Restoration AI Field Services</p>
                <p>ANSI/IICRC S500 Standard Compliance</p>
                <p>
                  Profile: <span className="font-bold text-slate-900">{activeProfile.name}</span>
                </p>
                <p>Generated: {new Date().toLocaleDateString()}</p>
              </div>
            </div>

            {isEditing ? (
              <textarea
                className="w-full h-[650px] p-4 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono text-slate-800 focus:outline-brand-cyan"
                value={reportContent}
                onChange={e => setReportContent(e.target.value)}
              />
            ) : (
              <div className="markdown-body prose prose-slate max-w-none">
                <ReactMarkdown>{reportContent}</ReactMarkdown>
              </div>
            )}

            {/* Visual 2D Floorplan Moisture Pin Map Section */}
            {packetConfig.includeFloorplanMap && moisturePins.length > 0 && !isEditing && (
              <div className="mt-10 pt-8 border-t-2 border-slate-200 break-inside-avoid">
                <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-2">
                  <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <MapPin size={18} className="text-cyan-700" />
                    2D Spatial Floorplan Moisture Pin Map
                  </h2>
                  <span className="text-xs font-mono text-slate-500">
                    {moisturePins.length} Calibrated Sensor Pin(s)
                  </span>
                </div>

                <div className="relative w-full h-56 bg-slate-100 border-2 border-slate-300 rounded-xl overflow-hidden mb-4">
                  {/* Architectural grid lines */}
                  <div className="absolute inset-4 border-2 border-slate-400/60 rounded pointer-events-none flex items-center justify-center">
                    <span className="text-[11px] font-mono uppercase tracking-widest text-slate-400">
                      Drying Chamber Spatial Coordinate Grid (0.0 – 1.0)
                    </span>
                  </div>
                  {moisturePins.map(pin => {
                    const mat = project.dryingMonitor?.find(m => m.id === pin.materialId);
                    const status = pin.status || computePinStatus(mat);
                    const bgClass =
                      status === 'dry'
                        ? 'bg-emerald-600 text-white border-emerald-900'
                        : status === 'stalled'
                        ? 'bg-amber-600 text-white border-amber-900'
                        : status === 'drying'
                        ? 'bg-sky-600 text-white border-sky-900'
                        : 'bg-rose-600 text-white border-rose-900';

                    return (
                      <div
                        key={pin.id}
                        style={{
                          left: `${Math.min(94, Math.max(6, pin.x * 100))}%`,
                          top: `${Math.min(88, Math.max(12, pin.y * 100))}%`
                        }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold shadow ${bgClass}`}
                      >
                        #{pin.pinNumber} · {formatPinStatusLabel(status)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cryptographic Digital Signature Certificates Section */}
            {packetConfig.includeSignatures && !isEditing && (
              <div className="mt-10 pt-8 border-t-2 border-slate-200 break-inside-avoid">
                <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-2">
                  <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck size={18} className="text-emerald-700" />
                    Digital Signature & Cryptographic Attestation Vault
                  </h2>
                  <span className="text-xs font-mono text-slate-500">
                    {signedAuths.length} Certified Signature(s)
                  </span>
                </div>

                {signedAuths.length === 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between">
                    <span>
                      No electronic signature certificates attached yet. Use the{' '}
                      <strong>Signatures</strong> button in the toolbar to capture client or technician sign-off.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {signedAuths.map(sig => (
                      <div
                        key={sig.id}
                        className="p-4 bg-slate-50 border border-slate-300 rounded-xl flex flex-col justify-between space-y-3"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                              {sig.title}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold">
                              CERTIFIED E-SIGN
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">
                            Signer: <strong>{sig.signerName}</strong> ({sig.signerRole})
                          </p>
                          <p className="text-[10px] font-mono text-slate-500">
                            Signed: {new Date(sig.signedAt).toLocaleString()}
                          </p>
                        </div>

                        {sig.signatureDataUrl && (
                          <div className="h-20 bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-center">
                            <img
                              src={sig.signatureDataUrl}
                              alt={`Signature of ${sig.signerName}`}
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                        )}

                        {sig.clausesAccepted && sig.clausesAccepted.length > 0 && (
                          <ul className="text-[10px] text-slate-600 list-disc pl-4 space-y-0.5">
                            {sig.clausesAccepted.map((c, idx) => (
                              <li key={idx}>{c}</li>
                            ))}
                          </ul>
                        )}

                        <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[10px] font-mono text-slate-500">
                          <span className="flex items-center gap-1 text-slate-700 font-semibold">
                            <Lock size={10} className="text-emerald-600" />
                            {sig.verificationHash}
                          </span>
                          <span>UETA / E-SIGN</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Photos Section */}
            {selectedPhotos.length > 0 && !isEditing && (
              <div className="mt-12 pt-8 border-t-2 border-slate-200 break-before-page">
                <h2 className="text-xl font-bold mb-6 text-slate-900 border-b border-slate-200 pb-2">
                  Photographic Evidence & Site Verification
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {selectedPhotos.map((photo, i) => (
                    <div
                      key={photo.id || i}
                      className="break-inside-avoid border border-slate-200 rounded-xl p-3 bg-slate-50"
                    >
                      <div className="aspect-video bg-slate-100 rounded-lg overflow-hidden border border-slate-300">
                        <img src={photo.url} alt="Evidence" className="w-full h-full object-cover" />
                      </div>
                      <div className="mt-2 text-xs text-slate-700">
                        <div className="font-bold">{photo.room || 'Job Site Location'}</div>
                        {photo.notes && <p className="italic text-slate-600 mt-1">{photo.notes}</p>}
                        {photo.aiInsight && (
                          <p className="text-[11px] text-cyan-800 mt-1 font-medium bg-cyan-50 p-1.5 rounded border border-cyan-200">
                            {photo.aiInsight}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attached Documents Appendix Preview in Report View */}
            {packetConfig.includeAttachedDocs && attachedDocs.length > 0 && (
              <div className="mt-12 pt-8 border-t-2 border-slate-200 break-before-page">
                <h2 className="text-xl font-bold mb-4 text-slate-900 border-b border-slate-200 pb-2 flex items-center justify-between">
                  <span>Attached Outside Documents Appendix</span>
                  <span className="text-xs font-normal text-slate-500">
                    {attachedDocs.length} Document(s) Attached
                  </span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {attachedDocs.map(doc => (
                    <div
                      key={doc.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{doc.name}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 text-slate-700">
                          {doc.type}
                        </span>
                      </div>
                      <p className="text-slate-500 font-mono text-[10px]">
                        Ref: {doc.fileSize || 'Standard Record'} • Attached{' '}
                        {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : 'N/A'}
                      </p>
                      {doc.notes && <p className="text-slate-600 italic text-[11px]">{doc.notes}</p>}
                      {doc.fileReference && doc.fileReference.startsWith('data:image') && (
                        <div className="mt-2 h-28 rounded overflow-hidden border border-slate-300">
                          <img
                            src={doc.fileReference}
                            alt={doc.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* --- DIGITAL SIGNATURE & AUTHORIZATION VAULT MODAL --- */}
        {isSignatureVaultOpen && (
          <div className="absolute inset-0 bg-slate-950/95 z-30 flex flex-col p-6 print:hidden">
            <div className="flex justify-between items-center pb-4 border-b border-white/10">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-brand-cyan/20 text-brand-cyan rounded-xl">
                  <PenTool size={20} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">
                    Digital Signature & Authorization Vault
                  </h3>
                  <p className="text-xs text-slate-400">
                    Capture tamper-evident electronic signatures with SHA-256 project state digests for carrier packet inclusion.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSignatureVaultOpen(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-white/5"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Capture New Signature */}
              <div className="lg:col-span-7 bg-slate-900 border border-white/10 rounded-2xl p-5 space-y-4">
                <h4 className="text-sm font-bold uppercase text-brand-cyan tracking-wider flex items-center gap-2">
                  <ShieldCheck size={16} /> Execute Authorization Certificate
                </h4>

                <form onSubmit={handleCertifySignature} className="space-y-4">
                  {/* Form Type Selector */}
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1.5">
                      Authorization Form Type *
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(Object.keys(AUTHORIZATION_FORM_DEFS) as SignedAuthorizationFormType[]).map(
                        typeKey => {
                          const def = AUTHORIZATION_FORM_DEFS[typeKey];
                          const isSelected = sigFormType === typeKey;
                          return (
                            <button
                              key={typeKey}
                              type="button"
                              onClick={() => handleSelectSigFormType(typeKey)}
                              className={`p-2.5 rounded-xl border text-left transition ${
                                isSelected
                                  ? 'bg-brand-cyan/15 border-brand-cyan text-white'
                                  : 'bg-black/30 border-white/10 text-slate-300 hover:border-white/20'
                              }`}
                            >
                              <div className="text-xs font-bold">{def.title}</div>
                              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                {def.subtitle}
                              </div>
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>

                  {/* Signer Name & Role */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                        Printed Legal Name *
                      </label>
                      <input
                        type="text"
                        value={signerName}
                        onChange={e => setSignerName(e.target.value)}
                        placeholder="Full Legal Name"
                        required
                        className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-sm text-white outline-none focus:border-brand-cyan"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                        Signer Capacity / Role *
                      </label>
                      <select
                        value={signerRole}
                        onChange={e => setSignerRole(e.target.value as SignedAuthorizationRole)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-sm font-bold text-white outline-none focus:border-brand-cyan"
                      >
                        {SIGNER_ROLES.map(r => (
                          <option key={r} value={r} className="bg-slate-900 text-white">
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Clauses Checkboxes */}
                  <div className="space-y-1.5 bg-black/30 p-3 rounded-xl border border-white/5">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      IICRC S500 & Carrier Disclosures Acknowledged
                    </span>
                    {AUTHORIZATION_FORM_DEFS[sigFormType].clauses.map((clause, idx) => {
                      const checked = acceptedClauses.includes(clause);
                      return (
                        <label
                          key={idx}
                          className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              if (e.target.checked) {
                                setAcceptedClauses([...acceptedClauses, clause]);
                              } else {
                                setAcceptedClauses(acceptedClauses.filter(c => c !== clause));
                              }
                            }}
                            className="mt-0.5 rounded border-white/20 bg-slate-900 text-brand-cyan"
                          />
                          <span>{clause}</span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Signature Mode & Canvas */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSigMode('draw')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold ${
                            sigMode === 'draw'
                              ? 'bg-brand-cyan text-slate-950'
                              : 'bg-white/5 text-slate-300'
                          }`}
                        >
                          Touch / Stylus Pad
                        </button>
                        <button
                          type="button"
                          onClick={() => setSigMode('type')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold ${
                            sigMode === 'type'
                              ? 'bg-brand-cyan text-slate-950'
                              : 'bg-white/5 text-slate-300'
                          }`}
                        >
                          Typed Script
                        </button>
                      </div>

                      {sigMode === 'draw' && (
                        <button
                          type="button"
                          onClick={clearSigCanvas}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1"
                        >
                          <RotateCcw size={12} /> Clear Pad
                        </button>
                      )}
                    </div>

                    {sigMode === 'draw' ? (
                      <div className="relative w-full h-36 bg-white rounded-xl border-2 border-slate-300 overflow-hidden">
                        <canvas
                          ref={sigCanvasRef}
                          className="w-full h-full cursor-crosshair touch-none"
                          onMouseDown={startDrawingSig}
                          onMouseMove={drawSig}
                          onMouseUp={stopDrawingSig}
                          onMouseLeave={stopDrawingSig}
                          onTouchStart={startDrawingSig}
                          onTouchMove={drawSig}
                          onTouchEnd={stopDrawingSig}
                        />
                        {!hasDrawnSig && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs font-bold uppercase tracking-widest text-slate-400">
                            Sign Here on Touch Canvas (or switch to Typed Script)
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-36 bg-white rounded-xl border-2 border-slate-300 flex flex-col items-center justify-center p-4">
                        <span className="text-3xl italic font-serif text-slate-900">
                          {signerName || 'Authorized Signature'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 mt-2">
                          Electronic Script Binding · {signerRole}
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={!signerName.trim()}
                    className="w-full py-3 bg-brand-cyan hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 shadow-lg"
                  >
                    <Lock size={15} />
                    <span>Lock & Certify Signature</span>
                  </button>
                </form>
              </div>

              {/* Right Column: Executed Signature Certificates */}
              <div className="lg:col-span-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold uppercase text-slate-300 tracking-wider">
                    Certified Signatures ({signedAuths.length})
                  </h4>
                  <span className="text-xs font-mono text-emerald-400">SHA-256 Verified</span>
                </div>

                {signedAuths.length === 0 ? (
                  <div className="p-8 bg-slate-900/60 border border-white/5 rounded-2xl text-center text-slate-400">
                    <PenTool size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-bold text-slate-300">No Signatures Certified Yet</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Complete the form on the left to bind a signed authorization directly into this project and Carrier Packet PDF.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {signedAuths.map(sig => (
                      <div
                        key={sig.id}
                        className="p-4 bg-slate-900 border border-white/10 rounded-2xl space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-bold text-white">{sig.title}</div>
                            <div className="text-xs text-brand-cyan font-semibold">
                              {sig.signerName} · {sig.signerRole}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {new Date(sig.signedAt).toLocaleString()}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteSignature(sig.id)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg"
                            title="Revoke Signature"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {sig.signatureDataUrl && (
                          <div className="h-16 bg-white rounded-lg p-1.5 flex items-center justify-center">
                            <img
                              src={sig.signatureDataUrl}
                              alt={sig.signerName}
                              className="max-h-full object-contain"
                            />
                          </div>
                        )}

                        <div className="text-[10px] font-mono text-emerald-400 bg-black/40 px-2.5 py-1.5 rounded-lg border border-emerald-500/20 flex items-center justify-between">
                          <span>{sig.verificationHash}</span>
                          <span>VERIFIED</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setIsSignatureVaultOpen(false)}
                className="px-6 py-2.5 bg-brand-cyan hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* --- ATTACHED DOCUMENTS MODAL --- */}
        {isDocModalOpen && (
          <div className="absolute inset-0 bg-slate-950/95 z-30 flex flex-col p-6 print:hidden">
            <div className="flex justify-between items-center pb-4 border-b border-white/10">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <Paperclip size={20} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">Attached Outside Documents</h3>
                  <p className="text-xs text-slate-400">
                    Upload and manage lab results, subcontractor invoices, estimates, and other external files.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDocModalOpen(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-white/5"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Form to attach new document */}
              <div className="lg:col-span-5 bg-slate-900 border border-white/10 rounded-2xl p-5 space-y-4">
                <h4 className="text-sm font-bold uppercase text-brand-cyan tracking-wider flex items-center gap-2">
                  <Plus size={16} /> Attach Document
                </h4>

                <form onSubmit={handleAddDocument} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Document Title *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Post-Remediation Mold Clearance Test"
                      value={newDocName}
                      onChange={e => setNewDocName(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-brand-cyan"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Document Type *
                    </label>
                    <select
                      value={newDocType}
                      onChange={e => setNewDocType(e.target.value as AttachedDocumentType)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-brand-cyan"
                    >
                      <option value="lab results">
                        Lab Results (Clearance, Spore Trap, Lead, Asbestos)
                      </option>
                      <option value="invoices">
                        Invoices (Plumbing, Subcontractor, Disposal)
                      </option>
                      <option value="estimates">Estimates (Xactimate, Reconstruction)</option>
                      <option value="other">Other Outside Records</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Select File (Image / PDF / Scan)
                    </label>
                    <div className="flex items-center space-x-2">
                      <label className="flex-1 flex items-center justify-center space-x-2 bg-white/5 hover:bg-white/10 border border-dashed border-white/20 rounded-xl p-3.5 cursor-pointer transition-colors text-xs text-slate-300">
                        <Upload size={16} className="text-brand-cyan" />
                        <span>
                          {newDocFileSize ? `Selected (${newDocFileSize})` : 'Choose File from Device'}
                        </span>
                        <input
                          type="file"
                          accept="image/*,application/pdf,text/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Notes / Adjuster Context
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Clearance certificate by independent Industrial Hygienist."
                      value={newDocNotes}
                      onChange={e => setNewDocNotes(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-brand-cyan"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!newDocName.trim()}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 shadow-md active:scale-95 flex items-center justify-center space-x-2"
                  >
                    <CheckCircle2 size={16} />
                    <span>Save to Project Record</span>
                  </button>
                </form>
              </div>

              {/* List of currently attached documents */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold uppercase text-slate-300 tracking-wider">
                    Indexed Documents ({attachedDocs.length})
                  </h4>
                  <span className="text-xs text-slate-500">Persisted in Project Dossier</span>
                </div>

                {attachedDocs.length === 0 ? (
                  <div className="text-center py-16 bg-slate-900/50 border border-white/5 rounded-2xl text-slate-400">
                    <FolderOpen size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-bold text-sm text-slate-300">
                      No outside documents attached yet
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Attach spore trap lab clearances, subcontractor invoices, or adjuster correspondence to build an airtight audit dossier.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {attachedDocs.map(doc => (
                      <div
                        key={doc.id}
                        className="p-4 bg-slate-900 border border-white/10 rounded-2xl flex items-start justify-between gap-4 hover:border-white/20 transition-all"
                      >
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-white text-sm">{doc.name}</span>
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/10 text-brand-cyan">
                              {doc.type}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">
                            Size: {doc.fileSize || 'Standard Record'} • Date:{' '}
                            {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : 'N/A'}
                          </p>
                          {doc.notes && (
                            <p className="text-xs text-slate-300 bg-black/30 p-2 rounded-lg font-mono">
                              {doc.notes}
                            </p>
                          )}
                          {doc.fileReference && doc.fileReference.startsWith('data:image') && (
                            <div className="mt-2 w-32 h-20 rounded-lg overflow-hidden border border-white/10">
                              <img
                                src={doc.fileReference}
                                alt={doc.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          {doc.fileReference && (
                            <button
                              onClick={() => setPreviewDoc(doc)}
                              className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs"
                              title="Preview Document"
                            >
                              <Eye size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveDocument(doc.id)}
                            className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs"
                            title="Remove Document"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {previewDoc && (
                  <div className="p-4 bg-slate-950 border border-brand-cyan/30 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">
                        Document Preview: {previewDoc.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(null)}
                        className="text-xs text-slate-400 hover:text-white"
                      >
                        Close Preview
                      </button>
                    </div>
                    {previewDoc.fileReference.startsWith('data:image') ? (
                      <img
                        src={previewDoc.fileReference}
                        alt={previewDoc.name}
                        className="max-h-64 rounded-lg border border-white/10 mx-auto"
                      />
                    ) : (
                      <p className="text-xs font-mono text-slate-300">
                        Reference URI: {previewDoc.fileReference.slice(0, 80)}...
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setIsDocModalOpen(false)}
                className="px-6 py-2.5 bg-brand-cyan hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* --- PROFILE MANAGER MODAL (FEATURE 4) --- */}
        {isProfileModalOpen && (
          <div className="absolute inset-0 bg-slate-950/95 z-30 flex flex-col p-6 print:hidden">
            <div className="flex justify-between items-center pb-4 border-b border-white/10">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-brand-cyan/20 text-brand-cyan rounded-xl">
                  <Layers size={20} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">
                    Carrier & Property-Manager Report Profiles
                  </h3>
                  <p className="text-xs text-slate-400">
                    Create, duplicate, and edit custom profiles with tailored section ordering, label overrides, and required field validation.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-white/5"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Profile List */}
              <div className="lg:col-span-5 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold uppercase text-slate-300 tracking-wider">
                    Available Profiles ({allProfiles.length})
                  </h4>
                  <button
                    onClick={openNewProfileModal}
                    className="px-3 py-1.5 bg-brand-cyan hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1"
                  >
                    <Plus size={14} /> Create
                  </button>
                </div>

                <div className="space-y-3">
                  {allProfiles.map(p => (
                    <div
                      key={p.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        selectedProfileId === p.id
                          ? 'bg-brand-cyan/10 border-brand-cyan'
                          : 'bg-slate-900 border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-white text-sm">{p.name}</span>
                            {p.isBuiltIn ? (
                              <span className="text-[9px] bg-white/10 text-slate-300 px-1.5 py-0.5 rounded font-mono uppercase">
                                Built-In
                              </span>
                            ) : (
                              <span className="text-[9px] bg-brand-cyan/20 text-brand-cyan px-1.5 py-0.5 rounded font-mono uppercase">
                                Custom
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-brand-cyan font-bold block mt-0.5">
                            Target: {p.targetAudience || 'General'} • {p.sectionIds.length} Sections
                          </span>
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => openDuplicateProfile(p)}
                            className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs"
                            title="Duplicate Profile"
                          >
                            <Copy size={14} />
                          </button>
                          {!p.isBuiltIn && (
                            <>
                              <button
                                onClick={() => openEditCustomProfile(p)}
                                className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs"
                                title="Edit Profile"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteCustomProfile(p.id)}
                                className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs"
                                title="Delete Profile"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-400 mt-2 line-clamp-2">{p.description}</p>

                      <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">
                          {p.requiredFields?.length || 0} Required Compliance Fields
                        </span>
                        <button
                          onClick={() => {
                            setSelectedProfileId(p.id);
                            if (onUpdate) {
                              onUpdate({ activeReportProfileId: p.id });
                            }
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
                            selectedProfileId === p.id
                              ? 'bg-brand-cyan text-slate-950 font-black'
                              : 'bg-white/5 hover:bg-white/10 text-slate-300'
                          }`}
                        >
                          {selectedProfileId === p.id ? 'Active Profile' : 'Select'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Profile Config Editor */}
              <div className="lg:col-span-7 bg-slate-900 border border-white/10 rounded-2xl p-5 space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-white/5">
                  <h4 className="text-sm font-bold uppercase text-brand-cyan tracking-wider flex items-center gap-2">
                    <ShieldCheck size={16} />
                    {editingProfile ? `Edit Profile: ${editingProfile.name}` : 'Create / Customize Profile'}
                  </h4>
                  <span className="text-xs text-slate-400">Deterministic IICRC S500 Layout</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Profile Name *
                    </label>
                    <input
                      type="text"
                      value={profileFormName}
                      onChange={e => setProfileFormName(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-brand-cyan font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Target Audience
                    </label>
                    <select
                      value={profileFormAudience}
                      onChange={e =>
                        setProfileFormAudience(
                          e.target.value as
                            | 'Carrier'
                            | 'Property Manager'
                            | 'Adjuster'
                            | 'Homeowner'
                            | 'General'
                        )
                      }
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs font-bold text-white outline-none focus:border-brand-cyan"
                    >
                      <option value="Carrier">Insurance Carrier Audit</option>
                      <option value="Property Manager">Property Manager / Landlord</option>
                      <option value="Adjuster">Insurance Independent Adjuster</option>
                      <option value="Homeowner">Homeowner / Client</option>
                      <option value="General">General Restoration Record</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Profile Description
                  </label>
                  <input
                    type="text"
                    value={profileFormDesc}
                    onChange={e => setProfileFormDesc(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-brand-cyan"
                    placeholder="Short description of audit purpose..."
                  />
                </div>

                {/* Section Ordering & Inclusion */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-slate-400 block">
                    Ordered Report Sections ({profileFormSections.length} active)
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Use Up/Down arrows to reorder report hierarchy. Toggle checkboxes to include or omit sections.
                  </p>

                  <div className="max-h-60 overflow-y-auto space-y-1.5 p-2 bg-black/30 rounded-xl border border-white/5">
                    {profileFormSections.map((secId, idx) => {
                      const def = AVAILABLE_REPORT_SECTIONS.find(s => s.id === secId);
                      return (
                        <div
                          key={secId}
                          className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5 text-xs"
                        >
                          <div className="flex items-center space-x-2">
                            <span className="w-5 h-5 rounded-full bg-brand-cyan/20 text-brand-cyan font-mono font-bold flex items-center justify-center text-[10px]">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-white">{def?.name || secId}</span>
                            <span className="text-[9px] text-slate-500 font-mono">
                              ({def?.category || 'general'})
                            </span>
                          </div>

                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => moveSection(idx, 'up')}
                              disabled={idx === 0}
                              className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                              title="Move Up"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              onClick={() => moveSection(idx, 'down')}
                              disabled={idx === profileFormSections.length - 1}
                              className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                              title="Move Down"
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              onClick={() => toggleSection(secId)}
                              className="p-1 text-red-400 hover:text-red-300 ml-1"
                              title="Remove section"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Available Sections Dropdown */}
                  <div className="pt-2">
                    <span className="text-[10px] text-slate-400 block mb-1">
                      Add Inactive Section:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {AVAILABLE_REPORT_SECTIONS.filter(
                        s => !profileFormSections.includes(s.id)
                      ).map(s => (
                        <button
                          key={s.id}
                          onClick={() => toggleSection(s.id)}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-bold flex items-center gap-1"
                        >
                          <Plus size={12} className="text-brand-cyan" /> {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Mandatory Required Fields */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <label className="text-[10px] font-bold uppercase text-slate-400 block">
                    Mandatory Required Fields (Missing Marker Enforced)
                  </label>
                  <p className="text-[11px] text-slate-500">
                    If missing from the project, these will visibly show as{' '}
                    <strong>[MISSING REQUIRED FIELD: ...]</strong> markers.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(FIELD_DISPLAY_LABELS).map(([key, label]) => {
                      const isChecked = profileFormRequired.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleRequiredField(key)}
                          className={`p-2 rounded-xl text-left text-xs transition-all border flex items-center justify-between ${
                            isChecked
                              ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                              : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                          }`}
                        >
                          <span className="text-[11px] font-bold truncate pr-1">{label}</span>
                          <span
                            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                              isChecked
                                ? 'bg-amber-400 text-slate-950 font-black text-[9px]'
                                : 'border border-slate-600'
                            }`}
                          >
                            {isChecked && '✓'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 flex justify-end space-x-3">
                  <button
                    onClick={() => setIsProfileModalOpen(false)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProfileForm}
                    disabled={!profileFormName.trim()}
                    className="px-6 py-2.5 bg-brand-cyan hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50"
                  >
                    Save Profile
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- PHOTO SELECTOR MODAL --- */}
        {isPhotoSelectorOpen && (
          <div className="absolute inset-0 bg-slate-950/90 z-20 flex flex-col pb-6 print:hidden">
            <div className="p-4 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-white font-bold text-lg flex items-center">
                <Camera className="mr-2" /> Select Photographic Evidence
              </h3>
              <button
                onClick={() => setIsPhotoSelectorOpen(false)}
                className="text-slate-950 bg-brand-cyan hover:bg-cyan-400 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider"
              >
                Done
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
              {(project.rooms?.flatMap(r => r.photos || []) || []).length === 0 ? (
                <div className="col-span-3 text-center text-slate-500 py-12">
                  No photos available in this project file.
                </div>
              ) : (
                (project.rooms?.flatMap(r => r.photos || []) || []).map(photo => {
                  const isSelected = selectedPhotos.some(p => p.id === photo.id);
                  return (
                    <div
                      key={photo.id}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedPhotos(selectedPhotos.filter(p => p.id !== photo.id));
                        } else {
                          setSelectedPhotos([...selectedPhotos, photo]);
                        }
                      }}
                      className={`relative aspect-video rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${
                        isSelected
                          ? 'border-brand-cyan ring-4 ring-brand-cyan/20'
                          : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={photo.url} alt="Photo" className="w-full h-full object-cover" />
                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-brand-cyan text-slate-900 rounded-full p-1">
                          <Check size={16} />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportGenerator;
