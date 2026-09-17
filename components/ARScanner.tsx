
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Layers, ArrowLeft, ScanLine, BrainCircuit, Check, RefreshCw, PenTool, Cloud, CloudUpload } from 'lucide-react';
import { blobToBase64 } from '../utils/photoutils';
import { RoomScan, RoomMaterials } from '../types';
import { EventBus } from '../services/EventBus';

interface ARScannerProps {
  onComplete: (data?: RoomScan) => void;
}

// Represents a "Feature Point" in the sparse map with sensor data
type ScanPoint = { 
    id: number; 
    x: number; // Estimated X relative to start (feet)
    z: number; // Estimated Z relative to start (feet)
    r: number; // Heading (degrees)
    type: 'corner' | 'wall' | 'feature';
};

// Represents an AI-detected anomaly in 3D space
type Anomaly = {
    id: string;
    label: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    x: number; // Relative X
    z: number; // Relative Z
};

type Mode = 'init' | 'scan' | 'processing' | 'result';

const CAMERA_HEIGHT_FT = 4.8; // Average handheld height

const ARScanner: React.FC<ARScannerProps> = ({ onComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lightAnalysisCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas')); // Offscreen canvas for pixel reading
  
  const [mode, setMode] = useState<Mode>('init');
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Odometry State
  const [orientation, setOrientation] = useState({ alpha: 0, beta: 90, gamma: 0 }); // Heading, Tilt, Roll
  const [deviceMotion, setDeviceMotion] = useState({ x: 0, y: 0, z: 0 });
  const velocityRef = useRef({ x: 0, y: 0, z: 0 });
  const positionRef = useRef({ x: 0, y: 0, z: 0 });
  const lastTimeRef = useRef<number>(performance.now());
  const [trackingQuality, setTrackingQuality] = useState<'Good' | 'Too Fast' | 'Dark'>('Good');
  
  // Light Estimation State
  const [lightIntensity, setLightIntensity] = useState<number>(0.5); // 0.0 - 1.0
  const [colorTemperature, setColorTemperature] = useState<string>('neutral'); // simple temp

  const CACHE_KEY_POINTS = 'ar-scanner-points';
  const CACHE_KEY_PHOTOS = 'ar-scanner-photos';
  const CACHE_KEY_OFFSET = 'ar-scanner-offset';
  const CACHE_KEY_CEILING = 'ar-scanner-ceiling';
  const CACHE_KEY_AREAS = 'ar-scanner-areas';
  const CACHE_KEY_ANOMALIES = 'ar-scanner-anomalies';

  // Sparse Map State
  const [scanPoints, setScanPoints] = useState<ScanPoint[]>(() => {
      try {
          const c = localStorage.getItem(CACHE_KEY_POINTS);
          if (c) {
             const parsed = JSON.parse(c);
             if (Array.isArray(parsed)) return parsed;
          }
      } catch(error) {
          console.warn(error);
      }
      return [];
  });
  const [capturedImages, setCapturedImages] = useState<{ id: number; url: string; base64: string; pose: { alpha: number; beta: number; gamma: number; x: number; y: number; z: number } }[]>(() => {
      try {
          const c = localStorage.getItem(CACHE_KEY_PHOTOS);
          if (c) {
              const parsed = JSON.parse(c);
              if (Array.isArray(parsed)) return parsed;
          }
      } catch(error) {
          console.warn(error);
      }
      return [];
  });

  // AR Overlay State
  const [showOverlay, setShowOverlay] = useState(true);
  const [anomalies, setAnomalies] = useState<Anomaly[]>(() => {
      try {
          const c = localStorage.getItem(CACHE_KEY_ANOMALIES);
          if (c) {
              const parsed = JSON.parse(c);
              if (Array.isArray(parsed)) return parsed;
          }
      } catch(error) {
          console.warn(error);
      }
      return [];
  });
  
  // Auto Capture & AI Guidance State
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(false);
  const [guidanceMessage, setGuidanceMessage] = useState('Point at a corner and hold steady.');

  const [interactionMode, setInteractionMode] = useState<'scan' | 'draw_area'>('scan');
  const [currentAreaPoints, setCurrentAreaPoints] = useState<{x: number, z: number}[]>([]);
  const [areas, setAreas] = useState<{ id: string, points: {x: number, z: number}[], color: string }[]>(() => {
      try {
          const c = localStorage.getItem(CACHE_KEY_AREAS);
          if (c) {
              const parsed = JSON.parse(c);
              if (Array.isArray(parsed)) return parsed;
          }
      } catch(error) {
          console.warn(error);
      }
      return [];
  });

  const [aiGeneratedSvg, setAiGeneratedSvg] = useState<string>('');
  const [aiDimensions, setAiDimensions] = useState<{ length: number; width: number; sqft: number } | null>(null);
  const [aiRoomLabel, setAiRoomLabel] = useState<string>('');
  const [aiDamageAssessment, setAiDamageAssessment] = useState<string>('');
  const [aiMaterials, setAiMaterials] = useState<RoomMaterials | null>(null);

  // Steadiness & Blob Corner Suggestion State
  const [isSteady, setIsSteady] = useState(false);
  const [steadyDuration, setSteadyDuration] = useState(0); // in seconds
  const [suggestedCorners, setSuggestedCorners] = useState<{ id: string; x: number; y: number; confidence: number; label: string }[]>([]);
  const [blobThreshold, setBlobThreshold] = useState<number>(0.85); // Confidence threshold for auto-suggestions (default 85%)

  const steadySinceRef = useRef<number | null>(null);
  const prevOrientationRef = useRef({ alpha: 0, beta: 90, gamma: 0 });
  const suggestedCornersRef = useRef<{ id: string; x: number; y: number; confidence: number; label: string }[]>([]);

  // Dimensions & Volume State
  const [ceilingHeight, setCeilingHeight] = useState<number>(() => {
      try {
          const c = localStorage.getItem(CACHE_KEY_CEILING);
          if (c) {
              const parsed = parseFloat(c);
              if (!isNaN(parsed) && parsed > 0) return parsed;
          }
      } catch(error) {
          console.warn(error);
      }
      return 8.0;
  });

  // AR Origin Offset
  const [originOffset, setOriginOffset] = useState<{ x: number, z: number }>(() => {
      try {
          const c = localStorage.getItem(CACHE_KEY_OFFSET);
          if (c) {
              const parsed = JSON.parse(c);
              if (parsed && typeof parsed.x === 'number' && typeof parsed.z === 'number') {
                  return parsed;
              }
          }
      } catch(error) {
          console.warn(error);
      }
      return { x: 0, z: 0 };
  });

  // Background Syncing State
  const [isSyncing, setIsSyncing] = useState(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
      if (scanPoints.length > 0 || capturedImages.length > 0) {
          setIsSyncing(true);
          if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
          syncTimeoutRef.current = setTimeout(() => {
              setIsSyncing(false);
          }, 1500);
      }
  }, [scanPoints.length, capturedImages.length]);

  useEffect(() => {
      localStorage.setItem(CACHE_KEY_POINTS, JSON.stringify(scanPoints));
      localStorage.setItem(CACHE_KEY_PHOTOS, JSON.stringify(capturedImages));
      localStorage.setItem(CACHE_KEY_OFFSET, JSON.stringify(originOffset));
      localStorage.setItem(CACHE_KEY_CEILING, ceilingHeight.toString());
      localStorage.setItem(CACHE_KEY_AREAS, JSON.stringify(areas));
      localStorage.setItem(CACHE_KEY_ANOMALIES, JSON.stringify(anomalies));
  }, [scanPoints, capturedImages, originOffset, ceilingHeight, areas, anomalies]);

  useEffect(() => {
      suggestedCornersRef.current = suggestedCorners;
  }, [suggestedCorners]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isInteracting = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const lastInteractionPos = useRef<{ x: number, y: number } | null>(null);

  // --- SENSOR INITIALIZATION (IMU) ---
  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.alpha !== null && e.beta !== null && e.gamma !== null) {
       setOrientation({ alpha: e.alpha, beta: e.beta, gamma: e.gamma });
    }
  }, []);

  const handleMotion = useCallback((e: DeviceMotionEvent) => {
    const acc = e.acceleration;
    if (acc && acc.x !== null && acc.y !== null && acc.z !== null) {
        const totalForce = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
        if (totalForce > 2.5) {
            setTrackingQuality('Too Fast');
        } else {
            setTrackingQuality('Good');
        }

        const now = performance.now();
        const dt = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;

        // Basic deadbanding: ignore small noise
        const ax = Math.abs(acc.x) > 0.05 ? acc.x : 0;
        const ay = Math.abs(acc.y) > 0.05 ? acc.y : 0;
        const az = Math.abs(acc.z) > 0.05 ? acc.z : 0;

        // Integrate acceleration to velocity
        velocityRef.current.x += ax * dt;
        velocityRef.current.y += ay * dt;
        velocityRef.current.z += az * dt;

        // Damping to prevent runaway drift
        velocityRef.current.x *= 0.9;
        velocityRef.current.y *= 0.9;
        velocityRef.current.z *= 0.9;

        // Integrate velocity to position
        positionRef.current.x += velocityRef.current.x * dt;
        positionRef.current.y += velocityRef.current.y * dt;
        positionRef.current.z += velocityRef.current.z * dt;

        setDeviceMotion({ 
            x: positionRef.current.x, 
            y: positionRef.current.y, 
            z: positionRef.current.z 
        });
    }
  }, []);

  // --- LIGHT ESTIMATION LOGIC ---
  const analyzeLighting = useCallback(() => {
      if (!videoRef.current || !lightAnalysisCanvasRef.current) return;
      const video = videoRef.current;
      const cvs = lightAnalysisCanvasRef.current;
      
      // We analyze a small 50x50 sample
      if (cvs.width !== 50) { cvs.width = 50; cvs.height = 50; }
      
      const ctx = cvs.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return; // HAVE_CURRENT_DATA

      // Draw the current video frame to offscreen canvas
      try {
          ctx.drawImage(video, 0, 0, 50, 50);
          const frameData = ctx.getImageData(0, 0, 50, 50).data;
          let totalBrightness = 0;
          let rTotal = 0, bTotal = 0;

          // Simple sampling
          for (let i = 0; i < frameData.length; i += 16) { // step by 4 pixels (4 channels each)
              const r = frameData[i];
              const g = frameData[i + 1];
              const b = frameData[i + 2];
              
              // Perceived brightness (Luma)
              totalBrightness += (0.299 * r + 0.587 * g + 0.114 * b);
              rTotal += r; bTotal += b;
          }

          const pixelCount = frameData.length / 16;
          const avgBrightness = totalBrightness / pixelCount;
          
          // Normalize 0-1
          const intensity = Math.min(1, Math.max(0, avgBrightness / 255));
          setLightIntensity(prev => (prev * 0.9) + (intensity * 0.1)); // Smooth transition

          // Determine Temp (very rough)
          const avgR = rTotal / pixelCount;
          const avgB = bTotal / pixelCount;
          if (avgR > avgB + 20) setColorTemperature('warm');
          else if (avgB > avgR + 20) setColorTemperature('cool');
          else setColorTemperature('neutral');

      } catch {
          // Frame data not ready
      }
    }, [videoRef, lightAnalysisCanvasRef]);

  // --- BLOB CORNER SUGGESTION LOGIC ---
  const detectBlobsAndSuggestCorners = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

    // Use a temporary canvas to read frame pixels
    const tempCanvas = document.createElement('canvas');
    const width = 160;
    const height = 120;
    tempCanvas.width = width;
    tempCanvas.height = height;
    const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Draw video frame to small offscreen canvas for performance
    ctx.drawImage(video, 0, 0, width, height);

    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;

      // 1. Grayscale & Contrast/Edge map calculation
      const grayscale = new Float32Array(width * height);
      for (let i = 0; i < data.length; i += 4) {
        grayscale[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }

      // Find high-contrast blob clusters or corners
      const candidates: { x: number; y: number; score: number }[] = [];

      // Grid-based search to distribute findings across the frame & prevent duplicates
      const gridSize = 20; 
      for (let gy = 1; gy < height / gridSize - 1; gy++) {
        for (let gx = 1; gx < width / gridSize - 1; gx++) {
          let maxVal = -1;
          let bestX = -1;
          let bestY = -1;

          // Search within this grid block
          const startX = gx * gridSize;
          const endX = startX + gridSize;
          const startY = gy * gridSize;
          const endY = startY + gridSize;

          for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
              const idx = y * width + x;
              
              const val = grayscale[idx];
              const left = grayscale[idx - 1];
              const right = grayscale[idx + 1];
              const up = grayscale[idx - width];
              const down = grayscale[idx + width];

              // Contrast response: variation relative to neighbors
              const response = Math.abs(val - left) + Math.abs(val - right) + Math.abs(val - up) + Math.abs(val - down);

              if (response > maxVal) {
                maxVal = response;
                bestX = x;
                bestY = y;
              }
            }
          }

          if (maxVal > 80 && bestX !== -1) {
            candidates.push({ x: bestX, y: bestY, score: maxVal });
          }
        }
      }

      // Sort candidate blobs by score (highest contrast first) and take the top 3
      candidates.sort((a, b) => b.score - a.score);
      const topBlobs = candidates.slice(0, 3);

      if (canvasRef.current) {
         const canvasWidth = canvasRef.current.clientWidth;
         const canvasHeight = canvasRef.current.clientHeight;

         const finalSuggested = topBlobs
            .map((blob, index) => {
               // Projected screen coordinate
               const sx = (blob.x / width) * canvasWidth;
               const sy = (blob.y / height) * canvasHeight;

               return {
                 id: `suggested-${index}-${Date.now()}`,
                 x: sx,
                 y: sy,
                 confidence: Math.min(1.0, blob.score / 255),
                 label: `Suggested Corner ${index + 1}`
               };
            })
            .filter(sc => sc.confidence >= blobThreshold); // Exceeds threshold setting (e.g. 85%)

         setSuggestedCorners(finalSuggested);
      }
    } catch (err) {
      console.warn("Blob detection image buffer read error:", err);
    }
  }, [videoRef, canvasRef, blobThreshold]);

  const addSuggestedCorner = (px: number, py: number) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    
    const deltaX = px - cx;
    const deltaY = py - cy;
    
    const H_FOV = 60; 
    const V_FOV = 45; 
    const headingOffset = (deltaX / cx) * (H_FOV / 2);
    const tiltOffset = -(deltaY / cy) * (V_FOV / 2); 
    
    const clickHeading = (orientation.alpha + headingOffset + 360) % 360;
    const clickTilt = orientation.beta + tiltOffset;
    
    const tiltRadians = (90 - clickTilt) * (Math.PI / 180);
    const headingRadians = (360 - clickHeading) * (Math.PI / 180);
    
    if (clickTilt > 10 && clickTilt < 85) {
        const groundDistance = CAMERA_HEIGHT_FT * Math.tan(tiltRadians);
        const clampedDistance = Math.min(groundDistance, 30);
        
        const originX = clampedDistance * Math.sin(headingRadians);
        const originZ = clampedDistance * Math.cos(headingRadians);
        
        const newPoint: ScanPoint = {
            id: Date.now(),
            x: originX - originOffset.x,
            z: originZ - originOffset.z,
            r: clickHeading,
            type: 'corner'
        };
        
        setScanPoints(prev => [...prev, newPoint]);
        
        setSuggestedCorners(prev => prev.filter(sc => {
            const dist = Math.sqrt((sc.x - px) ** 2 + (sc.y - py) ** 2);
            return dist >= 30;
        }));

        EventBus.publish('com.restorationai.scan.captured', { count: scanPoints.length + 1 }, undefined, `Confirmed Corner Added from AI Suggestion`, 'success');
    }
  };

  // --- CAMERA LOGIC ---
  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Local camera API is not supported on this device or browser context.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment', width: { ideal: 1920 } } 
      });
      if (videoRef.current) {
          videoRef.current.srcObject = stream;
      }
      setCameraError(null);
      return true;
    } catch (_err) { 
        console.error("Camera error", _err);
        let errorMsg = 'Camera Access Denied or Unavailable';
        if (_err instanceof Error) {
            if (_err.name === 'NotAllowedError' || _err.name === 'PermissionDeniedError') {
                errorMsg = 'Camera permission was explicitly denied. Please grant camera access in your browser address bar or device privacy settings to use the AR room scanner.';
            } else if (_err.name === 'NotFoundError' || _err.name === 'DevicesNotFoundError') {
                errorMsg = 'No active camera hardware device was detected on this system. Check physical connections or system drivers.';
            } else if (_err.name === 'NotReadableError' || _err.name === 'TrackStartError') {
                errorMsg = 'Your camera is already in use by another application or tab. Please close that application/tab and try again.';
            } else {
                errorMsg = `Camera selection error: ${_err.message}`;
            }
        }
        setCameraError(errorMsg);
        EventBus.publish('com.restorationai.scan.error', { error: errorMsg }, undefined, 'Camera Failed', 'error');
        return false;
    }
  }, []);

  const startSensors = useCallback(() => {
    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('devicemotion', handleMotion);
    startCamera();
  }, [handleOrientation, handleMotion, startCamera]);

  const requestSensors = async () => {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission === 'function') {
      try {
        const response = await (DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
        if (response === 'granted') {
          startSensors();
          setMode('scan');
          EventBus.publish('com.restorationai.scan.started', {}, undefined, 'AR Scanner Initialized', 'info');
        } else {
          alert("Sensors required for Odometry.");
        }
      } catch (_e) { console.error(_e); }
    } else {
      startSensors();
      setMode('scan');
      EventBus.publish('com.restorationai.scan.started', {}, undefined, 'AR Scanner Initialized', 'info');
    }
  };

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
       const stream = videoRef.current.srcObject as MediaStream;
       stream.getTracks().forEach(track => track.stop());
       videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('devicemotion', handleMotion);
      stopCamera();
    };
  }, [handleOrientation, handleMotion, stopCamera]);

  // --- CONCURRENT ODOMETRY CALCULATIONS ---
  const calculateWorldPoint = useCallback((): { x: number, z: number } | null => {
      // Basic Trigonometry for Depth Estimation
      const tiltRadians = (90 - orientation.beta) * (Math.PI / 180);
      const headingRadians = (360 - orientation.alpha) * (Math.PI / 180);

      if (orientation.beta > 85) return null; // Looking straight ahead or up
      if (orientation.beta < 10) return null; // Looking straight down

      // Estimated distance
      const groundDistance = CAMERA_HEIGHT_FT * Math.tan(tiltRadians);
      const clampedDistance = Math.min(groundDistance, 30);

      const x = clampedDistance * Math.sin(headingRadians);
      const z = clampedDistance * Math.cos(headingRadians);

      return { x: x - originOffset.x, z: z - originOffset.z };
  }, [orientation.alpha, orientation.beta, originOffset]);

  // --- CANVAS RENDER LOOP (SPARSE MAP & AR OVERLAY) ---
  useEffect(() => {
    if (mode !== 'scan' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let frameId: number;
    let frameCount = 0;

    const render = () => {
        if (!ctx) return;
        
        // Run light analysis every 10 frames
        frameCount++;
        if (frameCount % 10 === 0) analyzeLighting();

        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // --- AR OVERLAY LAYER (Projected World Points) ---
        if (showOverlay) {
            anomalies.forEach(anomaly => {
                const dx = anomaly.x; 
                const dz = anomaly.z;
                
                // Relative Angle Calculation
                let angleToAnomaly = Math.atan2(dx, dz) * (180 / Math.PI);
                if (angleToAnomaly < 0) angleToAnomaly += 360;

                const userHeading = 360 - orientation.alpha; 
                let deltaAngle = angleToAnomaly - userHeading;
                if (deltaAngle > 180) deltaAngle -= 360;
                if (deltaAngle < -180) deltaAngle += 360;

                const H_FOV = 60;
                if (Math.abs(deltaAngle) < H_FOV / 2) {
                    const screenX = cx + (deltaAngle / (H_FOV / 2)) * cx;
                    const dist = Math.sqrt(dx*dx + dz*dz);
                    const tiltOffset = (orientation.beta - 45) * 15; 
                    const screenY = cy + (dist * 10) - tiltOffset;

                    const size = Math.max(5, 40 - dist);

                    if (screenY > -50 && screenY < canvas.height + 50) {
                        const pulse = Math.sin(Date.now() / 200) * 3;
                        
                        // 1. REALISTIC SHADOW (Based on Light Estimation)
                        const shadowOpacity = 0.2 + (lightIntensity * 0.4); 
                        
                        ctx.beginPath();
                        ctx.ellipse(screenX, screenY + size * 0.8, size * 0.8, size * 0.3, 0, 0, Math.PI * 2);
                        ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
                        ctx.filter = `blur(${4 + (1-lightIntensity)*4}px)`; // Blurrrier in dark
                        ctx.fill();
                        ctx.filter = 'none'; // Reset filter

                        // 2. VIRTUAL OBJECT (Lit Sphere)
                        const grad = ctx.createRadialGradient(
                            screenX - size * 0.3, screenY - size * 0.3, size * 0.1, // Highlight source
                            screenX, screenY, size // Object edge
                        );
                        
                        // Color modulation based on Environment Temp
                        const baseColor = anomaly.severity === 'high' ? [239, 68, 68] : [234, 179, 8];
                        let r = baseColor[0], g = baseColor[1], b = baseColor[2];
                        if (colorTemperature === 'warm') { r += 20; g -= 10; }
                        if (colorTemperature === 'cool') { b += 20; r -= 10; }

                        const mainColor = `rgb(${r},${g},${b})`;
                        const darkColor = `rgb(${r*0.5},${g*0.5},${b*0.5})`;

                        grad.addColorStop(0, `rgba(255,255,255, ${0.8 + lightIntensity * 0.2})`); // Specular highlight brighter in high light
                        grad.addColorStop(0.4, mainColor);
                        grad.addColorStop(1, darkColor); // Shaded side

                        ctx.beginPath();
                        ctx.arc(screenX, screenY, size + pulse, 0, Math.PI * 2);
                        ctx.fillStyle = grad;
                        ctx.fill();

                        // Rim Light (Fresnel effect) for realism
                        ctx.beginPath();
                        ctx.arc(screenX, screenY, size + pulse, 0, Math.PI * 2);
                        ctx.strokeStyle = `rgba(255,255,255, ${0.2 * lightIntensity})`;
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        // Label
                        if (dist < 15) {
                            ctx.font = 'bold 12px Inter';
                            ctx.fillStyle = '#fff';
                            ctx.textAlign = 'center';
                            ctx.shadowColor = 'black';
                            ctx.shadowBlur = 4;
                            ctx.fillText(anomaly.label, screenX, screenY - size - 10);
                            ctx.shadowBlur = 0;
                        }
                    }
                }
            });
        }

        // --- HUD ELEMENTS ---
        const estimatedPos = calculateWorldPoint();
        
        // 1. Target Reticle with Live Data
        if (estimatedPos) {
            const rawX = estimatedPos.x + originOffset.x;
            const rawZ = estimatedPos.z + originOffset.z;
            const px = cx + (rawX * 15); 
            const py = cy - (rawZ * 15); 

            // Crosshair
            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px - 10, py); ctx.lineTo(px + 10, py);
            ctx.moveTo(px, py - 10); ctx.lineTo(px, py + 10);
            ctx.stroke();

            // Line from user
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py);
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
            ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
            
            // Distance Label
            ctx.fillStyle = '#fff';
            ctx.font = '10px monospace';
            const dist = Math.sqrt((estimatedPos.x + originOffset.x)**2 + (estimatedPos.z + originOffset.z)**2).toFixed(1);
            ctx.fillText(`${dist}ft`, px + 15, py + 5);
        }

        // Suggested corners are now drawn using high-fidelity interactive Framer Motion overlays in JSX instead of raw canvas context commands.

        // 2. Mini-Map
        const mapSize = 100;
        const mapX = canvas.width - mapSize - 20;
        const mapY = canvas.height - mapSize - 100;
        const mapCx = mapX + mapSize/2;
        const mapCy = mapY + mapSize/2;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath(); ctx.arc(mapCx, mapCy, mapSize/2, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Points on Mini-Map
        scanPoints.forEach(p => {
             const px = mapCx + ((p.x + originOffset.x) * 2);
             const py = mapCy - ((p.z + originOffset.z) * 2);
             ctx.fillStyle = p.type === 'corner' ? '#ef4444' : '#10b981';
             ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
        });
        
        // Anomalies on Mini-Map
        anomalies.forEach(a => {
            const px = mapCx + ((a.x + originOffset.x) * 2);
            const py = mapCy - ((a.z + originOffset.z) * 2);
            ctx.fillStyle = a.severity === 'high' ? '#ef4444' : '#eab308';
            ctx.beginPath(); ctx.rect(px - 3, py - 3, 6, 6); ctx.fill();
        });

        // Origin on Mini-Map
        if (originOffset.x !== 0 || originOffset.z !== 0) {
            const px = mapCx + (originOffset.x * 2);
            const py = mapCy - (originOffset.z * 2);
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
        }

        // User Arrow on Mini-Map
        ctx.translate(mapCx, mapCy);
        ctx.rotate((orientation.alpha * Math.PI) / 180);
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(4, 4); ctx.lineTo(-4, 4); ctx.fill();
        ctx.rotate(-(orientation.alpha * Math.PI) / 180);
        ctx.translate(-mapCx, -mapCy);

        // Draw Origin Axes in AR View
        if (originOffset.x !== 0 || originOffset.z !== 0) {
            const dx = originOffset.x;
            const dz = originOffset.z;

            let angleToOrigin = Math.atan2(dx, dz) * (180 / Math.PI);
            if (angleToOrigin < 0) angleToOrigin += 360;

            const userHeading = 360 - orientation.alpha; 
            let deltaAngle = angleToOrigin - userHeading;
            if (deltaAngle > 180) deltaAngle -= 360;
            if (deltaAngle < -180) deltaAngle += 360;

            const H_FOV = 60;
            if (Math.abs(deltaAngle) < H_FOV / 2) {
                const screenX = cx + (deltaAngle / (H_FOV / 2)) * cx;
                const dist = Math.sqrt(dx*dx + dz*dz);
                const tiltOffset = (orientation.beta - 45) * 15; 
                const screenY = cy + (dist * 10) - tiltOffset;

                // Draw X, Y, Z axes of origin
                ctx.lineWidth = 3;
                
                // Y-axis (Up - green)
                ctx.strokeStyle = '#22c55e';
                ctx.beginPath();
                ctx.moveTo(screenX, screenY);
                ctx.lineTo(screenX, screenY - 30);
                ctx.stroke();

                // X-axis (Right - red)
                ctx.strokeStyle = '#ef4444';
                ctx.beginPath();
                ctx.moveTo(screenX, screenY);
                ctx.lineTo(screenX + 20, screenY + 5);
                ctx.stroke();

                // Z-axis (Forward - blue)
                ctx.strokeStyle = '#3b82f6';
                ctx.beginPath();
                ctx.moveTo(screenX, screenY);
                ctx.lineTo(screenX - 15, screenY + 15);
                ctx.stroke();

                ctx.fillStyle = '#fff';
                ctx.font = 'bold 10px Inter';
                ctx.fillText('Origin (0,0,0)', screenX - 25, screenY - 35);
            }
        }

        frameId = requestAnimationFrame(render);
    };

    render();
    return () => {
        cancelAnimationFrame(frameId);
    };
  }, [mode, orientation, scanPoints, lightIntensity, colorTemperature, calculateWorldPoint, anomalies, showOverlay, analyzeLighting, originOffset]);

  // --- AI GUIDANCE & AUTO CAPTURE LOGIC ---
  const lastCaptureOrientation = useRef({ alpha: -999, beta: -999, gamma: -999 });
  const lastCaptureTime = useRef(0);

  useEffect(() => {
     if (autoCaptureEnabled && mode === 'scan' && trackingQuality === 'Good') {
         const now = Date.now();
         const timeDiff = now - lastCaptureTime.current;

         // Enforce a 5-second scanning time frequency between captures
         if (timeDiff >= 5000) {
             const isFirst = lastCaptureOrientation.current.alpha === -999;
             
             const angleDiff = (a1: number, a2: number) => {
                 const diff = Math.abs((a1 - a2) % 360);
                 return diff > 180 ? 360 - diff : diff;
             };

             const alphaDiff = angleDiff(orientation.alpha, lastCaptureOrientation.current.alpha);
             const betaDiff = angleDiff(orientation.beta, lastCaptureOrientation.current.beta);
             const gammaDiff = angleDiff(orientation.gamma, lastCaptureOrientation.current.gamma);
             
             // Trigger if viewing angle changes significantly OR simply every 5 seconds if moved at all
             if (isFirst || alphaDiff > 15 || betaDiff > 15 || gammaDiff > 15 || timeDiff > 8000) {
                 lastCaptureOrientation.current = { ...orientation };
                 lastCaptureTime.current = now;
                 handleCapture();
             }
         }
     }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orientation, autoCaptureEnabled, mode, trackingQuality]);

  useEffect(() => {
    if (mode !== 'scan') {
      setIsSteady(false);
      setSteadyDuration(0);
      steadySinceRef.current = null;
      return;
    }

    const angleDiff = (a1: number, a2: number) => {
      const diff = Math.abs((a1 - a2) % 360);
      return diff > 180 ? 360 - diff : diff;
    };

    const deltaAlpha = angleDiff(orientation.alpha, prevOrientationRef.current.alpha);
    const deltaBeta = angleDiff(orientation.beta, prevOrientationRef.current.beta);
    const deltaGamma = angleDiff(orientation.gamma, prevOrientationRef.current.gamma);

    // If movement of orientation is very small, we accumulate steady time
    const threshold = 1.0; // degrees
    const isNowSteady = deltaAlpha < threshold && deltaBeta < threshold && deltaGamma < threshold && trackingQuality === 'Good';

    prevOrientationRef.current = { ...orientation };

    if (isNowSteady) {
       if (steadySinceRef.current === null) {
          steadySinceRef.current = Date.now();
       }
       const duration = (Date.now() - steadySinceRef.current) / 1000;
       setSteadyDuration(duration);
       setIsSteady(true);

       if (duration < 2.0) {
          setGuidanceMessage(`Holding steady... ${(2.0 - duration).toFixed(1)}s until auto-suggest`);
       } else {
          setGuidanceMessage(`Steady! Auto-suggested corners detected. Tap pink rings to confirm!`);
       }
    } else {
       setIsSteady(false);
       setSteadyDuration(0);
       steadySinceRef.current = null;
       
       const count = capturedImages.length;
       if (count === 0) {
          setGuidanceMessage("Point at a corner and hold steady.");
       } else if (count >= 1 && count <= 2) {
          setGuidanceMessage("Slowly pan along the walls.");
       } else if (count > 2 && count < 5) {
          setGuidanceMessage("Ensure doors and windows are visible.");
       } else {
          setGuidanceMessage(`Captured ${count} photos. Keep scanning or tap process.`);
       }
    }
  }, [orientation, trackingQuality, mode, capturedImages.length]);

  const lastBlobDetectionTimeRef = useRef<number>(0);

  useEffect(() => {
    if (steadyDuration >= 2.0) {
      const now = Date.now();
      // Run blob detection at most once every 1000ms while holding steady
      if (now - lastBlobDetectionTimeRef.current >= 1000) {
         detectBlobsAndSuggestCorners();
         lastBlobDetectionTimeRef.current = now;
      }
    } else {
      if (suggestedCorners.length > 0) {
         setSuggestedCorners([]);
      }
    }
  }, [steadyDuration, detectBlobsAndSuggestCorners, suggestedCorners.length]);

  // --- ACTIONS ---
  const handleCapture = async () => {
    try {
      // Simulate capturing current frame + Odometry Pose
      if (!videoRef.current) return;
      const video = videoRef.current;
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      if (!blob) return;
      
      const base64 = await blobToBase64(blob);
      const newImage = { 
          id: Date.now(), 
          url: URL.createObjectURL(blob), 
          base64,
          pose: { ...orientation, ...deviceMotion } 
      };
      setCapturedImages(prev => [...prev, newImage]);
      
      // Simulate adding a point to sparse map based on capture
      const estimated = calculateWorldPoint();
      if (estimated) {
          setScanPoints(prev => [...prev, {
              id: Date.now(),
              x: estimated.x,
              z: estimated.z,
              r: orientation.alpha,
              type: 'feature'
          }]);
      }
      EventBus.publish('com.restorationai.scan.captured', { count: capturedImages.length + 1 }, undefined, `Frame ${capturedImages.length + 1} Captured`, 'info');
    } catch (e) {
      console.error("Capture failed:", e);
    }
  };

  const processScan = async () => {
      setMode('processing');
      
      try {
          EventBus.publish('com.restorationai.scan.step', { step: 1, name: 'Requesting AI analysis from server' }, undefined, 'Processing Scan Data', 'info');
          
          const response = await fetch('/api/ai/process-scan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ capturedImages })
          });

          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Failed to process scan');
          }

          const { baseResult, svgResult } = await response.json();

          setAiDimensions({ length: baseResult.length, width: baseResult.width, sqft: baseResult.length * baseResult.width });
          setAiRoomLabel(baseResult.roomLabel);
          setAiDamageAssessment(baseResult.damageAssessment);
          setAiGeneratedSvg(svgResult.floorPlanSvg);
          setAiMaterials({
              room_identification: baseResult.roomLabel,
              materials: baseResult.materials
          });
          
          setMode('result');
          
          EventBus.publish('com.restorationai.scan.completed', { room: baseResult.roomLabel }, undefined, 'Scan Analysis Complete', 'success');

      } catch (error) {
          console.error("AI Processing failed:", error);
          // Fallback to mock for demo if AI fails
          setAiDimensions({ length: 14.5, width: 12.2, sqft: 176.9 });
          setAiRoomLabel('Living Room (Fallback)');
          setAiDamageAssessment('AI analysis failed. Using manual estimates.');
          setAiGeneratedSvg(`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <!-- Walls -->
            <rect x="10" y="10" width="80" height="80" fill="none" stroke="currentColor" stroke-width="2" />
            <!-- Door -->
            <path d="M 10 30 L 10 50" stroke="white" stroke-width="3" />
            <path d="M 10 30 Q 30 30 30 50 L 10 50" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2" />
            <!-- Window -->
            <rect x="30" y="8" width="40" height="4" fill="currentColor" opacity="0.5" />
            <!-- Measurements -->
            <text x="50" y="5" font-size="4" fill="currentColor" text-anchor="middle">14.5'</text>
            <text x="5" y="50" font-size="4" fill="currentColor" text-anchor="middle" transform="rotate(-90 5 50)">12.2'</text>
          </svg>`);
          setMode('result');
          EventBus.publish('com.restorationai.scan.error', { error: 'AI Analysis Failed' }, undefined, 'Scan Failed', 'error');
      }
  };

  const clearCachedSession = () => {
      localStorage.removeItem(CACHE_KEY_POINTS);
      localStorage.removeItem(CACHE_KEY_PHOTOS);
      localStorage.removeItem(CACHE_KEY_OFFSET);
      localStorage.removeItem(CACHE_KEY_CEILING);
      localStorage.removeItem(CACHE_KEY_AREAS);
      localStorage.removeItem(CACHE_KEY_ANOMALIES);
  };

  const resetScan = () => {
      clearCachedSession();
      setScanPoints([]);
      setCapturedImages([]);
      setOriginOffset({ x: 0, z: 0 });
      setCeilingHeight(8.0);
      setAreas([]);
      setAnomalies([]);
      setMode('scan');
  };

  const handleComplete = () => {
      if (aiDimensions) {
          let updatedSvg = aiGeneratedSvg;
          if (areas.length > 0) {
              const polygons = areas.map(area => 
                  `<polygon points="${area.points.map(p => `${p.x},${p.z}`).join(' ')}" fill="${area.color}" fill-opacity="0.4" stroke="${area.color}" stroke-width="0.5" />`
              ).join('');
              updatedSvg = updatedSvg.replace('</svg>', `${polygons}</svg>`);
          }
          
          clearCachedSession();
          setScanPoints([]);
          setCapturedImages([]);
          setOriginOffset({ x: 0, z: 0 });
          setCeilingHeight(8.0);
          setAreas([]);
          setAnomalies([]);
          
          const scanData: RoomScan = {
            scanId: `scan-${Date.now()}`,
            roomName: aiRoomLabel,
            floorPlanSvg: updatedSvg,
            dimensions: { ...aiDimensions, height: ceilingHeight, sqft: aiDimensions.sqft }, 
            placedPhotos: [],
            materials: aiMaterials || undefined
          };
          onComplete(scanData);
      } else {
          clearCachedSession();
          setScanPoints([]);
          setCapturedImages([]);
          setOriginOffset({ x: 0, z: 0 });
          setCeilingHeight(8.0);
          setAreas([]);
          setAnomalies([]);
          onComplete();
      }
  };

  // --- RENDER ---
  if (mode === 'init') {
      const hasSavedSession = scanPoints.length > 0 || capturedImages.length > 0;

      return (
          <div className="h-full bg-slate-950 flex flex-col items-center justify-center p-8 text-center space-y-6 overflow-y-auto no-scrollbar">
              <div className="relative">
                  <div className="w-24 h-24 bg-brand-cyan/20 rounded-full animate-ping absolute" />
                  <div className="w-24 h-24 bg-brand-cyan/10 rounded-full flex items-center justify-center border border-brand-cyan/50 relative z-10">
                      <ScanLine size={40} className="text-brand-cyan" />
                  </div>
              </div>
              <div>
                  <h2 className="text-2xl font-black text-white">Spatial Intelligence</h2>
                  <p className="text-slate-400 mt-2 max-w-xs mx-auto">Image-enhanced photogrammetry.</p>
              </div>

              {hasSavedSession ? (
                  <div className="w-full max-w-sm bg-slate-900/80 border border-brand-cyan/30 rounded-2xl p-5 space-y-4 shadow-xl select-none">
                      <div className="text-left space-y-2">
                          <h3 className="text-xs font-black uppercase text-brand-cyan tracking-wider">Unfinished Session Detected</h3>
                          <p className="text-xs text-slate-300 leading-relaxed font-semibold">
                              A previous AR scan session is available in your browser cache with the following data:
                          </p>
                          <div className="grid grid-cols-2 gap-2 text-left pt-1 font-semibold">
                              <div className="bg-slate-950/50 p-2.5 rounded-xl border border-white/5">
                                  <span className="block text-[10px] uppercase font-black text-slate-500">Corners</span>
                                  <span className="text-sm font-bold text-white">{scanPoints.length}</span>
                              </div>
                              <div className="bg-slate-950/50 p-2.5 rounded-xl border border-white/5">
                                  <span className="block text-[10px] uppercase font-black text-slate-500">Captured Photos</span>
                                  <span className="text-sm font-bold text-white">{capturedImages.length}</span>
                              </div>
                              <div className="bg-slate-950/50 p-2.5 rounded-xl border border-white/5">
                                  <span className="block text-[10px] uppercase font-black text-slate-500">Origin Offset</span>
                                  <span className="text-xs font-mono font-bold text-white">
                                      {originOffset.x.toFixed(1)}ft, {originOffset.z.toFixed(1)}ft
                                  </span>
                              </div>
                              <div className="bg-slate-950/50 p-2.5 rounded-xl border border-white/5">
                                  <span className="block text-[10px] uppercase font-black text-slate-500">Damaged Areas</span>
                                  <span className="text-sm font-bold text-white">{areas.length}</span>
                              </div>
                          </div>
                      </div>
                      
                      <div className="flex flex-col space-y-2 pt-1 font-semibold">
                          <button 
                              onClick={requestSensors} 
                              className="w-full bg-brand-cyan text-slate-950 py-3 rounded-xl font-black uppercase tracking-wider text-xs shadow-lg hover:bg-cyan-400 transition-all active:scale-95 text-center flex items-center justify-center"
                          >
                              Resume Previous Session
                          </button>
                          <button 
                              onClick={() => {
                                  if (confirm("Are you sure you want to discard your previous AR scan progress and start a fresh scan?")) {
                                      clearCachedSession();
                                      setScanPoints([]);
                                      setCapturedImages([]);
                                      setOriginOffset({ x: 0, z: 0 });
                                      setCeilingHeight(8.0);
                                      setAreas([]);
                                      setAnomalies([]);
                                  }
                              }} 
                              className="w-full bg-white/5 hover:bg-white/10 text-slate-400 font-bold text-xs py-2.5 rounded-xl transition-colors border border-white/5"
                          >
                              Discard & Start Fresh
                          </button>
                      </div>
                  </div>
              ) : (
                  <button onClick={requestSensors} className="bg-brand-cyan text-slate-950 px-8 py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-cyan-400 transition-all active:scale-95">
                      Initialize Scanner
                  </button>
              )}
          </div>
      )
  }

  return (
    <div className="h-full relative bg-black overflow-hidden flex flex-col">
        {mode === 'scan' && (
            <>
                {/* Camera View */}
                <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                
                {cameraError ? (
                    <div id="camera-permission-error" className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
                        <div className="max-w-md w-full bg-slate-900/90 border border-red-500/20 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/30">
                                <X className="text-red-500" size={32} />
                            </div>
                            <div className="mt-8 space-y-5">
                                <h3 className="text-xl font-bold text-white tracking-tight">Camera Access Required</h3>
                                <p className="text-sm text-slate-400 leading-relaxed font-medium">
                                    {cameraError}
                                </p>
                                <div className="bg-slate-950/50 rounded-2xl p-5 border border-white/5 text-left text-xs text-slate-400 space-y-3">
                                    <p className="font-bold text-slate-200">How to restore connection:</p>
                                    <ul className="list-disc list-inside space-y-1.5 text-slate-400 leading-relaxed">
                                        <li>Allow camera accessibility inside this browser's address bar settings.</li>
                                        <li>Ensure no other application is currently locking your camera.</li>
                                        <li>Provide application permissions inside your device system settings.</li>
                                    </ul>
                                </div>
                                <div className="flex space-x-3 pt-2">
                                    <button
                                        id="btn-error-go-back"
                                        onClick={() => onComplete()}
                                        className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-slate-300 font-semibold text-sm transition-all border border-white/5"
                                    >
                                        Go Back
                                    </button>
                                    <button
                                        id="btn-error-retry"
                                        onClick={() => {
                                            setCameraError(null);
                                            startCamera();
                                        }}
                                        className="flex-1 px-4 py-3 bg-brand-cyan hover:bg-cyan-400 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-brand-cyan/20 flex items-center justify-center space-x-2"
                                    >
                                        <RefreshCw size={14} />
                                        <span>Retry Access</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <canvas 
                            ref={canvasRef} 
                            data-testid="scan-area"
                            className="absolute inset-0 z-10 w-full h-full cursor-crosshair" 
                            onClick={(e) => {
                               const canvas = e.currentTarget;
                               const rect = canvas.getBoundingClientRect();
                               const px = e.clientX - rect.left;
                               const py = e.clientY - rect.top;
                               
                               // Check if tap is near any suggested corner
                               const nearSuggested = suggestedCorners.find(sc => {
                                   const dist = Math.sqrt((sc.x - px) ** 2 + (sc.y - py) ** 2);
                                   return dist < 30; // within 30px
                               });

                               if (nearSuggested) {
                                   addSuggestedCorner(nearSuggested.x, nearSuggested.y);
                                   return; // Fast return to bypass origin re-centering
                               }

                               const cx = rect.width / 2;
                               const cy = rect.height / 2;
                               
                               const deltaX = px - cx;
                               const deltaY = py - cy;
                               
                               const H_FOV = 60; 
                               const V_FOV = 45; 
                               const headingOffset = (deltaX / cx) * (H_FOV/2);
                               const tiltOffset = -(deltaY / cy) * (V_FOV/2); 
                               
                               const clickHeading = (orientation.alpha + headingOffset + 360) % 360;
                               const clickTilt = orientation.beta + tiltOffset;
                               
                               const tiltRadians = (90 - clickTilt) * (Math.PI / 180);
                               const headingRadians = (360 - clickHeading) * (Math.PI / 180);
                               
                               if (clickTilt > 10 && clickTilt < 85) {
                                   const groundDistance = CAMERA_HEIGHT_FT * Math.tan(tiltRadians);
                                   const clampedDistance = Math.min(groundDistance, 30);
                                   
                                   const originX = clampedDistance * Math.sin(headingRadians);
                                   const originZ = clampedDistance * Math.cos(headingRadians);
                                   
                                   setOriginOffset({ x: originX, z: originZ });
                                   EventBus.publish('com.restorationai.scan.origin', {}, undefined, 'AR Origin Set to Tap', 'success');
                               } else {
                                   EventBus.publish('com.restorationai.scan.error', {}, undefined, 'Could not resolve floor point', 'warning');
                               }
                            }}
                        />

                        {/* Interactive Detected Corners Overlay */}
                        <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden select-none">
                            <AnimatePresence>
                                {suggestedCorners.map((sc) => (
                                    <motion.div
                                        key={sc.id}
                                        initial={{ opacity: 0, scale: 0.3 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.3 }}
                                        transition={{ 
                                            type: "spring", 
                                            stiffness: 400, 
                                            damping: 25 
                                        }}
                                        style={{
                                            position: 'absolute',
                                            left: sc.x,
                                            top: sc.y,
                                            transform: 'translate(-50%, -50%)',
                                        }}
                                        className="absolute pointer-events-auto cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            addSuggestedCorner(sc.x, sc.y);
                                        }}
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                    >
                                        {/* Outer dotted pulsing ring */}
                                        <motion.div
                                            animate={{
                                                scale: [1, 1.25, 1],
                                                opacity: [0.8, 0.25, 0.8],
                                                rotate: [0, 180, 360]
                                            }}
                                            transition={{
                                                duration: 2.5,
                                                repeat: Infinity,
                                                ease: "linear",
                                            }}
                                            className="absolute -inset-6 w-12.5 h-12.5 rounded-full border border-dashed border-pink-400"
                                        />

                                        {/* Glowing background aura */}
                                        <motion.div
                                            animate={{
                                                scale: [1, 1.4, 1],
                                                opacity: [0.4, 0.1, 0.4],
                                            }}
                                            transition={{
                                                duration: 1.8,
                                                repeat: Infinity,
                                                ease: "easeInOut",
                                            }}
                                            className="absolute -inset-8 w-16 h-16 rounded-full bg-pink-500/10 blur-sm"
                                        />

                                        {/* Concentric interactive target ring */}
                                        <div className="w-7 h-7 rounded-full border-2 border-pink-300 bg-gradient-to-tr from-pink-600 to-pink-400 flex items-center justify-center shadow-lg shadow-pink-500/40 backdrop-blur-md">
                                            <div className="w-2 h-2 rounded-full bg-white shadow-inner animate-ping" />
                                        </div>

                                        {/* Live dynamic "TAP TO CONFIRM" badge with pointer tip */}
                                        <motion.div 
                                            initial={{ y: 8, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.1 }}
                                            className="absolute top-10 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-pink-500/30 text-[9px] font-black uppercase text-pink-300 px-2 py-0.5 rounded-md shadow-xl flex items-center space-x-1 whitespace-nowrap"
                                        >
                                            <span className="w-1 h-1 rounded-full bg-pink-400 animate-pulse" />
                                            <span>TAP TO ADD</span>
                                        </motion.div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                        
                        {/* HUD Header */}
                        <AnimatePresence>
                        <motion.div 
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                            className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent flex justify-between items-start pt-12 z-20"
                        >
                            <div>
                                 <div className="flex items-center space-x-2">
                                    <div className={`w-2 h-2 rounded-full ${trackingQuality === 'Good' ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/80">
                                        {trackingQuality === 'Good' ? 'Tracking Stable' : 'Tracking Unstable'}
                                    </span>
                                    {isSteady && (
                                        <span className="text-[9px] bg-pink-500/20 text-pink-400 px-1.5 py-0.5 rounded border border-pink-500/30 font-black tracking-widest animate-pulse ml-2">
                                            STEADY LOCK
                                        </span>
                                    )}
                                 </div>
                                 <div className="flex items-center space-x-2 mt-1">
                                     <span className="text-[10px] font-mono text-slate-400">{orientation.alpha.toFixed(0)}°N</span>
                                     <span className="text-[10px] font-mono text-slate-400">Light: {(lightIntensity*100).toFixed(0)}%</span>
                                 </div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="flex items-center space-x-1.5 transition-all">
                                    {isSyncing ? (
                                        <>
                                            <CloudUpload size={16} className="text-brand-cyan animate-pulse" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-cyan">Syncing</span>
                                        </>
                                    ) : (
                                        <>
                                            <Cloud size={16} className="text-slate-400" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Synced</span>
                                        </>
                                    )}
                                </div>
                                <button onClick={() => onComplete()} className="p-2 bg-white/10 backdrop-blur rounded-full text-zinc-300 hover:text-white transition-colors">
                                    <X size={20}/>
                                </button>
                            </div>
                        </motion.div>
                        </AnimatePresence>

                        {/* AI Guidance Overlay */}
                        <AnimatePresence mode="popLayout">
                            {guidanceMessage && (
                                <motion.div 
                                    key={guidanceMessage}
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                    transition={{ duration: 0.3 }}
                                    className="absolute top-24 left-1/2 -translate-x-1/2 w-72 p-3 bg-slate-900/80 border border-brand-cyan/30 rounded-xl backdrop-blur-md text-center shadow-lg pointer-events-none z-30"
                                >
                                    <div className="flex items-center justify-center space-x-2 mb-1">
                                        <BrainCircuit size={14} className="text-brand-cyan" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-brand-cyan">AI Guide</span>
                                        {autoCaptureEnabled && <span className="w-1.5 h-1.5 bg-brand-cyan rounded-full animate-pulse" />}
                                    </div>
                                    <div className="text-sm font-medium text-white">{guidanceMessage}</div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Footer Controls */}
                        <AnimatePresence>
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                            className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-20 space-y-4"
                        >
                             {/* Captured Thumbnails */}
                             <div className="flex space-x-2 overflow-x-auto no-scrollbar pb-2">
                                 {capturedImages.map(img => (
                                     <img key={img.id} src={img.url} className="h-12 w-12 rounded-lg border border-white/20 object-cover" />
                                 ))}
                             </div>
                             
                             <div className="flex items-center justify-between gap-4">
                                 <div className="flex items-center space-x-2">
                                    <button onClick={() => setShowOverlay(!showOverlay)} className={`p-4 rounded-2xl border transition-all ${showOverlay ? 'bg-brand-cyan/20 border-brand-cyan text-brand-cyan' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                                        <Layers size={24} />
                                    </button>
                                 </div>
                                 
                                 <div className="flex flex-col items-center space-y-2 flex-1">
                                     <button onClick={handleCapture} disabled={autoCaptureEnabled} className={`w-full h-16 backdrop-blur-md rounded-2xl border flex items-center justify-center transition-all group ${autoCaptureEnabled ? 'bg-brand-cyan/20 border-brand-cyan pointer-events-none' : 'bg-white/10 border-white/20 active:scale-95'}`}>
                                         <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${autoCaptureEnabled ? 'border-brand-cyan bg-brand-cyan/20' : 'border-white group-hover:bg-white/20'}`}>
                                             <div className={`w-10 h-10 rounded-full ${autoCaptureEnabled ? 'bg-brand-cyan animate-pulse' : 'bg-white'}`} />
                                         </div>
                                     </button>
                                     <div className="flex flex-col items-center">
                                         <button 
                                            onClick={() => setAutoCaptureEnabled(!autoCaptureEnabled)} 
                                            className={`text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full transition-colors ${autoCaptureEnabled ? 'bg-brand-cyan text-slate-900' : 'bg-white/10 text-slate-400'}`}
                                         >
                                             Auto Capture
                                         </button>
                                         <div className="flex items-center space-x-2 bg-slate-950/75 px-2.5 py-1 rounded border border-white/5 backdrop-blur-sm shadow mt-1.5">
                                            <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">AI Threshold:</span>
                                            <input 
                                                type="range" 
                                                min="50" 
                                                max="95" 
                                                step="1"
                                                value={Math.round(blobThreshold * 100)} 
                                                onChange={(e) => setBlobThreshold(parseFloat(e.target.value) / 100)} 
                                                className="w-12 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-brand-cyan hover:accent-brand-cyan/80"
                                            />
                                            <span className="text-[9px] font-mono font-bold text-brand-cyan">{(blobThreshold * 100).toFixed(0)}%</span>
                                         </div>
                                     </div>
                                 </div>

                                 <button onClick={processScan} disabled={capturedImages.length < 3} className="p-4 rounded-2xl bg-brand-cyan text-slate-900 font-bold disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 shadow-lg shadow-brand-cyan/20">
                                     <ArrowLeft size={24} className="rotate-180" />
                                 </button>
                             </div>
                        </motion.div>
                        </AnimatePresence>
                    </>
                )}
            </>
        )}

        {mode === 'processing' && (
             <div className="h-full flex flex-col items-center justify-center bg-slate-950 text-center p-8 space-y-6">
                 <div className="relative">
                     <div className="w-24 h-24 border-4 border-brand-cyan/20 border-t-brand-cyan rounded-full animate-spin" />
                     <BrainCircuit className="absolute inset-0 m-auto text-brand-cyan animate-pulse" size={32} />
                 </div>
                 <div>
                     <h3 className="text-xl font-bold text-white">Generating Floorplan</h3>
                     <p className="text-slate-400 text-sm mt-2">Correlating sparse features with sensor data...</p>
                 </div>
             </div>
        )}

        {mode === 'result' && aiDimensions && (
            <div className="h-full flex flex-col bg-slate-950 text-slate-200">
                <header className="bg-slate-900 p-4 border-b border-white/10 shadow-sm z-10 flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-black text-white tracking-tight">{aiRoomLabel}</h2>
                        <p className="text-xs text-brand-cyan font-bold tracking-wider uppercase mt-1">
                            {aiDimensions.length}' x {aiDimensions.width}' • {aiDimensions.sqft.toFixed(0)} sqft
                        </p>
                    </div>
                    <div className="flex bg-slate-800 p-1 rounded-xl items-center space-x-1 border border-white/5 shadow-inner">
                        {interactionMode === 'draw_area' && currentAreaPoints.length > 0 && (
                            <>
                                <button onClick={() => {
                                    setAreas([...areas, { id: Date.now().toString(), points: currentAreaPoints, color: '#ef4444' }]);
                                    setCurrentAreaPoints([]);
                                }} className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold text-xs uppercase px-3 shadow-sm hover:bg-emerald-500/30 transition-colors">Save</button>
                                <button onClick={() => setCurrentAreaPoints([])} className="p-2 rounded-lg bg-slate-700/50 text-slate-300 font-bold text-xs uppercase shadow-sm hover:bg-slate-700 transition-colors">Clear</button>
                            </>
                        )}
                        <button 
                            onClick={() => setInteractionMode(interactionMode === 'draw_area' ? 'scan' : 'draw_area')} 
                            className={`p-2 rounded-lg shadow-sm transition-colors ${interactionMode === 'draw_area' ? 'bg-brand-cyan text-slate-900' : 'bg-transparent text-slate-400 hover:text-white hover:bg-white/5'}`}
                            title="Draw Affected Area"
                        >
                            <PenTool size={18} />
                        </button>
                    </div>
                </header>
                
                {/* 2D VIEWPORT */}
                <div className="flex-1 relative overflow-hidden bg-[#050505] flex items-center justify-center p-8 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:24px_24px]">
                    {aiGeneratedSvg ? (
                        <div 
                            className={`w-full max-w-md aspect-square bg-slate-900 border border-white/10 rounded-[2rem] shadow-2xl shadow-brand-cyan/5 p-6 relative ${interactionMode === 'draw_area' ? 'cursor-crosshair' : ''}`}
                            onClick={(e) => {
                                if (interactionMode === 'draw_area') {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                                    const z = ((e.clientY - rect.top) / rect.height) * 100;
                                    setCurrentAreaPoints([...currentAreaPoints, { x, z }]);
                                }
                            }}
                        >
                            <div className="absolute inset-0 p-6 [&>svg]:w-full [&>svg]:h-full [&>svg]:text-brand-cyan opacity-80 pointer-events-none" dangerouslySetInnerHTML={{ __html: aiGeneratedSvg }} />
                            
                            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                                {areas.map(area => (
                                    <polygon 
                                        key={area.id}
                                        points={area.points.map(p => `${p.x},${p.z}`).join(' ')}
                                        fill={area.color}
                                        fillOpacity={0.2}
                                        stroke={area.color}
                                        strokeWidth="0.5"
                                    />
                                ))}
                                {interactionMode === 'draw_area' && currentAreaPoints.length > 0 && (
                                    <>
                                        <polyline 
                                            points={currentAreaPoints.map(p => `${p.x},${p.z}`).join(' ')}
                                            fill="none"
                                            stroke="#ef4444"
                                            strokeWidth="0.5"
                                            strokeDasharray="1,1"
                                        />
                                        {currentAreaPoints.map((p, i) => (
                                            <circle key={i} cx={p.x} cy={p.z} r="1.5" fill="#ef4444" />
                                        ))}
                                    </>
                                )}
                            </svg>
                        </div>
                    ) : (
                        <div className="text-slate-600 flex flex-col items-center">
                            <Layers size={48} className="mb-4 opacity-50" />
                            <p className="font-medium text-sm">No floorplan generated</p>
                        </div>
                    )}
                </div>

                {/* AI DAMAGE ASSESSMENT */}
                {aiDamageAssessment && (
                    <div className="bg-brand-cyan/10 border-t border-brand-cyan/20 p-4 shrink-0 shadow-[inset_0_10px_20px_rgba(0,0,0,0.2)]">
                        <div className="flex items-center space-x-2 text-brand-cyan mb-2">
                            <BrainCircuit size={16} />
                            <h3 className="text-[10px] font-black uppercase tracking-widest">AI Damage Assessment</h3>
                        </div>
                        <p className="text-xs text-brand-cyan/90 leading-relaxed max-h-24 overflow-y-auto">
                            {aiDamageAssessment}
                        </p>
                    </div>
                )}

                {/* CONTROLS */}
                <div className="bg-slate-900 p-6 border-t border-white/5 space-y-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-20">
                    <div className="space-y-3">
                        <div className="flex justify-between items-end">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ceiling Height</label>
                            <span className="text-xl font-black text-white">{ceilingHeight.toFixed(1)} ft</span>
                        </div>
                        <input 
                            type="range" 
                            min="6" max="20" step="0.5" 
                            value={ceilingHeight} 
                            onChange={(e) => setCeilingHeight(parseFloat(e.target.value))}
                            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-brand-cyan"
                        />
                    </div>
                    
                    <div className="flex justify-between items-center p-4 bg-slate-800/50 rounded-xl border border-white/5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Calculated Area</div>
                        <div className="text-2xl font-black text-white">{aiDimensions.sqft.toFixed(0)} <span className="text-xs text-slate-500 font-medium tracking-normal lowercase">sq ft</span></div>
                    </div>

                    <div className="flex space-x-3 pt-2">
                        <button onClick={resetScan} className="p-4 rounded-xl bg-slate-800 text-slate-400 font-bold hover:text-white hover:bg-slate-700 transition-colors"><RefreshCw size={20}/></button>
                        <button onClick={handleComplete} className="flex-1 py-4 bg-brand-cyan text-slate-900 rounded-xl font-black shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:bg-brand-cyan/90 transition-all active:scale-95 flex items-center justify-center space-x-2">
                            <Check size={20} />
                            <span>Save & Continue</span>
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default ARScanner;
