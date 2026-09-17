import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Project, AITask } from '../types';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

vi.mock('../services/AIRouterClient', () => ({
  AIRouterClient: vi.fn().mockImplementation(() => ({
    generateTasks: vi.fn().mockResolvedValue({ text: '[]' }),
  })),
}));

vi.mock('../components/TaskDetailView', () => ({
  default: ({ task, onBack }: { task: AITask; onBack: () => void }) => (
    <div>
      <span>Detail: {task.text}</span>
      <button onClick={onBack}>Back</button>
    </div>
  ),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import TaskManager from '../components/TaskManager';
import { useAppContext } from '../context/AppContext';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const sampleTasks: AITask[] = [
  { id: 't-1', text: 'Set up dehumidifiers', isCompleted: false, subtasks: [] },
  { id: 't-2', text: 'Document moisture readings', isCompleted: true, subtasks: [] },
];

const mockProject: Project = {
  id: 'p-1',
  companyId: 'c-1',
  client: 'Test Client',
  address: '1 Main St',
  status: 'Active',
  currentStage: 'Monitor',
  progress: 50,
  riskLevel: 'medium',
  rooms: [],
  milestones: [],
  tasks: sampleTasks,
  lineItems: [],
  totalCost: 0,
  invoiceStatus: 'Draft',
  roomScans: [],
  videos: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TaskManager', () => {
  const mockOnUpdate = vi.fn();

  beforeEach(() => {
    vi.mocked(useAppContext).mockReturnValue({
      isOnline: true,
    } as ReturnType<typeof useAppContext>);
    mockOnUpdate.mockClear();
  });

  it('renders the "Project Tasks" heading', () => {
    render(<TaskManager project={mockProject} onUpdate={mockOnUpdate} />);
    expect(screen.getByText(/Project Tasks/i)).toBeInTheDocument();
  });

  it('lists all tasks from the project', () => {
    render(<TaskManager project={mockProject} onUpdate={mockOnUpdate} />);
    expect(screen.getByText('Set up dehumidifiers')).toBeInTheDocument();
    expect(screen.getByText('Document moisture readings')).toBeInTheDocument();
  });

  it('shows an empty state when no tasks exist', () => {
    const emptyProject = { ...mockProject, tasks: [] };
    render(<TaskManager project={emptyProject} onUpdate={mockOnUpdate} />);
    expect(screen.getByText(/No tasks created yet/i)).toBeInTheDocument();
  });

  it('adds a new task when text is entered and Enter is pressed', () => {
    render(<TaskManager project={mockProject} onUpdate={mockOnUpdate} />);
    const input = screen.getByPlaceholderText(/Create a new task/i);
    fireEvent.change(input, { target: { value: 'New moisture check' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockOnUpdate).toHaveBeenCalledOnce();
    const updatedTasks: AITask[] = mockOnUpdate.mock.calls[0][0].tasks;
    expect(updatedTasks.some(t => t.text === 'New moisture check')).toBe(true);
  });

  it('does not add a task if the input is empty', () => {
    render(<TaskManager project={mockProject} onUpdate={mockOnUpdate} />);
    const addBtn = screen.getAllByRole('button').find(b => b.querySelector('svg'));
    fireEvent.click(addBtn!);
    expect(mockOnUpdate).not.toHaveBeenCalled();
  });

  it('opens the TaskDetailView when a task row is clicked', () => {
    render(<TaskManager project={mockProject} onUpdate={mockOnUpdate} />);
    fireEvent.click(screen.getByText('Set up dehumidifiers'));
    expect(screen.getByText(/Detail: Set up dehumidifiers/i)).toBeInTheDocument();
  });

  it('returns to the task list when the back button in TaskDetailView is pressed', () => {
    render(<TaskManager project={mockProject} onUpdate={mockOnUpdate} />);
    fireEvent.click(screen.getByText('Set up dehumidifiers'));
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByText(/Project Tasks/i)).toBeInTheDocument();
  });

  it('calls onUpdate when a task completion is toggled', () => {
    render(<TaskManager project={mockProject} onUpdate={mockOnUpdate} />);
    // The first task row has a Circle (incomplete) icon — click it to toggle
    const completionButtons = screen.getAllByRole('button').filter(
      b => b.className.includes('rounded-md'),
    );
    fireEvent.click(completionButtons[0]);
    expect(mockOnUpdate).toHaveBeenCalledOnce();
    const updated: AITask[] = mockOnUpdate.mock.calls[0][0].tasks;
    expect(updated.find(t => t.id === 't-1')!.isCompleted).toBe(true);
  });
});
