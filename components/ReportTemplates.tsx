import React, { useState } from 'react';
import { Project } from '../types';
import { FileText, ClipboardList, ShieldAlert, Droplets } from 'lucide-react';
import ReportGenerator from './ReportGenerator';

interface ReportTemplatesProps {
    project: Project;
}

const ReportTemplates: React.FC<ReportTemplatesProps> = ({ project }) => {
    const [selectedReportType, setSelectedReportType] = useState<'daily' | 'final' | 'insurance' | 'assessment' | 'psychrometric' | null>(null);

    return (
        <div className="p-8 space-y-8 animate-fade-in">
            <header>
                <h2 className="text-2xl font-bold text-white mb-2">Project Reports</h2>
                <p className="text-sm text-slate-400">Generate standardized, professional reports for your project. Templates are pre-filled with the latest project data.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                <ReportTemplateCard 
                    title="Damage Assessment"
                    description="Standardized initial damage assessment detailing cause of damage, affected materials, and initial mitigation steps."
                    icon={<FileText />}
                    color="text-indigo-400"
                    bg="bg-indigo-400/10"
                    onClick={() => setSelectedReportType('assessment')}
                />

                <ReportTemplateCard 
                    title="Daily Mitigation Log"
                    description="Generates a daily progress report including equipment status and moisture readings."
                    icon={<ClipboardList />}
                    color="text-emerald-400"
                    bg="bg-emerald-400/10"
                    onClick={() => setSelectedReportType('daily')}
                />
                
                <ReportTemplateCard 
                    title="Final Project Report"
                    description="Comprehensive end-of-project report detailing the complete scope and final conditions."
                    icon={<FileText />}
                    color="text-brand-cyan"
                    bg="bg-brand-cyan/10"
                    onClick={() => setSelectedReportType('final')}
                />
                
                <ReportTemplateCard 
                    title="Insurance Claim Doc"
                    description="Formatted report for adjusters, including line items, visual evidence, and IICRC compliance."
                    icon={<ShieldAlert />}
                    color="text-amber-400"
                    bg="bg-amber-400/10"
                    onClick={() => setSelectedReportType('insurance')}
                />

                <ReportTemplateCard 
                    title="Psychrometric Summary"
                    description="Professional IICRC S500 compliant status summary summarizing drying progress, chamber metrics, & grain depression."
                    icon={<Droplets />}
                    color="text-sky-400"
                    bg="bg-sky-400/10"
                    onClick={() => setSelectedReportType('psychrometric')}
                />
            </div>

            {selectedReportType && (
                <ReportGenerator 
                    reportType={selectedReportType} 
                    project={project} 
                    onClose={() => setSelectedReportType(null)} 
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

const ReportTemplateCard: React.FC<ReportTemplateCardProps> = ({ title, description, icon, color, bg, onClick }) => (
    <div className="glass-card rounded-2xl p-6 flex flex-col hover:bg-white/5 transition-colors cursor-pointer border border-white/5" onClick={onClick}>
        <div className="flex items-center space-x-4 mb-4">
            <div className={`p-3 rounded-xl ${bg} ${color}`}>
                {icon}
            </div>
            <h3 className="text-lg font-bold text-white leading-tight">{title}</h3>
        </div>
        <p className="text-sm text-slate-400 flex-1 mb-6">{description}</p>
        <button className="w-full py-3 bg-white/5 text-white rounded-lg font-bold text-sm hover:bg-white/10 transition-colors">
            Preview & Edit
        </button>
    </div>
);

export default ReportTemplates;
