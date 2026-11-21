import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileWarning,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  Filter,
  PlusCircle,
  ArrowLeft,
  Lock,
  Eye,
  Info,
  Calendar,
  User,
  Copy,
  Check,
  Building,
  Send,
  UploadCloud,
  Image as ImageIcon,
  Camera,
  ZoomIn,
  Maximize2,
  X,
  Trash2,
  AlertCircle,
  RefreshCw,
  Scale,
  Mail
} from "lucide-react";

export interface PublicAppealSummary {
  status: "pending" | "approved" | "rejected";
  reason: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface CommunityReport {
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
  appeal?: PublicAppealSummary;
  createdAt: string;
}

export interface ReportFormData {
  senderDisplayName: string;
  senderEmail: string;
  subject: string;
  recipientEmail?: string;
  dateReceived?: string;
  emailProvider?: string;
  bodyExcerpt?: string;
  suspiciousUrls?: string[];
  headers?: string;
  screenshotUrl: string;
  reasons: string[];
  userNotes?: string;
  redFlagsObserved?: string[];
  targetBrand?: string;
  isAnonymous?: boolean;
}

interface CommunityReportsViewProps {
  initialMode?: "list" | "submit";
  initialSearchQuery?: string;
  prefillData?: Partial<ReportFormData>;
  currentUserEmail?: string;
  currentUserId?: string;
  onNavigateBack?: () => void;
}

const REPORT_REASONS = [
  "Phishing or credential theft",
  "Financial fraud or fake invoice",
  "Brand impersonation",
  "Malware or dangerous attachment",
  "Extortion or blackmail",
  "Scam or advance fee fraud",
  "Spam or unsolicited bulk email",
  "Other suspicious activity"
];

const COMMON_RED_FLAGS = [
  "Typo-squatted / look-alike domain",
  "Urgent 24-48h suspension threat",
  "Demands payment via wire, crypto, or gift card",
  "Fake login link stealing passwords",
  "Mismatched Reply-To address",
  "Sent from free webmail pretending to be enterprise",
  "Generic greeting ('Dear Customer')",
  "Dangerous attachment (.exe, .scr, .iso, .vbs)"
];

const CATEGORIES = [
  { id: "all", label: "All Categories" },
  { id: "phishing", label: "Phishing & Credentials" },
  { id: "financial", label: "Invoices & Payments" },
  { id: "impersonation", label: "Brand Impersonation" },
  { id: "malware", label: "Malware & Attachments" },
  { id: "scam", label: "Advance-Fee Scams" }
];

const APPEAL_ROLES = [
  "Domain Owner",
  "Authorized Account Owner",
  "IT / Security Administrator",
  "Legal Representative"
];

const APPEAL_REASONS = [
  "False positive / legitimate communication",
  "Account was compromised & has been secured",
  "Spoofed / unauthorized impersonation of my address",
  "Issue resolved / misunderstanding",
  "Other"
];

export default function CommunityReportsView({
  initialMode = "list",
  initialSearchQuery = "",
  prefillData,
  currentUserEmail,
  currentUserId,
  onNavigateBack
}: CommunityReportsViewProps) {
  const [mode, setMode] = useState<"list" | "submit">(initialMode);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [inspectModalReport, setInspectModalReport] = useState<CommunityReport | null>(null);
  const [inspectActiveTab, setInspectActiveTab] = useState<"evidence" | "advisory">("evidence");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Owner Appeal Modal State
  const [appealModalReport, setAppealModalReport] = useState<CommunityReport | null>(null);
  const [appealForm, setAppealForm] = useState({
    appellantName: "",
    appellantEmail: currentUserEmail || "",
    appellantRole: APPEAL_ROLES[0],
    reason: APPEAL_REASONS[0],
    explanation: "",
    evidenceLinksOrText: ""
  });
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);
  const [appealSuccess, setAppealSuccess] = useState(false);

  // Screenshot upload state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [screenshotFileName, setScreenshotFileName] = useState<string>("");
  const [screenshotFileSize, setScreenshotFileSize] = useState<string>("");
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // Form State
  const [formData, setFormData] = useState<ReportFormData>({
    senderDisplayName: prefillData?.senderDisplayName || "",
    senderEmail: prefillData?.senderEmail || "",
    subject: prefillData?.subject || "",
    recipientEmail: prefillData?.recipientEmail || currentUserEmail || "",
    dateReceived: prefillData?.dateReceived || new Date().toISOString().split("T")[0],
    emailProvider: prefillData?.emailProvider || "Gmail",
    bodyExcerpt: prefillData?.bodyExcerpt || "",
    suspiciousUrls: prefillData?.suspiciousUrls || [],
    headers: prefillData?.headers || "",
    screenshotUrl: prefillData?.screenshotUrl || "",
    reasons: prefillData?.reasons || [],
    userNotes: prefillData?.userNotes || "",
    redFlagsObserved: prefillData?.redFlagsObserved || [],
    targetBrand: prefillData?.targetBrand || "",
    isAnonymous: prefillData?.isAnonymous ?? false
  });

  const [rawUrlInput, setRawUrlInput] = useState(
    (prefillData?.suspiciousUrls || []).join("\n")
  );
  const [customRedFlagInput, setCustomRedFlagInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Process and compress image file
  const processScreenshotFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setFormError("Uploaded evidence file must be an image (PNG, JPG, WEBP, or GIF).");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setFormError("Screenshot file size exceeds 20MB limit. Please upload a smaller image.");
      return;
    }

    setFormError(null);
    setIsProcessingImage(true);
    setScreenshotFileName(file.name);
    const sizeKb = (file.size / 1024).toFixed(0);
    const sizeLabel = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${sizeKb} KB`;
    setScreenshotFileSize(sizeLabel);

    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result as string;
      if (!rawDataUrl) {
        setIsProcessingImage(false);
        return;
      }

      // Responsive canvas compression to max 1600px width/height and quality 0.85
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        const maxDim = 1600;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", 0.85);
          setFormData(prev => ({ ...prev, screenshotUrl: compressed }));
        } else {
          setFormData(prev => ({ ...prev, screenshotUrl: rawDataUrl }));
        }
        setIsProcessingImage(false);
      };
      img.onerror = () => {
        setFormData(prev => ({ ...prev, screenshotUrl: rawDataUrl }));
        setIsProcessingImage(false);
      };
      img.src = rawDataUrl;
    };
    reader.onerror = () => {
      setFormError("Failed to read image file.");
      setIsProcessingImage(false);
    };
    reader.readAsDataURL(file);
  };

  // Listen for clipboard paste in submit mode
  useEffect(() => {
    if (mode !== "submit") return;
    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData || !e.clipboardData.items) return;
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const item = e.clipboardData.items[i];
        if (item.type.indexOf("image") !== -1) {
          const file = item.getAsFile();
          if (file) {
            processScreenshotFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [mode]);

  useEffect(() => {
    if (prefillData) {
      setFormData(prev => ({
        ...prev,
        ...prefillData,
        dateReceived: prefillData.dateReceived || prev.dateReceived || new Date().toISOString().split("T")[0]
      }));
      if (prefillData.suspiciousUrls) {
        setRawUrlInput(prefillData.suspiciousUrls.join("\n"));
      }
    }
  }, [prefillData]);

  const loadReports = async (overrideQuery?: string) => {
    setLoading(true);
    try {
      const qVal = overrideQuery !== undefined ? overrideQuery : searchQuery;
      const params = new URLSearchParams();
      if (qVal.trim()) params.set("q", qVal.trim());
      if (selectedCategory !== "all") params.set("category", selectedCategory);

      const res = await fetch(`/api/reports/public?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setReports(json.reports || []);
      }
    } catch (e) {
      console.error("Failed to load community reports", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setSearchQuery(initialSearchQuery);
      if (mode === "list") {
        loadReports(initialSearchQuery);
      }
    }
  }, [initialSearchQuery]);

  useEffect(() => {
    if (mode === "list") {
      loadReports();
    }
  }, [mode, selectedCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadReports();
  };

  const openAppealModal = (rep: CommunityReport) => {
    setAppealError(null);
    setAppealSuccess(false);
    setAppealForm({
      appellantName: "",
      appellantEmail: currentUserEmail || "",
      appellantRole: APPEAL_ROLES[0],
      reason: APPEAL_REASONS[0],
      explanation: "",
      evidenceLinksOrText: ""
    });
    setAppealModalReport(rep);
  };

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appealModalReport) return;
    setAppealError(null);

    if (!appealForm.appellantName.trim() || !appealForm.appellantEmail.trim() || !appealForm.explanation.trim()) {
      setAppealError("Please enter your full name, owner contact email, and a detailed explanation.");
      return;
    }

    setAppealSubmitting(true);
    try {
      const res = await fetch(`/api/reports/${appealModalReport.id}/appeal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(currentUserId ? { "x-firebase-uid": currentUserId } : {})
        },
        body: JSON.stringify(appealForm)
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to submit appeal.");
      }

      if (json.report) {
        setReports(prev => prev.map(r => (r.id === json.report.id ? json.report : r)));
        if (inspectModalReport?.id === json.report.id) {
          setInspectModalReport(json.report);
        }
      }
      setAppealSuccess(true);
    } catch (err: any) {
      setAppealError(err.message || "Error submitting appeal.");
    } finally {
      setAppealSubmitting(false);
    }
  };

  const toggleReason = (reason: string) => {
    setFormData(prev => {
      const exists = prev.reasons.includes(reason);
      return {
        ...prev,
        reasons: exists ? prev.reasons.filter(r => r !== reason) : [...prev.reasons, reason]
      };
    });
  };

  const toggleRedFlag = (flag: string) => {
    setFormData(prev => {
      const current = prev.redFlagsObserved || [];
      const exists = current.includes(flag);
      return {
        ...prev,
        redFlagsObserved: exists ? current.filter(f => f !== flag) : [...current, flag]
      };
    });
  };

  const addCustomRedFlag = () => {
    if (!customRedFlagInput.trim()) return;
    const flag = customRedFlagInput.trim();
    if (!formData.redFlagsObserved?.includes(flag)) {
      setFormData(prev => ({
        ...prev,
        redFlagsObserved: [...(prev.redFlagsObserved || []), flag]
      }));
    }
    setCustomRedFlagInput("");
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.senderEmail.trim()) {
      setFormError("Sender email address is required.");
      return;
    }
    if (!formData.subject.trim()) {
      setFormError("Email subject line is required.");
      return;
    }
    if (!formData.reasons || formData.reasons.length === 0) {
      setFormError("Please select at least one reason for reporting this email.");
      return;
    }
    if (!formData.screenshotUrl || !formData.screenshotUrl.trim()) {
      setFormError("A screenshot of the email is REQUIRED as evidence before reporting.");
      const el = document.getElementById("screenshot-upload-section");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setIsSubmitting(true);
    try {
      const parsedUrls = rawUrlInput
        .split("\n")
        .map(u => u.trim())
        .filter(u => u.length > 0);

      const payload = {
        ...formData,
        suspiciousUrls: parsedUrls
      };

      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(currentUserId ? { "x-firebase-uid": currentUserId } : {})
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to submit report");
      }

      setSubmitSuccess(true);
    } catch (err: any) {
      setFormError(err.message || "Submission failed. Please check network.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(text);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-8"
    >
      {/* Top Banner & Mode Toggle */}
      <div className="bg-gradient-to-r from-navy via-navy to-navy/95 text-white p-6 md:p-8 rounded-[2.5rem] shadow-xl border border-navy/10 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-orange/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-orange/20 text-orange border border-orange/30 flex items-center gap-1.5">
                <Shield className="w-3 h-3" />
                Community Threat Intel
              </span>
              <span className="text-white/40 text-[10px] font-mono">
                Admin Verified Database
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-black uppercase tracking-tight text-white italic">
              Community Email Threat Reports
            </h1>
            <p className="text-xs md:text-sm text-white/70 leading-relaxed font-medium">
              Search verified malicious emails, impersonation schemes, and phishing campaigns reported by users and verified by cybersecurity administrators.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {mode === "list" ? (
              <button
                onClick={() => {
                  setSubmitSuccess(false);
                  setMode("submit");
                }}
                className="px-6 py-3.5 bg-orange hover:bg-orange/90 text-navy font-display font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg transition-all flex items-center gap-2 cursor-pointer shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                Report an Email
              </button>
            ) : (
              <button
                onClick={() => setMode("list")}
                className="px-6 py-3.5 bg-white/10 hover:bg-white/20 text-white font-display font-black text-xs uppercase tracking-wider rounded-2xl transition-all flex items-center gap-2 cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Directory
              </button>
            )}
            {onNavigateBack && (
              <button
                onClick={onNavigateBack}
                className="p-3.5 bg-white/5 hover:bg-white/10 text-white/80 rounded-2xl transition-colors cursor-pointer"
                title="Return"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MODE 1: PUBLIC DIRECTORY & SEARCH */}
      {mode === "list" && (
        <div className="space-y-6">
          {/* Search & Filter Bar */}
          <div className="bg-white p-6 rounded-[2rem] border border-navy/10 shadow-sm space-y-4">
            <form onSubmit={handleSearchSubmit} className="flex gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-navy/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search verified reports by sender address, domain, subject keyword, or brand..."
                  className="w-full pl-11 pr-4 py-3 bg-navy/[0.03] border border-navy/10 rounded-2xl text-xs font-semibold text-navy placeholder:text-navy/40 focus:outline-none focus:border-orange transition-colors"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-3 bg-navy text-orange hover:bg-navy/90 font-black text-xs uppercase tracking-wider rounded-2xl transition-colors cursor-pointer"
              >
                Search
              </button>
            </form>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-navy/5">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    selectedCategory === cat.id
                      ? "bg-navy text-white shadow-sm"
                      : "bg-navy/[0.03] text-navy/60 hover:text-navy hover:bg-navy/5"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Owner Notice Banner if signed-in email matches any public report */}
          {currentUserEmail && reports.some(r => r.senderEmail?.toLowerCase().trim() === currentUserEmail.toLowerCase().trim()) && (
            <div className="p-5 bg-blue-50 border border-blue-200 rounded-[2rem] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Scale className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-black uppercase tracking-wider text-blue-900">
                    Your Email Address Appears in Public Reports
                  </p>
                  <p className="text-blue-800/80 font-medium leading-relaxed">
                    Your signed-in address (<span className="font-mono font-bold">{currentUserEmail}</span>) is listed below. If your account was falsely reported, impersonated, or remediated, you can submit an official owner appeal for admin review.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Reports Grid */}
          <div className="space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-2 px-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-navy/50">
                Verified Community Reports ({reports.length})
              </span>
              <span className="text-[10px] font-mono text-navy/40">
                Admin Reviewed • Email Owners May Appeal
              </span>
            </div>

            {loading ? (
              <div className="py-20 text-center space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange mx-auto" />
                <p className="text-xs font-black uppercase tracking-widest text-navy/40">
                  Retrieving Verified Threat Reports...
                </p>
              </div>
            ) : reports.length === 0 ? (
              <div className="py-16 text-center bg-white rounded-[2rem] border border-navy/10 p-8 space-y-3">
                <ShieldCheck className="w-12 h-12 text-navy/20 mx-auto" />
                <h3 className="font-display font-black text-lg text-navy uppercase italic">
                  No Reports Found
                </h3>
                <p className="text-xs text-navy/50 max-w-sm mx-auto">
                  No verified public reports match your query. If you received a suspicious message, be the first to report it to protect the community.
                </p>
                <button
                  onClick={() => setMode("submit")}
                  className="mt-3 px-5 py-2.5 bg-orange text-navy font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer"
                >
                  Submit a Report
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reports.map(rep => {
                  const isPendingAppeal = rep.hasAppeal && rep.appeal?.status === "pending";
                  const isDismissedAppeal = rep.hasAppeal && rep.appeal?.status === "rejected";
                  return (
                    <div
                      key={rep.id}
                      className="bg-white rounded-[2rem] border border-navy/10 p-6 space-y-4 hover:border-orange/40 hover:shadow-lg transition-all group flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        {/* Top Badges */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-red-100 text-red-700 border border-red-200">
                              {rep.reasons?.[0] || "Phishing Threat"}
                            </span>
                            {rep.targetBrand && (
                              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-orange/10 text-orange border border-orange/20">
                                Impersonates: {rep.targetBrand}
                              </span>
                            )}
                            {isPendingAppeal && (
                              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-800 border border-blue-200">
                                Appeal Under Review
                              </span>
                            )}
                            {isDismissedAppeal && (
                              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-navy/5 text-navy/60 border border-navy/10">
                                Appeal Dismissed
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-navy/40 shrink-0">
                            {rep.dateReceived || new Date(rep.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        {/* Subject */}
                        <h3 className="font-display font-black text-base text-navy group-hover:text-orange transition-colors leading-snug line-clamp-2">
                          {rep.subject}
                        </h3>

                        {/* Sender Info */}
                        <div className="p-3 bg-navy/[0.02] rounded-xl border border-navy/5 space-y-0.5 text-xs">
                          <span className="text-[8px] font-black uppercase tracking-wider text-navy/40 block">
                            Reported Sender Origin
                          </span>
                          <p className="font-bold text-navy truncate">
                            {rep.senderDisplayName || "Unknown Display Name"}
                          </p>
                          <p className="font-mono text-[11px] text-navy/70 truncate">
                            {rep.senderEmail}
                          </p>
                        </div>

                        {/* Excerpt */}
                        {rep.bodyExcerpt && (
                          <p className="text-xs text-navy/70 font-medium line-clamp-3 leading-relaxed italic bg-navy/[0.01] p-3 rounded-xl border border-navy/5">
                            "{rep.bodyExcerpt}"
                          </p>
                        )}

                        {/* Red Flags Chips */}
                        {rep.redFlagsObserved && rep.redFlagsObserved.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {rep.redFlagsObserved.slice(0, 3).map((rf, i) => (
                              <span key={i} className="text-[9px] font-bold px-2 py-0.5 bg-red-50 text-red-800 rounded-md border border-red-100">
                                • {rf}
                              </span>
                            ))}
                            {rep.redFlagsObserved.length > 3 && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 text-navy/40">
                                +{rep.redFlagsObserved.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Bottom Actions */}
                      <div className="pt-4 border-t border-navy/5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-green-700">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Admin Verified</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {!isPendingAppeal && (
                            <button
                              type="button"
                              onClick={() => openAppealModal(rep)}
                              className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1"
                              title="Reported email owner? Submit an appeal for admin review"
                            >
                              <Scale className="w-3 h-3" />
                              <span>Appeal</span>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setInspectActiveTab("evidence");
                              setInspectModalReport(rep);
                            }}
                            className="px-3.5 py-2 bg-navy/5 hover:bg-navy text-navy hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Evidence & Advisory</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODE 2: SUBMIT EMAIL REPORT FORM */}
      {mode === "submit" && (
        <div className="max-w-3xl mx-auto space-y-6">
          {submitSuccess ? (
            <div className="bg-white p-8 md:p-12 rounded-[2.5rem] border border-green-500/30 shadow-xl text-center space-y-5 animate-in fade-in zoom-in-95">
              <div className="w-16 h-16 bg-green-500/10 text-green-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-display font-black text-navy uppercase italic tracking-tight">
                Report Submitted for Security Review
              </h2>
              <p className="text-sm text-navy/70 leading-relaxed max-w-lg mx-auto font-medium">
                Thank you for contributing to community safety! In accordance with Mail Verifier security policy, all submitted reports are independently evaluated by cybersecurity administrators before appearing in the public database.
              </p>
              <div className="p-4 bg-navy/[0.02] rounded-2xl border border-navy/10 text-xs font-mono text-navy/60 max-w-md mx-auto">
                Status: <span className="font-bold text-amber-600">Pending Administrative Review</span>
              </div>
              <div className="flex justify-center gap-3 pt-3">
                <button
                  onClick={() => setMode("list")}
                  className="px-6 py-3 bg-navy text-white hover:bg-navy/90 rounded-2xl font-display font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  Return to Community Directory
                </button>
                <button
                  onClick={() => {
                    setSubmitSuccess(false);
                    setFormData({
                      senderDisplayName: "",
                      senderEmail: "",
                      subject: "",
                      recipientEmail: currentUserEmail || "",
                      dateReceived: new Date().toISOString().split("T")[0],
                      emailProvider: "Gmail",
                      bodyExcerpt: "",
                      suspiciousUrls: [],
                      headers: "",
                      screenshotUrl: "",
                      reasons: [],
                      userNotes: "",
                      redFlagsObserved: [],
                      targetBrand: "",
                      isAnonymous: false
                    });
                    setScreenshotFileName("");
                    setScreenshotFileSize("");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    setRawUrlInput("");
                  }}
                  className="px-6 py-3 bg-navy/5 hover:bg-navy/10 text-navy rounded-2xl font-display font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  Submit Another Report
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitReport} className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-navy/10 shadow-xl space-y-8">
              {/* Header */}
              <div className="space-y-1.5 border-b border-navy/10 pb-6">
                <h2 className="text-xl md:text-2xl font-display font-black text-navy uppercase italic tracking-tight">
                  Submit a Suspicious or Malicious Email
                </h2>
                <p className="text-xs md:text-sm text-navy/60 font-medium">
                  Provide evidence about suspicious senders, scam invoices, credential theft, or impersonation. Please review all fields before submission.
                </p>
              </div>

              {formError && (
                <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-200 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. SENDER & BASIC EMAIL DETAILS */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-orange flex items-center gap-2">
                  <User className="w-4 h-4" />
                  1. Email & Sender Details
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1.5">
                      Reported Sender Display Name
                    </label>
                    <input
                      type="text"
                      value={formData.senderDisplayName}
                      onChange={e => setFormData({ ...formData, senderDisplayName: e.target.value })}
                      placeholder="e.g. PayPal Security Team, Geek Squad"
                      className="w-full px-4 py-3 bg-navy/[0.03] border border-navy/10 rounded-2xl text-xs font-medium text-navy placeholder:text-navy/30 focus:outline-none focus:border-orange"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1.5">
                      Reported Sender Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.senderEmail}
                      onChange={e => setFormData({ ...formData, senderEmail: e.target.value })}
                      placeholder="e.g. support@paypa1-security.example"
                      className="w-full px-4 py-3 bg-navy/[0.03] border border-navy/10 rounded-2xl text-xs font-mono font-medium text-navy placeholder:text-navy/30 focus:outline-none focus:border-orange"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1.5">
                    Subject Line <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.subject}
                    onChange={e => setFormData({ ...formData, subject: e.target.value })}
                    placeholder="e.g. Urgent: Your account has been temporarily restricted"
                    className="w-full px-4 py-3 bg-navy/[0.03] border border-navy/10 rounded-2xl text-xs font-bold text-navy placeholder:text-navy/30 focus:outline-none focus:border-orange"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1.5">
                      Recipient Address (Optional)
                    </label>
                    <input
                      type="email"
                      value={formData.recipientEmail}
                      onChange={e => setFormData({ ...formData, recipientEmail: e.target.value })}
                      placeholder="Your or target email"
                      className="w-full px-4 py-3 bg-navy/[0.03] border border-navy/10 rounded-2xl text-xs font-mono text-navy placeholder:text-navy/30 focus:outline-none focus:border-orange"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1.5">
                      Date Received (Optional)
                    </label>
                    <input
                      type="date"
                      value={formData.dateReceived}
                      onChange={e => setFormData({ ...formData, dateReceived: e.target.value })}
                      className="w-full px-4 py-3 bg-navy/[0.03] border border-navy/10 rounded-2xl text-xs font-mono text-navy focus:outline-none focus:border-orange"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1.5">
                      Email Service Provider
                    </label>
                    <select
                      value={formData.emailProvider}
                      onChange={e => setFormData({ ...formData, emailProvider: e.target.value })}
                      className="w-full px-4 py-3 bg-navy/[0.03] border border-navy/10 rounded-2xl text-xs font-bold text-navy focus:outline-none focus:border-orange cursor-pointer"
                    >
                      <option value="Gmail">Gmail</option>
                      <option value="Outlook">Outlook</option>
                      <option value="Microsoft 365">Microsoft 365</option>
                      <option value="Yahoo">Yahoo</option>
                      <option value="Other">Other Provider</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 2. REASON FOR REPORTING */}
              <div className="space-y-3 pt-4 border-t border-navy/10">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-black uppercase tracking-widest text-orange flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" />
                    2. Reason for Reporting <span className="text-red-500">*</span>
                  </h3>
                  <span className="text-[10px] font-medium text-navy/40">Select all that apply</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {REPORT_REASONS.map((reason, idx) => {
                    const isChecked = formData.reasons.includes(reason);
                    return (
                      <div
                        key={idx}
                        onClick={() => toggleReason(reason)}
                        className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-3 cursor-pointer transition-all ${
                          isChecked
                            ? "bg-red-50 text-red-800 border-red-300 shadow-sm"
                            : "bg-navy/[0.02] text-navy/70 border-navy/10 hover:bg-navy/5"
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                          isChecked ? "bg-red-600 border-red-600 text-white" : "border-navy/30 bg-white"
                        }`}>
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span>{reason}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. TARGET BRAND & OBSERVED RED FLAGS */}
              <div className="space-y-4 pt-4 border-t border-navy/10">
                <h3 className="text-xs font-black uppercase tracking-widest text-orange flex items-center gap-2">
                  <Building className="w-4 h-4" />
                  3. Brand Impersonated & Observed Red Flags
                </h3>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1.5">
                    Target Organization / Brand Being Impersonated (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.targetBrand}
                    onChange={e => setFormData({ ...formData, targetBrand: e.target.value })}
                    placeholder="e.g. PayPal, Apple, Geek Squad, Microsoft, Chase Bank"
                    className="w-full px-4 py-3 bg-navy/[0.03] border border-navy/10 rounded-2xl text-xs font-medium text-navy placeholder:text-navy/30 focus:outline-none focus:border-orange"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1.5">
                    Select Observed Red Flags
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_RED_FLAGS.map((flag, idx) => {
                      const isSelected = formData.redFlagsObserved?.includes(flag);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => toggleRedFlag(flag)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                            isSelected
                              ? "bg-orange text-navy font-black shadow-sm"
                              : "bg-navy/[0.04] text-navy/70 hover:bg-navy/10"
                          }`}
                        >
                          {isSelected ? "✓ " : "+ "}
                          {flag}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex gap-2 mt-3">
                    <input
                      type="text"
                      value={customRedFlagInput}
                      onChange={e => setCustomRedFlagInput(e.target.value)}
                      placeholder="Add another red flag observed..."
                      className="flex-1 px-4 py-2 bg-navy/[0.03] border border-navy/10 rounded-xl text-xs text-navy focus:outline-none focus:border-orange"
                    />
                    <button
                      type="button"
                      onClick={addCustomRedFlag}
                      className="px-4 py-2 bg-navy/10 hover:bg-navy text-navy hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      Add Flag
                    </button>
                  </div>
                </div>
              </div>

              {/* 4. EVIDENCE: SCREENSHOT & MESSAGE CONTENT */}
              <div className="space-y-5 pt-4 border-t border-navy/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-widest text-orange flex items-center gap-2">
                    <Camera className="w-4 h-4" />
                    4. Evidence & Message Content
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-red-100 text-red-700 border border-red-200">
                    Screenshot Evidence Required *
                  </span>
                </div>

                {/* REQUIRED SCREENSHOT UPLOAD SECTION */}
                <div id="screenshot-upload-section" className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-wider text-navy/70 flex items-center gap-1.5">
                      <span>Email Screenshot Evidence</span>
                      <span className="text-red-500 font-bold">*</span>
                    </label>
                    <span className="text-[9px] font-mono text-navy/40">PNG, JPG, WEBP, GIF (up to 20MB)</span>
                  </div>

                  {/* Hidden file input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        processScreenshotFile(e.target.files[0]);
                      }
                    }}
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    className="hidden"
                  />

                  {!formData.screenshotUrl ? (
                    <div
                      onDragOver={e => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={e => {
                        e.preventDefault();
                        setIsDragging(false);
                      }}
                      onDrop={e => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          processScreenshotFile(e.dataTransfer.files[0]);
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
                        isDragging
                          ? "border-orange bg-orange/5 scale-[1.01]"
                          : "border-navy/20 hover:border-orange/60 bg-navy/[0.02] hover:bg-orange/[0.02]"
                      }`}
                    >
                      <div className="w-14 h-14 rounded-2xl bg-orange/10 text-orange flex items-center justify-center shadow-inner">
                        {isProcessingImage ? (
                          <div className="w-6 h-6 border-2 border-orange border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <UploadCloud className="w-7 h-7" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-navy">
                          <span className="text-orange underline font-black">Click to upload screenshot</span> or drag and drop image file here
                        </p>
                        <p className="text-[11px] text-navy/60 font-medium max-w-md">
                          Capture a screenshot of the suspicious email showing the sender address, subject, deceptive links, or body threats.
                        </p>
                        <p className="text-[10px] text-navy/40 font-mono pt-1">
                          Tip: You can also paste copied screenshots directly with <kbd className="px-1.5 py-0.5 bg-navy/5 rounded border border-navy/10 font-bold">Ctrl+V</kbd> / <kbd className="px-1.5 py-0.5 bg-navy/5 rounded border border-navy/10 font-bold">⌘+V</kbd>
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-red-50 text-red-700 border border-red-200">
                        <AlertCircle className="w-3 h-3" />
                        Required Evidence to Report
                      </span>
                    </div>
                  ) : (
                    <div className="border border-green-500/30 bg-green-50/20 rounded-3xl p-4 sm:p-5 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-navy/5">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-xs font-black uppercase tracking-wider text-green-800">
                            Screenshot Evidence Attached
                          </span>
                          <span className="text-[10px] font-mono text-navy/50">
                            {screenshotFileName || "email-evidence.jpg"} {screenshotFileSize && `(${screenshotFileSize})`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setLightboxImage(formData.screenshotUrl)}
                            className="px-3 py-1.5 bg-white hover:bg-navy/5 text-navy border border-navy/10 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span>Preview</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 bg-white hover:bg-navy/5 text-navy border border-navy/10 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Replace</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, screenshotUrl: "" }));
                              setScreenshotFileName("");
                              setScreenshotFileSize("");
                              if (fileInputRef.current) fileInputRef.current.value = "";
                            }}
                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>

                      {/* Thumbnail Preview */}
                      <div
                        onClick={() => setLightboxImage(formData.screenshotUrl)}
                        className="relative max-h-64 rounded-2xl overflow-hidden border border-navy/10 bg-black/5 flex items-center justify-center cursor-zoom-in group"
                      >
                        <img
                          src={formData.screenshotUrl}
                          alt="Uploaded Evidence Screenshot"
                          className="max-h-64 w-auto object-contain rounded-xl group-hover:scale-[1.01] transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-navy/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-2">
                          <ZoomIn className="w-5 h-5" />
                          <span>Click to Enlarge Fullscreen</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1.5">
                    Email Body or Suspicious Message Excerpt (Optional)
                  </label>
                  <textarea
                    rows={4}
                    value={formData.bodyExcerpt}
                    onChange={e => setFormData({ ...formData, bodyExcerpt: e.target.value })}
                    placeholder="Paste the excerpt of the email body showing the threats, false claims, or urgency tactics..."
                    className="w-full px-4 py-3 bg-navy/[0.03] border border-navy/10 rounded-2xl text-xs font-medium text-navy placeholder:text-navy/30 focus:outline-none focus:border-orange leading-relaxed"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1.5">
                    Suspicious URLs (One per line, optional)
                  </label>
                  <textarea
                    rows={2}
                    value={rawUrlInput}
                    onChange={e => setRawUrlInput(e.target.value)}
                    placeholder="http://paypa1-security.example/login&#10;http://shortened-link.xyz/verify"
                    className="w-full px-4 py-2.5 bg-navy/[0.03] border border-navy/10 rounded-2xl text-xs font-mono text-navy placeholder:text-navy/30 focus:outline-none focus:border-orange leading-relaxed"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1.5">
                    Email Headers (Optional - Technical evidence)
                  </label>
                  <textarea
                    rows={3}
                    value={formData.headers}
                    onChange={e => setFormData({ ...formData, headers: e.target.value })}
                    placeholder="Received: from mail.example.com ... Authentication-Results: spf=fail..."
                    className="w-full px-4 py-2.5 bg-navy/[0.03] border border-navy/10 rounded-2xl text-[10px] font-mono text-navy/80 placeholder:text-navy/30 focus:outline-none focus:border-orange leading-relaxed"
                  />
                  <p className="text-[10px] text-navy/40 mt-1">
                    Privacy control: Headers are reviewed by admins. You can remove your private email address or server tokens before submitting.
                  </p>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1.5">
                    User Notes & Observations
                  </label>
                  <textarea
                    rows={2}
                    value={formData.userNotes}
                    onChange={e => setFormData({ ...formData, userNotes: e.target.value })}
                    placeholder="What made you suspicious? (e.g. I do not have a PayPal account, or the sender address does not match PayPal's real domain)."
                    className="w-full px-4 py-2.5 bg-navy/[0.03] border border-navy/10 rounded-2xl text-xs font-medium text-navy placeholder:text-navy/30 focus:outline-none focus:border-orange"
                  />
                </div>
              </div>

              {/* 5. PRIVACY & ADMIN REVIEW NOTICE */}
              <div className="pt-4 border-t border-navy/10 space-y-4">
                <div
                  onClick={() => setFormData({ ...formData, isAnonymous: !formData.isAnonymous })}
                  className="flex items-center gap-3 p-4 bg-navy/[0.02] rounded-2xl border border-navy/5 cursor-pointer hover:bg-navy/5 transition-colors"
                >
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                    formData.isAnonymous ? "bg-navy border-navy text-white" : "border-navy/30 bg-white"
                  }`}>
                    {formData.isAnonymous && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-navy block">
                      Submit anonymously
                    </span>
                    <span className="text-[10px] text-navy/50">
                      Your user account and email will not be linked to the report public disclosure.
                    </span>
                  </div>
                </div>

                {/* Mandatory Admin Moderation Policy */}
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3 text-amber-900 text-xs">
                  <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">Administrative Moderation Guarantee</p>
                    <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                      The public database never automatically publishes a user submitted report. An authorized cybersecurity administrator will review your submission and evidence before making it searchable.
                    </p>
                  </div>
                </div>
              </div>

              {/* Submit CTA */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-navy/10">
                <button
                  type="button"
                  onClick={() => setMode("list")}
                  className="px-6 py-3.5 bg-navy/5 hover:bg-navy/10 text-navy font-black text-xs uppercase tracking-wider rounded-2xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-8 py-3.5 bg-orange hover:bg-orange/90 text-navy font-display font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-navy border-t-transparent rounded-full animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Report for Review</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* INSPECT REPORT MODAL (EVIDENCE & ADVISORY TABS) */}
      {inspectModalReport && (
        <div className="fixed inset-0 bg-navy/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] max-w-4xl w-full h-[88vh] max-h-[820px] min-h-[580px] border border-navy/10 shadow-2xl flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95">
            {/* Modal Header (Fixed at top) */}
            <div className="p-6 md:p-8 bg-navy text-white space-y-4 flex-shrink-0 relative">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-green-500/20 text-green-300 border border-green-500/30 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
                    Admin Verified Threat Report
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[9px] font-mono text-white/50 bg-white/5">
                    {inspectModalReport.dateReceived || new Date(inspectModalReport.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  onClick={() => setInspectModalReport(null)}
                  className="text-white/60 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                  title="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <h2 className="text-xl md:text-2xl font-display font-black uppercase italic tracking-tight text-white line-clamp-2">
                  {inspectModalReport.subject}
                </h2>
                <p className="text-xs font-mono text-white/70 mt-1 truncate">
                  Origin: <span className="text-white font-bold">{inspectModalReport.senderDisplayName || "Unknown Display Name"}</span> &lt;{inspectModalReport.senderEmail}&gt;
                </p>
              </div>

              {/* Tabs Switcher: Sized evenly so switching doesn't jump */}
              <div className="flex bg-white/10 p-1.5 rounded-2xl gap-2">
                <button
                  type="button"
                  onClick={() => setInspectActiveTab("evidence")}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    inspectActiveTab === "evidence"
                      ? "bg-orange text-navy shadow-lg font-black"
                      : "text-white/70 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  <span>Evidence & Forensic Proof</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectActiveTab("advisory")}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    inspectActiveTab === "advisory"
                      ? "bg-orange text-navy shadow-lg font-black"
                      : "text-white/70 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Cybersecurity Advisory</span>
                </button>
              </div>
            </div>

            {/* Modal Body: Sized well across both tabs with consistent padding & scroll */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 text-xs text-navy">
              {/* TAB 1: EVIDENCE & FORENSIC PROOF */}
              {inspectActiveTab === "evidence" && (
                <div className="space-y-6 animate-in fade-in">
                  {/* Uploaded Screenshot Evidence Card */}
                  <div className="bg-navy/[0.02] border border-navy/10 rounded-3xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4 text-orange" />
                        <h4 className="font-display font-black text-xs uppercase tracking-wider text-navy">
                          Uploaded Screenshot Evidence (Required Proof)
                        </h4>
                      </div>
                      {inspectModalReport.screenshotUrl && (
                        <button
                          onClick={() => setLightboxImage(inspectModalReport.screenshotUrl!)}
                          className="text-[11px] font-bold text-orange hover:text-orange/80 flex items-center gap-1 cursor-pointer"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>View Fullscreen</span>
                        </button>
                      )}
                    </div>

                    {inspectModalReport.screenshotUrl ? (
                      <div
                        onClick={() => setLightboxImage(inspectModalReport.screenshotUrl!)}
                        className="relative rounded-2xl overflow-hidden border border-navy/10 bg-slate-900/5 flex items-center justify-center cursor-zoom-in group max-h-[380px]"
                      >
                        <img
                          src={inspectModalReport.screenshotUrl}
                          alt="Evidence Screenshot"
                          className="max-h-[380px] w-auto object-contain rounded-xl group-hover:scale-[1.01] transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-navy/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-2">
                          <ZoomIn className="w-5 h-5" />
                          <span>Click to Enlarge Fullscreen</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 text-center bg-navy/[0.02] border border-dashed border-navy/10 rounded-2xl space-y-1">
                        <ImageIcon className="w-8 h-8 text-navy/20 mx-auto" />
                        <p className="text-xs font-bold text-navy/60">No screenshot attached for this record</p>
                        <p className="text-[10px] text-navy/40">Visual evidence was not submitted with this legacy report.</p>
                      </div>
                    )}
                  </div>

                  {/* Sender Origin & Basic Details Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-navy/[0.02] rounded-2xl border border-navy/5 font-mono text-[11px]">
                    <div>
                      <span className="text-navy/40 uppercase block text-[9px]">Sender Display</span>
                      <span className="font-bold text-navy truncate block">{inspectModalReport.senderDisplayName || "Unknown"}</span>
                    </div>
                    <div>
                      <span className="text-navy/40 uppercase block text-[9px]">Sender Address</span>
                      <span className="font-bold text-navy truncate block">{inspectModalReport.senderEmail}</span>
                    </div>
                    <div>
                      <span className="text-navy/40 uppercase block text-[9px]">Target Brand</span>
                      <span className="font-bold text-orange truncate block">{inspectModalReport.targetBrand || "Unspecified Brand"}</span>
                    </div>
                    <div>
                      <span className="text-navy/40 uppercase block text-[9px]">Mail Provider</span>
                      <span className="font-bold text-navy truncate block">{inspectModalReport.emailProvider || "Gmail"}</span>
                    </div>
                  </div>

                  {/* Message Excerpt */}
                  {inspectModalReport.bodyExcerpt && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-navy/50">
                        Reported Email Excerpt
                      </h4>
                      <div className="p-4 bg-navy/[0.02] rounded-2xl border border-navy/10 font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto text-navy/80">
                        {inspectModalReport.bodyExcerpt}
                      </div>
                    </div>
                  )}

                  {/* Suspicious Destination URLs */}
                  {inspectModalReport.suspiciousUrls && inspectModalReport.suspiciousUrls.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-navy/50">
                        Identified Malicious / Phishing Links ({inspectModalReport.suspiciousUrls.length})
                      </h4>
                      <div className="space-y-2">
                        {inspectModalReport.suspiciousUrls.map((url, i) => (
                          <div key={i} className="p-3 bg-red-50 text-red-800 rounded-xl font-mono text-[11px] break-all border border-red-200 flex items-center justify-between gap-3">
                            <span className="truncate">{url}</span>
                            <button
                              onClick={() => copyToClipboard(url)}
                              className="shrink-0 p-1.5 hover:bg-red-100 rounded-lg text-red-700 transition-colors cursor-pointer"
                              title="Copy Link Address"
                            >
                              {copiedUrl === url ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Technical Headers */}
                  {inspectModalReport.headers && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-navy/50">
                        Technical Email Headers
                      </h4>
                      <div className="p-3.5 bg-navy/5 rounded-2xl font-mono text-[10px] text-navy/70 whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed border border-navy/10">
                        {inspectModalReport.headers}
                      </div>
                    </div>
                  )}

                  {/* User Notes */}
                  {inspectModalReport.userNotes && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-navy/50">
                        Submitter Observations
                      </h4>
                      <p className="p-4 bg-navy/[0.02] rounded-2xl border border-navy/10 text-navy/80 leading-relaxed font-medium">
                        "{inspectModalReport.userNotes}"
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: CYBERSECURITY ADVISORY */}
              {inspectActiveTab === "advisory" && (
                <div className="space-y-6 animate-in fade-in">
                  {/* Official Administrator Advisory Banner */}
                  <div className="p-6 bg-gradient-to-r from-navy via-navy to-navy/95 text-white rounded-3xl border border-navy/10 space-y-3 shadow-lg relative overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-orange text-navy font-black">
                        <ShieldCheck className="w-4 h-4" />
                      </span>
                      <h3 className="font-display font-black text-sm md:text-base uppercase tracking-wider text-white italic">
                        Official Mail Verifier Threat Advisory
                      </h3>
                    </div>
                    <p className="text-xs md:text-sm text-white/90 leading-relaxed font-medium">
                      {inspectModalReport.moderationNotes ||
                        "Do not engage with this sender. Never click links or enter passwords on third-party domains. If you received this email, immediately mark it as phishing in your mail provider."}
                    </p>
                  </div>

                  {/* Target Brand Impersonated */}
                  {inspectModalReport.targetBrand && (
                    <div className="p-4 bg-orange/10 border border-orange/20 rounded-2xl flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Building className="w-5 h-5 text-orange shrink-0" />
                        <div>
                          <span className="text-[9px] font-black uppercase tracking-widest text-navy/50 block">
                            Target Organization Impersonated
                          </span>
                          <span className="text-sm font-display font-black uppercase italic text-navy">
                            {inspectModalReport.targetBrand}
                          </span>
                        </div>
                      </div>
                      <span className="px-3 py-1 bg-white text-navy rounded-xl text-[10px] font-bold border border-navy/10">
                        Brand Identity Spoof
                      </span>
                    </div>
                  )}

                  {/* Threat Classification Categories */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-navy/50">
                      Threat Classifications
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {inspectModalReport.reasons.map((r, i) => (
                        <span key={i} className="px-3 py-1.5 bg-red-50 text-red-700 rounded-xl text-xs font-bold border border-red-200 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                          <span>{r}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Confirmed Forensic Red Flags */}
                  {inspectModalReport.redFlagsObserved && inspectModalReport.redFlagsObserved.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-navy/50">
                        Confirmed Forensic Red Flags
                      </h4>
                      <ul className="space-y-2.5">
                        {inspectModalReport.redFlagsObserved.map((rf, i) => (
                          <li key={i} className="flex items-start gap-3 p-3 bg-red-50/60 rounded-xl border border-red-100 text-red-900 font-medium">
                            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <span className="font-bold block text-xs">{rf}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Actionable Protection Guidance */}
                  <div className="bg-navy/[0.02] border border-navy/10 rounded-3xl p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-green-600" />
                      <h4 className="font-display font-black text-xs uppercase tracking-wider text-navy">
                        Recommended Security Actions for Recipients
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3.5 bg-white rounded-2xl border border-navy/5 space-y-1">
                        <span className="font-black text-navy block text-[11px]">1. Do Not Interact</span>
                        <p className="text-[11px] text-navy/70 leading-relaxed font-medium">
                          Do not reply, click links, call phone numbers in the text, or download attached files.
                        </p>
                      </div>

                      <div className="p-3.5 bg-white rounded-2xl border border-navy/5 space-y-1">
                        <span className="font-black text-navy block text-[11px]">2. Mark as Phishing</span>
                        <p className="text-[11px] text-navy/70 leading-relaxed font-medium">
                          Use your mail provider's "Report Phishing" option to update global spam filtering engines.
                        </p>
                      </div>

                      <div className="p-3.5 bg-white rounded-2xl border border-navy/5 space-y-1">
                        <span className="font-black text-navy block text-[11px]">3. Compromise Check</span>
                        <p className="text-[11px] text-navy/70 leading-relaxed font-medium">
                          If you submitted credentials, immediately change your password directly on the official website.
                        </p>
                      </div>

                      <div className="p-3.5 bg-white rounded-2xl border border-navy/5 space-y-1">
                        <span className="font-black text-navy block text-[11px]">4. Alert Security Team</span>
                        <p className="text-[11px] text-navy/70 leading-relaxed font-medium">
                          If received at a corporate address, forward the email to your organization's IT security team.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer (Fixed at bottom) */}
            <div className="p-5 bg-navy/[0.02] border-t border-navy/10 flex-shrink-0 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-green-700">
                  <ShieldCheck className="w-4 h-4 text-green-600" />
                  <span>Admin Verified Record</span>
                </div>
                {inspectModalReport.hasAppeal && inspectModalReport.appeal && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                      inspectModalReport.appeal.status === "pending"
                        ? "bg-blue-100 text-blue-800 border-blue-200"
                        : "bg-navy/5 text-navy/60 border-navy/10"
                    }`}
                  >
                    {inspectModalReport.appeal.status === "pending" ? "Owner Appeal Pending" : "Appeal Dismissed"}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(!inspectModalReport.hasAppeal || inspectModalReport.appeal?.status !== "pending") && (
                  <button
                    type="button"
                    onClick={() => openAppealModal(inspectModalReport)}
                    className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Scale className="w-3.5 h-3.5" />
                    <span>Appeal (Email Owner)</span>
                  </button>
                )}

                {inspectActiveTab === "evidence" ? (
                  <button
                    type="button"
                    onClick={() => setInspectActiveTab("advisory")}
                    className="px-4 py-2.5 bg-navy/5 hover:bg-navy/10 text-navy rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <span>View Advisory</span>
                    <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setInspectActiveTab("evidence")}
                    className="px-4 py-2.5 bg-navy/5 hover:bg-navy/10 text-navy rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>View Evidence</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setInspectModalReport(null)}
                  className="px-6 py-2.5 bg-navy text-white hover:bg-navy/90 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
                >
                  Close Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OWNER APPEAL MODAL */}
      {appealModalReport && (
        <div className="fixed inset-0 bg-navy/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] max-w-xl w-full border border-navy/10 shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95">
            <div className="p-6 bg-navy text-white flex items-start justify-between gap-4">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-500/20 text-blue-200 border border-blue-400/30 inline-flex items-center gap-1.5">
                  <Scale className="w-3 h-3" />
                  Reported Email Owner Appeal
                </span>
                <h3 className="text-lg font-display font-black uppercase italic tracking-tight text-white mt-2">
                  Submit Appeal for Review
                </h3>
                <p className="text-xs font-mono text-white/70 mt-0.5 truncate">
                  Reported Address: {appealModalReport.senderEmail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAppealModalReport(null)}
                className="text-white/60 hover:text-white p-2 rounded-xl hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {appealSuccess ? (
              <div className="p-8 text-center space-y-4">
                <div className="w-14 h-14 bg-green-500/10 text-green-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="font-display font-black text-lg uppercase italic text-navy">
                  Appeal Submitted to Administrators
                </h4>
                <p className="text-xs text-navy/70 leading-relaxed max-w-md mx-auto">
                  Your appeal for <span className="font-mono font-bold text-navy">{appealModalReport.senderEmail}</span> has been queued for administrator review. Only verified Mail Verifier admins can uphold an appeal, unpublish, or delete the report.
                </p>
                <button
                  type="button"
                  onClick={() => setAppealModalReport(null)}
                  className="px-6 py-3 bg-navy text-white rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitAppeal} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs text-navy">
                <div className="p-3.5 bg-navy/[0.03] rounded-2xl border border-navy/10 space-y-1">
                  <span className="text-[9px] font-black uppercase tracking-wider text-navy/40 block">
                    Report Under Appeal
                  </span>
                  <p className="font-bold text-navy">{appealModalReport.subject}</p>
                  <p className="font-mono text-[11px] text-navy/60">
                    {appealModalReport.senderDisplayName || "Unknown"} &lt;{appealModalReport.senderEmail}&gt;
                  </p>
                </div>

                {appealError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{appealError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1">
                      Full Name / Authorized Rep <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={appealForm.appellantName}
                      onChange={e => setAppealForm({ ...appealForm, appellantName: e.target.value })}
                      placeholder="Your full name"
                      className="w-full px-3.5 py-2.5 bg-navy/[0.03] border border-navy/10 rounded-xl text-xs text-navy focus:outline-none focus:border-orange"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1">
                      Owner Contact Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={appealForm.appellantEmail}
                      onChange={e => setAppealForm({ ...appealForm, appellantEmail: e.target.value })}
                      placeholder="owner@domain.com"
                      className="w-full px-3.5 py-2.5 bg-navy/[0.03] border border-navy/10 rounded-xl text-xs font-mono text-navy focus:outline-none focus:border-orange"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1">
                      Role / Ownership Basis
                    </label>
                    <select
                      value={appealForm.appellantRole}
                      onChange={e => setAppealForm({ ...appealForm, appellantRole: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-navy/[0.03] border border-navy/10 rounded-xl text-xs font-bold text-navy focus:outline-none focus:border-orange"
                    >
                      {APPEAL_ROLES.map(role => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1">
                      Appeal Reason
                    </label>
                    <select
                      value={appealForm.reason}
                      onChange={e => setAppealForm({ ...appealForm, reason: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-navy/[0.03] border border-navy/10 rounded-xl text-xs font-bold text-navy focus:outline-none focus:border-orange"
                    >
                      {APPEAL_REASONS.map(reason => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1">
                    Detailed Explanation <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={appealForm.explanation}
                    onChange={e => setAppealForm({ ...appealForm, explanation: e.target.value })}
                    placeholder="Explain why this report is inaccurate, spoofed without authorization, or how the issue was remediated..."
                    className="w-full px-3.5 py-2.5 bg-navy/[0.03] border border-navy/10 rounded-xl text-xs text-navy focus:outline-none focus:border-orange"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-navy/60 block mb-1">
                    Verification / Evidence Details (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={appealForm.evidenceLinksOrText}
                    onChange={e => setAppealForm({ ...appealForm, evidenceLinksOrText: e.target.value })}
                    placeholder="Provide SPF/DKIM/DMARC records, domain ownership proof, or incident remediation ticket references..."
                    className="w-full px-3.5 py-2.5 bg-navy/[0.03] border border-navy/10 rounded-xl text-xs font-mono text-navy focus:outline-none focus:border-orange"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-navy/10">
                  <button
                    type="button"
                    onClick={() => setAppealModalReport(null)}
                    className="px-5 py-2.5 bg-navy/5 hover:bg-navy/10 text-navy rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={appealSubmitting}
                    className="px-6 py-2.5 bg-navy hover:bg-navy/90 text-orange rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{appealSubmitting ? "Submitting..." : "Submit Owner Appeal"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL FOR FULL RESOLUTION SCREENSHOT */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-[70] flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in"
        >
          <div className="relative max-w-5xl max-h-[92vh] flex flex-col items-center">
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-12 right-0 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" /> Close
            </button>
            <img
              src={lightboxImage}
              alt="Full Evidence Screenshot"
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-2xl shadow-2xl border border-white/20"
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
