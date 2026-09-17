import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Project, ComplianceCheck } from '../types';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({ text: 'AI suggestion text' }),
    },
  })),
}));

vi.mock('../services/EventBus', () => ({
  EventBus: { on: vi.fn(() => vi.fn()), publish: vi.fn() },
}));

// motion/react is used in ComplianceChecklist; stub it to avoid animation issues in jsdom
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, className, onClick }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} onClick={onClick}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import ComplianceChecklist from '../components/ComplianceChecklist';
import { useAppContext } from '../context/AppContext';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const checks: ComplianceCheck[] = [
  { id: 'c-1', text: 'Verify moisture barrier installed', isCompleted: false },
  { id: 'c-2', text: 'Confirm PPE used by all personnel', isCompleted: true },
];

const mockProject: Project = {
  id: 'p-1',
  companyId: 'c-1',
  client: 'Test Client',
  address: '1 Main St',
  status: 'Active',
  currentStage: 'Stabilize',
  progress: 40,
  riskLevel: 'high',
  rooms: [],
  milestones: [],
  tasks: [],
  lineItems: [],
  totalCost: 0,
  invoiceStatus: 'Draft',
  roomScans: [],
  videos: [],
  complianceChecks: {
    asbestos: 'not_tested',
    aiChecklist: checks,
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ComplianceChecklist', () => {
  const mockOnUpdate = vi.fn();

  beforeEach(() => {
    vi.mocked(useAppContext).mockReturnValue({
      isOnline: true,
      accessToken: 'tok-123',
    } as ReturnType<typeof useAppContext>);
    mockOnUpdate.mockClear();
  });

  it('renders the "Compliance Mastery" heading', () => {
    render(<ComplianceChecklist project={mockProject} onUpdate={mockOnUpdate} />);
    expect(screen.getByText(/Compliance Mastery/i)).toBeInTheDocument();
  });

  it('lists all checklist items', () => {
    render(<ComplianceChecklist project={mockProject} onUpdate={mockOnUpdate} />);
    expect(screen.getByText('Verify moisture barrier installed')).toBeInTheDocument();
    expect(screen.getByText('Confirm PPE used by all personnel')).toBeInTheDocument();
  });

  it('shows the asbestos status badge', () => {
    render(<ComplianceChecklist project={mockProject} onUpdate={mockOnUpdate} />);
    expect(screen.getByText(/Testing Required/i)).toBeInTheDocument();
  });

  it('shows "clear" asbestos status badge when asbestos is clear', () => {
    const clearedProject: Project = {
      ...mockProject,
      complianceChecks: { ...mockProject.complianceChecks!, asbestos: 'clear' },
    };
    render(<ComplianceChecklist project={clearedProject} onUpdate={mockOnUpdate} />);
    expect(screen.getByText(/No Asbestos Detected/i)).toBeInTheDocument();
  });

  it('calls onUpdate when a checklist item is toggled', () => {
    render(<ComplianceChecklist project={mockProject} onUpdate={mockOnUpdate} />);
    fireEvent.click(screen.getByText('Verify moisture barrier installed'));
    expect(mockOnUpdate).toHaveBeenCalledOnce();
    const updatedChecks: ComplianceCheck[] =
      mockOnUpdate.mock.calls[0][0].complianceChecks.aiChecklist;
    expect(updatedChecks.find(c => c.id === 'c-1')!.isCompleted).toBe(true);
  });

  it('disables the AI suggestion button when offline', () => {
    vi.mocked(useAppContext).mockReturnValue({
      isOnline: false,
      accessToken: '',
    } as ReturnType<typeof useAppContext>);
    render(<ComplianceChecklist project={mockProject} onUpdate={mockOnUpdate} />);
    // All AI-suggestion buttons should be disabled
    const aiButtons = screen.getAllByTitle(/Get AI Suggestion/i);
    aiButtons.forEach(btn => expect(btn).toBeDisabled());
  });
});
