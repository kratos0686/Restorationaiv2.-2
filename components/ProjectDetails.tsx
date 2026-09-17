import { ProjectHealthSummary } from "./ProjectHealthSummary";
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Activity,
  Zap,
  ArrowRight,
  FileDown,
  Loader2,
  Thermometer,
  BrainCircuit,
  ScanLine,
  FileText,
  Image as ImageIcon,
  BookOpen,
  Pencil,
  User, MessageSquare,
  Shield,
  Phone,
  Sparkles,
  Mail,
  Calculator,
  Map,
  ListChecks,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Mic,
  MicOff,
  Paperclip,
  Check,
  X,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { getProjectById, updateProject } from "../services/api";
import {
  Project,
  RoomScan,
  WaterCategory,
  LossClass,
  ProjectStage,
} from "../types";
import { EventBus } from "../services/EventBus";
// Import sub-components
import PhotoDocumentation from "./PhotoDocumentation";
import DryingLogs from "./DryingLogs";
import WalkthroughViewer from "./WalkthroughViewer";
import SmartDocumentation from "./SmartDocumentation";
import PredictiveAnalysis from "./PredictiveAnalysis";
import Forms from "./Forms";
import ReferenceGuide from "./ReferenceGuide";
import TicSheet from "./TicSheet";
import TaskManager from "./TaskManager";
import EquipmentManager from "./EquipmentManager";
import DigitalChecklist from "./DigitalChecklist";

import PsychrometricCalculator from "./PsychrometricCalculator";
import RoomPsychrometrics from "./RoomPsychrometrics";
import ARMapping from "./ARMapping";
import ProjectTracking from "./ProjectTracking";
import WeatherWidget from "./WeatherWidget";
import { MoistureTrendWidget } from "./MoistureTrendWidget";
import { DailySummaryWidget } from "./DailySummaryWidget";
import { DashboardWidget } from "./DashboardWidget";
import ReportTemplates from "./ReportTemplates";
import { FieldUpdateModal } from "./FieldUpdateModal";
import ProjectDates from "./ProjectDates";
import RiskAssessment from "./RiskAssessment";
import ErrorBoundary from "./ErrorBoundary";
import Branding from "./Branding";
import WaterMitigationDocumentation from "./WaterMitigationDocumentation";
import ClientUpdatesLog from "./ClientUpdatesLog";

interface ProjectDetailsProps {
  isMobile?: boolean;
}

const ProjectDetails: React.FC<ProjectDetailsProps> = ({
  isMobile = false,
}) => {
  const { selectedProjectId, setActiveTab } = useAppContext();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<
    | "overview"
    | "dates"
    | "risk"
    | "scope"
    | "drying"
    | "photos"
    | "mitigation_docs"
    | "forms"
    | "predictive"
    | "reference"
    | "calculator"
    | "ar_mapping"
    | "tasks"
    | "equipment"
    | "room_readings"
    | "tracking"
    | "reports"
    | "checklists"
    | "client_portal"
  >("overview");
  const [showWalkthrough, setShowWalkthrough] = useState<RoomScan | null>(null);
  const [showFieldUpdateModal, setShowFieldUpdateModal] = useState(false);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [autoReportEnabled, setAutoReportEnabled] = useState(true);
  const [editForm, setEditForm] = useState<Partial<Project>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);
  const summaryRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditingMetadata && summaryRef.current) {
      summaryRef.current.style.height = "auto";
      summaryRef.current.style.height = `${summaryRef.current.scrollHeight}px`;
    }
  }, [isEditingMetadata, editForm.summary]);

  useEffect(() => {
    const fetchProject = async () => {
      if (selectedProjectId) {
        setIsLoading(true);
        try {
          const p = await getProjectById(selectedProjectId);
          setProject(p);
        } catch (e) {
          console.error("Failed to load project details", e);
        } finally {
          setIsLoading(false);
        }
      }
    };
    fetchProject();
  }, [selectedProjectId]);

  // Automatic Report Generation Listener
  useEffect(() => {
    if (!project || !autoReportEnabled) return;
    const sub1 = EventBus.on("com.restorationai.scan.completed", () => {
      // Automatically compile inspection report when scans complete
      if (!isGeneratingReport) handleGenerateReport();
    });
    const sub2 = EventBus.on("com.restorationai.report.requested", () => {
      if (!isGeneratingReport) handleGenerateReport();
    });
    return () => {
      sub1();
      sub2();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, isGeneratingReport, autoReportEnabled]);

  const handleGenerateReport = async () => {
    if (!project) return;
    setIsGeneratingReport(true);

    try {
      // 1. Gather all context
      const arMappingContext = project.arMapping
        ? {
            scale: project.arMapping.scale,
            markers: project.arMapping.markers.map((m) => ({
              label: m.label,
              type: m.type,
              tags: m.tags,
            })),
            areas: project.arMapping.areas.map((a) => {
              let areaSqFt = 0;
              if (project.arMapping?.scale && a.points.length > 2) {
                // Calculate area in square percentage units using shoelace formula
                let areaPct = 0;
                for (let i = 0; i < a.points.length; i++) {
                  const j = (i + 1) % a.points.length;
                  areaPct += a.points[i].x * a.points[j].y;
                  areaPct -= a.points[j].x * a.points[i].y;
                }
                areaPct = Math.abs(areaPct) / 2;
                // Convert to square feet: (pct^2) / (pct/ft)^2 = ft^2
                areaSqFt =
                  areaPct / (project.arMapping.scale * project.arMapping.scale);
              }
              return {
                label: a.label,
                type: a.type,
                tags: a.tags,
                calculatedAreaSqFt:
                  areaSqFt > 0 ? Math.round(areaSqFt * 10) / 10 : undefined,
              };
            }),
          }
        : null;

      const areaSqFtSum =
        arMappingContext?.areas.reduce(
          (acc, a) => acc + (a.calculatedAreaSqFt || 0),
          0,
        ) || 0;
      const roomsCount = project.rooms?.length || 0;
      const dehus =
        project.equipment?.filter((e) => e.type === "Dehumidifier").length || 0;
      const airmovers =
        project.equipment?.filter((e) => e.type === "Air Mover").length || 0;

      // Simulate AI Delay
      await new Promise((r) => setTimeout(r, 2000));

      // Generate Mock Scope Result based on context
      const scopeResult = {
        lineItems: [
          {
            code: "WTR EXTW",
            description: "Water extraction from hard surface flooring",
            quantity: areaSqFtSum > 0 ? areaSqFtSum : roomsCount * 250 || 500,
            unit: "SF",
            rate: 0.53,
          },
          {
            code: "WTR DRY",
            description:
              "Tear out non-salvageable drywall, clean up, bag and discard",
            quantity: areaSqFtSum > 0 ? areaSqFtSum * 0.4 : 200,
            unit: "SF",
            rate: 1.12,
          },
          {
            code: "WTR DHAM",
            description: "Air mover (LGR) - Daily rental",
            quantity: airmovers > 0 ? airmovers : roomsCount * 3 || 3,
            unit: "EA",
            rate: 35.0,
          },
          {
            code: "WTR DHD",
            description: "Dehumidifier - Extra Large - Daily rental",
            quantity: dehus > 0 ? dehus : roomsCount || 1,
            unit: "EA",
            rate: 125.0,
          },
          {
            code: "WTR MONG",
            description: "Monitoring and recording drying data (Daily)",
            quantity: 1,
            unit: "EA",
            rate: 65.0,
          },
        ],
      };

      const narrativeText = `Technician log for ${new Date().toLocaleDateString()}:\nArrived on site to assess ${project.waterCategory} water damage. Total affected area is approximately ${areaSqFtSum > 0 ? areaSqFtSum.toFixed(2) : (roomsCount * 250 || 500).toFixed(2)} SF. Placed ${airmovers > 0 ? airmovers : 3} air movers and ${dehus > 0 ? dehus : 1} dehumidifiers. Ongoing monitoring shows decreasing moisture levels across all affected rooms. All work performed according to IICRC S500 standard.`;

      // 4. Update Project
      const updates: Partial<Project> = {
        iicrcReport: narrativeText,
        xactimateReport: JSON.stringify(scopeResult.lineItems, null, 2),
        lineItems: scopeResult.lineItems.map((item) => ({
          id: `li-${Date.now()}-${Math.random()}`,
          code: item.code,
          description: item.description,
          quantity: item.quantity,
          rate: item.rate,
          total: item.quantity * item.rate,
          category: "Mitigation",
        })),
      };

      handleUpdateProject(updates);
      EventBus.publish(
        "com.restorationai.report.generated",
        { projectId: project.id },
        project.id,
        "IICRC & Xactimate Report Compiled",
        "success",
      );

      // Switch to scope tab to show results
      setActiveSubTab("scope");
    } catch (error) {
      console.error("Report Generation Failed", error);
      alert("Failed to generate report. Please check your connection.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleUpdateProject = (updates: Partial<Project>) => {
    if (project) {
      const updated = { ...project, ...updates };
      setProject(updated);
      setSaveStatus("saving");
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      updateProject(project.id, updates)
        .then(() => {
          setSaveStatus("saved");
          saveTimeoutRef.current = setTimeout(() => {
            setSaveStatus("idle");
          }, 3000);
        })
        .catch((e) => {
          console.error(e);
          setSaveStatus("idle");
        });
    }
  };

  const startEditing = () => {
    if (project) {
      setEditForm({
        client: project.client,
        address: project.address,
        clientEmail: project.clientEmail,
        clientPhone: project.clientPhone,
        insurance: project.insurance,
        policyNumber: project.policyNumber,
        claimNumber: project.claimNumber,
        adjuster: project.adjuster,
        adjusterEmail: project.adjusterEmail,
        adjusterPhone: project.adjusterPhone,
        summary: project.summary,
        waterCategory: project.waterCategory,
      });
      setIsEditingMetadata(true);
    }
  };

  const saveMetadata = () => {
    handleUpdateProject(editForm);
    setIsEditingMetadata(false);
  };

  if (isLoading)
    return (
      <div className="p-8 text-center text-slate-500 flex flex-col items-center">
        <Loader2 className="animate-spin mb-2" /> Loading Project...
      </div>
    );

  if (!project)
    return (
      <div className="p-8 text-center text-slate-500 flex flex-col items-center">
        <Shield size={48} className="text-slate-600 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Project Not Found</h2>
        <p className="mb-4 text-sm">
          The requested project could not be loaded. It may have been deleted.
        </p>
        <button
          onClick={() => setActiveTab("losses")}
          className="px-6 py-2 bg-brand-cyan text-slate-900 rounded-full font-bold"
        >
          Return to Dashboard
        </button>
      </div>
    );

  // --- MOBILE VIEW ---
  if (isMobile) {
    if (activeSubTab === "dates") {
      return (
        <ProjectDates
          project={project}
          onUpdate={handleUpdateProject}
          onBack={() => setActiveSubTab("overview")}
        />
      );
    }

    return (
      <div className="flex flex-col h-full bg-slate-950 text-slate-200">
        {/* Mobile Header */}
        <header className="p-4 bg-slate-900 border-b border-white/5 sticky top-0 z-20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3">
              <button onClick={() => setActiveTab("losses")}>
                <ArrowLeft size={24} />
              </button>
              <div>
                <h2 className="font-black text-white text-lg leading-none">
                  {project.client}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {project.currentStage}
                </p>
              </div>
            </div>
            <button 
              onClick={() => setShowFieldUpdateModal(true)}
              className="bg-brand-cyan text-slate-900 px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg flex items-center gap-1"
            >
              <Activity size={14} /> Update
            </button>
          </div>
          {/* Horizontal Scrollable Tabs */}
          <div className="flex space-x-2 overflow-x-auto no-scrollbar pb-1">
            {[
              "Overview",
              "Risk",
              "Tracking",
              "Checklists",
              "Tasks",
              "Equipment",
              "Drying",
              "Room Readings",
              "Scope",
              "Photos",
              "Calculator",
              "AR Mapping",
              "Forms",
              "Reference",
              "Client Portal",
              "Reports",
            ].map((tab) => (
              <button
                key={tab}
                onClick={() =>
                  setActiveSubTab(
                    tab.toLowerCase().replace(" ", "_") as
                      | "overview"
                      | "risk"
                      | "tracking"
                      | "scope"
                      | "drying"
                      | "photos"
                      | "forms"
                      | "predictive"
                      | "reference"
                      | "calculator"
                      | "ar_mapping"
                      | "tasks"
                      | "equipment"
                      | "room_readings"
                      | "reports"
                      | "checklists"
                      | "client_portal"
                  )
                }
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${activeSubTab === tab.toLowerCase().replace(" ", "_") ? "bg-brand-cyan text-slate-900" : "bg-white/5 text-slate-400"}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Render Content Based on Mobile Tab */}
          {activeSubTab === "overview" && (
            <>
              {/* Narrative Feed (Smart Doc) */}
              <div className="h-[400px]">
                <SmartDocumentation
                  project={project}
                  onUpdate={handleUpdateProject}
                />
              </div>

              {/* Dashboard KPI Widget */}
              <DashboardWidget project={project} />

              {/* Quick Stats Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900 p-4 rounded-2xl border border-white/5">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">
                    Risk Level
                  </div>
                  <div
                    className={`text-xl font-black ${project.riskLevel === "high" ? "text-red-500" : project.riskLevel === "medium" ? "text-amber-500" : "text-green-500"}`}
                  >
                    {project.riskLevel.toUpperCase()}
                  </div>
                </div>
                <div className="bg-slate-900 p-4 rounded-2xl border border-white/5">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">
                    Equipment
                  </div>
                  <div className="text-xl font-black text-brand-cyan">
                    {project.equipment?.length || 0} Units
                  </div>
                </div>
              </div>

              {/* Weather Info */}
              <WeatherWidget address={project.address} />

              {/* Moisture Trend Widget */}
              <ProjectHealthSummary project={project} />
              <MoistureTrendWidget project={project} />

              {/* Daily Summary */}
              <DailySummaryWidget project={project} onUpdate={handleUpdateProject} />

              {/* Water Damage Details */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-white/5 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center">
                  <Zap size={16} className="mr-2 text-brand-cyan" /> Water
                  Damage Details
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 block">
                      Water Category
                    </label>
                    <select
                      value={project.waterCategory}
                      onChange={(e) =>
                        handleUpdateProject({
                          waterCategory: e.target.value as WaterCategory,
                        })
                      }
                      className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-brand-cyan"
                    >
                      {Object.values(WaterCategory).map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500 block">
                      Loss Class
                    </label>
                    <select
                      value={project.lossClass}
                      onChange={(e) =>
                        handleUpdateProject({
                          lossClass: e.target.value as LossClass,
                        })
                      }
                      className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-brand-cyan"
                    >
                      {Object.values(LossClass).map((cls) => (
                        <option key={cls} value={cls}>
                          {cls}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Loss Details Section */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-white/5 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-white flex items-center">
                    <FileText size={16} className="mr-2 text-brand-cyan" /> Loss
                    Summary
                  </h3>
                  <button
                    onClick={startEditing}
                    className="p-2 bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                </div>

                {isEditingMetadata ? (
                  <div className="space-y-3">
                    <textarea
                      className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs text-slate-200 focus:border-brand-cyan outline-none"
                      rows={1}
                      value={editForm.summary || ""}
                      onChange={(e) => {
                        setEditForm({
                          ...editForm,
                          summary: e.target.value.slice(0, 2000),
                        });
                        e.target.style.height = "auto";
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      ref={summaryRef}
                      style={{
                        height: "auto",
                        overflow: "hidden",
                        resize: "none",
                      }}
                      placeholder="Loss Summary"
                    />
                    <div className="flex justify-end mt-1">
                      <span
                        className={`text-[10px] font-mono ${(editForm.summary?.length || 0) >= 1900 ? "text-red-400" : "text-slate-500"}`}
                      >
                        {editForm.summary?.length || 0} / 2000
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="bg-slate-950 border border-white/10 rounded-xl p-2 text-xs text-slate-200"
                        value={editForm.client || ""}
                        onChange={(e) =>
                          setEditForm({ ...editForm, client: e.target.value })
                        }
                        placeholder="Client Name"
                      />
                      <input
                        className="bg-slate-950 border border-white/10 rounded-xl p-2 text-xs text-slate-200"
                        value={editForm.address || ""}
                        onChange={(e) =>
                          setEditForm({ ...editForm, address: e.target.value })
                        }
                        placeholder="Property Address"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="bg-slate-950 border border-white/10 rounded-xl p-2 text-xs text-slate-200"
                        value={editForm.clientEmail || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            clientEmail: e.target.value,
                          })
                        }
                        placeholder="Client Email"
                      />
                      <input
                        className="bg-slate-950 border border-white/10 rounded-xl p-2 text-xs text-slate-200"
                        value={editForm.clientPhone || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            clientPhone: e.target.value,
                          })
                        }
                        placeholder="Client Phone"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="bg-slate-950 border border-white/10 rounded-xl p-2 text-xs text-slate-200"
                        value={editForm.insurance || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            insurance: e.target.value,
                          })
                        }
                        placeholder="Insurance"
                      />
                      <input
                        className="bg-slate-950 border border-white/10 rounded-xl p-2 text-xs text-slate-200"
                        value={editForm.claimNumber || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            claimNumber: e.target.value,
                          })
                        }
                        placeholder="Claim #"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="bg-slate-950 border border-white/10 rounded-xl p-2 text-xs text-slate-200"
                        value={editForm.policyNumber || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            policyNumber: e.target.value,
                          })
                        }
                        placeholder="Policy #"
                      />
                      <input
                        className="bg-slate-950 border border-white/10 rounded-xl p-2 text-xs text-slate-200"
                        value={editForm.adjuster || ""}
                        onChange={(e) =>
                          setEditForm({ ...editForm, adjuster: e.target.value })
                        }
                        placeholder="Adjuster Name"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="bg-slate-950 border border-white/10 rounded-xl p-2 text-xs text-slate-200"
                        value={editForm.adjusterEmail || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            adjusterEmail: e.target.value,
                          })
                        }
                        placeholder="Adjuster Email"
                      />
                      <input
                        className="bg-slate-950 border border-white/10 rounded-xl p-2 text-xs text-slate-200"
                        value={editForm.adjusterPhone || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            adjusterPhone: e.target.value,
                          })
                        }
                        placeholder="Adjuster Phone"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <select
                        className="bg-slate-950 border border-white/10 rounded-xl p-2 text-xs text-slate-200 outline-none"
                        value={editForm.waterCategory || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            waterCategory: e.target.value as WaterCategory,
                          })
                        }
                      >
                        <option value="" disabled>
                          Select Water Category
                        </option>
                        {Object.values(WaterCategory).map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={saveMetadata}
                        className="flex-1 py-2 bg-brand-cyan text-slate-900 rounded-xl text-xs font-bold"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setIsEditingMetadata(false)}
                        className="flex-1 py-2 bg-white/5 text-slate-400 rounded-xl text-xs font-bold"
                      >
                        Cancel
                      </button>
                    </div>
                    {saveStatus !== "idle" && (
                      <div className="flex items-center justify-end space-x-1.5 text-[11px] pt-1">
                        {saveStatus === "saving" ? (
                          <>
                            <Loader2 size={12} className="animate-spin text-brand-cyan" />
                            <span className="text-slate-400 font-medium">Saving changes...</span>
                          </>
                        ) : (
                          <>
                            <Check size={12} className="text-emerald-400" />
                            <span className="text-emerald-400 font-medium">Changes Saved</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {project.summary ? (
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {project.summary}
                      </p>
                    ) : (
                      <EmptySummaryInput
                        onSave={(summary) => handleUpdateProject({ summary })}
                      />
                    )}

                    <div className="pt-4 border-t border-white/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <User size={14} className="text-slate-500" />
                          <span className="text-[10px] font-bold uppercase text-slate-500">
                            Client Contact
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        <div className="flex items-center space-x-2 text-xs text-slate-200 font-bold">
                          <User size={12} className="text-brand-cyan" />
                          <span>{project.client}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-slate-300">
                          <Map size={12} className="text-brand-cyan" />
                          <span>{project.address}</span>
                        </div>
                        {project.clientEmail && (
                          <div className="flex items-center space-x-2 text-xs text-slate-300">
                            <Mail size={12} className="text-brand-cyan" />
                            <span>{project.clientEmail}</span>
                          </div>
                        )}
                        {project.clientPhone && (
                          <div className="flex items-center space-x-2 text-xs text-slate-300">
                            <Phone size={12} className="text-brand-cyan" />
                            <span>{project.clientPhone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/5 space-y-3">
                      <div className="flex items-center space-x-2">
                        <Shield size={14} className="text-slate-500" />
                        <span className="text-[10px] font-bold uppercase text-slate-500">
                          Insurance Info
                        </span>
                      </div>
                      <div className="bg-slate-950/50 p-3 rounded-xl border border-white/5 space-y-2">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500">Carrier</span>
                          <span className="text-slate-200 font-bold">
                            {project.insurance || "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500">Policy #</span>
                          <span className="text-slate-200 font-mono">
                            {project.policyNumber || "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500">Claim #</span>
                          <span className="text-slate-200 font-mono">
                            {project.claimNumber || "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500">Adjuster</span>
                          <span className="text-slate-200">
                            {project.adjuster || "N/A"}
                          </span>
                        </div>
                        {project.adjusterEmail && (
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">Adj. Email</span>
                            <span className="text-slate-200">
                              {project.adjusterEmail}
                            </span>
                          </div>
                        )}
                        {project.adjusterPhone && (
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">Adj. Phone</span>
                            <span className="text-slate-200">
                              {project.adjusterPhone}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-6">
                      <button
                        onClick={() => setActiveTab("scanner")}
                        className="w-full py-4 bg-gradient-to-r from-brand-cyan to-blue-500 text-slate-900 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-brand-cyan/20 flex items-center justify-center space-x-3 group active:scale-95 transition-all"
                      >
                        <ScanLine
                          size={20}
                          className="group-hover:scale-110 transition-transform"
                        />
                        <span>Initiate Room Scan</span>
                      </button>
                      <p className="text-[10px] text-slate-500 text-center mt-3 font-medium italic">
                        Capture spatial data and moisture mapping via image
                        scan.
                      </p>
                    </div>
                  </>
                )}
              </div>

              <ErrorBoundary>
                <ProjectNotes
                  project={project}
                  onUpdate={handleUpdateProject}
                />
              </ErrorBoundary>
            </>
          )}

          {activeSubTab === "tracking" && (
            <ProjectTracking project={project} onUpdate={handleUpdateProject} />
          )}
          {activeSubTab === "checklists" && (
            <DigitalChecklist
              project={project}
              onUpdate={handleUpdateProject}
            />
          )}
          {activeSubTab === "tasks" && (
            <TaskManager project={project} onUpdate={handleUpdateProject} />
          )}
          {activeSubTab === "drying" && (
            <DryingLogs
              project={project}
              onUpdate={handleUpdateProject}
            />
          )}
          {activeSubTab === "room_readings" && (
            <div className="h-[600px]">
              <RoomPsychrometrics
                project={project}
                onUpdate={handleUpdateProject}
              />
            </div>
          )}

          {activeSubTab === "risk" && (
            <RiskAssessment project={project} onUpdate={handleUpdateProject} />
          )}
          {activeSubTab === "scope" && (
            <TicSheet project={project} embedded={true} />
          )}

          {activeSubTab === "photos" && (
            <PhotoDocumentation
              project={project}
              onStartScan={() => setActiveTab("scanner")}
              onUpdate={handleUpdateProject}
            />
          )}
          {activeSubTab === "calculator" && (
            <div className="p-4">
              <PsychrometricCalculator />
            </div>
          )}
          {activeSubTab === "ar_mapping" && (
            <div className="h-[600px]">
              <ARMapping project={project} onUpdate={handleUpdateProject} />
            </div>
          )}
          {activeSubTab === "equipment" && (
            <EquipmentManager
              project={project}
              onUpdate={handleUpdateProject}
            />
          )}
          {activeSubTab === "forms" && (
            <Forms onComplete={() => setActiveSubTab("overview")} />
          )}
          {activeSubTab === "reference" && (
            <ReferenceGuide onBack={() => setActiveSubTab("overview")} />
          )}
          {activeSubTab === "reports" && <ReportTemplates project={project} />}
          {activeSubTab === "client_portal" && (
            <ClientUpdatesLog project={project} onUpdate={handleUpdateProject} />
          )}
        </div>

        {showFieldUpdateModal && (
          <FieldUpdateModal 
            project={project} 
            onClose={() => setShowFieldUpdateModal(false)} 
            onUpdate={handleUpdateProject} 
          />
        )}
        {/* Floating Action Button for Mobile */}
        <div className="absolute bottom-6 right-6 z-30">
          <button
            onClick={() => setActiveTab("scanner")}
            className="w-14 h-14 bg-brand-cyan rounded-full flex items-center justify-center text-slate-900 shadow-lg shadow-brand-cyan/30"
          >
            <ScanLine size={24} />
          </button>
        </div>
      </div>
    );
  }

  // --- DESKTOP VIEW ---
  return (
    <div className="flex h-full bg-slate-950">
      {/* Left Context Sidebar (Desktop) */}
      <aside
        className={`relative border-r border-white/5 bg-slate-950 flex flex-col p-4 space-y-2 transition-all duration-300 ${isSidebarCollapsed ? "w-20 items-center" : "w-64"}`}
      >
        {/* Company Identity */}
        <div className="pb-3 mb-2 border-b border-white/5 w-full flex justify-center">
          <Branding isCollapsed={isSidebarCollapsed} size="sm" />
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-6 w-6 h-6 bg-slate-800 rounded-full border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors z-30"
        >
          {isSidebarCollapsed ? (
            <ChevronRight size={12} />
          ) : (
            <ChevronLeft size={12} />
          )}
        </button>

        <div
          className={`mb-6 ${isSidebarCollapsed ? "px-0 text-center" : "px-2"}`}
        >
          <div
            className={`flex items-center text-slate-500 mb-2 cursor-pointer hover:text-white transition-colors ${isSidebarCollapsed ? "justify-center" : "space-x-2"}`}
            onClick={() => setActiveTab("losses")}
            title="Back to List"
          >
            <ArrowLeft size={16} />{" "}
            {!isSidebarCollapsed && (
              <span className="text-xs font-bold uppercase tracking-wider">
                Back to List
              </span>
            )}
          </div>
          {!isSidebarCollapsed && (
            <>
              <h1 className="text-xl font-black text-white leading-tight">
                {project.client}
              </h1>
              <p className="text-xs text-slate-400 mt-1">{project.address}</p>
              <div className="mt-3 flex items-center space-x-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${project.riskLevel === "high" ? "bg-red-500/20 text-red-400" : project.riskLevel === "medium" ? "bg-amber-500/20 text-amber-400" : "bg-green-500/20 text-green-400"}`}
                >
                  {project.riskLevel} Risk
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-500/20 text-blue-400">
                  {project.waterCategory}
                </span>
              </div>
            </>
          )}
          {isSidebarCollapsed && (
            <div className="mt-4 flex flex-col items-center space-y-2">
              <span
                className={`w-3 h-3 rounded-full ${project.riskLevel === "high" ? "bg-red-500" : project.riskLevel === "medium" ? "bg-amber-500" : "bg-green-500"}`}
                title={`${project.riskLevel} Risk`}
              ></span>
              <span
                className="w-3 h-3 rounded-full bg-blue-500"
                title={project.waterCategory}
              ></span>
            </div>
          )}
        </div>

        {!isSidebarCollapsed && (
          <div className="mb-4">
            <WeatherWidget address={project.address} />
          </div>
        )}

        <div
          className={`flex-1 overflow-y-auto pb-4 space-y-6 mt-2 ${isSidebarCollapsed ? "pr-0" : "pr-2"}`}
        >
          <div className="space-y-1">
            {!isSidebarCollapsed && (
              <div className="px-3 text-[10px] font-black tracking-widest text-emerald-500 uppercase mb-2">
                1. Intake
              </div>
            )}
            <NavButton
              label="Loss Overview"
              icon={<Activity size={18} />}
              active={activeSubTab === "overview"}
              onClick={() => setActiveSubTab("overview")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavButton
              label="Risk Assessment"
              icon={<Shield size={18} />}
              active={activeSubTab === "risk"}
              onClick={() => setActiveSubTab("risk")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavButton
              label="Dates & Trips"
              icon={<Calendar size={18} />}
              active={activeSubTab === "dates"}
              onClick={() => setActiveSubTab("dates")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavButton
              label="Project Tracking"
              icon={<Activity size={18} />}
              active={activeSubTab === "tracking"}
              onClick={() => setActiveSubTab("tracking")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavButton
              label="Client Updates"
              icon={<MessageSquare size={18} />}
              active={activeSubTab === "client_portal"}
              onClick={() => setActiveSubTab("client_portal")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavButton
              label="Checklists"
              icon={<ListChecks size={18} />}
              active={activeSubTab === "checklists"}
              onClick={() => setActiveSubTab("checklists")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavButton
              label="Forms & Auth"
              icon={<Pencil size={18} />}
              active={activeSubTab === "forms"}
              onClick={() => setActiveSubTab("forms")}
              isCollapsed={isSidebarCollapsed}
            />
          </div>

          <div className="space-y-1">
            {!isSidebarCollapsed && (
              <div className="px-3 text-[10px] font-black tracking-widest text-cyan-500 uppercase mb-2">
                2. Inspection
              </div>
            )}
            <NavButton
              label="AR Mapping"
              icon={<Map size={18} />}
              active={activeSubTab === "ar_mapping"}
              onClick={() => setActiveSubTab("ar_mapping")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavButton
              label="Photo Doc & Video"
              icon={<ImageIcon size={18} />}
              active={activeSubTab === "photos"}
              onClick={() => setActiveSubTab("photos")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavButton
              label="AI Water Mitigation"
              icon={<Zap size={18} className="text-[#00d4aa]" />}
              active={activeSubTab === "mitigation_docs"}
              onClick={() => setActiveSubTab("mitigation_docs")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavButton
              label="Reference Guide"
              icon={<BookOpen size={18} />}
              active={activeSubTab === "reference"}
              onClick={() => setActiveSubTab("reference")}
              isCollapsed={isSidebarCollapsed}
            />
          </div>

          <div className="space-y-1">
            {!isSidebarCollapsed && (
              <div className="px-3 text-[10px] font-black tracking-widest text-amber-500 uppercase mb-2">
                3. Scope
              </div>
            )}
            <NavButton
              label="Estimate Scope"
              icon={<FileText size={18} />}
              active={activeSubTab === "scope"}
              onClick={() => setActiveSubTab("scope")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavButton
              label="Psych Calculator"
              icon={<Calculator size={18} />}
              active={activeSubTab === "calculator"}
              onClick={() => setActiveSubTab("calculator")}
              isCollapsed={isSidebarCollapsed}
            />
          </div>

          <div className="space-y-1">
            {!isSidebarCollapsed && (
              <div className="px-3 text-[10px] font-black tracking-widest text-blue-500 uppercase mb-2">
                4. Stabilize
              </div>
            )}
            <NavButton
              label="Tasks & Setup"
              icon={<ListChecks size={18} />}
              active={activeSubTab === "tasks"}
              onClick={() => setActiveSubTab("tasks")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavButton
              label="Equipment Manager"
              icon={<Zap size={18} />}
              active={activeSubTab === "equipment"}
              onClick={() => setActiveSubTab("equipment")}
              isCollapsed={isSidebarCollapsed}
            />
          </div>

          <div className="space-y-1">
            {!isSidebarCollapsed && (
              <div className="px-3 text-[10px] font-black tracking-widest text-purple-500 uppercase mb-2">
                5. Monitor
              </div>
            )}
            <NavButton
              label="Drying Logs"
              icon={<Thermometer size={18} />}
              active={activeSubTab === "drying"}
              onClick={() => setActiveSubTab("drying")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavButton
              label="Room Psychrometrics"
              icon={<Thermometer size={18} />}
              active={activeSubTab === "room_readings"}
              onClick={() => setActiveSubTab("room_readings")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavButton
              label="Predictive AI"
              icon={<BrainCircuit size={18} />}
              active={activeSubTab === "predictive"}
              onClick={() => setActiveSubTab("predictive")}
              isCollapsed={isSidebarCollapsed}
            />
          </div>

          <div className="space-y-1">
            {!isSidebarCollapsed && (
              <div className="px-3 text-[10px] font-black tracking-widest text-pink-500 uppercase mb-2">
                6. Closeout
              </div>
            )}
            <NavButton
              label="Signatures & Closeout"
              icon={<Pencil size={18} />}
              active={activeSubTab === "forms"}
              onClick={() => setActiveSubTab("forms")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavButton
              label="Report Templates"
              icon={<FileDown size={18} />}
              active={activeSubTab === "reports"}
              onClick={() => setActiveSubTab("reports")}
              isCollapsed={isSidebarCollapsed}
            />
          </div>
        </div>

        <div className="mt-auto pt-4 border-t border-white/5">
          <button
            onClick={handleGenerateReport}
            disabled={isGeneratingReport}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center transition-colors"
            title={isSidebarCollapsed ? "Compile Scope" : undefined}
          >
            {isGeneratingReport ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ListChecks size={16} />
            )}
            {!isSidebarCollapsed && <span className="ml-2">Compile Scope</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8 relative flex flex-col">
        {/* Project Stage Stepper */}
        <div className="flex items-center justify-end mb-4 shrink-0">
          <button 
            onClick={() => setShowFieldUpdateModal(true)}
            className="bg-brand-cyan hover:bg-cyan-400 transition-colors text-slate-900 px-4 py-2 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2"
          >
            <Activity size={16} /> Log Field Update
          </button>
        </div>
        {/* Project Stage Stepper */}
        <div className="mb-8 hidden lg:flex items-center justify-between bg-slate-900 border border-white/5 rounded-2xl p-2 shadow-lg shadow-black/20 shrink-0">
          {[
            "Intake",
            "Inspection",
            "Scope",
            "Stabilize",
            "Monitor",
            "Closeout",
          ].map((stage, idx, arr) => {
            const stagesStr = [
              "Intake",
              "Inspection",
              "Scope",
              "Stabilize",
              "Monitor",
              "Closeout",
            ];
            const currentIndex = stagesStr.indexOf(project.currentStage);
            const isPast = currentIndex >= idx;
            const isCurrent = project.currentStage === stage;
            const isCompleted = idx < currentIndex;

            return (
              <React.Fragment key={stage}>
                <motion.div
                  onClick={() =>
                    handleUpdateProject({ currentStage: stage as ProjectStage })
                  }
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="relative flex-1 flex flex-col items-center justify-center p-3 rounded-xl cursor-pointer transition-all overflow-hidden"
                >
                  {isCurrent && (
                    <motion.div
                      layoutId="activeStageGlow"
                      className="absolute inset-0 bg-brand-cyan/10 ring-1 ring-brand-cyan/30 rounded-xl"
                      initial={false}
                      transition={{
                        type: "spring",
                        stiffness: 350,
                        damping: 30,
                      }}
                    />
                  )}

                  <motion.div
                    className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 z-10"
                    animate={{
                      color: isCurrent
                        ? "#22d3ee"
                        : isCompleted
                          ? "#cbd5e1"
                          : "#475569",
                    }}
                    transition={{ duration: 0.3 }}
                  >
                    <span className="relative w-4 h-4 flex items-center justify-center rounded-full bg-black/30 border border-white/5">
                      <AnimatePresence mode="wait">
                        {isCompleted ? (
                          <motion.span
                            key="checkmark"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center justify-center"
                          >
                            <svg
                              className="w-3 h-3 text-brand-cyan"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <motion.path
                                d="M20 6L9 17l-5-5"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 0.3, delay: 0.1 }}
                              />
                            </svg>
                          </motion.span>
                        ) : (
                          <motion.span
                            key="number"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-[9px] font-bold"
                          >
                            {idx + 1}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                    <span>{stage}</span>
                  </motion.div>
                  <motion.div
                    className="mt-2 w-full h-1.5 rounded-full z-10"
                    animate={{
                      backgroundColor: isPast ? "#22d3ee" : "#1e293b",
                      boxShadow: isPast
                        ? "0px 0px 8px rgba(34,211,238,0.4)"
                        : "0px 0px 0px rgba(0,0,0,0)",
                    }}
                    transition={{ duration: 0.4 }}
                  />
                </motion.div>
                {idx < arr.length - 1 && (
                  <ChevronRight
                    size={16}
                    className="text-slate-700 mx-1 shrink-0"
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Content Wrapper */}
        <div className="flex-1 relative">
          {activeSubTab === "overview" && (
            <div className="grid grid-cols-12 gap-6">
              {/* Left Column: Smart Doc */}
              <div className="col-span-8 space-y-6">
                <div className="h-[500px] border border-white/5 rounded-[2.5rem] overflow-hidden">
                  <SmartDocumentation
                    project={project}
                    onUpdate={handleUpdateProject}
                  />
                </div>
                <DashboardWidget project={project} />
                <DailySummaryWidget project={project} onUpdate={handleUpdateProject} />
                <ProjectHealthSummary project={project} />
              <MoistureTrendWidget project={project} />
              </div>

              {/* Right Column: 3D Scans & Quick Actions */}
              <div className="col-span-4 space-y-6">
                {/* Loss & Insurance Details (Desktop) */}
                <div className="glass-card p-6 rounded-[2rem]">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-white flex items-center">
                      <Shield size={18} className="mr-2 text-brand-cyan" /> Loss
                      & Insurance
                    </h3>
                    <button
                      onClick={startEditing}
                      className="p-2 bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>

                  {isEditingMetadata ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Client Name
                          </label>
                          <input
                            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-slate-200"
                            value={editForm.client || ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                client: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Property Address
                          </label>
                          <input
                            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-slate-200"
                            value={editForm.address || ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                address: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                          Loss Summary
                        </label>
                        <textarea
                          className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-xs text-slate-200 focus:border-brand-cyan outline-none"
                          rows={1}
                          value={editForm.summary || ""}
                          onChange={(e) => {
                            setEditForm({
                              ...editForm,
                              summary: e.target.value.slice(0, 2000),
                            });
                            e.target.style.height = "auto";
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
                          ref={summaryRef}
                          style={{
                            height: "auto",
                            overflow: "hidden",
                            resize: "none",
                          }}
                        />
                        <div className="flex justify-end mt-1">
                          <span
                            className={`text-[10px] font-mono ${(editForm.summary?.length || 0) >= 1900 ? "text-red-400" : "text-slate-500"}`}
                          >
                            {editForm.summary?.length || 0} / 2000
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Carrier
                          </label>
                          <input
                            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-slate-200"
                            value={editForm.insurance || ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                insurance: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Claim #
                          </label>
                          <input
                            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-slate-200"
                            value={editForm.claimNumber || ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                claimNumber: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Policy #
                          </label>
                          <input
                            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-slate-200"
                            value={editForm.policyNumber || ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                policyNumber: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Adjuster Name
                          </label>
                          <input
                            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-slate-200"
                            value={editForm.adjuster || ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                adjuster: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Adjuster Email
                          </label>
                          <input
                            type="email"
                            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-slate-200"
                            value={editForm.adjusterEmail || ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                adjusterEmail: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Adjuster Phone
                          </label>
                          <input
                            type="tel"
                            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-slate-200"
                            value={editForm.adjusterPhone || ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                adjusterPhone: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Client Email
                          </label>
                          <input
                            type="email"
                            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-slate-200"
                            value={editForm.clientEmail || ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                clientEmail: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Client Phone
                          </label>
                          <input
                            type="tel"
                            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-slate-200"
                            value={editForm.clientPhone || ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                clientPhone: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Water Category
                          </label>
                          <select
                            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-slate-200 outline-none"
                            value={editForm.waterCategory || ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                waterCategory: e.target.value as WaterCategory,
                              })
                            }
                          >
                            <option value="" disabled>
                              Select Water Category
                            </option>
                            {Object.values(WaterCategory).map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 pt-2">
                        <button
                          onClick={saveMetadata}
                          className="flex-1 py-2 bg-brand-cyan text-slate-900 rounded-xl text-xs font-bold"
                        >
                          Save Changes
                        </button>
                        <button
                          onClick={() => setIsEditingMetadata(false)}
                          className="flex-1 py-2 bg-white/5 text-slate-400 rounded-xl text-xs font-bold"
                        >
                          Cancel
                        </button>
                      </div>
                      {saveStatus !== "idle" && (
                        <div className="flex items-center justify-end space-x-1.5 text-[11px]">
                          {saveStatus === "saving" ? (
                            <>
                              <Loader2 size={12} className="animate-spin text-brand-cyan" />
                              <span className="text-slate-400 font-medium">Saving changes...</span>
                            </>
                          ) : (
                            <>
                              <Check size={12} className="text-emerald-400" />
                              <span className="text-emerald-400 font-medium">Changes Saved</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Client Name
                          </label>
                          <p className="text-xs text-slate-200 font-bold">
                            {project.client || "N/A"}
                          </p>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Property Address
                          </label>
                          <p className="text-xs text-slate-200">
                            {project.address || "N/A"}
                          </p>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                          Loss Summary
                        </label>
                        {project.summary ? (
                          <p className="text-xs text-slate-400 leading-relaxed bg-slate-900/50 p-3 rounded-xl border border-white/5">
                            {project.summary}
                          </p>
                        ) : (
                          <EmptySummaryInput
                            onSave={(summary) =>
                              handleUpdateProject({ summary })
                            }
                          />
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Carrier
                          </label>
                          <p className="text-xs text-slate-200 font-bold">
                            {project.insurance || "N/A"}
                          </p>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Claim #
                          </label>
                          <p className="text-xs text-slate-200 font-mono">
                            {project.claimNumber || "N/A"}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Policy #
                          </label>
                          <p className="text-xs text-slate-200 font-mono">
                            {project.policyNumber || "N/A"}
                          </p>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Adjuster Name
                          </label>
                          <p className="text-xs text-slate-200">
                            {project.adjuster || "N/A"}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Adjuster Email
                          </label>
                          <p className="text-xs text-slate-200">
                            {project.adjusterEmail || "N/A"}
                          </p>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                            Adjuster Phone
                          </label>
                          <p className="text-xs text-slate-200">
                            {project.adjusterPhone || "N/A"}
                          </p>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-white/5">
                        <label className="text-[10px] font-bold uppercase text-slate-500 block mb-2">
                          Client Contact
                        </label>
                        <div className="space-y-2">
                          {project.clientEmail && (
                            <div className="flex items-center space-x-2 text-xs text-slate-300">
                              <Mail size={14} className="text-brand-cyan" />
                              <span>{project.clientEmail}</span>
                            </div>
                          )}
                          {project.clientPhone && (
                            <div className="flex items-center space-x-2 text-xs text-slate-300">
                              <Phone size={14} className="text-brand-cyan" />
                              <span>{project.clientPhone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <ErrorBoundary>
                  <ProjectNotes
                    isDesktop={true}
                    project={project}
                    onUpdate={handleUpdateProject}
                  />
                </ErrorBoundary>

                <div className="glass-card p-6 rounded-[2rem]">
                  <h3 className="font-bold text-white mb-4">Room Scans</h3>
                  <div className="space-y-3">
                    {project.roomScans.length > 0 ? (
                      project.roomScans.map((scan) => (
                        <div
                          key={scan.scanId}
                          onClick={() => setShowWalkthrough(scan)}
                          className="group cursor-pointer bg-slate-900 border border-white/5 rounded-xl p-3 flex items-center justify-between hover:border-brand-cyan/50 transition-all"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-slate-400 group-hover:text-brand-cyan transition-colors">
                              <ScanLine size={20} />
                            </div>
                            <div>
                              <h4 className="font-bold text-sm text-slate-200">
                                {scan.roomName}
                              </h4>
                              <p className="text-[10px] text-slate-500">
                                {scan.dimensions.sqft.toFixed(0)} SQFT
                              </p>
                            </div>
                          </div>
                          <ArrowRight
                            size={16}
                            className="text-slate-600 group-hover:text-white"
                          />
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-slate-500 text-xs">
                        No floorplans yet. Use mobile app to scan.
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-indigo-900/50 to-blue-900/50 p-6 rounded-[2rem] border border-indigo-500/20">
                  <h3 className="font-bold text-white mb-2 flex items-center">
                    <Zap size={18} className="mr-2 text-yellow-400" /> AI
                    Actions
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setActiveSubTab("mitigation_docs")}
                      className="w-full py-2.5 bg-[#00d4aa]/15 hover:bg-[#00d4aa]/25 border border-[#00d4aa]/40 rounded-lg text-xs font-bold text-left px-3 text-[#00d4aa] transition-all flex items-center justify-between shadow-[0_0_15px_rgba(0,212,170,0.15)]"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles size={14} />
                        <span>AI Water Mitigation Doc</span>
                      </span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 bg-[#00d4aa]/20 rounded font-black">S500</span>
                    </button>
                    <button
                      onClick={() => setActiveSubTab("scope")}
                      className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold text-left px-3 text-indigo-200 transition-colors"
                    >
                      Auto-Generate Scope
                    </button>
                    <button
                      onClick={() => setActiveSubTab("predictive")}
                      className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold text-left px-3 text-indigo-200 transition-colors"
                    >
                      Predict Dryout Date
                    </button>
                    <button
                      onClick={() => handleGenerateReport()}
                      className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold text-left px-3 text-indigo-200 transition-colors"
                    >
                      Compile Final Report
                    </button>

                    <label className="flex items-center justify-between p-2 mt-2 bg-black/20 rounded-lg text-xs font-bold text-indigo-300 border border-indigo-500/20 cursor-pointer hover:bg-black/30 transition-colors">
                      <span>Automate Inspection Report</span>
                      <input
                        type="checkbox"
                        checked={autoReportEnabled}
                        onChange={() =>
                          setAutoReportEnabled(!autoReportEnabled)
                        }
                        className="w-4 h-4 rounded-sm border-white/20 accent-brand-cyan"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === "tracking" && (
            <ProjectTracking project={project} onUpdate={handleUpdateProject} />
          )}
          {activeSubTab === "checklists" && (
            <DigitalChecklist
              project={project}
              onUpdate={handleUpdateProject}
            />
          )}
          {activeSubTab === "tasks" && (
            <TaskManager project={project} onUpdate={handleUpdateProject} />
          )}
          {activeSubTab === "drying" && (
            <DryingLogs
              project={project}
              onUpdate={handleUpdateProject}
            />
          )}
          {activeSubTab === "room_readings" && (
            <div className="h-[calc(100vh-120px)]">
              <RoomPsychrometrics
                project={project}
                onUpdate={handleUpdateProject}
              />
            </div>
          )}
          {activeSubTab === "dates" && (
            <div className="h-[calc(100vh-120px)] max-w-md mx-auto rounded-3xl overflow-hidden shadow-2xl border border-white/10 my-8">
              <ProjectDates
                project={project}
                onUpdate={handleUpdateProject}
                onBack={() => setActiveSubTab("overview")}
              />
            </div>
          )}
          {activeSubTab === "risk" && (
            <RiskAssessment project={project} onUpdate={handleUpdateProject} />
          )}
          {activeSubTab === "scope" && <TicSheet project={project} />}
          {activeSubTab === "photos" && (
            <PhotoDocumentation
              project={project}
              onStartScan={() => {}}
              onUpdate={handleUpdateProject}
            />
          )}
          {activeSubTab === "mitigation_docs" && (
            <div className="h-[calc(100vh-140px)] -m-8">
              <WaterMitigationDocumentation
                project={project}
                onUpdateProject={handleUpdateProject}
                onBack={() => setActiveSubTab("overview")}
              />
            </div>
          )}
          {activeSubTab === "predictive" && (
            <PredictiveAnalysis onBack={() => setActiveSubTab("overview")} />
          )}
          {activeSubTab === "forms" && (
            <Forms onComplete={() => setActiveSubTab("overview")} />
          )}
          {activeSubTab === "reference" && (
            <ReferenceGuide onBack={() => setActiveSubTab("overview")} />
          )}
          {activeSubTab === "calculator" && (
            <div className="p-8 max-w-4xl mx-auto">
              <PsychrometricCalculator />
            </div>
          )}
          {activeSubTab === "ar_mapping" && (
            <div className="h-[calc(100vh-120px)]">
              <ARMapping project={project} onUpdate={handleUpdateProject} />
            </div>
          )}
          {activeSubTab === "equipment" && (
            <EquipmentManager
              project={project}
              onUpdate={handleUpdateProject}
            />
          )}
          {activeSubTab === "reports" && <ReportTemplates project={project} />}
          {activeSubTab === "client_portal" && (
            <div className="h-[calc(100vh-140px)]">
              <ClientUpdatesLog project={project} onUpdate={handleUpdateProject} />
            </div>
          )}
        </div>
              {showFieldUpdateModal && (
          <FieldUpdateModal 
            project={project} 
            onClose={() => setShowFieldUpdateModal(false)} 
            onUpdate={handleUpdateProject} 
          />
        )}
      </main>
      {/* Modal for Walkthrough */}
      {showWalkthrough && (
        <WalkthroughViewer
          scan={showWalkthrough}
          onClose={() => setShowWalkthrough(null)}
        />
      )}
    </div>
  );
};

const NavButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  isCollapsed?: boolean;
}> = ({ label, icon, active, onClick, isCollapsed }) => (
  <div className="relative group" title={isCollapsed ? label : undefined}>
    <button
      onClick={onClick}
      className={`w-full flex items-center px-4 py-3 rounded-xl transition-all ${active ? "bg-brand-cyan text-slate-900 font-bold shadow-[0_0_15px_rgba(6,182,212,0.4)]" : "text-slate-400 hover:text-white hover:bg-white/5"} ${isCollapsed ? "justify-center space-x-0 px-0" : "space-x-3"}`}
    >
      {icon}
      {!isCollapsed && <span className="text-sm font-medium">{label}</span>}
    </button>
  </div>
);

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

const ProjectNotes: React.FC<{
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  isDesktop?: boolean;
}> = ({ project, onUpdate, isDesktop }) => {
  const [localNotes, setLocalNotes] = useState(project.notes || "");
  const [isEditing, setIsEditing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Photo linking state
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>([]);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // Extract all photos across all project rooms
  const projectPhotos = project.rooms?.flatMap((r) => 
    (r.photos || []).map((p) => ({ ...p, roomName: r.name }))
  ) || [];

  const linkedPhotoIds = project.notesPhotos || [];
  const linkedPhotos = projectPhotos.filter((p) => linkedPhotoIds.includes(p.id));

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognitionConstructor =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).SpeechRecognition ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionConstructor) {
        recognitionRef.current = new SpeechRecognitionConstructor();
        if (recognitionRef.current) {
          recognitionRef.current.continuous = true;
          recognitionRef.current.interimResults = true;

          recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
            let transcript = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              if (event.results[i].isFinal) {
                transcript += event.results[i][0].transcript;
              }
            }
            if (transcript) {
              setLocalNotes((prev) => {
                const newNotes = (prev ? prev + " " : "") + transcript;
                return newNotes.slice(0, 5000);
              });
            }
          };

          recognitionRef.current.onerror = (
            event: SpeechRecognitionErrorEvent,
          ) => {
            console.error("Speech recognition error", event.error);
            setIsRecording(false);
          };

          recognitionRef.current.onend = () => {
            setIsRecording(false);
          };
        }
      }
    }
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      setIsRecording(true);
      recognitionRef.current?.start();
    }
  };

  useEffect(() => {
    if (!isEditing && !isRecording) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalNotes(project.notes || "");
    }
  }, [project.notes, isEditing, isRecording]);

  const handleBlur = () => {
    setIsEditing(false);
    if (!isRecording && localNotes !== (project.notes || "")) {
      onUpdate({ notes: localNotes });
    }
  };

  const openPicker = () => {
    setTempSelectedIds([...linkedPhotoIds]);
    setIsPickerOpen(true);
  };

  const togglePhotoSelectionInPicker = (id: string) => {
    setTempSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
  };

  const saveLinks = () => {
    onUpdate({ notesPhotos: tempSelectedIds });
    setIsPickerOpen(false);
  };

  return (
    <div
      id="project-notes-card"
      className={
        isDesktop
          ? "glass-card p-6 rounded-[2rem]"
          : "bg-slate-900 p-5 rounded-2xl border border-white/5"
      }
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-white flex items-center">
          <FileText
            size={isDesktop ? 18 : 16}
            className="mr-2 text-brand-cyan"
          />{" "}
          Project Notes
        </h3>
        <div className="flex items-center space-x-2">
          {/* Link Existing Photos Button */}
          <button
            onClick={openPicker}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-white/5 hover:bg-brand-cyan/10 hover:text-brand-cyan border border-white/5 rounded-xl text-xs font-bold transition-all text-slate-300"
            title="Link photos from gallery"
          >
            <Paperclip size={14} />
            <span>Link Photos</span>
          </button>

          <button
            onClick={toggleRecording}
            className={`p-2 rounded-xl transition-all ${isRecording ? "bg-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]" : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"}`}
            title={isRecording ? "Stop Recording" : "Start Voice Note"}
          >
            {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        </div>
      </div>
      <div className="space-y-1 relative">
        <textarea
          id="project-notes-textarea"
          value={localNotes}
          onFocus={() => setIsEditing(true)}
          onBlur={handleBlur}
          onChange={(e) => {
            setLocalNotes(e.target.value.slice(0, 5000));
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          className={`w-full bg-slate-950 border border-white/10 ${isDesktop ? "rounded-xl p-4 text-sm" : "rounded-lg p-3 text-xs"} text-slate-200 focus:border-brand-cyan outline-none resize-none min-h-[150px] transition-colors`}
          placeholder={
            isRecording
              ? "Listening to your notes..."
              : "Add internal project notes here..."
          }
        />
        <div className="flex justify-between items-center mt-2">
          <div className="flex items-center space-x-2">
            {isRecording && (
              <span className="text-[10px] text-red-500 font-bold animate-pulse">
                RECORDING ACTIVE
              </span>
            )}
          </div>
          <span
            className={`text-[10px] font-mono ${(localNotes?.length || 0) >= 4900 ? "text-red-400" : "text-slate-500"}`}
          >
            {localNotes?.length || 0} / 5000
          </span>
        </div>
      </div>

      {/* Linked Photos Display List */}
      {linkedPhotos.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/5">
          <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center">
            <Paperclip size={12} className="mr-1 text-brand-cyan" />
            Linked Notes Photos ({linkedPhotos.length})
          </h4>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {linkedPhotos.map((photo) => (
              <div
                key={photo.id}
                className="relative group aspect-square rounded-xl overflow-hidden border border-white/5 bg-slate-950/40"
              >
                <img
                  src={photo.url}
                  alt={photo.notes || "Linked notes illustration"}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover cursor-zoom-in hover:scale-105 transition-transform"
                  onClick={() => setPreviewPhotoUrl(photo.url)}
                />
                
                {/* Remove linking trigger */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const updatedIds = linkedPhotoIds.filter((id) => id !== photo.id);
                    onUpdate({ notesPhotos: updatedIds });
                  }}
                  className="absolute top-1 right-1 p-1 bg-black/75 hover:bg-slate-900 border border-white/10 text-slate-400 hover:text-white rounded-full transition-colors opacity-90 sm:opacity-0 group-hover:opacity-100"
                  title="Unlink Photo"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gallery Photo Picker Modal */}
      <AnimatePresence>
        {isPickerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPickerOpen(false)}
              className="fixed inset-0 bg-black/80 z-[100]"
            />
            {/* Form Drawer */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed inset-4 sm:inset-auto sm:top-[12%] sm:bottom-[12%] sm:left-1/2 sm:-translate-x-1/2 sm:w-[600px] bg-slate-900 border border-white/15 rounded-[2rem] z-[101] shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-950/40">
                <div>
                  <h3 className="text-base font-black text-white flex items-center">
                    <Paperclip size={18} className="mr-2 text-brand-cyan" />
                    Link Project Gallery Photos
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Select existing photos from the project gallery to link directly to this note.
                  </p>
                </div>
                <button
                  onClick={() => setIsPickerOpen(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Photos Panel */}
              <div className="flex-1 overflow-y-auto p-6 scrollbar-thin bg-slate-950/20">
                {projectPhotos.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <div className="w-14 h-14 bg-slate-800/40 border border-white/5 rounded-xl flex items-center justify-center text-slate-500 mb-4 animate-pulse">
                      <ImageIcon size={24} />
                    </div>
                    <h4 className="text-sm font-bold text-slate-300">No gallery photos discovered</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-[280px]">
                      Capture or inspect rooms with photos first to populate the project list.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {projectPhotos.map((photo) => {
                      const isSelected = tempSelectedIds.includes(photo.id);
                      return (
                        <div
                          key={photo.id}
                          onClick={() => togglePhotoSelectionInPicker(photo.id)}
                          className={`relative aspect-square rounded-2xl overflow-hidden border cursor-pointer group transition-all duration-200 ${
                            isSelected
                              ? "border-brand-cyan shadow-[0_0_15px_rgba(6,182,212,0.30)] scale-[0.98]"
                              : "border-white/5 hover:border-white/20 hover:scale-[1.02]"
                          }`}
                        >
                          <img
                            src={photo.url}
                            alt={photo.notes || "Gallery view"}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          
                          {/* Selection Check Circle */}
                          {isSelected && (
                            <div className="absolute inset-0 bg-brand-cyan/25 flex items-center justify-center backdrop-blur-[1px]">
                              <div className="w-9 h-9 bg-brand-cyan text-slate-900 rounded-full flex items-center justify-center shadow-lg transition-transform scale-100 hover:scale-110">
                                <Check size={18} className="stroke-[3]" />
                              </div>
                            </div>
                          )}

                          {/* Detail Overlay */}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-3 flex flex-col justify-end opacity-90 group-hover:opacity-100 transition-opacity">
                            <span className="text-[9px] font-black text-brand-cyan uppercase tracking-wider block truncate">
                              {photo.roomName}
                            </span>
                            {photo.notes && (
                              <p className="text-[10px] text-slate-300 mt-0.5 truncate leading-tight">
                                {photo.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action Bar */}
              <div className="p-6 bg-slate-950/40 border-t border-white/5 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono font-bold">
                  {tempSelectedIds.length} photo{tempSelectedIds.length !== 1 ? "s" : ""} selected
                </span>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setIsPickerOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-all text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveLinks}
                    className="px-5 py-2.5 bg-brand-cyan text-slate-950 hover:bg-[#00d4aa] rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-brand-cyan/20 transition-all flex items-center"
                  >
                    Save Selection
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Expanded/Zoom Image Viewer */}
      <AnimatePresence>
        {previewPhotoUrl && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.95 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewPhotoUrl(null)}
              className="fixed inset-0 bg-black/95 z-[150] cursor-zoom-out"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-4 sm:inset-16 z-[151] flex items-center justify-center pointer-events-none"
            >
              <img
                src={previewPhotoUrl}
                alt="Enlarged note gallery preview"
                referrerPolicy="no-referrer"
                className="max-w-full max-h-full object-contain rounded-2xl border border-white/5 shadow-2xl pointer-events-auto"
              />
              <button
                onClick={() => setPreviewPhotoUrl(null)}
                className="absolute top-4 right-4 p-3 bg-black/60 hover:bg-slate-900 border border-white/10 text-white rounded-full transition-all pointer-events-auto shadow-2xl"
              >
                <X size={20} />
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const EmptySummaryInput: React.FC<{ onSave: (summary: string) => void }> = ({
  onSave,
}) => {
  const [text, setText] = useState("");
  return (
    <div className="space-y-2 mt-2">
      <textarea
        className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs text-slate-200 focus:border-brand-cyan outline-none resize-none"
        rows={3}
        maxLength={2000}
        placeholder="Enter loss summary..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex justify-between items-center">
        <span
          className={`text-[10px] font-mono ${text.length >= 1900 ? "text-red-400" : "text-slate-500"}`}
        >
          {text.length} / 2000
        </span>
        <button
          onClick={() => {
            if (text.trim()) onSave(text.trim());
          }}
          disabled={!text.trim()}
          className="px-3 py-1.5 bg-brand-cyan text-slate-900 rounded-lg text-[10px] font-bold disabled:opacity-50"
        >
          Save Summary
        </button>
      </div>
    </div>
  );
};

export default ProjectDetails;
