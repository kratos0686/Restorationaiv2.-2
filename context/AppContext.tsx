/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  ReactNode,
} from "react";
import {
  RoomScan,
  Tab,
  User,
  UserRole,
  Permission,
  AppSettings,
  AppNotification,
} from "../types";
import { EventBus } from "../services/EventBus";

import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

interface AppContextType {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  isAuthenticated: boolean | null;
  setAuthentication: (status: boolean) => void;
  accessToken: string;
  setAccessToken: (token: string) => void;
  addScanToProject: (projectId: string, scan: RoomScan) => Promise<void>;
  isOnline: boolean;
  hasPermission: (permission: Permission) => boolean;
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (isOpen: boolean) => void;
  notifications: AppNotification[];
  addNotification: (notification: AppNotification) => void;
  markNotificationAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  requestNotificationPermission: () => Promise<boolean>;
  notificationPermission: NotificationPermission;
}

const DEFAULT_SETTINGS: AppSettings = {
  language: "English (US)",
  dateFormat: "Month/Day/Year",
  timeFormat: "Twelve Hours (AM/PM)",
  units: {
    temperature: "Fahrenheit",
    dimension: "Feet",
    humidity: "Grains / Pound",
    volume: "Pint",
  },
  copyPhotosToGallery: true,
  defaultView: "Timeline",
};

import { BackgroundSyncService } from "../services/SyncService";

export const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [accessToken, setAccessToken] = useState<string>("");
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("app-settings");
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem("app-settings", JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save settings to localStorage:", e);
      }
      return updated;
    });
    EventBus.publish(
      "com.restorationai.settings.updated",
      { changes: newSettings },
      undefined,
      "Preferences Saved Successfully",
      "success",
    );
  };

  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>(
      typeof window !== "undefined" && "Notification" in window
        ? window.Notification.permission
        : "default",
    );

  const addNotification = (n: AppNotification) => {
    setNotifications((prev) => [n, ...prev].slice(0, 50));
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const requestNotificationPermission = async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      console.warn("This browser does not support desktop notifications");
      return false;
    }
    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);
    return permission === "granted";
  };

  useEffect(() => {
    const unsub = EventBus.on("*", (event) => {
      if (event.ui) {
        addNotification({
          id: event.id,
          type: event.type,
          title: event.type.split(".").pop()?.toUpperCase() || "NOTIFICATION",
          message: event.ui.message,
          level: event.ui.level,
          timestamp: event.time,
          read: false,
          subject: event.subject,
        });

        // Show browser notification if permitted and tab is hidden
        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          window.Notification.permission === "granted" &&
          document.hidden
        ) {
          try {
            new window.Notification(
              event.type.split(".").pop()?.toUpperCase() || "NOTIFICATION",
              {
                body: event.ui.message,
                icon: "/favicon.ico",
              },
            );
          } catch (e) {
            console.error("Error showing browser notification:", e);
          }
        }
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      BackgroundSyncService.syncPendingChanges();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Map Firebase user to App User type
        const loggedInUser: User = {
          id: user.uid,
          name: user.displayName || 'User',
          email: user.email || '',
          role: 'SuperAdmin' as UserRole,
          permissions: ['manage_users', 'view_billing', 'manage_billing', 'view_projects', 'edit_projects', 'view_admin', 'use_ai_tools', 'manage_company'],
          companyId: 'company-1'
        };
        setCurrentUser(loggedInUser);
        setIsAuthenticated(true);
      } else {
        setCurrentUser(null);
        setIsAuthenticated(false);
      }
    });

    return () => unsub();
  }, []);

  const addScanToProject = async (projectId: string, scan: RoomScan) => {
    console.log("Add scan to project", projectId, scan);
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === "SuperAdmin") return true;
    return currentUser.permissions.includes(permission);
  };

  const value = {
    activeTab,
    setActiveTab,
    selectedProjectId,
    setSelectedProjectId,
    currentUser,
    setCurrentUser,
    isAuthenticated,
    setAuthentication: (status: boolean) => setIsAuthenticated(status),
    accessToken,
    setAccessToken,
    addScanToProject,
    isOnline,
    hasPermission,
    settings,
    updateSettings,
    isSearchOpen,
    setIsSearchOpen,
    notifications,
    addNotification,
    markNotificationAsRead,
    markAllAsRead,
    clearNotifications,
    requestNotificationPermission,
    notificationPermission,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
};
