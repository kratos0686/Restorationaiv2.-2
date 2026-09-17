import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SkeletonLoader from '../components/SkeletonLoader';

describe('SkeletonLoader', () => {
  it('renders one skeleton bar by default', () => {
    const { container } = render(<SkeletonLoader />);
    // Default count=1 → one child div inside the wrapper
    const bars = container.querySelectorAll('.animate-pulse');
    expect(bars).toHaveLength(1);
  });

  it('renders the requested number of skeleton bars', () => {
    const { container } = render(<SkeletonLoader count={4} />);
    const bars = container.querySelectorAll('.animate-pulse');
    expect(bars).toHaveLength(4);
  });

  it('applies a custom height style', () => {
    const { container } = render(<SkeletonLoader height="3rem" />);
    const bar = container.querySelector('.animate-pulse') as HTMLElement;
    expect(bar.style.height).toBe('3rem');
  });

  it('applies a custom width style', () => {
    const { container } = render(<SkeletonLoader width="50%" />);
    const bar = container.querySelector('.animate-pulse') as HTMLElement;
    expect(bar.style.width).toBe('50%');
  });

  it('applies a custom borderRadius style', () => {
    const { container } = render(<SkeletonLoader borderRadius="1rem" />);
    const bar = container.querySelector('.animate-pulse') as HTMLElement;
    expect(bar.style.borderRadius).toBe('1rem');
  });

  it('passes additional className to the wrapper', () => {
    const { container } = render(<SkeletonLoader className="my-custom" />);
    expect(container.firstChild).toHaveClass('my-custom');
  });
});
