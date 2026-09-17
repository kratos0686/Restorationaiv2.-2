import { EventBus } from './EventBus';
import { Project } from '../types';

export class ComplianceMonitor {
    private static intervalId: ReturnType<typeof setInterval> | null = null;
    private static isRunning = false;
    private static projectsRef: Project[] = [];

    static updateProjects(projects: Project[]) {
        this.projectsRef = projects;
    }

    static start(intervalMs: number = 60000) {
        if (this.isRunning) return;
        this.isRunning = true;

        this.intervalId = setInterval(() => {
            this.checkCompliance();
        }, intervalMs);
    }

    static checkCompliance() {
        if (!this.projectsRef) return;
        
        for (const p of this.projectsRef) {
            const statusLower = p.status ? p.status.toLowerCase() : '';
            const isDryingActive = statusLower.includes('active') || statusLower.includes('drying') || p.currentStage === 'Monitor' || p.currentStage === 'Stabilize';
            
            if (isDryingActive) {
                const violations = [];

                // 1. Existing basic SLA checks: Missing logs & Asbestos
                const hasRecentLog = p.dailyNarratives && p.dailyNarratives.length > 0;
                if (!hasRecentLog) {
                    violations.push('Missing Daily Log (>24h)');
                }
                
                if (p.complianceChecks?.asbestos === 'pending') {
                    violations.push('Asbestos Results Pending - Work stop may be required');
                } else if (p.complianceChecks?.asbestos === 'not_tested') {
                    violations.push('Asbestos not tested on active job');
                }

                // 2. IICRC S500: Air Mover Sizing Check
                let recomAirMovers = 0;
                let activeWetSqFt = 0;
                
                if (p.rooms && p.rooms.length > 0) {
                    for (const room of p.rooms) {
                        const isRoomWet = room.status === 'wet' || room.status === 'drying';
                        if (isRoomWet && room.dimensions) {
                            const { length = 0, width = 0 } = room.dimensions;
                            const sqft = length * width;
                            if (sqft > 0) {
                                activeWetSqFt += sqft;
                                // S500 Air Mover Formula: 1 base per room + 1 per 50-70 sq ft of wet floor
                                recomAirMovers += 1 + Math.ceil(sqft / 60);
                            }
                        }
                    }
                }

                const deployedAirMovers = p.equipment?.filter(e => e.type === 'Air Mover' && e.status === 'Running').length || 0;
                if (recomAirMovers > 0 && deployedAirMovers < recomAirMovers) {
                    const diff = recomAirMovers - deployedAirMovers;
                    violations.push(`Under-equipped with Air Movers: S500 recommends at least ${recomAirMovers} Air Movers for affected rooms, but only ${deployedAirMovers} are running (deficit of ${diff}).`);
                    
                    EventBus.publish(
                        'com.restorationai.compliance.air_movers',
                        { projectId: p.id, client: p.client, recomAirMovers, deployedAirMovers },
                        p.id,
                        `${p.client}: Air Mover deficit! S500 standard expects ${recomAirMovers}, only ${deployedAirMovers} running.`,
                        'warning'
                    );
                }

                // 3. IICRC S500: Dehumidification Capacity & Sizing Check
                let recomDehus = 0;
                if (activeWetSqFt > 0) {
                    const lossClassStr = p.lossClass || 'Class 2';
                    if (lossClassStr.includes('Class 1')) {
                        recomDehus = Math.max(1, Math.ceil(activeWetSqFt / 1000));
                    } else if (lossClassStr.includes('Class 3')) {
                        recomDehus = Math.max(1, Math.ceil(activeWetSqFt / 500));
                    } else if (lossClassStr.includes('Class 4')) {
                        recomDehus = Math.max(1, Math.ceil(activeWetSqFt / 400));
                    } else { // Class 2 or default
                        recomDehus = Math.max(1, Math.ceil(activeWetSqFt / 700));
                    }
                }

                const deployedDehus = p.equipment?.filter(e => e.type === 'Dehumidifier' && e.status === 'Running').length || 0;
                if (recomDehus > 0 && deployedDehus < recomDehus) {
                    const diff = recomDehus - deployedDehus;
                    violations.push(`Inadequate Dehumidification: S500 expects at least ${recomDehus} Dehus for current ${p.lossClass || 'Class 2'} loss, but only ${deployedDehus} are functioning (deficit of ${diff}).`);
                    
                    EventBus.publish(
                        'com.restorationai.compliance.dehumidifiers',
                        { projectId: p.id, client: p.client, recomDehus, deployedDehus },
                        p.id,
                        `${p.client}: Dehu deficit! S500 recommends at least ${recomDehus} dehu(s), only ${deployedDehus} active.`,
                        'warning'
                    );
                }

                // 4. IICRC S500: Relative Humidity (RH) Stagnation Check
                if (p.rooms) {
                    for (const r of p.rooms) {
                        if ((r.status === 'wet' || r.status === 'drying') && r.readings && r.readings.length >= 2) {
                            const sortedReadings = [...r.readings].sort((a,b) => a.timestamp - b.timestamp);
                            const latestReading = sortedReadings[sortedReadings.length - 1];
                            const prevReading = sortedReadings[sortedReadings.length - 2];
                            
                            if (latestReading.rh > 60 && latestReading.rh >= prevReading.rh) {
                                violations.push(`RH Stagnation inside ${r.name}: Humidity is elevated at ${latestReading.rh}% and failed to drop, signaling substandard drying conditions.`);
                                
                                EventBus.publish(
                                    'com.restorationai.compliance.psychrometrics',
                                    { projectId: p.id, roomName: r.name, rh: latestReading.rh },
                                    p.id,
                                    `Psychrometric Warning (${r.name}): High RH ${latestReading.rh}% is stagnant (S500 limit: 60%).`,
                                    'warning'
                                );
                            }
                        }
                    }
                }

                // 5. IICRC S500: Moisture Content (MC) Stagnation Check
                if (p.dryingMonitor) {
                    for (const m of p.dryingMonitor) {
                        if (m.status === 'Wet' && m.readings && m.readings.length >= 2) {
                            const sortedReadings = [...m.readings].sort((a,b) => a.timestamp - b.timestamp);
                            const latestReading = sortedReadings[sortedReadings.length - 1];
                            const prevReading = sortedReadings[sortedReadings.length - 2];
                            
                            if (latestReading.value >= prevReading.value && latestReading.value > m.dryGoal) {
                                violations.push(`MC Stagnation: Material "${m.name}" in "${m.location}" has halted progress at ${latestReading.value}% (goal: ${m.dryGoal}%).`);
                                
                                EventBus.publish(
                                    'com.restorationai.compliance.material_stagnation',
                                    { projectId: p.id, materialName: m.name, value: latestReading.value },
                                    p.id,
                                    `Material Stagnation: "${m.name}" under drying is stagnated at ${latestReading.value}%.`,
                                    'warning'
                                );
                            }
                        }
                    }
                }

                // 6. IICRC S500: Category 3 gross contamination violation check
                const isCategory3 = p.waterCategory?.includes('3') || p.waterCategory?.toLowerCase().includes('cat_3') || p.waterCategory?.toLowerCase().includes('contaminated') || false;
                if (isCategory3) {
                    const hasActiveAirMovers = p.equipment?.some(e => e.type === 'Air Mover' && e.status === 'Running');
                    const hasActiveHEPAScrubbers = p.equipment?.some(e => e.type === 'HEPA Scrubber' && e.status === 'Running');
                    
                    if (hasActiveAirMovers && !hasActiveHEPAScrubbers) {
                        violations.push('S500 Safety Violation: Running air movers in Category 3 Sewage/Flood loss without HEPA Air Scrubbers, high aerosol pathogen hazard.');
                        
                        EventBus.publish(
                            'com.restorationai.compliance.biohazard',
                            { projectId: p.id, client: p.client },
                            p.id,
                            `BIOHAZARD SANITATION RISK: CAT-3 Air Movers active without HEPA Air Scrubbers!`,
                            'error'
                        );
                    }
                }

                // Core notification for visual logging
                if (violations.length > 0) {
                    EventBus.publish(
                        'com.restorationai.compliance.violation',
                        { projectId: p.id, client: p.client, violations },
                        p.id,
                        `Compliance Warning for ${p.client}: S500 deviations detected.`,
                        'error'
                    );
                }
            }
        }
    }

    static stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
    }
}
