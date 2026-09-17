// Type definitions to avoid import usage if it's unused
export const interpretTelemetry = (e: { type: string; ui?: { message?: string }; data?: Record<string, unknown> }): string => {
    // If it has an explicit UI message, use that.
    if (e.ui?.message) return e.ui.message;
    if (e.data && typeof e.data.message === 'string') return e.data.message;
    
    // Otherwise, interpret raw data code for the technician
    if (!e.data || Object.keys(e.data).length === 0) {
        return `System event processed: ${formatEventType(e.type)}`;
    }

    const payload = e.data as Record<string, unknown>; // Type override for flexible parsing
    
    // Interpret specific known event patterns
    if (e.type === 'com.restorationai.sync.revenue') {
        const count = Array.isArray(payload?.data) ? payload.data.length : 0;
        return `Financial metrics refreshed. (${count} trends tracked)`;
    }
    
    if (e.type === 'com.restorationai.sync.equipment') {
        return `Job-site equipment utilization synchronized.`;
    }
    
    if (e.type.includes('project.updated') || e.type.includes('loss.updated')) {
        const action = typeof payload.action === 'string' ? payload.action : 'Data revised';
        return `Project file synchronized: ${action}`;
    }

    if (e.type.includes('scan') && typeof payload.count === 'number') {
        return `AR Mapper localized ${payload.count} spatial points.`;
    }
    
    if (e.type.includes('scan.step')) {
        return `AR Processing: ${typeof payload.name === 'string' ? payload.name : `Phase ${payload.step}`}`;
    }

    if (e.type.includes('material')) {
        const materialName = (payload.material as Record<string, unknown>)?.name;
        return `Moisture readings logged for ${typeof materialName === 'string' ? materialName : 'materials'}.`;
    }

    if (e.type.includes('equipment.state')) {
         return `Equipment network state updated.`;
    }

    // Generic fallback for any other JSON data payload
    const keys = Object.keys(payload);
    if (keys.length > 0) {
        const sigKey = keys[0];
        const val = payload[sigKey];
        if (typeof val === 'string' || typeof val === 'number') {
            return `Device telemetry: ${sigKey} recorded as ${val}.`;
        }
        return `System update detected across: ${keys.slice(0, 3).join(', ')}.`;
    }

    return `Background telemetry synced for: ${formatEventType(e.type)}.`;
};

function formatEventType(type: string): string {
    if (!type) return 'System Event';
    const parts = type.split('.');
    return parts[parts.length - 1].replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, str => str.toUpperCase());
}
