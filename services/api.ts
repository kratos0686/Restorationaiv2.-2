import { Project, User, Company, InventoryEquipment } from '../types';
import * as mockApi from '../data/mockApi';
import { EventBus } from './EventBus';

const API_BASE_URL = '/api';
let hasWarnedOffline = false;
const notifyUsingSampleData = () => {
  if (hasWarnedOffline) return;
  hasWarnedOffline = true;
  EventBus.publish(
    'com.restorationai.data.offline',
    {},
    undefined,
    'You appear to be offline — showing sample data. Changes made now will not be saved until connection is restored.',
    'warning'
  );
  setTimeout(() => { hasWarnedOffline = false; }, 60000);
};

export const getProjects = async (companyId?: string): Promise<Project[]> => {
  try {
    const url = companyId ? `${API_BASE_URL}/projects?companyId=${companyId}` : `${API_BASE_URL}/projects`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} - Failed to fetch projects`);
    const data = await response.json();
    if (Array.isArray(data) && (data.length > 0 || !companyId)) {
      return data;
    }
    notifyUsingSampleData();
    return await mockApi.getProjects(companyId);
  } catch (error) {
    console.warn('getProjects fetch failed, using local mock API:', error);
    notifyUsingSampleData();
    return await mockApi.getProjects(companyId);
  }
};

export const getProjectById = async (id: string): Promise<Project | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/projects/${id}`);
    if (response.status === 404) {
      return await mockApi.getProjectById(id);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} - Failed to fetch project`);
    const data = await response.json();
    return data || await mockApi.getProjectById(id);
  } catch (error) {
    console.warn('getProjectById fetch failed, using local mock API:', error);
    return await mockApi.getProjectById(id);
  }
};

export const addProject = async (project: Omit<Project, 'id'>): Promise<Project | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    if (!response.ok) throw new Error('Failed to add project');
    return await response.json();
  } catch (error) {
    console.warn('addProject fetch failed, using local mock API:', error);
    return await mockApi.addProject(project, project.companyId || 'COMP-001');
  }
};

export const updateProject = async (id: string, updates: Partial<Project>): Promise<Project | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (response.status === 404) {
      return await mockApi.updateProject(id, updates);
    }
    if (!response.ok) throw new Error('Failed to update project');
    return await response.json();
  } catch (error) {
    console.warn('updateProject fetch failed, using local mock API:', error);
    return await mockApi.updateProject(id, updates);
  }
};

export const uploadMedia = async (projectId: string, file: File): Promise<string | null> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE_URL}/projects/${projectId}/media`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) throw new Error('Failed to upload media');
    const data = await response.json();
    return data.url;
  } catch (error) {
    console.warn('uploadMedia fetch failed, returning object URL:', error);
    return URL.createObjectURL(file);
  }
};

export const getCompanyUsers = async (companyId: string): Promise<User[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies/${companyId}/users`);
    if (!response.ok) throw new Error('Failed to fetch users');
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
    return await mockApi.getCompanyUsers(companyId);
  } catch (error) {
    console.warn('getCompanyUsers fetch failed, using local mock API:', error);
    return await mockApi.getCompanyUsers(companyId);
  }
};

export const getAllCompanies = async (): Promise<Company[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies`);
    if (!response.ok) throw new Error('Failed to fetch companies');
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
    return await mockApi.getAllCompanies();
  } catch (error) {
    console.warn('getAllCompanies fetch failed, using local mock API:', error);
    return await mockApi.getAllCompanies();
  }
};

export const createUser = async (user: Omit<User, 'id'>): Promise<User | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
    if (!response.ok) throw new Error('Failed to create user');
    return await response.json();
  } catch (error) {
    console.warn('createUser fetch failed, using local mock API:', error);
    const id = `U-${Date.now()}`;
    return await mockApi.createUser({ id, ...user } as User);
  }
};

export const createCompany = async (company: Omit<Company, 'id'>): Promise<Company | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(company),
    });
    if (!response.ok) throw new Error('Failed to create company');
    return await response.json();
  } catch (error) {
    console.warn('createCompany fetch failed, using local mock API:', error);
    return await mockApi.createCompany(company.name, company.subscriptionPlan);
  }
};

export const updateUserPermissions = async (userId: string, permissions: string[]): Promise<User | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/permissions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions }),
    });
    if (!response.ok) throw new Error('Failed to update permissions');
    return await response.json();
  } catch (error) {
    console.warn('updateUserPermissions fetch failed, using local mock API:', error);
    await mockApi.updateUserPermissions(userId, permissions);
    return null;
  }
};

export const getInventory = async (): Promise<InventoryEquipment[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory`);
    if (!response.ok) throw new Error(`HTTP ${response.status} - Failed to fetch inventory`);
    return await response.json();
  } catch (error) {
    console.error('getInventory error:', error);
    return [];
  }
};

export const addInventoryItem = async (item: Omit<InventoryEquipment, 'id'>): Promise<InventoryEquipment | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!response.ok) throw new Error('Failed to add inventory item');
    return await response.json();
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateInventoryItem = async (id: string, updates: Partial<InventoryEquipment>): Promise<InventoryEquipment | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error('Failed to update inventory item');
    return await response.json();
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const deleteInventoryItem = async (id: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory/${id}`, {
      method: 'DELETE',
    });
    return response.ok;
  } catch (error) {
    console.error(error);
    return false;
  }
};

// --- Genkit AI ---
export const parseFieldIntent = async (userInput: string, projectContext?: unknown) => {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userInput, projectContext }),
    });
    if (!response.ok) throw new Error('AI intent parse failed');
    return await response.json();
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const generateNarrative = async (context: { currentStage: string; equipmentCount?: number; readings?: unknown[]; complianceIssues?: string }) => {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/narrative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
    });
    if (!response.ok) throw new Error('AI narrative generation failed');
    const data = await response.json();
    return data.narrative;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const generateDailyDryingNarrative = async (context: { date?: string; psychrometricReadings?: unknown[]; trackedMaterials?: unknown[] }) => {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/drying-narrative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
    });
    if (!response.ok) throw new Error('AI drying narrative generation failed');
    const data = await response.json();
    return data.narrative;
  } catch (error) {
    console.error(error);
    return null;
  }
};
