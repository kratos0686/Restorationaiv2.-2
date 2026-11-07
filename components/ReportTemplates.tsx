import React, { useState } from 'react';
import { Project, ReportProfile } from '../types';
import { 
  FileText, 
  ClipboardList, 
  ShieldAlert, 
  Droplets, 
  Layers, 
  CheckCircle2, 
  FileCheck, 
  Scale, 
  Sparkles,
  Paperclip,
  AlertCircle
} from 'lucide-react';
import ReportGenerator from './ReportGenerator';
import { BUILTIN_REPORT_PROFILES, getMissingRequiredFields } from '../utils/reportProfiles';

interface ReportTemplatesProps {
  project: Project;
  onUpdate?: (updates: Partial<Project>) => void;
}

const ReportTemplates: React.FC<ReportTemplatesProps> = ({ project, onUpdate }) => {
  const [selectedReportType, setSelectedReportType] = useState<'daily' | 'final' | 'insurance' | 'assessment' | 'psychrometric' | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const allProfiles: ReportProfile[] = [
    ...BUILTIN_REPORT_PROFILES,
    ...(project.reportProfiles || [])
  ];

  const handleOpenProfile = (profileId: string) => {
    setSelectedProfileId(profileId);
    setSelectedReportType('final'); // Open generator
  };

  const handleCloseGenerator = () => {
    setSelectedReportType(null);
    setSelectedProfileId(null);
  };

  const profileIcons: Record<string, React.ReactNode> = {
    initial: <FileCheck className="text-indigo-400" size={24} />,
    progress: <ClipboardList className="text-emerald-400" size={24} />,
    equipment_justification: <Scale className="text-amber-400" size={24} />,
    complete_record: <Sparkles className="text-brand-cyan" size={24} />
  };

  return (
    <div className="p-8 space-y-10 animate-fade-in max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Project Reports & Audit Profiles</h2>
          <p className="text-sm text-slate-400">
            ANSI/IICRC S500 compliant dossiers and carrier audit packages. All numbers, readings, and equipment records derive strictly from project data.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => handleOpenProfile('complete_record')}
            className="px-4 py-2 bg-brand-cyan hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-brand-cyan/20 active:scale-95 flex items-center space-x-2"
          >
            <Sparkles size={16} />
            <span>Generate Full Dossier</span>
          </button>
        </div>
      </header>

      {/* Feature 4: Carrier & Property-Manager Report Profiles */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center space-x-2">
            <Layers className="text-brand-cyan" size={20} />
            <h3 className="text-base font-bold text-white uppercase tracking-wider">
              Carrier & Property-Manager Profiles
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Strict field verification & custom section hierarchies
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {allProfiles.map((profile) => {
            const missing = getMissingRequiredFields(profile, project);
            const icon = profileIcons[profile.id] || <Layers className="text-cyan-400" size={24} />;

            return (
              <div 
                key={profile.id}
                onClick={() => handleOpenProfile(profile.id)}
                className="glass-card rounded-2xl p-5 flex flex-col hover:bg-white/5 transition-all cursor-pointer border border-white/5 group hover:border-brand-cyan/40 relative overflow-hidden"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 rounded-xl bg-white/5 group-hover:bg-brand-cyan/10 transition-colors">
                    {icon}
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                      {profile.targetAudience || 'Audit'}
                    </span>
                    {!profile.isBuiltIn && (
                      <span className="block mt-1 text-[8px] uppercase font-bold text-brand-cyan">
                        Custom
                      </span>
                    )}
                  </div>
                </div>

                <h4 className="text-base font-bold text-white group-hover:text-brand-cyan transition-colors mb-1">
                  {profile.name}
                </h4>

                <p className="text-xs text-slate-400 flex-1 mb-4 leading-relaxed line-clamp-3">
                  {profile.description}
                </p>

                {missing.length > 0 ? (
                  <div className="mb-3 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] flex items-center gap-1.5 font-bold">
                    <AlertCircle size={12} className="shrink-0" />
                    <span className="truncate">{missing.length} Missing Field(s)</span>
                  </div>
                ) : (
                  <div className="mb-3 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] flex items-center gap-1.5 font-bold">
                    <CheckCircle2 size={12} className="shrink-0" />
                    <span>All Required Fields Met</span>
                  </div>
                )}

                <button 
                  type="button"
                  className="w-full py-2.5 bg-white/5 group-hover:bg-brand-cyan group-hover:text-slate-950 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
                >
                  Generate {profile.name}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Standard Specialized Templates */}
      <section className="space-y-4 pt-4">
        <div className="flex items-center space-x-2 border-b border-white/10 pb-3">
          <FileText className="text-slate-400" size={18} />
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
            Standard Task-Specific Templates
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
          <ReportTemplateCard 
            title="Damage Assessment"
            description="Standardized initial damage assessment detailing cause of damage, affected materials, and initial mitigation steps."
            icon={<FileText />}
            color="text-indigo-400"
            bg="bg-indigo-400/10"
            onClick={() => {
              setSelectedReportType('assessment');
              setSelectedProfileId('initial');
            }}
          />

          <ReportTemplateCard 
            title="Daily Mitigation Log"
            description="Generates a daily progress report including equipment status and moisture readings."
            icon={<ClipboardList />}
            color="text-emerald-400"
            bg="bg-emerald-400/10"
            onClick={() => {
              setSelectedReportType('daily');
              setSelectedProfileId('progress');
            }}
          />
          
          <ReportTemplateCard 
            title="Final Project Report"
            description="Comprehensive end-of-project report detailing the complete scope and final conditions."
            icon={<FileText />}
            color="text-brand-cyan"
            bg="bg-brand-cyan/10"
            onClick={() => {
              setSelectedReportType('final');
              setSelectedProfileId('complete_record');
            }}
          />
          
          <ReportTemplateCard 
            title="Insurance Claim Doc"
            description="Formatted report for adjusters, including line items, visual evidence, and IICRC compliance."
            icon={<ShieldAlert />}
            color="text-amber-400"
            bg="bg-amber-400/10"
            onClick={() => {
              setSelectedReportType('insurance');
              setSelectedProfileId('equipment_justification');
            }}
          />

          <ReportTemplateCard 
            title="Psychrometric Summary"
            description="Professional IICRC S500 compliant status summary summarizing drying progress, chamber metrics, & grain depression."
            icon={<Droplets />}
            color="text-sky-400"
            bg="bg-sky-400/10"
            onClick={() => {
              setSelectedReportType('psychrometric');
              setSelectedProfileId('progress');
            }}
          />
        </div>
      </section>

      {/* Modal Report Generator */}
      {selectedReportType && (
        <ReportGenerator 
          reportType={selectedReportType} 
          project={project} 
          initialProfileId={selectedProfileId || undefined}
          onClose={handleCloseGenerator}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
};

interface ReportTemplateCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  onClick: () => void;
}

const ReportTemplateCard: React.FC<ReportTemplateCardProps> = ({ 
  title, 
  description, 
  icon, 
  color, 
  bg, 
  onClick 
}) => (
  <div 
    className="glass-card rounded-2xl p-5 flex flex-col hover:bg-white/5 transition-all cursor-pointer border border-white/5 group hover:border-white/20" 
    onClick={onClick}
  >
    <div className="flex items-center space-x-3 mb-3">
      <div className={`p-2.5 rounded-xl ${bg} ${color}`}>
        {icon}
      </div>
      <h3 className="text-sm font-bold text-white leading-tight">{title}</h3>
    </div>
    <p className="text-xs text-slate-400 flex-1 mb-4 leading-relaxed">{description}</p>
    <button 
      type="button"
      className="w-full py-2.5 bg-white/5 group-hover:bg-white/10 text-white rounded-xl font-bold text-xs transition-colors"
    >
      Preview & Edit
    </button>
  </div>
);

export default ReportTemplates;
