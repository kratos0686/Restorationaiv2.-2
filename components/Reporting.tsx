
import React, { useState, useEffect } from 'react';
import { FileDown, Calendar, DollarSign, Wind, Users } from 'lucide-react';
import { getProjects } from '../services/api';
import { Project } from '../types';

const Reporting: React.FC = () => {
    const [projects, setProjects] = useState<Project[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const data = await getProjects();
                setProjects(data);
            } catch (e) {
                console.error("Failed to load projects", e);
            }
        };
        fetchData();
    }, []);
    
    const handleGenerateReport = (reportName: string) => {
        if (reportName.includes('CSV')) {
            const headers = ["ID", "Client", "Address", "Status", "Start Date", "Insurance", "Policy #", "Total Cost", "Budget", "Progress"];
            const rows = projects.map(p => [
                p.id, 
                `"${p.client}"`, 
                `"${p.address}"`, 
                p.status, 
                p.startDate, 
                p.insurance, 
                p.policyNumber, 
                p.totalCost, 
                p.budget || 0,
                `${p.progress}%`
            ]);
            
            const csvContent = "data:text/csv;charset=utf-8," 
                + [headers.join(','), ...rows.map(e => e.join(','))].join("\n");
                
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `projects_export_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            alert(`Generating "${reportName}"... (Feature simulated for non-CSV types)`);
        }
    };

    return (
        <div className="p-8 space-y-8">
            <header>
                <h1 className="text-3xl font-bold text-white">Reporting Center</h1>
                <p className="text-blue-400">Generate operational and financial reports for analysis and record-keeping.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <ReportCard 
                    icon={<DollarSign />}
                    title="Quarterly Financial Summary"
                    description="Detailed breakdown of revenue, costs, and profit margins for Q4 2023."
                    onGenerate={() => handleGenerateReport('Q4 Financial Summary')}
                />
                 <ReportCard 
                    icon={<Wind />}
                    title="Equipment Utilization"
                    description="Runtime hours and deployment status for all equipment in the inventory."
                    onGenerate={() => handleGenerateReport('Equipment Utilization Report')}
                />
                 <ReportCard 
                    icon={<Users />}
                    title="Team Productivity"
                    description="Overview of projects per team, completion times, and budget adherence."
                    onGenerate={() => handleGenerateReport('Team Productivity Report')}
                />
                 <ReportCard 
                    icon={<Calendar />}
                    title="All Projects Export"
                    description="Export a comprehensive CSV of all project data for external analysis."
                    onGenerate={() => handleGenerateReport('All Projects CSV Export')}
                />
            </div>
        </div>
    );
};

interface ReportCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    onGenerate: () => void;
}

const ReportCard: React.FC<ReportCardProps> = ({ icon, title, description, onGenerate }) => (
    <div className="glass-card rounded-2xl p-6 flex flex-col">
        <div className="flex items-center space-x-4 mb-4">
            <div className="p-3 bg-white/5 rounded-xl text-blue-300">
                {icon}
            </div>
            <h3 className="text-lg font-bold text-white">{title}</h3>
        </div>
        <p className="text-sm text-blue-400 flex-1 mb-6">{description}</p>
        <button 
            onClick={onGenerate}
            className="w-full py-3 bg-brand-cyan/10 text-brand-cyan rounded-lg font-bold text-sm flex items-center justify-center space-x-2 border border-brand-cyan/20 hover:bg-brand-cyan/20 transition-colors"
        >
            <FileDown size={16} />
            <span>Generate Report</span>
        </button>
    </div>
);

export default Reporting;
