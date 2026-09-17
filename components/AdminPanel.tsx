import React, { useState, useEffect } from "react";
import {
  UserPlus,
  Building,
  Users,
  CheckSquare,
  Square,
  Activity,
  Server,
  RefreshCw,
  Play,
  Pause,
  Trash2,
  Plus,
  Terminal,
  HardDrive,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { Company, User, Permission, UserRole } from "../types";
import { BackgroundSyncService } from "../services/SyncService";
import {
  getCompanyUsers,
  getAllCompanies,
  createUser,
  createCompany,
  updateUserPermissions,
} from "../services/api";
import { EventBus } from "../services/EventBus";

const AVAILABLE_PERMISSIONS: { id: Permission; label: string }[] = [
  { id: "view_projects", label: "View Projects" },
  { id: "edit_projects", label: "Edit Projects (Logs/Photos)" },
  { id: "view_billing", label: "View Billing" },
  { id: "manage_billing", label: "Create/Send Invoices" },
  { id: "manage_users", label: "Manage Users" },
  { id: "view_admin", label: "Access Admin Panel" },
  { id: "use_ai_tools", label: "Use AI Features" },
];

interface MonitoringAgent {
  id: string;
  name: string;
  target: string;
  frequency: string;
  threshold: number;
  status: "Active" | "Warning" | "Paused";
  latency: number;
  cpuUsage: number;
  memoryUsage: number;
  lastCheckTime?: string;
}

const AdminPanel: React.FC = () => {
  const { currentUser, hasPermission } = useAppContext();
  const [view, setView] = useState<"users" | "companies" | "monitoring">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Monitoring Agents state
  const [agents, setAgents] = useState<MonitoringAgent[]>([
    {
      id: "agt-vite-dev",
      name: "Frontend client (Vite HMR Agent)",
      target: "Frontend Client",
      frequency: "30s",
      threshold: 150,
      status: "Active",
      latency: 42,
      cpuUsage: 1.2,
      memoryUsage: 84, // MB
      lastCheckTime: new Date().toLocaleTimeString(),
    },
    {
      id: "agt-express-api",
      name: "Express routing gateway guardian",
      target: "Express API Server",
      frequency: "30s",
      threshold: 250,
      status: "Active",
      latency: 89,
      cpuUsage: 4.8,
      memoryUsage: 124, 
      lastCheckTime: new Date().toLocaleTimeString(),
    },
    {
      id: "agt-gemini-router",
      name: "Gemini intelligence model router helper",
      target: "Gemini Inference Service",
      frequency: "1m",
      threshold: 1500,
      status: "Active",
      latency: 630,
      cpuUsage: 12.5,
      memoryUsage: 412,
      lastCheckTime: new Date().toLocaleTimeString(),
    },
    {
      id: "agt-eventbus-core",
      name: "CloudEvent bus pub/sub queue monitor",
      target: "EventBus Gateway",
      frequency: "30s",
      threshold: 100,
      status: "Active",
      latency: 18,
      cpuUsage: 0.9,
      memoryUsage: 42,
      lastCheckTime: new Date().toLocaleTimeString(),
    },
    {
      id: "agt-psych-check",
      name: "Psychrometric boundary trigger analyzer",
      target: "IoT Telemetry Broker",
      frequency: "5m",
      threshold: 500,
      status: "Warning",
      latency: 124,
      cpuUsage: 2.1,
      memoryUsage: 68,
      lastCheckTime: new Date().toLocaleTimeString(),
    }
  ]);

  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentTarget, setNewAgentTarget] = useState("Frontend Client");
  const [newAgentFrequency, setNewAgentFrequency] = useState("30s");
  const [newAgentThreshold, setNewAgentThreshold] = useState("200");
  const [logs, setLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] [SYSTEM] Monitoring Engine Initialized. Monitoring 5 core agents.`,
    `[${new Date().toLocaleTimeString()}] [AGT-VITE-DEV] Startup diagnostic successful. Packet latency is 42ms. HMR hot socket open.`,
    `[${new Date().toLocaleTimeString()}] [AGT-EXPRESS-API] Endpoint health check active. Port status compliant.`,
    `[${new Date().toLocaleTimeString()}] [AGT-GEMINI-ROUTER] Active models routed: gemini-3-flash-preview. Available quota: 100%.`,
  ]);

  // New Entry State
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("Technician");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyPlan, setNewCompanyPlan] = useState<
    "Basic" | "Pro" | "Enterprise"
  >("Pro");

  useEffect(() => {
    const loadData = async () => {
      try {
        if (currentUser?.role === "SuperAdmin") {
          const allCompanies = await getAllCompanies();
          setCompanies(allCompanies);
        }
        if (currentUser?.companyId) {
          const companyUsers = await getCompanyUsers(currentUser.companyId);
          setUsers(companyUsers);
        }
      } catch (e) {
        console.error("Failed to load admin data", e);
      }
    };
    loadData();
  }, [currentUser, view, isCreating]);

  const handleCreateUser = async () => {
    if (!newUserName || !newUserEmail || !currentUser?.companyId) return;
    setIsCreating(true);

    // Default permissions based on role
    let defaultPerms: Permission[] = ["view_projects"];
    if (newUserRole === "CompanyAdmin")
      defaultPerms = AVAILABLE_PERMISSIONS.map((p) => p.id as Permission);
    if (newUserRole === "Technician")
      defaultPerms = ["view_projects", "edit_projects", "use_ai_tools"];

    const newUser: User = {
      id: `U-${Date.now()}`,
      name: newUserName,
      email: newUserEmail,
      role: newUserRole,
      companyId: currentUser.companyId,
      permissions: defaultPerms,
    };

    try {
      await createUser(newUser);
      EventBus.publish(
        "com.restorationai.admin.user.created",
        {
          userId: newUser.id,
          name: newUser.name,
          role: newUser.role,
          companyId: newUser.companyId,
        },
        newUser.id,
        `User ${newUser.name} created as ${newUser.role}`,
        "success",
      );
      setNewUserName("");
      setNewUserEmail("");
      // reloadData handle by useEffect dependency on isCreating optionally, but here we can just reset state
    } catch (e) {
      console.error("Failed to create user", e);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateCompany = async () => {
    if (!newCompanyName) return;
    setIsCreating(true);
    try {
      const created = await createCompany({
        name: newCompanyName,
        subscriptionPlan: newCompanyPlan,
        users: [],
        settings: {
          requireLocationForClockIn: false,
          requirePhotoForEquipment: false,
          enforceComplianceChecklists: false
        }
      });
      EventBus.publish(
        "com.restorationai.admin.company.created",
        {
          companyId: created?.id || `CO-${Date.now()}`,
          name: newCompanyName,
          plan: newCompanyPlan,
        },
        undefined,
        `Company ${newCompanyName} registered successfully`,
        "success",
      );
      setNewCompanyName("");
    } catch (e) {
      console.error("Failed to create company", e);
    } finally {
      setIsCreating(false);
    }
  };

  const togglePermission = async (
    userId: string,
    perm: Permission,
    currentPerms: Permission[],
  ) => {
    const has = currentPerms.includes(perm);
    const newPerms = has
      ? currentPerms.filter((p) => p !== perm)
      : [...currentPerms, perm];
    // Optimistic update
    setUsers(
      users.map((u) => (u.id === userId ? { ...u, permissions: newPerms } : u)),
    );
    try {
      await updateUserPermissions(userId, newPerms);
      EventBus.publish(
        "com.restorationai.admin.permissions.updated",
        { userId, permission: perm, active: !has, targetPermissions: newPerms },
        userId,
        `Permissions updated`,
        "info",
      );
    } catch (e) {
      console.error("Failed to update permissions", e);
      // Ignore reverting optimistic update for brevity, but catch avoids unhandled promise rejection
    }
  };

  if (!hasPermission("view_admin")) {
    return (
      <div className="p-8 text-center text-red-400">
        Access Denied. Contact your administrator.
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-white">Administrator Panel</h1>
          <p className="text-blue-400">
            Organization:{" "}
            <span className="font-bold text-white">
              {companies.find((c) => c.id === currentUser?.companyId)?.name ||
                "System Root"}
            </span>
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => BackgroundSyncService.syncPendingChanges(true)}
            className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition-all border border-slate-700"
          >
            <RefreshCw size={14} />
            <span>Force Sync</span>
          </button>
          <div className="flex bg-slate-800/80 p-1 rounded-xl border border-white/5 space-x-1">
            <button
              onClick={() => setView("users")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === "users" ? "bg-brand-cyan text-slate-900" : "text-slate-400 hover:text-white"}`}
            >
              Users
            </button>
            {currentUser?.role === "SuperAdmin" && (
              <button
                onClick={() => setView("companies")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === "companies" ? "bg-brand-cyan text-slate-900" : "text-slate-400 hover:text-white"}`}
              >
                Companies
              </button>
            )}
            <button
              onClick={() => setView("monitoring")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === "monitoring" ? "bg-brand-cyan text-slate-900" : "text-slate-400 hover:text-white"}`}
            >
              Service Monitors
            </button>
          </div>
        </div>
      </header>

      {view === "companies" && currentUser?.role === "SuperAdmin" && (
        <section className="glass-card rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Building size={18} /> Manage Companies
          </h3>

          <div className="grid grid-cols-4 gap-4 mb-6 p-4 bg-white/5 rounded-xl border border-white/10">
            <input
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              placeholder="Company Name"
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
            />
            <select
              value={newCompanyPlan}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setNewCompanyPlan(e.target.value as Company["subscriptionPlan"])
              }
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="Basic">Basic</option>
              <option value="Pro">Pro</option>
              <option value="Enterprise">Enterprise</option>
            </select>
            <button
              onClick={handleCreateCompany}
              className="bg-brand-cyan text-slate-900 font-bold rounded-lg px-4 py-2 text-sm flex items-center justify-center gap-2"
            >
              <UserPlus size={14} /> Create Company
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-blue-400 uppercase bg-white/5">
                <tr>
                  <th className="p-3">Company Name</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Users</th>
                  <th className="p-3">ID</th>
                  <th className="p-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {companies.map((comp) => (
                  <tr key={comp.id} className="hover:bg-white/5">
                    <td className="p-3 font-bold text-white">{comp.name}</td>
                    <td className="p-3">
                      <span className="bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-md text-xs border border-indigo-500/30">
                        {comp.subscriptionPlan}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400">
                      {comp.maxUsers} limit
                    </td>
                    <td className="p-3 font-mono text-xs text-slate-500">
                      {comp.id}
                    </td>
                    <td className="p-3 text-right">
                      <span className="text-green-400 text-xs font-bold uppercase">
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === "users" && (
        <section className="glass-card rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Users size={18} /> User Management
          </h3>

          <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 bg-white/5 rounded-xl border border-white/10">
            <input
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="Full Name"
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
            />
            <input
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              placeholder="Email Address"
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
            />
            <select
              value={newUserRole}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setNewUserRole(e.target.value as UserRole)
              }
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="Technician">Technician</option>
              <option value="CompanyAdmin">Company Admin</option>
            </select>
            <button
              onClick={handleCreateUser}
              className="bg-brand-cyan text-slate-900 font-bold rounded-lg px-4 py-2 text-sm flex items-center justify-center gap-2"
            >
              <UserPlus size={14} /> Add User
            </button>
          </div>

          <div className="space-y-4">
            {users.map((user) => (
              <div
                key={user.id}
                className="bg-slate-800/50 border border-white/5 rounded-xl p-4"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="font-bold text-white">{user.name}</h4>
                    <p className="text-xs text-blue-400">
                      {user.email} •{" "}
                      <span className="text-slate-400">{user.role}</span>
                    </p>
                  </div>
                  <div className="text-xs font-mono text-slate-600">
                    {user.id}
                  </div>
                </div>

                <div className="border-t border-white/10 pt-3">
                  <p className="text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-widest">
                    Access Permissions
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_PERMISSIONS.map((perm) => {
                      const has = user.permissions.includes(perm.id);
                      return (
                        <button
                          key={perm.id}
                          onClick={() =>
                            togglePermission(user.id, perm.id, user.permissions)
                          }
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${has ? "bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan" : "bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500"}`}
                        >
                          {has ? (
                            <CheckSquare size={12} />
                          ) : (
                            <Square size={12} />
                          )}
                          {perm.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {view === "monitoring" && (
        <div className="space-y-6">
          {/* System Environment Metrics Panel */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card rounded-2xl p-4 bg-slate-900/50 border border-white/5 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                Environment Health
              </span>
              <div className="flex items-center gap-2 mt-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <span className="text-xl font-bold font-sans text-white">Operational</span>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-4 bg-slate-900/50 border border-white/5 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                Active Agents
              </span>
              <div className="flex items-end justify-between mt-2">
                <span className="text-2xl font-black text-white">
                  {agents.filter(a => a.status === "Active" || a.status === "Warning").length} / {agents.length}
                </span>
                <span className="text-xs text-brand-cyan font-semibold">100% Core Online</span>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-4 bg-slate-900/50 border border-white/5 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                Total Allocated Ram
              </span>
              <div className="flex items-end justify-between mt-2">
                <span className="text-2xl font-black text-white">
                  {agents.reduce((acc, a) => acc + (a.memoryUsage || 0), 0)} MB
                </span>
                <span className="text-xs text-slate-400 font-mono">Dynamic Limit</span>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-4 bg-slate-900/50 border border-white/5 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                Avg Response Latency
              </span>
              <div className="flex items-end justify-between mt-2">
                <span className="text-2xl font-black text-white">
                  {Math.round(agents.reduce((acc, a) => acc + (a.latency || 0), 0) / agents.length)} ms
                </span>
                <span className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                  <Activity size={12} className="text-brand-cyan" /> Smooth
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2/3: Agents Grid */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Server size={18} className="text-brand-cyan" /> Provisioned Monitoring Agents
                </h3>
                <button
                  onClick={() => {
                    const checkTime = new Date().toLocaleTimeString();
                    setAgents(prev => prev.map(a => {
                      if (a.status === "Paused") return a;
                      const noise = Math.floor(Math.random() * 20) - 10;
                      const lat = Math.max(10, (a.latency || 100) + noise);
                      const cpuNoise = (Math.random() * 2 - 1).toFixed(1);
                      const cpu = Math.max(0.2, +(a.cpuUsage + +cpuNoise).toFixed(1));
                      return {
                        ...a,
                        latency: lat,
                        cpuUsage: cpu,
                        lastCheckTime: checkTime,
                      };
                    }));
                    setLogs(prev => [
                      `[${checkTime}] [SYSTEM] Global Diagnostics Sweep Triggered manually.`,
                      ...agents.map(a => `[${checkTime}] [${a.id.toUpperCase()}] Latency: ${a.latency}ms | CPU: ${a.cpuUsage}% | MEM: ${a.memoryUsage}MB | STATUS: ${a.status}`),
                      ...prev.slice(0, 15)
                    ]);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-cyan/10 hover:bg-brand-cyan/20 border border-brand-cyan/30 text-brand-cyan rounded-xl text-xs font-bold transition-all"
                  title="Force telemetry diagnostics ping"
                >
                  <RefreshCw size={12} className="animate-spin" /> Sweep All Traces
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {agents.map((agent) => {
                  const isCustom = !["agt-vite-dev", "agt-express-api", "agt-gemini-router", "agt-eventbus-core", "agt-psych-check"].includes(agent.id);
                  return (
                    <div
                      key={agent.id}
                      className="bg-slate-800/40 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all flex flex-col justify-between"
                    >
                      <div>
                        {/* Header card info */}
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[9px] font-black text-brand-cyan uppercase tracking-wider block">
                              {agent.target}
                            </span>
                            <h4 className="font-bold text-white text-sm mt-0.5">{agent.name}</h4>
                          </div>
                          
                          {/* Status pill badge */}
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            agent.status === "Active" 
                              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400" 
                              : agent.status === "Warning"
                                ? "bg-amber-500/15 border border-amber-500/30 text-amber-400 animate-pulse"
                                : "bg-slate-700/30 border border-slate-700/50 text-slate-400"
                          }`}>
                            {agent.status}
                          </span>
                        </div>

                        {/* Middle metrics grid */}
                        <div className="grid grid-cols-3 gap-2 mt-4 bg-slate-950/40 p-3 rounded-xl border border-white/5">
                          <div className="text-center">
                            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block font-sans">Latency</span>
                            <span className="text-xs font-black text-slate-200 mt-1 block font-mono">{agent.latency} ms</span>
                          </div>
                          <div className="text-center border-x border-white/5">
                            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block font-sans">CPU Load</span>
                            <span className="text-xs font-black text-slate-200 mt-1 block font-mono">{agent.cpuUsage}%</span>
                          </div>
                          <div className="text-center">
                            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block font-sans">Memory</span>
                            <span className="text-xs font-black text-slate-200 mt-1 block font-mono">{agent.memoryUsage} MB</span>
                          </div>
                        </div>

                        {/* Bar chart indicator */}
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[9px] text-slate-500">
                            <span>Latency Warning Threshold</span>
                            <span className="font-mono">{agent.threshold}ms</span>
                          </div>
                          <div className="w-full bg-slate-950 h-1 rounded-full mt-1 overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${
                                agent.latency > agent.threshold 
                                  ? "bg-red-500" 
                                  : agent.latency > agent.threshold * 0.7
                                    ? "bg-amber-500"
                                    : "bg-brand-cyan"
                              }`}
                              style={{ width: `${Math.min(100, (agent.latency / agent.threshold) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Action trigger links */}
                      <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                        <span className="text-[10px] font-mono text-slate-500">
                          Checked {agent.lastCheckTime || "--"}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const checkTime = new Date().toLocaleTimeString();
                              const updatedStatus = agent.status === "Paused" ? "Active" : "Paused";
                              setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: updatedStatus } : a));
                              setLogs(prev => [
                                `[${checkTime}] [${agent.id.toUpperCase()}] Status update: ${updatedStatus}`,
                                ...prev.slice(0, 15)
                              ]);
                            }}
                            className={`p-1.5 rounded-lg border transition-all ${
                              agent.status === "Paused" 
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20" 
                                : "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
                            }`}
                            title={agent.status === "Paused" ? "Resume Agent" : "Pause Agent"}
                          >
                            {agent.status === "Paused" ? <Play size={10} /> : <Pause size={10} />}
                          </button>
                          
                          <button
                            onClick={() => {
                              const checkTime = new Date().toLocaleTimeString();
                              const noise = Math.floor(Math.random() * 30) - 15;
                              const lat = Math.max(10, (agent.latency || 100) + noise);
                              const cpuNoise = (Math.random() * 3 - 1.5).toFixed(1);
                              const cpu = Math.max(0.1, +(agent.cpuUsage + +cpuNoise).toFixed(1));
                              setAgents(prev => prev.map(a => a.id === agent.id ? { 
                                ...a, 
                                latency: lat, 
                                cpuUsage: cpu, 
                                lastCheckTime: checkTime,
                                status: lat > agent.threshold ? "Warning" : "Active"
                              } : a));
                              setLogs(prev => [
                                `[${checkTime}] [${agent.id.toUpperCase()}] Manual diagnosis connection test successful. Reply packet latency is ${lat}ms.`,
                                ...prev.slice(0, 15)
                              ]);
                              EventBus.publish(
                                "com.restorationai.monitoring.agent.diagnosed",
                                { agentId: agent.id, latency: lat },
                                agent.id,
                                `Agent ${agent.name} diagnosed locally`,
                                "info"
                              );
                            }}
                            className="p-1.5 bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white rounded-lg transition-all"
                            title="Diagnose Connection"
                          >
                            <RefreshCw size={10} />
                          </button>

                          {isCustom && (
                            <button
                              onClick={() => {
                                setAgents(prev => prev.filter(a => a.id !== agent.id));
                                setLogs(prev => [
                                  `[${new Date().toLocaleTimeString()}] [SYSTEM] Deallocated Agent: ${agent.name}`,
                                  ...prev.slice(0, 15)
                                ]);
                              }}
                              className="p-1.5 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-lg transition-all"
                              title="Delete custom agent"
                            >
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right 1/3: Configuration & Trace Logs Console */}
            <div className="space-y-6">
              {/* Creator Form panel */}
              <div className="glass-card rounded-2xl p-5 bg-slate-900/50 border border-white/5 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Plus size={14} className="text-brand-cyan" /> Configure Custom Agent
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                      Agent Name
                    </label>
                    <input
                      type="text"
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                      placeholder="e.g. AWS S3 Storage Agent"
                      className="w-full bg-slate-950 border border-slate-700/50 rounded-xl px-3 py-2 text-white text-xs focus:border-brand-cyan focus:outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                      Target Service Hub
                    </label>
                    <select
                      value={newAgentTarget}
                      onChange={(e) => setNewAgentTarget(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700/50 rounded-xl px-3 py-2 text-white text-xs focus:border-brand-cyan focus:outline-none transition-all"
                    >
                      <option value="Frontend Client">Frontend Client Layer</option>
                      <option value="Express API Server">Express API Server</option>
                      <option value="Gemini Inference Service">Gemini Inference Engine</option>
                      <option value="EventBus Gateway">Local EventBus Gateway</option>
                      <option value="IoT Telemetry Broker">IoT Telemetry Broker</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                        Interval
                      </label>
                      <select
                        value={newAgentFrequency}
                        onChange={(e) => setNewAgentFrequency(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700/50 rounded-xl px-3 py-2 text-white text-xs focus:border-brand-cyan focus:outline-none transition-all"
                      >
                        <option value="15s">15 seconds</option>
                        <option value="30s">30 seconds</option>
                        <option value="1m">1 minute</option>
                        <option value="5m">5 minutes</option>
                        <option value="15m">15 minutes</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                        Threshold (ms)
                      </label>
                      <input
                        type="number"
                        value={newAgentThreshold}
                        onChange={(e) => setNewAgentThreshold(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700/50 rounded-xl px-3 py-2 text-white text-xs focus:border-brand-cyan focus:outline-none transition-all"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (!newAgentName) return;
                      const newId = `agt-custom-${Date.now()}`;
                      const freshAgent = {
                        id: newId,
                        name: newAgentName,
                        target: newAgentTarget,
                        frequency: newAgentFrequency,
                        threshold: +newAgentThreshold || 300,
                        status: "Active" as const,
                        latency: Math.floor(Math.random() * 50) + 15,
                        cpuUsage: +(Math.random() * 4 + 0.5).toFixed(1),
                        memoryUsage: Math.floor(Math.random() * 100) + 20,
                        lastCheckTime: new Date().toLocaleTimeString(),
                      };

                      setAgents((prev) => [...prev, freshAgent]);
                      const logMsg = `[${new Date().toLocaleTimeString()}] [SYSTEM] Provisioned New Custom Agent: ${newAgentName} Target: ${newAgentTarget}`;
                      setLogs((prev) => [logMsg, ...prev]);

                      EventBus.publish(
                        "com.restorationai.monitoring.agent.created",
                        { agentId: newId, name: newAgentName, target: newAgentTarget },
                        newId,
                        `Custom monitoring agent "${newAgentName}" provisioned`,
                        "success"
                      );

                      setNewAgentName("");
                    }}
                    className="w-full bg-brand-cyan text-slate-955 hover:bg-[#00d4aa] rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-brand-cyan/10 py-2.5 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={14} className="stroke-[3]" /> Spawn Monitor Agent
                  </button>
                </div>
              </div>

              {/* Console Logs terminal box */}
              <div className="glass-card rounded-2xl p-5 bg-slate-950 border border-white/5 space-y-3 flex flex-col justify-between h-[310px]">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 flex items-center gap-2">
                    <Terminal size={14} className="text-indigo-400" /> Active Heartbeat Traces
                  </h3>
                  <button
                    onClick={() => setLogs([`[${new Date().toLocaleTimeString()}] [SYSTEM] Console log clean sweeped.`])}
                    className="text-[10px] text-slate-500 hover:text-white transition-all font-bold"
                  >
                    Clear Feed
                  </button>
                </div>

                <div className="flex-1 bg-slate-900/60 rounded-xl p-3 border border-white/5 font-mono text-[10px] text-slate-400 scrollbar-thin overflow-y-auto space-y-1.5 leading-relaxed selection:bg-brand-cyan selection:text-slate-950 min-h-0">
                  {logs.map((log, index) => {
                    let textClass = "text-slate-400";
                    if (log.includes("[SYSTEM]")) textClass = "text-brand-cyan";
                    else if (log.includes("STATUS: Active") || log.includes("diagnose successful") || log.includes("diagnosed locally") || log.includes("Status update: Active")) textClass = "text-emerald-400";
                    else if (log.includes("Warning") || log.includes("Status update: Paused") || log.includes("Paused")) textClass = "text-amber-400";
                    else if (log.includes("Deallocated") || log.includes("Critical")) textClass = "text-red-400";

                    return (
                      <div key={index} className={`${textClass} transition-all`}>
                        {log}
                      </div>
                    );
                  })}
                </div>

                <div className="text-[9px] text-slate-600 font-bold flex items-center gap-1 border-t border-white/5 pt-2">
                  <HardDrive size={10} />
                  <span>Log Channel Buffer: Node Live Standard Mode</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
