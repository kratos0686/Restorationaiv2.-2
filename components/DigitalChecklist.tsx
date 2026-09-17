import React, { useState, useRef, useEffect } from "react";
import {
  Project,
  DigitalChecklistPhase,
  ChecklistItem,
  PhaseSignature,
} from "../types";
import {
  CheckCircle,
  Circle,
  ChevronDown,
  ChevronRight,
  PenTool,
  FileSignature,
  Save,
  AlertCircle,
} from "lucide-react";

import { EventBus } from "../services/EventBus";

interface DigitalChecklistProps {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
}

const defaultPhases: DigitalChecklistPhase[] = [
  {
    id: "initial_assessment",
    title: "Initial Assessment",
    status: "pending",
    items: [
      { id: "ia_1", label: "Inspect source of water damage", completed: false },
      {
        id: "ia_2",
        label: "Perform safety assessment (electrical, structural)",
        completed: false,
      },
      {
        id: "ia_3",
        label: "Determine Water Category (1, 2, or 3)",
        completed: false,
      },
      { id: "ia_4", label: "Document pre-existing damage", completed: false },
    ],
  },
  {
    id: "water_extraction",
    title: "Water Extraction",
    status: "pending",
    items: [
      { id: "we_1", label: "Remove standing water", completed: false },
      {
        id: "we_2",
        label: "Extract water from carpets and padding",
        completed: false,
      },
      {
        id: "we_3",
        label: "Dispose of non-salvageable materials",
        completed: false,
      },
    ],
  },
  {
    id: "drying",
    title: "Drying",
    status: "pending",
    items: [
      { id: "dr_1", label: "Place air movers", completed: false },
      { id: "dr_2", label: "Place dehumidifiers", completed: false },
      {
        id: "dr_3",
        label: "Record initial moisture readings",
        completed: false,
      },
      { id: "dr_4", label: "Establish drying goals", completed: false },
    ],
  },
  {
    id: "mold_prevention",
    title: "Mold Prevention",
    status: "pending",
    items: [
      { id: "mp_1", label: "Apply antimicrobial treatment", completed: false },
      { id: "mp_2", label: "Ensure proper ventilation", completed: false },
      {
        id: "mp_3",
        label: "Verify humidity levels are dropping",
        completed: false,
      },
    ],
  },
  {
    id: "final_walkthrough",
    title: "Final Walkthrough",
    status: "pending",
    items: [
      { id: "fw_1", label: "Verify drying goals are met", completed: false },
      {
        id: "fw_2",
        label: "Remove all mitigation equipment",
        completed: false,
      },
      {
        id: "fw_3",
        label: "Review findings and results with client",
        completed: false,
      },
    ],
  },
];

const SignaturePad: React.FC<{
  onSave: (signatureData: string) => void;
  onCancel: () => void;
}> = ({ onSave, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
      }
    }
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const coords = getCoordinates(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const coords = getCoordinates(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleSave = () => {
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      onSave(dataUrl);
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  return (
    <div className="bg-slate-900 border border-white/10 p-4 rounded-xl space-y-4">
      <div className="text-xs text-slate-400 mb-2">Draw Signature</div>
      <canvas
        ref={canvasRef}
        width={400}
        height={150}
        className="w-full h-[150px] bg-slate-950 border border-white/5 rounded touch-none cursor-crosshair"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
      <div className="flex justify-end space-x-2">
        <button
          onClick={handleClear}
          className="px-3 py-1 bg-white/5 rounded text-xs"
        >
          Clear
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 bg-white/5 rounded text-xs"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-3 py-1 bg-brand-cyan text-slate-900 rounded font-bold text-xs"
        >
          Save Signature
        </button>
      </div>
    </div>
  );
};

const DigitalChecklist: React.FC<DigitalChecklistProps> = ({
  project,
  onUpdate,
}) => {
  const [phases, setPhases] = useState<DigitalChecklistPhase[]>(() => {
    if (project.digitalChecklists && project.digitalChecklists.length > 0) {
      return project.digitalChecklists;
    }
    return defaultPhases;
  });

  const [expandedPhases, setExpandedPhases] = useState<string[]>([]);
  const [signingPhaseId, setSigningPhaseId] = useState<string | null>(null);

  // Signature Form State
  const [techName, setTechName] = useState("");
  const [clientName, setClientName] = useState("");
  const [techSig, setTechSig] = useState<string | null>(null);
  const [clientSig, setClientSig] = useState<string | null>(null);
  const [activeSigner, setActiveSigner] = useState<"tech" | "client" | null>(
    null,
  );

  useEffect(() => {
    if (!project.digitalChecklists || project.digitalChecklists.length === 0) {
      onUpdate({ digitalChecklists: phases });
    }
  }, [phases, project, onUpdate]);

  const togglePhase = (id: string) => {
    setExpandedPhases((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleUpdateItem = (
    phaseId: string,
    itemId: string,
    updates: Partial<ChecklistItem>,
  ) => {
    const newPhases = phases.map((phase) => {
      if (phase.id === phaseId) {
        const newItems = phase.items.map((item) =>
          item.id === itemId ? { ...item, ...updates } : item,
        );

        // Auto-update status
        let newStatus = phase.status;
        const allCompleted = newItems.every((i) => i.completed);
        const someCompleted = newItems.some((i) => i.completed);

        if (allCompleted) newStatus = "completed";
        else if (someCompleted) newStatus = "in_progress";
        else newStatus = "pending";

        return { ...phase, items: newItems, status: newStatus };
      }
      return phase;
    });

    setPhases(newPhases);
    onUpdate({ digitalChecklists: newPhases });
  };

  const handleSaveSignature = (phaseId: string) => {
    if (!techSig || !clientSig || !techName || !clientName) {
      alert("Both technician and client must sign to complete this phase.");
      return;
    }
    const newSignature: PhaseSignature = {
      technicianName: techName,
      clientName: clientName,
      technicianSignature: techSig,
      clientSignature: clientSig,
      date: Date.now(),
    };

    // Determine the next stage based on phase completed
    const nextStageMap: Record<string, import("../types").ProjectStage> = {
      initial_assessment: "Scope",
      water_extraction: "Stabilize",
      drying: "Monitor",
      mold_prevention: "Monitor",
      final_walkthrough: "Closeout",
    };

    const nextStage = nextStageMap[phaseId];

    const newPhases = phases.map((p) => {
      if (p.id === phaseId) {
        return { ...p, signature: newSignature, status: "completed" as const };
      }
      return p;
    });

    setPhases(newPhases);

    // We update currentStage here if mapping exists
    const updatePayload: Partial<Project> = { digitalChecklists: newPhases };
    if (nextStage) {
      updatePayload.currentStage = nextStage;
    }

    onUpdate(updatePayload);
    setSigningPhaseId(null);

    // Reset
    setTechName("");
    setClientName("");
    setTechSig(null);
    setClientSig(null);

    EventBus.publish(
      "com.restorationai.project.updated",
      { projectId: project.id },
      "Phase Signed & Stage Updated",
      `Phase signature completed. Project moved to ${nextStage || "new stage"}.`,
      "success",
    );
  };

  return (
    <div className="space-y-4 text-slate-200 h-full overflow-y-auto pb-20">
      <div className="bg-slate-900 border border-white/5 rounded-2xl p-5 mb-6">
        <h2 className="text-lg font-black text-white flex items-center mb-2">
          <CheckCircle className="mr-2 text-brand-cyan" /> Job Checklists
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Track stage-by-stage progress, document materials/notes, and collect
          electronic signatures corresponding to IICRC mitigation phases.
        </p>
      </div>

      <div className="space-y-4">
        {phases.map((phase) => {
          const isExpanded = expandedPhases.includes(phase.id);
          const completionCount = phase.items.filter((i) => i.completed).length;
          const totalItems = phase.items.length;

          return (
            <div
              key={phase.id}
              className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden shadow-xl"
            >
              {/* Phase Header */}
              <div
                className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${isExpanded ? "bg-white/5" : "hover:bg-white/5"}`}
                onClick={() => togglePhase(phase.id)}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`p-2 rounded-lg ${phase.signature ? "bg-emerald-500/20 text-emerald-400" : phase.status === "completed" ? "bg-blue-500/20 text-blue-400" : phase.status === "in_progress" ? "bg-amber-500/20 text-amber-500" : "bg-slate-800 text-slate-500"}`}
                  >
                    {phase.signature ? (
                      <FileSignature size={18} />
                    ) : phase.status === "completed" ? (
                      <CheckCircle size={18} />
                    ) : phase.status === "in_progress" ? (
                      <AlertCircle size={18} />
                    ) : (
                      <Circle size={18} />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">
                      {phase.title}
                    </h3>
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">
                      {completionCount} of {totalItems} items completed
                      {phase.signature && " • SIGNED"}
                    </div>
                  </div>
                </div>
                <div>
                  {isExpanded ? (
                    <ChevronDown size={20} className="text-slate-500" />
                  ) : (
                    <ChevronRight size={20} className="text-slate-500" />
                  )}
                </div>
              </div>

              {/* Phase Content */}
              {isExpanded && (
                <div className="p-4 border-t border-white/5 space-y-4 bg-slate-950/50">
                  <div className="space-y-3">
                    {phase.items.map((item) => (
                      <div
                        key={item.id}
                        className={`p-3 rounded-xl border transition-all ${item.completed ? "bg-brand-cyan/5 border-brand-cyan/20" : "bg-slate-900 border-white/5"}`}
                      >
                        <div className="flex items-start">
                          <button
                            onClick={() =>
                              handleUpdateItem(phase.id, item.id, {
                                completed: !item.completed,
                              })
                            }
                            className={`mt-0.5 mr-3 flex-shrink-0 ${item.completed ? "text-brand-cyan" : "text-slate-500"}`}
                          >
                            {item.completed ? (
                              <CheckCircle size={20} />
                            ) : (
                              <Circle size={20} />
                            )}
                          </button>
                          <div className="flex-1 space-y-2">
                            <div
                              className={`text-sm font-medium ${item.completed ? "text-white" : "text-slate-300"}`}
                            >
                              {item.label}
                            </div>

                            {/* Materials and Notes (Inputs) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                              <div>
                                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">
                                  Technician Notes
                                </label>
                                <textarea
                                  value={item.notes || ""}
                                  onChange={(e) =>
                                    handleUpdateItem(phase.id, item.id, {
                                      notes: e.target.value,
                                    })
                                  }
                                  placeholder="Enter notes..."
                                  className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-brand-cyan h-16 resize-none"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">
                                  Materials Used (Comma separated)
                                </label>
                                <input
                                  value={item.materials?.join(", ") || ""}
                                  onChange={(e) =>
                                    handleUpdateItem(phase.id, item.id, {
                                      materials: e.target.value
                                        .split(",")
                                        .map((m) => m.trim())
                                        .filter(Boolean),
                                    })
                                  }
                                  placeholder="e.g. Poly sheeting, Microban"
                                  className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-brand-cyan"
                                />
                                {item.materials &&
                                  item.materials.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {item.materials.map((m, idx) => (
                                        <span
                                          key={idx}
                                          className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-[10px]"
                                        >
                                          {m}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Signature Section */}
                  <div className="mt-6 pt-4 border-t border-white/10">
                    {phase.signature ? (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex flex-col space-y-3">
                        <div className="flex items-center text-emerald-400 font-bold text-sm mb-2">
                          <FileSignature size={18} className="mr-2" />
                          Digitally Signed & Secured
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-slate-950 rounded p-3">
                            <div className="text-[10px] text-slate-500 uppercase">
                              Technician: {phase.signature.technicianName}
                            </div>
                            <img
                              src={phase.signature.technicianSignature}
                              alt="Tech Sig"
                              className="h-12 mt-2 opacity-80 filter invert"
                            />
                          </div>
                          <div className="bg-slate-950 rounded p-3">
                            <div className="text-[10px] text-slate-500 uppercase">
                              Client: {phase.signature.clientName}
                            </div>
                            <img
                              src={phase.signature.clientSignature}
                              alt="Client Sig"
                              className="h-12 mt-2 opacity-80 filter invert"
                            />
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono text-right mt-2">
                          Timestamp:{" "}
                          {new Date(phase.signature.date).toLocaleString()}
                        </div>
                      </div>
                    ) : (
                      <div>
                        {signingPhaseId === phase.id ? (
                          <div className="space-y-4 bg-slate-900 border border-white/10 p-4 rounded-xl">
                            <h4 className="text-sm font-bold text-white mb-2 pb-2 border-b border-white/10">
                              Phase Sign-off
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Technician Signature Area */}
                              <div className="space-y-2">
                                <label className="text-xs text-slate-400">
                                  Technician Name
                                </label>
                                <input
                                  value={techName}
                                  onChange={(e) => setTechName(e.target.value)}
                                  className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-xs text-slate-200 outline-none"
                                  placeholder="Print Name"
                                />
                                {techSig ? (
                                  <div className="mt-2 bg-slate-950 p-2 rounded border border-emerald-500/30">
                                    <div className="text-[10px] text-emerald-500 mb-1">
                                      Technician Signed ✓
                                    </div>
                                    <img
                                      src={techSig}
                                      alt="Sig"
                                      className="h-10 filter invert"
                                    />
                                    <button
                                      onClick={() => setTechSig(null)}
                                      className="text-[10px] text-slate-500 underline mt-1"
                                    >
                                      Clear
                                    </button>
                                  </div>
                                ) : (
                                  <div className="mt-2 text-center">
                                    {activeSigner === "tech" ? (
                                      <SignaturePad
                                        onSave={(s) => {
                                          setTechSig(s);
                                          setActiveSigner(null);
                                        }}
                                        onCancel={() => setActiveSigner(null)}
                                      />
                                    ) : (
                                      <button
                                        onClick={() => setActiveSigner("tech")}
                                        className="w-full py-2 border border-dashed border-white/20 rounded-lg text-xs text-slate-400 hover:text-white hover:border-white/50 transition-colors"
                                      >
                                        Click to Sign (Technician)
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Client Signature Area */}
                              <div className="space-y-2">
                                <label className="text-xs text-slate-400">
                                  Client Name
                                </label>
                                <input
                                  value={clientName}
                                  onChange={(e) =>
                                    setClientName(e.target.value)
                                  }
                                  className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-xs text-slate-200 outline-none"
                                  placeholder="Print Name"
                                />
                                {clientSig ? (
                                  <div className="mt-2 bg-slate-950 p-2 rounded border border-emerald-500/30">
                                    <div className="text-[10px] text-emerald-500 mb-1">
                                      Client Signed ✓
                                    </div>
                                    <img
                                      src={clientSig}
                                      alt="Sig"
                                      className="h-10 filter invert"
                                    />
                                    <button
                                      onClick={() => setClientSig(null)}
                                      className="text-[10px] text-slate-500 underline mt-1"
                                    >
                                      Clear
                                    </button>
                                  </div>
                                ) : (
                                  <div className="mt-2 text-center">
                                    {activeSigner === "client" ? (
                                      <SignaturePad
                                        onSave={(s) => {
                                          setClientSig(s);
                                          setActiveSigner(null);
                                        }}
                                        onCancel={() => setActiveSigner(null)}
                                      />
                                    ) : (
                                      <button
                                        onClick={() =>
                                          setActiveSigner("client")
                                        }
                                        className="w-full py-2 border border-dashed border-white/20 rounded-lg text-xs text-slate-400 hover:text-white hover:border-white/50 transition-colors"
                                      >
                                        Click to Sign (Client)
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-4 mt-2 border-t border-white/10">
                              <button
                                onClick={() => setSigningPhaseId(null)}
                                className="px-4 py-2 bg-white/5 rounded-xl font-bold text-xs"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveSignature(phase.id)}
                                disabled={
                                  !techSig ||
                                  !clientSig ||
                                  !techName ||
                                  !clientName
                                }
                                className="px-4 py-2 bg-brand-cyan text-slate-900 rounded-xl font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                              >
                                <Save size={14} className="mr-2" /> Complete
                                Phase Sign-off
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center">
                            <div className="text-xs text-slate-400">
                              Require mutual sign-off to securely close out this
                              phase.
                            </div>
                            <button
                              onClick={() => setSigningPhaseId(phase.id)}
                              className="px-4 py-2 bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20 rounded-xl font-bold text-xs hover:bg-brand-cyan/20 transition-colors flex items-center"
                            >
                              <PenTool size={14} className="mr-2" /> Sign Off
                              Phase
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DigitalChecklist;
