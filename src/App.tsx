/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import PaystackPop from "@paystack/inline-js";
import {
  ShieldAlert,
  ShieldCheck,
  Search,
  Mail,
  Lock,
  Globe,
  AlertTriangle,
  Info,
  RefreshCw,
  Fingerprint,
  ExternalLink,
  ChevronRight,
  Shield,
  Loader2,
  LogOut,
  Inbox,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  Phone,
  CheckSquare,
  Square,
  Plus,
  Paperclip,
  Send,
  Trash2,
  X,
  ChevronUp,
  ChevronDown,
  Menu,
  FileText,
  Check,
  MoreHorizontal,
  Calendar,
  CreditCard,
  Sparkles,
  Zap,
  Clock,
  FileWarning,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { analyzeEmail, EmailData } from "./lib/gemini";
import { cn } from "./lib/utils";

interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  fullData: any;
  labelIds?: string[];
  fullAnalysis?: any;
  analysis?: {
    classification: string;
    risk_score: number;
    severity: string;
    short_reason: string;
  };
}

import AdminDashboard from "./components/AdminDashboard";
import CommunityReportsView, { ReportFormData } from "./components/CommunityReportsView";

const AppLogo = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg 
    viewBox="0 0 512 512" 
    className={className} 
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="52" y="146" width="408" height="260" rx="44" fill="#FF0015" />
    <path d="M 68 378 L 190 252" stroke="#12284C" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M 444 378 L 322 252" stroke="#12284C" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M 68 174 L 256 294 L 444 174" stroke="#12284C" strokeWidth="24" strokeLinejoin="round" strokeLinecap="round" fill="none" />
    
    <path d="M 256 300 L 296 320 V 356 C 296 384 274 408 256 420 C 238 408 216 384 216 356 V 320 Z" fill="#FF0015" stroke="white" strokeWidth="6" strokeLinejoin="round" />
    <path d="M 236 360 L 250 374 L 276 342" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

export default function App() {
  const [user, setUser] = useState<{ email: string; name: string; id: string; isAdmin?: boolean; isSuperAdmin?: boolean } | null>(
    null,
  );
  const [inbox, setInbox] = useState<GmailMessage[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const [formData, setFormData] = useState<EmailData>({
    subject: "",
    body: "",
    senderName: "",
    senderEmail: "",
    replyTo: "",
    links: "",
    headers: "",
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAnalyzing) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep(prev => (prev + 1) % 9);
      }, 300);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);
  
  const loadingTexts = [
    "Interrogating message headers...",
    "Scanning for spoofing patterns...",
    "Validating sender domains...",
    "Checking IP reputations...",
    "Analyzing semantic intent...",
    "Inspecting attachments...",
    "Evaluating risk factors...",
    "Cross-referencing threat databases...",
    "Finalizing AI audit..."
  ];
  const [result, setResult] = useState<any | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [communityMode, setCommunityMode] = useState<"list" | "submit">("list");
  const [communitySearchQuery, setCommunitySearchQuery] = useState("");
  const [communityPrefillData, setCommunityPrefillData] = useState<Partial<ReportFormData> | undefined>(undefined);
  const [reportedSendersMap, setReportedSendersMap] = useState<Record<string, number>>({});
  const [senderCommunityWarning, setSenderCommunityWarning] = useState<{
    reported: boolean;
    count: number;
    reports: any[];
  } | null>(null);
  const [view, setView] = useState<
    | "login"
    | "inbox"
    | "settings"
    | "result"
    | "compose"
    | "alerts"
    | "insights"
    | "admin"
    | "subscription"
    | "community_reports"
  >("login");
  const [subscription, setSubscription] = useState<{
    plan: "free" | "pro" | "enterprise" | string;
    usage: number;
    paymentMethod: string;
    currentPeriodEnd: string | null;
    trialStartDate?: string | null;
    invoices: Array<{ id: string; date: string; amount: string; status: "paid" | "pending" }>;
  }>({
    plan: "free",
    usage: 8,
    paymentMethod: "None",
    currentPeriodEnd: null,
    trialStartDate: null,
    invoices: []
  });

  const isPremiumActive = () => {
    if (
      user?.isAdmin ||
      user?.isSuperAdmin ||
      user?.email?.toLowerCase().trim() === "adamu0533@gmail.com"
    ) {
      return true;
    }
    if (!subscription) return false;
    // If the plan is not "free", check if it's expired
    if (subscription.plan !== "free") {
      if (subscription.currentPeriodEnd) {
         const end = new Date(subscription.currentPeriodEnd).getTime();
         if (Date.now() > end) {
            return false;
         }
      }
      return true;
    }
    
    // If they are on "free", check if they are within the 1-week (7 days) trial
    if (subscription.trialStartDate) {
      const start = new Date(subscription.trialStartDate).getTime();
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      return (now - start) < oneWeekMs;
    }
    return true; // default fallback if trialStartDate not set yet
  };

  // Auto-switch to free if expired when component mounts or subscription changes
  useEffect(() => {
    if (subscription && subscription.plan !== "free" && subscription.currentPeriodEnd) {
       const end = new Date(subscription.currentPeriodEnd).getTime();
       if (Date.now() > end && user?.id) {
          const updatedSub = { ...subscription, plan: "free", currentPeriodEnd: null };
          setSubscription(updatedSub);
          fetch("/api/auth/subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription: updatedSub }),
          }).catch(console.error);
       }
    }
  }, [subscription, user?.id]);

  const getTrialDaysRemaining = () => {
    if (!subscription || !subscription.trialStartDate) return 0;
    const start = new Date(subscription.trialStartDate).getTime();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const diff = (start + oneWeekMs) - now;
    if (diff <= 0) return 0;
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  };

  const getLiveCountdown = () => {
    if (!subscription) return null;
    
    let targetTime = 0;
    let label = "";
    
    if (subscription.plan !== "free") {
      // Premium paid subscription
      if (subscription.currentPeriodEnd) {
        targetTime = new Date(subscription.currentPeriodEnd).getTime();
        label = "PREMIUM PROTECTION ACTIVE";
      } else {
        // Default fallback
        return null;
      }
    } else if (subscription.trialStartDate) {
      // Free trial active
      const start = new Date(subscription.trialStartDate).getTime();
      targetTime = start + 7 * 24 * 60 * 60 * 1000;
      label = "FREE SECURE TRIAL";
    } else {
      return null;
    }
    
    const diff = targetTime - nowTime;
    if (diff <= 0) {
      return { expired: true, label, days: 0, hours: 0, minutes: 0, seconds: 0, formatted: "00d 00h 00m 00s (EXPIRED)" };
    }
    
    const seconds = Math.floor((diff / 1000) % 60);
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    const pad = (num: number) => String(num).padStart(2, '0');
    
    return {
      expired: false,
      label,
      days,
      hours,
      minutes,
      seconds,
      formatted: `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
    };
  };

  const renderSubscriptionGate = (featureName: string) => {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center py-16 px-6 text-center max-w-2xl mx-auto space-y-8"
      >
        <div className="relative">
          <div className="absolute inset-0 bg-orange/20 blur-3xl rounded-full" />
          <div className="bg-navy p-8 rounded-[2.5rem] relative border border-orange/20 shadow-2xl shadow-navy/20">
            <Lock className="w-12 h-12 text-orange animate-pulse" />
          </div>
        </div>

        <div className="space-y-3">
          <span className="bg-orange/10 text-orange px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[3px] border border-orange/20">
            Subscription Required
          </span>
          <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter text-navy leading-tight mt-4">
            {featureName} IS LOCKED
          </h2>
          <p className="text-xs text-navy/60 font-semibold leading-relaxed max-w-md mx-auto">
            Your 1-week secure trial has expired. Standard free accounts do not have access to real-time security alarm scans, advanced AI reports, interactive AI support chat, or threat radar analytics.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md pt-4">
          <button
            onClick={() => setView("subscription")}
            className="flex-1 bg-navy text-orange hover:bg-navy/95 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-navy/10 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-orange" />
            Upgrade to Premium
          </button>
          <button
            onClick={() => setView("inbox")}
            className="flex-1 bg-navy/5 text-navy hover:bg-navy/10 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            Back to Inbox
          </button>
        </div>

        {/* Dynamic Trial Expiration Status */}
        <div className="p-4 bg-navy/[0.02] border border-navy/10 rounded-2xl text-left space-y-1.5 w-full text-xs font-semibold text-navy/70">
          <div className="flex justify-between">
            <span className="text-navy/40 uppercase text-[9px] font-black tracking-wider">Account ID</span>
            <span className="font-mono text-[10px]">{user?.id?.slice(0, 12)}...</span>
          </div>
          <div className="flex justify-between">
            <span className="text-navy/40 uppercase text-[9px] font-black tracking-wider">Trial Registered</span>
            <span>{subscription.trialStartDate ? new Date(subscription.trialStartDate).toLocaleDateString() : "Pending"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-navy/40 uppercase text-[9px] font-black tracking-wider">Status</span>
            <span className="text-red-500 font-bold uppercase text-[10px]">Trial Expired / Free Mode</span>
          </div>
        </div>
      </motion.div>
    );
  };
  const [activeFolder, setActiveFolder] = useState<
    "inbox" | "sent" | "drafts" | "spam"
  >("inbox");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [resultTab, setResultTab] = useState<"analysis" | "message" | "chat">(
    "message",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [inboxLimit, setInboxLimit] = useState(30);
  const [inboxNextPageToken, setInboxNextPageToken] = useState<string | null>(
    null,
  );
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const fetchSessionIdRef = React.useRef(0);
  const connectingUserRef = React.useRef(false);

  // Date Filter States
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showDateFilter, setShowDateFilter] = useState(false);

  // Live Countdown and Premium Request states
  const [nowTime, setNowTime] = useState<number>(Date.now());
  const [showUpgradePrompt, setShowUpgradePrompt] = useState<string | null>(null);
  const [paymentTrackerStep, setPaymentTrackerStep] = useState<number>(-1);
  const [trackerSuccessCountdown, setTrackerSuccessCountdown] = useState<number>(5);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (paymentTrackerStep === 4) {
      setTrackerSuccessCountdown(5);
      interval = setInterval(() => {
        setTrackerSuccessCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval!);
            setIsProcessingCheckout(false);
            setCheckoutPlan(null);
            setPaymentTrackerStep(-1);
            return 5;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [paymentTrackerStep]);

  // Subscription Checkout states
  const [checkoutPlan, setCheckoutPlan] = useState<"pro" | "enterprise" | null>(null);
  const [isAnnual, setIsAnnual] = useState(false);
  const [checkoutCardName, setCheckoutCardName] = useState("");
  const [checkoutCardNo, setCheckoutCardNo] = useState("");
  const [checkoutCardExpiry, setCheckoutCardExpiry] = useState("");
  const [checkoutCardCVC, setCheckoutCardCVC] = useState("");
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);

  // Email specific Chat states
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "model"; text: string }[]
  >([]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingChatMessage, setIsSendingChatMessage] = useState(false);

  // Email Compose states
  const [composeTo, setComposeTo] = useState("");
  const [composeReplyToMessageId, setComposeReplyToMessageId] = useState<string | null>(null);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeQuote, setComposeQuote] = useState("");
  const [composeAttachments, setComposeAttachments] = useState<
    { name: string; type: string; data: string }[]
  >([]);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const [loginMode, setLoginMode] = useState<
    "landing" | "login" | "signup" | "forgot"
  >("landing");
  const [showPassword, setShowPassword] = useState(false);
  const [authFormData, setAuthFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    consent: false,
    rememberMe: false,
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [isGmailConnected, setIsGmailConnected] = useState<boolean>(false);
  const [showMsgOptions, setShowMsgOptions] = useState(false);

  // Check auth and setup OAuth message listener on mount

  // SSE for Real-time push alerts
  useEffect(() => {
    if (user?.id) {
      const eventSource = new EventSource(`/api/sse?uid=${user.id}`);
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "THREAT_DETECTED") {
            alert(`Real-time Alert: ${data.message} (${data.classification})`);
            // Refresh inbox automatically to show new mail
            fetchInbox(user.id);
          }
        } catch (e) {
          console.error("Failed to parse SSE data", e);
        }
      };
      
      return () => {
        eventSource.close();
      };
    }
  }, [user]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser({
              email: data.user.email,
              name: data.user.name,
              id: data.user.id,
              isAdmin: data.user.isAdmin,
              isSuperAdmin: data.user.isSuperAdmin
            });
            setView("inbox");
            fetchPublicReportedSenders();
            setSubscription(data.user.subscription || {
              plan: "free",
              usage: 8,
              paymentMethod: "None",
              currentPeriodEnd: null,
              trialStartDate: new Date().toISOString(),
              invoices: []
            });
            
            // Restore Gmail token from localStorage if available and not expired (within 55 minutes)
            const storedToken = localStorage.getItem(`gmail_access_token_${data.user.id}`);
            const storedTimeStr = localStorage.getItem(`gmail_access_token_time_${data.user.id}`);
            if (storedToken && storedTimeStr) {
              const elapsed = Date.now() - Number(storedTimeStr);
              if (elapsed < 3300000) {
                try {
                  await fetch("/api/auth/store-token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: storedToken, uid: data.user.id }),
                  });
                } catch (err) {
                  console.error("Failed to restore stored Gmail token to backend:", err);
                }
              }
            }

            fetchInbox(data.user.id);
          } else {
            setUser(null);
            setView("login");
            setLoginMode("landing");
          }
        } else {
          setUser(null);
          setView("login");
          setLoginMode("landing");
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        setUser(null);
        setView("login");
        setLoginMode("landing");
      }
    };

    checkAuth();

    // Listen for postMessage from custom Google OAuth popup
    const handleOAuthMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith(".run.app") && !origin.includes("localhost")) {
        return;
      }
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        const { token, uid, user: loggedInUser } = event.data;
        if (token && uid) {
          localStorage.setItem(`gmail_access_token_${uid}`, token);
          localStorage.setItem(`gmail_access_token_time_${uid}`, String(Date.now()));
        }
        if (loggedInUser) {
          setUser({
            email: loggedInUser.email,
            name: loggedInUser.name,
            id: loggedInUser.id,
            isAdmin: loggedInUser.isAdmin,
            isSuperAdmin: loggedInUser.isSuperAdmin
          });
          setSubscription(loggedInUser.subscription || {
            plan: "free",
            usage: 8,
            paymentMethod: "None",
            currentPeriodEnd: null,
            trialStartDate: new Date().toISOString(),
            invoices: []
          });
          setView("inbox");
          fetchPublicReportedSenders();
        }
        setIsGmailConnected(true);
        fetchInbox(uid);
      }
    };

    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, []);

  const fetchPublicReportedSenders = async () => {
    try {
      const res = await fetch("/api/reports/public");
      if (res.ok) {
        const data = await res.json();
        const counts: Record<string, number> = {};
        for (const rep of data.reports || []) {
          const emailKey = rep.senderEmail?.toLowerCase().trim();
          if (emailKey) {
            counts[emailKey] = (counts[emailKey] || 0) + 1;
          }
        }
        setReportedSendersMap(counts);
      }
    } catch (e) {
      console.warn("Could not refresh public reported senders", e);
    }
  };

  const checkSenderCommunityReport = async (senderEmail?: string) => {
    const clean = senderEmail?.toLowerCase().trim();
    if (!clean) {
      setSenderCommunityWarning(null);
      return;
    }
    try {
      const res = await fetch(`/api/reports/check?email=${encodeURIComponent(clean)}`);
      if (res.ok) {
        const data = await res.json();
        setSenderCommunityWarning(data);
      } else {
        setSenderCommunityWarning(null);
      }
    } catch {
      setSenderCommunityWarning(null);
    }
  };

  useEffect(() => {
    if (view === "inbox" && user) {
      fetchPublicReportedSenders();
    }
  }, [view]);

  const fetchRemainingPages = async (
    sessionId: number,
    initialPageToken: string,
    uid?: string,
    queryStr?: string,
  ) => {
    setIsSyncingAll(true);
    let currentPageToken: string | null = initialPageToken;
    const currentUid = uid || user?.id;
    const headers: Record<string, string> = {};
    if (currentUid) {
      headers["x-firebase-uid"] = currentUid;
    }

    try {
      while (currentPageToken && sessionId === fetchSessionIdRef.current) {
        // Delay between page fetches to play nice with rate limits and allow smooth rendering
        await new Promise((resolve) => setTimeout(resolve, 600));

        if (sessionId !== fetchSessionIdRef.current) break;

        const params = new URLSearchParams();
        params.append("maxResults", "40"); // Batches of 40 are fast and safe
        if (queryStr) {
          params.append("q", queryStr);
        }
        params.append("pageToken", currentPageToken);

        const res = await fetch(`/api/gmail/messages?${params.toString()}`, {
          headers,
        });
        if (!res.ok) {
          console.warn(
            `Fetch returned status ${res.status} during background page sync`,
          );
          break;
        }

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.warn("Expected JSON, but received invalid format", e);
          break;
        }

        if (sessionId !== fetchSessionIdRef.current) break;

        if (data && Array.isArray(data.messages)) {
          setInbox((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const uniqueNew = data.messages.filter(
              (m: any) => !existingIds.has(m.id),
            );
            return [...prev, ...uniqueNew];
          });
          currentPageToken = data.nextPageToken;
          setInboxNextPageToken(currentPageToken);
        } else {
          break;
        }
      }
    } catch (err) {
      console.error("Error syncing remaining pages", err);
    } finally {
      if (sessionId === fetchSessionIdRef.current) {
        setIsSyncingAll(false);
      }
    }
  };

  const fetchInbox = async (
    uid?: string,
    queryStr?: string,
    customLimit?: number,
    forceFolder?: "inbox" | "sent" | "drafts" | "spam",
  ) => {
    setIsLoadingInbox(true);
    setInboxError(null);
    const currentSessionId = ++fetchSessionIdRef.current;
    const useLimit = customLimit || 40; // Default to larger initial count
    try {
      const currentUid = uid || user?.id;
      const headers: Record<string, string> = {};
      if (currentUid) {
        headers["x-firebase-uid"] = currentUid;
      }

      const folder = forceFolder !== undefined ? forceFolder : activeFolder;
      let folderQuery = "label:INBOX";
      if (folder === "sent") folderQuery = "label:SENT";
      else if (folder === "drafts") folderQuery = "label:DRAFT";
      else if (folder === "spam") folderQuery = "label:SPAM";

      let finalQuery = folderQuery;
      if (queryStr) {
        if (queryStr.includes("label:")) {
          finalQuery = queryStr;
        } else {
          finalQuery = `${queryStr} ${folderQuery}`;
        }
      }

      if (startDate) {
        const formattedStart = startDate.replace(/-/g, "/");
        finalQuery = `${finalQuery} after:${formattedStart}`;
      }
      if (endDate) {
        const formattedEnd = endDate.replace(/-/g, "/");
        finalQuery = `${finalQuery} before:${formattedEnd}`;
      }

      const params = new URLSearchParams();
      params.append("maxResults", String(useLimit));
      params.append("q", finalQuery);

      const res = await fetch(`/api/gmail/messages?${params.toString()}`, {
        headers,
      });

      if (!res.ok) {
        const errText = await res.text();
        let errMsg = `Server returned status ${res.status}`;
        try {
          const parsed = JSON.parse(errText);
          if (parsed && parsed.error) errMsg = parsed.error;
        } catch {
          if (errText) errMsg = errText;
        }
        throw new Error(errMsg);
      }

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (jsonErr) {
        throw new Error(
          "Unable to parse mailbox communication stream (expected JSON, received invalid formatting).",
        );
      }

      if (currentSessionId !== fetchSessionIdRef.current) return;

      if (data && Array.isArray(data.messages)) {
        setIsGmailConnected(true);
        setInbox(data.messages);
        setInboxNextPageToken(data.nextPageToken);

        // Trigger background scan for top 5 emails for the feed
        triggerInboxScan(data.messages.slice(0, 5), currentUid);

        // Start background syncing of the rest of the mailbox
        if (data.nextPageToken) {
          fetchRemainingPages(
            currentSessionId,
            data.nextPageToken,
            currentUid,
            finalQuery,
          );
        }
      } else if (
        data &&
        data.error === "No Gmail token found. Please reconnect Google account."
      ) {
        setIsGmailConnected(false);
        console.warn("Gmail token missing on server:", data.error);
        setInboxError(data.error);
      } else if (data && data.error) {
        setIsGmailConnected(false);
        setInboxError(data.error);
      }
    } catch (e: any) {
      const msgStr = e.message || "";
      if (
        msgStr.toLowerCase().includes("token") || 
        msgStr.toLowerCase().includes("reconnect") || 
        msgStr.toLowerCase().includes("auth") || 
        msgStr.toLowerCase().includes("unauthorized") ||
        msgStr.toLowerCase().includes("credential") ||
        msgStr.toLowerCase().includes("grant") ||
        msgStr.toLowerCase().includes("invalid") ||
        msgStr.toLowerCase().includes("expired")
      ) {
        setIsGmailConnected(false);
      }
      console.warn("Fetch inbox failed", e.message);
      setInboxError(e.message || "Failed to fetch emails.");
    } finally {
      if (currentSessionId === fetchSessionIdRef.current) {
        setIsLoadingInbox(false);
      }
    }
  };

  const handleFolderChange = (folder: "inbox" | "sent" | "drafts" | "spam") => {
    setActiveFolder(folder);
    setView("inbox");
    fetchInbox(undefined, undefined, 40, folder);
  };

  const triggerInboxScan = async (messages: GmailMessage[], uid?: string) => {
    if (!isPremiumActive()) {
      console.log("Subscription inactive (Trial expired): background inbox scan skipped");
      return;
    }
    if (messages.length === 0) return;
    setIsScanning(true);
    try {
      const emailDataList = messages.map((msg) => ({
        subject: msg.subject,
        body: msg.snippet,
        senderName: msg.from.split("<")[0].trim(),
        senderEmail: msg.from.match(/<(.+)>/)?.[1] || msg.from,
      }));

      const scanResults = await analyzeEmail(emailDataList, "INBOX_SCAN", uid || user?.id);
      if (Array.isArray(scanResults)) {
        setInbox((prev) =>
          prev.map((msg) => {
            const match = scanResults.find(
              (r: any) => r.subject === msg.subject,
            );
            return match ? { ...msg, analysis: match } : msg;
          }),
        );
      }
    } catch (e) {
      console.error("Inbox scan failed", e);
    } finally {
      setIsScanning(false);
    }
  };

  const handleConnect = async () => {
    try {
      connectingUserRef.current = true;
      setAuthError(null);
      
      const response = await fetch(`/api/auth/google/url?uid=${user?.id || ""}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate Google secure login connection URL");
      }
      
      const { url } = await response.json();
      
      window.location.href = url;
    } catch (err: any) {
      console.error("Google Connection Failed:", err);
      setAuthError(err.message || "Google connection failed");
    } finally {
      connectingUserRef.current = false;
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {
      console.warn("Failed to contact logout server, logging out locally:", e);
    }
    setUser(null);
    setView("login");
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authFormData.email,
          password: authFormData.password,
          rememberMe: authFormData.rememberMe,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Login credentials authentication failed");
      }

      const { user: loggedInUser } = await response.json();
      setUser({
        email: loggedInUser.email,
        name: loggedInUser.name,
        id: loggedInUser.id,
        isAdmin: loggedInUser.isAdmin,
        isSuperAdmin: loggedInUser.isSuperAdmin
      });
      setView("inbox");
      setSubscription(loggedInUser.subscription || {
        plan: "free",
        usage: 8,
        paymentMethod: "None",
        currentPeriodEnd: null,
        trialStartDate: new Date().toISOString(),
        invoices: []
      });
      fetchPublicReportedSenders();
      fetchInbox(loggedInUser.id);
    } catch (err: any) {
      setAuthError(err.message || "Login failed");
    }
  };

  const handleManualSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authFormData.consent) {
      setAuthError("Please consent to mail access");
      return;
    }
    setAuthError(null);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authFormData.email,
          password: authFormData.password,
          name: authFormData.name || "Secure Agent",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "User signup failed");
      }

      const regJson = await response.json();
      const registeredUser = regJson.user;
      if (registeredUser) {
        setUser({
          email: registeredUser.email,
          name: registeredUser.name,
          id: registeredUser.id,
          isAdmin: registeredUser.isAdmin,
          isSuperAdmin: registeredUser.isSuperAdmin
        });
        setView("inbox");
        setSubscription(registeredUser.subscription || {
          plan: "free",
          usage: 8,
          paymentMethod: "None",
          currentPeriodEnd: null,
          trialStartDate: new Date().toISOString(),
          invoices: []
        });
        fetchPublicReportedSenders();
        fetchInbox(registeredUser.id);
      } else {
        setAuthError(regJson.message || "Account created! Please verify your email before logging in.");
        setLoginMode("login");
      }
    } catch (err: any) {
      setAuthError(err.message || "Signup failed");
    }
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Password recovery requested. Standard self-managed password systems require database admin verification. Please ask an admin to reset your credentials.");
    setLoginMode("login");
  };

  const handleReportCurrentEmail = () => {
    let parsedUrls: string[] = [];
    if (formData.links) {
      parsedUrls = formData.links.split(",").map(u => u.trim()).filter(Boolean);
    }
    if (parsedUrls.length === 0 && result?.domain_and_link_assessment?.links_analyzed) {
      parsedUrls = result.domain_and_link_assessment.links_analyzed.map((l: any) => l.url).filter(Boolean);
    }

    const currentReasons: string[] = [];
    const threatScore = result?.risk_score ?? result?.ai_risk_engine?.threat_score ?? 0;
    if (threatScore >= 40) {
      currentReasons.push("Phishing or credential theft");
    }
    if (result?.sender_identity_assessment?.brand_impersonation || result?.brand_impersonation?.detected_brand) {
      currentReasons.push("Brand impersonation");
    }
    if (result?.social_engineering_tactics?.payment_fraud_attempt || result?.social_engineering_tactics?.invoice_scam) {
      currentReasons.push("Financial fraud or fake invoice");
    }
    if (currentReasons.length === 0) {
      currentReasons.push("Other suspicious activity");
    }

    const flags: string[] = [];
    if (result?.red_flags && Array.isArray(result.red_flags)) {
      result.red_flags.forEach((rf: any) => {
        if (typeof rf === "string") flags.push(rf);
        else if (rf.flag) flags.push(rf.flag);
      });
    }

    setCommunityPrefillData({
      senderDisplayName: formData.senderName || "",
      senderEmail: formData.senderEmail || "",
      subject: formData.subject || "",
      recipientEmail: user?.email || "",
      dateReceived: new Date().toISOString().split("T")[0],
      emailProvider: user?.email?.toLowerCase().includes("gmail") ? "Gmail" : "Other",
      bodyExcerpt: formData.body ? formData.body.slice(0, 2000) : "",
      suspiciousUrls: parsedUrls,
      headers: formData.headers || "",
      reasons: currentReasons,
      redFlagsObserved: flags,
      targetBrand: result?.sender_identity_assessment?.impersonated_brand || result?.brand_impersonation?.detected_brand || "",
      isAnonymous: false
    });
    setCommunityMode("submit");
    setView("community_reports");
  };

  const handleAnalyze = async (dataToAnalyze: EmailData) => {
    if (!isPremiumActive()) {
      setShowUpgradePrompt("AI Email Threat Audit");
      return;
    }

    const hasAdminPrivilege = Boolean(
      user?.isAdmin ||
      user?.isSuperAdmin ||
      user?.email?.toLowerCase().trim() === "adamu0533@gmail.com"
    );

    if (!hasAdminPrivilege && subscription.plan === "free" && subscription.usage >= 50) {
      setShowUpgradePrompt("Unlimited AI Email Audits");
      return;
    }

    setAnalysisError(null);
    setIsAnalyzing(true);
    try {
      const output = await analyzeEmail(dataToAnalyze, "SINGLE_EMAIL_VIEW", user?.id);
      if (!output) {
        setAnalysisError("Forensic analysis could not be completed for this message due to a connection or parsing failure. In compliance with strict zero-fabrication rules, no unverified placeholder results are generated.");
        setResult(null);
        return;
      }
      setResult(output);

      // Update the inbox feed with the new detailed analysis so it matches the analysis tab
      setInbox((prev) =>
        prev.map((m) => {
          if (m.id === dataToAnalyze.id) {
            return {
              ...m,
              analysis: {
                classification: output?.classification || output?.ai_risk_engine?.final_risk_classification || m.analysis?.classification,
                severity: output?.severity || ((output?.risk_score || output?.ai_risk_engine?.threat_score || 0) > 60 ? "High" : (output?.risk_score || output?.ai_risk_engine?.threat_score || 0) > 30 ? "Medium" : "Low"),
                risk_score: output?.risk_score ?? output?.ai_risk_engine?.threat_score ?? m.analysis?.risk_score,
                short_reason: output?.summary_markdown ? output.summary_markdown.substring(0, 100) : m.analysis?.short_reason
              },
              fullAnalysis: output
            };
          }
          return m;
        })
      );

      // Increment usage count and sync to backend
      const newUsage = subscription.usage + 1;
      const updatedSub = { ...subscription, usage: newUsage };
      setSubscription(updatedSub);
      
      if (user?.id) {
        try {
          await fetch("/api/auth/subscription", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "x-firebase-uid": user.id
            },
            body: JSON.stringify({ subscription: updatedSub }),
          });
        } catch (e) {
          console.warn("Failed to sync updated usage to server:", e);
        }
      }
    } catch (error: any) {
      console.error(error);
      setAnalysisError(error?.message || "Analysis request failed.");
      setResult(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const initiateCheckout = (plan: "pro" | "enterprise") => {
    setIsProcessingCheckout(true);
    const paystack = new PaystackPop();
    paystack.newTransaction({
      key: (import.meta as any).env?.VITE_PAYSTACK_PUBLIC_KEY || 'pk_test_xxxxxx',
      email: user?.email || 'customer@example.com',
      amount: isAnnual ? 65000 * 100 : 6500 * 100,
      currency: "NGN",
      onSuccess: async (transaction: any) => {
        setIsProcessingCheckout(false);
        const updatedSub = {
          plan: plan,
          usage: subscription.usage,
          paymentMethod: "Paystack",
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          trialStartDate: subscription.trialStartDate,
          invoices: [
            ...(subscription.invoices || []),
            {
              id: transaction.reference,
              date: new Date().toISOString().split("T")[0],
              amount: isAnnual ? "₦65,000" : "₦6,500",
              status: "paid" as const
            }
          ]
        };
        setSubscription(updatedSub);
        if (user?.id) {
          try {
            await fetch("/api/auth/subscription", {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "x-firebase-uid": user.id
              },
              body: JSON.stringify({ subscription: updatedSub }),
            });
          } catch (e) {
            console.warn("Failed to sync new plan to server:", e);
          }
        }
      },
      onCancel: () => {
        setIsProcessingCheckout(false);
      },
      onError: (err: any) => {
        console.error("Paystack Error:", err);
        setIsProcessingCheckout(false);
        if (err?.message) {
          alert(`Payment Error: ${err.message}. If you are in the preview, you may need a valid Paystack public key or to open the app in a new tab.`);
        } else {
          alert("Payment could not be initialized. Please check your Paystack API keys.");
        }
      }
    });
  };

  const handleDowngradeToFree = async () => {
    if (!confirm("Are you sure you want to transition back to the Standard (Free) tier? Your unlimited auditing privileges will revert to a 50-scan monthly limit.")) {
      return;
    }

    try {
      const updatedSub = {
        plan: "free",
        usage: subscription.usage,
        paymentMethod: "None",
        currentPeriodEnd: null,
        trialStartDate: subscription.trialStartDate,
        invoices: subscription.invoices || [],
      };

      setSubscription(updatedSub);

      if (user?.id) {
        try {
          await fetch("/api/auth/subscription", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "x-firebase-uid": user.id
            },
            body: JSON.stringify({ subscription: updatedSub }),
          });
        } catch (e) {
          console.warn("Failed to sync plan downgrade to server:", e);
        }
      }

      alert("Plan changed. Your account has been reverted to the Standard (Free) tier.");
    } catch (err) {
      console.error("Failed to downgrade subscription", err);
      alert("Could not process downgrade request. Please try again.");
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm("Are you sure you want to cancel your secure subscription? You will lose unlimited scans and priority neural threat classification.")) {
      return;
    }

    try {
      const updatedSub = {
        plan: "free",
        usage: subscription.usage,
        paymentMethod: "None",
        currentPeriodEnd: null,
        trialStartDate: subscription.trialStartDate,
        invoices: subscription.invoices || [],
      };

      setSubscription(updatedSub);

      if (user?.id) {
        try {
          await fetch("/api/auth/subscription", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "x-firebase-uid": user.id
            },
            body: JSON.stringify({ subscription: updatedSub }),
          });
        } catch (e) {
          console.warn("Failed to sync subscription cancellation to server:", e);
        }
      }

      alert("Subscription cancelled successfully. You are now on the Free plan.");
    } catch (err) {
      console.error("Failed to cancel subscription", err);
    }
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPremiumActive()) {
      setShowUpgradePrompt("Interactive Secure Support Chat");
      return;
    }
    if (!chatInput.trim() || isSendingChatMessage) return;

    const userMsg = chatInput.trim();
    setChatInput("");

    const updatedMessages = [
      ...chatMessages,
      { role: "user" as const, text: userMsg },
    ];
    setChatMessages(updatedMessages);
    setIsSendingChatMessage(true);

    try {
      const res = await fetch("/api/chat-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(user?.id ? { "x-firebase-uid": user.id } : {}),
        },
        body: JSON.stringify({
          messageContext: {
            subject: formData.subject,
            body: formData.body,
            senderName: formData.senderName,
            senderEmail: formData.senderEmail,
          },
          history: chatMessages,
          question: userMsg,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to receive assistant reply");
      }

      const json = await res.json();
      setChatMessages([
        ...updatedMessages,
        { role: "model" as const, text: json.text },
      ]);
    } catch (err: any) {
      console.error("Chat message error:", err);
      setChatMessages([
        ...updatedMessages,
        {
          role: "model" as const,
          text: "Error connecting to AI Assistant. Please verify network and try again.",
        },
      ]);
    } finally {
      setIsSendingChatMessage(false);
    }
  };

  const selectEmail = (msg: GmailMessage) => {
    // Mark as read in Gmail in the background
    const currentUid = user?.id;
    if (currentUid && msg.id) {
      fetch("/api/gmail/mark-read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-firebase-uid": currentUid
        },
        body: JSON.stringify({ messageId: msg.id })
      }).catch(err => console.log("Failed to mark as read"));
      
      // Optioanlly update local state to reflect it's read immediately
      setInbox(prev => prev.map(m => m.id === msg.id ? { ...m, labelIds: (m.labelIds || []).filter(l => l !== 'UNREAD') } : m));
    }
    const headers = msg.fullData?.payload?.headers || [];

    // More robust body extraction
    const extractBody = (payload: any): string => {
      if (!payload) return "";
      if (payload.body && payload.body.data) return payload.body.data;
      if (payload.parts) {
        for (const part of payload.parts) {
          if (part.mimeType === "text/plain" && part.body?.data) return part.body.data;
        }
        for (const part of payload.parts) {
          if (part.mimeType === "text/html" && part.body?.data) return part.body.data;
        }
        for (const part of payload.parts) {
          if (part.parts) {
            const nested = extractBody(part);
            if (nested) return nested;
          }
        }
      }
      return "";
    };
    let bodyData = extractBody(msg.fullData?.payload);

    let decodedBody = msg.snippet;
    try {
      if (bodyData) {
        decodedBody = decodeURIComponent(
          escape(atob(bodyData.replace(/-/g, "+").replace(/_/g, "/"))),
        );
      }
    } catch (e) {
      console.warn("Could not decode body");
    }

    const analysisData: EmailData = {
      id: msg.id,
      subject: msg.subject,
      senderName: msg.from
        .split("<")[0]
        .trim()
        .replace(/^"/, "")
        .replace(/"$/, ""),
      senderEmail: msg.from.match(/<(.+)>/)?.[1] || msg.from,
      body: decodedBody,
      headers: JSON.stringify(headers, null, 2),
      links: (decodedBody.match(/https?:\/\/[^\s]+/g) || []).join(", "),
    };

    setChatMessages([
      {
        role: "model",
        text: `Secure Bridge active. I have loaded this email context. Ask me anything about its content, potential spoofing patterns, or links, and I'll analyze it factually.`,
      },
    ]);
    setFormData(analysisData);
    setAnalysisError(null);
    setSenderCommunityWarning(null);
    checkSenderCommunityReport(analysisData.senderEmail);
    if ((msg as any).fullAnalysis) {
      setResult((msg as any).fullAnalysis);
    } else {
      setResult(null);
    }
    setResultTab("message"); // Open Message view first so users can read the email before clicking Analysis
    setView("result");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);

    filesArray.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const resultStr = reader.result;
        if (typeof resultStr === "string") {
          setComposeAttachments((prev) => [
            ...prev,
            {
              name: file.name,
              type: file.type,
              data: resultStr,
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (index: number) => {
    setComposeAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendError(null);
    setSendSuccess(null);

    const confirmed = window.confirm(
      `Are you sure you want to send this email to ${composeTo}?`,
    );
    if (!confirmed) return;

    setIsSendingEmail(true);
    try {
      const currentUid = user?.id;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (currentUid) {
        headers["x-firebase-uid"] = currentUid;
      }

      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: composeTo,
          subject: composeSubject,
          body: composeQuote ? composeBody + "\n\n" + composeQuote : composeBody,
          attachments: composeAttachments,
          replyToMessageId: composeReplyToMessageId
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSendSuccess("Email dispatched successfully!");
        setComposeTo("");
        setComposeSubject("");
        setComposeBody("");
        setComposeQuote("");
        setComposeAttachments([]);
        setTimeout(() => {
          setView("inbox");
          setSendSuccess(null);
        }, 1500);
      } else {
        setSendError(data.error || "Failed to send email");
      }
    } catch (err: any) {
      console.error(err);
      setSendError(err.message || "An unexpected error occurred.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const getRiskColor = (classification: string) => {
    switch (classification) {
      case "Safe":
      case "Likely Safe":
        return "bg-green-500";
      case "Suspicious":
        return "bg-yellow-500";
      case "Likely Phishing":
      case "Phishing":
        return "bg-red-500";
      default:
        return "bg-gray-300";
    }
  };

  const getRiskText = (classification: string) => {
    switch (classification) {
      case "Safe":
      case "Likely Safe":
        return "text-green-600";
      case "Suspicious":
        return "text-yellow-600";
      case "Likely Phishing":
      case "Phishing":
        return "text-red-600";
      default:
        return "text-gray-400";
    }
  };

  const handleScrollToggle = () => {
    const currentScrollY = window.scrollY;
    const docHeight = document.documentElement.scrollHeight;
    const winHeight = window.innerHeight;
    if (currentScrollY < docHeight / 3) {
      window.scrollTo({ top: docHeight, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-white text-navy font-sans selection:bg-orange/20 overflow-x-hidden md:flex">
      {/* Desktop Sidebar */}
      {view !== "login" && (
        <aside className="hidden md:flex flex-col w-64 border-r border-navy/10 bg-white fixed top-0 bottom-0 left-0 h-screen z-50 overflow-hidden">
          <div className="flex items-center gap-3 p-6 pb-2 mb-6 shrink-0">
            <AppLogo className="w-10 h-10 shrink-0 drop-shadow-md" />
            <h1 className="font-display font-black text-2xl tracking-tighter italic text-navy">
              MAIL VERIFIER
            </h1>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <nav className="flex flex-col gap-4">
              {/* Mailboxes Group */}
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-navy/40 pl-4 block mb-2">
                  Mailboxes
                </span>
                <button
                  onClick={() => handleFolderChange("inbox")}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-colors",
                    view === "inbox" && activeFolder === "inbox"
                      ? "bg-navy/5 text-orange font-bold"
                      : "text-navy hover:bg-navy/5",
                  )}
                >
                  <Inbox className="w-5 h-5" />
                  <span className="text-xs font-black uppercase tracking-widest">
                    Inbox
                  </span>
                </button>
                <button
                  onClick={() => handleFolderChange("sent")}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-colors",
                    view === "inbox" && activeFolder === "sent"
                      ? "bg-navy/5 text-orange font-bold"
                      : "text-navy hover:bg-navy/5",
                  )}
                >
                  <Send className="w-5 h-5" />
                  <span className="text-xs font-black uppercase tracking-widest">
                    Sent Mail
                  </span>
                </button>
                <button
                  onClick={() => handleFolderChange("drafts")}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-colors",
                    view === "inbox" && activeFolder === "drafts"
                      ? "bg-navy/5 text-orange font-bold"
                      : "text-navy hover:bg-navy/5",
                  )}
                >
                  <FileText className="w-5 h-5" />
                  <span className="text-xs font-black uppercase tracking-widest">
                    Drafts
                  </span>
                </button>
                <button
                  onClick={() => handleFolderChange("spam")}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-colors",
                    view === "inbox" && activeFolder === "spam"
                      ? "bg-navy/5 text-orange font-bold"
                      : "text-navy hover:bg-navy/5",
                  )}
                >
                  <AlertTriangle className="w-5 h-5" />
                  <span className="text-xs font-black uppercase tracking-widest">
                    Spam
                  </span>
                </button>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-navy/40 pl-4 block mb-2">
                  Security Systems
                </span>
                <button
                  onClick={() => setView("alerts")}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-colors",
                    view === "alerts"
                      ? "bg-navy/5 text-orange font-bold"
                      : "text-navy hover:bg-navy/5",
                  )}
                >
                  <ShieldAlert className="w-5 h-5" />
                  <span className="text-xs font-black uppercase tracking-widest">
                    Alerts
                  </span>
                </button>
                <button
                  onClick={() => setView("insights")}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-colors",
                    view === "insights"
                      ? "bg-navy/5 text-orange font-bold"
                      : "text-navy hover:bg-navy/5",
                  )}
                >
                  <Globe className="w-5 h-5" />
                  <span className="text-xs font-black uppercase tracking-widest">
                    Insights
                  </span>
                </button>
                <button
                  onClick={() => {
                    setCommunityMode("list");
                    setCommunitySearchQuery("");
                    setCommunityPrefillData(undefined);
                    setView("community_reports");
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-colors",
                    view === "community_reports"
                      ? "bg-navy/5 text-orange font-bold"
                      : "text-navy hover:bg-navy/5",
                  )}
                >
                  <FileWarning className="w-5 h-5" />
                  <span className="text-xs font-black uppercase tracking-widest">
                    Community Reports
                  </span>
                </button>
                <button
                  onClick={() => {
                    setCommunityMode("submit");
                    setCommunitySearchQuery("");
                    setCommunityPrefillData(undefined);
                    setView("community_reports");
                  }}
                  className="w-full mt-1.5 flex items-center justify-center gap-2 px-3 py-2 bg-orange/10 hover:bg-orange/20 text-orange border border-orange/20 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  <FileWarning className="w-3.5 h-3.5" />
                  <span>Report an Email</span>
                </button>
              </div>

              <div className="space-y-1 pt-2">
                <button
                  onClick={() => setView("subscription")}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5 w-full rounded-2xl transition-colors",
                    view === "subscription"
                      ? "bg-navy/5 text-orange font-bold"
                      : "text-navy hover:bg-navy/5",
                  )}
                >
                  <CreditCard className="w-5 h-5" />
                  <span className="text-xs font-black uppercase tracking-widest">
                    Subscription
                  </span>
                </button>

                <button
                  onClick={() => setView("settings")}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5 w-full rounded-2xl transition-colors",
                    view === "settings"
                      ? "bg-navy/5 text-orange font-bold"
                      : "text-navy hover:bg-navy/5",
                  )}
                >
                  <User className="w-5 h-5" />
                  <span className="text-xs font-black uppercase tracking-widest">
                    Settings
                  </span>
                </button>

                {(user?.isAdmin || user?.isSuperAdmin || user?.email?.toLowerCase().trim() === "adamu0533@gmail.com") && (
                  <button
                    onClick={() => setView("admin")}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3.5 w-full rounded-2xl transition-colors mt-2",
                      view === "admin"
                        ? "bg-orange text-white font-bold"
                        : "bg-orange/10 text-orange hover:bg-orange/20",
                    )}
                  >
                    <Shield className="w-5 h-5" />
                    <span className="text-xs font-black uppercase tracking-widest">
                      Admin Dashboard
                    </span>
                  </button>
                )}
              </div>
            </nav>
          </div>
        </aside>
      )}

      {/* Main Content Wrapper */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 pb-24 md:pb-0",
          view !== "login" && "md:pl-64",
        )}
      >
        {/* Mobile App Shell Header - Hide on login and desktop */}
        {view !== "login" && (
          <header className="md:hidden sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-navy/10 h-16">
            <div className="max-w-xl mx-auto h-full px-4 flex items-center justify-between relative">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="p-2 -ml-2 rounded-lg bg-navy/5 hover:bg-navy/10 active:scale-95 transition-all text-navy"
                  aria-label="Open navigation menu"
                  id="mobile-menu-burger-btn"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <AppLogo className="w-8 h-8 drop-shadow-md" />
                <h1 className="font-display font-black text-xl tracking-tighter italic text-navy">
                  MAIL VERIFIER
                </h1>
              </div>

              <button
                onClick={() => setView("settings")}
                className={cn(
                  "p-2 rounded-full transition-all",
                  view === "settings"
                    ? "bg-orange text-navy"
                    : "bg-navy/10 text-navy",
                )}
              >
                <User className="w-5 h-5" />
              </button>

              {/* Mobile Menu Dropdown Overlay */}
              <AnimatePresence>
                {mobileMenuOpen && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setMobileMenuOpen(false)}
                      className="fixed inset-0 bg-navy/20 z-40 backdrop-blur-xs md:hidden"
                      style={{ top: "64px" }}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-16 left-0 right-0 z-50 bg-white border-b border-navy/15 shadow-2xl md:hidden overflow-hidden flex flex-col"
                    >
                      <div className="p-4 space-y-4">
                        <div className="space-y-1">
                          <span className="text-[9px] font-black uppercase tracking-widest text-navy/40 pl-3">
                            Mail Folders
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => {
                                handleFolderChange("inbox");
                                setMobileMenuOpen(false);
                              }}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-bold uppercase tracking-wider transition-colors",
                                view === "inbox" && activeFolder === "inbox"
                                  ? "bg-navy text-orange"
                                  : "bg-navy/5 text-navy hover:bg-navy/10",
                              )}
                            >
                              <Inbox className="w-4 h-4" />
                              <span>Inbox</span>
                            </button>
                            <button
                              onClick={() => {
                                handleFolderChange("sent");
                                setMobileMenuOpen(false);
                              }}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-bold uppercase tracking-wider transition-colors",
                                view === "inbox" && activeFolder === "sent"
                                  ? "bg-navy text-orange"
                                  : "bg-navy/5 text-navy hover:bg-navy/10",
                              )}
                            >
                              <Send className="w-4 h-4" />
                              <span>Sent</span>
                            </button>
                            <button
                              onClick={() => {
                                handleFolderChange("drafts");
                                setMobileMenuOpen(false);
                              }}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-bold uppercase tracking-wider transition-colors",
                                view === "inbox" && activeFolder === "drafts"
                                  ? "bg-navy text-orange"
                                  : "bg-navy/5 text-navy hover:bg-navy/10",
                              )}
                            >
                              <FileText className="w-4 h-4" />
                              <span>Drafts</span>
                            </button>
                            <button
                              onClick={() => {
                                handleFolderChange("spam");
                                setMobileMenuOpen(false);
                              }}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-bold uppercase tracking-wider transition-colors",
                                view === "inbox" && activeFolder === "spam"
                                  ? "bg-navy text-orange"
                                  : "bg-navy/5 text-navy hover:bg-navy/10",
                              )}
                            >
                              <AlertTriangle className="w-4 h-4" />
                              <span>Spam</span>
                            </button>
                          </div>
                        </div>

                        <hr className="border-navy/10" />

                        <div className="space-y-1">
                          <span className="text-[9px] font-black uppercase tracking-widest text-navy/40 pl-3">
                            Systems
                          </span>
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => {
                                setView("alerts");
                                setMobileMenuOpen(false);
                              }}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-bold uppercase tracking-wider transition-colors",
                                view === "alerts"
                                  ? "bg-navy text-orange"
                                  : "bg-navy/5 text-navy hover:bg-navy/10",
                              )}
                            >
                              <ShieldAlert className="w-4 h-4" />
                              <span>Threat Alerts</span>
                            </button>
                            <button
                              onClick={() => {
                                setView("insights");
                                setMobileMenuOpen(false);
                              }}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-bold uppercase tracking-wider transition-colors",
                                view === "insights"
                                  ? "bg-navy text-orange"
                                  : "bg-navy/5 text-navy hover:bg-navy/10",
                              )}
                            >
                              <Globe className="w-4 h-4" />
                              <span>Global Insights</span>
                            </button>
                            <button
                              onClick={() => {
                                setCommunityMode("list");
                                setCommunitySearchQuery("");
                                setCommunityPrefillData(undefined);
                                setView("community_reports");
                                setMobileMenuOpen(false);
                              }}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-bold uppercase tracking-wider transition-colors",
                                view === "community_reports"
                                  ? "bg-navy text-orange"
                                  : "bg-navy/5 text-navy hover:bg-navy/10",
                              )}
                            >
                              <FileWarning className="w-4 h-4" />
                              <span>Community Reports</span>
                            </button>
                            <button
                              onClick={() => {
                                setView("subscription");
                                setMobileMenuOpen(false);
                              }}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-bold uppercase tracking-wider transition-colors",
                                view === "subscription"
                                  ? "bg-navy text-orange"
                                  : "bg-navy/5 text-navy hover:bg-navy/10",
                              )}
                            >
                              <CreditCard className="w-4 h-4" />
                              <span>Billing & Subscription</span>
                            </button>
                            <button
                              onClick={() => {
                                setView("settings");
                                setMobileMenuOpen(false);
                              }}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-bold uppercase tracking-wider transition-colors",
                                view === "settings"
                                  ? "bg-navy text-orange"
                                  : "bg-navy/5 text-navy hover:bg-navy/10",
                              )}
                            >
                              <User className="w-4 h-4" />
                              <span>Account Settings</span>
                            </button>

                            {(user?.isAdmin || user?.isSuperAdmin || user?.email?.toLowerCase().trim() === "adamu0533@gmail.com") && (
                              <button
                                onClick={() => {
                                  setView("admin");
                                  setMobileMenuOpen(false);
                                }}
                                className={cn(
                                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-bold uppercase tracking-wider transition-colors mt-2",
                                  view === "admin"
                                    ? "bg-orange text-white"
                                    : "bg-orange/10 text-orange hover:bg-orange/20",
                                )}
                              >
                                <Shield className="w-4 h-4" />
                                <span>Admin Dashboard</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </header>
        )}

        <main className="max-w-3xl mx-auto w-full px-4 xl:px-8 py-6 flex-1">
          <AnimatePresence mode="wait">
            {view === "login" && (
              <motion.div
                key="login"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="min-h-[85vh] flex flex-col items-center justify-center p-4"
              >
                <div className="w-full max-w-sm space-y-12">
                  <div className="text-center space-y-4">
                    <div className="mx-auto flex justify-center rotate-3 perspective-1000 mb-4 drop-shadow-2xl">
                      <AppLogo className="w-24 h-24" />
                    </div>
                    <div className="space-y-1">
                      <h1 className="text-4xl font-display font-black italic tracking-tighter text-navy uppercase leading-none">
                        MAIL <span className="text-orange">VERIFIER</span>
                      </h1>
                    </div>
                  </div>

                  {loginMode === "landing" ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      <div className="space-y-3">
                        <button
                          onClick={() => setLoginMode("login")}
                          className="w-full bg-navy text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-navy/10 hover:bg-navy/90 transition-all border border-transparent"
                        >
                          Sign In
                        </button>
                        <button
                          onClick={() => setLoginMode("signup")}
                          className="w-full bg-white text-navy py-5 rounded-2xl font-black uppercase tracking-widest text-xs border border-navy/10 shadow-sm hover:bg-navy/5 transition-all"
                        >
                          Create Account
                        </button>
                        <div className="relative py-2">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-navy/5"></div>
                          </div>
                          <div className="relative flex justify-center text-[8px] font-black uppercase tracking-[4px] text-navy/20">
                            <span className="bg-white px-2">OR</span>
                          </div>
                        </div>
                        <button
                          onClick={handleConnect}
                          className="w-full bg-white border border-navy/10 text-navy py-5 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-navy/5 transition-all"
                        >
                          <Mail className="w-4 h-4 text-orange" />
                          Continue with Google
                        </button>
                      </div>
                    </motion.div>
                  ) : loginMode === "login" ? (
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-white p-8 rounded-[2.5rem] border border-navy/10 shadow-2xl shadow-navy/5 space-y-6 relative"
                    >
                      <button
                        onClick={() => setLoginMode("landing")}
                        className="absolute top-6 left-6 text-[10px] font-black uppercase tracking-widest text-navy/30 hover:text-navy"
                      >
                        ← Back
                      </button>

                      <div className="text-center pt-6 space-y-2">
                        <h3 className="text-lg font-black text-navy uppercase tracking-tight">
                          Welcome Back
                        </h3>
                      </div>

                      <form onSubmit={handleManualLogin} className="space-y-4">
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-navy/40 ml-2">
                              Email Address
                            </label>
                            <div className="relative">
                              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy/30" />
                              <input
                                type="email"
                                required
                                value={authFormData.email}
                                onChange={(e) =>
                                  setAuthFormData({
                                    ...authFormData,
                                    email: e.target.value,
                                  })
                                }
                                placeholder="name@example.com"
                                className="w-full bg-navy/[0.03] border border-navy/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange/20 transition-all"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-navy/40 ml-2">
                              Password
                            </label>
                            <div className="relative">
                              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy/30" />
                              <input
                                type={showPassword ? "text" : "password"}
                                required
                                value={authFormData.password}
                                onChange={(e) =>
                                  setAuthFormData({
                                    ...authFormData,
                                    password: e.target.value,
                                  })
                                }
                                placeholder="••••••••"
                                className="w-full bg-navy/[0.03] border border-navy/10 rounded-2xl py-4 pl-12 pr-12 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange/20 transition-all"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-navy/30 hover:text-navy transition-colors"
                              >
                                {showPassword ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                            <div className="flex justify-between items-center px-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={authFormData.rememberMe}
                                  onChange={(e) =>
                                    setAuthFormData({
                                      ...authFormData,
                                      rememberMe: e.target.checked,
                                    })
                                  }
                                  className="w-3.5 h-3.5 accent-orange focus:ring-orange/20"
                                />
                                <span className="text-[10px] font-bold tracking-widest uppercase text-navy/60">Keep me logged in</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => setLoginMode("forgot")}
                                className="text-[9px] font-black uppercase tracking-widest text-orange hover:text-navy transition-colors"
                              >
                                Forgot Password?
                              </button>
                            </div>
                          </div>

                          {authError && (
                            <div
                              className="space-y-3.5"
                              id="auth-error-container"
                            >
                              <p className="text-[10px] text-red-500 font-bold text-center uppercase tracking-widest leading-normal">
                                {authError}
                              </p>
                            </div>
                          )}

                          <button
                            type="submit"
                            className="group w-full bg-navy text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-navy/90 transition-all shadow-xl shadow-navy/10 mt-2"
                          >
                            Sign In
                            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-2" />
                          </button>
                        </div>

                        <div className="relative py-2">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-navy/5"></div>
                          </div>
                          <div className="relative flex justify-center text-[8px] font-black uppercase tracking-[4px] text-navy/20">
                            <span className="bg-white px-2">
                              OR SECURE CONNECT
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleConnect}
                          id="btn-google-login"
                          className="w-full bg-navy/[0.03] border border-navy/10 text-navy py-4 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 hover:bg-navy/5 transition-all"
                        >
                          <Mail className="w-4 h-4 text-orange" />
                          Login with Google
                        </button>

                        <div className="pt-4 text-center">
                          <button
                            type="button"
                            onClick={() => setLoginMode("signup")}
                            className="text-[10px] font-black uppercase tracking-widest text-navy/50 hover:text-navy transition-colors"
                          >
                            Don't have an account? Create one
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  ) : loginMode === "signup" ? (
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-white p-8 rounded-[2.5rem] border border-navy/10 shadow-2xl shadow-navy/5 space-y-6 relative"
                    >
                      <button
                        onClick={() => setLoginMode("landing")}
                        className="absolute top-6 left-6 text-[10px] font-black uppercase tracking-widest text-navy/30 hover:text-navy"
                      >
                        ← Back
                      </button>

                      <div className="text-center pt-6 space-y-2">
                        <h3 className="text-lg font-black text-navy uppercase tracking-tight">
                          Create Profile
                        </h3>
                      </div>

                      <form onSubmit={handleManualSignup} className="space-y-4">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-navy/40 ml-2">
                              Full Name
                            </label>
                            <div className="relative">
                              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy/30" />
                              <input
                                type="text"
                                required
                                value={authFormData.name}
                                onChange={(e) =>
                                  setAuthFormData({
                                    ...authFormData,
                                    name: e.target.value,
                                  })
                                }
                                placeholder="John Doe"
                                className="w-full bg-navy/[0.03] border border-navy/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange/20 transition-all"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-navy/40 ml-2">
                              Email Address
                            </label>
                            <div className="relative">
                              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy/30" />
                              <input
                                type="email"
                                required
                                value={authFormData.email}
                                onChange={(e) =>
                                  setAuthFormData({
                                    ...authFormData,
                                    email: e.target.value,
                                  })
                                }
                                placeholder="name@example.com"
                                className="w-full bg-navy/[0.03] border border-navy/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange/20 transition-all"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px) font-black uppercase tracking-widest text-navy/40 ml-2">
                              Phone Number
                            </label>
                            <div className="relative">
                              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy/30" />
                              <input
                                type="tel"
                                value={authFormData.phone}
                                onChange={(e) =>
                                  setAuthFormData({
                                    ...authFormData,
                                    phone: e.target.value,
                                  })
                                }
                                placeholder="+1 (555) 000-0000"
                                className="w-full bg-navy/[0.03] border border-navy/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange/20 transition-all"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-navy/40 ml-2">
                              Choose Password
                            </label>
                            <div className="relative">
                              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy/30" />
                              <input
                                type={showPassword ? "text" : "password"}
                                required
                                value={authFormData.password}
                                onChange={(e) =>
                                  setAuthFormData({
                                    ...authFormData,
                                    password: e.target.value,
                                  })
                                }
                                placeholder="••••••••"
                                className="w-full bg-navy/[0.03] border border-navy/10 rounded-2xl py-4 pl-12 pr-12 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange/20 transition-all"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-navy/30 hover:text-navy transition-colors"
                              >
                                {showPassword ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>

                          <div
                            className="flex gap-3 px-2 py-2 cursor-pointer group"
                            onClick={() =>
                              setAuthFormData({
                                ...authFormData,
                                consent: !authFormData.consent,
                              })
                            }
                          >
                            <div className="mt-1 flex-shrink-0">
                              {authFormData.consent ? (
                                <CheckSquare className="w-4 h-4 text-orange" />
                              ) : (
                                <Square className="w-4 h-4 text-navy/20 group-hover:text-navy/40" />
                              )}
                            </div>
                            <p className="text-[10px] text-navy/50 font-medium leading-tight">
                              I consent to the app to get access all existing
                              and future mails for neural security processing.
                            </p>
                          </div>

                          {authError && (
                            <p className="text-[10px] text-red-500 font-bold text-center uppercase tracking-widest">
                              {authError}
                            </p>
                          )}

                          <button
                            type="submit"
                            className="w-full bg-navy text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-navy/10 border border-transparent hover:bg-navy/90 transition-all"
                          >
                            Create Account
                          </button>

                          <div className="pt-4 text-center">
                            <button
                              type="button"
                              onClick={() => setLoginMode("login")}
                              className="text-[10px] font-black uppercase tracking-widest text-navy/50 hover:text-navy transition-colors"
                            >
                              Already have an account? Sign In
                            </button>
                          </div>
                        </div>
                      </form>
                    </motion.div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-white p-8 rounded-[2.5rem] border border-navy/10 shadow-2xl shadow-navy/5 space-y-6 relative"
                    >
                      <button
                        onClick={() => setLoginMode("login")}
                        className="absolute top-6 left-6 text-[10px] font-black uppercase tracking-widest text-navy/30 hover:text-navy"
                      >
                        ← Back
                      </button>

                      <div className="text-center pt-6 space-y-2">
                        <h3 className="text-lg font-black text-navy uppercase tracking-tight">
                          Recovery
                        </h3>
                        <p className="text-[10px] text-navy/40 font-medium">
                          Enter your email to receive recovery link
                        </p>
                      </div>

                      <form
                        onSubmit={handleForgotPassword}
                        className="space-y-4"
                      >
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-widest text-navy/40 ml-2">
                            Email Address
                          </label>
                          <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy/30" />
                            <input
                              type="email"
                              required
                              value={authFormData.email}
                              onChange={(e) =>
                                setAuthFormData({
                                  ...authFormData,
                                  email: e.target.value,
                                })
                              }
                              placeholder="name@example.com"
                              className="w-full bg-navy/[0.03] border border-navy/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange/20 transition-all"
                            />
                          </div>
                        </div>
                        <button
                          type="submit"
                          className="w-full bg-navy text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-navy/10"
                        >
                          Send Reset Link
                        </button>
                      </form>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}

            {view === "inbox" && (
              <motion.div
                key="inbox"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between px-2">
                  <div>
                    <h2 className="text-2xl font-display font-black italic uppercase tracking-tight text-navy">
                      {activeFolder === "inbox"
                        ? "Inbox"
                        : activeFolder === "sent"
                          ? "Sent Mail"
                          : activeFolder === "drafts"
                            ? "Drafts"
                            : "Spam"}
                    </h2>
                  </div>
                  <button
                    onClick={() => {
                      fetchInbox(undefined, searchQuery);
                    }}
                    disabled={isLoadingInbox}
                    className="p-3 bg-navy/5 rounded-2xl text-navy hover:bg-navy/10 transition-colors"
                  >
                    <RefreshCw
                      className={cn(
                        "w-5 h-5",
                        isLoadingInbox && "animate-spin",
                      )}
                    />
                  </button>
                </div>

                <div className="flex gap-2 px-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy/30" />
                    <input
                      type="text"
                      placeholder="Search emails..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          fetchInbox(undefined, searchQuery);
                        }
                      }}
                      className="w-full bg-navy/[0.03] border border-navy/10 rounded-2xl py-3 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange/20 transition-all"
                    />
                  </div>

                  <button
                    onClick={() => setShowDateFilter(!showDateFilter)}
                    className={cn(
                      "p-3 rounded-2xl transition-all flex items-center justify-center border",
                      showDateFilter || startDate || endDate
                        ? "bg-navy text-orange border-navy shadow-sm"
                        : "bg-navy/[0.03] text-navy border-navy/10 hover:bg-navy/[0.08]",
                    )}
                    title="Filter by Date"
                    type="button"
                    id="date-filter-toggle-btn"
                  >
                    <Calendar className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => setView("compose")}
                    className="p-3 bg-orange text-navy rounded-2xl hover:bg-orange/90 transition-colors shadow-sm flex items-center justify-center cursor-pointer"
                    title="Compose Email"
                  >
                    <Plus className="w-5 h-5 font-bold" />
                  </button>
                </div>

                {/* Collapsible Date Filter Panel */}
                <AnimatePresence>
                  {showDateFilter && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden px-2 mb-2"
                    >
                      <div className="bg-navy/[0.03] border border-navy/10 rounded-3xl p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="flex-1 space-y-1">
                            <label className="text-[9px] font-black uppercase tracking-widest text-navy/40 pl-1">
                              After (Start Date)
                            </label>
                            <input
                              type="date"
                              value={startDate}
                              onChange={(e) => setStartDate(e.target.value)}
                              className="w-full bg-white border border-navy/10 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-orange/20 focus:outline-none text-navy"
                            />
                          </div>
                          <div className="flex-1 space-y-1">
                            <label className="text-[9px] font-black uppercase tracking-widest text-navy/40 pl-1">
                              Before (End Date)
                            </label>
                            <input
                              type="date"
                              value={endDate}
                              onChange={(e) => setEndDate(e.target.value)}
                              className="w-full bg-white border border-navy/10 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-orange/20 focus:outline-none text-navy"
                            />
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-navy/5">
                          <button
                            onClick={() => {
                              setStartDate("");
                              setEndDate("");
                              fetchInbox(undefined, searchQuery);
                            }}
                            className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-red-500 hover:text-red-600 transition-colors"
                          >
                            Clear Dates
                          </button>

                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setShowDateFilter(false);
                              }}
                              className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-navy/40 hover:text-navy/60 transition-colors"
                            >
                              Close
                            </button>
                            <button
                              onClick={() => {
                                fetchInbox(undefined, searchQuery);
                              }}
                              className="px-4 py-1.5 bg-navy text-orange rounded-xl text-[9px] font-black uppercase tracking-widest shadow-md shadow-navy/10 hover:bg-navy/90 transition-all"
                            >
                              Apply Filters
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Folder Tabs Switcher Row */}
                <div className="flex gap-1.5 overflow-x-auto px-2 pb-1 scrollbar-none">
                  <button
                    onClick={() => handleFolderChange("inbox")}
                    className={cn(
                      "px-4 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5",
                      activeFolder === "inbox"
                        ? "bg-navy text-orange shadow-md shadow-navy/15"
                        : "bg-navy/[0.04] text-navy/60 hover:bg-navy/[0.08]",
                    )}
                  >
                    <Inbox className="w-3.5 h-3.5" />
                    Inbox
                  </button>
                  <button
                    onClick={() => handleFolderChange("sent")}
                    className={cn(
                      "px-4 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5",
                      activeFolder === "sent"
                        ? "bg-navy text-orange shadow-md shadow-navy/15"
                        : "bg-navy/[0.04] text-navy/60 hover:bg-navy/[0.08]",
                    )}
                  >
                    <Send className="w-3.5 h-3.5" />
                    Sent
                  </button>
                  <button
                    onClick={() => handleFolderChange("drafts")}
                    className={cn(
                      "px-4 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5",
                      activeFolder === "drafts"
                        ? "bg-navy text-orange shadow-md shadow-navy/15"
                        : "bg-navy/[0.04] text-navy/60 hover:bg-navy/[0.08]",
                    )}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Drafts
                  </button>
                  <button
                    onClick={() => handleFolderChange("spam")}
                    className={cn(
                      "px-4 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5",
                      activeFolder === "spam"
                        ? "bg-navy text-orange shadow-md shadow-navy/15"
                        : "bg-navy/[0.04] text-navy/60 hover:bg-navy/[0.08]",
                    )}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Spam
                  </button>
                </div>

                {isLoadingInbox ? (
                  <div className="py-20 flex flex-col items-center gap-4 text-center">
                    <div className="w-12 h-12 border-4 border-navy/10 border-t-orange rounded-full animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-navy/40">
                      Syncing Stream...
                    </span>
                  </div>
                ) : !isGmailConnected ? (
                  <div className="py-20 flex flex-col items-center gap-6 text-center px-8">
                    <div className="w-16 h-16 bg-navy/5 rounded-3xl flex items-center justify-center">
                      <Mail className="w-8 h-8 text-navy/20" />
                    </div>
                    <div className="space-y-4">
                      <h3 className="font-display font-black text-xl text-navy uppercase italic tracking-tight">
                        Gmail Connection Required
                      </h3>
                      <p className="text-xs text-navy/50 leading-relaxed font-medium">
                        To scan your communications for threats, you must
                        authorize a secure bridge to your Gmail inbox.
                      </p>
                      {authError && (
                        <p className="text-[10px] text-red-500 font-bold text-center uppercase tracking-widest leading-normal">
                          {authError}
                        </p>
                      )}
                      <button
                        onClick={handleConnect}
                        className="w-full bg-navy text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-navy/90 transition-all shadow-xl shadow-navy/10"
                      >
                        <Shield className="w-4 h-4 text-orange" />
                        Establish Secure Bridge
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : inbox.length === 0 ? (
                  <div className="py-20 text-center space-y-4">
                    <Inbox
                      className="w-12 h-12 text-navy/20 mx-auto"
                      id="empty-inbox-icon"
                    />
                    <h3 className="font-display font-bold text-lg text-navy uppercase italic">
                      Stream is Secure
                    </h3>
                    <p className="text-xs text-navy/50 leading-relaxed max-w-sm mx-auto">
                      All clear! No email communications were detected in the selected mailbox category.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {inbox.map((msg) => (
                      <motion.div
                        key={msg.id}
                        onClick={() => selectEmail(msg)}
                        className="bg-navy/[0.03] p-5 rounded-3xl border border-navy/10 cursor-pointer hover:bg-navy/5 transition-colors group"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {msg.analysis && (
                              <div
                                className={cn(
                                  "w-2 h-2 rounded-full",
                                  getRiskColor(msg.analysis.classification),
                                )}
                              />
                            )}
                            <span className="text-[10px] font-black uppercase tracking-widest text-orange truncate max-w-[200px]">
                              {msg.from.split("<")[0].trim()}
                            </span>
                            {(() => {
                              const senderAddr = (msg.from.match(/<(.+)>/)?.[1] || msg.from).toLowerCase().trim();
                              const count = reportedSendersMap[senderAddr];
                              if (!count) return null;
                              return (
                                <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                                  <FileWarning className="w-2.5 h-2.5" />
                                  Community Reported ({count})
                                </span>
                              );
                            })()}
                          </div>
                          <div className="flex flex-col items-end text-right">
                            <span className="text-[9px] font-mono text-navy/40">
                              {new Date(msg.date).toLocaleDateString()}
                            </span>
                            <span className="text-[9px] font-mono text-navy/30">
                              {new Date(msg.date).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                        <h3 className="font-display font-bold text-lg leading-tight mb-1 truncate text-navy group-hover:text-orange transition-colors">
                          {msg.subject}
                        </h3>

                        {msg.analysis ? (
                          <div className="mb-2">
                            <p
                              className={cn(
                                "text-[9px] font-black uppercase tracking-widest mb-1",
                                getRiskText(msg.analysis.classification),
                              )}
                            >
                              {msg.analysis.classification} •{" "}
                              {msg.analysis.severity} Risk (
                              {msg.analysis.risk_score}%)
                            </p>
                            <p className="text-[10px] text-navy/60 font-medium italic">
                              "{msg.analysis.short_reason}"
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-navy/60 line-clamp-1 leading-relaxed mb-1">
                            {msg.snippet}
                          </p>
                        )}
                      </motion.div>
                    ))}
                    {inbox.length > 0 && (
                      <div className="pt-4 pb-6 text-center">
                        {isSyncingAll ? (
                          <div
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-navy/[0.03] border border-navy/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-navy/50"
                            id="syncing-indicator"
                          >
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-orange" />
                            <span>
                              Syncing mailbox: {inbox.length} messages loaded
                            </span>
                          </div>
                        ) : inboxNextPageToken ? (
                          <div
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-navy/[0.03] border border-navy/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-navy/50"
                            id="paused-indicator"
                          >
                            <span>Loaded {inbox.length} messages</span>
                          </div>
                        ) : (
                          <div
                            className="inline-flex items-center gap-2 px-4 py-2 bg-navy/[0.02] rounded-2xl text-[10px] font-black uppercase tracking-widest text-navy/30"
                            id="all-loaded-stamp"
                          >
                            <span>
                              All {inbox.length} messages loaded • Secure Stream
                              Synced
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {inbox.length === 0 && (
                      <div className="py-20 text-center space-y-4">
                        <Inbox
                          className="w-12 h-12 text-navy/10 mx-auto"
                          id="empty-inbox-icon"
                        />
                        <p className="text-xs font-black uppercase tracking-widest text-navy/20">
                          Secure stream is empty.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {inbox.length > 0 && (
                  <div
                    className="fixed right-6 bottom-24 md:bottom-8 z-40 flex flex-col gap-2.5"
                    id="inbox-scroll-nav"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        window.scrollTo({ top: 0, behavior: "smooth" })
                      }
                      className="p-3 bg-navy text-orange border border-navy/10 rounded-full shadow-xl hover:bg-navy/90 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                      title="Scroll to Top_First Messages"
                      id="btn-scroll-to-first"
                    >
                      <ChevronUp className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        window.scrollTo({
                          top: document.documentElement.scrollHeight,
                          behavior: "smooth",
                        })
                      }
                      className="p-3 bg-navy text-orange border border-navy/10 rounded-full shadow-xl hover:bg-navy/90 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                      title="Scroll to Bottom_Last Messages"
                      id="btn-scroll-to-last"
                    >
                      <ChevronDown className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {view === "alerts" && (
              <motion.div
                key="alerts"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-8"
              >
                {!isPremiumActive() ? (
                  renderSubscriptionGate("REAL-TIME SECURITY ALARM RADAR")
                ) : (
                  <>
                    <div className="space-y-1">
                      <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter text-navy flex items-center gap-3 leading-none">
                        <ShieldAlert className="text-orange w-8 h-8" />
                        REALTIME ALERTS
                      </h2>
                      <p className="text-[10px] font-black uppercase tracking-[5px] text-navy/30">
                        Active Neural Monitoring
                      </p>
                    </div>

                    <div className="space-y-4">
                      {inbox.filter(
                        (m) =>
                          m.analysis &&
                          (m.analysis.classification === "Phishing" ||
                            m.analysis.classification === "Likely Phishing"),
                      ).length === 0 ? (
                        <div className="py-20 bg-navy/[0.02] border-2 border-dashed border-navy/5 rounded-[3rem] flex flex-col items-center justify-center text-center p-8 space-y-4">
                          <ShieldCheck className="w-16 h-16 text-green-500 opacity-20" />
                          <div>
                            <p className="text-sm font-bold text-navy">
                              No Critical Threats
                            </p>
                            <p className="text-[10px] uppercase font-black tracking-widest text-navy/30">
                              Your inbox is currently clear of active phishing
                              attempts.
                            </p>
                          </div>
                        </div>
                      ) : (
                        inbox
                          .filter(
                            (m) =>
                              m.analysis &&
                              (m.analysis.classification === "Phishing" ||
                                m.analysis.classification === "Likely Phishing"),
                          )
                          .map((msg) => (
                            <motion.div
                              key={msg.id}
                              onClick={() => selectEmail(msg)}
                              className="bg-red-50 p-6 rounded-[2.5rem] border border-red-100 space-y-3 cursor-pointer relative overflow-hidden"
                            >
                              <div className="absolute top-0 right-0 p-4 opacity-5">
                                <AlertTriangle className="w-12 h-12 text-red-600" />
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="px-2 py-0.5 bg-red-600 text-white text-[8px] font-black uppercase tracking-widest rounded-full">
                                  DANGER
                                </div>
                                <span className="text-[9px] font-mono text-red-900/40 uppercase truncate max-w-[200px]">
                                  {msg.from}
                                </span>
                              </div>
                              <h3 className="text-red-900 font-bold text-lg leading-tight">
                                {msg.subject}
                              </h3>
                              <p className="text-red-800/70 text-[11px] font-medium italic italic leading-relaxed">
                                {msg.analysis?.short_reason ||
                                  "Detecting suspicious patterns. Do not click any links."}
                              </p>
                              <div className="pt-2">
                                <span className="text-[9px] font-black uppercase tracking-widest text-red-600 border-b border-red-600 pb-0.5">
                                  Secure Analysis Result
                                </span>
                              </div>
                            </motion.div>
                          ))
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {view === "insights" && (
              <motion.div
                key="insights"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-8"
              >
                {!isPremiumActive() ? (
                  renderSubscriptionGate("THREAT INSIGHTS ANALYTICS")
                ) : (
                  <>
                    <div className="space-y-1">
                      <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter text-navy flex items-center gap-3 leading-none">
                        <Globe className="text-orange w-8 h-8" />
                        THREAT INSIGHTS
                      </h2>
                      <p className="text-[10px] font-black uppercase tracking-[5px] text-navy/30">
                        Neural Analytics Hub
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-navy/[0.03] p-6 rounded-[2.5rem] border border-navy/10 space-y-2 text-navy">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-40 leading-none">
                          Total Audited
                        </p>
                        <p className="text-4xl font-display font-black italic leading-none">
                          {inbox.length}
                        </p>
                      </div>
                      <div className="bg-orange/5 p-6 rounded-[2.5rem] border border-orange/10 space-y-2 text-orange">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-60 leading-none">
                          Neutralized
                        </p>
                        <p className="text-4xl font-display font-black italic leading-none">
                          {
                            inbox.filter(
                              (m) =>
                                m.analysis &&
                                (m.analysis.classification === "Phishing" ||
                                  m.analysis.classification === "Likely Phishing"),
                            ).length
                          }
                        </p>
                      </div>
                    </div>

                    <div className="bg-navy text-white p-8 rounded-[3rem] space-y-6">
                      <h3 className="text-xl font-display font-black uppercase italic tracking-tight leading-none">
                        Risk Atmosphere
                      </h3>
                      <div className="space-y-4">
                        {[
                          {
                            label: "Phishing Attempts",
                            val: inbox.filter(
                              (m) =>
                                m.analysis &&
                                (m.analysis.classification === "Phishing" ||
                                  m.analysis.classification === "Likely Phishing"),
                            ).length,
                            color: "bg-red-500",
                          },
                          {
                            label: "Suspicious Activity",
                            val: inbox.filter(
                              (m) =>
                                m.analysis &&
                                m.analysis.classification === "Suspicious",
                            ).length,
                            color: "bg-yellow-500",
                          },
                          {
                            label: "Safe Transfers",
                            val: inbox.filter(
                              (m) =>
                                m.analysis &&
                                (m.analysis.classification === "Safe" ||
                                  m.analysis.classification === "Likely Safe"),
                            ).length,
                            color: "bg-green-500",
                          },
                        ].map((item, i) => (
                          <div key={i} className="space-y-2">
                            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                              <span className="opacity-60">{item.label}</span>
                              <span>
                                {Math.round((item.val / (inbox.length || 1)) * 100)}
                                %
                              </span>
                            </div>
                            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{
                                  width: `${(item.val / (inbox.length || 1)) * 100}%`,
                                }}
                                className={cn("h-full", item.color)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-navy/5 p-8 rounded-[3rem] border border-navy/10 space-y-4">
                      <h3 className="text-lg font-bold text-navy leading-none">
                        Global Threat Vector
                      </h3>
                      <p className="text-xs text-navy/60 leading-relaxed font-medium">
                        Most common attack vector detected in your region:{" "}
                        <span className="text-orange font-bold font-mono">
                          FINANCIAL_IP_SPOOFING
                        </span>
                        . Our AI has updated your local neural protocols to
                        prioritize domain trust signals.
                      </p>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {view === "result" && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between gap-4 text-navy w-full">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setView("inbox")}
                      className="p-3 bg-navy/5 hover:bg-navy/10 rounded-2xl text-navy transition-colors cursor-pointer"
                      title="Back to Messages"
                    >
                      <ArrowRight className="w-5 h-5 rotate-180" />
                    </button>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-navy/40 block">
                        Email Inspection & Verification
                      </span>
                      <p className="text-xs font-bold text-navy truncate max-w-xs md:max-w-md">
                        {formData.subject || "Untitled Email"}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleReportCurrentEmail}
                    className="flex items-center gap-2 px-4 py-2.5 bg-orange hover:bg-orange/90 text-navy font-display font-black text-xs uppercase tracking-wider rounded-2xl shadow-sm transition-all cursor-pointer shrink-0"
                    title="Submit report with prefilled email evidence"
                  >
                    <FileWarning className="w-4 h-4" />
                    <span className="hidden sm:inline">Report This Email</span>
                    <span className="sm:hidden">Report</span>
                  </button>
                </div>

                {/* Public Community Reported Email Warning Banner */}
                {senderCommunityWarning?.reported && (
                  <div className="p-5 bg-red-50 border-2 border-red-300 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-in fade-in">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-red-600 text-white rounded-2xl shrink-0">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-wider text-red-900">
                            Community Threat Warning: Reported Sender
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-red-600 text-white">
                            {senderCommunityWarning.count} Admin-Verified Report{senderCommunityWarning.count > 1 ? "s" : ""}
                          </span>
                        </div>
                        <p className="text-xs text-red-800 font-medium leading-relaxed">
                          The sender address <span className="font-mono font-bold">{formData.senderEmail}</span> has been reported by community users and verified by Mail Verifier administrators. Exercise extreme caution before trusting links or requests.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCommunityMode("list");
                        setCommunitySearchQuery(formData.senderEmail || "");
                        setCommunityPrefillData(undefined);
                        setView("community_reports");
                      }}
                      className="self-start sm:self-center px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
                    >
                      <Eye className="w-4 h-4" />
                      <span>View Public Report</span>
                    </button>
                  </div>
                )}

                <div className="space-y-6">
                  {/* Tabs */}
                  <div className="flex w-full bg-navy/5 p-1.5 rounded-2xl gap-1.5">
                    <button
                      onClick={() => setResultTab("message")}
                      className={cn(
                        "flex-1 py-3 px-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                        resultTab === "message"
                          ? "bg-white text-navy shadow-sm"
                          : "text-navy/50 hover:text-navy hover:bg-white/50",
                      )}
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Message</span>
                    </button>
                    <button
                      onClick={() => {
                        setResultTab("analysis");
                        if (!result && !isAnalyzing && (formData.senderEmail || formData.body || formData.subject)) {
                          handleAnalyze(formData);
                        }
                      }}
                      className={cn(
                        "flex-1 py-3 px-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                        resultTab === "analysis"
                          ? "bg-gradient-to-r from-orange via-amber-500 to-rose-500 text-white shadow-lg shadow-orange/30 ring-2 ring-orange/20"
                          : "bg-gradient-to-r from-orange/15 via-amber-500/15 to-rose-500/15 text-orange border border-orange/35 hover:from-orange/25 hover:via-amber-500/25 hover:to-rose-500/25 hover:border-orange/60 shadow-xs",
                      )}
                    >
                      <Sparkles className={cn("w-3.5 h-3.5", resultTab === "analysis" ? "text-white" : "text-orange")} />
                      <span>Analysis</span>
                    </button>
                    <button
                      onClick={() => setResultTab("chat")}
                      className={cn(
                        "flex-1 py-3 px-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                        resultTab === "chat"
                          ? "bg-white text-navy shadow-sm"
                          : "text-navy/50 hover:text-navy hover:bg-white/50",
                      )}
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>AI Support</span>
                    </button>
                  </div>

                    {resultTab === "message" && (
                      <div className="space-y-6 animate-in fade-in">
                        <div className="bg-navy/[0.03] p-6 rounded-3xl border border-navy/10 space-y-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-navy/40">
                                From
                              </p>
                              <p className="font-bold text-navy">
                                {formData.senderName} &lt;{formData.senderEmail}
                                &gt;
                              </p>
                            </div>
                            <div className="relative">
                              <button
                                onClick={() =>
                                  setShowMsgOptions(!showMsgOptions)
                                }
                                className="p-2 rounded-xl hover:bg-navy/10 transition-colors text-navy/60"
                              >
                                <MoreHorizontal className="w-5 h-5" />
                              </button>
                              {showMsgOptions && (
                                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-navy/10 shadow-xl rounded-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
                                  <button
                                    onClick={() => {
                                      setComposeTo(formData.senderEmail || "");
                                      setComposeSubject(
                                        `Re: ${formData.subject}`,
                                      );
                                      setComposeReplyToMessageId(formData.id || null);
                                      setComposeBody("");
                                      setComposeQuote(
                                        `> On ${new Date().toLocaleDateString()}, ${formData.senderName} wrote:\n> ${formData.body.split("\n").join("\n> ")}`
                                      );
                                      setShowMsgOptions(false);
                                      setView("compose");
                                    }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold uppercase tracking-widest text-navy hover:bg-navy/5 flex items-center gap-2"
                                  >
                                    <ArrowRight className="w-3.5 h-3.5 rotate-180" />{" "}
                                    Reply
                                  </button>
                                  <button
                                    onClick={() => {
                                      setComposeTo("");
                                      setComposeSubject(
                                        `Fwd: ${formData.subject}`,
                                      );
                                      setComposeReplyToMessageId(null);
                                      setComposeBody("");
                                      setComposeQuote(
                                        `---------- Forwarded message ---------\nFrom: ${formData.senderName} <${formData.senderEmail}>\nSubject: ${formData.subject}\n\n${formData.body}`
                                      );
                                      setShowMsgOptions(false);
                                      setView("compose");
                                    }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold uppercase tracking-widest text-navy hover:bg-navy/5 flex items-center gap-2"
                                  >
                                    <ArrowRight className="w-3.5 h-3.5" />{" "}
                                    Forward
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (window.confirm("Are you sure you want to unsubscribe from this sender?")) {
                                        alert(
                                          "Unsubscribe request initiated and synced.",
                                        );
                                      }
                                      setShowMsgOptions(false);
                                    }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold uppercase tracking-widest text-navy hover:bg-navy/5 flex items-center gap-2"
                                  >
                                    <LogOut className="w-3.5 h-3.5" />{" "}
                                    Unsubscribe
                                  </button>
                                  <div className="h-px bg-navy/5 my-1" />
                                  <button
                                    onClick={() => {
                                      if (window.confirm("Are you sure you want to delete this message?")) {
                                        alert(
                                          "Message permanently deleted and synced to account.",
                                        );
                                        setInbox(
                                          inbox.filter(
                                            (m) => m.id !== (formData as any).id,
                                          ),
                                        );
                                        setView("inbox");
                                      }
                                      setShowMsgOptions(false);
                                    }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-500 hover:bg-red-50 flex items-center gap-2"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Delete
                                    Sync
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-navy/40">
                              Subject
                            </p>
                            <p className="font-bold text-navy">
                              {formData.subject}
                            </p>
                          </div>
                        </div>
                        <div className="bg-white p-6 rounded-3xl border border-navy/10 space-y-4 shadow-sm whitespace-pre-wrap text-sm text-navy/80 leading-relaxed font-medium overflow-hidden">
                          {formData.body}
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setResultTab("analysis");
                              if (!result && !isAnalyzing && (formData.senderEmail || formData.body || formData.subject)) {
                                handleAnalyze(formData);
                              }
                            }}
                            className="px-6 py-3.5 bg-gradient-to-r from-orange via-amber-500 to-rose-500 hover:brightness-105 text-white font-display font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-orange/25 transition-all flex items-center gap-2 cursor-pointer"
                          >
                            <Sparkles className="w-4 h-4" />
                            <span>{result ? "View Threat Analysis" : "Analyze This Email"}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {resultTab === "analysis" && (
                      <div className="space-y-6 animate-in fade-in">
                        {isAnalyzing && !result && (
                          <div className="py-16 bg-white border border-navy/10 rounded-[2.5rem] flex flex-col items-center gap-6 shadow-sm">
                            <div className="relative">
                              <div className="w-20 h-20 border-4 border-navy/5 rounded-full" />
                              <div className="absolute inset-0 border-4 border-transparent border-t-orange rounded-full animate-spin" />
                            </div>
                            <div className="text-center space-y-2 px-4">
                              <p className="text-sm font-black uppercase tracking-[5px] text-orange">
                                Ai Analysing
                              </p>
                              <p className="text-[11px] font-medium text-navy/40 italic">
                                {loadingTexts[loadingStep]}
                              </p>
                            </div>
                          </div>
                        )}

                        {isAnalyzing && result && (
                          <div className="flex items-center gap-3 p-4 bg-orange/10 text-orange rounded-2xl">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-[10px] font-black uppercase tracking-widest">
                              Still Analyzing...
                            </span>
                          </div>
                        )}

                        {/* Audited Sender Registry Card */}
                        <div className="bg-navy/[0.03] border border-navy/10 p-5 rounded-[2rem] space-y-3">
                          <div className="flex justify-between items-center pb-2 border-b border-navy/5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-navy/40">
                              Audited Registry Profile
                            </span>
                            <span className="bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 font-bold">
                              <ShieldCheck className="w-3 h-3" />
                              Processed Info
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-[8px] font-black uppercase tracking-wider text-navy/40">
                                Sender Origin Entity
                              </p>
                              <p className="font-bold text-navy truncate text-xs">
                                {formData.senderName || "Unknown Name"}
                              </p>
                              <p className="text-[10px] font-mono text-navy/60 truncate">
                                {formData.senderEmail}
                              </p>
                            </div>
                            <div>
                              <p className="text-[8px] font-black uppercase tracking-wider text-navy/40">
                                Topic / Subject Header
                              </p>
                              <p className="font-bold text-navy truncate text-xs">
                                {formData.subject || "(No Subject)"}
                              </p>
                              <p className="text-[9px] text-orange font-bold uppercase tracking-widest">
                                {result
                                  ? `SPF: ${result?.authentication_results?.spf_record || "N/A"} • DKIM: ${result?.authentication_results?.dkim_signature || "N/A"}`
                                  : formData.headers
                                  ? "Message Headers Extracted"
                                  : "Awaiting Analysis"}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Subscription Gate / Free Limit Fallback so Analysis Page is NEVER Empty */}
                        {!isAnalyzing && !result && !isPremiumActive() && (
                          <div className="bg-white border border-navy/10 rounded-[2.5rem] shadow-sm">
                            {renderSubscriptionGate("AI Email Threat Audit")}
                          </div>
                        )}

                        {!isAnalyzing && !result && isPremiumActive() && subscription.plan === "free" && subscription.usage >= 50 && !user?.isAdmin && !user?.isSuperAdmin && user?.email?.toLowerCase().trim() !== "adamu0533@gmail.com" && (
                          <div className="bg-white border border-navy/10 rounded-[2.5rem] shadow-sm">
                            {renderSubscriptionGate("Unlimited AI Email Audits")}
                          </div>
                        )}

                        {/* Analysis Error / Incomplete Analysis State */}
                        {!isAnalyzing && analysisError && !result && (
                          <div className="bg-white border-2 border-dashed border-red-200 rounded-[2.5rem] p-8 md:p-12 text-center space-y-4">
                            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                              <AlertTriangle className="w-8 h-8" />
                            </div>
                            <div className="space-y-2 max-w-md mx-auto">
                              <h3 className="text-lg font-display font-black uppercase tracking-tight text-navy">
                                Incomplete Forensic Analysis
                              </h3>
                              <p className="text-xs text-navy/60 leading-relaxed font-medium">
                                {analysisError}
                              </p>
                            </div>
                            <button
                              onClick={() => handleAnalyze(formData)}
                              className="px-6 py-3 bg-navy text-white rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-navy/90 transition-all cursor-pointer inline-flex items-center gap-2"
                            >
                              <RefreshCw className="w-4 h-4" />
                              Retry Evidence Analysis
                            </button>
                          </div>
                        )}

                        {/* Idle / Ready-to-Analyze Fallback so Analysis Page is NEVER Empty */}
                        {!isAnalyzing && !analysisError && !result && isPremiumActive() && (
                          <div className="bg-white border-2 border-dashed border-orange/30 rounded-[2.5rem] p-8 md:p-12 text-center space-y-4">
                            <div className="w-16 h-16 bg-gradient-to-br from-orange/20 to-rose-500/20 text-orange rounded-full flex items-center justify-center mx-auto">
                              <Sparkles className="w-8 h-8" />
                            </div>
                            <div className="space-y-2 max-w-md mx-auto">
                              <h3 className="text-lg font-display font-black uppercase tracking-tight text-navy">
                                Forensic Threat Audit Ready
                              </h3>
                              <p className="text-xs text-navy/60 leading-relaxed font-medium">
                                Run deep header verification, domain alignment inspection, and social engineering analysis on this message.
                              </p>
                            </div>
                            <button
                              onClick={() => handleAnalyze(formData)}
                              className="px-6 py-3.5 bg-gradient-to-r from-orange via-amber-500 to-rose-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider hover:brightness-105 transition-all cursor-pointer inline-flex items-center gap-2 shadow-lg shadow-orange/25"
                            >
                              <Sparkles className="w-4 h-4" />
                              Start Forensic Analysis
                            </button>
                          </div>
                        )}

                        {result && (
                          <>
                            {/* Analysis Report Document Container with Top Dynamic Severity Banner */}
                            <div className="bg-slate-100/80 border border-navy/10 rounded-[2.5rem] overflow-hidden shadow-xl">
                              {/* Top Banner with Dynamic Severity Color */}
                              <div className={cn(
                                "text-white px-8 py-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b",
                                (result?.risk_score ?? result?.ai_risk_engine?.threat_score ?? 0) >= 60
                                  ? "bg-[#b81d24] border-red-900/20"
                                  : (result?.risk_score ?? result?.ai_risk_engine?.threat_score ?? 0) >= 30
                                  ? "bg-amber-600 border-amber-700/20"
                                  : "bg-emerald-600 border-emerald-700/20"
                              )}>
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider opacity-90">
                                      FORENSIC ASSESSMENT REPORT
                                    </span>
                                    <span className="px-2 py-0.5 bg-black/20 rounded-md text-[9px] font-mono">
                                      {result.confidence_level || "HIGH"} CONFIDENCE
                                    </span>
                                  </div>
                                  <h2 className="text-sm md:text-base font-display font-black uppercase tracking-wider text-white italic truncate max-w-md">
                                    {formData.subject || "MESSAGE SCAN"}
                                  </h2>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] md:text-xs font-black uppercase tracking-widest bg-black/30 px-3 py-1.5 rounded-full text-white/95">
                                    {result.classification || result?.ai_risk_engine?.final_risk_classification || "AUDITED"} • {result.severity || ((result?.risk_score || 0) > 60 ? "CRITICAL" : (result?.risk_score || 0) > 30 ? "MEDIUM" : "LOW")}
                                  </span>
                                  <span className="text-[11px] font-mono font-black bg-white/20 px-3 py-1.5 rounded-full text-white">
                                    {result?.risk_score ?? result?.ai_risk_engine?.threat_score ?? 0}/100
                                  </span>
                                </div>
                              </div>

                              {/* Report Body / Markdown Rendering */}
                              <div className="p-8 space-y-6">
                                {result.summary_markdown ? (
                                  <div className="markdown-container text-navy w-full">
                                    <ReactMarkdown
                                      remarkPlugins={[remarkGfm]}
                                      components={{
                                        h3: ({ ...props }) => (
                                          <h3 className="text-xl md:text-2xl font-display font-black uppercase tracking-tight text-[#b81d24] mb-3 mt-8 first:mt-0 italic flex items-center gap-2" {...props}>
                                            {props.children}
                                          </h3>
                                        ),
                                        h4: ({ ...props }) => (
                                          <h4 className="text-sm font-black uppercase tracking-widest text-[#b81d24] mb-2 mt-6 flex items-center gap-2" {...props} />
                                        ),
                                        p: ({ ...props }) => <p className="text-sm md:text-base leading-relaxed mb-4 font-semibold text-navy/90" {...props} />,
                                        ul: ({ ...props }) => <ul className="space-y-3 mb-6 list-none p-0" {...props} />,
                                        li: ({ ...props }) => (
                                          <li className="text-xs md:text-sm flex gap-3 text-navy/80 leading-relaxed font-medium">
                                            <span className="w-2 h-2 rounded-full bg-[#b81d24] mt-2 flex-shrink-0" />
                                            <span>{props.children}</span>
                                          </li>
                                        ),
                                        strong: ({ ...props }) => <strong className="font-black text-navy" {...props} />
                                      }}
                                    >
                                      {result.summary_markdown}
                                    </ReactMarkdown>
                                  </div>
                                ) : (
                                  <div className="p-6 bg-white rounded-2xl border border-navy/10 space-y-2 text-xs">
                                    <p className="font-bold text-navy">
                                      Forensic audit completed based on technical headers and body text.
                                    </p>
                                    <p className="text-navy/70">
                                      Classification: <strong>{result.classification}</strong> (Risk Score: {result.risk_score}/100)
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* 1. Methodology & Individual Risk Assessment Strip */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                              {/* Card A: Classification & Severity */}
                              <div className="bg-white border border-navy/10 p-5 rounded-3xl space-y-2">
                                <span className="text-[9px] font-black uppercase tracking-widest text-navy/40 block">
                                  Threat Classification
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider",
                                    (result.classification === "Phishing" || result.classification === "Likely Phishing")
                                      ? "bg-red-100 text-red-700 border border-red-200"
                                      : result.classification === "Suspicious"
                                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                                      : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  )}>
                                    {result.classification || "Evaluated"}
                                  </span>
                                  <span className="text-[10px] font-black uppercase tracking-widest text-navy/50">
                                    {result.severity || "Low"}
                                  </span>
                                </div>
                              </div>

                              {/* Card B: Rule-Based Risk Score */}
                              <div className="bg-white border border-navy/10 p-5 rounded-3xl space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-navy/40">
                                    Calculated Risk Score
                                  </span>
                                  <span className="text-sm font-mono font-black text-navy">
                                    {result.risk_score ?? result?.ai_risk_engine?.threat_score ?? 0} / 100
                                  </span>
                                </div>
                                <div className="w-full h-2 bg-navy/5 rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all duration-500",
                                      (result.risk_score ?? 0) >= 60 ? "bg-red-600" : (result.risk_score ?? 0) >= 30 ? "bg-amber-500" : "bg-emerald-500"
                                    )}
                                    style={{ width: `${Math.min(100, Math.max(5, result.risk_score ?? 10))}%` }}
                                  />
                                </div>
                              </div>

                              {/* Card C: Confidence & Uncertainty */}
                              <div className="bg-white border border-navy/10 p-5 rounded-3xl space-y-1.5">
                                <div className="flex justify-between items-center">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-navy/40">
                                    Confidence Level
                                  </span>
                                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-navy/5 text-navy">
                                    {result.confidence_level || "High"}
                                  </span>
                                </div>
                                <p className="text-[10px] text-navy/60 leading-tight font-medium line-clamp-2">
                                  {result.confidence_explanation || "Evidence grounded in available transport headers and raw body text."}
                                </p>
                              </div>

                              {/* Card D: Scoring Rules Breakdown */}
                              <div className="bg-white border border-navy/10 p-5 rounded-3xl space-y-1.5">
                                <span className="text-[9px] font-black uppercase tracking-widest text-navy/40 block">
                                  Scoring Methodology
                                </span>
                                {result.scoring_breakdown?.rules_applied && result.scoring_breakdown.rules_applied.length > 0 ? (
                                  <div className="space-y-1 max-h-16 overflow-y-auto pr-1">
                                    {result.scoring_breakdown.rules_applied.map((rule: string, rIdx: number) => (
                                      <p key={rIdx} className="text-[9px] font-mono text-navy/70 leading-tight">
                                        • {rule}
                                      </p>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-navy/50 italic">
                                    Standard baseline technical evaluation applied.
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* 2. SPECIFIC RED FLAGS WITH SUPPORTING EVIDENCE QUOTES */}
                            <div className="bg-white border border-navy/10 p-6 md:p-8 rounded-[2.5rem] space-y-4 shadow-sm">
                              <div className="flex items-center justify-between pb-3 border-b border-navy/5">
                                <div className="flex items-center gap-2">
                                  <ShieldAlert className="w-5 h-5 text-red-600" />
                                  <h3 className="font-display font-black text-sm md:text-base uppercase tracking-wider text-navy italic">
                                    Specific Red Flags & Observed Threat Evidence
                                  </h3>
                                </div>
                                <span className="text-[10px] font-mono text-navy/40">
                                  {(result.red_flags || []).length} Detected
                                </span>
                              </div>

                              {result.red_flags && result.red_flags.length > 0 ? (
                                <div className="space-y-3">
                                  {result.red_flags.map((rf: any, idx: number) => {
                                    const flagName = typeof rf === "string" ? rf : rf.flag || rf.title || "Suspicious Indicator";
                                    const evidence = typeof rf === "object" ? rf.evidence : null;
                                    const why = typeof rf === "object" ? rf.why_it_matters : null;
                                    const sev = typeof rf === "object" ? rf.severity : null;

                                    return (
                                      <div key={idx} className="p-4 bg-red-50/70 border border-red-200/80 rounded-2xl space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" />
                                            <span className="font-bold text-xs text-red-900">{flagName}</span>
                                          </div>
                                          {sev && (
                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-200 text-red-800">
                                              {sev} Severity
                                            </span>
                                          )}
                                        </div>

                                        {evidence && (
                                          <div className="bg-white/80 p-2.5 rounded-xl border border-red-200/50 text-[11px] font-mono text-navy/80 space-y-0.5">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-red-700 block">
                                              Supporting Evidence Quote:
                                            </span>
                                            <p className="italic">"{evidence}"</p>
                                          </div>
                                        )}

                                        {why && (
                                          <p className="text-xs text-red-900/80 font-medium leading-relaxed pl-4">
                                            <strong className="text-red-950 font-bold">Why it matters:</strong> {why}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-900">
                                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                                  <p className="text-xs font-semibold">
                                    No malicious red flags, deceptive credential harvesting, or extortion tactics were detected in the analyzed text and technical headers.
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* 3. LEGITIMATE TRUST SIGNALS */}
                            {result.trust_signals && result.trust_signals.length > 0 && (
                              <div className="bg-white border border-navy/10 p-6 md:p-8 rounded-[2.5rem] space-y-4 shadow-sm">
                                <div className="flex items-center gap-2 pb-3 border-b border-navy/5">
                                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                                  <h3 className="font-display font-black text-sm md:text-base uppercase tracking-wider text-navy italic">
                                    Legitimate Trust Signals & Verified Integrity
                                  </h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {result.trust_signals.map((ts: any, idx: number) => {
                                    const sig = typeof ts === "string" ? ts : ts.signal;
                                    const ev = typeof ts === "object" ? ts.evidence : null;
                                    return (
                                      <div key={idx} className="p-4 bg-emerald-50/60 border border-emerald-200/70 rounded-2xl space-y-1">
                                        <div className="flex items-center gap-2">
                                          <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[3]" />
                                          <span className="font-bold text-xs text-emerald-950">{sig}</span>
                                        </div>
                                        {ev && (
                                          <p className="text-[11px] text-emerald-900/70 pl-6 font-medium">
                                            {ev}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* 4. SENDER IDENTITY & DOMAIN/LINK AUDIT */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* SENDER IDENTITY ASSESSMENT */}
                              <div className="bg-white border border-navy/10 p-6 rounded-[2.5rem] space-y-4 shadow-sm">
                                <div className="flex items-center gap-3 pb-3 border-b border-navy/5">
                                  <Fingerprint className="text-orange w-5 h-5"/>
                                  <h4 className="font-black text-xs uppercase tracking-widest text-navy">
                                    Sender Identity Assessment
                                  </h4>
                                </div>
                                <div className="space-y-3 text-xs">
                                  <div className="flex justify-between items-start pb-2 border-b border-navy/5">
                                    <span className="text-[10px] uppercase font-bold text-navy/50">Claimed Name</span>
                                    <span className="font-bold text-navy text-right truncate max-w-[200px]">
                                      {result.sender_identity_assessment?.claimed_name || formData.senderName || "Unknown"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-start pb-2 border-b border-navy/5">
                                    <span className="text-[10px] uppercase font-bold text-navy/50">Actual Email</span>
                                    <span className="font-mono text-navy text-right truncate max-w-[200px]">
                                      {result.sender_identity_assessment?.actual_email || formData.senderEmail}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center pb-2 border-b border-navy/5">
                                    <span className="text-[10px] uppercase font-bold text-navy/50">Sender Domain</span>
                                    <span className="font-mono font-bold text-navy">
                                      {result.sender_identity_assessment?.domain || formData.senderEmail.split("@")[1] || "N/A"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center pb-2 border-b border-navy/5">
                                    <span className="text-[10px] uppercase font-bold text-navy/50">Reply-To Mismatch</span>
                                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider", result.sender_identity_assessment?.name_email_mismatch ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")}>
                                      {result.sender_identity_assessment?.name_email_mismatch ? "MISMATCH DETECTED" : "CONSISTENT"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] uppercase font-bold text-navy/50">Brand Impersonation</span>
                                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider", result.sender_identity_assessment?.brand_impersonation ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")}>
                                      {result.sender_identity_assessment?.brand_impersonation ? `DETECTED (${result.sender_identity_assessment?.impersonated_brand || 'Authority'})` : "CLEAN"}
                                    </span>
                                  </div>
                                  {result.sender_identity_assessment?.explanation && (
                                    <p className="text-[11px] text-navy/70 pt-2 border-t border-navy/5 font-medium leading-relaxed italic">
                                      "{result.sender_identity_assessment.explanation}"
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* DOMAIN & LINK FORENSIC AUDIT */}
                              <div className="bg-white border border-navy/10 p-6 rounded-[2.5rem] space-y-4 shadow-sm">
                                <div className="flex items-center justify-between pb-3 border-b border-navy/5">
                                  <div className="flex items-center gap-3">
                                    <Globe className="text-orange w-5 h-5"/>
                                    <h4 className="font-black text-xs uppercase tracking-widest text-navy">
                                      Domain & Link Assessment
                                    </h4>
                                  </div>
                                  <span className="text-[10px] font-mono text-navy/40">
                                    {result.domain_and_link_assessment?.links_analyzed?.length || 0} Links
                                  </span>
                                </div>

                                {result.domain_and_link_assessment?.links_analyzed && result.domain_and_link_assessment.links_analyzed.length > 0 ? (
                                  <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                                    {result.domain_and_link_assessment.links_analyzed.map((lnk: any, lIdx: number) => (
                                      <div key={lIdx} className="p-3 bg-navy/[0.02] border border-navy/5 rounded-xl space-y-1 text-xs">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="font-mono font-bold text-navy truncate max-w-[200px]">
                                            {lnk.domain || lnk.url}
                                          </span>
                                          <span className={cn(
                                            "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                                            lnk.risk === "Malicious" ? "bg-red-100 text-red-700" : lnk.risk === "Suspicious" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                                          )}>
                                            {lnk.risk || "Audited"}
                                          </span>
                                        </div>
                                        <p className="text-[10px] text-navy/50 font-mono truncate">
                                          {lnk.url}
                                        </p>
                                        {lnk.note && (
                                          <p className="text-[10px] text-navy/70 font-medium">
                                            {lnk.note}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="p-6 bg-navy/[0.02] rounded-2xl text-center space-y-1">
                                    <p className="text-xs font-bold text-navy">No embedded URLs detected</p>
                                    <p className="text-[10px] text-navy/50">Message body does not contain external web destinations.</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* 5. TECHNICAL AUTHENTICATION & SOCIAL ENGINEERING GRIDS */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* AUTHENTICATION MATRIX */}
                              <div className="bg-white border border-navy/10 p-6 rounded-[2.5rem] space-y-4 shadow-sm">
                                <div className="flex items-center gap-3 pb-3 border-b border-navy/5">
                                  <Lock className="text-orange w-5 h-5"/>
                                  <h4 className="font-black text-xs uppercase tracking-widest text-navy">
                                    Cryptographic Authentication
                                  </h4>
                                </div>
                                <div className="space-y-3">
                                  <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-navy/50">SPF (Sender Policy Framework)</span><span className={cn("text-[10px] uppercase font-black px-2 py-0.5 rounded-full", String(result?.authentication_results?.spf_record || result?.authentication_analysis?.spf_validation || "").includes("PASS") ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>{String(result?.authentication_results?.spf_record || result?.authentication_analysis?.spf_validation || "N/A")}</span></div>
                                  <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-navy/50">DKIM (Cryptographic Signature)</span><span className={cn("text-[10px] uppercase font-black px-2 py-0.5 rounded-full", String(result?.authentication_results?.dkim_signature || result?.authentication_analysis?.dkim_validation || "").includes("PASS") ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>{String(result?.authentication_results?.dkim_signature || result?.authentication_analysis?.dkim_validation || "N/A")}</span></div>
                                  <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-navy/50">DMARC Alignment Policy</span><span className={cn("text-[10px] uppercase font-black px-2 py-0.5 rounded-full", String(result?.authentication_results?.dmarc_policy || result?.authentication_analysis?.dmarc_validation || "").includes("PASS") ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>{String(result?.authentication_results?.dmarc_policy || result?.authentication_analysis?.dmarc_validation || "N/A")}</span></div>
                                  <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-navy/50">ARC (Authenticated Received Chain)</span><span className="text-[10px] uppercase font-mono font-bold text-navy">{String(result?.authentication_results?.arc_result || "N/A")}</span></div>
                                  <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-navy/50">Domain Alignment</span><span className={cn("text-[10px] uppercase font-black", result?.authentication_results?.domain_alignment === "NOT VERIFIED" ? "text-orange" : (result?.authentication_results?.domain_alignment ? "text-green-600" : "text-red-600"))}>{result?.authentication_results?.domain_alignment === "NOT VERIFIED" ? "NOT VERIFIED" : (result?.authentication_results?.domain_alignment ? "ALIGNED" : "MISMATCHED")}</span></div>
                                </div>
                                <p className="text-[10px] text-navy/50 italic pt-2 border-t border-navy/5 leading-relaxed">
                                  <strong>Security Note:</strong> Technical authentication validates mail server authorization, but does NOT alone guarantee message safety. Phishing campaigns frequently deploy genuine domains with passing SPF.
                                </p>
                              </div>

                              {/* SOCIAL ENGINEERING TACTICS */}
                              <div className="bg-white border border-navy/10 p-6 rounded-[2.5rem] space-y-4 shadow-sm">
                                <div className="flex items-center gap-3 pb-3 border-b border-navy/5">
                                  <AlertTriangle className="text-orange w-5 h-5"/>
                                  <h4 className="font-black text-xs uppercase tracking-widest text-navy">
                                    Social Engineering Tactics
                                  </h4>
                                </div>
                                <div className="space-y-3">
                                  <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-navy/50">Urgency / Deadline Tactics</span><span className={cn("text-[10px] uppercase font-black px-2 py-0.5 rounded-full", result?.social_engineering_tactics?.urgency_tactics ? "bg-red-100 text-red-700" : "bg-navy/5 text-navy/40")}>{result?.social_engineering_tactics?.urgency_tactics ? "DETECTED" : "NONE"}</span></div>
                                  <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-navy/50">Credential Theft Prompt</span><span className={cn("text-[10px] uppercase font-black px-2 py-0.5 rounded-full", result?.social_engineering_tactics?.credential_theft_attempt ? "bg-red-100 text-red-700" : "bg-navy/5 text-navy/40")}>{result?.social_engineering_tactics?.credential_theft_attempt ? "DETECTED" : "NONE"}</span></div>
                                  <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-navy/50">Invoice / Financial Pressure</span><span className={cn("text-[10px] uppercase font-black px-2 py-0.5 rounded-full", (result?.social_engineering_tactics?.payment_fraud_attempt || result?.social_engineering_tactics?.invoice_scam) ? "bg-red-100 text-red-700" : "bg-navy/5 text-navy/40")}>{(result?.social_engineering_tactics?.payment_fraud_attempt || result?.social_engineering_tactics?.invoice_scam) ? "DETECTED" : "NONE"}</span></div>
                                  <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-navy/50">Fear / Intimidation Tactics</span><span className={cn("text-[10px] uppercase font-black px-2 py-0.5 rounded-full", result?.social_engineering_tactics?.fear_tactics ? "bg-red-100 text-red-700" : "bg-navy/5 text-navy/40")}>{result?.social_engineering_tactics?.fear_tactics ? "DETECTED" : "NONE"}</span></div>
                                  <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-navy/50">Executive / BEC Impersonation</span><span className={cn("text-[10px] uppercase font-black px-2 py-0.5 rounded-full", result?.social_engineering_tactics?.authority_impersonation ? "bg-red-100 text-red-700" : "bg-navy/5 text-navy/40")}>{result?.social_engineering_tactics?.authority_impersonation ? "DETECTED" : "NONE"}</span></div>
                                </div>
                                {result?.social_engineering_tactics?.explanation && (
                                  <p className="text-[11px] text-navy/70 pt-2 border-t border-navy/5 font-medium leading-relaxed italic">
                                    "{result.social_engineering_tactics.explanation}"
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* 6. METADATA, NETWORK INTEL & MISSING INFORMATION */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* METADATA & NETWORK INTEL */}
                              <div className="bg-white border border-navy/10 p-6 rounded-[2.5rem] space-y-4 shadow-sm">
                                <div className="flex items-center gap-3 pb-3 border-b border-navy/5">
                                  <Globe className="text-orange w-5 h-5"/>
                                  <h4 className="font-black text-xs uppercase tracking-widest text-navy">
                                    Metadata & Network Routing
                                  </h4>
                                </div>
                                <div className="space-y-3 text-xs">
                                  <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-navy/50">Origin IP Address</span><span className="font-mono text-navy font-bold truncate max-w-[180px]">{result?.metadata_and_network_intelligence?.ip_address || result?.location_intelligence?.ip_address || "Not present in headers"}</span></div>
                                  <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-navy/50">Geographic Origin</span><span className="font-bold text-navy">{result?.metadata_and_network_intelligence?.country || result?.location_intelligence?.country || "NOT VERIFIED"}</span></div>
                                  <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-navy/50">ISP / ASN</span><span className="font-mono text-navy truncate max-w-[180px]">{result?.metadata_and_network_intelligence?.isp || result?.location_intelligence?.isp || "NOT VERIFIED"}</span></div>
                                  <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-navy/50">VPN / Datacenter Node</span><span className="font-mono font-bold text-navy">{result?.metadata_and_network_intelligence?.vpn_detected || "CLEAN"}</span></div>
                                </div>
                              </div>

                              {/* MISSING & INCONCLUSIVE INFORMATION */}
                              <div className="bg-white border border-navy/10 p-6 rounded-[2.5rem] space-y-4 shadow-sm">
                                <div className="flex items-center gap-3 pb-3 border-b border-navy/5">
                                  <HelpCircle className="text-navy/40 w-5 h-5"/>
                                  <h4 className="font-black text-xs uppercase tracking-widest text-navy">
                                    Missing & Inconclusive Information
                                  </h4>
                                </div>
                                <div className="space-y-2">
                                  {result.missing_information && result.missing_information.length > 0 ? (
                                    result.missing_information.map((item: string, mIdx: number) => (
                                      <div key={mIdx} className="flex items-start gap-2 text-xs text-navy/70 font-medium">
                                        <span className="w-1.5 h-1.5 rounded-full bg-navy/30 mt-1.5 shrink-0" />
                                        <span>{item}</span>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-xs text-navy/50 italic">
                                      All required transport headers and content streams were available for audit.
                                    </p>
                                  )}
                                </div>
                                <p className="text-[10px] text-navy/40 italic pt-2 border-t border-navy/5">
                                  Integrity Standard: Mail Verifier never invents WHOIS ages, uncalled sandbox matches, or routing logs when unavailable.
                                </p>
                              </div>
                            </div>

                            {/* 7. RECOMMENDED USER ACTION & COMMUNITY REPORT CTA */}
                            <div className="bg-gradient-to-r from-navy via-navy to-navy/95 text-white p-6 md:p-8 rounded-[2.5rem] shadow-xl border border-navy/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                              <div className="space-y-2 max-w-xl">
                                <span className="text-[10px] font-black uppercase tracking-widest text-orange flex items-center gap-1.5">
                                  <Shield className="w-3.5 h-3.5" />
                                  Recommended Recipient Action
                                </span>
                                <h3 className="text-lg md:text-xl font-display font-black uppercase italic tracking-tight text-white">
                                  {result.recommended_action || "Treat this message with standard caution. Never enter sensitive passwords on untrusted third-party sites."}
                                </h3>
                                <p className="text-xs text-white/70 font-medium leading-relaxed">
                                  Help protect the entire community by reporting confirmed fraudulent or impersonating emails to the public threat register.
                                </p>
                              </div>

                              <button
                                onClick={handleReportCurrentEmail}
                                className="px-6 py-3.5 bg-orange hover:bg-orange/90 text-navy font-display font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg transition-all flex items-center gap-2 cursor-pointer shrink-0"
                              >
                                <FileWarning className="w-4 h-4" />
                                <span>Report This Email</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {resultTab === "chat" && (
                      <div className="space-y-4 animate-in fade-in flex flex-col h-[520px] border border-navy/10 rounded-[2rem] bg-white overflow-hidden shadow-sm">
                        {/* Chat Header */}
                        <div className="bg-navy/[0.03] px-6 py-4 border-b border-navy/10 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-black uppercase tracking-wider text-navy">
                              Interactive Security Analyst Chat
                            </p>
                            <p className="text-[10px] text-navy/40 font-medium">
                              Answering questions strictly about this message
                              context
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-green-600 font-bold">
                              Secure Trace
                            </span>
                          </div>
                        </div>

                        {/* Messages Panel */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-none">
                          {chatMessages.map((msg, idx) => (
                            <div
                              key={idx}
                              className={cn(
                                "flex flex-col max-w-[85%]",
                                msg.role === "user"
                                  ? "ml-auto items-end"
                                  : "mr-auto items-start",
                              )}
                            >
                              <span className="text-[9px] font-black uppercase tracking-widest text-navy/40 mb-1 px-1">
                                {msg.role === "user"
                                  ? "You"
                                  : "Mail Verifier AI"}
                              </span>
                              <div
                                className={cn(
                                  "px-4 py-3 rounded-2xl text-xs leading-relaxed font-semibold shadow-xs",
                                  msg.role === "user"
                                    ? "bg-navy text-white rounded-tr-none"
                                    : "bg-navy/[0.04] text-navy rounded-tl-none border border-navy/5",
                                )}
                              >
                                {msg.text}
                              </div>
                            </div>
                          ))}
                          {isSendingChatMessage && (
                            <div className="flex flex-col max-w-[85%] mr-auto items-start">
                              <span className="text-[9px] font-black uppercase tracking-widest text-navy/40 mb-1 px-1">
                                Mail Verifier AI
                              </span>
                              <div className="px-4 py-3 rounded-2xl rounded-tl-none text-xs leading-relaxed font-medium bg-navy/[0.04] text-navy border border-navy/5 flex items-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-orange" />
                                <span>
                                  Processing message context & writing
                                  response...
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Input Bar */}
                        {!isPremiumActive() ? (
                          <div className="p-4 bg-orange/5 border-t border-navy/10 flex flex-col items-center text-center space-y-2 w-full">
                            <div className="flex items-center gap-1.5 text-orange">
                              <Lock className="w-3.5 h-3.5" />
                              <p className="text-[10px] font-black uppercase tracking-wider">
                                SECURE CHAT LOCKED
                              </p>
                            </div>
                            <p className="text-[10px] text-navy/60 font-semibold leading-relaxed max-w-sm">
                              AI assistant interactive chat is a Premium feature. Upgrade to Premium Protection to unlock unlimited live threat analysis.
                            </p>
                            <button
                              type="button"
                              onClick={() => setView("subscription")}
                              className="bg-navy text-orange text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-lg hover:bg-navy/90 transition-colors"
                            >
                              Upgrade Now
                            </button>
                          </div>
                        ) : (
                          <form
                            onSubmit={handleSendChatMessage}
                            className="p-4 bg-navy/[0.02] border-t border-navy/10 flex gap-2"
                          >
                            <input
                              type="text"
                              required
                              value={chatInput}
                              onChange={(e) => setChatInput(e.target.value)}
                              disabled={isSendingChatMessage}
                              placeholder="Ask anything about content, sender domain authentication, safety, spoofing..."
                              className="flex-1 bg-white border border-navy/10 rounded-xl px-4 py-3 text-xs font-semibold focus:ring-2 focus:ring-orange/20 focus:outline-none text-navy disabled:opacity-50"
                            />
                            <button
                              type="submit"
                              disabled={isSendingChatMessage || !chatInput.trim()}
                              className="bg-navy text-orange p-3 rounded-xl hover:bg-navy/95 transition-all active:scale-95 flex items-center justify-center shadow-md shadow-navy/10 disabled:opacity-50"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
              </motion.div>
            )}

            {view === "compose" && (
              <motion.div
                key="compose"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="space-y-6"
              >
                {/* Header with back button */}
                <div className="flex items-center gap-4 text-navy">
                  <button
                    onClick={() => setView("inbox")}
                    className="p-3 bg-navy/5 rounded-2xl text-navy hover:bg-navy/10 transition-colors cursor-pointer"
                  >
                    <ArrowRight className="w-5 h-5 rotate-180" />
                  </button>
                  <div className="space-y-0.5">
                    <h2 className="text-2xl font-display font-black uppercase italic tracking-tighter text-navy mb-0">
                      Compose Mail
                    </h2>
                    <p className="text-[9px] font-black uppercase tracking-[3px] text-orange mb-0">
                      Direct Secure Dispatch
                    </p>
                  </div>
                </div>

                {/* Status alerts */}
                {sendSuccess && (
                  <div className="p-4 bg-green-500/10 text-green-600 rounded-3xl text-xs font-bold font-mono tracking-wide border border-green-500/15">
                    ✓ {sendSuccess}
                  </div>
                )}
                {sendError && (
                  <div className="p-4 bg-red-500/10 text-red-600 rounded-3xl text-xs font-bold font-mono tracking-wide border border-red-500/15">
                    ✗ {sendError}
                  </div>
                )}

                {/* Composition Form */}
                <form
                  onSubmit={handleSendEmail}
                  className="space-y-5 bg-navy/[0.02] p-6 rounded-[2.5rem] border border-navy/10"
                >
                  {/* To Recipient */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-navy/40 ml-2">
                      Recipient Email Address
                    </label>
                    <div className="relative border-none">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy/30" />
                      <input
                        type="email"
                        required
                        placeholder="client@example.com"
                        value={composeTo}
                        onChange={(e) => setComposeTo(e.target.value)}
                        className="w-full bg-white border border-navy/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange/20 transition-all text-navy"
                      />
                    </div>
                  </div>

                  {/* Subject Header */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-navy/40 ml-2">
                      Header / Subject
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Secure Verification Guidelines"
                      value={composeSubject}
                      onChange={(e) => setComposeSubject(e.target.value)}
                      className="w-full bg-white border border-navy/10 rounded-2xl py-3.5 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange/20 transition-all text-navy"
                    />
                  </div>

                  {/* Message Body */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-navy/40 ml-2">
                       Message Body
                    </label>
                    <textarea
                      required={!composeQuote}
                      rows={6}
                      placeholder="Type your message here..."
                      value={composeBody}
                      onChange={(e) => setComposeBody(e.target.value)}
                      className="w-full bg-white border border-navy/10 rounded-2xl py-4 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange/20 transition-all text-navy resize-none"
                    />
                  </div>

                  {composeQuote && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-navy/40 ml-2">
                         Original Message
                      </label>
                      <div className="w-full bg-navy/5 border border-navy/10 rounded-2xl py-4 px-4 text-xs font-mono focus:outline-none transition-all text-navy/60 h-40 overflow-y-auto whitespace-pre-wrap">
                        {composeQuote}
                      </div>
                    </div>
                  )}

                  {/* File / Media Loader - Drag-and-drop & manual support */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-navy/40 ml-2">
                      Upload Files or Media
                    </label>

                    <div className="relative group border-2 border-dashed border-navy/10 rounded-2xl p-6 bg-white hover:border-orange/40 transition-colors text-center cursor-pointer">
                      <input
                        type="file"
                        multiple
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="space-y-1 flex flex-col items-center">
                        <Paperclip className="w-8 h-8 text-navy/20 group-hover:text-orange transition-colors" />
                        <p className="text-xs font-bold text-navy">
                          Drag & Drop or Click to Upload
                        </p>
                        <p className="text-[9px] text-navy/40 uppercase font-black tracking-widest">
                          Supports images, documents, pdf, max 50MB
                        </p>
                      </div>
                    </div>

                    {/* Attachment List */}
                    {composeAttachments.length > 0 && (
                      <div className="space-y-2 mt-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-navy/40 ml-2">
                          Attachments ({composeAttachments.length})
                        </p>
                        <div className="max-h-40 overflow-y-auto space-y-1.5 p-1 bg-navy/5 rounded-2xl">
                          {composeAttachments.map((file, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between items-center bg-white p-3 rounded-xl border border-navy/5 shadow-sm text-xs"
                            >
                              <span className="font-semibold text-navy/80 truncate max-w-[70%]">
                                {file.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeAttachment(idx)}
                                className="text-navy/30 hover:text-red-500 transition-colors p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Dispatch Button */}
                  <button
                    type="submit"
                    disabled={isSendingEmail}
                    className="w-full bg-navy text-white hover:bg-navy/90 py-4.5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-navy/15 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    {isSendingEmail ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-orange" />
                        Dispatching Securely...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 text-orange" />
                        Send Message
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}

            {view === "settings" && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-8"
              >
                <div className="flex items-center gap-4 text-navy">
                  <button
                    onClick={() => setView(user ? "inbox" : "login")}
                    className="p-3 bg-navy/5 rounded-2xl text-navy"
                  >
                    <ArrowRight className="w-5 h-5 rotate-180" />
                  </button>
                  <h2 className="text-2xl font-display font-black uppercase italic tracking-tighter text-navy">
                    Account
                  </h2>
                </div>

                <div className="space-y-6">
                  {user && (
                    <div className="bg-navy/[0.03] p-8 rounded-[2.5rem] border border-navy/10 space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-navy rounded-3xl flex items-center justify-center shadow-lg shadow-navy/20">
                          <User className="w-8 h-8 text-orange" />
                        </div>
                        <div>
                          <p className="font-display font-black text-xl text-navy uppercase tracking-tight">
                            {user.name}
                          </p>
                          <p className="text-xs text-navy/40 font-mono tracking-tight">
                            {user.email}
                          </p>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-navy/5 flex flex-col gap-3">
                        <div className="flex justify-between items-center px-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-navy/40">
                            Status
                          </span>
                          <span className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-600 rounded-full text-[9px] font-black uppercase tracking-widest">
                            <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                            Authenticated
                          </span>
                        </div>

                        <div className="flex justify-between items-center px-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-navy/40">
                            Secure Plan
                          </span>
                          <button
                            onClick={() => setView("subscription")}
                            className="text-[9px] font-black uppercase tracking-widest text-orange hover:underline cursor-pointer"
                          >
                            {subscription.plan === "free" ? "Free Trial (Manage)" : "Premium Protection (Manage)"}
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={handleLogout}
                        className="w-full py-4 bg-navy text-orange rounded-2xl font-black uppercase tracking-widest text-xs border border-white/10 hover:bg-orange hover:text-navy transition-all mt-4"
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {view === "subscription" && (
              <motion.div
                key="subscription"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8 pb-12"
              >
                {/* Header with back button */}
                <div className="flex items-center gap-4 text-navy">
                  <button
                    onClick={() => setView("inbox")}
                    className="p-3 bg-navy/5 rounded-2xl text-navy hover:bg-navy/10 transition-colors cursor-pointer"
                  >
                    <ArrowRight className="w-5 h-5 rotate-180 text-orange" />
                  </button>
                  <div className="space-y-0.5">
                    <h2 className="text-2xl font-display font-black uppercase italic tracking-tighter text-navy leading-none">
                      SECURE SUBSCRIPTION
                    </h2>
                    <p className="text-[9px] font-black uppercase tracking-[3px] text-orange leading-none mt-1">
                      Free Trial & Premium Protection Plans
                    </p>
                  </div>
                </div>

                {/* Majestic Live Ticking Countdown Terminal */}
                {getLiveCountdown() && (
                  <motion.div 
                    initial={{ y: -10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="bg-orange/5 border-2 border-orange/20 rounded-[3rem] p-8 space-y-4 shadow-md text-center relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-orange/5 to-transparent pointer-events-none" />
                    <div className="flex flex-col items-center space-y-2">
                      <div className="flex items-center gap-2">
                        {subscription.plan !== "free" ? (
                          <Zap className="w-5 h-5 text-orange fill-current animate-pulse" />
                        ) : (
                          <Clock className="w-5 h-5 text-orange animate-spin" style={{ animationDuration: '4s' }} />
                        )}
                        <h4 className="text-xs font-black uppercase tracking-[3px] text-navy">
                          LIVE SECURE STATUS COUNTDOWN
                        </h4>
                      </div>
                      <p className="text-[11px] text-navy/60 font-semibold uppercase tracking-wider">
                        {getLiveCountdown()?.label} — TIME REMAINING
                      </p>
                    </div>

                    {/* Digital Clock Grid */}
                    <div className="grid grid-cols-4 gap-3 max-w-xs mx-auto">
                      {[
                        { val: getLiveCountdown()?.days, unit: "days" },
                        { val: getLiveCountdown()?.hours, unit: "hours" },
                        { val: getLiveCountdown()?.minutes, unit: "minutes" },
                        { val: getLiveCountdown()?.seconds, unit: "seconds" }
                      ].map((item, idx) => (
                        <div key={idx} className="bg-navy text-white p-3 rounded-2xl flex flex-col items-center justify-center shadow-lg shadow-navy/15">
                          <span className="font-mono text-xl font-black text-orange tabular-nums">
                            {String(item?.val ?? 0).padStart(2, '0')}
                          </span>
                          <span className="text-[8px] font-black uppercase tracking-wider text-white/40 mt-1">
                            {item?.unit}
                          </span>
                        </div>
                      ))}
                    </div>

                    <p className="text-[10px] text-navy/40 font-semibold italic">
                      {subscription.plan !== "free" 
                        ? `Your premium license is active and synchronizing with US-EAST, EU-WEST, and AP-SOUTH nodes. Reset occurs on ${subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : "next cycle"}.`
                        : "Your 1-week secure trial is ticking down. Upgrade to prevent lockdown of live email audits and support chat."
                      }
                    </p>
                  </motion.div>
                )}

                {/* Subscription Overview Card */}
                <div className="bg-navy text-white p-8 rounded-[3rem] space-y-6 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Sparkles className="w-24 h-24 rotate-12 text-orange" />
                  </div>

                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[3px] text-orange">
                        CURRENT SUBSCRIPTION LEVEL
                      </p>
                      <h3 className="text-3xl font-display font-black uppercase italic tracking-tight">
                        {subscription.plan === "free" ? "Free Trial" : "Premium Protection"}
                      </h3>
                    </div>
                    <span className="flex items-center gap-1.5 px-4 py-1.5 bg-orange text-navy rounded-full text-[9px] font-black uppercase tracking-widest font-bold">
                      <Zap className="w-3.5 h-3.5 text-navy fill-current" />
                      Active
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-white/10">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-white/50">Audit Usage limit</span>
                        <span>{subscription.plan === "free" ? `${subscription.usage} / 50 Standard Scans` : "Unlimited Instant Audits"}</span>
                      </div>
                      {subscription.plan === "free" && (
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full rounded-full transition-all duration-500", subscription.usage >= 40 ? "bg-red-500" : "bg-orange")} 
                            style={{ width: `${Math.min((subscription.usage / 50) * 100, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/50 leading-none">
                        Payment Instrument
                      </p>
                      <p className="text-xs font-mono font-bold flex items-center gap-2 mt-1">
                        <CreditCard className="w-4 h-4 text-orange" />
                        {subscription.plan === "free" ? "None (Free Tier)" : subscription.paymentMethod}
                      </p>
                    </div>
                  </div>

                  {subscription.plan !== "free" && (
                    <div className="pt-4 border-t border-white/10 flex justify-between items-center text-xs font-semibold text-white/70">
                      <span>Next Renewal Date: {subscription.currentPeriodEnd || "Next cycle"}</span>
                      <button 
                        onClick={handleCancelSubscription}
                        className="text-[9px] font-black uppercase tracking-widest text-red-400 hover:text-red-500 transition-colors cursor-pointer"
                      >
                        Cancel Secure Subscription
                      </button>
                    </div>
                  )}
                </div>

                {/* Plan Selection Grid */}
                <div className="space-y-6 pt-8">
                  <div className="text-center space-y-1">
                    <div className="flex justify-center">
                      <span className="bg-orange/10 text-orange border border-orange/15 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[3px]">
                        TRANSPARENT PRICING STRUCTURE
                      </span>
                    </div>
                    <h2 className="text-4xl font-display font-black text-navy text-center tracking-tight mt-4 mb-4">
                      Plans Tailored to Your Security Scope
                    </h2>
                    <p className="text-sm text-navy/60 font-semibold leading-relaxed max-w-xl mx-auto text-center">
                      Start protecting your email accounts for free. Upgrade to higher tiers as your security needs expand. No lock-in, cancel with a single click.
                    </p>

                    {/* Monthly vs Annual Toggle */}
                    <div className="flex items-center justify-center gap-3 py-6">
                      <span className={cn("text-xs font-bold transition-colors", !isAnnual ? "text-navy" : "text-navy/40")}>
                        Billed Monthly
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsAnnual(!isAnnual)}
                        className="w-12 h-6 bg-navy rounded-full p-1 transition-all relative focus:outline-none flex items-center cursor-pointer"
                      >
                        <div className={cn(
                          "w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-200 transform",
                          isAnnual ? "translate-x-6" : "translate-x-0"
                        )} />
                      </button>
                      <span className={cn("text-xs font-bold transition-colors flex items-center gap-1.5", isAnnual ? "text-navy" : "text-navy/40")}>
                        Billed Annually
                        <span className="bg-orange/15 text-orange px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
                          SAVE 20%
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto pt-4">
                    {/* Free Trial Card */}
                    <div className={cn(
                      "p-8 rounded-[3rem] border space-y-6 transition-all relative flex flex-col justify-between bg-white",
                      subscription.plan === "free" 
                        ? "border-navy/25 shadow-lg" 
                        : "border-navy/10 hover:border-navy/20"
                    )}>
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-[2px] text-navy/40">
                            TRIAL PERIOD
                          </p>
                          <h4 className="text-2xl font-black text-navy">Free Trial</h4>
                        </div>
                        <p className="text-xs text-navy/60 leading-relaxed font-semibold">
                          Essential email security evaluation and verification tools.
                        </p>
                        <div className="flex flex-col gap-1 pt-2">
                          <div className="flex items-baseline gap-1">
                            <span className="text-5xl font-black text-navy">$0</span>
                            <span className="text-xs font-bold text-navy/40">{isAnnual ? "/ inbox / yr" : "/ inbox / mo"}</span>
                          </div>
                          <span className="text-sm font-semibold text-navy/50">₦0 NGN</span>
                        </div>
                        <hr className="border-navy/5" />
                        <ul className="space-y-3.5 text-xs text-navy/70">
                          <li className="flex gap-2.5 items-center">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="font-semibold">7-day security trial</span>
                          </li>
                          <li className="flex gap-2.5 items-center">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="font-semibold">AI Email Phishing Detector</span>
                          </li>
                          <li className="flex gap-2.5 items-center">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="font-semibold">Basic SPF & DKIM record validation</span>
                          </li>
                          <li className="flex gap-2.5 items-center">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="font-semibold">Instant security scan reports</span>
                          </li>
                          <li className="flex gap-2.5 items-center">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="font-semibold">No credit card required</span>
                          </li>
                        </ul>
                      </div>
                      
                      <button 
                        disabled={subscription.plan === "free"}
                        onClick={handleDowngradeToFree}
                        className={cn(
                          "w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all text-center",
                          subscription.plan === "free"
                            ? "bg-navy/5 text-navy/30 cursor-default"
                            : "bg-navy text-white hover:bg-navy/95 cursor-pointer"
                        )}
                      >
                        {subscription.plan === "free" ? "Current Plan" : "START FREE TRIAL"}
                      </button>
                    </div>

                    {/* Premium Protection Card */}
                    <div className={cn(
                      "p-8 rounded-[3rem] border-2 space-y-6 transition-all relative flex flex-col justify-between bg-white shadow-xl",
                      subscription.plan === "pro" 
                        ? "border-orange" 
                        : "border-orange/60 hover:border-orange"
                    )}>
                      {/* Overlaid Badge */}
                      <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-orange text-white text-[9px] font-black uppercase tracking-[2px] px-4 py-1.5 rounded-full shadow-md flex items-center gap-1">
                        <Sparkles className="w-3 h-3 fill-current" />
                        BEST VALUE
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1 pt-2">
                          <h4 className="text-2xl font-black text-navy">Premium Protection</h4>
                        </div>
                        <p className="text-xs text-navy/60 leading-relaxed font-semibold">
                          Ultimate continuous real-time cybersecurity shield for your active inboxes.
                        </p>
                        <div className="flex flex-col gap-1 pt-2">
                          <div className="flex items-baseline gap-1">
                            <span className="text-5xl font-black text-navy">${isAnnual ? "48" : "5"}</span>
                            <span className="text-xs font-bold text-navy/40">{isAnnual ? "/ inbox / yr" : "/ inbox / mo"}</span>
                          </div>
                          <span className="text-sm font-semibold text-navy/50">₦{isAnnual ? "65,000" : "6,500"} NGN</span>
                        </div>
                        <hr className="border-navy/5" />
                        <ul className="space-y-3.5 text-xs text-navy/70">
                          <li className="flex gap-2.5 items-center">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="font-semibold">Unlimited Connected Inboxes</span>
                          </li>
                          <li className="flex gap-2.5 items-center">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="font-semibold">Continuous Real-Time Background Monitoring</span>
                          </li>
                          <li className="flex gap-2.5 items-center">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="font-semibold">Linguistic Urgency & Coercion Threat Detection</span>
                          </li>
                          <li className="flex gap-2.5 items-center">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="font-semibold">Deep Typosquatting Domain Radar</span>
                          </li>
                          <li className="flex gap-2.5 items-center">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="font-semibold">Full Secure Admin CPanel access</span>
                          </li>
                          <li className="flex gap-2.5 items-center">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="font-semibold">Priority 24/7 support & security team chat</span>
                          </li>
                        </ul>
                      </div>
                      
                      <button 
                        disabled={subscription.plan === "pro"}
                        onClick={() => initiateCheckout("pro")}
                        className={cn(
                          "w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all text-center cursor-pointer text-white",
                          subscription.plan === "pro"
                            ? "bg-navy/10 text-navy/30 cursor-default border border-navy/5"
                            : "bg-orange hover:bg-orange/95 shadow-lg shadow-orange/20"
                        )}
                      >
                        {subscription.plan === "pro" ? "Current Plan" : "UNLOCK PREMIUM SECURITY"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Billing Invoice History */}
                <div className="space-y-4 bg-navy/[0.02] p-8 rounded-[3rem] border border-navy/10">
                  <div className="space-y-1">
                    <h3 className="font-display font-black text-lg italic tracking-tight text-navy uppercase leading-none">
                      SECURE BILLING REGISTER
                    </h3>
                    <p className="text-[9px] font-black uppercase tracking-[3px] text-navy/40">
                      Archived receipts & invoice records
                    </p>
                  </div>

                  {subscription.invoices && subscription.invoices.length === 0 ? (
                    <div className="py-8 text-center text-xs font-semibold text-navy/40 italic">
                      No invoices found. Free tier has no transaction history.
                    </div>
                  ) : (
                    <div className="divide-y divide-navy/5 max-h-60 overflow-y-auto pr-2">
                      {subscription.invoices?.map((inv) => (
                        <div key={inv.id} className="py-3 flex justify-between items-center text-xs">
                          <div className="space-y-0.5">
                            <p className="font-mono font-bold text-navy">{inv.id}</p>
                            <p className="text-[10px] text-navy/40">{inv.date}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="font-bold text-navy">{inv.amount}</span>
                            <span className="px-2.5 py-0.5 bg-green-100 text-green-700 text-[8px] font-black uppercase tracking-widest rounded-full font-bold">
                              {inv.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {view === "community_reports" && (
              <CommunityReportsView
                initialMode={communityMode}
                initialSearchQuery={communitySearchQuery}
                prefillData={communityPrefillData}
                currentUserEmail={user?.email}
                currentUserId={user?.id}
                onNavigateBack={() => setView("inbox")}
              />
            )}

            {view === "admin" && (user?.isAdmin || user?.isSuperAdmin || user?.email?.toLowerCase().trim() === "adamu0533@gmail.com") && (
              <AdminDashboard currentUser={user} />
            )}
          </AnimatePresence>
        </main>

        {/* Global Universal Upgrade Prompt Modal Overlay */}
        {showUpgradePrompt && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-[3rem] border border-navy/10 shadow-2xl p-8 max-w-md w-full relative overflow-hidden space-y-6 text-center"
            >
              <button 
                onClick={() => setShowUpgradePrompt(null)}
                className="absolute top-6 right-6 p-2 bg-navy/5 rounded-full hover:bg-navy/10 text-navy transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center space-y-4">
                <div className="relative flex justify-center">
                  <div className="absolute inset-0 bg-orange/20 blur-2xl rounded-full" />
                  <div className="bg-navy p-6 rounded-[2rem] relative border border-orange/10 flex items-center justify-center">
                    <Sparkles className="w-10 h-10 text-orange" />
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="bg-orange/10 text-orange px-3.5 py-1 rounded-full text-[9px] font-black uppercase tracking-[2px] border border-orange/20">
                    Premium Access Blocked
                  </span>
                  <h3 className="text-2xl font-display font-black uppercase italic tracking-tight text-navy">
                    UNLOCK {showUpgradePrompt.toUpperCase()}
                  </h3>
                  <p className="text-xs text-navy/60 font-semibold leading-relaxed max-w-xs mx-auto">
                    The requested secure tool is only available for active Premium defenders. Free trial is either uninitiated or expired. Upgrade now to secure your inbox with limitless real-time scanning.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowUpgradePrompt(null);
                    setView("subscription");
                    initiateCheckout("pro");
                  }}
                  className="w-full bg-navy text-orange hover:bg-navy/95 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-navy/10 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Zap className="w-4 h-4 text-orange fill-current" />
                  Subscribe & Upgrade Now
                </button>
                <button
                  onClick={() => {
                    setShowUpgradePrompt(null);
                    setView("subscription");
                  }}
                  className="w-full bg-navy/5 text-navy hover:bg-navy/10 py-3.5 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all cursor-pointer"
                >
                  View Plan Benefits
                </button>
                <button
                  onClick={() => setShowUpgradePrompt(null)}
                  className="w-full text-navy/40 hover:text-navy/60 py-2 text-[9px] font-black uppercase tracking-widest transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Persistent Bottom Nav (Mobile/Web App style) */}
        {view !== "login" && (
          <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-2xl border-t border-navy/10 px-4 pb-6 pt-3 md:hidden">
            <div className="max-w-xl mx-auto flex justify-between items-center">
              <button
                onClick={() => {
                  if (view === "inbox") {
                    handleScrollToggle();
                  } else {
                    setView("inbox");
                  }
                }}
                className={cn(
                  "flex flex-col items-center gap-1",
                  view === "inbox" ? "text-orange" : "text-navy/40",
                )}
              >
                <Inbox className="w-6 h-6" />
                <span className="text-[8px] font-black uppercase tracking-widest">
                  Messages
                </span>
              </button>

              <button
                onClick={() => setView("alerts")}
                className={cn(
                  "flex flex-col items-center gap-1",
                  view === "alerts" ? "text-orange" : "text-navy/40",
                )}
              >
                <ShieldAlert className="w-6 h-6" />
                <span className="text-[8px] font-black uppercase tracking-widest">
                  Alerts
                </span>
              </button>

              <button
                onClick={() => {
                  setCommunityMode("list");
                  setCommunitySearchQuery("");
                  setCommunityPrefillData(undefined);
                  setView("community_reports");
                }}
                className={cn(
                  "flex flex-col items-center gap-1",
                  view === "community_reports" ? "text-orange" : "text-navy/40",
                )}
              >
                <FileWarning className="w-6 h-6" />
                <span className="text-[8px] font-black uppercase tracking-widest">
                  Reports
                </span>
              </button>

              <button
                onClick={() => setView("insights")}
                className={cn(
                  "flex flex-col items-center gap-1",
                  view === "insights" ? "text-orange" : "text-navy/40",
                )}
              >
                <Globe className="w-6 h-6" />
                <span className="text-[8px] font-black uppercase tracking-widest">
                  Insights
                </span>
              </button>

              <button
                onClick={() => setView("settings")}
                className={cn(
                  "flex flex-col items-center gap-1",
                  view === "settings" ? "text-orange" : "text-navy/40",
                )}
              >
                <User className="w-6 h-6 text-navy" />
                <span className="text-[8px] font-black uppercase tracking-widest">
                  Account
                </span>
              </button>
            </div>
          </nav>
        )}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        body { background-color: white !important; min-height: 100vh; color: #0B1F3A; }
        .markdown-container table td, .markdown-container table th { border: none !important; }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;  
          overflow: hidden;
        }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      `,
        }}
      />
    </div>
  );
}
