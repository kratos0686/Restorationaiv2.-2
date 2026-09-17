import React, { useState, useEffect, useMemo } from "react";
import {
  PlusCircle,
  Trash2,
  Send,
  CheckCircle,
  User,
  Building,
  Home,
  BarChart2,
  Download,
} from "lucide-react";
import { getProjectById } from "../services/api";
import { Project, LineItem } from "../types";
import { useAppContext } from "../context/AppContext";
import SkeletonLoader from "./SkeletonLoader";
import { EventBus } from "../services/EventBus";

const Billing: React.FC = () => {
  const { selectedProjectId, hasPermission } = useAppContext();
  const canManageBilling = hasPermission("manage_billing");
  const [project, setProject] = useState<Project | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [billTo, setBillTo] = useState<"Insurance" | "Homeowner" | "HOA">(
    "Insurance",
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProject = async () => {
      if (selectedProjectId) {
        setIsLoading(true);
        try {
          const proj = await getProjectById(selectedProjectId);
          setProject(proj);
          setLineItems(proj?.lineItems || []);
        } catch (e) {
          console.error("Failed to fetch project for billing", e);
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    };
    fetchProject();
  }, [selectedProjectId]);

  const totalCost = useMemo(() => {
    return lineItems.reduce((acc, item) => acc + item.total, 0);
  }, [lineItems]);

  const handleAddItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: `new-${Date.now()}`,
        description: "",
        quantity: 1,
        rate: 0,
        total: 0,
      },
    ]);
  };

  const handleItemChange = (
    id: string,
    field: keyof LineItem,
    value: string | number,
  ) => {
    setLineItems(
      lineItems.map((item) => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };
          if (field === "quantity" || field === "rate") {
            const quantity =
              typeof updatedItem.quantity === "string"
                ? parseFloat(updatedItem.quantity)
                : updatedItem.quantity;
            const rate =
              typeof updatedItem.rate === "string"
                ? parseFloat(updatedItem.rate)
                : updatedItem.rate;
            updatedItem.total = (quantity || 0) * (rate || 0);
          }
          return updatedItem;
        }
        return item;
      }),
    );
  };

  const handleRemoveItem = (id: string) => {
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const handleSendInvoice = () => {
    alert(`Invoice for $${totalCost.toFixed(2)} sent to ${billTo}.`);
    if (project) {
      EventBus.publish(
        "com.restorationai.billing.invoice.sent",
        { projectId: project.id, recipient: billTo, amount: totalCost },
        project.id,
        `Invoice sent to ${billTo}`,
        "success",
      );
    }
  };

  const handleExportXactimate = () => {
    alert("Simulating export of billing data to Xactimate (.esx file)...");
    if (project) {
      EventBus.publish(
        "com.restorationai.billing.xactimate.exported",
        {
          projectId: project.id,
          lineItemsCount: lineItems.length,
          amount: totalCost,
        },
        project.id,
        "Billing exported to Xactimate",
        "success",
      );
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <SkeletonLoader height="40px" width="300px" className="mb-4" />
        <SkeletonLoader height="300px" />
      </div>
    );
  }

  if (!selectedProjectId) {
    return (
      <div className="p-8 h-full flex flex-col items-center justify-center text-center text-blue-400">
        <div className="p-4 bg-slate-800 text-brand-cyan rounded-full mb-4 ring-1 ring-white/10">
          <BarChart2 size={32} />
        </div>
        <h2 className="text-xl font-bold text-white">Billing & Invoicing</h2>
        <p className="text-blue-500 mt-2">
          Please select a project from the list to view or create an invoice.
        </p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 text-blue-400">
        Could not load project billing data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Billing for Project {project.id}
          </h2>
          <p className="text-sm text-blue-400 font-medium">
            {project.client} - {project.address}
          </p>
        </div>
        {canManageBilling && (
          <button
            onClick={handleExportXactimate}
            className="flex items-center space-x-2 bg-brand-cyan/10 text-brand-cyan px-4 py-2 rounded-lg text-sm font-bold border border-brand-cyan/20"
          >
            <Download size={16} />
            <span>Export to Xactimate</span>
          </button>
        )}
      </header>

      <div className="glass-card p-6 rounded-[1.5rem]">
        <h3 className="font-bold text-white mb-4">Invoice Details</h3>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block">
              Bill To
            </label>
            <div className="flex p-1.5 bg-slate-800/50 rounded-2xl border border-white/10">
              <button
                onClick={() => setBillTo("Insurance")}
                className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center space-x-2 ${billTo === "Insurance" ? "bg-slate-700 text-white shadow-sm" : "text-blue-400"}`}
              >
                <Building size={14} />
                <span>{project.insurance}</span>
              </button>
              <button
                onClick={() => setBillTo("Homeowner")}
                className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center space-x-2 ${billTo === "Homeowner" ? "bg-slate-700 text-white shadow-sm" : "text-blue-400"}`}
              >
                <User size={14} />
                <span>{project.client}</span>
              </button>
              <button
                onClick={() => setBillTo("HOA")}
                className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center space-x-2 ${billTo === "HOA" ? "bg-slate-700 text-white shadow-sm" : "text-blue-400"}`}
              >
                <Home size={14} />
                <span>HOA</span>
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block">
              Invoice Status
            </label>
            <div
              className={`w-full flex items-center justify-center py-4 rounded-2xl text-sm font-bold ${project.invoiceStatus === "Paid" ? "bg-green-500/10 text-green-300" : "bg-yellow-500/10 text-yellow-300"}`}
            >
              {project.invoiceStatus === "Paid" && (
                <CheckCircle size={16} className="mr-2" />
              )}{" "}
              {project.invoiceStatus}
            </div>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block">
            Line Items
          </label>
          <div className="space-y-2">
            {lineItems.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-12 gap-2 items-center"
              >
                <input
                  type="text"
                  value={item.description}
                  disabled={!canManageBilling}
                  onChange={(e) =>
                    handleItemChange(item.id, "description", e.target.value)
                  }
                  placeholder="Service Description"
                  className="col-span-6 bg-white/5 border border-white/10 rounded-lg p-2 text-xs font-medium text-white disabled:opacity-75"
                />
                <input
                  type="number"
                  value={item.quantity}
                  disabled={!canManageBilling}
                  onChange={(e) =>
                    handleItemChange(item.id, "quantity", e.target.value)
                  }
                  placeholder="Qty"
                  className="col-span-2 bg-white/5 border border-white/10 rounded-lg p-2 text-xs font-medium text-white disabled:opacity-75"
                />
                <input
                  type="number"
                  value={item.rate}
                  disabled={!canManageBilling}
                  onChange={(e) =>
                    handleItemChange(item.id, "rate", e.target.value)
                  }
                  placeholder="Rate"
                  className="col-span-2 bg-white/5 border border-white/10 rounded-lg p-2 text-xs font-medium text-white disabled:opacity-75"
                />
                <span className="col-span-1 text-xs font-bold text-center text-blue-300 font-mono">
                  ${item.total.toFixed(2)}
                </span>
                {canManageBilling ? (
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="col-span-1 text-blue-500 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : (
                  <div className="col-span-1" />
                )}
              </div>
            ))}
          </div>
          {canManageBilling && (
            <button
              onClick={handleAddItem}
              className="flex items-center space-x-2 text-brand-cyan text-xs font-bold pt-2 animate-pulse"
            >
              <PlusCircle size={14} />
              <span>Add Line Item</span>
            </button>
          )}</div>

        <div className="mt-8 pt-4 border-t border-white/10 flex justify-end items-center">
          <div className="text-right">
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
              Total Amount
            </p>
            <p className="text-3xl font-black text-white">
              ${totalCost.toFixed(2)}
            </p>
          </div>
        </div>
      </div>
      {canManageBilling && (
        <button
          onClick={handleSendInvoice}
          className="w-full py-4 bg-brand-cyan text-slate-900 rounded-2xl font-bold flex items-center justify-center space-x-2 shadow-lg active:scale-[0.98] transition-all"
        >
          <Send size={20} />
          <span>Send Invoice to {billTo}</span>
        </button>
      )}
    </div>
  );
};

export default Billing;
