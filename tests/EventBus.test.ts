import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../services/EventBus';

// ─── Helper ───────────────────────────────────────────────────────────────────
const clearBus = () => {
  (EventBus as unknown as { listeners: Record<string, unknown[]> }).listeners = {};
};

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('EventBus', () => {
  beforeEach(() => {
    clearBus();
    vi.useFakeTimers();
  });

  it('calls a specific type listener when a matching event is published', () => {
    const listener = vi.fn();
    EventBus.on('com.test.event', listener);
    EventBus.publish('com.test.event', { data: 42 });
    vi.runAllTimers();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].type).toBe('com.test.event');
  });

  it('does NOT call a listener for a different event type', () => {
    const listener = vi.fn();
    EventBus.on('com.test.event', listener);
    EventBus.publish('com.other.event', { data: 42 });
    vi.runAllTimers();
    expect(listener).not.toHaveBeenCalled();
  });

  it('calls a wildcard (*) listener for every published event', () => {
    const wildcard = vi.fn();
    EventBus.on('*', wildcard);
    EventBus.publish('com.test.alpha', {});
    EventBus.publish('com.test.beta', {});
    vi.runAllTimers();
    expect(wildcard).toHaveBeenCalledTimes(2);
  });

  it('returns an unsubscribe function that stops future deliveries', () => {
    const listener = vi.fn();
    const unsub = EventBus.on('com.test.event', listener);
    EventBus.publish('com.test.event', {});
    vi.runAllTimers();
    expect(listener).toHaveBeenCalledOnce();
    unsub();
    EventBus.publish('com.test.event', {});
    vi.runAllTimers();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('publishes a CloudEvent with specversion "1.0"', () => {
    const listener = vi.fn();
    EventBus.on('com.test.event', listener);
    EventBus.publish('com.test.event', { foo: 'bar' });
    vi.runAllTimers();
    expect(listener.mock.calls[0][0].specversion).toBe('1.0');
  });

  it('includes the subject in the published event when provided', () => {
    const listener = vi.fn();
    EventBus.on('com.test.event', listener);
    EventBus.publish('com.test.event', {}, 'subject-123');
    vi.runAllTimers();
    expect(listener.mock.calls[0][0].subject).toBe('subject-123');
  });

  it('includes a ui payload when uiMessage is provided', () => {
    const listener = vi.fn();
    EventBus.on('com.test.event', listener);
    EventBus.publish('com.test.event', {}, undefined, 'Toast message', 'success');
    vi.runAllTimers();
    const event = listener.mock.calls[0][0];
    expect(event.ui).toBeDefined();
    expect(event.ui.message).toBe('Toast message');
    expect(event.ui.level).toBe('success');
  });

  it('omits the ui field when no uiMessage is given', () => {
    const listener = vi.fn();
    EventBus.on('com.test.event', listener);
    EventBus.publish('com.test.event', {});
    vi.runAllTimers();
    expect(listener.mock.calls[0][0].ui).toBeUndefined();
  });

  it('assigns a unique id to each event', () => {
    const ids: string[] = [];
    EventBus.on('com.test.event', (e) => ids.push(e.id));
    EventBus.publish('com.test.event', {});
    EventBus.publish('com.test.event', {});
    vi.runAllTimers();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('supports multiple listeners for the same event type', () => {
    const a = vi.fn();
    const b = vi.fn();
    EventBus.on('com.test.event', a);
    EventBus.on('com.test.event', b);
    EventBus.publish('com.test.event', {});
    vi.runAllTimers();
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });
});
