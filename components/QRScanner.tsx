import React, { useRef, useState, useEffect } from 'react';
import jsQR from 'jsqr';
import { Camera, X } from 'lucide-react';

interface QRScannerProps {
    onScan: (data: string) => void;
    onClose: () => void;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
    const [error, setError] = useState<string>('');

    useEffect(() => {
        let stream: MediaStream | null = null;
        let animationFrameId: number;

        const startCamera = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: 'environment' } 
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.setAttribute('playsinline', 'true'); // required to tell iOS safari we don't want fullscreen
                    videoRef.current.play();
                    requestAnimationFrame(tick);
                }
            } catch (err) {
                console.error("Camera access failed:", err);
                setError('Failed to access camera. Please check permissions.');
            }
        };

        const tick = () => {
             if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
                 const canvas = canvasRef.current;
                 const video = videoRef.current;
                 const ctx = canvas.getContext('2d');
                 
                 canvas.width = video.videoWidth;
                 canvas.height = video.videoHeight;
                 
                 if (ctx) {
                     ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                     const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                     const code = jsQR(imageData.data, imageData.width, imageData.height, {
                         inversionAttempts: "dontInvert",
                     });
                     
                     if (code) {
                         onScan(code.data);
                         return; // Stop ticking if we found a code
                     }
                 }
             }
             animationFrameId = requestAnimationFrame(tick);
        };

        startCamera();

        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [onScan]);

    return (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center">
             <div className="absolute top-4 right-4 z-10">
                 <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
                     <X size={24} />
                 </button>
             </div>
             
             <div className="w-full max-w-sm aspect-[3/4] relative overflow-hidden rounded-[2rem] border-2 border-brand-cyan shadow-[0_0_50px_rgba(6,182,212,0.3)]">
                 {error ? (
                     <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-red-400 bg-slate-900">
                         {error}
                     </div>
                 ) : (
                     <>
                        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />
                        <div className="absolute inset-0 pointer-events-none border-[30px] border-black/50"></div>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-48 h-48 border-2 border-brand-cyan/50 rounded-xl relative">
                                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-brand-cyan rounded-tl"></div>
                                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-brand-cyan rounded-tr"></div>
                                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-brand-cyan rounded-bl"></div>
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-brand-cyan rounded-br"></div>
                                <div className="absolute top-0 left-0 w-full h-0.5 shadow-[0_0_10px_#06b6d4] bg-brand-cyan animate-[scan_2s_ease-in-out_infinite_alternate]" style={{ animation: 'scan 2.5s infinite ease-in-out alternate' }}>
                                    <style>{`
                                        @keyframes scan {
                                            0% { transform: translateY(0); }
                                            100% { transform: translateY(192px); }
                                        }
                                    `}</style>
                                </div>
                            </div>
                        </div>
                     </>
                 )}
             </div>
             
             <div className="mt-8 text-center px-6">
                 <div className="flex items-center justify-center space-x-2 text-brand-cyan mb-2">
                     <Camera size={20} />
                     <h3 className="font-bold text-lg">Scan Equipment QR</h3>
                 </div>
                 <p className="text-slate-400 text-sm max-w-[250px] mx-auto">
                     Center the equipment QR code in the scanner to retrieve or deploy it.
                 </p>
             </div>
        </div>
    );
};

export default QRScanner;
