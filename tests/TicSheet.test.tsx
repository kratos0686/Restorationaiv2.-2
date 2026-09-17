import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WaterCategory, LossClass, LossFile } from '../types';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

vi.mock('../services/AIRouterClient', () => ({
  AIRouterClient: vi.fn().mockImplementation(() => ({
    generateScope: vi.fn().mockResolvedValue({ text: '{}' }),
  })),
}));

vi.mock('../services/EventBus', () => ({
  EventBus: { publish: vi.fn(), on: vi.fn(() => vi.fn()) },
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import TicSheet from '../components/TicSheet';
import { useAppContext } from '../context/AppContext';

// ─── Fixture ──────────────────────────────────────────────────────────────────

const project: LossFile = {
  id: 'p-1',
  companyId: 'c-1',
  client: 'Test Client',
  address: '1 Main St',
  status: 'Active',
  currentStage: 'Scope',
  progress: 20,
  riskLevel: 'medium',
  rooms: [],
  milestones: [],
  tasks: [],
  lineItems: [
    { id: 'li-1', code: 'WTR-01', description: 'Water extraction', quantity: 1, rate: 400, total: 400 },
  ],
  totalCost: 400,
  invoiceStatus: 'Draft',
  roomScans: [],
  videos: [],
  waterCategory: WaterCategory.CAT_2,
  lossClass: LossClass.CLASS_2,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TicSheet', () => {
  beforeEach(() => {
    vi.mocked(useAppContext).mockReturnValue({
      accessToken: 'tok-123',
      isOnline: true,
    } as ReturnType<typeof useAppContext>);
  });

  it('renders the "Line Items" view by default (not embedded)', () => {
    render(<TicSheet project={project} />);
    expect(screen.getByText('Line Items')).toBeInTheDocument();
  });

  it('renders existing line items', () => {
    render(<TicSheet project={project} />);
    expect(screen.getByText('Water extraction')).toBeInTheDocument();
    expect(screen.getByText('WTR-01')).toBeInTheDocument();
    // The total is displayed in a larger cyan span — use getAllByText and check at least one exists
    const totalEls = screen.getAllByText((_, el) =>
      !!el && el.tagName === 'SPAN' && (el.textContent ?? '').replace(/\s+/g, '') === '$400.00',
    );
    // Expect at least one (rate span + total span may both match)
    expect(totalEls.length).toBeGreaterThan(0);
  });

  it('shows the "AI Scope" button when not embedded', () => {
    render(<TicSheet project={project} />);
    expect(screen.getByText('AI Scope')).toBeInTheDocument();
  });

  it('disables the "AI Scope" button when offline', () => {
    vi.mocked(useAppContext).mockReturnValue({
      accessToken: '',
      isOnline: false,
    } as ReturnType<typeof useAppContext>);
    render(<TicSheet project={project} />);
    const aiBtn = screen.getByText('AI Scope').closest('button');
    expect(aiBtn).toBeDisabled();
  });

  it('switches to the report view when the report button is clicked', () => {
    render(<TicSheet project={project} />);
    // The IICRC Report toggle button (FileText icon button)
    const reportToggle = screen.getAllByRole('button').find(
      b => b.getAttribute('title') === 'IICRC Report',
    );
    fireEvent.click(reportToggle!);
    expect(screen.getByText('IICRC Report')).toBeInTheDocument();
  });

  it('shows the empty line items state for a project with no items', () => {
    const emptyProject: LossFile = { ...project, lineItems: [] };
    render(<TicSheet project={emptyProject} />);
    expect(screen.getByText(/No items documented/i)).toBeInTheDocument();
  });

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn();
    render(<TicSheet project={project} onBack={onBack} />);
    const backBtn = screen.getAllByRole('button')[0];
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledOnce();
  });
});
