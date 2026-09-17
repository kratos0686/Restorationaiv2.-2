
import React, { useState, useRef, useEffect, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { X, Check, Zap, Plus, Cuboid, Layers, ArrowLeft, ScanLine, BrainCircuit, Orbit } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { blobToBase64 } from './utils/photoutils';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Grid } from '@react-three/drei';
import * as THREE from 'three';

interface ARScannerProps {
  onComplete: () => void;
}

type Point = { x: number; y: number; id: number };
type Mode = 'scan' | 'processing' | 'result';
type View = '2d' | '3d';

const ARScanner: React.FC<ARScannerProps> = ({ onComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lightEstimationCanvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('scan');
  const [resultView, setResultView] = useState<View>('2d');
  const [corners, setCorners] = useState<Point[]>([]);
  const [_isScanning, setIsScanning] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  const [lidarEnabled, setLidarEnabled] = useState(true);
  const [isIOS, setIsIOS] = useState(false);

  const [lightEstimation, setLightEstimation] = useState({
    intensity: 1.0,
    color: '#ffffff'
  });

  const [capturedImages, setCapturedImages] = useState<{ id: number; url: string; base64: string }[]>([]);
  const [aiGeneratedSvg, setAiGeneratedSvg] = useState<string>('');
  const [aiDimensions, setAiDimensions] = useState<{ length: number; width: number; sqft: number } | null>(null);
  const [aiRoomLabel, setAiRoomLabel] = useState<string>('');
  const [aiDamageAssessment, setAiDamageAssessment] = useState<string>('');
  const [processingMessage, setProcessingMessage] = useState<string>("Generating point cloud & measurements...");


  useEffect(() => {
    setIsIOS(/iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (mode === 'scan' && !useFallback) startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [mode, useFallback]);

  useEffect(() => {
    if (mode !== 'scan' || !lidarEnabled || !canvasRef.current || !isIOS) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId: number;
    let offset = 0;
    const render = () => {
      if (!ctx || !canvas) return;
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      const time = Date.now() / 1000;
      for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      offset = (offset + 1) % gridSize;
      for (let y = offset; y <= canvas.height; y += gridSize) {
        const distortion = Math.sin((y / canvas.height) * Math.PI + time) * 10;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(59, 130, 246, ${0.1 + Math.sin(y / 100 + time) * 0.2})`;
        ctx.moveTo(0, y + distortion);
        ctx.lineTo(canvas.width, y + distortion);
        ctx.stroke();
      }
      animationFrameId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [mode, lidarEnabled, isIOS]);

  useEffect(() => {
    if (mode !== 'scan' || !videoRef.current) return;
    
    // Periodically sample the video stream to estimate current ambient light
    const intervalId = setInterval(() => {
      if (!videoRef.current || !lightEstimationCanvasRef.current) return;
      const video = videoRef.current;
      const canvas = lightEstimationCanvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx || video.videoWidth === 0) return;

      // Small sample area for performance
      canvas.width = 16;
      canvas.height = 16;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;

      let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }

      const pixelCount = data.length / 4;
      r = Math.floor(r / pixelCount);
      g = Math.floor(g / pixelCount);
      b = Math.floor(b / pixelCount);

      // Estimate intensity (normalized brightness)
      // Standard luminance weights: 0.299R + 0.587G + 0.114B
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      
      // Map luminance to a reasonable Three.js light intensity (e.g., 0.5 to 2.5)
      const intensity = Math.max(0.4, Math.min(2.5, luminance * 3.5));
      
      // Create hex color from estimated RGB
      const color = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;

      setLightEstimation({ intensity, color });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [mode]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsScanning(true);
    } catch (_err) {
      setPermissionError('Camera access required for 3D scanning.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const addCorner = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'scan' || (!isIOS && !useFallback)) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    setCorners([...corners, { x, y, id: Date.now() }]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);

    setUseFallback(true);
    setIsIOS(false);
    setPermissionError(null);
    setMode('scan');

    for (const file of files) {
      const url = URL.createObjectURL(file);
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const base64Data = base64.split(',')[1];
      setCapturedImages(prev => [...prev, { id: Date.now() + Math.random(), url, base64: base64Data }]);
    }
  };

  const captureFrame = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const base64 = await blobToBase64(blob);
    setCapturedImages(prev => [...prev, { id: Date.now(), url, base64 }]);
  };

  const processScan = async () => {
    setMode('processing');
    setProcessingMessage("Analyzing spatial data with RestorationAI™...");

    if (!isIOS) {
      if (capturedImages.length < 3) { setMode('scan'); return; };
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const imageParts = capturedImages.map(img => ({ inlineData: { mimeType: 'image/jpeg', data: img.base64 } }));
        const textPart = {
          text: `You are an expert photogrammetry AI. Analyze the following images taken inside a room during a water mitigation assessment. Based on these images, perform the following tasks:
1. Estimate the primary dimensions of the room: length and width in feet. Assume a standard 8-foot ceiling height.
2. Calculate the total floor area in square feet.
3. Provide a probable 'roomLabel' (e.g., 'Kitchen', 'Living Room').
4. Provide a brief 'damageAssessment' sentence, assuming a standard water loss scenario.
5. Generate a simple, clean, single-line SVG string representing a top-down 2D floor plan of the room's shape. The SVG should be scalable (viewBox="0 0 100 100") and use a black stroke.` };

        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-image-preview',
          contents: { parts: [textPart, ...imageParts] },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                length: { type: Type.NUMBER },
                width: { type: Type.NUMBER },
                squareFootage: { type: Type.NUMBER },
                roomLabel: { type: Type.STRING },
                damageAssessment: { type: Type.STRING },
                floorPlanSvg: { type: Type.STRING }
              },
              required: ['length', 'width', 'squareFootage', 'roomLabel', 'damageAssessment', 'floorPlanSvg']
            }
          }
        });
        const result = JSON.parse(response.text);
        setAiRoomLabel(result.roomLabel);
        setAiDamageAssessment(result.damageAssessment);
        setAiGeneratedSvg(result.floorPlanSvg);
        setAiDimensions({ length: result.length, width: result.width, sqft: result.squareFootage });
      } catch (error) {
        console.error("AI Photogrammetry failed:", error);
        setAiRoomLabel("AI Scan Failed");
        setAiDamageAssessment("Could not process images. Please try again with clearer photos.");
      } finally { setMode('result'); }
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `A room was scanned for water mitigation. The floor area is ${calculateArea()} sq ft with an 8-foot ceiling. 1. Based on these dimensions, suggest a probable 'roomLabel'. 2. Provide a brief 'damageAssessment' sentence.`;
      const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
      const text = response.text || "";
      const labelMatch = text.match(/roomLabel'?:? "([^"]+)"/i);
      const assessmentMatch = text.match(/damageAssessment'?:? "([^"]+)"/i);
      setAiRoomLabel(labelMatch ? labelMatch[1] : "Standard Room");
      setAiDamageAssessment(assessmentMatch ? assessmentMatch[1] : "Floor area has been successfully mapped.");
    } catch (error) {
      console.error("AI Scan Analysis failed:", error);
      setAiRoomLabel("Room Scan");
      setAiDamageAssessment("Dimensions captured. AI analysis unavailable.");
    } finally { setMode('result'); }
  };

  const calculateArea = () => {
    if (corners.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < corners.length; i++) {
      const j = (i + 1) % corners.length;
      area += corners[i].x * corners[j].y;
      area -= corners[j].x * corners[i].y;
    }
    return Math.abs(area / 2000).toFixed(1);
  };

  const processedFloorPlan = useMemo(() => {
    if (corners.length < 3) return null;
    const padding = 10;
    const minX = Math.min(...corners.map(p => p.x)); const maxX = Math.max(...corners.map(p => p.x));
    const minY = Math.min(...corners.map(p => p.y)); const maxY = Math.max(...corners.map(p => p.y));
    const width = maxX - minX; const height = maxY - minY;
    if (width === 0 || height === 0) return null;
    const svgWidth = 100 - 2 * padding; const svgHeight = 100 - 2 * padding;
    const scale = Math.min(svgWidth / width, svgHeight / height);
    const scaledWidth = width * scale; const scaledHeight = height * scale;
    const offsetX = (100 - scaledWidth) / 2; const offsetY = (100 - scaledHeight) / 2;
    const scaledCorners = corners.map(p => ({ x: ((p.x - minX) * scale) + offsetX, y: ((p.y - minY) * scale) + offsetY }));
    const pointsString = scaledCorners.map(p => `${p.x},${p.y}`).join(' ');
    return { scaledCorners, pointsString, width, height };
  }, [corners]);

  const iosDimensions = useMemo(() => {
    if (!isIOS || !processedFloorPlan) return null;
    const PIXELS_PER_FOOT = 20;
    const length = (processedFloorPlan.height / PIXELS_PER_FOOT).toFixed(1);
    const width = (processedFloorPlan.width / PIXELS_PER_FOOT).toFixed(1);
    return { length, width };
  }, [isIOS, processedFloorPlan]);

  if (permissionError) {
    return (
      <div className="h-full bg-gray-900 text-white flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4"><ScanLine size={32} /></div>
        <h2 className="text-xl font-bold mb-2">Scanner Unavailable</h2>
        <p className="text-gray-400 text-sm mb-6">{permissionError}</p>
        <button onClick={() => window.location.reload()} className="bg-white text-black px-6 py-3 rounded-full font-bold mb-4">Retry Camera Access</button>

        <div className="w-full max-w-xs p-6 bg-gray-800 rounded-xl border border-gray-700 mt-4">
          <h3 className="text-lg font-bold text-white mb-2">Manual Photo Upload</h3>
          <p className="text-xs text-gray-400 mb-4">Use photos for AI Photogrammetry instead of live scanning.</p>
          <label className="block w-full py-3 bg-blue-600 hover:bg-blue-500 cursor-pointer rounded-lg font-bold transition-colors">
            Select Photos
            <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>
    );
  }

  const resetScan = () => {
    setCorners([]);
    setCapturedImages([]);
    setAiDimensions(null);
    setAiGeneratedSvg('');
    setMode('scan');
  };

  return (
    <div className="relative h-full bg-black overflow-hidden flex flex-col font-sans">
      <canvas ref={lightEstimationCanvasRef} className="hidden" />
      {mode === 'scan' && (
        <>
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
          {isIOS && <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none opacity-60" />}
          <div data-testid="scan-area" className="absolute inset-0 z-10" onClick={isIOS ? addCorner : undefined} />
          <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between">
            <div className="p-4 pt-12 bg-gradient-to-b from-black/80 to-transparent"><div className="flex justify-between items-start"><div><div className="flex items-center space-x-2"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /><span className="text-xs font-black text-green-400 uppercase tracking-widest">{isIOS ? 'LiDAR Active' : 'AI Photogrammetry'}</span></div><h2 className="text-white font-bold text-lg mt-1">Room Scan</h2></div><button onClick={onComplete} className="p-2 bg-white/10 backdrop-blur-md rounded-full text-white pointer-events-auto active:scale-95"><X size={20} /></button></div></div>
            {isIOS && corners.map((p) => (<div key={p.id} className="absolute w-6 h-6 -ml-3 -mt-3 flex items-center justify-center" style={{ left: p.x, top: p.y }}><div className="w-3 h-3 bg-blue-500 border-2 border-white rounded-full shadow-[0_0_15px_rgba(59,130,246,0.8)] animate-in zoom-in duration-200" /></div>))}
            <div className="p-6 pb-8 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-auto">
              {!isIOS && (<div className="mb-4"><p className="text-white/80 text-xs text-center font-bold mb-3">Capture at least 3 photos from different angles.</p><div className="flex items-center space-x-2 h-16 bg-black/30 backdrop-blur-md rounded-xl p-2 overflow-x-auto">{capturedImages.map(img => <img key={img.id} src={img.url} className="h-full rounded-md" />)}</div></div>)}
              {isIOS ? (<div className="flex justify-between items-center mb-6"><div className="bg-black/40 backdrop-blur-md rounded-xl px-4 py-2 border border-white/10"><div className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Corners</div><div className="text-xl font-black text-white">{corners.length}</div></div>{isIOS && (<button onClick={() => setLidarEnabled(!lidarEnabled)} className={`p-3 rounded-full border transition-all ${lidarEnabled ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-white/10 border-white/10 text-gray-400'}`}><Zap size={20} /></button>)}</div>) : (<div className="flex justify-center items-center mb-6"><div className="bg-black/40 backdrop-blur-md rounded-xl px-4 py-2 border border-white/10"><div className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Photos Captured</div><div className="text-xl font-black text-white">{capturedImages.length}</div></div></div>)}
              <div className="flex space-x-4">
                <button onClick={isIOS ? addCorner : captureFrame} className="flex-1 bg-gray-800 text-white py-4 rounded-2xl font-bold flex items-center justify-center space-x-2 active:bg-gray-700 transition-all border border-gray-700">
                  <Plus size={20} /><span>{isIOS ? 'Mark Corner' : 'Capture Frame'}</span>
                </button>
                {!isIOS && (
                  <label className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-4 rounded-2xl font-bold flex items-center justify-center space-x-2 transition-all border border-gray-700 cursor-pointer">
                    <Plus size={20} /><span>Upload Photos</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
                  </label>
                )}
                <button onClick={processScan} disabled={isIOS ? corners.length < 3 : capturedImages.length < 3} className={`flex-1 py-4 rounded-2xl font-bold flex items-center justify-center space-x-2 transition-all shadow-lg ${(isIOS ? corners.length >= 3 : capturedImages.length >= 3) ? 'bg-blue-600 text-white shadow-blue-900/50 active:scale-95' : 'bg-gray-800 text-gray-500 opacity-50 cursor-not-allowed'}`}>
                  <Cuboid size={20} /><span>Process Scan</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {mode === 'processing' && (<div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center z-50"><div className="relative"><div className="w-24 h-24 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /><BrainCircuit size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white animate-pulse" /></div><h3 className="text-white font-bold text-xl mt-8">AI Analysis in Progress</h3><p className="text-gray-400 text-sm mt-2">{processingMessage}</p></div>)}
      {mode === 'result' && (
        <div className="absolute inset-0 bg-gray-50 z-50 flex flex-col">
          <div className="bg-white px-4 py-4 border-b border-gray-200 flex justify-between items-center shadow-sm"><div className="flex items-center space-x-3"><button onClick={resetScan} className="p-2 -ml-2 text-gray-400 hover:text-gray-900"><ArrowLeft size={24} /></button><div><h2 className="font-bold text-gray-900 text-lg">{aiRoomLabel} Model</h2><div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{aiDimensions ? `${aiDimensions.sqft.toFixed(1)} SQ FT • 8' CEILING` : `${calculateArea()} SQ FT • 8' CEILING`}</div></div></div><div className="flex bg-gray-100 rounded-lg p-1"><button onClick={() => setResultView('2d')} className={`p-2 rounded-md transition-all ${resultView === '2d' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}><Layers size={18} /></button><button onClick={() => setResultView('3d')} className={`p-2 rounded-md transition-all ${resultView === '3d' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}><Orbit size={18} /></button></div></div>
          <div className="flex-1 relative bg-gray-100 overflow-hidden flex items-center justify-center p-8"><div className="absolute top-4 left-4 right-4 bg-white p-4 rounded-2xl border border-gray-200 flex items-start space-x-3 shadow-lg z-20"><div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><BrainCircuit size={20} /></div><div><h4 className="text-xs font-bold text-gray-800">AI Damage Assessment</h4><p className="text-xs text-gray-500">{aiDamageAssessment}</p></div></div><div className="relative w-full aspect-square max-w-md bg-white rounded-xl shadow-xl border border-gray-200 p-8 transform transition-all duration-500">
            {resultView === '2d' ? (<>{isIOS ? (<svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md"><defs><pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="#f0f0f0" strokeWidth="0.5" /></pattern></defs><rect width="100" height="100" fill="url(#grid)" />{processedFloorPlan ? (<><polygon points={processedFloorPlan.pointsString} fill="#3b82f6" fillOpacity="0.1" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" />{processedFloorPlan.scaledCorners.map((p, i) => (<circle key={i} cx={p.x} cy={p.y} r="1.5" fill="white" stroke="#2563eb" strokeWidth="0.5" />))}</>) : (<text x="50" y="50" textAnchor="middle" fontSize="4" fill="#9ca3af">Not enough points.</text>)}</svg>) : (<div className="w-full h-full flex items-center justify-center" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(aiGeneratedSvg, { USE_PROFILES: { svg: true, svgFilters: true } }) }} />)}</>) : (
              (() => {
                const lengthFt = isIOS ? iosDimensions?.length : (aiDimensions?.length || 0).toFixed(1);
                const widthFt = isIOS ? iosDimensions?.width : (aiDimensions?.width || 0).toFixed(1);

                // Compute simple geometry sizes
                const width = parseFloat(widthFt as string) || 10;
                const length = parseFloat(lengthFt as string) || 12;
                const height = 8; // standard 8ft ceiling

                // Draw extruded shape for iOS, simple box for Android AI (since it lacks corner paths)
                const hasPath = isIOS && processedFloorPlan && processedFloorPlan.scaledCorners.length >= 3;

                let geometryArgs;
                if (hasPath) {
                  const shape = new THREE.Shape();
                  // scale local coordinates to world size (roughly 1 unit = 1 ft, centered)
                  const scX = width / 100;
                  const scY = length / 100;

                  processedFloorPlan!.scaledCorners.forEach((p, i) => {
                    const lx = (p.x - 50) * scX;
                    const ly = (p.y - 50) * scY;
                    if (i === 0) shape.moveTo(lx, -ly);
                    // Negative ly because Y goes down in SVG but up in Three.js Z/Y mapping
                    else shape.lineTo(lx, -ly);
                  });

                  geometryArgs = [shape, { depth: height, bevelEnabled: false }];
                }

                return (
                  <div className="w-full h-full bg-slate-900 rounded-lg overflow-hidden relative">
                    <div className="absolute top-2 left-2 z-10 bg-black/50 text-white px-2 py-1 rounded text-xs font-mono">
                      L: {lengthFt}' W: {widthFt}' H: 8'
                    </div>
                    <Canvas camera={{ position: [0, 15, 15], fov: 50 }}>
                      <ambientLight intensity={lightEstimation.intensity * 0.4} color={lightEstimation.color} />
                      <directionalLight position={[10, 10, 10]} intensity={lightEstimation.intensity * 1.2} color={lightEstimation.color} />
                      <pointLight position={[-10, 5, -10]} intensity={lightEstimation.intensity * 0.5} color={lightEstimation.color} />

                      <group position={[0, -height / 2, 0]}>
                        {hasPath ? (
                          <mesh rotation={[-Math.PI / 2, 0, 0]}>
                            <extrudeGeometry args={geometryArgs} />
                            <meshStandardMaterial color="#3b82f6" transparent opacity={0.3} wireframe={false} side={THREE.DoubleSide} />
                            <lineSegments>
                              <edgesGeometry attach="geometry" args={[new THREE.ExtrudeGeometry(geometryArgs[0], geometryArgs[1])]} />
                              <lineBasicMaterial attach="material" color="#60a5fa" />
                            </lineSegments>
                          </mesh>
                        ) : (
                          <group>
                            <mesh position={[0, height / 2, 0]}>
                              <boxGeometry args={[width, height, length]} />
                              <meshStandardMaterial color="#3b82f6" transparent opacity={0.3} side={THREE.DoubleSide} />
                            </mesh>
                            <lineSegments position={[0, height / 2, 0]}>
                              <edgesGeometry attach="geometry" args={[new THREE.BoxGeometry(width, height, length)]} />
                              <lineBasicMaterial attach="material" color="#60a5fa" />
                            </lineSegments>
                          </group>
                        )}
                        <Grid infiniteGrid fadeDistance={40} sectionColor="#4ade80" cellColor="#e2e8f0" />
                      </group>

                      <OrbitControls enableDamping dampingFactor={0.05} />
                      <Environment preset="city" />
                    </Canvas>
                  </div>
                );
              })()
            )}
          </div>
          </div>
          <div className="bg-white p-4 flex flex-col items-center justify-center"><button onClick={onComplete} className="w-full max-w-xs py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center space-x-2 shadow-lg active:scale-[0.98] transition-all"><Check size={20} /><span>Save & Continue to Project</span></button></div>
        </div>
      )}
    </div>
  );
};

export default ARScanner;
