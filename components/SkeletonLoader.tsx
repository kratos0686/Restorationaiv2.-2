
import React from 'react';

interface SkeletonLoaderProps {
  count?: number;
  className?: string;
  height?: string;
  width?: string;
  borderRadius?: string;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  count = 1,
  className = '',
  height = '1rem',
  width = '100%',
  borderRadius = '0.5rem'
}) => {
  const skeletons = Array.from({ length: count });

  return (
    <div className={`space-y-2 ${className}`}>
      {skeletons.map((_, index) => (
        <div
          key={index}
          className="bg-slate-800/80 animate-pulse"
          style={{ height, width, borderRadius }}
        />
      ))}
    </div>
  );
};

export default SkeletonLoader;
