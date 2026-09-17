import { EventBus } from './EventBus';

export class DashboardSyncService {
    private static intervalId: ReturnType<typeof setInterval> | null = null;
    private static isRunning = false;

    static start(intervalMs: number = 3000) {
        if (this.isRunning) return;
        this.isRunning = true;

        this.intervalId = setInterval(() => {
            // Mock backend sync for revenue
            const rawRev = 120450 + Math.random() * 50000;
            const revenueTrend = [
                { name: 'Aug', revenue: Math.round(rawRev * 0.8) },
                { name: 'Sep', revenue: Math.round(rawRev * 1.2) },
                { name: 'Oct', revenue: Math.round(rawRev * 1.05) },
                { name: 'Nov', revenue: Math.round(rawRev * 1.4) },
                { name: 'Dec (Proj.)', revenue: Math.round(rawRev * 1.6) },
            ];

            // Mock backend sync for equipment utilization
            const equipmentUtilization = [
                { type: 'Air Mover', deployed: Math.floor(Math.random() * 100) + 50, total: 150 },
                { type: 'Dehumidifier', deployed: Math.floor(Math.random() * 30) + 15, total: 45 },
                { type: 'HEPA Scrubber', deployed: Math.floor(Math.random() * 10) + 5, total: 15 },
                { type: 'Heater', deployed: Math.floor(Math.random() * 5) + 2, total: 10 }
            ].map(eq => ({...eq, utilization: Math.round((eq.deployed / eq.total) * 100)}));

            // Publish events as if received from backend
            EventBus.publish('com.restorationai.sync.revenue', { data: revenueTrend });
            EventBus.publish('com.restorationai.sync.equipment', { data: equipmentUtilization });
            
        }, intervalMs);
    }

    static stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
    }
}
