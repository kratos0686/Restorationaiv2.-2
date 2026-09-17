import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Project } from '../types';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

vi.mock('../services/api', () => ({
  getProjectById: vi.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import Billing from '../components/Billing';
import { useAppContext } from '../context/AppContext';
import { getProjectById } from '../services/api';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const project: Project = {
  id: 'p-1',
  companyId: 'c-1',
  client: 'Jane Smith',
  address: '99 Oak Ave',
  status: 'Active',
  currentStage: 'Scope',
  progress: 30,
  riskLevel: 'low',
  rooms: [],
  milestones: [],
  tasks: [],
  lineItems: [
    { id: 'li-1', description: 'Water extraction', quantity: 1, rate: 500, total: 500 },
    { id: 'li-2', description: 'Dehumidifier rental', quantity: 3, rate: 100, total: 300 },
  ],
  totalCost: 800,
  invoiceStatus: 'Draft',
  roomScans: [],
  videos: [],
  insurance: 'State Farm',
  policyNumber: 'SF-001',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Billing', () => {
  beforeEach(() => {
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  });

  it('shows "select a project" prompt when no project is selected', async () => {
    vi.mocked(useAppContext).mockReturnValue({
      selectedProjectId: null,
      hasPermission: () => true,
    } as ReturnType<typeof useAppContext>);
    vi.mocked(getProjectById).mockResolvedValue(null);

    render(<Billing />);
    await waitFor(() =>
      expect(screen.getByText(/Billing & Invoicing/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/select a project/i)).toBeInTheDocument();
  });

  it('renders billing header with project info', async () => {
    vi.mocked(useAppContext).mockReturnValue({
      selectedProjectId: 'p-1',
      hasPermission: () => true,
    } as ReturnType<typeof useAppContext>);
    vi.mocked(getProjectById).mockResolvedValue(project);

    render(<Billing />);
    await waitFor(() =>
      expect(screen.getByText(/Billing for Project p-1/i)).toBeInTheDocument(),
    );
    // Client name appears in the sub-header (address line)
    expect(screen.getByText(/Jane Smith - 99 Oak Ave/)).toBeInTheDocument();
  });

  it('renders all line items', async () => {
    vi.mocked(useAppContext).mockReturnValue({
      selectedProjectId: 'p-1',
      hasPermission: () => true,
    } as ReturnType<typeof useAppContext>);
    vi.mocked(getProjectById).mockResolvedValue(project);

    render(<Billing />);
    await waitFor(() =>
      expect(screen.getByDisplayValue('Water extraction')).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue('Dehumidifier rental')).toBeInTheDocument();
  });

  it('shows the correct total amount', async () => {
    vi.mocked(useAppContext).mockReturnValue({
      selectedProjectId: 'p-1',
      hasPermission: () => true,
    } as ReturnType<typeof useAppContext>);
    vi.mocked(getProjectById).mockResolvedValue(project);

    render(<Billing />);
    await waitFor(() => expect(screen.getByText('$800.00')).toBeInTheDocument());
  });

  it('adds a new blank line item when "Add Line Item" is clicked', async () => {
    vi.mocked(useAppContext).mockReturnValue({
      selectedProjectId: 'p-1',
      hasPermission: () => true,
    } as ReturnType<typeof useAppContext>);
    vi.mocked(getProjectById).mockResolvedValue(project);

    render(<Billing />);
    await waitFor(() => expect(screen.getByText('Add Line Item')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Add Line Item'));
    // Should now have 3 description inputs
    await waitFor(() => {
      const inputs = screen.getAllByPlaceholderText('Service Description');
      expect(inputs).toHaveLength(3);
    });
  });

  it('calls alert when "Send Invoice" button is clicked', async () => {
    vi.mocked(useAppContext).mockReturnValue({
      selectedProjectId: 'p-1',
      hasPermission: () => true,
    } as ReturnType<typeof useAppContext>);
    vi.mocked(getProjectById).mockResolvedValue(project);

    render(<Billing />);
    await waitFor(() => expect(screen.getByText(/Send Invoice/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Send Invoice/i));
    expect(window.alert).toHaveBeenCalled();
  });

  it('calls alert when "Export to Xactimate" button is clicked', async () => {
    vi.mocked(useAppContext).mockReturnValue({
      selectedProjectId: 'p-1',
      hasPermission: () => true,
    } as ReturnType<typeof useAppContext>);
    vi.mocked(getProjectById).mockResolvedValue(project);

    render(<Billing />);
    await waitFor(() =>
      expect(screen.getByText('Export to Xactimate')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('Export to Xactimate'));
    expect(window.alert).toHaveBeenCalled();
  });

  it('switches the Bill To target when a different button is clicked', async () => {
    vi.mocked(useAppContext).mockReturnValue({
      selectedProjectId: 'p-1',
      hasPermission: () => true,
    } as ReturnType<typeof useAppContext>);
    vi.mocked(getProjectById).mockResolvedValue(project);

    render(<Billing />);
    // Wait for the bill-to button with client name to appear
    const homeownerBtn = await screen.findByRole('button', { name: /Jane Smith/i });
    fireEvent.click(homeownerBtn);
    // Send button now says "Send Invoice to Homeowner"
    expect(screen.getByText(/Send Invoice to Homeowner/i)).toBeInTheDocument();
  });
});
