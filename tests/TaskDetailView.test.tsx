import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AITask } from '../types';
import TaskDetailView from '../components/TaskDetailView';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseTask: AITask = {
  id: 't-1',
  text: 'Inspect moisture barrier',
  isCompleted: false,
  priority: 'medium',
  subtasks: [
    { id: 'st-1', text: 'Check north wall', isCompleted: false },
    { id: 'st-2', text: 'Check south wall', isCompleted: true },
  ],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TaskDetailView', () => {
  const mockOnUpdate = vi.fn();
  const mockOnBack = vi.fn();

  beforeEach(() => {
    mockOnUpdate.mockClear();
    mockOnBack.mockClear();
  });

  it('renders the task title in the header', () => {
    render(<TaskDetailView task={baseTask} onUpdate={mockOnUpdate} onBack={mockOnBack} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Inspect moisture barrier');
  });

  it('calls onBack when the back button is clicked', () => {
    render(<TaskDetailView task={baseTask} onUpdate={mockOnUpdate} onBack={mockOnBack} />);
    const backBtn = screen.getAllByRole('button')[0];
    fireEvent.click(backBtn);
    expect(mockOnBack).toHaveBeenCalledOnce();
  });

  it('renders all subtasks', () => {
    render(<TaskDetailView task={baseTask} onUpdate={mockOnUpdate} onBack={mockOnBack} />);
    expect(screen.getByDisplayValue('Check north wall')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Check south wall')).toBeInTheDocument();
  });

  it('calls onUpdate when a priority button is clicked', () => {
    render(<TaskDetailView task={baseTask} onUpdate={mockOnUpdate} onBack={mockOnBack} />);
    fireEvent.click(screen.getByRole('button', { name: /high/i }));
    expect(mockOnUpdate).toHaveBeenCalledWith(expect.objectContaining({ priority: 'high' }));
  });

  it('calls onUpdate when the due date input changes', () => {
    render(<TaskDetailView task={baseTask} onUpdate={mockOnUpdate} onBack={mockOnBack} />);
    // The date input has type="date" — query it explicitly
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-06-01' } });
    expect(mockOnUpdate).toHaveBeenCalledWith(expect.objectContaining({ dueDate: '2026-06-01' }));
  });

  it('adds a subtask when text is entered and Enter is pressed', () => {
    render(<TaskDetailView task={baseTask} onUpdate={mockOnUpdate} onBack={mockOnBack} />);
    const input = screen.getByPlaceholderText(/Add a subtask/i);
    fireEvent.change(input, { target: { value: 'New sub' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const updatedSubtasks: AITask['subtasks'] = mockOnUpdate.mock.calls[0][0].subtasks;
    expect(updatedSubtasks?.some(st => st.text === 'New sub')).toBe(true);
  });

  it('toggles a subtask completion when its button is clicked', () => {
    render(<TaskDetailView task={baseTask} onUpdate={mockOnUpdate} onBack={mockOnBack} />);
    // First subtask toggle button (index 0 among subtask buttons)
    const toggleBtns = screen.getAllByRole('button').filter(
      b => b.className.includes('rounded-md'),
    );
    fireEvent.click(toggleBtns[0]);
    const updated: AITask = mockOnUpdate.mock.calls[0][0];
    expect(updated.subtasks?.find(s => s.id === 'st-1')?.isCompleted).toBe(true);
  });

  it('shows the "Add" button when subtask input has text', () => {
    render(<TaskDetailView task={baseTask} onUpdate={mockOnUpdate} onBack={mockOnBack} />);
    const input = screen.getByPlaceholderText(/Add a subtask/i);
    fireEvent.change(input, { target: { value: 'Something' } });
    expect(screen.getByRole('button', { name: /Add/i })).toBeInTheDocument();
  });
});
