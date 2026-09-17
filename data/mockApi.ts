
import { 
  Project, 
  WaterCategory, 
  LossClass,
  User,
  Company,
  RoomScan,
  ProjectStage
} from '../types';

// --- Multi-Tenancy Mock Data ---

export const COMPANIES: Company[] = [
  { id: 'COMP-001', name: 'Elite Restoration Services', subscriptionPlan: 'Enterprise', maxUsers: 50, isActive: true },
  { id: 'COMP-002', name: 'DryRight Solutions', subscriptionPlan: 'Pro', maxUsers: 10, isActive: true },
];

export const USERS: User[] = [
  { 
    id: 'U-001', 
    email: 'admin@elite.com', 
    name: 'Elite Admin', 
    role: 'CompanyAdmin', 
    companyId: 'COMP-001',
    permissions: ['manage_users', 'view_billing', 'manage_billing', 'view_projects', 'edit_projects', 'view_admin', 'use_ai_tools'] 
  },
  { 
    id: 'U-002', 
    email: 'tech@elite.com', 
    name: 'Elite Tech', 
    role: 'Technician', 
    companyId: 'COMP-001',
    permissions: ['view_projects', 'edit_projects', 'use_ai_tools'] 
  },
  { 
    id: 'U-003', 
    email: 'owner@mitigation.ai', 
    name: 'App Owner', 
    role: 'SuperAdmin', 
    companyId: 'SYSTEM',
    permissions: ['manage_company', 'view_admin'] 
  },
  {
    id: 'U-004',
    email: 'admin@dryright.com',
    name: 'DryRight Admin',
    role: 'CompanyAdmin', 
    companyId: 'COMP-002',
    permissions: ['manage_users', 'view_billing', 'manage_billing', 'view_projects', 'edit_projects', 'view_admin']
  }
];

// --- Seed Data (Initial State) ---
const seedProjects: Project[] = [
  { 
    id: 'P-1001', 
    companyId: 'COMP-001', // Belongs to Elite Restoration
    client: 'Sarah Johnson', 
    clientEmail: 's.johnson@example.com',
    clientPhone: '555-123-4567',
    address: '124 Maple Ave', 
    status: 'Active', 
    currentStage: 'Monitor', // Workflow Step
    progress: 65, 
    estimate: 'Oct 16', 
    logs: "GPP trending down steadily.",
    insurance: "State Farm",
    policyNumber: 'SF-987654321',
    adjuster: 'Tom Brown',
    claimNumber: 'CLM-778899',
    startDate: "Oct 12, 2023",
    summary: 'Class 3 Water Loss. Overhead pipe burst affecting kitchen and living room.',
    riskLevel: 'high',
    waterCategory: WaterCategory.CAT_3,
    lossClass: LossClass.CLASS_3,
    budget: 15000,
    assignedTeam: ['Mike R.', 'Jessica P.'],
    equipment: [
      { id: 'AM-4022', type: 'Air Mover', model: 'Phoenix AirMax', status: 'Running', hours: 42.5, room: 'Living Room' },
      { id: 'DH-1102', type: 'Dehumidifier', model: 'LGR 3500i', status: 'Running', hours: 42.5, room: 'Living Room' },
    ],
    rooms: [
      {
        id: 'r1', name: 'Living Room', status: 'drying',
        dimensions: { length: 15.2, width: 20.1, height: 8 },
        photos: [],
        readings: [
          { timestamp: Date.now() - 86400000, temp: 72, rh: 85, gpp: 98, mc: 45 },
          { timestamp: Date.now(), temp: 78, rh: 45, gpp: 62, mc: 28 },
        ]
      }
    ],
    // Initial Moisture Matrix Data
    dryingMonitor: [
        {
            id: 'tm-1',
            name: 'Drywall 5/8"',
            location: 'East Wall (Living Room)',
            type: 'Drywall 5/8"',
            dryGoal: 10,
            initialReading: 99,
            readings: [
                { timestamp: Date.now() - 172800000, value: 99, dateStr: 'Oct 12' },
                { timestamp: Date.now() - 86400000, value: 45, dateStr: 'Oct 13' },
                { timestamp: Date.now(), value: 28, dateStr: 'Oct 14' }
            ],
            status: 'Wet'
        },
        {
            id: 'tm-2',
            name: 'Baseboard (MDF)',
            location: 'South Wall (Kitchen)',
            type: 'Baseboard (MDF)',
            dryGoal: 12,
            initialReading: 99,
            readings: [
                { timestamp: Date.now() - 172800000, value: 99, dateStr: 'Oct 12' },
                { timestamp: Date.now() - 86400000, value: 95, dateStr: 'Oct 13' },
                { timestamp: Date.now(), value: 88, dateStr: 'Oct 14' }
            ],
            status: 'Wet'
        }
    ],
    milestones: [],
    tasks: [
        { id: 't1', text: 'Extract standing water', isCompleted: true, priority: 'high', dueDate: '2026-02-25' },
        { id: 't2', text: 'Set up dehumidifiers', isCompleted: false, priority: 'high', dueDate: '2026-02-24' },
        { id: 't3', text: 'Apply antimicrobial', isCompleted: false, priority: 'medium', dueDate: '2026-02-26' },
        { id: 't4', text: 'Final moisture check', isCompleted: false, priority: 'low', dueDate: '2026-02-28' },
    ],
    lineItems: [
        { id: 'li1', description: 'Emergency Water Extraction', quantity: 4, rate: 250, total: 1000 },
    ],
    totalCost: 1450,
    invoiceStatus: 'Draft',
    roomScans: [],
    videos: [],
    ticSheet: [],
    complianceChecks: { asbestos: 'pending', aiChecklist: [{id: '1', text: 'Confirm source stop', isCompleted: true}, {id: '2', text: 'Identify material porosity', isCompleted: false}] }
  },
  { 
    id: 'P-1002', 
    companyId: 'COMP-002', // Belongs to DryRight (Different Company)
    client: 'Robert Smith', 
    clientEmail: 'r.smith@example.com',
    clientPhone: '555-987-6543',
    address: '890 Oak Lane', 
    status: 'New', 
    currentStage: 'Inspection', // Workflow Step
    progress: 15, 
    estimate: 'Oct 19', 
    logs: "High humidity spike recorded at 2:00 AM. Needs investigation.",
    insurance: "Allstate",
    policyNumber: 'ALL-112233445',
    adjuster: 'Jane Doe',
    claimNumber: 'CLM-112233',
    startDate: "Oct 14, 2023",
    summary: 'Basement sump pump failure. 2 inches of standing water.',
    riskLevel: 'medium',
    waterCategory: WaterCategory.CAT_2,
    lossClass: LossClass.CLASS_2,
    budget: 7500,
    assignedTeam: ['David F.'],
    rooms: [],
    milestones: [],
    tasks: [],
    lineItems: [],
    totalCost: 0,
    invoiceStatus: 'Draft',
    roomScans: [],
    videos: [],
    ticSheet: [],
    complianceChecks: { asbestos: 'not_tested', aiChecklist: [{id: '1', text: 'Safety Hazard Assessment', isCompleted: false}] }
  },
];

// --- Offline Storage Logic ---
const STORAGE_KEY = 'mitigation_ai_projects';
const USERS_KEY = 'mitigation_ai_users';
const COMPANIES_KEY = 'mitigation_ai_companies';

const loadProjectsFromStorage = (): Project[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) { console.error(e); }
  saveProjectsToStorage(seedProjects);
  return seedProjects;
};

const saveProjectsToStorage = (projects: Project[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); } catch (e) { console.error(e); }
};

// Users Storage
const loadUsersFromStorage = (): User[] => {
    try {
        const stored = localStorage.getItem(USERS_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) { console.error(e); }
    localStorage.setItem(USERS_KEY, JSON.stringify(USERS));
    return USERS;
}

const saveUsersToStorage = (users: User[]) => {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// Companies Storage
const loadCompaniesFromStorage = (): Company[] => {
    try {
        const stored = localStorage.getItem(COMPANIES_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) { console.error(e); }
    localStorage.setItem(COMPANIES_KEY, JSON.stringify(COMPANIES));
    return COMPANIES;
}

const saveCompaniesToStorage = (companies: Company[]) => {
    localStorage.setItem(COMPANIES_KEY, JSON.stringify(companies));
}

// Simulate API delay
const apiDelay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- API Methods ---

// Get Projects - FILTERED BY COMPANY ID
export const getProjects = async (companyId?: string): Promise<Project[]> => {
  await apiDelay(300);
  const allProjects = loadProjectsFromStorage();
  if (companyId) {
      return allProjects.filter(p => p.companyId === companyId);
  }
  return []; // Return empty if no company context provided
};

export const getProjectById = async (id: string): Promise<Project | null> => {
  await apiDelay(200);
  const projects = loadProjectsFromStorage();
  return projects.find(p => p.id === id) || null;
};

export const addProject = async (projectData: Partial<Project>, companyId: string): Promise<Project> => {
  await apiDelay(400);
  const projects = loadProjectsFromStorage();
  const newId = `P-${Math.floor(Math.random() * 9000) + 1000}`;
  const newProject: Project = {
    ...projectData,
    id: newId,
    companyId: companyId, // Enforce Company ID
    progress: 5,
    currentStage: 'Intake',
    summary: 'Newly created project file.',
    riskLevel: 'low',
    client: projectData.client || 'Unknown Client',
    address: projectData.address || 'Unknown Address',
    status: projectData.status || 'Active',
    rooms: [],
    budget: 5000,
    assignedTeam: ['Unassigned'],
    milestones: [],
    tasks: [],
    lineItems: [],
    totalCost: 0,
    invoiceStatus: 'Draft',
    roomScans: [],
    videos: [],
    ticSheet: [],
    complianceChecks: { asbestos: 'not_tested', aiChecklist: [] }
  };
  saveProjectsToStorage([newProject, ...projects]);
  return newProject;
};

export const updateProject = async (projectId: string, updates: Partial<Project>): Promise<Project | null> => {
    await apiDelay(200);
    const projects = loadProjectsFromStorage();
    const index = projects.findIndex(p => p.id === projectId);
    if (index === -1) return null;
    
    projects[index] = { ...projects[index], ...updates };
    saveProjectsToStorage(projects);
    return projects[index];
};

export const updateProjectStage = async (projectId: string, stage: ProjectStage): Promise<Project | null> => {
    await apiDelay(300);
    const projects = loadProjectsFromStorage();
    const index = projects.findIndex(p => p.id === projectId);
    if (index === -1) return null;
    
    projects[index].currentStage = stage;
    // Increase progress based on stage
    const stages: ProjectStage[] = ['Intake', 'Inspection', 'Scope', 'Stabilize', 'Monitor', 'Closeout'];
    const progress = Math.round(((stages.indexOf(stage) + 1) / stages.length) * 100);
    projects[index].progress = progress;
    
    saveProjectsToStorage(projects);
    return projects[index];
};

export const addScanToProject = async (projectId: string, scan: RoomScan): Promise<Project | null> => {
  await apiDelay(300);
  const projects = loadProjectsFromStorage();
  const projectIndex = projects.findIndex(p => p.id === projectId);
  if (projectIndex === -1) return null;
  projects[projectIndex].roomScans.push(scan);
  saveProjectsToStorage(projects);
  return projects[projectIndex];
};

// --- User & Company Management API ---

export const getCompanyUsers = async (companyId: string): Promise<User[]> => {
    await apiDelay(200);
    return loadUsersFromStorage().filter(u => u.companyId === companyId);
}

export const getAllCompanies = async (): Promise<Company[]> => {
    await apiDelay(200);
    return loadCompaniesFromStorage();
}

export const createCompany = async (name: string, plan: Company['subscriptionPlan']): Promise<Company> => {
    await apiDelay(300);
    const companies = loadCompaniesFromStorage();
    const newCo: Company = {
        id: `COMP-${Date.now()}`,
        name,
        subscriptionPlan: plan,
        maxUsers: plan === 'Enterprise' ? 100 : 10,
        isActive: true
    };
    saveCompaniesToStorage([...companies, newCo]);
    return newCo;
}

export const createUser = async (user: User): Promise<User> => {
    await apiDelay(300);
    const users = loadUsersFromStorage();
    saveUsersToStorage([...users, user]);
    return user;
}

export const updateUserPermissions = async (userId: string, permissions: string[]): Promise<void> => {
    await apiDelay(200);
    const users = loadUsersFromStorage();
    const updated = users.map(u => u.id === userId ? { ...u, permissions: permissions as User['permissions'] } : u);
    saveUsersToStorage(updated);
}
