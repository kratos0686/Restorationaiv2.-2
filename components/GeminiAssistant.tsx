
import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, Send, VolumeX } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { useAppContext } from '../context/AppContext';
import { encode, decode, decodeAudioData } from '../utils/audio';
import { LogoIcon } from './Branding';

interface GeminiAssistantProps {
  context: string;
  isOpen: boolean;
  onClose: () => void;
}

const GeminiAssistant: React.FC<GeminiAssistantProps> = ({ context, isOpen, onClose }) => {
  const { isOnline } = useAppContext();
  const [input, setInput] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string}[]>([
    { role: 'ai', text: `AI Assistant ready for ${context}.` }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<{ sendRealtimeInput: (input: { media: { mimeType: string; data: string } }) => void; close: () => void }> | null>(null);

  useEffect(() => {
    if (!isOnline && isOpen) {
      setMessages(prev => [...prev, { role: 'ai', text: "I am currently offline. Please reconnect to access AI intelligence." }]);
      if (isLive) stopLive();
    }
  }, [isOnline, isOpen, isLive]);

  useEffect(() => {
    return () => {
        stopLive();
    }
  }, []);

  const stopLive = () => {
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => session.close());
        sessionPromiseRef.current = null;
    }
    if (inputAudioContextRef.current) {
        inputAudioContextRef.current.close();
        inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
        outputAudioContextRef.current.close();
        outputAudioContextRef.current = null;
    }
    setIsLive(false);
    setIsRecording(false);
  };

  const startLiveSession = async () => {
    if (!isOnline) return;
    setIsLive(true);
    
    try {
      // Initialize Audio Contexts
      inputAudioContextRef.current = new (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)({ sampleRate: 24000 });
      
      const outputNode = outputAudioContextRef.current.createGain();
      outputNode.connect(outputAudioContextRef.current.destination);
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      
      sessionPromiseRef.current = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          callbacks: {
              onopen: () => {
                  console.log("Live Session Connected");
                  const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
                  const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                  
                  scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                      const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                      // Convert Float32 to Int16
                      const l = inputData.length;
                      const int16 = new Int16Array(l);
                      for (let i = 0; i < l; i++) {
                          int16[i] = inputData[i] * 32768;
                      }
                      const b64Data = encode(new Uint8Array(int16.buffer));
                      
                      if (sessionPromiseRef.current) {
                          sessionPromiseRef.current.then(session => {
                              session.sendRealtimeInput({
                                  media: {
                                      mimeType: 'audio/pcm;rate=16000',
                                      data: b64Data
                                  }
                              });
                          });
                      }
                  };
                  source.connect(scriptProcessor);
                  scriptProcessor.connect(inputAudioContextRef.current!.destination);
                  setIsRecording(true);
              },
              onmessage: async (message: LiveServerMessage) => {
                  const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                  if (base64Audio && outputAudioContextRef.current) {
                      const ctx = outputAudioContextRef.current;
                      const audioBuffer = await decodeAudioData(
                          decode(base64Audio),
                          ctx,
                          24000,
                          1
                      );
                      
                      const source = ctx.createBufferSource();
                      source.buffer = audioBuffer;
                      source.connect(outputNode);
                      source.addEventListener('ended', () => {
                          sourcesRef.current.delete(source);
                      });
                      
                      const now = ctx.currentTime;
                      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, now);
                      source.start(nextStartTimeRef.current);
                      nextStartTimeRef.current += audioBuffer.duration;
                      sourcesRef.current.add(source);
                  }
                  
                  if (message.serverContent?.interrupted) {
                      sourcesRef.current.forEach(s => s.stop());
                      sourcesRef.current.clear();
                      nextStartTimeRef.current = 0;
                  }
              },
              onclose: () => {
                  console.log("Live Session Closed");
                  setIsLive(false);
              },
              onerror: () => {
                  setIsLive(false);
              }
          },
          config: {
              responseModalities: [Modality.AUDIO],
              systemInstruction: `You are an expert water mitigation consultant. Current Context: ${context}. Keep answers brief and technical.`,
          }
      });
    } catch (err) {
      console.error("Failed to start live session:", err);
      setIsLive(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !isOnline) return;
    const msg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setIsTyping(true);

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Context: ${context}. User: ${msg}`,
        });
        setMessages(prev => [...prev, { role: 'ai', text: response.text || "I processed that, but have no response." }]);
    } catch (err) {
        console.error(err);
        setMessages(prev => [...prev, { role: 'ai', text: "Error connecting to AI service." }]);
    } finally {
        setIsTyping(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex justify-end animate-in slide-in-from-right duration-300">
      <div className="w-full max-w-md bg-slate-900 h-full shadow-2xl flex flex-col border-l border-white/10">
        <div className="p-4 border-b border-white/10 bg-slate-900/50 backdrop-blur-md flex justify-between items-center">
            <div className="flex items-center space-x-3">
                <div className={`p-1 w-10 h-10 rounded-xl overflow-hidden ${isRecording ? 'bg-red-500/20 animate-pulse' : ''}`}>
                    {isRecording ? (
                      <div className="w-full h-full flex items-center justify-center bg-red-500/10 rounded-xl border border-red-500/30">
                        <Mic size={20} className="text-red-500" />
                      </div>
                    ) : (
                      <LogoIcon />
                    )}
                </div>
                <div>
                    <h3 className="font-bold text-white">Gemini Assistant</h3>
                    <div className="flex items-center space-x-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{isLive ? 'Live Voice Active' : (isOnline ? 'Online' : 'Offline')}</p>
                    </div>
                </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-brand-indigo text-white rounded-tr-sm' : 'bg-white/10 text-slate-200 rounded-tl-sm border border-white/5'}`}>
                        {m.text}
                    </div>
                </div>
            ))}
            {isTyping && (
                <div className="flex justify-start"><div className="bg-white/5 p-3 rounded-2xl rounded-tl-sm flex space-x-1"><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" /><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75" /><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150" /></div></div>
            )}
        </div>

        <div className="p-4 border-t border-white/10 bg-slate-900/50 backdrop-blur-md space-y-3">
            {isLive && (
                <div className="h-16 bg-red-500/10 rounded-xl border border-red-500/20 flex items-center justify-between px-4 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center space-x-3">
                        <div className="relative">
                            <div className="w-3 h-3 bg-red-500 rounded-full animate-ping absolute opacity-75" />
                            <div className="w-3 h-3 bg-red-500 rounded-full relative" />
                        </div>
                        <span className="text-xs font-bold text-red-400">Listening...</span>
                    </div>
                    <button onClick={stopLive} className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"><VolumeX size={18} /></button>
                </div>
            )}

            <div className="flex space-x-2">
                <input 
                    value={input} 
                    onChange={e => setInput(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                    placeholder={isLive ? "Voice active..." : "Ask Gemini about IICRC S500..."}
                    disabled={!isOnline || isLive}
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-indigo/50 disabled:opacity-50"
                />
                {!isLive ? (
                    <button onClick={startLiveSession} disabled={!isOnline} className="p-3 bg-white/5 text-blue-400 border border-white/10 rounded-xl hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"><Mic size={20} /></button>
                ) : null}
                <button onClick={handleSendMessage} disabled={!input.trim() || !isOnline || isLive} className="p-3 bg-brand-indigo text-white rounded-xl shadow-lg hover:bg-indigo-500 disabled:opacity-50 disabled:bg-slate-700 transition-all active:scale-95"><Send size={20} /></button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default GeminiAssistant;
