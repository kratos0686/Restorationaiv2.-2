import React, { useState, useRef } from "react";
import {
  Edit3,
  CheckCircle,
  X,
  FileText,
  Check,
  AlertCircle,
  ChevronRight,
  Phone,
  Shield,
  Wrench,
} from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import DamageAssessmentForm from "./DamageAssessmentForm";
import { EventBus } from "../services/EventBus";
import { useAppContext } from "../context/AppContext";

interface FormsProps {
  onComplete: () => void;
}

type FormTemplate =
  | "repair_auth"
  | "insurance_auth"
  | "vendor_call"
  | "afics"
  | "asi_auth"
  | "cos"
  | "contractor_connect"
  | "service_endorsement"
  | "damage_assessment"
  | null;

const Forms: React.FC<FormsProps> = ({ onComplete }) => {
  const { selectedProjectId } = useAppContext();
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate>(null);
  const sigPad = useRef<SignatureCanvas>(null);
  const [isSigned, setIsSigned] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [printedName, setPrintedName] = useState("");
  const [nameError, setNameError] = useState("");
  const [date] = useState(() => {
    const today = new Date();
    return today.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  });

  const validateName = (name: string) => {
    if (!name.trim()) return "Name cannot be empty.";
    return "";
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPrintedName(val);
    if (nameError) setNameError(validateName(val));
  };

  const clearSignature = () => {
    sigPad.current?.clear();
    setIsSigned(false);
  };

  const handleSubmit = () => {
    const error = validateName(printedName);
    if (error) {
      setNameError(error);
      return;
    }

    if (selectedTemplate !== "vendor_call" && !isSigned) {
      return;
    }

    setIsSubmitted(true);

    EventBus.publish(
      "com.restorationai.form.submitted",
      { template: selectedTemplate, printedName, projectId: selectedProjectId },
      selectedProjectId || undefined,
      `Form ${selectedTemplate} submitted by ${printedName}`,
      "success",
    );
  };

  if (isSubmitted) {
    return (
      <div className="p-8 h-full flex flex-col items-center justify-center text-center bg-slate-950 animate-in fade-in duration-500">
        <div className="w-24 h-24 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mb-6 ring-8 ring-emerald-500/5">
          <CheckCircle size={50} />
        </div>
        <h2 className="text-2xl font-black text-white tracking-tight">
          Form Submitted
        </h2>
        <p className="text-slate-400 mt-2 max-w-sm">
          The document has been processed and archived. A copy has been sent to
          the designated parties.
        </p>
        <button
          onClick={onComplete}
          className="mt-8 w-full max-w-xs py-4 bg-brand-cyan text-slate-900 rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all"
        >
          <span>Return to Project</span>
        </button>
      </div>
    );
  }

  if (!selectedTemplate) {
    return (
      <div className="p-6 space-y-6 bg-slate-950 h-full overflow-y-auto pb-24">
        <header>
          <h2 className="text-2xl font-black text-white tracking-tight">
            Form Center
          </h2>
          <p className="text-sm text-slate-500">
            Select a template to begin documentation.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4">
          <TemplateCard
            title="Repair Authorization"
            description="Standard work authorization for mitigation and repair services."
            icon={<FileText className="text-brand-cyan" />}
            onClick={() => setSelectedTemplate("repair_auth")}
          />
          <TemplateCard
            title="Insurance Direction to Pay"
            description="Direct payment authorization for insurance carriers."
            icon={<Shield className="text-indigo-400" />}
            onClick={() => setSelectedTemplate("insurance_auth")}
          />
          <TemplateCard
            title="AFICS Authorization"
            description="Specialized AFICS decision and authorization form."
            icon={<CheckCircle className="text-emerald-400" />}
            onClick={() => setSelectedTemplate("afics")}
          />
          <TemplateCard
            title="ASI Worker Authorization"
            description="Authorization for ASI personnel on-site."
            icon={<Wrench className="text-orange-400" />}
            onClick={() => setSelectedTemplate("asi_auth")}
          />
          <TemplateCard
            title="Certificate of Satisfaction"
            description="All State COS for USA members completion form."
            icon={<Check className="text-blue-400" />}
            onClick={() => setSelectedTemplate("cos")}
          />
          <TemplateCard
            title="Contractor Connect"
            description="Standard contractor connection and referral form."
            icon={<FileText className="text-purple-400" />}
            onClick={() => setSelectedTemplate("contractor_connect")}
          />
          <TemplateCard
            title="12-Hour Service Endorsement"
            description="Excellent service endorsement form for rapid response."
            icon={<Shield className="text-yellow-400" />}
            onClick={() => setSelectedTemplate("service_endorsement")}
          />
          <TemplateCard
            title="Vendor Call Template"
            description="Script and checklist for coordinating with external vendors."
            icon={<Phone className="text-emerald-400" />}
            onClick={() => setSelectedTemplate("vendor_call")}
          />
          <TemplateCard
            title="Damage Assessment Report"
            description="Complete the initial site assessment and water damage categorization."
            icon={<AlertCircle className="text-orange-400" />}
            onClick={() => setSelectedTemplate("damage_assessment")}
          />
        </div>
      </div>
    );
  }

  if (selectedTemplate === "damage_assessment") {
    return (
      <DamageAssessmentForm onComplete={() => setSelectedTemplate(null)} />
    );
  }

  return (
    <div className="p-6 space-y-6 bg-slate-950 h-full overflow-y-auto">
      <header className="flex items-center justify-between">
        <div>
          <button
            onClick={() => setSelectedTemplate(null)}
            className="text-xs font-black text-brand-cyan uppercase tracking-widest mb-1 flex items-center"
          >
            <ChevronRight size={12} className="rotate-180 mr-1" /> Back to
            Templates
          </button>
          <h2 className="text-2xl font-black text-white tracking-tight">
            {selectedTemplate === "repair_auth" && "Repair Authorization"}
            {selectedTemplate === "insurance_auth" && "Insurance Auth"}
            {selectedTemplate === "vendor_call" && "Vendor Call Log"}
            {selectedTemplate === "afics" && "AFICS Decision"}
            {selectedTemplate === "asi_auth" && "ASI Worker Auth"}
            {selectedTemplate === "cos" && "Cert. of Satisfaction"}
            {selectedTemplate === "contractor_connect" && "Contractor Connect"}
            {selectedTemplate === "service_endorsement" &&
              "Service Endorsement"}
          </h2>
        </div>
      </header>

      <div className="bg-slate-900 p-6 rounded-[2rem] border border-white/5 shadow-xl">
        {selectedTemplate === "vendor_call" ? (
          <div className="space-y-6">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
              <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-2">
                Call Script & Checklist
              </h4>
              <ul className="text-xs text-slate-300 space-y-2 list-disc pl-4">
                <li>Introduce company and project ID (P-1002)</li>
                <li>Verify vendor availability for site visit</li>
                <li>Confirm insurance requirements and COI status</li>
                <li>Discuss scope of work and specific material needs</li>
              </ul>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Vendor Name
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 text-sm font-bold text-white outline-none focus:border-brand-cyan transition"
                  placeholder="Enter vendor name..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Call Notes
                </label>
                <textarea
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 text-sm font-bold text-white outline-none focus:border-brand-cyan transition h-32"
                  placeholder="Summarize the conversation..."
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-white/5 text-brand-cyan rounded-xl">
                {selectedTemplate === "repair_auth" ? (
                  <FileText size={20} />
                ) : (
                  <Shield size={20} />
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {selectedTemplate === "repair_auth" &&
                    "Authorization to Repair"}
                  {selectedTemplate === "insurance_auth" &&
                    "Assignment of Benefits"}
                  {selectedTemplate === "afics" && "AFICS Decision Form"}
                  {selectedTemplate === "asi_auth" &&
                    "ASI Personnel Authorization"}
                  {selectedTemplate === "cos" && "All State COS (USA Members)"}
                  {selectedTemplate === "contractor_connect" &&
                    "Contractor Referral Form"}
                  {selectedTemplate === "service_endorsement" &&
                    "12-Hour Service Endorsement"}
                </h3>
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
                  Standard Legal Template
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-white/5">
              <p className="text-xs text-slate-400 leading-relaxed">
                {selectedTemplate === "repair_auth" &&
                  "I, the undersigned, hereby authorize Restoration | Mitigation™ to perform necessary repairs and mitigation services at the property listed. I understand that I am responsible for any deductibles or non-covered items."}
                {selectedTemplate === "insurance_auth" &&
                  "I hereby assign my rights to insurance proceeds for the covered loss to Restoration | Mitigation™. This document serves as a direction to pay the service provider directly for all mitigation and restoration efforts."}
                {selectedTemplate === "afics" &&
                  "This form confirms the AFICS decision regarding the scope of mitigation. The undersigned acknowledges the decision and authorizes the outlined path forward."}
                {selectedTemplate === "asi_auth" &&
                  "I authorize ASI personnel to access the site and perform specialized restoration tasks as part of the overall project scope."}
                {selectedTemplate === "cos" &&
                  "By signing this Certificate of Satisfaction, I confirm that all work has been completed to my satisfaction and the property has been restored as per the agreement."}
                {selectedTemplate === "contractor_connect" &&
                  "I authorize the connection with specialized contractors for specific trades required for this restoration project."}
                {selectedTemplate === "service_endorsement" &&
                  "I endorse that the service provided within the first 12 hours was excellent and met all emergency response expectations."}
              </p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                  <Edit3 size={12} className="mr-1" /> Authorized Signature
                </label>
                <div className="relative">
                  <div
                    className={`w-full h-44 bg-slate-950 rounded-2xl border-2 border-dashed ${isSigned ? "border-[#00d4aa]/50" : "border-white/10"} overflow-hidden`}
                  >
                    <SignatureCanvas
                      ref={sigPad}
                      penColor="#00d4aa"
                      canvasProps={{
                        className: "w-full h-full cursor-crosshair",
                        style: { width: "100%", height: "100%" },
                      }}
                      onBegin={() => setIsSigned(true)}
                    />
                  </div>
                  {!isSigned && (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-600 pointer-events-none">
                      <span className="font-black text-[10px] uppercase tracking-widest">
                        Sign with finger or mouse
                      </span>
                    </div>
                  )}
                  <button
                    onClick={clearSignature}
                    className="absolute top-2 right-2 p-2 bg-white/5 text-slate-400 rounded-full hover:text-red-500 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex justify-between">
              <span>
                {selectedTemplate === "vendor_call"
                  ? "Technician Name"
                  : "Printed Name"}
              </span>
              {nameError && (
                <span className="text-red-500 flex items-center uppercase">
                  <AlertCircle size={10} className="mr-1" /> {nameError}
                </span>
              )}
            </label>
            <input
              type="text"
              value={printedName}
              onChange={handleNameChange}
              className={`w-full bg-slate-950 border ${nameError ? "border-red-500/50" : "border-white/10"} rounded-xl p-4 text-sm font-bold text-white focus:outline-none focus:border-brand-cyan transition`}
              placeholder="Full Name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Date
            </label>
            <input
              type="text"
              value={date}
              readOnly
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 text-sm font-bold text-slate-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={
          (selectedTemplate !== "vendor_call" && !isSigned) ||
          printedName.trim() === "" ||
          nameError !== ""
        }
        className="w-full py-4 bg-brand-cyan text-slate-900 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center space-x-2 shadow-lg active:scale-[0.98] transition-all disabled:opacity-50"
      >
        <Check size={20} />
        <span>
          {selectedTemplate === "vendor_call"
            ? "Save Call Log"
            : "Authorize & Submit"}
        </span>
      </button>
    </div>
  );
};

const TemplateCard: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}> = ({ title, description, icon, onClick }) => (
  <button
    onClick={onClick}
    className="w-full p-5 bg-slate-900 border border-white/5 rounded-[2rem] flex items-center justify-between group hover:border-brand-cyan/50 transition-all text-left"
  >
    <div className="flex items-center space-x-4">
      <div className="p-4 bg-white/5 rounded-2xl group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-black text-white uppercase tracking-tight">
          {title}
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
          {description}
        </p>
      </div>
    </div>
    <ChevronRight
      size={20}
      className="text-slate-700 group-hover:text-white transition-colors"
    />
  </button>
);

export default Forms;
