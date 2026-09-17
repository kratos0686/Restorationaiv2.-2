import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// --- Stub Components ---
// Minimal stubs that use a data-testid so we can verify they render.
vi.mock('../components/DesktopDashboard', () => ({
  default: () => <div data-testid="DesktopDashboard">DesktopDashboard</div>
}));
vi.mock('../components/ProjectDetails', () => ({
  default: () => <div data-testid="ProjectDetails">ProjectDetails</div>
}));
vi.mock('../components/ARScanner', () => ({
  default: () => <div data-testid="ARScanner">ARScanner</div>
}));
vi.mock('../components/WalkthroughViewer', () => ({
  default: () => <div data-testid="WalkthroughViewer">WalkthroughViewer</div>
}));
vi.mock('../components/FloorplanViewer', () => ({
  default: () => <div data-testid="FloorplanViewer">FloorplanViewer</div>
}));
vi.mock('../components/DryingLogs', () => ({
  default: () => <div data-testid="DryingLogs">DryingLogs</div>
}));
vi.mock('../components/SmartDocumentation', () => ({
  default: () => <div data-testid="SmartDocumentation">SmartDocumentation</div>
}));
vi.mock('../components/PhotoDocumentation', () => ({
  default: () => <div data-testid="PhotoDocumentation">PhotoDocumentation</div>
}));
vi.mock('../components/PredictiveAnalysis', () => ({
  default: () => <div data-testid="PredictiveAnalysis">PredictiveAnalysis</div>
}));
vi.mock('../components/Billing', () => ({
  default: () => <div data-testid="Billing">Billing</div>
}));
vi.mock('../components/Reporting', () => ({
  default: () => <div data-testid="Reporting">Reporting</div>
}));
vi.mock('../components/AdminPanel', () => ({
  default: () => <div data-testid="AdminPanel">AdminPanel</div>
}));
vi.mock('../components/ARMapping', () => ({
  default: () => <div data-testid="ARMapping">ARMapping</div>
}));
vi.mock('../components/TaskManager', () => ({
  default: () => <div data-testid="TaskManager">TaskManager</div>
}));
vi.mock('../components/CommandCenter', () => ({
  default: ({ isOpen, onClose }: any) => isOpen ? <div data-testid="CommandCenter"><button onClick={onClose}>Close</button></div> : null
}));
vi.mock('../components/EventToast', () => ({
  default: () => <div data-testid="EventToast">EventToast</div>
}));
vi.mock('../components/LaunchScreen', () => ({
  default: () => <div data-testid="LaunchScreen">LaunchScreen</div>
}));

// --- Context Mock ---
import { useAppContext } from '../context/AppContext';
import DesktopApp from '../components/DesktopApp';
import { Project } from '../types';

vi.mock('../context/AppContext', () => ({
  useAppContext: vi.fn(),
  hasPermission: vi.fn()
}));

const mockProject: Project = {
  id: 'p1',
  companyId: 'c1',
  name: 'Test Project',
  status: 'active',
  stage: 'Monitor',
  address: { street: '123 Main', city: 'City', state: 'ST', zip: '12345' },
  customer: { name: 'Bob', phone: '555', email: 'bob@example.com' },
  createdAt: '2023-01-01',
  updatedAt: '2023-01-01',
  metrics: { areaSqFt: 1000 },
  rooms: [],
  logs: [],
  equipment: [],
  photos: [],
  materials: []
};

const makeCtx = (overrides = {}) => ({
  activeTab: 'dashboard',
  setActiveTab: vi.fn(),
  selectedProjectId: null,
  setSelectedProjectId: vi.fn(),
  projects: [mockProject],
  isAuthenticated: true,
  currentUser: { id: 'u1', name: 'User', role: 'SuperAdmin', permissions: ['view_admin', 'view_billing'] },
  isOnline: true,
  logout: vi.fn(),
  hasPermission: () => true, // Default to having all permissions
  isSearchOpen: false,
  setIsSearchOpen: vi.fn(),
  ...overrides
});

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('DesktopApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  
  // ── Tab Rendering ────────────────────────────────────────────────────────────
  it('renders DesktopDashboard when activeTab is dashboard', () => {
    vi.mocked(useAppContext).mockReturnValue(makeCtx({ activeTab: 'dashboard' }) as ReturnType<typeof useAppContext>);
    render(<DesktopApp />);
    expect(screen.getByTestId('DesktopDashboard')).toBeInTheDocument();
  });

  

  it('falls back to Dashboard when activeTab requires a selected project but none is selected', () => {
    // For example, 'drying-logs' requires selectedProjectId.
    vi.mocked(useAppContext).mockReturnValue(makeCtx({ activeTab: 'drying-logs', selectedProjectId: null }) as ReturnType<typeof useAppContext>);
    render(<DesktopApp />);
    expect(screen.getByTestId('DesktopDashboard')).toBeInTheDocument();
  });

  // ── Navigation Clicks ────────────────────────────────────────────────────────
  it('calls setActiveTab("dashboard") when Dashboard nav button is clicked', async () => {
    const ctx = makeCtx();
    vi.mocked(useAppContext).mockReturnValue(ctx as ReturnType<typeof useAppContext>);
    render(<DesktopApp />);
    // There are multiple "Dashboard" texts (mobile menu + desktop), grab the first
    fireEvent.click((await screen.findAllByText('Dashboard'))[0]);
    expect(ctx.setActiveTab).toHaveBeenCalledWith('dashboard');
  });

  // ── Permission-gated nav items ───────────────────────────────────────────────
  it('hides Jobs / Billing when permissions are denied', async () => {
    const ctx = makeCtx({
      hasPermission: (p: string) => p !== 'view_billing' // Deny billing
    });
    vi.mocked(useAppContext).mockReturnValue(ctx as ReturnType<typeof useAppContext>);
    render(<DesktopApp />);
    
    // Billing should not be in the document
    expect(screen.queryByText('Billing')).not.toBeInTheDocument();
  });

  it('hides System / Admin when permissions are denied', async () => {
    const ctx = makeCtx({
      hasPermission: (p: string) => p !== 'view_admin' // Deny admin
    });
    vi.mocked(useAppContext).mockReturnValue(ctx as ReturnType<typeof useAppContext>);
    render(<DesktopApp />);
    
    // Admin Settings should not be in the document
    expect(screen.queryByText('Admin Settings')).not.toBeInTheDocument();
  });
});
