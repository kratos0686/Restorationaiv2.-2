
import React, { useState, useEffect, useMemo } from 'react';
import { Search, Sparkles, LayoutDashboard, FolderOpen, Settings, Wrench, Users, ClipboardList, HelpCircle, ArrowRight } from 'lucide-react';
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { useAppContext } from '../context/AppContext';
import { Tab } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface CommandCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

const navigateToTabDeclaration: FunctionDeclaration = {
  name: 'navigateToTab',
  parameters: {
    type: Type.OBJECT,
    description: 'Changes the application view to a different section.',
    properties: {
      tab: { 
        type: Type.STRING, 
        enum: ['dashboard', 'scanner', 'losses', 'equipment', 'photos', 'project', 'reporting', 'billing', 'settings', 'scan'],
        description: 'The target tab to navigate to' 
      }
    },
    required: ['tab'],
  },
};

const CommandCenter: React.FC<CommandCenterProps> = ({ isOpen, onClose }) => {
  const { setActiveTab, isOnline } = useAppContext();
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const actions = useMemo(() => [
    { id: 'dashboard', label: 'Go to Dashboard', icon: <LayoutDashboard size={18} />, tab: 'dashboard' as Tab },
    { id: 'losses', label: 'View Active Jobs', icon: <FolderOpen size={18} />, tab: 'losses' as Tab },
    { id: 'new-project', label: 'Create New Job', icon: <ArrowRight size={18} />, tab: 'new-project' as Tab },
    { id: 'inventory', label: 'Inventory Tracker', icon: <Wrench size={18} />, tab: 'inventory' as Tab },
    { id: 'crew', label: 'Crew & Dispatch', icon: <Users size={18} />, tab: 'crew-dispatch' as Tab },
    { id: 'tasks', label: 'Task Manager', icon: <ClipboardList size={18} />, tab: 'task-manager' as Tab },
    { id: 'settings', label: 'System Settings', icon: <Settings size={18} />, tab: 'settings' as Tab },
    { id: 'help', label: 'Ask AI Assistant', icon: <Sparkles size={18} />, isAi: true },
  ], []);

  const filteredActions = useMemo(() => {
    if (!input) return actions;
    return actions.filter(a => a.label.toLowerCase().includes(input.toLowerCase()));
  }, [input, actions]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [input]);

  const handleAction = (action: typeof actions[0]) => {
    if (action.isAi) {
        executeAiCommand();
        return;
    }
    if (action.tab) {
        setActiveTab(action.tab);
        onClose();
    }
  };

  const executeAiCommand = async () => {
    if (!input.trim() || !isOnline) return;
    setIsProcessing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: input,
        config: {
          systemInstruction: "You are the smart interface controller for FIELD_OS. Interpret user intents. If they want to navigate, call navigateToTab. If they ask a question, answer concisely.",
          tools: [{ functionDeclarations: [navigateToTabDeclaration] }],
        }
      });

      if (response.functionCalls) {
        for (const fc of response.functionCalls) {
          if (fc.name === 'navigateToTab') {
            let target = fc.args.tab as Tab | 'scan';
            if (target === 'scan') target = 'scanner';
            setActiveTab(target as Tab);
            onClose();
            return;
          }
        }
      }

      // If it's just text, maybe we should show it? 
      // For now, if it's text, we'll just close and maybe in future show a toast or open助理
      if (response.text) {
          alert(response.text); // Placeholder for a better UI response
          onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredActions.length);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredActions.length) % filteredActions.length);
    } else if (e.key === 'Enter') {
        if (filteredActions[selectedIndex]) {
            handleAction(filteredActions[selectedIndex]);
        } else if (input) {
            executeAiCommand();
        }
    } else if (e.key === 'Escape') {
        onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[500] flex items-start justify-center pt-[15vh] px-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-md"
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="w-full max-w-2xl bg-[#0f111a] border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col relative z-10"
          >
            <div className="p-4 border-b border-white/5 flex items-center space-x-4 bg-white/[0.02]">
              <Search size={20} className={isProcessing ? "text-brand-cyan animate-pulse" : "text-slate-500"} />
              <input 
                autoFocus
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search jobs, data, or ask AI assistant..."
                className="flex-1 bg-transparent border-none text-white placeholder-slate-500 focus:outline-none text-lg py-2"
              />
              <div className="flex items-center space-x-2">
                <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] text-slate-500 font-mono">ESC</kbd>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {filteredActions.length > 0 ? (
                <div className="space-y-1">
                  {filteredActions.map((action, index) => (
                    <button
                      key={action.id}
                      onClick={() => handleAction(action)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${selectedIndex === index ? 'bg-brand-cyan/10 text-brand-cyan' : 'text-slate-400 hover:bg-white/5'}`}
                    >
                      <div className="flex items-center space-x-4">
                        <div className={`p-2 rounded-lg ${selectedIndex === index ? 'bg-brand-cyan/20' : 'bg-white/5 text-slate-500'}`}>
                          {action.icon}
                        </div>
                        <span className="font-bold text-sm tracking-tight">{action.label}</span>
                      </div>
                      {selectedIndex === index && <ArrowRight size={14} className="opacity-50" />}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                    <Sparkles size={32} className="mx-auto text-brand-cyan mb-4 opacity-50" />
                    <p className="text-slate-400 text-sm font-medium">Hit <b>Enter</b> to query Intelligence Router for:</p>
                    <p className="text-white mt-2 font-mono italic">"{input}"</p>
                </div>
              )}
            </div>

            <div className="p-4 bg-black/40 border-t border-white/5 flex justify-between items-center text-[10px] uppercase font-black tracking-[0.2em] text-slate-500">
                <div className="flex items-center space-x-4">
                    <span className="flex items-center"><span className="w-1.5 h-1.5 bg-brand-cyan rounded-full mr-2" /> Global Interface</span>
                    <span className="opacity-30">|</span>
                    <span className="flex items-center opacity-60 hover:opacity-100 cursor-help"><HelpCircle size={10} className="mr-1.5" /> Shortcuts Available</span>
                </div>
                <div className="flex items-center space-x-3">
                    <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-white/5 rounded">↑↓</kbd> Select</span>
                    <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-white/5 rounded">↵</kbd> Confirm</span>
                </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CommandCenter;
