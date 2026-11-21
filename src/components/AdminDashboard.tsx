import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  X,
  RefreshCw,
  FileWarning,
  CheckCircle2,
  XCircle,
  Trash2,
  Search,
  Eye,
  Users,
  UserPlus,
  Crown,
  Scale,
  AlertTriangle,
  Camera,
  Check,
  Mail,
  CreditCard,
  UserCheck
} from "lucide-react";

const SUPER_ADMIN_EMAIL = "adamu0533@gmail.com";

export interface ReportAppealAdmin {
  appellantName: string;
  appellantEmail: string;
  appellantRole: string;
  reason: string;
  explanation: string;
  evidenceLinksOrText?: string;
  isVerifiedSenderMatch?: boolean;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface CommunityReportAdmin {
  id: string;
  senderDisplayName: string;
  senderEmail: string;
  subject: string;
  recipientEmail?: string;
  dateReceived?: string;
  emailProvider?: string;
  bodyExcerpt?: string;
  suspiciousUrls?: string[];
  headers?: string;
  screenshotUrl?: string;
  reasons: string[];
  userNotes?: string;
  redFlagsObserved?: string[];
  targetBrand?: string;
  isAnonymous?: boolean;
  submittedByUserId?: string;
  submittedByUserEmail?: string;
  status: "pending_review" | "approved" | "rejected";
  moderationNotes?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  hasAppeal?: boolean;
  appeal?: ReportAppealAdmin;
  createdAt: string;
  updatedAt?: string;
}

interface AdminRecord {
  id: string;
  email: string;
  name?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  createdAt?: string;
}

interface AdminInviteRecord {
  email: string;
  addedBy: string;
  createdAt: string;
}

interface AdminDashboardProps {
  currentUser?: {
    id: string;
    email: string;
    name?: string;
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
  } | null;
}

export default function AdminDashboard({ currentUser }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<"users" | "reports" | "appeals" | "admins">("users");
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<CommunityReportAdmin[]>([]);
  const [adminsList, setAdminsList] = useState<AdminRecord[]>([]);
  const [adminInvites, setAdminInvites] = useState<AdminInviteRecord[]>([]);
  const [meUser, setMeUser] = useState<any>(currentUser || null);

  const [loading, setLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Toast/Status Banner
  const [actionBanner, setActionBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Users tab state
  const [userSearch, setUserSearch] = useState("");
  const [userPlanFilter, setUserPlanFilter] = useState<"all" | "paid" | "free">("all");

  // Reports moderation state
  const [reportFilter, setReportFilter] = useState<"all" | "pending_review" | "approved" | "appealed" | "rejected">("all");
  const [reportSearch, setReportSearch] = useState("");
  const [inspectReport, setInspectReport] = useState<CommunityReportAdmin | null>(null);
  const [moderationActionLoading, setModerationActionLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Rejection modal state (replaces window.prompt)
  const [rejectModalReport, setRejectModalReport] = useState<CommunityReportAdmin | null>(null);
  const [rejectNotes, setRejectNotes] = useState("Insufficient evidence or duplicate submission.");

  // Confirm modal state (replaces window.confirm)
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    tone: "danger" | "primary" | "success";
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  // Appeals state
  const [appealFilter, setAppealFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [appealReviewNotes, setAppealReviewNotes] = useState<Record<string, string>>({});
  const [appealActionLoading, setAppealActionLoading] = useState<string | null>(null);

  // Super Admin management state
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);

  const showBanner = (type: "success" | "error", text: string) => {
    setActionBanner({ type, text });
    setTimeout(() => {
      setActionBanner(prev => (prev?.text === text ? null : prev));
    }, 5000);
  };

  const getAuthHeaders = (extra?: Record<string, string>): Record<string, string> => {
    const uid = meUser?.id || currentUser?.id;
    return {
      ...(uid ? { "x-firebase-uid": uid } : {}),
      ...(extra || {})
    };
  };

  const isSuperAdmin = Boolean(
    meUser?.isSuperAdmin ||
    currentUser?.isSuperAdmin ||
    meUser?.email?.toLowerCase().trim() === SUPER_ADMIN_EMAIL ||
    currentUser?.email?.toLowerCase().trim() === SUPER_ADMIN_EMAIL
  );

  const fetchUsersAndAuth = async () => {
    try {
      const meRes = await fetch("/api/auth/me", { headers: getAuthHeaders() });
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData?.user) {
          setMeUser(meData.user);
        }
        const canAccess = Boolean(
          meData?.user?.isAdmin ||
          meData?.user?.isSuperAdmin ||
          meData?.user?.email?.toLowerCase().trim() === SUPER_ADMIN_EMAIL ||
          currentUser?.isAdmin ||
          currentUser?.isSuperAdmin
        );
        if (canAccess) {
          setIsAuthorized(true);
        } else {
          setLoading(false);
          return;
        }
      }

      const response = await fetch("/api/admin/users", { headers: getAuthHeaders() });
      if (response.ok) {
        const usersList = await response.json();
        setAdminUsers(Array.isArray(usersList) ? usersList : []);
      }
    } catch (e) {
      console.error("Error fetching users", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchReports = async () => {
    setReportsLoading(true);
    try {
      const res = await fetch("/api/admin/reports", { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (e) {
      console.error("Error fetching reports", e);
    } finally {
      setReportsLoading(false);
    }
  };

  const fetchAdmins = async () => {
    setAdminsLoading(true);
    try {
      const res = await fetch("/api/admin/admins", { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAdminsList(data.admins || []);
        setAdminInvites(data.invites || []);
      }
    } catch (e) {
      console.error("Error fetching admins", e);
    } finally {
      setAdminsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsersAndAuth();
    fetchReports();
    fetchAdmins();
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex justify-center text-navy/50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange"></div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="p-8 text-center bg-white rounded-3xl border border-navy/10 mt-8">
        <h2 className="text-xl font-black text-navy uppercase tracking-widest mb-4">Access Denied</h2>
        <p className="text-navy/60 font-medium">You do not have administrative privileges.</p>
      </div>
    );
  }

  // User Actions
  const handleDeleteUser = (u: any) => {
    if (u.isSuperAdmin || u.email?.toLowerCase().trim() === SUPER_ADMIN_EMAIL) {
      showBanner("error", "The Super Admin account cannot be deleted.");
      return;
    }
    if (u.isAdmin && !isSuperAdmin) {
      showBanner("error", "Only the Super Admin can delete another admin account.");
      return;
    }

    setConfirmAction({
      title: "Delete User Account",
      message: `Are you sure you want to permanently purge ${u.email} from the database?`,
      confirmLabel: "Delete User",
      tone: "danger",
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/admin/users/${u.id}`, {
            method: "DELETE",
            headers: getAuthHeaders()
          });
          if (response.ok) {
            setAdminUsers(prev => prev.filter(item => item.id !== u.id));
            setAdminsList(prev => prev.filter(item => item.id !== u.id));
            showBanner("success", `User ${u.email} deleted.`);
          } else {
            const err = await response.json().catch(() => ({}));
            showBanner("error", err.error || "Failed to delete user.");
          }
        } catch (e) {
          showBanner("error", "Network error deleting user.");
        }
      }
    });
  };

  const toggleUserSubscription = (user: any) => {
    const isPremium = user.subscription && user.subscription.plan !== "free";
    const actionLabel = isPremium ? "Downgrade to Free" : "Upgrade to Pro";

    setConfirmAction({
      title: `${actionLabel}`,
      message: `Change subscription plan for ${user.email} to ${isPremium ? "Free" : "Pro (30 Days)"}?`,
      confirmLabel: actionLabel,
      tone: "primary",
      onConfirm: async () => {
        try {
          const newSub = {
            ...user.subscription,
            plan: isPremium ? "free" : "pro",
            currentPeriodEnd: isPremium ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          };
          const response = await fetch(`/api/admin/users/${user.id}/subscription`, {
            method: "POST",
            headers: getAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ subscription: newSub })
          });

          if (response.ok) {
            const updated = await response.json();
            setAdminUsers(prev =>
              prev.map(u =>
                u.id === user.id
                  ? {
                      ...u,
                      subscription: updated.subscription,
                      status: updated.subscription.plan === "free" ? "inactive" : "active"
                    }
                  : u
              )
            );
            showBanner("success", `Updated ${user.email} to ${newSub.plan.toUpperCase()} plan.`);
          } else {
            showBanner("error", "Failed to update subscription.");
          }
        } catch (e) {
          showBanner("error", "Error updating subscription.");
        }
      }
    });
  };

  const handleDownload = () => {
    const rows = [
      ["Name", "Email", "Role", "Plan"],
      ...adminUsers.map(u => [
        `"${u.name || "Unknown"}"`,
        `"${u.email || "N/A"}"`,
        `"${u.isSuperAdmin ? "Super Admin" : u.isAdmin ? "Admin" : "User"}"`,
        `"${u.subscription?.plan || "free"}"`
      ])
    ];
    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(rows.map(e => e.join(",")).join("\n"));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", csvContent);
    downloadAnchorNode.setAttribute("download", "users.csv");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    showBanner("success", "Exported users.csv successfully.");
  };

  // Report Moderation Actions (Admin Only)
  const executeModerateReport = async (id: string, status: "approved" | "rejected", moderationNotes = "") => {
    setModerationActionLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status, moderationNotes })
      });
      if (res.ok) {
        const json = await res.json();
        setReports(prev => prev.map(r => (r.id === id ? json.report : r)));
        if (inspectReport?.id === id) {
          setInspectReport(json.report);
        }
        showBanner(
          "success",
          status === "approved"
            ? "Report approved and published to the public directory."
            : "Report marked as rejected."
        );
      } else {
        const err = await res.json().catch(() => ({}));
        showBanner("error", err.error || "Failed to update report status.");
      }
    } catch (e) {
      showBanner("error", "Error contacting server.");
    } finally {
      setModerationActionLoading(false);
    }
  };

  const handleApproveReport = (rep: CommunityReportAdmin) => {
    setConfirmAction({
      title: "Approve & Publish Reported Email",
      message: `Approve "${rep.senderEmail}" (${rep.subject})? Once approved, this report will be publicly visible so other users can see that this email address has been reported.`,
      confirmLabel: "Approve & Make Public",
      tone: "success",
      onConfirm: () => executeModerateReport(rep.id, "approved", rep.moderationNotes || "")
    });
  };

  const handleRejectReportPrompt = (rep: CommunityReportAdmin) => {
    setRejectNotes(rep.moderationNotes || "Insufficient evidence or duplicate submission.");
    setRejectModalReport(rep);
  };

  const handleDeleteReport = (rep: CommunityReportAdmin) => {
    const statusLabel = rep.status === "approved" ? "APPROVED (PUBLIC)" : rep.status === "pending_review" ? "PENDING" : "REJECTED";
    setConfirmAction({
      title: "Permanently Delete Report",
      message: `Delete this ${statusLabel} report for "${rep.senderEmail}"? This action cannot be undone and is restricted strictly to administrators.`,
      confirmLabel: "Delete Permanently",
      tone: "danger",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/reports/${rep.id}`, {
            method: "DELETE",
            headers: getAuthHeaders()
          });
          if (res.ok) {
            setReports(prev => prev.filter(r => r.id !== rep.id));
            if (inspectReport?.id === rep.id) setInspectReport(null);
            showBanner("success", `Report for ${rep.senderEmail} permanently deleted.`);
          } else {
            const err = await res.json().catch(() => ({}));
            showBanner("error", err.error || "Failed to delete report.");
          }
        } catch (e) {
          showBanner("error", "Error deleting report.");
        }
      }
    });
  };

  // Owner Appeal Actions
  const handleResolveAppeal = async (
    rep: CommunityReportAdmin,
    decision: "approved" | "rejected",
    deleteReport = false
  ) => {
    const notes = appealReviewNotes[rep.id]?.trim() || "";
    setAppealActionLoading(rep.id);
    try {
      const res = await fetch(`/api/admin/reports/${rep.id}/appeal`, {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          decision,
          reviewNotes: notes,
          deleteReport
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.deleted) {
          setReports(prev => prev.filter(r => r.id !== rep.id));
          if (inspectReport?.id === rep.id) setInspectReport(null);
          showBanner("success", `Appeal upheld and report for ${rep.senderEmail} deleted.`);
        } else if (json.report) {
          setReports(prev => prev.map(r => (r.id === rep.id ? json.report : r)));
          if (inspectReport?.id === rep.id) setInspectReport(json.report);
          showBanner(
            "success",
            decision === "approved"
              ? `Appeal upheld: report for ${rep.senderEmail} unpublished from public view.`
              : `Appeal dismissed: report for ${rep.senderEmail} remains active.`
          );
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showBanner("error", err.error || "Failed to resolve appeal.");
      }
    } catch (e) {
      showBanner("error", "Network error resolving appeal.");
    } finally {
      setAppealActionLoading(null);
    }
  };

  // Super Admin Actions
  const handleAddAdmin = async (emailToPromote: string) => {
    const cleanEmail = emailToPromote.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      showBanner("error", "Please enter a valid email address.");
      return;
    }
    setAddingAdmin(true);
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: cleanEmail })
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setNewAdminEmail("");
        await Promise.all([fetchAdmins(), fetchUsersAndAuth()]);
        if (json.mode === "promoted") {
          showBanner("success", `${cleanEmail} has been promoted to Admin.`);
        } else {
          showBanner("success", `Admin invite added for ${cleanEmail}. They will receive Admin access as soon as they register or sign in.`);
        }
      } else {
        showBanner("error", json.error || "Failed to add admin.");
      }
    } catch (e) {
      showBanner("error", "Error contacting server.");
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleRemoveAdmin = (identifier: string, label: string) => {
    setConfirmAction({
      title: "Revoke Admin Privileges",
      message: `Remove administrator privileges from ${label}? They will retain their regular user account if registered.`,
      confirmLabel: "Revoke Admin",
      tone: "danger",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/admins/${encodeURIComponent(identifier)}`, {
            method: "DELETE",
            headers: getAuthHeaders()
          });
          const json = await res.json().catch(() => ({}));
          if (res.ok) {
            await Promise.all([fetchAdmins(), fetchUsersAndAuth()]);
            showBanner("success", `Admin privileges revoked for ${label}.`);
          } else {
            showBanner("error", json.error || "Failed to revoke admin.");
          }
        } catch (e) {
          showBanner("error", "Network error removing admin.");
        }
      }
    });
  };

  // Derived Metrics
  const freeCount = adminUsers.filter(u => !u.subscription || u.subscription.plan === "free").length;
  const paidCount = adminUsers.filter(u => u.subscription && u.subscription.plan !== "free").length;

  const pendingCount = reports.filter(r => r.status === "pending_review").length;
  const approvedCount = reports.filter(r => r.status === "approved").length;
  const rejectedCount = reports.filter(r => r.status === "rejected").length;
  const appealedReports = reports.filter(r => r.hasAppeal && r.appeal);
  const pendingAppealsCount = appealedReports.filter(r => r.appeal?.status === "pending").length;

  const filteredUsers = adminUsers.filter(u => {
    const isPaid = u.subscription && u.subscription.plan !== "free";
    if (userPlanFilter === "paid" && !isPaid) return false;
    if (userPlanFilter === "free" && isPaid) return false;
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase().trim();
      if (!u.email?.toLowerCase().includes(q) && !u.name?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const filteredReports = reports.filter(r => {
    if (reportFilter === "appealed") {
      if (!r.hasAppeal) return false;
    } else if (reportFilter !== "all" && r.status !== reportFilter) {
      return false;
    }
    if (reportSearch.trim()) {
      const q = reportSearch.toLowerCase().trim();
      const matchEmail = r.senderEmail?.toLowerCase().includes(q);
      const matchName = r.senderDisplayName?.toLowerCase().includes(q);
      const matchSubject = r.subject?.toLowerCase().includes(q);
      const matchBrand = r.targetBrand?.toLowerCase().includes(q);
      if (!matchEmail && !matchName && !matchSubject && !matchBrand) return false;
    }
    return true;
  });

  const filteredAppeals = appealedReports.filter(r => {
    if (appealFilter === "all") return true;
    return r.appeal?.status === appealFilter;
  });

  return (
    <motion.div
      key="admin"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-6"
    >
      {/* Top Header */}
      <div className="flex flex-col gap-4 border-b border-navy/10 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-display font-black uppercase italic tracking-tighter text-navy flex items-center gap-2">
                <Shield className="w-6 h-6 text-orange" />
                Admin Operations Core
              </h2>
              {isSuperAdmin && (
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-orange/15 text-orange border border-orange/30 flex items-center gap-1">
                  <Crown className="w-3 h-3" />
                  Super Admin
                </span>
              )}
            </div>
            <p className="text-xs text-navy/50 font-medium mt-1">
              Signed in as <span className="font-mono font-bold text-navy">{meUser?.email || currentUser?.email}</span> • User analytics, reported emails database, owner appeals & admin governance.
            </p>
          </div>
          <button
            onClick={() => {
              fetchUsersAndAuth();
              fetchReports();
              fetchAdmins();
            }}
            className="self-start sm:self-auto px-4 py-2 bg-navy/5 hover:bg-navy/10 text-navy rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync All
          </button>
        </div>

        {/* Always-Visible KPI Overview Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-4 bg-white rounded-2xl border border-navy/10 shadow-sm flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-widest text-navy/40">Total Users</span>
            <span className="text-2xl font-display font-black text-navy mt-1">{adminUsers.length}</span>
            <span className="text-[10px] text-navy/40 font-medium mt-0.5">Registered accounts</span>
          </div>
          <div className="p-4 bg-orange/5 rounded-2xl border border-orange/20 shadow-sm flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-widest text-orange">Subscribed (Paid)</span>
            <span className="text-2xl font-display font-black text-orange mt-1">{paidCount}</span>
            <span className="text-[10px] text-navy/50 font-medium mt-0.5">
              {adminUsers.length > 0 ? `${Math.round((paidCount / adminUsers.length) * 100)}% conversion` : "0% conversion"}
            </span>
          </div>
          <div className="p-4 bg-navy/[0.03] rounded-2xl border border-navy/10 shadow-sm flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-widest text-navy/50">Free Users</span>
            <span className="text-2xl font-display font-black text-navy mt-1">{freeCount}</span>
            <span className="text-[10px] text-navy/40 font-medium mt-0.5">Free tier accounts</span>
          </div>
          <button
            onClick={() => {
              setActiveTab("reports");
              setReportFilter("pending_review");
            }}
            className="p-4 bg-amber-500/10 hover:bg-amber-500/15 rounded-2xl border border-amber-500/20 shadow-sm flex flex-col text-left transition-colors cursor-pointer"
          >
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-800">Pending Reports</span>
            <span className="text-2xl font-display font-black text-amber-600 mt-1">{pendingCount}</span>
            <span className="text-[10px] text-amber-800/70 font-medium mt-0.5">{approvedCount} public</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("appeals");
              setAppealFilter("pending");
            }}
            className="p-4 bg-blue-500/10 hover:bg-blue-500/15 rounded-2xl border border-blue-500/20 shadow-sm flex flex-col text-left transition-colors cursor-pointer col-span-2 sm:col-span-1"
          >
            <span className="text-[9px] font-black uppercase tracking-widest text-blue-800">Owner Appeals</span>
            <span className="text-2xl font-display font-black text-blue-600 mt-1">{pendingAppealsCount}</span>
            <span className="text-[10px] text-blue-800/70 font-medium mt-0.5">{appealedReports.length} total appeals</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap bg-navy/[0.04] p-1.5 rounded-2xl border border-navy/10 gap-1.5">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "users" ? "bg-white text-navy shadow-sm" : "text-navy/50 hover:text-navy"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Users ({adminUsers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("reports")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "reports" ? "bg-white text-navy shadow-sm" : "text-navy/50 hover:text-navy"
            }`}
          >
            <FileWarning className="w-4 h-4 text-orange" />
            <span>Reported Emails Database</span>
            {pendingCount > 0 && (
              <span className="bg-red-500 text-white text-[9px] px-2 py-0.5 rounded-full font-black animate-pulse">
                {pendingCount} Pending
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("appeals")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "appeals" ? "bg-white text-navy shadow-sm" : "text-navy/50 hover:text-navy"
            }`}
          >
            <Scale className="w-4 h-4 text-blue-600" />
            <span>Owner Appeals</span>
            {pendingAppealsCount > 0 && (
              <span className="bg-blue-600 text-white text-[9px] px-2 py-0.5 rounded-full font-black">
                {pendingAppealsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("admins")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "admins" ? "bg-white text-navy shadow-sm" : "text-navy/50 hover:text-navy"
            }`}
          >
            <Crown className="w-4 h-4 text-orange" />
            <span>Admins ({adminsList.length})</span>
          </button>
        </div>
      </div>

      {/* Inline Feedback Banner */}
      {actionBanner && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
            actionBanner.type === "success"
              ? "bg-green-50 text-green-800 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {actionBanner.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{actionBanner.text}</span>
          </div>
          <button onClick={() => setActionBanner(null)} className="p-1 hover:bg-black/5 rounded-lg cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB 1: USERS MANAGEMENT */}
      {activeTab === "users" && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-navy/10">
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              {(["all", "paid", "free"] as const).map(planTab => (
                <button
                  key={planTab}
                  onClick={() => setUserPlanFilter(planTab)}
                  className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    userPlanFilter === planTab
                      ? "bg-navy text-white shadow-sm"
                      : "bg-navy/[0.04] text-navy/60 hover:text-navy"
                  }`}
                >
                  {planTab === "all"
                    ? `All Users (${adminUsers.length})`
                    : planTab === "paid"
                    ? `Subscribed (${paidCount})`
                    : `Free (${freeCount})`}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-navy/40" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search user name or email..."
                  className="w-full pl-9 pr-4 py-2 bg-navy/[0.03] border border-navy/10 rounded-xl text-xs font-medium text-navy placeholder:text-navy/40 focus:outline-none focus:border-orange"
                />
              </div>
              <button
                onClick={handleDownload}
                className="px-3.5 py-2 bg-orange/10 hover:bg-orange/20 text-orange border border-orange/20 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <span>Export CSV</span>
                <ArrowRight className="w-3.5 h-3.5 rotate-90" />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-navy/10 overflow-hidden shadow-2xl shadow-navy/5">
            <div className="p-6 border-b border-navy/10 flex justify-between items-center bg-navy/[0.02]">
              <h3 className="text-xs font-black uppercase tracking-widest text-navy">
                Identity Database ({filteredUsers.length})
              </h3>
            </div>
            <div className="p-6 max-h-[440px] overflow-y-auto">
              <div className="space-y-3">
                {filteredUsers.map(u => {
                  const isPaid = u.subscription && u.subscription.plan !== "free";
                  const targetIsSuper = u.isSuperAdmin || u.email?.toLowerCase().trim() === SUPER_ADMIN_EMAIL;
                  return (
                    <div
                      key={u.id}
                      className="p-4 bg-white rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-navy/10 shadow-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-navy/5 rounded-xl flex items-center justify-center shrink-0">
                          <span className="text-orange font-bold font-display uppercase">
                            {u.name?.charAt(0) || u.email?.charAt(0) || "U"}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-black text-sm text-navy tracking-tight truncate">
                              {u.name || "Registered User"}
                            </p>
                            <span
                              className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-full ${
                                !isPaid ? "bg-navy/10 text-navy" : "bg-orange/15 text-orange"
                              }`}
                            >
                              {!isPaid ? "FREE" : `PAID (${u.subscription.plan.toUpperCase()})`}
                            </span>
                            {targetIsSuper ? (
                              <span className="px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                <Crown className="w-2.5 h-2.5" />
                                SUPER ADMIN
                              </span>
                            ) : u.isAdmin ? (
                              <span className="px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                                ADMIN
                              </span>
                            ) : null}
                          </div>
                          <p className="text-[11px] font-mono tracking-tight text-navy/60 truncate">{u.email}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 shrink-0">
                        <button
                          onClick={() => toggleUserSubscription(u)}
                          className="px-3.5 py-2 text-orange bg-orange/10 hover:bg-orange/20 rounded-xl transition-colors text-[9px] font-black uppercase tracking-widest border border-orange/20 cursor-pointer"
                        >
                          {!isPaid ? "Upgrade" : "Downgrade"}
                        </button>

                        {isSuperAdmin && !targetIsSuper && (
                          u.isAdmin ? (
                            <button
                              onClick={() => handleRemoveAdmin(u.id, u.email)}
                              className="px-3.5 py-2 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors text-[9px] font-black uppercase tracking-widest border border-blue-200 cursor-pointer"
                            >
                              Revoke Admin
                            </button>
                          ) : (
                            <button
                              onClick={() => handleAddAdmin(u.email)}
                              className="px-3.5 py-2 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors text-[9px] font-black uppercase tracking-widest border border-blue-200 cursor-pointer"
                            >
                              Make Admin
                            </button>
                          )
                        )}

                        {!targetIsSuper && (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="px-3.5 py-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition-colors text-[9px] font-black uppercase tracking-widest border border-red-500/10 cursor-pointer"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <div className="text-center py-8 text-[10px] font-black uppercase tracking-widest text-navy/30">
                    No user accounts match your filter
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-navy/10 overflow-hidden shadow-2xl shadow-navy/5">
            <div className="p-6 border-b border-navy/10 flex justify-between items-center bg-navy/[0.02]">
              <h3 className="text-xs font-black uppercase tracking-widest text-navy flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-orange" />
                Live Transactions (All Users)
              </h3>
            </div>
            <div className="p-6 max-h-[280px] overflow-y-auto">
              <div className="space-y-3">
                {(() => {
                  const allInvoices = adminUsers.flatMap(u =>
                    (u.subscription?.invoices || []).map((inv: any) => ({
                      ...inv,
                      userEmail: u.email,
                      userName: u.name
                    }))
                  );
                  allInvoices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                  if (allInvoices.length === 0) {
                    return (
                      <div className="text-center py-8 text-[10px] font-black uppercase tracking-widest text-navy/30">
                        No transactions found
                      </div>
                    );
                  }

                  return allInvoices.map((inv, idx) => (
                    <div key={idx} className="p-4 bg-white rounded-2xl flex items-center justify-between border border-navy/10 shadow-sm">
                      <div>
                        <p className="font-black text-sm text-navy tracking-tight">{inv.amount}</p>
                        <p className="text-[10px] font-mono tracking-tighter text-navy/50">
                          {inv.userName} ({inv.userEmail})
                        </p>
                        <p className="text-[10px] font-mono tracking-tighter text-navy/40">Ref: {inv.id}</p>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-full bg-green-500/10 text-green-600">
                          {inv.status}
                        </span>
                        <p className="text-[10px] font-mono tracking-tighter text-navy/40 mt-1">{inv.date}</p>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: REPORTED EMAILS DATABASE */}
      {activeTab === "reports" && (
        <div className="space-y-6">
          {/* Policy & Stats Strip */}
          <div className="p-4 bg-navy/[0.03] border border-navy/10 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-navy font-semibold">
              <ShieldCheck className="w-4 h-4 text-orange shrink-0" />
              <span>
                Only verified admins can approve pending reports for public visibility or delete pending and approved reports.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-4 bg-navy/[0.03] rounded-2xl border border-navy/10 flex flex-col items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-navy/40 mb-1">Total Reports</span>
              <span className="text-2xl font-display font-black text-navy">{reports.length}</span>
            </div>
            <div className="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20 flex flex-col items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">Pending Approval</span>
              <span className="text-2xl font-display font-black text-amber-600">{pendingCount}</span>
            </div>
            <div className="p-4 bg-green-500/10 rounded-2xl border border-green-500/20 flex flex-col items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-green-700 mb-1">Approved (Public)</span>
              <span className="text-2xl font-display font-black text-green-600">{approvedCount}</span>
            </div>
            <div className="p-4 bg-blue-500/10 rounded-2xl border border-blue-500/20 flex flex-col items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-700 mb-1">Appealed</span>
              <span className="text-2xl font-display font-black text-blue-600">{appealedReports.length}</span>
            </div>
            <div className="p-4 bg-red-500/10 rounded-2xl border border-red-500/20 flex flex-col items-center col-span-2 md:col-span-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-red-700 mb-1">Rejected</span>
              <span className="text-2xl font-display font-black text-red-600">{rejectedCount}</span>
            </div>
          </div>

          {/* Filtering & Search Controls */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-navy/10">
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              {(["all", "pending_review", "approved", "appealed", "rejected"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setReportFilter(tab)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    reportFilter === tab
                      ? "bg-navy text-white shadow-sm"
                      : "bg-navy/[0.04] text-navy/60 hover:text-navy hover:bg-navy/[0.08]"
                  }`}
                >
                  {tab === "all"
                    ? `All (${reports.length})`
                    : tab === "pending_review"
                    ? `Pending (${pendingCount})`
                    : tab === "approved"
                    ? `Approved (${approvedCount})`
                    : tab === "appealed"
                    ? `Appealed (${appealedReports.length})`
                    : `Rejected (${rejectedCount})`}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-navy/40" />
              <input
                type="text"
                value={reportSearch}
                onChange={e => setReportSearch(e.target.value)}
                placeholder="Search sender, subject, brand..."
                className="w-full pl-9 pr-4 py-2 bg-navy/[0.03] border border-navy/10 rounded-xl text-xs font-medium text-navy placeholder:text-navy/40 focus:outline-none focus:border-orange"
              />
            </div>
          </div>

          {/* Reported Emails Database Table/List */}
          <div className="bg-white rounded-3xl border border-navy/10 overflow-hidden shadow-2xl shadow-navy/5">
            <div className="p-6 border-b border-navy/10 flex justify-between items-center bg-navy/[0.02]">
              <h3 className="text-xs font-black uppercase tracking-widest text-navy">
                Reported Emails Database ({filteredReports.length})
              </h3>
              <button
                onClick={fetchReports}
                className="flex items-center gap-1.5 text-xs font-bold text-orange hover:text-orange/80 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reportsLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>

            <div className="divide-y divide-navy/5">
              {filteredReports.map(rep => (
                <div
                  key={rep.id}
                  className="p-5 hover:bg-navy/[0.01] transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                          rep.status === "approved"
                            ? "bg-green-100 text-green-700 border border-green-200"
                            : rep.status === "pending_review"
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-red-100 text-red-700 border border-red-200"
                        }`}
                      >
                        {rep.status === "pending_review"
                          ? "Pending Approval"
                          : rep.status === "approved"
                          ? "Approved • Public"
                          : "Rejected"}
                      </span>

                      {rep.hasAppeal && rep.appeal && (
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                            rep.appeal.status === "pending"
                              ? "bg-blue-100 text-blue-800 border-blue-200"
                              : rep.appeal.status === "approved"
                              ? "bg-purple-100 text-purple-800 border-purple-200"
                              : "bg-navy/5 text-navy/60 border-navy/10"
                          }`}
                        >
                          {rep.appeal.status === "pending"
                            ? "Appeal Pending"
                            : rep.appeal.status === "approved"
                            ? "Appeal Upheld"
                            : "Appeal Dismissed"}
                        </span>
                      )}

                      {rep.screenshotUrl && (
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-navy/5 text-navy/70 border border-navy/10 flex items-center gap-1">
                          <Camera className="w-3 h-3 text-orange" />
                          Screenshot
                        </span>
                      )}

                      {rep.targetBrand && (
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-navy/5 text-navy border border-navy/10">
                          Target: {rep.targetBrand}
                        </span>
                      )}

                      <span className="text-[10px] font-mono text-navy/40">
                        {new Date(rep.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <h4 className="font-display font-black text-sm text-navy truncate">{rep.subject}</h4>

                    <p className="text-xs font-mono text-navy/70 truncate">
                      <span className="font-bold text-navy">{rep.senderDisplayName || "Unknown"}</span> &lt;
                      {rep.senderEmail}&gt;
                    </p>

                    <div className="flex flex-wrap gap-1 pt-1">
                      {rep.reasons?.map((reason, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-orange/10 text-orange rounded text-[9px] font-bold">
                          {reason}
                        </span>
                      ))}
                    </div>

                    {rep.userNotes && (
                      <p className="text-xs text-navy/60 italic line-clamp-1 mt-1 bg-navy/[0.02] p-2 rounded-lg border border-navy/5">
                        "{rep.userNotes}"
                      </p>
                    )}
                  </div>

                  {/* Admin Moderation & Delete Controls (Available on both Pending and Approved) */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => setInspectReport(rep)}
                      className="px-3 py-2 bg-navy/5 hover:bg-navy/10 text-navy rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Inspect
                    </button>

                    {rep.status !== "approved" && (
                      <button
                        onClick={() => handleApproveReport(rep)}
                        disabled={moderationActionLoading}
                        className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                        title="Approve and make publicly visible"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve
                      </button>
                    )}

                    {rep.status !== "rejected" && (
                      <button
                        onClick={() => handleRejectReportPrompt(rep)}
                        disabled={moderationActionLoading}
                        className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        title="Reject / Unpublish report"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        {rep.status === "approved" ? "Unpublish" : "Reject"}
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteReport(rep)}
                      className="px-3 py-2 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Admins only: Permanently delete pending or approved report"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}

              {filteredReports.length === 0 && (
                <div className="py-12 text-center text-navy/40 text-xs font-bold uppercase tracking-widest">
                  No reported emails matching current filter
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: OWNER APPEALS */}
      {activeTab === "appeals" && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-navy/10">
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              {(["all", "pending", "approved", "rejected"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setAppealFilter(tab)}
                  className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    appealFilter === tab
                      ? "bg-navy text-white shadow-sm"
                      : "bg-navy/[0.04] text-navy/60 hover:text-navy"
                  }`}
                >
                  {tab === "all"
                    ? `All Appeals (${appealedReports.length})`
                    : tab === "pending"
                    ? `Pending Review (${pendingAppealsCount})`
                    : tab === "approved"
                    ? `Upheld (${appealedReports.filter(r => r.appeal?.status === "approved").length})`
                    : `Dismissed (${appealedReports.filter(r => r.appeal?.status === "rejected").length})`}
                </button>
              ))}
            </div>
            <button
              onClick={fetchReports}
              className="flex items-center gap-1.5 text-xs font-bold text-orange hover:text-orange/80 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${reportsLoading ? "animate-spin" : ""}`} />
              Refresh Appeals
            </button>
          </div>

          <div className="space-y-4">
            {filteredAppeals.map(rep => {
              const appeal = rep.appeal!;
              const isBusy = appealActionLoading === rep.id;
              return (
                <div
                  key={rep.id}
                  className="bg-white rounded-3xl border border-navy/10 p-6 shadow-sm space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-navy/10 pb-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                            appeal.status === "pending"
                              ? "bg-blue-100 text-blue-800 border-blue-200"
                              : appeal.status === "approved"
                              ? "bg-green-100 text-green-700 border-green-200"
                              : "bg-red-100 text-red-700 border-red-200"
                          }`}
                        >
                          Appeal: {appeal.status === "pending" ? "Pending Review" : appeal.status === "approved" ? "Upheld" : "Dismissed"}
                        </span>

                        {appeal.isVerifiedSenderMatch && (
                          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            Verified Sender Email Match
                          </span>
                        )}

                        <span className="text-[10px] font-mono text-navy/40">
                          Submitted {new Date(appeal.submittedAt).toLocaleString()}
                        </span>
                      </div>

                      <h4 className="font-display font-black text-base text-navy">{rep.subject}</h4>
                      <p className="text-xs font-mono text-navy/70">
                        Reported Email: <span className="font-bold text-red-700">{rep.senderEmail}</span> • Report Status:{" "}
                        <span className="uppercase font-bold">{rep.status}</span>
                      </p>
                    </div>

                    <button
                      onClick={() => setInspectReport(rep)}
                      className="self-start px-3.5 py-2 bg-navy/5 hover:bg-navy/10 text-navy rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Inspect Report
                    </button>
                  </div>

                  {/* Appellant Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-navy/[0.02] rounded-2xl border border-navy/5 text-xs">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-navy/40 block">Appellant</span>
                      <span className="font-bold text-navy">{appeal.appellantName}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-navy/40 block">Owner Contact Email</span>
                      <span className="font-mono font-bold text-navy">{appeal.appellantEmail}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-navy/40 block">Role / Authority</span>
                      <span className="font-bold text-orange">{appeal.appellantRole}</span>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-navy/40 block mb-1">
                        Appeal Reason
                      </span>
                      <span className="inline-block px-3 py-1 bg-blue-50 text-blue-900 border border-blue-200 rounded-xl font-bold">
                        {appeal.reason}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-navy/40 block mb-1">
                        Owner Explanation
                      </span>
                      <p className="p-3.5 bg-navy/[0.02] border border-navy/10 rounded-2xl text-navy/80 leading-relaxed whitespace-pre-wrap">
                        {appeal.explanation}
                      </p>
                    </div>

                    {appeal.evidenceLinksOrText && (
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-wider text-navy/40 block mb-1">
                          Supporting Verification / Evidence
                        </span>
                        <p className="p-3 bg-navy/[0.02] border border-navy/10 rounded-xl font-mono text-[11px] text-navy/70 whitespace-pre-wrap">
                          {appeal.evidenceLinksOrText}
                        </p>
                      </div>
                    )}
                  </div>

                  {appeal.reviewedAt && (
                    <div className="p-3 bg-navy/5 rounded-xl text-[11px] text-navy/70">
                      <span className="font-bold">Reviewed by {appeal.reviewedBy}</span> on{" "}
                      {new Date(appeal.reviewedAt).toLocaleString()}: {appeal.reviewNotes}
                    </div>
                  )}

                  {/* Admin Resolution Controls */}
                  <div className="pt-3 border-t border-navy/10 space-y-3">
                    <input
                      type="text"
                      value={appealReviewNotes[rep.id] || ""}
                      onChange={e =>
                        setAppealReviewNotes(prev => ({
                          ...prev,
                          [rep.id]: e.target.value
                        }))
                      }
                      placeholder="Optional admin resolution note (visible on record)..."
                      className="w-full px-3.5 py-2.5 bg-navy/[0.03] border border-navy/10 rounded-xl text-xs text-navy placeholder:text-navy/40 focus:outline-none focus:border-orange"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        disabled={isBusy}
                        onClick={() => handleResolveAppeal(rep, "approved", false)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Uphold Appeal & Unpublish
                      </button>

                      <button
                        disabled={isBusy}
                        onClick={() => handleResolveAppeal(rep, "approved", true)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Uphold & Delete Report
                      </button>

                      <button
                        disabled={isBusy}
                        onClick={() => handleResolveAppeal(rep, "rejected", false)}
                        className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Dismiss Appeal (Keep Public)
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredAppeals.length === 0 && (
              <div className="bg-white rounded-3xl border border-navy/10 py-14 text-center space-y-2">
                <Scale className="w-10 h-10 text-navy/20 mx-auto" />
                <p className="text-xs font-bold uppercase tracking-widest text-navy/40">
                  No owner appeals matching current filter
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: ADMINS & SUPER ADMIN GOVERNANCE */}
      {activeTab === "admins" && (
        <div className="space-y-6">
          {/* Super Admin Banner */}
          <div className="bg-gradient-to-r from-navy via-navy to-navy/95 text-white p-6 rounded-3xl border border-navy/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-orange" />
                <span className="text-[10px] font-black uppercase tracking-widest text-orange">
                  Super Admin Authority
                </span>
              </div>
              <h3 className="text-lg font-display font-black uppercase italic tracking-tight">
                {SUPER_ADMIN_EMAIL}
              </h3>
              <p className="text-xs text-white/70 max-w-xl">
                The Super Admin holds exclusive authority to add, invite, or revoke other administrators. Standard admins can moderate and delete reported emails but cannot alter admin roles.
              </p>
            </div>
            <div className="px-4 py-2 rounded-2xl bg-white/10 border border-white/15 text-xs font-mono text-white/90 shrink-0">
              Active Admins: <span className="font-black text-orange">{adminsList.length}</span>
            </div>
          </div>

          {/* Add New Admin Form (Super Admin Only) */}
          {isSuperAdmin ? (
            <div className="bg-white rounded-3xl border border-navy/10 p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-orange" />
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-navy">
                    Add New Administrator
                  </h3>
                  <p className="text-[11px] text-navy/50">
                    Enter an email address to grant admin access. Existing users are promoted immediately; unregistered emails receive a pending admin grant activated on signup/login.
                  </p>
                </div>
              </div>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleAddAdmin(newAdminEmail);
                }}
                className="flex flex-col sm:flex-row gap-3"
              >
                <div className="relative flex-1">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-navy/40" />
                  <input
                    type="email"
                    required
                    value={newAdminEmail}
                    onChange={e => setNewAdminEmail(e.target.value)}
                    placeholder="admin@company.com"
                    className="w-full pl-10 pr-4 py-3 bg-navy/[0.03] border border-navy/10 rounded-2xl text-xs font-mono text-navy placeholder:text-navy/40 focus:outline-none focus:border-orange"
                  />
                </div>
                <button
                  type="submit"
                  disabled={addingAdmin}
                  className="px-6 py-3 bg-navy hover:bg-navy/90 text-orange rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                  {addingAdmin ? "Adding..." : "Add Admin"}
                </button>
              </form>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 font-medium flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Read-only view: Only the Super Admin (<span className="font-mono font-bold">{SUPER_ADMIN_EMAIL}</span>) can add or remove other admins.
              </span>
            </div>
          )}

          {/* Active Administrators List */}
          <div className="bg-white rounded-3xl border border-navy/10 overflow-hidden shadow-sm">
            <div className="p-5 border-b border-navy/10 flex justify-between items-center bg-navy/[0.02]">
              <h3 className="text-xs font-black uppercase tracking-widest text-navy">
                Active Administrators ({adminsList.length})
              </h3>
              <button
                onClick={fetchAdmins}
                className="text-xs font-bold text-orange hover:text-orange/80 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${adminsLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>

            <div className="divide-y divide-navy/5">
              {adminsList.map(adm => {
                const isRootSuper = adm.isSuperAdmin || adm.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL;
                return (
                  <div key={adm.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isRootSuper ? "bg-orange/15 text-orange" : "bg-navy/5 text-navy"}`}>
                        {isRootSuper ? <Crown className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black text-sm text-navy truncate">{adm.name || "Administrator"}</p>
                          {isRootSuper ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-800 border border-amber-300">
                              SUPER ADMIN (PROTECTED)
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-800 border border-blue-200">
                              ADMIN
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-navy/60 truncate">{adm.email}</p>
                      </div>
                    </div>

                    {isSuperAdmin && !isRootSuper && (
                      <button
                        onClick={() => handleRemoveAdmin(adm.id, adm.email)}
                        className="self-start sm:self-auto px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer"
                      >
                        Revoke Admin
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pending Admin Invites */}
          {adminInvites.length > 0 && (
            <div className="bg-white rounded-3xl border border-navy/10 overflow-hidden shadow-sm">
              <div className="p-5 border-b border-navy/10 bg-navy/[0.02]">
                <h3 className="text-xs font-black uppercase tracking-widest text-navy">
                  Pending Admin Grants ({adminInvites.length})
                </h3>
              </div>
              <div className="divide-y divide-navy/5">
                {adminInvites.map(inv => (
                  <div key={inv.email} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-navy">{inv.email}</span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-800">
                          Awaiting Signup/Login
                        </span>
                      </div>
                      <p className="text-[10px] text-navy/50 mt-0.5">
                        Invited by {inv.addedBy} • {new Date(inv.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {isSuperAdmin && (
                      <button
                        onClick={() => handleRemoveAdmin(inv.email, inv.email)}
                        className="self-start sm:self-auto px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer"
                      >
                        Cancel Invite
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* INSPECT REPORT MODAL */}
      {inspectReport && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-navy/10 shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95">
            <div className="p-6 bg-navy text-white flex justify-between items-start gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      inspectReport.status === "approved"
                        ? "bg-green-500/20 text-green-300 border border-green-500/30"
                        : inspectReport.status === "pending_review"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "bg-red-500/20 text-red-300 border border-red-500/30"
                    }`}
                  >
                    Status: {inspectReport.status.toUpperCase()}
                  </span>
                  {inspectReport.hasAppeal && inspectReport.appeal && (
                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-500/25 text-blue-200 border border-blue-400/30">
                      Appeal: {inspectReport.appeal.status.toUpperCase()}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-display font-black uppercase italic tracking-tight text-white mt-2">
                  {inspectReport.subject}
                </h3>
                <p className="text-xs font-mono text-white/70 truncate">
                  {inspectReport.senderDisplayName} &lt;{inspectReport.senderEmail}&gt;
                </p>
              </div>
              <button
                onClick={() => setInspectReport(null)}
                className="text-white/60 hover:text-white p-2 rounded-xl hover:bg-white/10 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[68vh] overflow-y-auto text-xs text-navy">
              {/* Submission Metadata */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3.5 bg-navy/[0.02] rounded-2xl border border-navy/5 font-mono text-[10px]">
                <div>
                  <span className="text-navy/40 uppercase block">Submitted</span>
                  <span className="font-bold text-navy">{new Date(inspectReport.createdAt).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="text-navy/40 uppercase block">Provider</span>
                  <span className="font-bold text-navy">{inspectReport.emailProvider || "Gmail"}</span>
                </div>
                <div>
                  <span className="text-navy/40 uppercase block">Submitter</span>
                  <span className="font-bold text-navy">
                    {inspectReport.isAnonymous ? "Anonymous User" : inspectReport.submittedByUserEmail || "Registered User"}
                  </span>
                </div>
                {inspectReport.targetBrand && (
                  <div>
                    <span className="text-navy/40 uppercase block">Impersonated Brand</span>
                    <span className="font-bold text-orange">{inspectReport.targetBrand}</span>
                  </div>
                )}
                {inspectReport.reviewedBy && (
                  <div>
                    <span className="text-navy/40 uppercase block">Reviewed By</span>
                    <span className="font-bold text-navy">{inspectReport.reviewedBy}</span>
                  </div>
                )}
              </div>

              {/* Owner Appeal Callout inside Modal */}
              {inspectReport.hasAppeal && inspectReport.appeal && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5" />
                      Owner Appeal ({inspectReport.appeal.status.toUpperCase()})
                    </span>
                    {inspectReport.appeal.isVerifiedSenderMatch && (
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                        Verified Sender Match
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-navy">
                    {inspectReport.appeal.appellantName} ({inspectReport.appeal.appellantEmail}) — {inspectReport.appeal.appellantRole}
                  </p>
                  <p className="text-xs text-navy/80">
                    <span className="font-bold">Reason:</span> {inspectReport.appeal.reason}
                  </p>
                  <p className="text-xs text-navy/80 whitespace-pre-wrap">{inspectReport.appeal.explanation}</p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      onClick={() => handleResolveAppeal(inspectReport, "approved", false)}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer"
                    >
                      Uphold & Unpublish
                    </button>
                    <button
                      onClick={() => handleResolveAppeal(inspectReport, "approved", true)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer"
                    >
                      Uphold & Delete
                    </button>
                    <button
                      onClick={() => handleResolveAppeal(inspectReport, "rejected", false)}
                      className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer"
                    >
                      Dismiss Appeal
                    </button>
                  </div>
                </div>
              )}

              {/* Reasons */}
              <div>
                <h5 className="text-[10px] font-black uppercase tracking-wider text-navy/40 mb-1.5">Reporting Categories</h5>
                <div className="flex flex-wrap gap-1.5">
                  {inspectReport.reasons.map((r, i) => (
                    <span key={i} className="px-2.5 py-1 bg-red-50 text-red-700 rounded-lg text-xs font-bold border border-red-200">
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              {/* Uploaded Screenshot Evidence */}
              {inspectReport.screenshotUrl && (
                <div>
                  <h5 className="text-[10px] font-black uppercase tracking-wider text-navy/40 mb-1.5 flex items-center gap-1.5">
                    <span>Uploaded Evidence Screenshot</span>
                    <span className="text-[9px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                      Required Proof
                    </span>
                  </h5>
                  <div
                    onClick={() => setLightboxUrl(inspectReport.screenshotUrl!)}
                    className="rounded-2xl overflow-hidden border border-navy/10 bg-black/5 flex items-center justify-center max-h-60 p-1 cursor-zoom-in"
                  >
                    <img
                      src={inspectReport.screenshotUrl}
                      alt="Submitted Evidence Screenshot"
                      className="max-h-56 w-auto object-contain rounded-xl"
                    />
                  </div>
                </div>
              )}

              {inspectReport.userNotes && (
                <div>
                  <h5 className="text-[10px] font-black uppercase tracking-wider text-navy/40 mb-1.5">
                    User Observations & Testimony
                  </h5>
                  <p className="bg-navy/[0.02] p-4 rounded-2xl border border-navy/10 leading-relaxed font-medium">
                    {inspectReport.userNotes}
                  </p>
                </div>
              )}

              {inspectReport.bodyExcerpt && (
                <div>
                  <h5 className="text-[10px] font-black uppercase tracking-wider text-navy/40 mb-1.5">
                    Reported Message Excerpt
                  </h5>
                  <div className="bg-navy/[0.02] p-4 rounded-2xl border border-navy/10 font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {inspectReport.bodyExcerpt}
                  </div>
                </div>
              )}

              {inspectReport.suspiciousUrls && inspectReport.suspiciousUrls.length > 0 && (
                <div>
                  <h5 className="text-[10px] font-black uppercase tracking-wider text-navy/40 mb-1.5">
                    Extracted Suspicious URLs
                  </h5>
                  <div className="space-y-1.5">
                    {inspectReport.suspiciousUrls.map((url, i) => (
                      <div key={i} className="p-2.5 bg-red-50 text-red-800 rounded-xl font-mono text-[11px] break-all border border-red-200">
                        {url}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {inspectReport.headers && (
                <div>
                  <h5 className="text-[10px] font-black uppercase tracking-wider text-navy/40 mb-1.5">Technical Headers</h5>
                  <div className="bg-navy/5 p-3 rounded-2xl font-mono text-[10px] text-navy/70 whitespace-pre-wrap max-h-36 overflow-y-auto">
                    {inspectReport.headers}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-navy/[0.02] border-t border-navy/10 flex flex-wrap justify-between items-center gap-3">
              <button
                onClick={() => handleDeleteReport(inspectReport)}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Report
              </button>

              <div className="flex flex-wrap gap-2">
                {inspectReport.status !== "approved" && (
                  <button
                    onClick={() => handleApproveReport(inspectReport)}
                    disabled={moderationActionLoading}
                    className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve & Publish
                  </button>
                )}
                {inspectReport.status !== "rejected" && (
                  <button
                    onClick={() => handleRejectReportPrompt(inspectReport)}
                    disabled={moderationActionLoading}
                    className="px-5 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    {inspectReport.status === "approved" ? "Unpublish" : "Reject"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REJECT REPORT MODAL */}
      {rejectModalReport && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-navy/10 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-display font-black uppercase text-navy">
              {rejectModalReport.status === "approved" ? "Unpublish & Reject Report" : "Reject Reported Email"}
            </h3>
            <p className="text-xs text-navy/60">
              Add an optional moderation note for <span className="font-mono font-bold text-navy">{rejectModalReport.senderEmail}</span>:
            </p>
            <textarea
              rows={3}
              value={rejectNotes}
              onChange={e => setRejectNotes(e.target.value)}
              className="w-full p-3 bg-navy/[0.03] border border-navy/10 rounded-2xl text-xs text-navy focus:outline-none focus:border-orange"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRejectModalReport(null)}
                className="px-4 py-2 bg-navy/5 hover:bg-navy/10 text-navy rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const target = rejectModalReport;
                  setRejectModalReport(null);
                  await executeModerateReport(target.id, "rejected", rejectNotes);
                }}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmAction && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-navy/10 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-display font-black uppercase text-navy">{confirmAction.title}</h3>
            <p className="text-xs text-navy/70 leading-relaxed">{confirmAction.message}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 bg-navy/5 hover:bg-navy/10 text-navy rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const fn = confirmAction.onConfirm;
                  setConfirmAction(null);
                  await fn();
                }}
                className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-white cursor-pointer ${
                  confirmAction.tone === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : confirmAction.tone === "success"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-navy hover:bg-navy/90"
                }`}
              >
                {confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX FOR SCREENSHOTS */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-[70] flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={lightboxUrl}
            alt="Full Resolution Evidence"
            className="max-h-[88vh] max-w-[92vw] object-contain rounded-2xl border border-white/20 shadow-2xl"
          />
        </div>
      )}
    </motion.div>
  );
}
