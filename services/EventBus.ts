
export interface CloudEvent {
  specversion: "1.0";
  type: string; // e.g., "com.restorationai.project.created"
  source: string; // e.g., "/app/client/web"
  id: string;
  time: string;
  subject?: string;
  data: unknown;
  // Internal UI mapping (optional, for Toast notifications)
  ui?: {
      message: string;
      level: 'info' | 'success' | 'warning' | 'error';
  }
}

type Listener = (event: CloudEvent) => void;

class EventBusService {
    private listeners: Record<string, Listener[]> = {};

    /**
     * Subscribe to a specific CloudEvent type.
     * Use '*' to subscribe to all events.
     */
    on(eventType: string, fn: Listener) {
        if (!this.listeners[eventType]) this.listeners[eventType] = [];
        this.listeners[eventType].push(fn);
        return () => this.off(eventType, fn);
    }

    off(eventType: string, fn: Listener) {
        if (!this.listeners[eventType]) return;
        this.listeners[eventType] = this.listeners[eventType].filter(l => l !== fn);
    }

    /**
     * Publish a CloudEvent (Eventarc compliant structure).
     */
    publish(type: string, data: unknown, subject?: string, uiMessage?: string, uiLevel: 'info' | 'success' | 'warning' | 'error' = 'info') {
        const event: CloudEvent = {
            specversion: "1.0",
            type,
            source: "/app/client/restoration-ai-web",
            id: crypto.randomUUID(),
            time: new Date().toISOString(),
            subject,
            data,
            ui: uiMessage ? { message: uiMessage, level: uiLevel } : undefined
        };

        this.emit(event);
        
        // In a real production environment, this is where we would POST to Google Cloud Eventarc
        // fetch('https://eventarc-publish-endpoint...', { method: 'POST', body: JSON.stringify(event) ... })
        console.debug('[EventArc Bridge] Published:', event);
    }

    /**
     * Internal emit logic
     */
    private emit(event: CloudEvent) {
        setTimeout(() => {
            // 1. Notify listeners of specific type
            if (this.listeners[event.type]) {
                [...this.listeners[event.type]].forEach(fn => {
                    try { fn(event); } catch (err) { console.error('Error in EventBus listener:', err); }
                });
            }
            // 2. Notify wildcard listeners
            if (this.listeners['*']) {
                [...this.listeners['*']].forEach(fn => {
                    try { fn(event); } catch (err) { console.error('Error in wildcard EventBus listener:', err); }
                });
            }
        }, 0);
    }
}

export const EventBus = new EventBusService();
