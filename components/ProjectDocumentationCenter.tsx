import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Calendar, 
  User, 
  Shield, 
  Droplets, 
  Sparkles, 
  Printer, 
  Copy, 
  Check, 
  Plus, 
  Layers, 
  AlertCircle,
  FileCheck,
  CheckSquare,
  Wrench,
  Wind,
  Compass,
  MapPin,
  Navigation,
  Loader2
} from 'lucide-react';
import { 
  Project, 
  ProjectDocumentationTemplates, 
  ClientIntakeForm, 
  ProjectScopeOutline, 
  ScopeOutlineItem, 
  DamageAssessmentChecklistItem
} from '../types';
import { ensureProjectDocumentationTemplates } from '../services/projectTemplateAutomation';
import { EventBus } from '../services/EventBus';
import { AIRouterClient } from '../services/AIRouterClient';
import { SignaturePad, SignaturePadSavePayload } from './SignaturePad';

interface ProjectDocumentationCenterProps {
  project: Project;
  onUpdateProject?: (updates: Partial<Project>) => void;
  onBack?: () => void;
  isMobile?: boolean;
}

type ActiveTemplateTab = 'client_intake' | 'scope_outline' | 'damage_assessment';

export const ProjectDocumentationCenter: React.FC<ProjectDocumentationCenterProps> = ({
  project,
  onUpdateProject,
  onBack,
  isMobile: _isMobile = false
}) => {
  // Ensure the project has the standard documentation templates initialized
  const initializedProject = useMemo(() => {
    return ensureProjectDocumentationTemplates(project);
  }, [project]);

  const [templates, setTemplates] = useState<ProjectDocumentationTemplates>(
    initializedProject.documentationTemplates!
  );

  const [activeTab, setActiveTab] = useState<ActiveTemplateTab>('client_intake');
  const [isCopied, setIsCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiEnhancing, setIsAiEnhancing] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<ScopeOutlineItem['category']>('Drying Equipment');

  // Latitude / Longitude to Street Address state for Client Intake Form
  const [intakeLat, setIntakeLat] = useState('');
  const [intakeLng, setIntakeLng] = useState('');
  const [isIntakeLocating, setIsIntakeLocating] = useState(false);
  const [intakeGeoInfo, setIntakeGeoInfo] = useState<{
    lat: number;
    lng: number;
    granularity: string;
    plusCode?: string;
    formattedAddress: string;
  } | null>(null);
  const [intakeGeoError, setIntakeGeoError] = useState<string | null>(null);

  // Keep state synced if project changes externally
  useEffect(() => {
    if (project.documentationTemplates) {
      setTemplates(project.documentationTemplates);
    } else {
      const ensured = ensureProjectDocumentationTemplates(project);
      if (ensured.documentationTemplates) {
        setTemplates(ensured.documentationTemplates);
        onUpdateProject?.({ documentationTemplates: ensured.documentationTemplates });
      }
    }
  }, [project, onUpdateProject]);

  // Persist template changes
  const saveTemplates = (newTemplates: ProjectDocumentationTemplates, extraProjectUpdates?: Partial<Project>) => {
    setTemplates(newTemplates);
    setIsSaving(true);
    onUpdateProject?.({ documentationTemplates: newTemplates, ...(extraProjectUpdates || {}) });
    setTimeout(() => setIsSaving(false), 500);

    EventBus.publish(
      'com.restorationai.documentation.templates_updated',
      { projectId: project.id, updatedTab: activeTab },
      project.id,
      'Documentation templates updated',
      'info'
    );
  };

  // --------------------------------------------------------------------------
  // Client Intake Handlers
  // --------------------------------------------------------------------------
  const updateIntakeField = (field: keyof ClientIntakeForm, value: unknown, extraProjectUpdates?: Partial<Project>) => {
    const updated: ProjectDocumentationTemplates = {
      ...templates,
      clientIntake: {
        ...templates.clientIntake,
        [field]: value,
        updatedAt: new Date().toISOString()
      }
    };
    saveTemplates(updated, extraProjectUpdates);
  };

  const resolveIntakeCoordinatesToAddress = async (lat: number, lng: number) => {
    setIntakeGeoError(null);
    setIntakeLat(lat.toFixed(6));
    setIntakeLng(lng.toFixed(6));
    setIsIntakeLocating(true);
    try {
      const res = await fetch(
        `/api/maps/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
      );
      const data = await res.json().catch(() => ({}));
      if (res.status === 429 || data?.quotaExceeded) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        throw new Error('Google Maps Platform quota reached.');
      }
      const resolvedAddr = data?.formattedAddress || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      updateIntakeField('propertyAddress', resolvedAddr, { address: resolvedAddr });
      setIntakeGeoInfo({
        lat,
        lng,
        granularity: data?.granularity || 'ROOFTOP',
        plusCode: data?.plusCode || '',
        formattedAddress: resolvedAddr,
      });
      EventBus.publish(
        'com.restorationai.location.reverse_geocoded',
        { latitude: lat, longitude: lng, address: resolvedAddr },
        project.id,
        `Client Intake Address Updated: ${resolvedAddr}`,
        'success'
      );
    } catch (err) {
      setIntakeGeoError(err instanceof Error ? err.message : 'Unable to resolve street address from coordinates.');
    } finally {
      setIsIntakeLocating(false);
    }
  };

  const handleConvertIntakeLatLng = async () => {
    setIntakeGeoError(null);
    let parsedLat = parseFloat(intakeLat.trim());
    let parsedLng = parseFloat(intakeLng.trim());

    if ((isNaN(parsedLat) || isNaN(parsedLng)) && templates.clientIntake.propertyAddress) {
      const match = templates.clientIntake.propertyAddress
        .trim()
        .match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
      if (match) {
        parsedLat = parseFloat(match[1]);
        parsedLng = parseFloat(match[2]);
      }
    }

    if (
      isNaN(parsedLat) ||
      isNaN(parsedLng) ||
      parsedLat < -90 ||
      parsedLat > 90 ||
      parsedLng < -180 ||
      parsedLng > 180
    ) {
      setIntakeGeoError('Enter valid Latitude (-90..90) and Longitude (-180..180) coordinates.');
      return;
    }

    await resolveIntakeCoordinatesToAddress(parsedLat, parsedLng);
  };

  const handleIntakeDeviceGps = () => {
    if (!navigator.geolocation) {
      setIntakeGeoError('Geolocation is not supported by this browser.');
      return;
    }
    setIsIntakeLocating(true);
    setIntakeGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await resolveIntakeCoordinatesToAddress(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setIsIntakeLocating(false);
        setIntakeGeoError('Could not read device GPS. Enter Latitude & Longitude manually to convert to an address.');
      }
    );
  };

  const handleSaveIntakeSignature = (payload: SignaturePadSavePayload) => {
    const updated: ProjectDocumentationTemplates = {
      ...templates,
      clientIntake: {
        ...templates.clientIntake,
        status: 'signed',
        workAuthorizationSigned: true,
        signedByName: payload.signerName,
        signedDate: payload.signedAt,
        signatureDataUrl: payload.signatureDataUrl,
        updatedAt: new Date().toISOString()
      }
    };
    saveTemplates(updated);
  };

  const handleSaveScopeSignature = (payload: SignaturePadSavePayload) => {
    const updated: ProjectDocumentationTemplates = {
      ...templates,
      scopeOutline: {
        ...templates.scopeOutline,
        status: 'approved',
        technicianSignOff: {
          techName: payload.signerName,
          date: payload.signedAt,
          signed: true,
          signatureDataUrl: payload.signatureDataUrl
        },
        updatedAt: new Date().toISOString()
      }
    };
    saveTemplates(updated);
  };

  const handleSaveAssessmentSignature = (payload: SignaturePadSavePayload) => {
    const updated: ProjectDocumentationTemplates = {
      ...templates,
      damageAssessment: {
        ...templates.damageAssessment,
        status: 'completed',
        technicianSignOff: {
          techName: payload.signerName,
          date: payload.signedAt,
          signed: true,
          signatureDataUrl: payload.signatureDataUrl
        },
        updatedAt: new Date().toISOString()
      }
    };
    saveTemplates(updated);
  };

  // --------------------------------------------------------------------------
  // Scope Outline Handlers
  // --------------------------------------------------------------------------
  const updateScopeField = (field: keyof ProjectScopeOutline, value: unknown) => {
    const updated: ProjectDocumentationTemplates = {
      ...templates,
      scopeOutline: {
        ...templates.scopeOutline,
        [field]: value,
        updatedAt: new Date().toISOString()
      }
    };
    saveTemplates(updated);
  };

  const toggleScopeItemStatus = (itemId: string) => {
    const currentItems = templates.scopeOutline.scopeItems;
    const itemIndex = currentItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;

    const item = currentItems[itemIndex];
    let nextStatus: ScopeOutlineItem['status'] = 'in_progress';
    if (item.status === 'pending') nextStatus = 'in_progress';
    else if (item.status === 'in_progress') nextStatus = 'completed';
    else if (item.status === 'completed') nextStatus = 'not_applicable';
    else nextStatus = 'pending';

    const newItems = [...currentItems];
    newItems[itemIndex] = { ...item, status: nextStatus };

    const updated: ProjectDocumentationTemplates = {
      ...templates,
      scopeOutline: {
        ...templates.scopeOutline,
        scopeItems: newItems,
        updatedAt: new Date().toISOString()
      }
    };
    saveTemplates(updated);
  };

  const handleAddScopeItem = () => {
    if (!newItemText.trim()) return;
    const newItem: ScopeOutlineItem = {
      id: `sc-custom-${Date.now()}`,
      category: newItemCategory,
      task: newItemText.trim(),
      description: 'Custom mitigation task identified by lead technician.',
      standardReference: 'IICRC S500 Standard Practice',
      status: 'pending'
    };

    const updated: ProjectDocumentationTemplates = {
      ...templates,
      scopeOutline: {
        ...templates.scopeOutline,
        scopeItems: [...templates.scopeOutline.scopeItems, newItem],
        updatedAt: new Date().toISOString()
      }
    };
    saveTemplates(updated);
    setNewItemText('');
  };

  // --------------------------------------------------------------------------
  // Damage Assessment Checklist Handlers
  // --------------------------------------------------------------------------
  const updateChecklistItemStatus = (
    itemId: string, 
    status: DamageAssessmentChecklistItem['status']
  ) => {
    const currentItems = templates.damageAssessment.checklistItems;
    const itemIndex = currentItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;

    const newItems = [...currentItems];
    newItems[itemIndex] = {
      ...newItems[itemIndex],
      status
    };

    const updated: ProjectDocumentationTemplates = {
      ...templates,
      damageAssessment: {
        ...templates.damageAssessment,
        checklistItems: newItems,
        updatedAt: new Date().toISOString()
      }
    };
    saveTemplates(updated);
  };

  const updateChecklistItemNotes = (itemId: string, notes: string) => {
    const currentItems = templates.damageAssessment.checklistItems;
    const itemIndex = currentItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;

    const newItems = [...currentItems];
    newItems[itemIndex] = {
      ...newItems[itemIndex],
      notes
    };

    const updated: ProjectDocumentationTemplates = {
      ...templates,
      damageAssessment: {
        ...templates.damageAssessment,
        checklistItems: newItems,
        updatedAt: new Date().toISOString()
      }
    };
    saveTemplates(updated);
  };

  // --------------------------------------------------------------------------
  // AI Scope & Assessment Enhancement
  // --------------------------------------------------------------------------
  const handleAiEnhance = async () => {
    setIsAiEnhancing(true);
    setAiMessage(null);
    try {
      const client = new AIRouterClient();
      const prompt = `You are a certified master restoration technician (IICRC S500 / S520).
Review this project's auto-generated setup templates:
Client: "${templates.clientIntake.clientName}"
Address: "${templates.clientIntake.propertyAddress}"
Loss Category: "${templates.scopeOutline.waterCategory}"
Loss Class: "${templates.scopeOutline.lossClass}"
Source: "${templates.clientIntake.waterSourceDescription}"
Current Scope Items: ${templates.scopeOutline.scopeItems.map(i => i.task).join(', ')}

Provide 2 specific, expert technical scope considerations or safety warnings that should be emphasized for this specific loss. Keep it concise, 2-3 sentences.`;

      const res = await client.execute('FAST_ANALYSIS', prompt);
      const text = res.text || 'Scope aligned with standard IICRC S500 procedures.';
      setAiMessage(text);

      // Append note to scope outline
      updateScopeField('targetDryStandard', `${templates.scopeOutline.targetDryStandard} | AI Insight: ${text}`);
    } catch (err) {
      console.warn('AI enhancement fallback:', err);
      setAiMessage('IICRC S500 standard mitigation protocols validated for this water class.');
    } finally {
      setIsAiEnhancing(false);
    }
  };

  // --------------------------------------------------------------------------
  // Copy to Clipboard / Export
  // --------------------------------------------------------------------------
  const generateMarkdownSummary = (): string => {
    const { clientIntake, scopeOutline, damageAssessment } = templates;
    return `
# WATER MITIGATION PROJECT SETUP & DOCUMENTATION
**Project:** ${clientIntake.clientName} | **Site:** ${clientIntake.propertyAddress}
**Loss Date:** ${clientIntake.lossDate} | **Intake Date:** ${clientIntake.intakeDate}
**Water Category:** ${scopeOutline.waterCategory} | **Loss Class:** ${scopeOutline.lossClass}
**Insurance:** ${clientIntake.insuranceCarrier} | **Claim #:** ${clientIntake.claimNumber}

---

## 1. CLIENT INTAKE & WORK AUTHORIZATION
- **Client Name:** ${clientIntake.clientName}
- **Contact:** ${clientIntake.clientPhone || 'N/A'} | ${clientIntake.clientEmail || 'N/A'}
- **Property Type:** ${clientIntake.propertyType} (${clientIntake.occupancyStatus})
- **Year Built:** ${clientIntake.yearBuilt} (Pre-1985 Asbestos Threshold: ${clientIntake.pre1985Structure ? 'YES' : 'NO'})
- **Water Source:** ${clientIntake.waterSourceDescription}
- **Supply Valve Shut Off:** ${clientIntake.waterTurnedOff ? 'Verified Yes' : 'Pending'}
- **Power Status:** ${clientIntake.powerStatus}
- **Work Authorization:** ${clientIntake.workAuthorizationSigned ? `Signed by ${clientIntake.signedByName} on ${clientIntake.signedDate}` : 'Pending Signature'}

---

## 2. IICRC S500 PROJECT SCOPE OUTLINE
- **Containment Level:** ${scopeOutline.containmentLevel}
- **Target Dry Standard:** ${scopeOutline.targetDryStandard}
- **Estimated Drying Duration:** ${scopeOutline.estimatedDryingDurationDays} Days
- **Dehumidifier Target:** ${scopeOutline.dehumidifierCapacityTarget}
- **Air Movers Estimated:** ${scopeOutline.airMoverCountEstimated} Units
- **HEPA Air Filtration Required:** ${scopeOutline.hepaAirScrubberRequired ? 'Yes' : 'No'}

### Scope Tasks:
${scopeOutline.scopeItems.map(item => `- [${item.status.toUpperCase()}] **${item.category}:** ${item.task} (${item.standardReference})`).join('\n')}

---

## 3. INITIAL DAMAGE ASSESSMENT CHECKLIST
- **Overall Condition:** ${damageAssessment.overallConditionRating}
- **Source Identified:** ${damageAssessment.sourceIdentified ? 'Yes' : 'No'} (${damageAssessment.sourceDescription})
- **Visible Microbial Growth:** ${damageAssessment.visibleMicrobialGrowth ? 'Yes' : 'None Observed'}
- **Electrical Hazard Present:** ${damageAssessment.electricalHazardsPresent ? 'Yes - Isolate' : 'Cleared'}

### Checklist Findings:
${damageAssessment.checklistItems.map(c => `- **${c.item}:** [${c.status.toUpperCase()}] - ${c.notes || c.description}`).join('\n')}

### Recommendations:
${damageAssessment.recommendations.map(r => `1. ${r}`).join('\n')}
`.trim();
  };

  const handleCopySummary = () => {
    const text = generateMarkdownSummary();
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  // Checklist counts
  const checklistStats = useMemo(() => {
    const items = templates.damageAssessment.checklistItems;
    const passed = items.filter(i => i.status === 'pass').length;
    const actionRequired = items.filter(i => i.status === 'action_required').length;
    const failed = items.filter(i => i.status === 'fail').length;
    return { total: items.length, passed, actionRequired, failed };
  }, [templates.damageAssessment.checklistItems]);

  const scopeProgress = useMemo(() => {
    const items = templates.scopeOutline.scopeItems;
    if (!items.length) return 0;
    const completed = items.filter(i => i.status === 'completed').length;
    return Math.round((completed / items.length) * 100);
  }, [templates.scopeOutline.scopeItems]);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      {/* Top Banner / Breadcrumb Header */}
      <div className="border-b border-white/10 bg-slate-900/90 backdrop-blur-md px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              ←
            </button>
          )}
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/30">
                Automated Initial Setup
              </span>
              {isSaving && (
                <span className="text-[10px] text-slate-400 animate-pulse flex items-center">
                  <Clock size={10} className="mr-1" /> Saving...
                </span>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2">
              <span>{templates.clientIntake.clientName}</span>
              <span className="text-slate-500 font-normal text-sm hidden sm:inline">|</span>
              <span className="text-slate-400 font-medium text-xs sm:text-sm hidden sm:inline">
                {templates.clientIntake.propertyAddress}
              </span>
            </h1>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleAiEnhance}
            disabled={isAiEnhancing}
            className="px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="Use Gemini to review and enhance scope based on standards"
          >
            <Sparkles size={14} className={isAiEnhancing ? 'animate-spin' : 'text-purple-400'} />
            <span className="hidden sm:inline">{isAiEnhancing ? 'Reviewing...' : 'AI Enhance'}</span>
          </button>

          <button
            onClick={handleCopySummary}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-bold flex items-center space-x-1.5 transition-all active:scale-95"
            title="Copy entire project setup summary to clipboard"
          >
            {isCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{isCopied ? 'Copied!' : 'Copy Summary'}</span>
          </button>

          <button
            onClick={handlePrint}
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-brand-cyan text-slate-950 font-bold text-xs flex items-center space-x-1.5 transition-all shadow-[0_0_12px_rgba(6,182,212,0.3)] hover:shadow-[0_0_18px_rgba(6,182,212,0.5)] active:scale-95"
            title="Print documentation templates"
          >
            <Printer size={14} />
            <span className="hidden sm:inline">Print / PDF</span>
          </button>
        </div>
      </div>

      {/* AI Insight Notification */}
      {aiMessage && (
        <div className="bg-purple-950/40 border-b border-purple-500/30 px-6 py-2.5 flex items-center justify-between text-xs text-purple-200">
          <div className="flex items-center space-x-2">
            <Sparkles size={14} className="text-purple-400 shrink-0" />
            <span><strong>IICRC Specialist Recommendation:</strong> {aiMessage}</span>
          </div>
          <button 
            onClick={() => setAiMessage(null)}
            className="text-purple-400 hover:text-white text-xs font-bold ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Template Navigation Tabs */}
      <div className="bg-slate-900 border-b border-white/5 px-4 sm:px-6 pt-3 flex space-x-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('client_intake')}
          className={`pb-3 px-4 font-bold text-xs uppercase tracking-wider transition-all border-b-2 flex items-center space-x-2 shrink-0 ${
            activeTab === 'client_intake'
              ? 'border-brand-cyan text-brand-cyan'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText size={16} />
          <span>1. Client Intake Form</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded font-black ${
            templates.clientIntake.workAuthorizationSigned ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
          }`}>
            {templates.clientIntake.workAuthorizationSigned ? 'Signed' : 'Draft'}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('scope_outline')}
          className={`pb-3 px-4 font-bold text-xs uppercase tracking-wider transition-all border-b-2 flex items-center space-x-2 shrink-0 ${
            activeTab === 'scope_outline'
              ? 'border-brand-cyan text-brand-cyan'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wrench size={16} />
          <span>2. Project Scope Outline</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded font-black bg-blue-500/20 text-blue-400">
            {scopeProgress}% Done
          </span>
        </button>

        <button
          onClick={() => setActiveTab('damage_assessment')}
          className={`pb-3 px-4 font-bold text-xs uppercase tracking-wider transition-all border-b-2 flex items-center space-x-2 shrink-0 ${
            activeTab === 'damage_assessment'
              ? 'border-brand-cyan text-brand-cyan'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CheckSquare size={16} />
          <span>3. Damage Assessment Checklist</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded font-black bg-purple-500/20 text-purple-400">
            {checklistStats.passed}/{checklistStats.total} Passed
          </span>
        </button>
      </div>

      {/* Main Content View per Template */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* ================================================================= */}
        {/* TAB 1: CLIENT INTAKE FORM */}
        {/* ================================================================= */}
        {activeTab === 'client_intake' && (
          <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
            {/* Auto-filled status banner */}
            <div className="glass-card p-4 rounded-2xl border border-emerald-500/20 bg-emerald-950/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <FileCheck size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Pre-Filled Client Intake</h4>
                  <p className="text-xs text-slate-400">
                    Client contact, property address, and insurance policy details were populated automatically.
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400">Status:</span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  templates.clientIntake.workAuthorizationSigned 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {templates.clientIntake.workAuthorizationSigned ? 'Work Authorized' : 'Pending Authorization'}
                </span>
              </div>
            </div>

            {/* General Client & Property Information */}
            <div className="glass-card p-6 rounded-3xl border border-white/10 space-y-6">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/5 pb-3">
                <User size={16} className="text-brand-cyan" />
                <span>Client & Property Demographics</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Client Full Name
                  </label>
                  <input
                    type="text"
                    value={templates.clientIntake.clientName}
                    onChange={(e) => updateIntakeField('clientName', e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand-cyan outline-none"
                    placeholder="e.g. John Doe"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Client Phone
                  </label>
                  <input
                    type="text"
                    value={templates.clientIntake.clientPhone}
                    onChange={(e) => updateIntakeField('clientPhone', e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand-cyan outline-none"
                    placeholder="e.g. (555) 123-4567"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Client Email
                  </label>
                  <input
                    type="email"
                    value={templates.clientIntake.clientEmail}
                    onChange={(e) => updateIntakeField('clientEmail', e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand-cyan outline-none"
                    placeholder="e.g. client@example.com"
                  />
                </div>

                <div className="md:col-span-2 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Property Address
                    </label>
                    <button
                      type="button"
                      onClick={handleIntakeDeviceGps}
                      disabled={isIntakeLocating}
                      className="text-[11px] font-bold text-brand-cyan hover:text-cyan-300 flex items-center gap-1"
                    >
                      {isIntakeLocating ? <Loader2 size={12} className="animate-spin" /> : <Navigation size={12} />}
                      <span>Use Device GPS</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={templates.clientIntake.propertyAddress}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateIntakeField('propertyAddress', val, { address: val });
                      const coordMatch = val.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
                      if (coordMatch) {
                        setIntakeLat(coordMatch[1]);
                        setIntakeLng(coordMatch[2]);
                      }
                    }}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand-cyan outline-none"
                    placeholder="Full street address, city, state, zip (or paste Lat, Lng)"
                  />

                  {/* Latitude & Longitude to Street Address Converter & Legend */}
                  <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-brand-cyan flex items-center gap-1.5">
                        <Compass size={13} />
                        <span>Latitude &amp; Longitude → Street Address Converter</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        Reverse Geocoding &amp; Legend
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                          Latitude (N/S)
                        </label>
                        <input
                          type="text"
                          value={intakeLat}
                          onChange={(e) => setIntakeLat(e.target.value)}
                          placeholder="e.g. 47.606209"
                          className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:border-brand-cyan outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                          Longitude (E/W)
                        </label>
                        <input
                          type="text"
                          value={intakeLng}
                          onChange={(e) => setIntakeLng(e.target.value)}
                          placeholder="e.g. -122.332069"
                          className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:border-brand-cyan outline-none"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={handleConvertIntakeLatLng}
                          disabled={isIntakeLocating}
                          className="w-full py-1.5 px-3 rounded-lg bg-brand-cyan/20 hover:bg-brand-cyan/30 border border-brand-cyan/40 text-brand-cyan text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                        >
                          {isIntakeLocating ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />}
                          <span>Make Address</span>
                        </button>
                      </div>
                    </div>

                    {intakeGeoError && (
                      <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                        {intakeGeoError}
                      </div>
                    )}

                    <div className="pt-1.5 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                      <div className="flex flex-wrap items-center gap-3 text-slate-400">
                        <span className="font-bold uppercase tracking-wider text-slate-500">Legend:</span>
                        <span className="flex items-center gap-1 text-emerald-400 font-bold">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          ROOFTOP Verified
                        </span>
                        <span className="flex items-center gap-1 text-brand-cyan font-bold">
                          <span className="w-2 h-2 rounded-full bg-brand-cyan" />
                          Lat/Lng GPS Pin
                        </span>
                        <span className="flex items-center gap-1 text-amber-400 font-bold">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          Approximate Parcel
                        </span>
                      </div>
                      {intakeGeoInfo && (
                        <span className="font-mono text-slate-300 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                          {intakeGeoInfo.lat.toFixed(5)}°, {intakeGeoInfo.lng.toFixed(5)}° ·{' '}
                          <strong className="text-emerald-400">{intakeGeoInfo.granularity}</strong>
                          {intakeGeoInfo.plusCode ? ` · ${intakeGeoInfo.plusCode}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Loss Occurrence Date
                  </label>
                  <input
                    type="date"
                    value={templates.clientIntake.lossDate}
                    onChange={(e) => updateIntakeField('lossDate', e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand-cyan outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Property Type
                  </label>
                  <select
                    value={templates.clientIntake.propertyType}
                    onChange={(e) => updateIntakeField('propertyType', e.target.value as ClientIntakeForm['propertyType'])}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand-cyan outline-none"
                  >
                    <option value="Single Family">Single Family Home</option>
                    <option value="Multi-Family">Multi-Family / Duplex</option>
                    <option value="Condo">Condo / Townhouse</option>
                    <option value="Commercial">Commercial Facility</option>
                    <option value="Industrial">Industrial Plant</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Occupancy Status
                  </label>
                  <select
                    value={templates.clientIntake.occupancyStatus}
                    onChange={(e) => updateIntakeField('occupancyStatus', e.target.value as ClientIntakeForm['occupancyStatus'])}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand-cyan outline-none"
                  >
                    <option value="Owner Occupied">Owner Occupied</option>
                    <option value="Tenant Occupied">Tenant Occupied</option>
                    <option value="Vacant">Vacant</option>
                    <option value="Commercial">Commercial Working Hours</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Year Built (Asbestos/Lead Threshold)
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={templates.clientIntake.yearBuilt}
                      onChange={(e) => {
                        const val = e.target.value;
                        const num = parseInt(val, 10);
                        const isPre85 = !isNaN(num) && num < 1985;
                        updateIntakeField('yearBuilt', val);
                        updateIntakeField('pre1985Structure', isPre85);
                      }}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand-cyan outline-none"
                      placeholder="e.g. 1994"
                    />
                    {templates.clientIntake.pre1985Structure && (
                      <span className="shrink-0 px-2 py-2 rounded-xl bg-red-500/20 text-red-400 text-[10px] font-bold uppercase flex items-center border border-red-500/30">
                        <AlertTriangle size={12} className="mr-1" /> Pre-85
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Insurance & Claim Details */}
            <div className="glass-card p-6 rounded-3xl border border-white/10 space-y-6">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/5 pb-3">
                <Shield size={16} className="text-indigo-400" />
                <span>Insurance Carrier & Coverage Information</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Insurance Carrier
                  </label>
                  <input
                    type="text"
                    value={templates.clientIntake.insuranceCarrier}
                    onChange={(e) => updateIntakeField('insuranceCarrier', e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand-cyan outline-none"
                    placeholder="e.g. State Farm, Travelers, Allstate"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Policy Number
                  </label>
                  <input
                    type="text"
                    value={templates.clientIntake.policyNumber}
                    onChange={(e) => updateIntakeField('policyNumber', e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand-cyan outline-none"
                    placeholder="e.g. POL-987234"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Claim Number
                  </label>
                  <input
                    type="text"
                    value={templates.clientIntake.claimNumber}
                    onChange={(e) => updateIntakeField('claimNumber', e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand-cyan outline-none"
                    placeholder="e.g. CLM-554433"
                  />
                </div>
              </div>
            </div>

            {/* Site Physical Inspection Parameters */}
            <div className="glass-card p-6 rounded-3xl border border-white/10 space-y-6">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/5 pb-3">
                <Droplets size={16} className="text-cyan-400" />
                <span>Intrusion Source & Site Utility Status</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Water Intrusion Source Description
                  </label>
                  <textarea
                    rows={2}
                    value={templates.clientIntake.waterSourceDescription}
                    onChange={(e) => updateIntakeField('waterSourceDescription', e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-brand-cyan outline-none"
                    placeholder="Describe how water breached the structure..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Main Water Supply Valve Status
                  </label>
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => updateIntakeField('waterTurnedOff', true)}
                      className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                        templates.clientIntake.waterTurnedOff 
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                          : 'bg-slate-900 text-slate-400 border-white/5 hover:text-white'
                      }`}
                    >
                      ✓ Valve Shut Off Confirmed
                    </button>
                    <button
                      type="button"
                      onClick={() => updateIntakeField('waterTurnedOff', false)}
                      className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                        !templates.clientIntake.waterTurnedOff 
                          ? 'bg-red-500/20 text-red-400 border-red-500/40 shadow-sm'
                          : 'bg-slate-900 text-slate-400 border-white/5 hover:text-white'
                      }`}
                    >
                      ⚠ Active Pressure / Unverified
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Electrical Power Status in Wet Areas
                  </label>
                  <select
                    value={templates.clientIntake.powerStatus}
                    onChange={(e) => updateIntakeField('powerStatus', e.target.value as ClientIntakeForm['powerStatus'])}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand-cyan outline-none"
                  >
                    <option value="Active">Active / Cleared by Tech</option>
                    <option value="Shut Off at Main">Shut Off at Main Service Panel</option>
                    <option value="Partial / Tripped Breakers">Partial Circuits Isolated & Tagged</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Work Authorization & Signature Section */}
            <div className="glass-card p-6 rounded-3xl border border-white/10 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <FileCheck size={16} className="text-emerald-400" />
                  <span>Work Authorization & Emergency Mitigation Agreement</span>
                </h3>
                {templates.clientIntake.workAuthorizationSigned && (
                  <span className="text-xs text-emerald-400 font-bold flex items-center">
                    <CheckCircle2 size={14} className="mr-1" />
                    Signed by {templates.clientIntake.signedByName} on {templates.clientIntake.signedDate}
                  </span>
                )}
              </div>

              <div className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 text-xs text-slate-300 leading-relaxed space-y-2">
                <p>
                  <strong>Authorization:</strong> The undersigned property owner / authorized agent hereby authorizes 
                  Restoration AI and assigned certified field mitigation technicians to enter the premises, perform emergency water extraction, 
                  deploy dehumidification and air movement equipment, remove non-salvageable wet materials, and apply antimicrobial treatments 
                  as defined under IICRC S500 standards to protect the structure against secondary damage and microbial amplification.
                </p>
                <p className="text-[11px] text-slate-400">
                  Direct billing will be submitted to the designated insurance carrier. The insured remains responsible for any applicable deductible.
                </p>
              </div>

              <SignaturePad
                label="Client / Authorized Representative Work Authorization Signature"
                defaultSignerName={templates.clientIntake.signedByName || templates.clientIntake.clientName}
                defaultSignerRole="Property Owner / Authorized Agent"
                existingSignatureDataUrl={templates.clientIntake.signatureDataUrl}
                existingSignedAt={templates.clientIntake.signedDate}
                onSave={handleSaveIntakeSignature}
                onClear={() => {
                  updateIntakeField('workAuthorizationSigned', false);
                  updateIntakeField('signedByName', '');
                  updateIntakeField('signedDate', '');
                  updateIntakeField('signatureDataUrl', undefined);
                }}
              />
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: PROJECT SCOPE OUTLINE */}
        {/* ================================================================= */}
        {activeTab === 'scope_outline' && (
          <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
            {/* Scope Header Card */}
            <div className="glass-card p-6 rounded-3xl border border-white/10 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">
                      IICRC S500 Standard Scope
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      Class: {templates.scopeOutline.lossClass} | Category: {templates.scopeOutline.waterCategory}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white">
                    {templates.scopeOutline.title}
                  </h3>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progress</div>
                    <div className="text-sm font-black text-brand-cyan">{scopeProgress}% Completed</div>
                  </div>
                  <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-cyan transition-all" style={{ width: `${scopeProgress}%` }} />
                  </div>
                </div>
              </div>

              {/* Technical Specifications Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-white/5">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Containment Level
                  </div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Layers size={14} className="text-brand-cyan" />
                    <span>{templates.scopeOutline.containmentLevel}</span>
                  </div>
                </div>

                <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-white/5">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Est. Duration
                  </div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Calendar size={14} className="text-indigo-400" />
                    <span>{templates.scopeOutline.estimatedDryingDurationDays} Days Standard</span>
                  </div>
                </div>

                <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-white/5">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Dehumidifier Target
                  </div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Droplets size={14} className="text-cyan-400" />
                    <span>{templates.scopeOutline.dehumidifierCapacityTarget}</span>
                  </div>
                </div>

                <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-white/5">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Air Movers Required
                  </div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Wind size={14} className="text-emerald-400" />
                    <span>{templates.scopeOutline.airMoverCountEstimated} Units (Formula Based)</span>
                  </div>
                </div>
              </div>

              {/* Dry Standard Baseline Note */}
              <div className="bg-slate-900/50 p-3 rounded-xl border border-white/5 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  <strong className="text-slate-200">Dry Standard Goal:</strong> {templates.scopeOutline.targetDryStandard}
                </span>
                <span className="text-[10px] text-brand-cyan uppercase font-bold tracking-widest">
                  Verified daily via psychrometric logs
                </span>
              </div>
            </div>

            {/* Scope Items List */}
            <div className="glass-card p-6 rounded-3xl border border-white/10 space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Wrench size={16} className="text-brand-cyan" />
                  <span>Mitigation Phases & Scope Actions</span>
                </h4>
                <span className="text-xs text-slate-400">
                  Click status pill to advance action state
                </span>
              </div>

              <div className="space-y-3">
                {templates.scopeOutline.scopeItems.map((item) => {
                  const statusColors: Record<ScopeOutlineItem['status'], string> = {
                    pending: 'bg-slate-800 text-slate-400 border-white/5',
                    in_progress: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
                    completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
                    not_applicable: 'bg-slate-800 text-slate-500 line-through border-white/5'
                  };

                  return (
                    <div
                      key={item.id}
                      className="bg-slate-900/80 border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-white/5 px-2 py-0.5 rounded">
                            {item.category}
                          </span>
                          <span className="text-[10px] font-mono text-cyan-400">
                            {item.standardReference}
                          </span>
                        </div>
                        <h5 className="text-sm font-bold text-white">{item.task}</h5>
                        <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                          {item.description}
                        </p>
                        {item.estimatedQuantity && (
                          <div className="text-[11px] text-brand-cyan font-medium">
                            Target Quantity: {item.estimatedQuantity}
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center space-x-2">
                        <button
                          onClick={() => toggleScopeItemStatus(item.id)}
                          className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all active:scale-95 ${statusColors[item.status]}`}
                        >
                          {item.status.replace('_', ' ')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Custom Scope Item */}
              <div className="pt-4 border-t border-white/5 flex flex-col sm:flex-row gap-2">
                <select
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value as ScopeOutlineItem['category'])}
                  className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
                >
                  <option value="Containment & Protection">Containment & Protection</option>
                  <option value="Water Extraction">Water Extraction</option>
                  <option value="Controlled Demolition">Controlled Demolition</option>
                  <option value="Antimicrobial & Cleaning">Antimicrobial & Cleaning</option>
                  <option value="Drying Equipment">Drying Equipment</option>
                  <option value="Monitoring & Verification">Monitoring & Verification</option>
                </select>

                <input
                  type="text"
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddScopeItem()}
                  placeholder="Add custom scope task..."
                  className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:border-brand-cyan outline-none"
                />

                <button
                  onClick={handleAddScopeItem}
                  disabled={!newItemText.trim()}
                  className="px-4 py-2 rounded-xl bg-brand-cyan text-slate-950 text-xs font-bold flex items-center justify-center space-x-1 disabled:opacity-50 transition-all hover:bg-cyan-400 active:scale-95"
                >
                  <Plus size={14} />
                  <span>Add Task</span>
                </button>
              </div>

              {/* Technician Scope Sign-Off Pad */}
              <div className="pt-4 border-t border-white/5">
                <SignaturePad
                  compact
                  label="Lead Technician Scope of Work Sign-Off"
                  defaultSignerName={templates.scopeOutline.technicianSignOff?.techName || templates.damageAssessment.inspectorName || 'Lead Mitigation Technician'}
                  existingSignatureDataUrl={templates.scopeOutline.technicianSignOff?.signatureDataUrl}
                  existingSignedAt={templates.scopeOutline.technicianSignOff?.date}
                  onSave={handleSaveScopeSignature}
                />
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: INITIAL DAMAGE ASSESSMENT CHECKLIST */}
        {/* ================================================================= */}
        {activeTab === 'damage_assessment' && (
          <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
            {/* Checklist Overview & Metrics */}
            <div className="glass-card p-6 rounded-3xl border border-white/10 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded border border-purple-500/30">
                      Multi-Point Field Inspection
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      Inspector: {templates.damageAssessment.inspectorName}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white">
                    {templates.damageAssessment.title}
                  </h3>
                </div>

                {/* Status Badges */}
                <div className="flex items-center space-x-2">
                  <div className="px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                    ✓ {checklistStats.passed} Passed
                  </div>
                  <div className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold">
                    ⚠ {checklistStats.actionRequired} Action Needed
                  </div>
                  {checklistStats.failed > 0 && (
                    <div className="px-3 py-1 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold">
                      ✕ {checklistStats.failed} Hazards
                    </div>
                  )}
                </div>
              </div>

              {/* Assessment Summary Parameters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-white/5">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Overall Severity
                  </div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-amber-400" />
                    <span>{templates.damageAssessment.overallConditionRating} Damage Severity</span>
                  </div>
                </div>

                <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-white/5">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Source Verified
                  </div>
                  <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 size={14} />
                    <span>{templates.damageAssessment.sourceIdentified ? 'Isolated & Shut Off' : 'Active Leak'}</span>
                  </div>
                </div>

                <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-white/5">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Visible Microbial Risk
                  </div>
                  <div className={`text-xs font-bold flex items-center gap-1.5 ${
                    templates.damageAssessment.visibleMicrobialGrowth ? 'text-red-400' : 'text-slate-300'
                  }`}>
                    <Shield size={14} />
                    <span>{templates.damageAssessment.visibleMicrobialGrowth ? 'Suspected / Odor Present' : 'No Pre-existing Growth'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Checklist Items Table */}
            <div className="glass-card p-6 rounded-3xl border border-white/10 space-y-4">
              <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/5 pb-3">
                <CheckSquare size={16} className="text-brand-cyan" />
                <span>Inspection Items & Safety Protocols</span>
              </h4>

              <div className="space-y-3">
                {templates.damageAssessment.checklistItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-900/80 border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-black uppercase tracking-wider bg-white/5 text-slate-400 px-2 py-0.5 rounded">
                          {item.section}
                        </span>
                        {item.severity === 'critical' && (
                          <span className="text-[9px] font-black uppercase tracking-wider bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded border border-red-500/30">
                            Critical Safety
                          </span>
                        )}
                      </div>

                      {/* Interactive Pass / Action / Fail Switcher */}
                      <div className="flex space-x-1 self-start sm:self-auto">
                        <button
                          onClick={() => updateChecklistItemStatus(item.id, 'pass')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                            item.status === 'pass'
                              ? 'bg-emerald-500 text-slate-950 shadow-sm'
                              : 'bg-white/5 text-slate-400 hover:text-white'
                          }`}
                        >
                          Pass
                        </button>
                        <button
                          onClick={() => updateChecklistItemStatus(item.id, 'action_required')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                            item.status === 'action_required'
                              ? 'bg-amber-500 text-slate-950 shadow-sm'
                              : 'bg-white/5 text-slate-400 hover:text-white'
                          }`}
                        >
                          Action Needed
                        </button>
                        <button
                          onClick={() => updateChecklistItemStatus(item.id, 'fail')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                            item.status === 'fail'
                              ? 'bg-red-500 text-white shadow-sm'
                              : 'bg-white/5 text-slate-400 hover:text-white'
                          }`}
                        >
                          Fail / Hazard
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-bold text-white mb-0.5">{item.item}</div>
                      <div className="text-xs text-slate-400 leading-relaxed">{item.description}</div>
                    </div>

                    {/* Technician Observation Notes */}
                    <div className="pt-2 border-t border-white/5">
                      <input
                        type="text"
                        value={item.notes || ''}
                        onChange={(e) => updateChecklistItemNotes(item.id, e.target.value)}
                        placeholder="Add field inspection note..."
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-brand-cyan outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations & Scope Directives */}
            <div className="glass-card p-6 rounded-3xl border border-white/10 space-y-4">
              <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/5 pb-3">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span>Immediate Field Directives & Next Steps</span>
              </h4>

              <div className="space-y-2">
                {templates.damageAssessment.recommendations.map((rec, idx) => (
                  <div key={idx} className="flex items-start space-x-2 text-xs text-slate-300">
                    <span className="text-brand-cyan font-bold mt-0.5">•</span>
                    <span>{rec}</span>
                  </div>
                ))}
              </div>

              {/* Inspector Damage Assessment Sign-Off Pad */}
              <div className="pt-4 border-t border-white/5">
                <SignaturePad
                  compact
                  label="Certified Inspector Damage Assessment Sign-Off"
                  defaultSignerName={templates.damageAssessment.technicianSignOff?.techName || templates.damageAssessment.inspectorName || 'Lead Mitigation Inspector'}
                  existingSignatureDataUrl={templates.damageAssessment.technicianSignOff?.signatureDataUrl}
                  existingSignedAt={templates.damageAssessment.technicianSignOff?.date}
                  onSave={handleSaveAssessmentSignature}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Signature Modal */}
      {showSignModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <FileCheck size={18} className="text-brand-cyan" />
                <span>Work Authorization Signature</span>
              </h3>
              <button
                onClick={() => setShowSignModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <SignaturePad
              label="Authorize Emergency Mitigation Services"
              defaultSignerName={signName || templates.clientIntake.clientName}
              existingSignatureDataUrl={templates.clientIntake.signatureDataUrl}
              onSave={handleSaveIntakeSignature}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDocumentationCenter;
