import React, { useState } from 'react';
import { Project, WaterCategory, LossClass } from '../types';
import { Shield, AlertTriangle, Info, Save } from 'lucide-react';
import { EventBus } from '../services/EventBus';

export interface RiskAssessmentProps {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onBack?: () => void;
}

const RiskAssessment: React.FC<RiskAssessmentProps> = ({ project, onUpdate, onBack }) => {
  const [customerResponsiveness, setCustomerResponsiveness] = useState<'high' | 'medium' | 'low'>(project.riskProfile?.customerResponsiveness || 'high');
  const [materialComplexity, setMaterialComplexity] = useState<'simple' | 'moderate' | 'complex'>(project.riskProfile?.materialComplexity || 'simple');
  const [asbestosLeadRisk, setAsbestosLeadRisk] = useState<boolean>(project.riskProfile?.asbestosLeadRisk || false);
  const [waterCategory, setWaterCategory] = useState<string>(project.waterCategory || 'Category 1');
  const [lossClass, setLossClass] = useState<string>(project.lossClass || 'Class 1');
  
  // Assessment Algorithm (Derived State)
  let calculatedScore = 0;
  
  // 1. Water Category (Cat 1: +1, Cat 2: +3, Cat 3: +5)
  if (waterCategory.includes('1')) calculatedScore += 1;
  else if (waterCategory.includes('2')) calculatedScore += 3;
  else if (waterCategory.includes('3')) calculatedScore += 5;
  
  // 2. Loss Class (Class 1: +1, Class 2: +2, Class 3: +3, Class 4: +5)
  if (lossClass.includes('1')) calculatedScore += 1;
  else if (lossClass.includes('2')) calculatedScore += 2;
  else if (lossClass.includes('3')) calculatedScore += 3;
  else if (lossClass.includes('4')) calculatedScore += 5;
  
  // 3. Customer Responsiveness (High: 0, Medium: +2, Low: +4)
  if (customerResponsiveness === 'medium') calculatedScore += 2;
  else if (customerResponsiveness === 'low') calculatedScore += 4;
  
  // 4. Material Complexity (Simple: 0, Moderate: +2, Complex: +4)
  if (materialComplexity === 'moderate') calculatedScore += 2;
  else if (materialComplexity === 'complex') calculatedScore += 4;
  
  // 5. Asbestos / Lead Risk (Yes: +5, No: 0)
  if (asbestosLeadRisk) calculatedScore += 5;
  
  let calculatedRiskLevel: 'low' | 'medium' | 'high' = 'low';
  if (calculatedScore >= 12) {
    calculatedRiskLevel = 'high';
  } else if (calculatedScore >= 7) {
    calculatedRiskLevel = 'medium';
  }

  const handleSave = () => {
    onUpdate({
      waterCategory: waterCategory as WaterCategory,
      lossClass: lossClass as LossClass,
      riskLevel: calculatedRiskLevel,
      riskProfile: {
        customerResponsiveness,
        materialComplexity,
        asbestosLeadRisk,
        calculatedScore,
        lastAssessed: new Date().toISOString()
      }
    });
    EventBus.publish('com.restorationai.project.updated', { projectId: project.id, action: 'Risk Assessment Performed' }, project.id, 'Risk Assessment Saved', 'success');
  };

  const getRiskColor = (level: string) => {
    switch(level) {
      case 'high': return 'text-red-500 bg-red-500/10 border-red-500/30';
      case 'medium': return 'text-amber-500 bg-amber-500/10 border-amber-500/30';
      case 'low': return 'text-green-500 bg-green-500/10 border-green-500/30';
      default: return 'text-slate-400 bg-slate-800 border-white/10';
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8 animate-in fade-in pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center">
            <Shield className="mr-3 text-brand-cyan" size={28} />
            Project Risk Assessment
          </h2>
          <p className="text-slate-400 mt-1">Analyze project indicators to prioritize attention and allocate resources appropriately.</p>
        </div>
        {onBack && (
          <button onClick={onBack} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-bold transition-colors">
            Back
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Inputs */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl space-y-6 shadow-xl">
            <h3 className="text-lg font-bold text-white border-b border-white/10 pb-4">Key Risk Indicators</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Water Category */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Water Category</label>
                <select 
                  value={waterCategory} 
                  onChange={(e) => setWaterCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-brand-cyan transition-colors"
                >
                  <option value="Category 1">Category 1 (Sanitary Water)</option>
                  <option value="Category 2">Category 2 (Significantly Contaminated Water)</option>
                  <option value="Category 3">Category 3 (Grossly Contaminated Water)</option>
                </select>
                <p className="text-[10px] text-slate-500">Higher categories increase liability and PPE requirements.</p>
              </div>

              {/* Loss Class */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loss Class</label>
                <select 
                  value={lossClass} 
                  onChange={(e) => setLossClass(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-brand-cyan transition-colors"
                >
                  <option value="Class 1">Class 1 (Least amount of water)</option>
                  <option value="Class 2">Class 2 (Large amount of water)</option>
                  <option value="Class 3">Class 3 (Greatest amount of water)</option>
                  <option value="Class 4">Class 4 (Specialty Drying Situations)</option>
                </select>
                <p className="text-[10px] text-slate-500">Class 4 implies trapped moisture, requiring more robust equipment.</p>
              </div>
              
              {/* Customer Responsiveness */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Customer Responsiveness</label>
                <select 
                  value={customerResponsiveness} 
                  onChange={(e) => setCustomerResponsiveness(e.target.value as 'high' | 'medium' | 'low')}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-brand-cyan transition-colors"
                >
                  <option value="high">High (Cooperative, Available)</option>
                  <option value="medium">Medium (Delayed Responses)</option>
                  <option value="low">Low (Difficult to reach, Uncooperative)</option>
                </select>
                <p className="text-[10px] text-slate-500">Poor communication increases schedule delays and liability gaps.</p>
              </div>

              {/* Material Complexity */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Material Complexity</label>
                <select 
                  value={materialComplexity} 
                  onChange={(e) => setMaterialComplexity(e.target.value as 'simple' | 'moderate' | 'complex')}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-brand-cyan transition-colors"
                >
                  <option value="simple">Simple (Standard Drywall, Carpet)</option>
                  <option value="moderate">Moderate (Hardwood, Multi-layer)</option>
                  <option value="complex">Complex (Plaster, Custom Fab, Art)</option>
                </select>
                <p className="text-[10px] text-slate-500">Complex materials require specialized drying or strict removal handling.</p>
              </div>
            </div>
            
            {/* Hazardous Materials Toggle */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white uppercase flex items-center">
                  <AlertTriangle size={16} className="mr-2 text-amber-500" />
                  Asbestos / Lead Paint Risk
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Pre-1980 construction or suspect materials identified.</p>
              </div>
              <button 
                onClick={() => setAsbestosLeadRisk(!asbestosLeadRisk)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${asbestosLeadRisk ? 'bg-red-500' : 'bg-slate-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${asbestosLeadRisk ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

          </div>
        </div>
        
        {/* Right Col: Score Output */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl space-y-6 shadow-xl flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-brand-cyan to-transparent opacity-50"></div>
            
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Calculated Risk Score</h3>
            
            <div className={`w-32 h-32 rounded-full border-4 flex items-center justify-center mb-2 ${getRiskColor(calculatedRiskLevel)}`}>
               <span className="text-5xl font-black">{calculatedScore}</span>
            </div>
            
            <div>
              <div className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest inline-flex ${getRiskColor(calculatedRiskLevel)}`}>
                {calculatedRiskLevel} Risk
              </div>
              <p className="text-xs text-slate-400 mt-4 leading-relaxed">
                {calculatedRiskLevel === 'high' && "Requires senior tech supervision, daily detailed monitoring, and strict liability waivers."}
                {calculatedRiskLevel === 'medium' && "Requires standard monitoring cadence with possible specialized equipment deployment."}
                {calculatedRiskLevel === 'low' && "Standard mitigation job. Routine monitoring should be sufficient."}
              </p>
            </div>
            
            <button 
              onClick={handleSave} 
              className="mt-4 w-full py-3 bg-brand-cyan text-slate-900 font-bold uppercase tracking-widest rounded-xl hover:bg-cyan-400 transition-colors flex items-center justify-center space-x-2"
            >
              <Save size={18} />
              <span>Save Assessment</span>
            </button>
          </div>
          
          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex items-start space-x-3">
             <Info className="text-blue-400 flex-shrink-0 mt-0.5" size={16} />
             <div className="text-xs text-blue-200">
               Risk scores dynamically update Project Priorities and recommended Smart Tasks. High risk sites may require multiple daily visits and immediate moisture documentation.
             </div>
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default RiskAssessment;
