import React from 'react';

interface BrandingProps {
  isCollapsed?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const LogoIcon: React.FC<{ className?: string }> = ({ className = "w-full h-full" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="logo-bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0b0f19" />
        <stop offset="100%" stopColor="#020617" />
      </linearGradient>
      <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#3b82f6" />
        <stop offset="50%" stopColor="#00d4aa" />
        <stop offset="100%" stopColor="#10b981" />
      </linearGradient>
      <filter id="logo-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    
    {/* Base plate with slick border */}
    <rect width="100" height="100" rx="24" fill="url(#logo-bg)" />
    <rect x="1.5" y="1.5" width="97" height="97" rx="22.5" stroke="white" strokeOpacity="0.08" strokeWidth="1.5" />
    
    {/* Fluid waves representing water restoration at the bottom */}
    <path d="M22 66 C 35 71, 42 60, 52 69 C 62 78, 68 67, 78 66" stroke="#3b82f6" strokeWidth="4.5" strokeLinecap="round" opacity="0.4" />
    <path d="M18 73 C 31 77, 38 66, 48 74 C 58 82, 68 71, 82 73" stroke="#00d4aa" strokeWidth="4.5" strokeLinecap="round" opacity="0.6" />
    
    {/* High-tech abstract 3D geometric 'R' */}
    {/* Back vertical bar of R - stylized as a digital scale measurement probe */}
    <rect x="32" y="24" width="8" height="48" rx="4" fill="url(#logo-grad)" />
    <circle cx="36" cy="30" r="2.5" fill="#fff" />
    <circle cx="36" cy="48" r="1.8" fill="#fff" opacity="0.7" />
    <circle cx="36" cy="66" r="2.5" fill="#fff" opacity="0.9" />
    
    {/* Loop and diagonal leg of 'R' integrated into a water-droplet arc */}
    <path d="M40 28H53.5 C61.5 28 68 34.5 68 42.5 C68 50.5 61.5 57 53.5 57H40" stroke="url(#logo-grad)" strokeWidth="8" strokeLinecap="round" />
    <path d="M51.5 54 L66 71.5" stroke="url(#logo-grad)" strokeWidth="8" strokeLinecap="round" />
    
    {/* Sparkle/intelligence focal point */}
    <path d="M68 20 L70.5 26.5 L77 29 L70.5 31.5 L68 38 L65.5 31.5 L59 29 L65.5 26.5 Z" fill="#ffffff" filter="url(#logo-glow)" />
  </svg>
);

const Branding: React.FC<BrandingProps> = ({ isCollapsed, className = "", size = "md" }) => {
  const containerSizeClasses = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  const titleSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-lg',
    xl: 'text-2xl'
  };

  const subtitleSizeClasses = {
    sm: 'text-[5px]',
    md: 'text-[7px]',
    lg: 'text-[8px]',
    xl: 'text-[10px]'
  };

  return (
    <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'} ${className}`}>
      <div className={`relative flex-shrink-0 transition-all duration-300 ${containerSizeClasses[size]} overflow-hidden rounded-xl shadow-lg ring-1 ring-white/10`}>
        <LogoIcon />
      </div>
      {!isCollapsed && (
        <div className="min-w-0 transition-all duration-300">
          <h1 className={`${titleSizeClasses[size]} font-black text-white tracking-tight leading-none uppercase`}>
            Restoration <span className="text-[#00d4aa]">AI</span>
          </h1>
          <p className={`${subtitleSizeClasses[size]} text-slate-500 font-bold uppercase tracking-[0.2em] mt-1 opacity-90 leading-tight`}>
            Smart Solutions for Mitigation & Recovery
          </p>
        </div>
      )}
    </div>
  );
};

export default Branding;
