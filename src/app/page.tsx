"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect, useRef, useMemo } from "react";
import { 
  Inbox, Sparkles, RefreshCw, LogOut, Send, Search, CheckSquare, 
  MessageSquare, User, AlertCircle, ChevronRight, Mail, Reply, ArrowRight, UserCheck, Star, Trash2,
  BarChart2, Calendar, ShieldCheck, MailOpen, X, Sun, Moon, PanelLeftClose, PanelLeft, Folder, Tag, Users,
  Briefcase, Zap, Link2, Play, Pause, Trash, Plus, Clock
} from "lucide-react";

interface EmailSummary {
  id: string;
  shortSummary: string;
  detailedSummary: string;
  actionItems: string; // JSON string
  category: string;
  importanceScore: number;
  replySuggestions?: string | null;
}

interface Email {
  id: string;
  threadId: string;
  subject: string;
  sender: string;
  receiver: string;
  date: string;
  bodySnippet: string;
  bodyContent: string;
  htmlContent?: string | null;
  unsubscribeUrl?: string | null;
  labels: string;
  isDuplicate: boolean;
  summary?: EmailSummary;
}

const categories = ["All", "Newsletters", "Job / Recruitment", "Finance", "Notifications", "Personal", "Work / Professional"];

const getCategoryClass = (cat: string) => {
  if (!cat) return "";
  return cat.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
};

function renderMessageContent(content: string) {
  if (!content) return null;
  const lines = content.split("\n");
  
  return lines.map((line, idx) => {
    let trimmed = line.trim();
    
    // Check if it's a bullet point (starts with * or -)
    const isBullet = trimmed.startsWith("* ") || trimmed.startsWith("- ");
    if (isBullet) {
      trimmed = trimmed.substring(2);
    }
    
    // Parse bold text **word**
    const parts: any[] = [];
    const regex = /\*\*([^*]+)\*\*/g;
    let match;
    let lastIndex = 0;
    
    while ((match = regex.exec(trimmed)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        parts.push(trimmed.substring(lastIndex, matchIndex));
      }
      parts.push(
        <strong key={matchIndex} style={{ color: "var(--text-primary)", fontWeight: "700" }}>
          {match[1]}
        </strong>
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < trimmed.length) {
      parts.push(trimmed.substring(lastIndex));
    }
    
    const elementContent = parts.length > 0 ? parts : trimmed;
    
    if (isBullet) {
      return (
        <div key={idx} style={{ display: "flex", gap: "0.4rem", marginLeft: "0.5rem", marginBottom: "0.25rem", fontSize: "0.78rem", lineHeight: "1.5" }}>
          <span style={{ color: "var(--accent-sky)", fontWeight: "bold" }}>•</span>
          <span style={{ color: "var(--text-secondary)" }}>{elementContent}</span>
        </div>
      );
    }
    
    // Check if it's a header/date line (ends with colon, starts and ends with **, or is bold only)
    const isHeader = (trimmed.startsWith("**") && trimmed.endsWith("**")) || trimmed.endsWith(":") || trimmed.endsWith(":-");
    
    return (
      <div 
        key={idx} 
        style={{ 
          marginBottom: isHeader ? "0.4rem" : "0.3rem", 
          marginTop: isHeader ? "0.6rem" : "0px",
          fontWeight: isHeader ? "700" : "normal",
          fontSize: isHeader ? "0.82rem" : "0.78rem",
          color: isHeader ? "var(--text-primary)" : "var(--text-secondary)",
          lineHeight: "1.5"
        }}
      >
        {elementContent}
      </div>
    );
  });
}

export default function Home() {
  const { data: session, status } = useSession();
  
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
    const initialTheme = savedTheme || "dark";
    setTheme(initialTheme);
    if (initialTheme === "light") {
      document.documentElement.classList.add("light-theme");
    } else {
      document.documentElement.classList.remove("light-theme");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    if (newTheme === "light") {
      document.documentElement.classList.add("light-theme");
    } else {
      document.documentElement.classList.remove("light-theme");
    }
  };
  
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "starred" | "action">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoadingEmails, setIsLoadingEmails] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string>("");
  
  // Dashboard tab state
  const [activeTab, setActiveTab] = useState<"inbox" | "matrix" | "brief" | "unsubscribe" | "connections">("inbox");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Local interaction states
  const [starredEmails, setStarredEmails] = useState<Record<string, boolean>>({});
  const [archivedEmails, setArchivedEmails] = useState<Record<string, boolean>>({});
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  // Storage Saver Agent states
  const [isCleanModalOpen, setIsCleanModalOpen] = useState<boolean>(false);
  const [cleanStrategy, setCleanStrategy] = useState<string>("both");
  const [isCleaning, setIsCleaning] = useState<boolean>(false);
  const [cleanResult, setCleanResult] = useState<{ trashedCount: number; freedBytesEstimate: number } | null>(null);
  const [selectedSenders, setSelectedSenders] = useState<Record<string, boolean>>({});

  // Tab control in detail pane
  const [detailTab, setDetailTab] = useState<"ai" | "original">("ai");

  // Local storage stats persistence
  const [totalClearedCount, setTotalClearedCount] = useState<number>(0);
  const [totalFreedBytes, setTotalFreedBytes] = useState<number>(0);

  useEffect(() => {
    const savedCount = localStorage.getItem("aether_cleared_count");
    const savedBytes = localStorage.getItem("aether_freed_bytes");
    if (savedCount) setTotalClearedCount(parseInt(savedCount, 10));
    if (savedBytes) setTotalFreedBytes(parseInt(savedBytes, 10));
  }, []);

  const updateCleanupStats = (count: number, bytes: number) => {
    setTotalClearedCount(prev => {
      const newVal = prev + count;
      localStorage.setItem("aether_cleared_count", newVal.toString());
      return newVal;
    });
    setTotalFreedBytes(prev => {
      const newVal = prev + bytes;
      localStorage.setItem("aether_freed_bytes", newVal.toString());
      return newVal;
    });
  };

  // Chat state
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: "Hi! I'm your Personal Assistant. Ask me anything about your synced emails, e.g., 'Summarize my week' or 'Do I have any action items?'" }
  ]);
  const [chatInput, setChatInput] = useState<string>("");
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [chatRemainingQueries, setChatRemainingQueries] = useState<number | null>(null);
  const [lastMsgCached, setLastMsgCached] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Reply Draft State
  const [replyInstruction, setReplyInstruction] = useState<string>("");
  const [draftSubject, setDraftSubject] = useState<string>("");
  const [draftBody, setDraftBody] = useState<string>("");
  const [isDrafting, setIsDrafting] = useState<boolean>(false);
  const [isSendingReply, setIsSendingReply] = useState<boolean>(false);
  const [replyStatus, setReplyStatus] = useState<string>("");
  const [copyToast, setCopyToast] = useState<boolean>(false);
  const [showReplyForNotification, setShowReplyForNotification] = useState<boolean>(false);
  const [isResummarizing, setIsResummarizing] = useState<boolean>(false);
  const [attemptedSummaries, setAttemptedSummaries] = useState<Record<string, boolean>>({});

  // Integrations States
  const [activeIntegrationTab, setActiveIntegrationTab] = useState<"meet" | "jira" | null>(null);
  const [meetTitle, setMeetTitle] = useState<string>("");
  const [meetDateTime, setMeetDateTime] = useState<string>("");
  const [meetDuration, setMeetDuration] = useState<number>(30);
  const [isBookingMeet, setIsBookingMeet] = useState<boolean>(false);
  const [meetResult, setMeetResult] = useState<any>(null);
  const [meetError, setMeetError] = useState<string>("");
  
  const [jiraConnected, setJiraConnected] = useState<boolean>(false);
  const [jiraSandbox, setJiraSandbox] = useState<boolean>(true);
  const [jiraSiteUrl, setJiraSiteUrl] = useState<string>("");

  // Slack Integration States
  const [slackConnected, setSlackConnected] = useState<boolean>(false);
  const [slackSandbox, setSlackSandbox] = useState<boolean>(true);
  const [slackWorkspace, setSlackWorkspace] = useState<string>("");
  const [slackBotName, setSlackBotName] = useState<string>("");
  const [jiraLoadingStatus, setJiraLoadingStatus] = useState<boolean>(false);
  const [jiraProjects, setJiraProjects] = useState<any[]>([]);
  const [jiraIssueTypes, setJiraIssueTypes] = useState<any[]>([]);
  const [selectedJiraProject, setSelectedJiraProject] = useState<string>("");
  const [selectedJiraIssueType, setSelectedJiraIssueType] = useState<string>("");
  const [jiraSummary, setJiraSummary] = useState<string>("");
  const [jiraDescription, setJiraDescription] = useState<string>("");
  const [isCreatingJiraIssue, setIsCreatingJiraIssue] = useState<boolean>(false);
  const [jiraResult, setJiraResult] = useState<any>(null);
  const [jiraError, setJiraError] = useState<string>("");
  
  // Connections tab — Workflow states
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState<boolean>(false);
  const [showNewWorkflow, setShowNewWorkflow] = useState<boolean>(false);
  const [wfName, setWfName] = useState<string>("");
  const [wfDescription, setWfDescription] = useState<string>("");
  const [wfSchedule, setWfSchedule] = useState<string>("0 8 * * *");
  const [wfTimezone, setWfTimezone] = useState<string>("UTC");
  const [wfActionSync, setWfActionSync] = useState<boolean>(true);
  const [wfActionSummarize, setWfActionSummarize] = useState<boolean>(true);
  const [wfActionJira, setWfActionJira] = useState<boolean>(false);
  const [wfJiraProjectId, setWfJiraProjectId] = useState<string>("");
  const [wfSlackChannelId, setWfSlackChannelId] = useState<string>("");
  const [wfSlackChannelName, setWfSlackChannelName] = useState<string>("");
  const [wfActionWebhook, setWfActionWebhook] = useState<boolean>(false);
  const [wfWebhookId, setWfWebhookId] = useState<string>("");
  const [wfWebhookName, setWfWebhookName] = useState<string>("");
  const [isSavingWorkflow, setIsSavingWorkflow] = useState<boolean>(false);
  const [workflowRunStatus, setWorkflowRunStatus] = useState<Record<string, string>>({});
  const [slackChannels, setSlackChannels] = useState<any[]>([]);

  // Webhook Connection States
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState<boolean>(false);
  const [showWebhookForm, setShowWebhookForm] = useState<boolean>(false);
  const [whName, setWhName] = useState<string>("");
  const [whDescription, setWhDescription] = useState<string>("");
  const [whUrl, setWhUrl] = useState<string>("");
  const [whMethod, setWhMethod] = useState<string>("POST");
  const [whEmoji, setWhEmoji] = useState<string>("🔗");
  const [whSecret, setWhSecret] = useState<string>("");
  const [whHeaders, setWhHeaders] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  const [isSavingWebhook, setIsSavingWebhook] = useState<boolean>(false);
  const [webhookTestStatus, setWebhookTestStatus] = useState<Record<string, { status: string; code?: number; msg?: string }>>({});


  // Floating Chat Toggle States
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [showPaTooltip, setShowPaTooltip] = useState<boolean>(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("aether_pa_tooltip_dismissed");
    if (!dismissed) {
      setShowPaTooltip(true);
    }
  }, []);

  const toggleChat = () => {
    setIsChatOpen(prev => {
      const nextVal = !prev;
      if (nextVal) {
        setShowPaTooltip(false);
        localStorage.setItem("aether_pa_tooltip_dismissed", "true");
      }
      return nextVal;
    });
  };

  const dismissTooltip = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPaTooltip(false);
    localStorage.setItem("aether_pa_tooltip_dismissed", "true");
  };

  // Compose window fields (CC / BCC / Forward)
  const [ccField, setCcField] = useState<string>("");
  const [bccField, setBccField] = useState<string>("");
  const [showCc, setShowCc] = useState<boolean>(false);
  const [showBcc, setShowBcc] = useState<boolean>(false);
  const [toField, setToField] = useState<string>("");
  const [composeMode, setComposeMode] = useState<"reply" | "forward">("reply");

  // Prompt suggestions with descriptions
  const suggestions = [
    { title: "Summarize my week", desc: "Compile a high-level briefing of all emails." },
    { title: "List urgent action items", desc: "Find everything expecting your action." },
    { title: "Show important unread mails", desc: "Sort and filter unread items by importance." },
  ];

  // Derive visible (non-archived) emails
  const visibleEmails = emails.filter((email) => !archivedEmails[email.id]);

  // Group visibleEmails by threadId
  const threads = useMemo(() => {
    const threadGroups = visibleEmails.reduce((acc, email) => {
      const threadId = email.threadId || email.id;
      if (!acc[threadId]) {
        acc[threadId] = [];
      }
      acc[threadId].push(email);
      return acc;
    }, {} as Record<string, Email[]>);

    return Object.entries(threadGroups).map(([threadId, threadEmails]) => {
      // Sort thread emails descending by date (latest first)
      const sortedThreadEmails = [...threadEmails].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const latestEmail = sortedThreadEmails[0];
      return {
        threadId,
        emails: sortedThreadEmails,
        latestEmail,
        date: new Date(latestEmail.date),
      };
    }).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [visibleEmails]);

  // Filter threads by statusFilter (All, Unread, Starred, Action Items)
  const filteredThreads = useMemo(() => {
    return threads.filter((thread) => {
      if (statusFilter === "unread") {
        return thread.emails.some((e) => e.labels.toUpperCase().includes("UNREAD"));
      }
      if (statusFilter === "starred") {
        return thread.emails.some((e) => starredEmails[e.id] || e.labels.toUpperCase().includes("STARRED"));
      }
      if (statusFilter === "action") {
        return thread.emails.some((e) => {
          if (!e.summary?.actionItems) return false;
          try {
            const actions = JSON.parse(e.summary.actionItems);
            return Array.isArray(actions) && actions.length > 0;
          } catch {
            return false;
          }
        });
      }
      return true;
    });
  }, [threads, statusFilter, starredEmails]);

  // Compute count of threads for each status filter (within the current categoryFilter context)
  const statusCounts = useMemo(() => {
    let unreadCount = 0;
    let starredCount = 0;
    let actionCount = 0;

    threads.forEach((thread) => {
      if (thread.emails.some((e) => e.labels.toUpperCase().includes("UNREAD"))) {
        unreadCount++;
      }
      if (thread.emails.some((e) => starredEmails[e.id] || e.labels.toUpperCase().includes("STARRED"))) {
        starredCount++;
      }
      if (thread.emails.some((e) => {
        if (!e.summary?.actionItems) return false;
        try {
          const actions = JSON.parse(e.summary.actionItems);
          return Array.isArray(actions) && actions.length > 0;
        } catch {
          return false;
        }
      })) {
        actionCount++;
      }
    });

    return {
      all: threads.length,
      unread: unreadCount,
      starred: starredCount,
      action: actionCount,
    };
  }, [threads, starredEmails]);

  // Expanded emails in accordion view
  const [expandedEmails, setExpandedEmails] = useState<Record<string, boolean>>({});

  // Automatically expand the selected email when selectedEmail changes
  useEffect(() => {
    if (selectedEmail) {
      setExpandedEmails((prev) => ({
        ...prev,
        [selectedEmail.id]: true,
      }));
    }
  }, [selectedEmail]);

  const toggleStar = (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredEmails((prev) => ({ ...prev, [emailId]: !prev[emailId] }));
  };

  const archiveEmail = (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setArchivedEmails((prev) => ({ ...prev, [emailId]: true }));
    if (selectedEmail?.id === emailId) {
      const nextVisible = emails.find((email) => email.id !== emailId && !archivedEmails[email.id]);
      setSelectedEmail(nextVisible || null);
    }
  };

  const archiveThread = (threadEmails: Email[], threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const threadEmailIds = threadEmails.map((e) => e.id);
    setArchivedEmails((prev) => {
      const updated = { ...prev };
      threadEmailIds.forEach((id) => {
        updated[id] = true;
      });
      return updated;
    });

    if (selectedEmail && threadEmailIds.includes(selectedEmail.id)) {
      const nextThread = threads.find((t) => t.threadId !== threadId);
      setSelectedEmail(nextThread ? nextThread.latestEmail : null);
    }
  };

  useEffect(() => {
    if (session) {
      fetchEmails();
    }
  }, [session, categoryFilter]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    setReplyInstruction("");
    setDraftSubject("");
    setDraftBody("");
    setReplyStatus("");
    setShowReplyForNotification(false);

    if (
      selectedEmail && 
      selectedEmail.summary?.shortSummary === "Failed to summarize email." && 
      !attemptedSummaries[selectedEmail.id] &&
      !isResummarizing
    ) {
      const resummarize = async () => {
        setIsResummarizing(true);
        setAttemptedSummaries(prev => ({ ...prev, [selectedEmail.id]: true }));
        try {
          const res = await fetch("/api/emails/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emailId: selectedEmail.id })
          });
          const data = await res.json();
          if (data.success && data.email) {
            setSelectedEmail(data.email);
            setEmails(prev => prev.map(e => e.id === data.email.id ? data.email : e));
          }
        } catch (e) {
          console.error("Failed to re-summarize email on-the-fly:", e);
        } finally {
          setIsResummarizing(false);
        }
      };
      resummarize();
    }
  }, [selectedEmail, attemptedSummaries]);

  const fetchEmails = async (search = searchQuery) => {
    setIsLoadingEmails(true);
    try {
      let url = `/api/emails?`;
      if (categoryFilter !== "All" && activeTab === "inbox") {
        url += `category=${encodeURIComponent(categoryFilter)}&`;
      }
      if (search && activeTab === "inbox") {
        url += `search=${encodeURIComponent(search)}&`;
      }
      // Unsubscribe hub and brief will need to inspect all emails (including duplicates)
      if (activeTab === "unsubscribe") {
        url += `includeDuplicates=true&`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setEmails(data.emails);
        const firstVisible = data.emails.find((e: any) => !archivedEmails[e.id]);
        if (firstVisible && !selectedEmail) {
          setSelectedEmail(firstVisible);
        }
      }
    } catch (error) {
      console.error("Failed to fetch emails:", error);
    } finally {
      setIsLoadingEmails(false);
    }
  };

  // Trigger fetch when tab shifts
  useEffect(() => {
    if (session) {
      fetchEmails();
    }
    setSelectedSenders({});
  }, [activeTab]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEmails(searchQuery);
  };

  const triggerSync = async () => {
    setIsSyncing(true);
    setSyncMessage("Synchronizing mailbox pipeline...");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(`Warp sync complete! Fetched ${data.stats.newEmails} new insights.`);
        fetchEmails();
      } else {
        setSyncMessage(`Sync pipeline error: ${data.error}`);
      }
    } catch (error) {
      setSyncMessage("Failed to establish pipeline connection.");
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(""), 5000);
    }
  };

  const handleSendChat = async (userMsg: string) => {
    if (!userMsg.trim()) return;

    const history = chatMessages.slice(-8); // Send last 4 exchanges as context
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsChatLoading(true);
    setLastMsgCached(false);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMsg, history }),
      });
      const data = await res.json();
      if (data.success) {
        const isCached = !!data.cached;
        const answer = isCached
          ? `${data.answer}\n\n*\u26a1 Instant answer (from cache)*`
          : data.answer;
        setChatMessages((prev) => [...prev, { role: "assistant", content: answer }]);
        setLastMsgCached(isCached);
        if (typeof data.remaining === "number") setChatRemainingQueries(data.remaining);
      } else {
        setChatMessages((prev) => [...prev, { role: "assistant", content: `Error: ${data.error}` }]);
      }
    } catch (error) {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Failed to communicate with the assistant." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Prefill Meeting and Jira ticket details when selectedEmail changes
  useEffect(() => {
    if (selectedEmail) {
      setMeetTitle(`Follow-up: ${selectedEmail.subject.replace(/^(Re:|Fwd:)\s*/gi, "")}`);
      
      // Default datetime: tomorrow at 10:00 AM local time
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      
      // Format as YYYY-MM-DDTHH:MM for datetime-local input
      const pad = (num: number) => String(num).padStart(2, '0');
      const formatted = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;
      setMeetDateTime(formatted);

      // Reset meeting & Jira results
      setMeetResult(null);
      setMeetError("");
      setJiraResult(null);
      setJiraError("");
      setActiveIntegrationTab(null);

      // Prefill Jira
      setJiraSummary(`Email: ${selectedEmail.subject.replace(/^(Re:|Fwd:)\s*/gi, "")}`);
      setJiraDescription(`Issue logged from Repeatless client email thread.\nSender: ${selectedEmail.sender}\nSubject: ${selectedEmail.subject}\nSnippet: ${selectedEmail.bodySnippet}`);
    }
  }, [selectedEmail]);

  // Listen for Jira OAuth connection message from popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data === "jira-connected") {
        setJiraConnected(true);
        fetchJiraProjects();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Fetch Jira connection status
  const fetchJiraStatus = async () => {
    try {
      const res = await fetch("/api/jira/status");
      const data = await res.json();
      if (data) {
        setJiraConnected(data.connected);
        setJiraSandbox(data.sandbox);
        if (data.connected) {
          fetchJiraProjects();
        }
      }
    } catch (err) {
      console.error("Error fetching Jira status:", err);
    }
  };

  // Fetch Jira projects
  const fetchJiraProjects = async () => {
    setJiraLoadingStatus(true);
    setJiraError("");
    try {
      const res = await fetch("/api/jira/projects");
      const data = await res.json();
      if (data && data.success) {
        setJiraProjects(data.projects || []);
        setJiraIssueTypes(data.issueTypes || []);
        setJiraSiteUrl(data.siteUrl || "");
        if (data.projects && data.projects.length > 0) {
          setSelectedJiraProject(data.projects[0].id);
        }
        if (data.issueTypes && data.issueTypes.length > 0) {
          setSelectedJiraIssueType(data.issueTypes[0].id);
        }
      } else {
        setJiraError(data.error || "Failed to load Jira projects");
      }
    } catch (err) {
      setJiraError("Failed to fetch projects");
    } finally {
      setJiraLoadingStatus(false);
    }
  };

  // Trigger check on session load
  useEffect(() => {
    if (session) {
      fetchJiraStatus();
      fetchWorkflows();
      fetchSlackStatus();
      fetchWebhooks();
    }
  }, [session]);

  // ── Workflow Helpers ──────────────────────────────────────────────────
  const fetchWorkflows = async () => {
    setIsLoadingWorkflows(true);
    try {
      const res = await fetch("/api/workflows");
      const data = await res.json();
      if (data.workflows) setWorkflows(data.workflows);
    } catch (e) {
      console.error("Failed to load workflows", e);
    } finally {
      setIsLoadingWorkflows(false);
    }
  };

  const fetchSlackStatus = async () => {
    try {
      const res = await fetch("/api/slack/status");
      const data = await res.json();
      setSlackConnected(data.connected);
      setSlackSandbox(data.sandbox ?? true);
      setSlackWorkspace(data.workspace || "");
      setSlackBotName(data.botName || "");
    } catch (e) {
      console.error("Failed to fetch Slack status", e);
    }
  };

  const fetchSlackChannels = async () => {
    try {
      const res = await fetch("/api/slack/channels");
      const data = await res.json();
      if (data.channels) {
        setSlackChannels(data.channels);
        if (data.channels.length > 0 && !wfSlackChannelId) {
          setWfSlackChannelId(data.channels[0].id);
          setWfSlackChannelName(data.channels[0].name);
        }
      }
    } catch (e) {
      console.error("Failed to load Slack channels", e);
    }
  };

  const handleSlackConnect = () => {
    const popup = window.open("/api/slack/connect", "SlackConnect", "width=520,height=640,scrollbars=yes");
    const handleMsg = (event: MessageEvent) => {
      if (event.data?.type === "slack_connected") {
        setSlackConnected(true);
        setSlackSandbox(event.data.data?.sandbox ?? true);
        setSlackWorkspace(event.data.data?.workspace || "Slack Workspace");
        setSlackBotName(event.data.data?.botName || "Repeatless Bot");
        popup?.close();
        window.removeEventListener("message", handleMsg);
      }
    };
    window.addEventListener("message", handleMsg);
  };

  const handleSlackDisconnect = async () => {
    await fetch("/api/slack/disconnect", { method: "POST" });
    setSlackConnected(false);
    setSlackWorkspace("");
    setSlackBotName("");
    setSlackChannels([]);
    setWfSlackChannelId("");
    setWfSlackChannelName("");
  };

  // ── Webhook Helpers ──────────────────────────────────────────────────
  const fetchWebhooks = async () => {
    setIsLoadingWebhooks(true);
    try {
      const res = await fetch("/api/webhooks");
      const data = await res.json();
      if (data.webhooks) setWebhooks(data.webhooks);
    } catch (e) { console.error("Failed to load webhooks", e); }
    finally { setIsLoadingWebhooks(false); }
  };

  const resetWebhookForm = () => {
    setWhName(""); setWhDescription(""); setWhUrl("");
    setWhMethod("POST"); setWhEmoji("🔗"); setWhSecret("");
    setWhHeaders([{ key: "", value: "" }]);
    setShowWebhookForm(false);
  };

  const handleSaveWebhook = async () => {
    if (!whName.trim() || !whUrl.trim()) return;
    setIsSavingWebhook(true);
    const headersObj: Record<string, string> = {};
    whHeaders.forEach(h => { if (h.key.trim()) headersObj[h.key.trim()] = h.value.trim(); });
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: whName, description: whDescription, url: whUrl,
          method: whMethod, emoji: whEmoji, secret: whSecret,
          headers: JSON.stringify(headersObj),
        }),
      });
      const data = await res.json();
      if (data.webhook) { setWebhooks(prev => [data.webhook, ...prev]); resetWebhookForm(); }
    } catch (e) { console.error("Failed to save webhook", e); }
    finally { setIsSavingWebhook(false); }
  };

  const handleDeleteWebhook = async (id: string) => {
    await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    setWebhooks(prev => prev.filter(w => w.id !== id));
  };

  const handleTestWebhook = async (id: string) => {
    setWebhookTestStatus(prev => ({ ...prev, [id]: { status: "testing" } }));
    try {
      const res = await fetch("/api/webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookId: id }),
      });
      const data = await res.json();
      setWebhookTestStatus(prev => ({ ...prev, [id]: { status: data.success ? "success" : "error", code: data.statusCode, msg: data.message } }));
      // Update last test status in list
      setWebhooks(prev => prev.map(w => w.id === id ? { ...w, lastTestStatus: data.success ? "success" : "error", lastTestCode: data.statusCode, lastTestedAt: new Date().toISOString() } : w));
    } catch (e) {
      setWebhookTestStatus(prev => ({ ...prev, [id]: { status: "error", msg: "Network error" } }));
    }
  };

  const updateWhHeader = (i: number, field: "key" | "value", val: string) => {
    setWhHeaders(prev => {
      const updated = [...prev];
      updated[i] = { ...updated[i], [field]: val };
      if (i === prev.length - 1 && val) updated.push({ key: "", value: "" });
      return updated;
    });
  };

  const resetWorkflowForm = () => {
    setWfName("");
    setWfDescription("");
    setWfSchedule("0 8 * * *");
    setWfTimezone("UTC");
    setWfActionSync(true);
    setWfActionSummarize(true);
    setWfActionJira(false);
    setWfActionWebhook(false);
    setWfSlackChannelId("");
    setWfSlackChannelName("");
    setWfWebhookId("");
    setWfWebhookName("");
    setShowNewWorkflow(false);
  };

  const handleSaveWorkflow = async () => {
    if (!wfName.trim()) return;
    setIsSavingWorkflow(true);
    const actions: any[] = [];
    if (wfActionSync) actions.push({ type: "sync_emails" });
    if (wfActionSummarize) actions.push({ type: "summarize_emails", hoursBack: 24 });
    if (wfActionJira && wfSlackChannelId) actions.push({
      type: "send_to_slack",
      channelId: wfSlackChannelId,
      channelName: wfSlackChannelName,
    });
    if (wfActionWebhook && wfWebhookId) actions.push({
      type: "send_to_webhook",
      webhookId: wfWebhookId,
      webhookName: wfWebhookName,
    });

    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: wfName,
          description: wfDescription,
          schedule: wfSchedule,
          timezone: wfTimezone,
          actions: JSON.stringify(actions),
        }),
      });
      const data = await res.json();
      if (data.workflow) {
        setWorkflows((prev) => [data.workflow, ...prev]);
        resetWorkflowForm();
      }
    } catch (e) {
      console.error("Failed to save workflow", e);
    } finally {
      setIsSavingWorkflow(false);
    }
  };

  const handleToggleWorkflow = async (id: string, enabled: boolean) => {
    try {
      await fetch(`/api/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      setWorkflows((prev) => prev.map((w) => w.id === id ? { ...w, enabled: !enabled } : w));
    } catch (e) {
      console.error("Failed to toggle workflow", e);
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    try {
      await fetch(`/api/workflows/${id}`, { method: "DELETE" });
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
    } catch (e) {
      console.error("Failed to delete workflow", e);
    }
  };

  const handleRunWorkflow = async (id: string) => {
    setWorkflowRunStatus((prev) => ({ ...prev, [id]: "running" }));
    try {
      const res = await fetch("/api/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: id }),
      });
      const data = await res.json();
      setWorkflowRunStatus((prev) => ({ ...prev, [id]: data.success ? "success" : "error" }));
      // Refresh list to get updated lastRunAt etc.
      fetchWorkflows();
    } catch (e) {
      setWorkflowRunStatus((prev) => ({ ...prev, [id]: "error" }));
    }
  };



  // Book a meeting via Google Calendar
  const handleBookMeeting = async () => {
    if (!selectedEmail || !meetDateTime) return;
    setIsBookingMeet(true);
    setMeetError("");
    setMeetResult(null);

    const getEmailAddress = (sender: string) => {
      if (!sender) return "";
      const match = sender.match(/<([^>]+)>/);
      return match ? match[1] : sender;
    };
    const clientEmail = getEmailAddress(selectedEmail.sender);

    try {
      const res = await fetch("/api/calendar/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: meetTitle || `Meeting re: ${selectedEmail.subject}`,
          description: `Scheduled via Repeatless AI Assistant`,
          startTime: meetDateTime,
          duration: Number(meetDuration),
          clientEmail,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMeetResult(data);
        
        // Append Meet details to draftBody
        const formattedDate = new Date(meetDateTime).toLocaleString(undefined, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        const meetText = `\n\n---\n📅 Scheduled Meeting:\nTime: ${formattedDate} (${meetDuration} mins)\nGoogle Meet: ${data.hangoutLink}\nCalendar Event: ${data.htmlLink}\n`;
        setDraftBody((prev) => prev + meetText);
        setReplyStatus("Meeting scheduled! Meet link appended to your draft.");
      } else {
        if (res.status === 403 || data.error === "insufficient_scopes") {
          setMeetError("insufficient_scopes");
        } else {
          setMeetError(data.details || data.error || "Failed to schedule meeting.");
        }
      }
    } catch (error: any) {
      setMeetError("Network error. Failed to schedule meeting.");
    } finally {
      setIsBookingMeet(false);
    }
  };

  // Open Jira OAuth popup
  const handleJiraConnect = () => {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    const popup = window.open(
      "/api/jira/connect",
      "Connect Jira",
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
    );
    
    if (popup) popup.focus();
  };

  // Disconnect Jira integration
  const handleJiraDisconnect = async () => {
    try {
      const res = await fetch("/api/jira/disconnect", { method: "POST" });
      if (res.ok) {
        setJiraConnected(false);
        setJiraProjects([]);
        setJiraIssueTypes([]);
        setJiraResult(null);
        setJiraError("");
      }
    } catch (err) {
      console.error("Failed to disconnect Jira:", err);
    }
  };

  // Create Jira Issue
  const handleCreateJiraIssue = async () => {
    if (!selectedEmail) return;
    setIsCreatingJiraIssue(true);
    setJiraError("");
    setJiraResult(null);

    const project = jiraProjects.find(p => p.id === selectedJiraProject);
    const projectKey = project ? project.key : "MOCK";

    try {
      const res = await fetch("/api/jira/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedJiraProject,
          projectKey,
          issueTypeId: selectedJiraIssueType,
          summary: jiraSummary,
          description: jiraDescription,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setJiraResult(data);
        setReplyStatus(`Jira ticket ${data.key} created!`);
      } else {
        setJiraError(data.details || data.error || "Failed to create Jira ticket.");
      }
    } catch (error) {
      setJiraError("Network error. Failed to create Jira ticket.");
    } finally {
      setIsCreatingJiraIssue(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!selectedEmail || !replyInstruction.trim()) return;
    setIsDrafting(true);
    setDraftSubject("");
    setDraftBody("");
    setReplyStatus("Crafting reply...");
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft",
          threadId: selectedEmail.threadId,
          userInstruction: replyInstruction,
        }),
      });
      const data = await res.json();
      if (data.success && data.draft) {
        setDraftSubject(data.draft.subject);
        setDraftBody(data.draft.body);
        setReplyStatus("");
      } else {
        setReplyStatus(`Draft failed: ${data.error || "unknown error"}`);
      }
    } catch (error) {
      setReplyStatus("Draft pipeline interrupted.");
    } finally {
      setIsDrafting(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedEmail || !draftBody.trim()) return;
    const recipient = composeMode === "forward" ? toField : selectedEmail.sender;
    if (!recipient.trim()) {
      setReplyStatus("Please enter a recipient.");
      return;
    }
    setIsSendingReply(true);
    setReplyStatus("Dispatching response...");
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          // For forward: no threadId (creates new conversation); for reply: keep in thread
          threadId: composeMode === "reply" ? selectedEmail.threadId : null,
          replyText: draftBody,
          recipient,
          subject: draftSubject || selectedEmail.subject,
          cc: ccField.trim() || null,
          bcc: bccField.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyStatus("Message dispatched successfully!");
        setReplyInstruction("");
        setDraftSubject("");
        setDraftBody("");
        setCcField("");
        setBccField("");
        setToField("");
        setComposeMode("reply");
        setShowCc(false);
        setShowBcc(false);
        fetchEmails();
      } else {
        setReplyStatus(`Dispatch failed: ${data.error}`);
      }
    } catch (error) {
      setReplyStatus("Failed to send message.");
    } finally {
      setIsSendingReply(false);
      setTimeout(() => setReplyStatus(""), 4000);
    }
  };

  const handleForward = () => {
    if (!selectedEmail) return;
    const orig = selectedEmail;
    const fwdHeader = `\n\n---------- Forwarded message ----------\nFrom: ${orig.sender}\nDate: ${new Date(orig.date).toLocaleString()}\nSubject: ${orig.subject}\nTo: ${orig.receiver || ""}\n\n`;
    setDraftBody(fwdHeader + orig.bodyContent);
    setDraftSubject(`Fwd: ${orig.subject.replace(/^(Re:|Fwd:)\s*/gi, "")}`);
    setToField("");
    setCcField("");
    setBccField("");
    setComposeMode("forward");
    setShowCc(false);
    setShowBcc(false);
    setReplyInstruction("");
  };

  const discardCompose = () => {
    setDraftSubject("");
    setDraftBody("");
    setCcField("");
    setBccField("");
    setToField("");
    setComposeMode("reply");
    setShowCc(false);
    setShowBcc(false);
    setReplyInstruction("");
    setReplyStatus("");
  };

  const handleCleanInbox = async () => {
    setIsCleaning(true);
    setCleanResult(null);
    try {
      const res = await fetch("/api/clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: cleanStrategy })
      });
      const data = await res.json();
      if (data.success) {
        setCleanResult({
          trashedCount: data.trashedCount,
          freedBytesEstimate: data.freedBytesEstimate
        });
        fetchEmails();
      } else {
        alert(`Storage Saver Agent encountered an error: ${data.error}`);
      }
    } catch (error) {
      alert("Failed to communicate with Storage Saver Agent.");
    } finally {
      setIsCleaning(false);
    }
  };

  // Perform specific sender trashing inside the Unsubscribe Hub
  const handleTrashSender = async (senderEmail: string) => {
    setIsCleaning(true);
    try {
      const res = await fetch("/api/clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: senderEmail })
      });
      const data = await res.json();
      if (data.success) {
        updateCleanupStats(data.trashedCount, data.freedBytesEstimate);
        setSyncMessage(`Successfully cleared ${data.trashedCount} messages from ${senderEmail}`);
        fetchEmails();
      } else {
        setSyncMessage(`Error: ${data.error}`);
      }
    } catch (error) {
      setSyncMessage("Failed to connect to cleanup agent.");
    } finally {
      setIsCleaning(false);
      setTimeout(() => setSyncMessage(""), 5000);
    }
  };

  // Perform bulk sender trashing inside the Unsubscribe Hub
  const handleTrashSelectedSenders = async () => {
    const selectedList = Object.keys(selectedSenders).filter(email => selectedSenders[email]);
    if (selectedList.length === 0) return;

    setIsCleaning(true);
    try {
      const res = await fetch("/api/clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senders: selectedList })
      });
      const data = await res.json();
      if (data.success) {
        updateCleanupStats(data.trashedCount, data.freedBytesEstimate);
        setSyncMessage(`Successfully cleared ${data.trashedCount} messages from ${selectedList.length} senders`);
        setSelectedSenders({});
        fetchEmails();
      } else {
        setSyncMessage(`Error: ${data.error}`);
      }
    } catch (error) {
      setSyncMessage("Failed to connect to cleanup agent.");
    } finally {
      setIsCleaning(false);
      setTimeout(() => setSyncMessage(""), 5000);
    }
  };

  // Perform bulk unsubscribe redirection inside the Unsubscribe Hub
  const handleUnsubscribeSelectedSenders = () => {
    const selectedList = Object.keys(selectedSenders).filter(email => selectedSenders[email]);
    if (selectedList.length === 0) return;

    const urlsToOpen = selectedList
      .map(email => newsletterSenders.find(s => s.email === email)?.unsubscribeUrl)
      .filter((url): url is string => !!url);

    if (urlsToOpen.length === 0) {
      alert("None of the selected senders have unsubscribe URLs available.");
      return;
    }

    urlsToOpen.forEach((url, index) => {
      setTimeout(() => {
        window.open(url, "_blank", "noopener,noreferrer");
      }, index * 200);
    });

    setSyncMessage(`Opening ${urlsToOpen.length} unsubscribe pages in new tabs... Please allow popups if blocked.`);
    setTimeout(() => setSyncMessage(""), 5000);
  };

  // Helper to generate a unique gradient background for user initials (avoids boring gray)
  const getAvatarGradient = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `linear-gradient(135deg, hsl(${h}, 70%, 45%) 0%, hsl(${(h + 40) % 360}, 65%, 35%) 100%)`;
  };

  // 1. Group Senders for the Unsubscribe Hub
  const newsletterSenders = (() => {
    const counts: Record<string, { email: string; name: string; count: number; ids: string[]; isPromo: boolean; unsubscribeUrl: string | null }> = {};
    emails.forEach(email => {
      const isPromo = email.summary?.category === "Promotions" || email.labels.toLowerCase().includes("category_promotion");
      const isDup = email.isDuplicate;
      if (isPromo || isDup) {
        const senderClean = email.sender;
        const emailMatch = senderClean.match(/<([^>]+)>/);
        const senderEmail = emailMatch ? emailMatch[1] : senderClean;
        const senderName = senderClean.replace(/<[^>]+>/, "").trim() || senderEmail;
        
        if (!counts[senderEmail]) {
          counts[senderEmail] = { email: senderEmail, name: senderName, count: 0, ids: [], isPromo, unsubscribeUrl: null };
        }
        counts[senderEmail].count++;
        counts[senderEmail].ids.push(email.id);
        if (email.unsubscribeUrl && !counts[senderEmail].unsubscribeUrl) {
          counts[senderEmail].unsubscribeUrl = email.unsubscribeUrl;
        }
      }
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  })();

  // 2. Classify Emails for the Eisenhower Priority Matrix
  const matrixData = (() => {
    const doFirst: Email[] = [];    // Urgent & Important (Score >= 7)
    const schedule: Email[] = [];   // Important but Less Urgent (Score >= 5 and < 7)
    const delegate: Email[] = [];   // Urgent but Less Important (Score >= 3 and < 5)
    const eliminate: Email[] = [];  // Neither (Score < 3 or Duplicate)

    emails.forEach(email => {
      const score = email.summary?.importanceScore || 0;
      if (email.isDuplicate || score < 3) {
        eliminate.push(email);
      } else if (score >= 7) {
        doFirst.push(email);
      } else if (score >= 5) {
        schedule.push(email);
      } else {
        delegate.push(email);
      }
    });

    return { doFirst, schedule, delegate, eliminate };
  })();

  // 3. Extract All Actions Items across emails
  const allActionItems = (() => {
    const items: { emailId: string; subject: string; task: string }[] = [];
    emails.forEach(email => {
      if (email.summary && email.summary.actionItems) {
        try {
          const actions = JSON.parse(email.summary.actionItems);
          if (Array.isArray(actions)) {
            actions.forEach(act => {
              items.push({ emailId: email.id, subject: email.subject, task: act });
            });
          }
        } catch (e) {}
      }
    });
    return items;
  })();

  // Login screen (Superhuman style)
  if (status === "unauthenticated") {
    return (
      <div className="login-root">
        <style jsx>{`
          /* ── Root layout ── */
          .login-root {
            display: flex;
            height: 100vh;
            width: 100vw;
            overflow: hidden;
            font-family: var(--font-sans);
          }

          /* ── LEFT PANEL ── */
          .login-left {
            flex: 1;
            position: relative;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 4rem;
            overflow: hidden;
            background: linear-gradient(135deg, #0f0c29 0%, #1a1040 40%, #0b57d0 100%);
          }

          /* Animated orbs */
          .orb {
            position: absolute;
            border-radius: 50%;
            filter: blur(60px);
            opacity: 0.45;
            animation: floatOrb 8s ease-in-out infinite;
          }
          .orb-1 {
            width: 360px; height: 360px;
            background: radial-gradient(circle, #6366f1, #8b5cf6);
            top: -80px; left: -80px;
            animation-delay: 0s;
          }
          .orb-2 {
            width: 280px; height: 280px;
            background: radial-gradient(circle, #06b6d4, #3b82f6);
            bottom: 80px; right: -60px;
            animation-delay: -3s;
          }
          .orb-3 {
            width: 200px; height: 200px;
            background: radial-gradient(circle, #ec4899, #f43f5e);
            bottom: -60px; left: 200px;
            animation-delay: -6s;
          }

          @keyframes floatOrb {
            0%, 100% { transform: translateY(0px) scale(1); }
            50% { transform: translateY(-24px) scale(1.06); }
          }

          /* Grid overlay */
          .login-left::before {
            content: '';
            position: absolute;
            inset: 0;
            background-image:
              linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
            background-size: 40px 40px;
            pointer-events: none;
          }

          .left-content {
            position: relative;
            z-index: 2;
            max-width: 520px;
          }

          /* Badge */
          .badge {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            background: rgba(99,102,241,0.2);
            border: 1px solid rgba(99,102,241,0.4);
            border-radius: 9999px;
            padding: 0.35rem 0.85rem;
            font-size: 0.72rem;
            font-weight: 600;
            color: #a5b4fc;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            margin-bottom: 1.5rem;
            animation: fadeSlideDown 0.6s ease both;
          }
          .badge-dot {
            width: 6px; height: 6px;
            border-radius: 50%;
            background: #818cf8;
            animation: pulseDot 2s ease-in-out infinite;
          }
          @keyframes pulseDot {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.4); }
          }

          .left-headline {
            font-family: var(--font-display);
            font-size: 3rem;
            font-weight: 800;
            line-height: 1.1;
            letter-spacing: -0.03em;
            color: #ffffff;
            margin-bottom: 1rem;
            animation: fadeSlideDown 0.7s 0.1s ease both;
          }
          .headline-gradient {
            background: linear-gradient(90deg, #818cf8, #38bdf8, #f472b6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .left-sub {
            font-size: 1rem;
            color: rgba(255,255,255,0.6);
            line-height: 1.65;
            margin-bottom: 2.5rem;
            max-width: 420px;
            animation: fadeSlideDown 0.7s 0.2s ease both;
          }

          /* Feature cards grid */
          .feature-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.85rem;
            margin-bottom: 2.5rem;
          }
          .feature-card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 14px;
            padding: 1rem 1.1rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            transition: all 0.25s ease;
            backdrop-filter: blur(8px);
            animation: fadeSlideUp 0.6s ease both;
          }
          .feature-card:hover {
            background: rgba(255,255,255,0.09);
            border-color: rgba(99,102,241,0.5);
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(99,102,241,0.2);
          }
          .feature-card:nth-child(1) { animation-delay: 0.3s; }
          .feature-card:nth-child(2) { animation-delay: 0.4s; }
          .feature-card:nth-child(3) { animation-delay: 0.5s; }
          .feature-card:nth-child(4) { animation-delay: 0.6s; }

          .fc-icon {
            width: 36px; height: 36px;
            border-radius: 10px;
            display: flex; align-items: center; justify-content: center;
            font-size: 1rem;
            flex-shrink: 0;
          }
          .fc-title {
            font-size: 0.82rem;
            font-weight: 700;
            color: #ffffff;
          }
          .fc-desc {
            font-size: 0.72rem;
            color: rgba(255,255,255,0.5);
            line-height: 1.4;
          }

          /* Stats row */
          .stats-row {
            display: flex;
            gap: 2rem;
            animation: fadeSlideUp 0.6s 0.7s ease both;
          }
          .stat-item { display: flex; flex-direction: column; gap: 0.15rem; }
          .stat-value {
            font-size: 1.5rem;
            font-weight: 800;
            color: #fff;
            font-family: var(--font-display);
          }
          .stat-label {
            font-size: 0.7rem;
            color: rgba(255,255,255,0.45);
            letter-spacing: 0.04em;
          }

          /* ── RIGHT PANEL ── */
          .login-right {
            width: 440px;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #ffffff;
            padding: 3rem 2.5rem;
            position: relative;
          }

          .right-inner {
            width: 100%;
            max-width: 340px;
            display: flex;
            flex-direction: column;
            align-items: center;
            animation: fadeSlideDown 0.7s 0.15s ease both;
          }

          /* Logo mark */
          .logo-mark {
            width: 56px; height: 56px;
            border-radius: 16px;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            display: flex; align-items: center; justify-content: center;
            color: #fff;
            margin-bottom: 1.5rem;
            box-shadow: 0 8px 24px rgba(99,102,241,0.35);
          }

          .right-title {
            font-family: var(--font-display);
            font-size: 1.6rem;
            font-weight: 800;
            color: #0f172a;
            text-align: center;
            letter-spacing: -0.03em;
            margin-bottom: 0.4rem;
          }
          .right-sub {
            font-size: 0.82rem;
            color: #64748b;
            text-align: center;
            line-height: 1.5;
            margin-bottom: 2rem;
          }

          /* Google sign-in button */
          .btn-google {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.7rem;
            width: 100%;
            padding: 0.9rem 1.25rem;
            border-radius: 12px;
            border: 1.5px solid #e2e8f0;
            background: #ffffff;
            color: #0f172a;
            font-weight: 600;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 1px 4px rgba(0,0,0,0.07);
            font-family: var(--font-sans);
            margin-bottom: 1rem;
          }
          .btn-google:hover {
            border-color: #6366f1;
            box-shadow: 0 4px 16px rgba(99,102,241,0.18);
            transform: translateY(-1px);
          }
          .btn-google:active { transform: translateY(0); }

          .google-svg { width: 20px; height: 20px; flex-shrink: 0; }

          /* Divider */
          .divider {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            width: 100%;
            margin: 1rem 0;
          }
          .divider-line { flex: 1; height: 1px; background: #e2e8f0; }
          .divider-text { font-size: 0.72rem; color: #94a3b8; white-space: nowrap; }

          /* Primary CTA */
          .btn-cta {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.65rem;
            width: 100%;
            padding: 0.9rem 1.25rem;
            border-radius: 12px;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: #ffffff;
            font-weight: 700;
            font-size: 0.9rem;
            cursor: pointer;
            border: none;
            transition: all 0.2s ease;
            box-shadow: 0 4px 16px rgba(99,102,241,0.35);
            font-family: var(--font-sans);
          }
          .btn-cta:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 28px rgba(99,102,241,0.45);
          }
          .btn-cta:active { transform: translateY(0); }

          /* Trust badges */
          .trust-row {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-top: 1.75rem;
            flex-wrap: wrap;
            justify-content: center;
          }
          .trust-badge {
            display: flex;
            align-items: center;
            gap: 0.3rem;
            font-size: 0.68rem;
            color: #94a3b8;
            font-weight: 500;
          }
          .trust-dot { color: #d1d5db; font-size: 0.5rem; }

          /* Testimonial */
          .testimonial {
            margin-top: 2.5rem;
            padding: 1.1rem;
            background: #f8fafc;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            width: 100%;
          }
          .test-text {
            font-size: 0.78rem;
            color: #475569;
            line-height: 1.55;
            font-style: italic;
            margin-bottom: 0.65rem;
          }
          .test-author {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          .test-avatar {
            width: 28px; height: 28px;
            border-radius: 50%;
            background: linear-gradient(135deg, #6366f1, #ec4899);
            display: flex; align-items: center; justify-content: center;
            font-size: 0.65rem; color: #fff; font-weight: 700;
          }
          .test-name { font-size: 0.72rem; font-weight: 700; color: #0f172a; }
          .test-role { font-size: 0.67rem; color: #94a3b8; }

          /* Animations */
          @keyframes fadeSlideDown {
            from { opacity: 0; transform: translateY(-14px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(14px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* ── LEFT ── */}
        <div className="login-left">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />

          <div className="left-content">
            <div className="badge">
              <span className="badge-dot" />
              AI-Powered Email Intelligence
            </div>

            <h1 className="left-headline">
              Your inbox,<br />
              <span className="headline-gradient">finally intelligent.</span>
            </h1>

            <p className="left-sub">
              Aether brings absolute clarity to your inbox. It synthesizes messages,
              crafts context-rich replies, and handles clutter — so you can focus on what matters.
            </p>

            <div className="feature-grid">
              <div className="feature-card">
                <div className="fc-icon" style={{ background: "rgba(99,102,241,0.2)" }}>
                  <Sparkles size={18} color="#818cf8" />
                </div>
                <div className="fc-title">AI Summarization</div>
                <div className="fc-desc">Instant summaries for every email thread, no more wall of text.</div>
              </div>
              <div className="feature-card">
                <div className="fc-icon" style={{ background: "rgba(59,130,246,0.2)" }}>
                  <Reply size={18} color="#60a5fa" />
                </div>
                <div className="fc-title">Smart Replies</div>
                <div className="fc-desc">Draft context-aware replies in one click, polished &amp; on-brand.</div>
              </div>
              <div className="feature-card">
                <div className="fc-icon" style={{ background: "rgba(16,185,129,0.2)" }}>
                  <ShieldCheck size={18} color="#34d399" />
                </div>
                <div className="fc-title">Deduplication</div>
                <div className="fc-desc">Automatically detect &amp; collapse duplicate newsletter threads.</div>
              </div>
              <div className="feature-card">
                <div className="fc-icon" style={{ background: "rgba(245,158,11,0.2)" }}>
                  <BarChart2 size={18} color="#fbbf24" />
                </div>
                <div className="fc-title">Priority Scoring</div>
                <div className="fc-desc">AI ranks emails by importance so you tackle the right ones first.</div>
              </div>
            </div>


          </div>
        </div>

        {/* ── RIGHT ── */}
        <div className="login-right">
          <div className="right-inner">
            <div className="logo-mark">
              <Inbox size={26} />
            </div>

            <h2 className="right-title">Welcome to Aether</h2>
            <p className="right-sub">
              Sign in with Google to access your intelligent Gmail workspace.
              Your data stays private — always.
            </p>

            <button className="btn-google" onClick={() => signIn("google")}>
              <svg className="google-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>


            <div className="trust-row">
              <div className="trust-badge">
                <ShieldCheck size={11} color="#6366f1" />
                <span>SOC 2 Ready</span>
              </div>
              <span className="trust-dot">●</span>
              <div className="trust-badge">
                <Star size={11} color="#f59e0b" />
                <span>No email stored</span>
              </div>
              <span className="trust-dot">●</span>
              <div className="trust-badge">
                <UserCheck size={11} color="#10b981" />
                <span>OAuth 2.0</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // Loading Screen
  if (status === "loading") {
    return (
      <div className="loading-screen">
        <style jsx>{`
          .loading-screen {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            width: 100vw;
            background-color: var(--bg-primary);
          }
          .loader {
            border: 2px solid rgba(255, 255, 255, 0.05);
            border-top: 2px solid var(--accent-indigo);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
        `}</style>
        <div className="loader" style={{ width: "28px", height: "28px" }}></div>
      </div>
    );
  }

  return (
    <div className="app-layout slide-in">

      {/* 1. Collapsible Sidebar */}
      <div className={`sidebar-column ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-logo-container">
            <Inbox size={15} />
          </div>
          {!sidebarCollapsed && <span className="brand-text">Aether</span>}
          <button className="sidebar-collapse-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            {sidebarCollapsed ? <PanelLeft size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>

        {/* Mailboxes Navigation */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">{!sidebarCollapsed && "Mailboxes"}</div>
          <div className="sidebar-menu">
            <button 
              className={`sidebar-menu-item ${activeTab === "inbox" && categoryFilter === "All" ? "active" : ""}`} 
              onClick={() => { setActiveTab("inbox"); setCategoryFilter("All"); setStatusFilter("all"); }}
              title="Inbox Reader"
            >
              <Inbox size={14} />
              {!sidebarCollapsed && <span className="menu-text">Inbox Reader</span>}
              {!sidebarCollapsed && <span className="menu-badge">{threads.length}</span>}
            </button>
            <button 
              className={`sidebar-menu-item ${activeTab === "matrix" ? "active" : ""}`} 
              onClick={() => setActiveTab("matrix")}
              title="Priority Matrix"
            >
              <BarChart2 size={14} />
              {!sidebarCollapsed && <span className="menu-text">Priority Matrix</span>}
              {!sidebarCollapsed && <span className="menu-badge badge-important">{matrixData.doFirst.length}</span>}
            </button>
            <button 
              className={`sidebar-menu-item ${activeTab === "brief" ? "active" : ""}`} 
              onClick={() => setActiveTab("brief")}
              title="Executive Brief"
            >
              <Calendar size={14} />
              {!sidebarCollapsed && <span className="menu-text">Executive Brief</span>}
            </button>
            <button 
              className={`sidebar-menu-item ${activeTab === "unsubscribe" ? "active" : ""}`} 
              onClick={() => setActiveTab("unsubscribe")}
              title="Unsubscribe Hub"
            >
              <ShieldCheck size={14} />
              {!sidebarCollapsed && <span className="menu-text">Unsubscribe Hub</span>}
              {!sidebarCollapsed && <span className="menu-badge badge-danger">{newsletterSenders.length}</span>}
            </button>
            <button 
              className={`sidebar-menu-item ${activeTab === "connections" ? "active" : ""}`} 
              onClick={() => setActiveTab("connections")}
              title="Connections & Workflows"
            >
              <Zap size={14} />
              {!sidebarCollapsed && <span className="menu-text">Connections</span>}
              {!sidebarCollapsed && workflows.filter(w => w.enabled).length > 0 && (
                <span className="menu-badge" style={{ background: "rgba(99,102,241,0.2)", color: "var(--accent-purple)" }}>{workflows.filter(w => w.enabled).length}</span>
              )}
            </button>
          </div>
        </div>

        {/* Smart Categories Navigation */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">{!sidebarCollapsed && "Smart Categories"}</div>
          <div className="sidebar-menu">
            {categories.filter(cat => cat !== "All").map(cat => {
              // Calculate counts of non-archived emails
              const count = emails.filter(e => e.summary?.category.toLowerCase() === cat.toLowerCase() && !archivedEmails[e.id]).length;
              
              let icon = <Folder size={14} />;
              if (cat === "Newsletters") icon = <Tag size={14} style={{ color: "var(--status-newsletters-text)" }} />;
              if (cat === "Job / Recruitment") icon = <UserCheck size={14} style={{ color: "var(--status-job-recruitment-text)" }} />;
              if (cat === "Finance") icon = <Folder size={14} style={{ color: "var(--status-finance-text)" }} />;
              if (cat === "Notifications") icon = <AlertCircle size={14} style={{ color: "var(--status-notifications-text)" }} />;
              if (cat === "Personal") icon = <Users size={14} style={{ color: "var(--status-personal-text)" }} />;
              if (cat === "Work / Professional") icon = <Sparkles size={14} style={{ color: "var(--status-work-professional-text)" }} />;

              const isActive = activeTab === "inbox" && categoryFilter === cat;

              return (
                <button 
                  key={cat}
                  className={`sidebar-menu-item ${isActive ? "active" : ""}`} 
                  onClick={() => {
                    setCategoryFilter(cat);
                    setStatusFilter("all");
                    setActiveTab("inbox");
                  }}
                  title={cat}
                >
                  {icon}
                  {!sidebarCollapsed && <span className="menu-text">{cat}</span>}
                  {!sidebarCollapsed && count > 0 && <span className="menu-badge">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          {session?.user && (
            <div className="sidebar-user-widget">
              <div className="sidebar-user-avatar">
                {session.user.image ? (
                  <img src={session.user.image} alt={session.user.name || "User"} />
                ) : (
                  <User size={14} />
                )}
              </div>
              {!sidebarCollapsed && (
                <div className="sidebar-user-info">
                  <span className="sidebar-user-name">{session.user.name || "Logged User"}</span>
                  <span className="sidebar-user-email">{session.user.email || ""}</span>
                </div>
              )}
            </div>
          )}
          
          <div className="sidebar-actions-row">
            <button 
              className="sidebar-btn-theme"
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              {!sidebarCollapsed && <span>{theme === "dark" ? "Light" : "Dark"}</span>}
            </button>
            {!sidebarCollapsed && (
              <button 
                className="sidebar-btn-logout"
                onClick={() => signOut()}
                title="Sign Out"
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Main Content Area */}
      <div className="main-content-area">
        {/* Modern Top Navbar */}
        <div className="top-navbar-modern">
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "1px", fontFamily: "var(--font-display)" }}>
              {activeTab === "inbox" ? `Inbox / ${categoryFilter}` : activeTab === "matrix" ? "Priority Matrix" : activeTab === "brief" ? "Executive Brief" : activeTab === "unsubscribe" ? "Unsubscribe Hub" : "Connections & Workflows"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {/* Storage Cleaner Trigger */}
            <button 
              className="btn-danger"
              style={{ padding: "0.45rem 0.85rem", fontSize: "0.74rem", borderRadius: "100px", fontWeight: 600 }}
              onClick={() => {
                setCleanResult(null);
                setIsCleanModalOpen(true);
              }}
              title="Clean newsletters & promotions straight to your Gmail Trash folder"
            >
              <Trash2 size={12} />
              <span>Clean Inbox</span>
            </button>

            {/* Sync Trigger */}
            <button 
              className="btn-primary"
              style={{ padding: "0.45rem 0.85rem", fontSize: "0.74rem", borderRadius: "100px", fontWeight: 600 }}
              onClick={triggerSync}
              disabled={isSyncing}
            >
              <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
              <span>{isSyncing ? "Syncing..." : "Sync Inbox"}</span>
            </button>
          </div>
        </div>

        {/* Sync notification bar */}
        {syncMessage && (
          <div className="sync-notification-bar" style={{ margin: "0.75rem 0.75rem 0" }}>
            <RefreshCw size={14} className="animate-spin" style={{ color: "var(--accent-indigo)" }} />
            <span>{syncMessage}</span>
          </div>
        )}

        {/* Tab-specific Content */}
        <div className="tab-content-container">
          <div className="workspace-content">
          
          {/* TAB 1: Inbox Reader Split Pane */}
          {activeTab === "inbox" && (
            <div className="inbox-split-pane">
              {/* Left Column: Email list */}
              <div className="emails-column">
                <div className="search-container">
                  <form onSubmit={handleSearchSubmit} className="search-form">
                    <Search size={13} className="search-icon-pos" />
                    <input 
                      type="text" 
                      placeholder="Search mail or AI context..." 
                      className="search-input"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </form>
                </div>

                {/* Compact Status Filters */}
                <div className="status-filter-bar">
                  {([
                    { key: "all",     icon: <Inbox size={12} />, label: "All"     },
                    { key: "unread",  icon: <Mail size={12} />, label: "Unread"  },
                    { key: "starred", icon: <Star size={12} />, label: "Starred" },
                    { key: "action",  icon: <CheckSquare size={12} />, label: "Actions" },
                  ] as { key: "all" | "unread" | "starred" | "action"; icon: React.ReactNode; label: string }[]).map(({ key, icon, label }) => {
                    const isActive = statusFilter === key;
                    const count = statusCounts[key];
                    return (
                      <button
                        key={key}
                        className={`status-filter-btn ${isActive ? "active" : ""}`}
                        onClick={() => setStatusFilter(key)}
                        title={label}
                      >
                        <span className="status-filter-icon">{icon}</span>
                        <span className="status-filter-label">{label}</span>
                        {count > 0 && <span className="status-filter-badge">{count}</span>}
                      </button>
                    );
                  })}
                </div>


                <div className="emails-list">
                  {isLoadingEmails ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
                      <RefreshCw size={18} className="animate-spin" style={{ color: "var(--text-muted)" }} />
                    </div>
                  ) : filteredThreads.length === 0 ? (
                    <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "3rem 1rem", fontSize: "0.82rem" }}>
                      No emails matched the filter.
                    </div>
                  ) : (
                    filteredThreads.map((thread) => {
                      const { threadId, emails: threadEmails, latestEmail } = thread;
                      const isSelected = selectedEmail?.threadId === threadId;
                      const isStarred = threadEmails.some(e => starredEmails[e.id]);
                      const isUnread = latestEmail.labels?.toUpperCase().includes("UNREAD");
                      const displayName = latestEmail.sender.replace(/<[^>]+>/, "").trim().replace(/^["']|["']$/g, "").trim();
                      const threadCount = threadEmails.length;
                      const dateStr = new Date(latestEmail.date).toLocaleDateString([], { month: "short", day: "numeric" });
                      const snippet = latestEmail.summary?.shortSummary || latestEmail.bodySnippet || "";

                      return (
                        <div
                          key={threadId}
                          className={`email-row ${isSelected ? "selected" : ""} ${isUnread ? "unread" : ""}`}
                          onClick={() => setSelectedEmail(latestEmail)}
                        >
                          {/* Unread indicator dot */}
                          <div className="email-row-dot" />

                          {/* Avatar */}
                          <div className="email-row-avatar" style={{ background: getAvatarGradient(latestEmail.sender) }}>
                            {displayName.charAt(0).toUpperCase()}
                          </div>

                          {/* Main content */}
                          <div className="email-row-body">
                            <div className="email-row-top">
                              <span className="email-row-sender">
                                {displayName}
                                {threadCount > 1 && <span className="email-row-count">{threadCount}</span>}
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                                {latestEmail.summary && latestEmail.summary.importanceScore >= 8 && (
                                  <span style={{ fontSize: "0.65rem", color: "#f87171" }}>●</span>
                                )}
                                <span className="email-row-date">{dateStr}</span>
                              </div>
                            </div>
                            <div className="email-row-subject">{latestEmail.subject}</div>
                            <div className="email-row-bottom">
                              <span className="email-row-snippet">{snippet.slice(0, 80)}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexShrink: 0 }}>
                                {latestEmail.summary && (
                                  <span className={`email-row-tag tag-${getCategoryClass(latestEmail.summary.category)}`}>
                                    {latestEmail.summary.category.split(" / ")[0].split(" ")[0]}
                                  </span>
                                )}
                                <button
                                  className={`email-row-star ${isStarred ? "starred" : ""}`}
                                  onClick={(e) => { e.stopPropagation(); setStarredEmails(prev => ({ ...prev, [latestEmail.id]: !prev[latestEmail.id] })); }}
                                >
                                  <Star size={11} fill={isStarred ? "currentColor" : "none"} />
                                </button>
                                <button
                                  className="email-row-archive"
                                  onClick={(e) => archiveThread(threadEmails, threadId, e)}
                                  title="Archive"
                                >
                                  <CheckSquare size={11} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Email Detail View */}
              <div className="detail-column">
                {selectedEmail ? (
                  <>
                    <div className="detail-header-panel">
                      <div className="detail-meta-row">
                        <span className="detail-sender">
                          From: <strong>{selectedEmail.sender}</strong>
                        </span>
                        <span className="detail-date">{new Date(selectedEmail.date).toLocaleString()}</span>
                      </div>
                      <h2 className="detail-subject">{selectedEmail.subject}</h2>
                      {/* Category + Importance inline badges */}
                      {selectedEmail.summary && (
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem", flexWrap: "wrap" }}>
                          <span className={`tag tag-${getCategoryClass(selectedEmail.summary.category)}`} style={{ fontSize: "0.72rem", padding: "0.2rem 0.6rem" }}>
                            {selectedEmail.summary.category}
                          </span>
                          <span style={{
                            fontSize: "0.72rem",
                            padding: "0.2rem 0.55rem",
                            borderRadius: "20px",
                            background: selectedEmail.summary.importanceScore >= 7 ? "rgba(239,68,68,0.12)" : selectedEmail.summary.importanceScore >= 4 ? "rgba(245,158,11,0.12)" : "rgba(99,102,241,0.1)",
                            color: selectedEmail.summary.importanceScore >= 7 ? "#f87171" : selectedEmail.summary.importanceScore >= 4 ? "#f59e0b" : "var(--accent-indigo)",
                            fontWeight: 600,
                          }}>
                            ⭐ {selectedEmail.summary.importanceScore}/10
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="pane-toggle-bar">
                      <button 
                        className={`pane-toggle-btn ${detailTab === "ai" ? "active" : ""}`}
                        onClick={() => setDetailTab("ai")}
                      >
                        <Sparkles size={13} style={{ marginRight: "0.3rem" }} />
                        AI Summary
                      </button>
                      <button 
                        className={`pane-toggle-btn ${detailTab === "original" ? "active" : ""}`}
                        onClick={() => setDetailTab("original")}
                      >
                        <Mail size={13} style={{ marginRight: "0.3rem" }} />
                        Original
                      </button>
                    </div>

                    <div className="detail-body">
                      {detailTab === "ai" ? (
                        <>
                          {/* Summary Card */}
                          <div className="cognitive-card">
                            <div className="section-header">
                              <Sparkles size={13} />
                              <span>Summary</span>
                            </div>
                            {selectedEmail.summary ? (
                              <>
                                <p className="summary-text-styled" style={{ fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.4rem" }}>
                                  {selectedEmail.summary.shortSummary}
                                </p>
                                <p className="summary-text-styled" style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                                  {selectedEmail.summary.detailedSummary}
                                </p>
                              </>
                            ) : (
                              <p className="summary-text-styled" style={{ fontStyle: "italic", color: "var(--text-muted)" }}>
                                No AI summary available for this email.
                              </p>
                            )}
                          </div>

                          {/* Action Items extracted */}
                          {selectedEmail.summary && (
                            <div className="cognitive-card">
                              <div className="section-header">
                                <CheckSquare size={13} />
                                <span>Action Items</span>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                {(() => {
                                  try {
                                    const actions = JSON.parse(selectedEmail.summary.actionItems);
                                    if (!Array.isArray(actions) || actions.length === 0) {
                                      return <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic" }}>No action items identified.</p>;
                                    }
                                    return actions.map((item, idx) => {
                                      const key = `${selectedEmail.id}-${idx}`;
                                      const isChecked = checkedItems[key] || false;
                                      return (
                                        <div key={idx} className="action-item-row" onClick={() => setCheckedItems(prev => ({ ...prev, [key]: !isChecked }))}>
                                          <div className={`action-checkbox-mock ${isChecked ? "checked" : ""}`}>
                                            {isChecked && <ChevronRight size={10} style={{ color: "#ffffff" }} />}
                                          </div>
                                          <span className={`action-text ${isChecked ? "checked" : ""}`}>
                                            {item}
                                          </span>
                                        </div>
                                      );
                                    });
                                  } catch (e) {
                                    return <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic" }}>Failed to parse action checklist.</p>;
                                  }
                                })()}
                              </div>
                            </div>
                          )}

                          {/* Draft replies */}
                          <div className="compose-assistant">
                            {(() => {
                              const emailContextType = (() => {
                                if (!selectedEmail) return { type: "general" as const };
                                
                                const subject = (selectedEmail.subject || "").toLowerCase();
                                const body = (selectedEmail.bodyContent || "").toLowerCase();
                                const summaryObj = selectedEmail.summary;
                                const category = (summaryObj?.category || "").toLowerCase();
                                const sender = (selectedEmail.sender || "").toLowerCase();
                                const isNoReply = sender.includes("noreply") || sender.includes("no-reply") || sender.includes("notification") || sender.includes("alert");
                                
                                // 1. Check for Verification Code / OTP
                                const isOtp = 
                                  subject.includes("verification") || 
                                  subject.includes("otp") || 
                                  subject.includes("one-time") || 
                                  subject.includes("one time") || 
                                  subject.includes("security code") ||
                                  subject.includes("login code") ||
                                  subject.includes("reset password") ||
                                  body.includes("verification code") ||
                                  body.includes("security code") ||
                                  body.includes("login code") ||
                                  body.includes("otp") ||
                                  body.includes("one-time password");

                                if (isOtp) {
                                  const text = `${selectedEmail.subject} \n ${selectedEmail.bodyContent}`;
                                  const codeMatch = text.match(/\b(?!(?:19|20)\d{2}\b)\d{4,8}\b/);
                                  let code = codeMatch ? codeMatch[0] : null;
                                  if (!code) {
                                    const alphaCodeMatch = text.match(/\b[A-Z0-9]{5,8}\b/i);
                                    if (alphaCodeMatch) code = alphaCodeMatch[0];
                                  }
                                  return { type: "otp" as const, code };
                                }

                                // 2. Check for Newsletters
                                if (category === "newsletters" || subject.includes("newsletter") || subject.includes("digest") || sender.includes("newsletter")) {
                                  return { type: "newsletter" as const, unsubscribeUrl: selectedEmail.unsubscribeUrl };
                                }

                                // 3. Check for general Automated/No-reply notifications
                                if (category === "notifications" || isNoReply) {
                                  return { type: "notification" as const };
                                }

                                return { type: "general" as const };
                              })();

                              return (
                                <>
                                  <div className="section-header">
                                    <Reply size={13} />
                                    <span>Draft Reply</span>
                                  </div>

                                  {/* Render Helper Cards based on context */}
                                  {emailContextType.type === "otp" && (
                                    <div className="assistant-context-card" style={{
                                      background: "rgba(245, 158, 11, 0.05)",
                                      border: "1px solid rgba(245, 158, 11, 0.15)",
                                      borderRadius: "8px",
                                      padding: "1rem",
                                      marginTop: "0.75rem",
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "0.75rem"
                                    }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#f59e0b" }}>
                                        <AlertCircle size={15} />
                                        <span style={{ fontWeight: 600, fontSize: "0.82rem", letterSpacing: "0.5px" }}>VERIFICATION CODE DETECTED</span>
                                      </div>
                                      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0, lineHeight: "1.4" }}>
                                        This is a transactional verification email. A reply is not required.
                                      </p>
                                      {emailContextType.code ? (
                                        <div style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          background: "var(--bg-primary)",
                                          padding: "0.75rem 1rem",
                                          borderRadius: "6px",
                                          border: "1px solid var(--border-color)"
                                        }}>
                                          <span style={{ fontFamily: "monospace", fontSize: "1.35rem", fontWeight: "700", letterSpacing: "3px", color: "var(--text-primary)" }}>
                                            {emailContextType.code}
                                          </span>
                                          <button 
                                            className="chip-btn" 
                                            style={{ margin: 0, padding: "0.35rem 0.82rem", background: "var(--accent-indigo)", color: "#ffffff", borderRadius: "4px" }}
                                            onClick={() => {
                                              navigator.clipboard.writeText(emailContextType.code || "");
                                              setCopyToast(true);
                                              setTimeout(() => setCopyToast(false), 2000);
                                            }}
                                          >
                                            {copyToast ? "Copied!" : "Copy Code"}
                                          </button>
                                        </div>
                                      ) : (
                                        <p style={{ fontSize: "0.78rem", fontStyle: "italic", color: "var(--text-muted)", margin: 0 }}>
                                          No code pattern extracted automatically. You can copy it manually from the message view.
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  {emailContextType.type === "newsletter" && (
                                    <div className="assistant-context-card" style={{
                                      background: "rgba(99, 102, 241, 0.05)",
                                      border: "1px solid rgba(99, 102, 241, 0.15)",
                                      borderRadius: "8px",
                                      padding: "1rem",
                                      marginTop: "0.75rem",
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "0.75rem"
                                    }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--accent-indigo)" }}>
                                        <Mail size={15} />
                                        <span style={{ fontWeight: 600, fontSize: "0.82rem", letterSpacing: "0.5px" }}>NEWSLETTER / DIGEST</span>
                                      </div>
                                      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0, lineHeight: "1.4" }}>
                                        This is a newsletter subscription. Replies are typically unmonitored.
                                      </p>
                                      {emailContextType.unsubscribeUrl && (
                                        <div style={{ display: "flex", gap: "0.5rem" }}>
                                          <a 
                                            href={emailContextType.unsubscribeUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="chip-btn" 
                                            style={{ 
                                              margin: 0, 
                                              padding: "0.4rem 0.82rem", 
                                              background: "rgba(239, 68, 68, 0.15)", 
                                              color: "#f87171", 
                                              border: "1px solid rgba(239, 68, 68, 0.25)",
                                              borderRadius: "4px",
                                              textDecoration: "none",
                                              fontSize: "0.76rem",
                                              display: "inline-flex",
                                              alignItems: "center"
                                            }}
                                          >
                                            Unsubscribe from Sender
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {emailContextType.type === "notification" && (
                                    <div className="assistant-context-card" style={{
                                      background: "var(--bg-primary)",
                                      border: "1px solid var(--border-color)",
                                      borderRadius: "8px",
                                      padding: "1rem",
                                      marginTop: "0.75rem",
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "0.75rem"
                                    }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)" }}>
                                        <AlertCircle size={15} />
                                        <span style={{ fontWeight: 600, fontSize: "0.82rem", letterSpacing: "0.5px" }}>AUTOMATED NOTIFICATION</span>
                                      </div>
                                      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0, lineHeight: "1.4" }}>
                                        This is a system-generated alert notification. A reply is not required or may bounce.
                                      </p>
                                    </div>
                                  )}

                                  {/* Hide composer for transactional/no-reply emails unless 'Reply anyway' clicked */}
                                  {emailContextType.type !== "general" && !showReplyForNotification ? (
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", padding: "0.5rem 0.25rem 0 0.25rem", borderTop: "1px solid var(--border-color)" }}>
                                      <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>No reply is expected for this email.</span>
                                      <button 
                                        onClick={() => setShowReplyForNotification(true)}
                                        style={{
                                          background: "none",
                                          border: "none",
                                          color: "var(--accent-indigo)",
                                          fontSize: "0.76rem",
                                          cursor: "pointer",
                                          padding: 0,
                                          textDecoration: "underline",
                                          fontWeight: "600"
                                        }}
                                      >
                                        Write a reply anyway
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="compose-chips" style={{ marginTop: "0.75rem" }}>
                                        {(() => {
                                          let suggestions = ["Acknowledge Receipt", "Request More Details", "Confirm Meeting", "Politely Decline"];
                                          
                                          if (selectedEmail) {
                                            const sender = (selectedEmail.sender || "").toLowerCase();
                                            const subject = (selectedEmail.subject || "").toLowerCase();
                                            const body = (selectedEmail.bodyContent || "").toLowerCase();
                                            const summaryObj = selectedEmail.summary;
                                            const category = (summaryObj?.category || "").toLowerCase();
                                            const isAutomated = sender.includes("noreply") || sender.includes("no-reply") || sender.includes("notification") || sender.includes("alert") || category === "notifications";

                                            if (category === "personal" || (!isAutomated && (subject.includes("hii") || subject.includes("hello") || subject.includes("hey") || subject.includes("thanks") || body.startsWith("hii") || body.startsWith("hello") || body.startsWith("hey")))) {
                                              suggestions = ["Hi! How are you?", "Thanks for reaching out!", "Let's connect soon", "Acknowledge"];
                                            } else if (category === "work / professional") {
                                              suggestions = ["Acknowledge Receipt", "I'll review and get back to you", "Confirm details", "Schedule a call"];
                                            } else if (category === "job / recruitment") {
                                              suggestions = ["Thank you for the update", "Confirm availability", "Request interview details", "Ask for next steps"];
                                            }
                                          }

                                          const summary = selectedEmail?.summary;
                                          if (summary?.replySuggestions) {
                                            try {
                                              const parsed = JSON.parse(summary.replySuggestions);
                                              if (Array.isArray(parsed) && parsed.length > 0) {
                                                suggestions = parsed;
                                              }
                                            } catch (e) {
                                              console.error("Failed to parse replySuggestions:", e);
                                            }
                                          }
                                          return suggestions.map((inst) => (
                                            <button key={inst} className="chip-btn" onClick={() => setReplyInstruction(inst)}>
                                              {inst}
                                            </button>
                                          ));
                                        })()}
                                      </div>

                                      <div className="compose-input-row">
                                        <input 
                                          type="text"
                                          className="compose-text-input"
                                          placeholder="State reply instructions (e.g. 'accept and thank them')"
                                          value={replyInstruction}
                                          onChange={(e) => setReplyInstruction(e.target.value)}
                                        />
                                        <button className="btn-primary" onClick={handleGenerateDraft} disabled={isDrafting || !replyInstruction.trim()} style={{ padding: "0.5rem 1.25rem", fontSize: "0.82rem" }}>
                                          {isDrafting ? "Writing..." : "Compose"}
                                        </button>
                                      </div>

                                      {replyStatus && (
                                        <div style={{ fontSize: "0.74rem", color: "var(--accent-indigo)" }}>{replyStatus}</div>
                                      )}

                                      {draftBody && (
                                        <div className="compose-window">
                                          {/* Header — mode toggle */}
                                          <div className="compose-window-header">
                                            <span className="compose-window-title">
                                              {composeMode === "forward" ? "Forward Message" : "Draft Reply"}
                                            </span>
                                            <div className="compose-mode-toggle">
                                              <button
                                                className={`compose-mode-btn ${composeMode === "reply" ? "active" : ""}`}
                                                onClick={() => { setComposeMode("reply"); setToField(""); }}
                                              >Reply</button>
                                              <button
                                                className={`compose-mode-btn ${composeMode === "forward" ? "active" : ""}`}
                                                onClick={handleForward}
                                              >Forward</button>
                                            </div>
                                          </div>

                                          {/* To field */}
                                          <div className="compose-field-row">
                                            <span className="compose-field-label">To</span>
                                            <input
                                              type="email"
                                              className="compose-field-input"
                                              placeholder={composeMode === "forward" ? "recipient@example.com" : selectedEmail.sender}
                                              value={composeMode === "forward" ? toField : selectedEmail.sender}
                                              onChange={(e) => composeMode === "forward" && setToField(e.target.value)}
                                              readOnly={composeMode === "reply"}
                                            />
                                            <div className="compose-field-actions">
                                              <button
                                                className={`compose-cc-btn ${showCc ? "active" : ""}`}
                                                onClick={() => setShowCc(p => !p)}
                                              >Cc</button>
                                              <button
                                                className={`compose-cc-btn ${showBcc ? "active" : ""}`}
                                                onClick={() => setShowBcc(p => !p)}
                                              >Bcc</button>
                                            </div>
                                          </div>

                                          {/* CC field */}
                                          {showCc && (
                                            <div className="compose-field-row">
                                              <span className="compose-field-label">Cc</span>
                                              <input
                                                type="text"
                                                className="compose-field-input"
                                                placeholder="cc@example.com, another@example.com"
                                                value={ccField}
                                                onChange={(e) => setCcField(e.target.value)}
                                              />
                                            </div>
                                          )}

                                          {/* BCC field */}
                                          {showBcc && (
                                            <div className="compose-field-row">
                                              <span className="compose-field-label">Bcc</span>
                                              <input
                                                type="text"
                                                className="compose-field-input"
                                                placeholder="bcc@example.com"
                                                value={bccField}
                                                onChange={(e) => setBccField(e.target.value)}
                                              />
                                            </div>
                                          )}

                                          {/* Subject field */}
                                          <div className="compose-field-row">
                                            <span className="compose-field-label">Sub</span>
                                            <input
                                              type="text"
                                              className="compose-field-input"
                                              value={draftSubject}
                                              onChange={(e) => setDraftSubject(e.target.value)}
                                            />
                                          </div>

                                          {/* Body */}
                                          <div className="compose-body-area">
                                            <textarea
                                              className="compose-body-textarea"
                                              value={draftBody}
                                              onChange={(e) => setDraftBody(e.target.value)}
                                              rows={8}
                                              placeholder="Write your message..."
                                            />
                                          </div>

                                          {/* Integrations Toolbar Tabs */}
                                          <div className="compose-integrations-tabs">
                                            <div className="compose-integrations-title">
                                              Integrations & Automations
                                            </div>
                                            <div className="compose-integrations-buttons">
                                              <button
                                                type="button"
                                                className={`integration-tab-btn ${activeIntegrationTab === "meet" ? "active" : ""}`}
                                                onClick={() => setActiveIntegrationTab(activeIntegrationTab === "meet" ? null : "meet")}
                                              >
                                                <Calendar size={12} />
                                                <span>Book Google Meet</span>
                                              </button>
                                              <button
                                                type="button"
                                                className={`integration-tab-btn ${activeIntegrationTab === "jira" ? "active" : ""}`}
                                                onClick={() => {
                                                  setActiveIntegrationTab(activeIntegrationTab === "jira" ? null : "jira");
                                                  if (!jiraConnected) {
                                                    fetchJiraStatus();
                                                  }
                                                }}
                                              >
                                                <Briefcase size={12} />
                                                <span>Log Jira Issue</span>
                                              </button>
                                            </div>
                                          </div>

                                          {/* Integrations Content Area */}
                                          {activeIntegrationTab && (
                                            <div className="compose-integration-panel">
                                              {activeIntegrationTab === "meet" && (
                                                <div className="integration-subpanel">
                                                  <div className="panel-header">
                                                    <h4>Schedule Client Meeting & Generate Meet Link</h4>
                                                    <button type="button" className="panel-close-btn" onClick={() => setActiveIntegrationTab(null)}><X size={14} /></button>
                                                  </div>
                                                  
                                                  {meetResult ? (
                                                    <div className="integration-success-card">
                                                      <div className="success-icon">✓</div>
                                                      <div className="success-content">
                                                        <h5>Meeting Scheduled Successfully!</h5>
                                                        <p>Google Meet details have been appended to your email draft.</p>
                                                        <div className="success-links">
                                                          <a href={meetResult.hangoutLink} target="_blank" rel="noopener noreferrer" className="meet-url-badge">
                                                            Join Google Meet
                                                          </a>
                                                          <a href={meetResult.htmlLink} target="_blank" rel="noopener noreferrer" className="calendar-url-link">
                                                            View Calendar Event
                                                          </a>
                                                        </div>
                                                      </div>
                                                    </div>
                                                  ) : (
                                                    <div className="integration-form">
                                                      {meetError === "insufficient_scopes" ? (
                                                        <div className="integration-warning-card">
                                                          <AlertCircle size={18} />
                                                          <div>
                                                            <p>Google Calendar access is required to generate meetings.</p>
                                                            <button 
                                                              type="button"
                                                              className="btn-primary" 
                                                              style={{ marginTop: "0.5rem", padding: "0.35rem 0.75rem", fontSize: "0.74rem" }}
                                                              onClick={() => signIn("google", { callbackUrl: window.location.href, prompt: "consent" })}
                                                            >
                                                              Grant Calendar Permissions
                                                            </button>
                                                          </div>
                                                        </div>
                                                      ) : meetError ? (
                                                        <div className="integration-error-card">
                                                          <AlertCircle size={14} />
                                                          <span>{meetError}</span>
                                                        </div>
                                                      ) : null}

                                                      <div className="form-grid">
                                                        <div className="form-group">
                                                          <label>Meeting Title</label>
                                                          <input 
                                                            type="text" 
                                                            value={meetTitle} 
                                                            onChange={(e) => setMeetTitle(e.target.value)}
                                                            placeholder="e.g. Sync Session"
                                                          />
                                                        </div>
                                                        <div className="form-group-row">
                                                          <div className="form-group">
                                                            <label>Date & Time</label>
                                                            <input 
                                                              type="datetime-local" 
                                                              value={meetDateTime} 
                                                              onChange={(e) => setMeetDateTime(e.target.value)}
                                                            />
                                                          </div>
                                                          <div className="form-group">
                                                            <label>Duration</label>
                                                            <select 
                                                              value={meetDuration} 
                                                              onChange={(e) => setMeetDuration(Number(e.target.value))}
                                                            >
                                                              <option value={15}>15 minutes</option>
                                                              <option value={30}>30 minutes</option>
                                                              <option value={45}>45 minutes</option>
                                                              <option value={60}>1 hour</option>
                                                            </select>
                                                          </div>
                                                        </div>
                                                      </div>
                                                      
                                                      <button 
                                                        type="button"
                                                        className="btn-primary btn-panel-submit" 
                                                        onClick={handleBookMeeting}
                                                        disabled={isBookingMeet || !meetDateTime}
                                                      >
                                                        {isBookingMeet ? "Creating Event..." : "Schedule Meeting & Append Link"}
                                                      </button>
                                                    </div>
                                                  )}
                                                </div>
                                              )}

                                              {activeIntegrationTab === "jira" && (
                                                <div className="integration-subpanel">
                                                  <div className="panel-header">
                                                    <h4>
                                                      Jira Workspace Issue Logger
                                                      {jiraConnected && <span className="site-badge">{jiraSiteUrl} {jiraSandbox && "(Sandbox)"}</span>}
                                                    </h4>
                                                    <button type="button" className="panel-close-btn" onClick={() => setActiveIntegrationTab(null)}><X size={14} /></button>
                                                  </div>

                                                  {!jiraConnected ? (
                                                    <div className="connect-prompt-container">
                                                      <div className="connect-info">
                                                        <p>Connect your Atlassian Jira workspace to log tasks, bugs, or updates directly from your email drafts.</p>
                                                        <span className="sandbox-notice">
                                                          {jiraSandbox 
                                                            ? "⚡ Running in sandbox mode. Authorize with a mock site instantly." 
                                                            : "✓ Production OAuth credentials detected."
                                                          }
                                                        </span>
                                                      </div>
                                                      <button 
                                                        type="button"
                                                        className="btn-primary connect-jira-btn" 
                                                        onClick={handleJiraConnect}
                                                      >
                                                        Connect Atlassian Jira
                                                      </button>
                                                    </div>
                                                  ) : jiraResult ? (
                                                    <div className="integration-success-card">
                                                      <div className="success-icon" style={{ background: "rgba(0,82,204,0.15)", color: "#0052cc" }}>✓</div>
                                                      <div className="success-content">
                                                        <h5>Jira Ticket Logged!</h5>
                                                        <p>Successfully created issue under <strong>{jiraProjects.find(p => p.id === selectedJiraProject)?.name || "selected project"}</strong>.</p>
                                                        <div className="success-links">
                                                          <a href={jiraResult.url} target="_blank" rel="noopener noreferrer" className="meet-url-badge" style={{ background: "#0052cc", borderColor: "#0052cc" }}>
                                                            View Issue ({jiraResult.key})
                                                          </a>
                                                        </div>
                                                      </div>
                                                    </div>
                                                  ) : (
                                                    <div className="integration-form">
                                                      {jiraError && (
                                                        <div className="integration-error-card">
                                                          <AlertCircle size={14} />
                                                          <span>{jiraError}</span>
                                                        </div>
                                                      )}

                                                      {jiraLoadingStatus ? (
                                                        <div className="jira-loading-state">Loading Jira projects...</div>
                                                      ) : (
                                                        <>
                                                          <div className="form-grid">
                                                            <div className="form-group-row">
                                                              <div className="form-group">
                                                                <label>Project</label>
                                                                <select 
                                                                  value={selectedJiraProject} 
                                                                  onChange={(e) => setSelectedJiraProject(e.target.value)}
                                                                >
                                                                  {jiraProjects.map((p) => (
                                                                    <option key={p.id} value={p.id}>[{p.key}] {p.name}</option>
                                                                  ))}
                                                                </select>
                                                              </div>
                                                              <div className="form-group">
                                                                <label>Issue Type</label>
                                                                <select 
                                                                  value={selectedJiraIssueType} 
                                                                  onChange={(e) => setSelectedJiraIssueType(e.target.value)}
                                                                >
                                                                  {jiraIssueTypes.map((t) => (
                                                                    <option key={t.id} value={t.id}>{t.name}</option>
                                                                  ))}
                                                                </select>
                                                              </div>
                                                            </div>
                                                            <div className="form-group">
                                                              <label>Issue Title</label>
                                                              <input 
                                                                type="text" 
                                                                value={jiraSummary} 
                                                                onChange={(e) => setJiraSummary(e.target.value)}
                                                                placeholder="Ticket summary..."
                                                              />
                                                            </div>
                                                            <div className="form-group">
                                                              <label>Description</label>
                                                              <textarea 
                                                                value={jiraDescription} 
                                                                onChange={(e) => setJiraDescription(e.target.value)}
                                                                rows={3}
                                                                placeholder="Ticket details..."
                                                                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "white", padding: "0.4rem 0.6rem", borderRadius: "4px", fontSize: "0.78rem" }}
                                                              />
                                                            </div>
                                                          </div>
                                                          
                                                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
                                                            <button 
                                                              type="button"
                                                              className="btn-secondary" 
                                                              style={{ padding: "0.35rem 0.6rem", fontSize: "0.7rem", color: "var(--google-red)", border: "1px solid rgba(248,113,113,0.2)" }}
                                                              onClick={handleJiraDisconnect}
                                                            >
                                                              Disconnect
                                                            </button>
                                                            <button 
                                                              type="button"
                                                              className="btn-primary btn-panel-submit" 
                                                              onClick={handleCreateJiraIssue}
                                                              disabled={isCreatingJiraIssue || !jiraSummary}
                                                              style={{ background: "#0052cc", borderColor: "#0052cc" }}
                                                            >
                                                              {isCreatingJiraIssue ? "Creating Ticket..." : "Create Issue"}
                                                            </button>
                                                          </div>
                                                        </>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {/* Toolbar */}
                                          <div className="compose-toolbar">
                                            <div className="compose-toolbar-left">
                                              <button className="compose-discard-btn" onClick={discardCompose}>
                                                Discard
                                              </button>
                                            </div>
                                            <button
                                              className="compose-send-btn"
                                              onClick={handleSendReply}
                                              disabled={isSendingReply}
                                            >
                                              <Send size={12} />
                                              <span>{isSendingReply ? "Sending..." : composeMode === "forward" ? "Forward" : "Send Reply"}</span>
                                            </button>
                                          </div>
                                        </div>
                                      )}

                                    </>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </>
                      ) : (
                        <div className="accordion-container">
                          {(() => {
                            const threadEmails = emails.filter(e => e.threadId === selectedEmail.threadId || e.id === selectedEmail.id);
                            if (!threadEmails.some(e => e.id === selectedEmail.id)) {
                              threadEmails.push(selectedEmail);
                            }
                            const uniqueThreadEmails = Array.from(new Map(threadEmails.map(e => [e.id, e])).values());
                            const sortedThreadEmails = [...uniqueThreadEmails].sort(
                              (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
                            );
                            
                            return sortedThreadEmails.map((email) => {
                              const isExpanded = !!expandedEmails[email.id];
                              const displayName = email.sender.replace(/<[^>]+>/, "").trim().replace(/^["']|["']$/g, "").trim();
                              const displayDate = new Date(email.date).toLocaleString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit"
                              });
                              return (
                                <div key={email.id} className={`accordion-item ${isExpanded ? "expanded" : ""}`}>
                                  <div 
                                    className="accordion-header" 
                                    onClick={() => setExpandedEmails(prev => ({ ...prev, [email.id]: !isExpanded }))}
                                  >
                                    <div className="accordion-sender">
                                      <div className="accordion-sender-avatar" style={{ background: getAvatarGradient(email.sender) }}>
                                        {email.sender.charAt(0).toUpperCase()}
                                      </div>
                                      <span className="accordion-sender-name">{displayName}</span>
                                    </div>
                                    
                                    {!isExpanded && (
                                      <span className="accordion-snippet">
                                        {email.subject} - {email.bodySnippet}
                                      </span>
                                    )}
                                    
                                    <div style={{ display: "flex", alignItems: "center" }}>
                                      <span className="accordion-date">{displayDate}</span>
                                      <ChevronRight 
                                        size={12} 
                                        className={`accordion-chevron ${isExpanded ? "rotated" : ""}`} 
                                      />
                                    </div>
                                  </div>
                                  
                                  {isExpanded && (
                                    <div className="accordion-body">
                                      {email.htmlContent ? (
                                        <iframe
                                          srcDoc={email.htmlContent}
                                          title={`Email Content - ${email.id}`}
                                          sandbox="allow-popups allow-popups-to-escape-sandbox"
                                          className="accordion-body-iframe"
                                        />
                                      ) : (
                                        <div className="accordion-body-text">
                                          {email.bodyContent}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", flex: 1, height: "100%", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                    Select an email card to open cognitive context panels.
                  </div>
                )}
              </div>
            </div>
          )}


          {/* TAB 2: Eisenhower Priority Matrix */}
          {activeTab === "matrix" && (
            <div className="priority-grid">
              
              {/* Q1: Do First */}
              <div className="matrix-quadrant do-first">
                <div className="quadrant-header">
                  <span className="quadrant-title" style={{ color: "var(--google-red)" }}>
                    <AlertCircle size={15} />
                    Do First
                  </span>
                  <span className="quadrant-subtitle">Urgent & Important ({matrixData.doFirst.length})</span>
                </div>
                <div className="quadrant-list">
                  {matrixData.doFirst.length === 0 ? (
                    <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", padding: "1rem", textAlign: "center" }}>No emails in this quadrant.</div>
                  ) : (
                    matrixData.doFirst.map(email => (
                      <div key={email.id} className="matrix-item-card" onClick={() => { setSelectedEmail(email); setActiveTab("inbox"); }}>
                        <div className="matrix-item-subject">{email.subject}</div>
                        <div className="matrix-item-sender">{email.sender.replace(/<[^>]+>/, "").trim()}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Q2: Schedule */}
              <div className="matrix-quadrant schedule">
                <div className="quadrant-header">
                  <span className="quadrant-title" style={{ color: "var(--google-yellow)" }}>
                    <Calendar size={15} />
                    Schedule
                  </span>
                  <span className="quadrant-subtitle">Important but Less Urgent ({matrixData.schedule.length})</span>
                </div>
                <div className="quadrant-list">
                  {matrixData.schedule.length === 0 ? (
                    <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", padding: "1rem", textAlign: "center" }}>No emails in this quadrant.</div>
                  ) : (
                    matrixData.schedule.map(email => (
                      <div key={email.id} className="matrix-item-card" onClick={() => { setSelectedEmail(email); setActiveTab("inbox"); }}>
                        <div className="matrix-item-subject">{email.subject}</div>
                        <div className="matrix-item-sender">{email.sender.replace(/<[^>]+>/, "").trim()}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Q3: Delegate */}
              <div className="matrix-quadrant delegate">
                <div className="quadrant-header">
                  <span className="quadrant-title" style={{ color: "var(--google-blue)" }}>
                    <User size={15} />
                    Delegate
                  </span>
                  <span className="quadrant-subtitle">Urgent but Less Important ({matrixData.delegate.length})</span>
                </div>
                <div className="quadrant-list">
                  {matrixData.delegate.length === 0 ? (
                    <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", padding: "1rem", textAlign: "center" }}>No emails in this quadrant.</div>
                  ) : (
                    matrixData.delegate.map(email => (
                      <div key={email.id} className="matrix-item-card" onClick={() => { setSelectedEmail(email); setActiveTab("inbox"); }}>
                        <div className="matrix-item-subject">{email.subject}</div>
                        <div className="matrix-item-sender">{email.sender.replace(/<[^>]+>/, "").trim()}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Q4: Eliminate */}
              <div className="matrix-quadrant eliminate">
                <div className="quadrant-header">
                  <span className="quadrant-title" style={{ color: "var(--text-muted)" }}>
                    <Trash2 size={15} />
                    Eliminate
                  </span>
                  <span className="quadrant-subtitle">Neither (Newsletters / Low Score) ({matrixData.eliminate.length})</span>
                </div>
                <div className="quadrant-list">
                  {matrixData.eliminate.length === 0 ? (
                    <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", padding: "1rem", textAlign: "center" }}>No emails in this quadrant.</div>
                  ) : (
                    matrixData.eliminate.map(email => (
                      <div key={email.id} className="matrix-item-card" onClick={() => { setSelectedEmail(email); setActiveTab("inbox"); }}>
                        <div className="matrix-item-subject">{email.subject}</div>
                        <div className="matrix-item-sender">{email.sender.replace(/<[^>]+>/, "").trim()}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: Executive Briefing */}
          {activeTab === "brief" && (
            <div className="brief-container">
              <div className="brief-welcome">
                <h2 style={{ fontSize: "1.1rem", fontWeight: "800", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                  Workspace Intelligence Digest
                </h2>
                <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                  Good day, {session?.user?.name || "User"}. Here is your compiled cognitive briefing based on the latest email synchronizations.
                </p>
              </div>

              {/* Metrics row */}
              <div className="brief-grid-stats">
                <div className="stat-card-brief">
                  <span className="stat-card-val">{emails.length}</span>
                  <span className="stat-card-label">Emails Synced</span>
                </div>
                <div className="stat-card-brief">
                  <span className="stat-card-val" style={{ color: "var(--google-red)" }}>
                    {emails.filter(e => e.summary && e.summary.importanceScore >= 7).length}
                  </span>
                  <span className="stat-card-label">High Priority</span>
                </div>
                <div className="stat-card-brief">
                  <span className="stat-card-val" style={{ color: "var(--google-yellow)" }}>
                    {allActionItems.length}
                  </span>
                  <span className="stat-card-label">Action Items</span>
                </div>
                <div className="stat-card-brief">
                  <span className="stat-card-val" style={{ color: "var(--google-green)" }}>
                    {emails.filter(e => e.isDuplicate).length}
                  </span>
                  <span className="stat-card-label">Duplicates Skipped</span>
                </div>
              </div>

              {/* Briefing split details */}
              <div className="brief-layout-split">
                
                {/* Checklist box */}
                <div className="brief-box">
                  <div className="section-header" style={{ color: "var(--text-primary)" }}>
                    <CheckSquare size={14} />
                    <span>ALL SYNCHRONIZED ACTION ITEMS</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {allActionItems.length === 0 ? (
                      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>No action items found in your mailbox.</p>
                    ) : (
                      allActionItems.map((item, idx) => {
                        const key = `brief-${item.emailId}-${idx}`;
                        const isChecked = checkedItems[key] || false;
                        return (
                          <div 
                            key={idx} 
                            className="action-item-row" 
                            style={{ justifyContent: "space-between", alignItems: "center" }}
                          >
                            <div 
                              style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}
                              onClick={() => setCheckedItems(prev => ({ ...prev, [key]: !isChecked }))}
                            >
                              <div className={`action-checkbox-mock ${isChecked ? "checked" : ""}`}>
                                {isChecked && <ChevronRight size={10} style={{ color: "#ffffff" }} />}
                              </div>
                              <span className={`action-text ${isChecked ? "checked" : ""}`}>
                                {item.task}
                              </span>
                            </div>
                            
                            <button 
                              onClick={() => {
                                const matchedEmail = emails.find(e => e.id === item.emailId);
                                if (matchedEmail) {
                                  setSelectedEmail(matchedEmail);
                                  setActiveTab("inbox");
                                }
                              }}
                              className="action-icon-btn"
                              title="Go to Email"
                              style={{ padding: "0.25rem", color: "var(--text-muted)" }}
                            >
                              <ArrowRight size={12} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Important Highlights box */}
                <div className="brief-box">
                  <div className="section-header">
                    <Star size={14} />
                    <span>PRIORITY DIGEST LOG</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", overflowY: "auto", maxHeight: "300px" }}>
                    {emails.filter(e => e.summary && e.summary.importanceScore >= 6).length === 0 ? (
                      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic" }}>No key highlights to display.</p>
                    ) : (
                      emails.filter(e => e.summary && e.summary.importanceScore >= 6).map((email) => (
                        <div 
                          key={email.id} 
                          style={{ paddingBottom: "0.6rem", borderBottom: "1px solid var(--border-color)", cursor: "pointer" }}
                          onClick={() => { setSelectedEmail(email); setActiveTab("inbox"); }}
                        >
                          <div style={{ fontSize: "0.78rem", fontWeight: "700", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {email.subject}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                            {email.summary?.shortSummary}
                      </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 5: Connections & Workflows */}
          {activeTab === "connections" && (
            <div className="connections-scroll-shell">
              <div className="connections-container">

              {/* ── Connections Section ────────────────── */}
              <div className="connections-section">
                <div className="connections-section-header">
                  <div>
                    <h2 className="connections-section-title"><Link2 size={16} /> Connections</h2>
                    <p className="connections-section-desc">Manage third-party integrations. Connected services power your Workflow automations.</p>
                  </div>
                </div>

                <div className="connection-cards-grid">
                  {/* Google Card */}
                  <div className="connection-card">
                    <div className="connection-card-logo google-logo">G</div>
                    <div className="connection-card-body">
                      <div className="connection-card-title">Google Workspace</div>
                      <div className="connection-card-sub">Gmail · Google Calendar · Google Meet</div>
                      <div className="connection-status-row">
                        <span className="conn-status-dot connected" />
                        <span className="conn-status-text connected">Connected</span>
                        <span className="conn-email-badge">{session?.user?.email}</span>
                      </div>
                    </div>
                    <div className="connection-card-actions">
                      <div className="conn-scope-pills">
                        <span className="conn-scope-pill">Gmail</span>
                        <span className="conn-scope-pill">Calendar</span>
                      </div>
                      <button 
                        className="conn-reauth-btn"
                        onClick={() => signIn("google", { callbackUrl: window.location.href, prompt: "consent" })}
                      >
                        Re-authenticate
                      </button>
                    </div>
                  </div>

                  {/* Slack Card */}
                  <div className="connection-card">
                    <div className="connection-card-logo slack-logo">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                      </svg>
                    </div>
                    <div className="connection-card-body">
                      <div className="connection-card-title">Slack</div>
                      <div className="connection-card-sub">Team messaging · Channel notifications</div>
                      <div className="connection-status-row">
                        <span className={`conn-status-dot ${slackConnected ? "connected" : "disconnected"}`} />
                        <span className={`conn-status-text ${slackConnected ? "connected" : "disconnected"}`}>
                          {slackConnected ? "Connected" : "Not Connected"}
                        </span>
                        {slackConnected && slackWorkspace && <span className="conn-email-badge">{slackWorkspace}</span>}
                        {slackSandbox && <span className="conn-sandbox-badge">Sandbox</span>}
                      </div>
                    </div>
                    <div className="connection-card-actions">
                      {slackConnected ? (
                        <>
                          <div className="conn-scope-pills">
                            <span className="conn-scope-pill">Post Messages</span>
                            <span className="conn-scope-pill">List Channels</span>
                          </div>
                          <button className="conn-disconnect-btn" onClick={handleSlackDisconnect}>
                            Disconnect
                          </button>
                        </>
                      ) : (
                        <button className="conn-connect-btn slack-connect-btn" onClick={handleSlackConnect}>
                          Connect Slack
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Custom Webhooks Section ───────────── */}
              <div className="connections-section">
                <div className="connections-section-header">
                  <div>
                    <h2 className="connections-section-title"><Link2 size={16} /> Custom Webhooks</h2>
                    <p className="connections-section-desc">Connect any app using a webhook URL — Zapier, n8n, Discord, your own server, or any HTTP endpoint. No OAuth needed.</p>
                  </div>
                  <button
                    className="btn-primary"
                    style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem", fontSize: "0.8rem", flexShrink: 0 }}
                    onClick={() => setShowWebhookForm(true)}
                  >
                    <Plus size={14} /> Add Webhook
                  </button>
                </div>

                {/* Add Webhook Form */}
                {showWebhookForm && (
                  <div className="workflow-builder-card">
                    <div className="wf-builder-header">
                      <h3>New Webhook Connection</h3>
                      <button className="panel-close-btn" onClick={resetWebhookForm}><X size={16} /></button>
                    </div>
                    <div className="wf-builder-body">
                      <div className="wh-emoji-name-row">
                        <div className="form-group wh-emoji-picker">
                          <label>Icon</label>
                          <div className="wh-emoji-options">
                            {["🔗","⚡","🚀","📡","🔔","🎯","💬","🤖","🌐","🔧"].map(e => (
                              <button key={e} type="button" className={`wh-emoji-btn ${whEmoji === e ? "active" : ""}`} onClick={() => setWhEmoji(e)}>{e}</button>
                            ))}
                          </div>
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>Webhook Name *</label>
                          <input type="text" value={whName} onChange={e => setWhName(e.target.value)} placeholder="e.g. Zapier Trigger, Discord Alert" />
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Description</label>
                        <input type="text" value={whDescription} onChange={e => setWhDescription(e.target.value)} placeholder="Optional — what does this webhook do?" />
                      </div>

                      <div className="form-group-row">
                        <div className="form-group" style={{ flex: 3 }}>
                          <label>Webhook URL *</label>
                          <input type="url" value={whUrl} onChange={e => setWhUrl(e.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/..." style={{ fontFamily: "monospace", fontSize: "0.78rem" }} />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>Method</label>
                          <select value={whMethod} onChange={e => setWhMethod(e.target.value)}>
                            <option value="POST">POST</option>
                            <option value="GET">GET</option>
                          </select>
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Signing Secret <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>(optional — HMAC-SHA256 verification)</span></label>
                        <input type="password" value={whSecret} onChange={e => setWhSecret(e.target.value)} placeholder="your-signing-secret" style={{ fontFamily: "monospace" }} />
                      </div>

                      <div className="wf-section-label"><Plus size={12} /> Custom Headers <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></div>
                      <div className="wh-headers-list">
                        {whHeaders.map((h, i) => (
                          <div key={i} className="wh-header-row">
                            <input type="text" value={h.key} onChange={e => updateWhHeader(i, "key", e.target.value)} placeholder="Header name (e.g. Authorization)" style={{ flex: 1 }} />
                            <span style={{ color: "var(--text-dim)", fontSize: "0.75rem", padding: "0 0.3rem" }}>:</span>
                            <input type="text" value={h.value} onChange={e => updateWhHeader(i, "value", e.target.value)} placeholder="Value" style={{ flex: 2 }} />
                          </div>
                        ))}
                      </div>

                      <div className="wf-builder-footer">
                        <button type="button" className="btn-secondary" style={{ fontSize: "0.78rem", padding: "0.4rem 0.8rem" }} onClick={resetWebhookForm}>Cancel</button>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ fontSize: "0.78rem", padding: "0.4rem 1rem" }}
                          onClick={handleSaveWebhook}
                          disabled={isSavingWebhook || !whName.trim() || !whUrl.trim()}
                        >
                          {isSavingWebhook ? "Saving..." : "Save Webhook"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Webhook List */}
                {isLoadingWebhooks ? (
                  <div className="wf-empty-state">Loading webhooks...</div>
                ) : webhooks.length === 0 && !showWebhookForm ? (
                  <div className="wf-empty-state">
                    <span style={{ fontSize: "1.5rem" }}>🔗</span>
                    <p>No webhooks yet. Add one to connect any external app or service.</p>
                  </div>
                ) : (
                  <div className="webhook-cards-list">
                    {webhooks.map(wh => {
                      const ts = webhookTestStatus[wh.id];
                      const lastStatus = ts?.status || wh.lastTestStatus;
                      return (
                        <div key={wh.id} className="webhook-card">
                          <div className="webhook-card-emoji">{wh.emoji}</div>
                          <div className="webhook-card-body">
                            <div className="webhook-card-name">{wh.name}</div>
                            {wh.description && <div className="webhook-card-desc">{wh.description}</div>}
                            <div className="webhook-card-url">{wh.url}</div>
                            <div className="webhook-card-meta">
                              <span className="webhook-method-badge">{wh.method}</span>
                              {wh.secret && <span className="webhook-secure-badge">🔒 Signed</span>}
                              {lastStatus && (
                                <span className={`webhook-test-badge ${lastStatus}`}>
                                  {ts?.status === "testing" ? "Testing..." : lastStatus === "success" ? `✓ ${ts?.code || wh.lastTestCode}` : `✗ ${ts?.code ?? wh.lastTestCode ?? "ERR"}`}
                                </span>
                              )}
                              {wh.lastTestedAt && !ts && (
                                <span style={{ fontSize: "0.66rem", color: "var(--text-dim)" }}>
                                  Tested {new Date(wh.lastTestedAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            {ts?.msg && <div className="webhook-test-msg">{ts.msg}</div>}
                          </div>
                          <div className="webhook-card-actions">
                            <button
                              className="webhook-test-btn"
                              onClick={() => handleTestWebhook(wh.id)}
                              disabled={ts?.status === "testing"}
                              title="Send test ping"
                            >
                              {ts?.status === "testing" ? <RefreshCw size={13} style={{ animation: "spin 0.8s linear infinite" }} /> : <Play size={13} />}
                            </button>
                            <button className="wf-delete-btn" onClick={() => handleDeleteWebhook(wh.id)} title="Delete">
                              <Trash size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Workflow Automations Section ───────── */}

              <div className="connections-section">
                <div className="connections-section-header">
                  <div>
                    <h2 className="connections-section-title"><Zap size={16} /> Workflow Automations</h2>
                    <p className="connections-section-desc">Schedule automated pipelines — sync emails, summarize, and post digests to your Slack channel on a cron schedule.</p>
                  </div>
                  <button
                    className="btn-primary"
                    style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem", fontSize: "0.8rem", flexShrink: 0 }}
                    onClick={() => { setShowNewWorkflow(true); if (slackConnected) fetchSlackChannels(); }}
                  >
                    <Plus size={14} /> New Workflow
                  </button>
                </div>

                {/* New Workflow Form */}
                {showNewWorkflow && (
                  <div className="workflow-builder-card">
                    <div className="wf-builder-header">
                      <h3>New Workflow</h3>
                      <button className="panel-close-btn" onClick={resetWorkflowForm}><X size={16} /></button>
                    </div>

                    <div className="wf-builder-body">
                      {/* Name & Description */}
                      <div className="wf-field-group">
                        <div className="form-group">
                          <label>Workflow Name *</label>
                          <input type="text" value={wfName} onChange={e => setWfName(e.target.value)} placeholder="e.g. Daily Morning Digest" />
                        </div>
                        <div className="form-group">
                          <label>Description</label>
                          <input type="text" value={wfDescription} onChange={e => setWfDescription(e.target.value)} placeholder="Optional description..." />
                        </div>
                      </div>

                      {/* Schedule */}
                      <div className="wf-section-label"><Clock size={12} /> Schedule</div>
                      <div className="wf-schedule-presets">
                        {[
                          { label: "Every Morning 8 AM", cron: "0 8 * * *" },
                          { label: "Every Hour", cron: "0 * * * *" },
                          { label: "Every 30 min", cron: "*/30 * * * *" },
                          { label: "Every Weekday 9 AM", cron: "0 9 * * 1-5" },
                          { label: "Custom", cron: "custom" },
                        ].map(({ label, cron }) => (
                          <button
                            key={cron}
                            type="button"
                            className={`wf-preset-btn ${(cron !== "custom" && wfSchedule === cron) ? "active" : (cron === "custom" && !["0 8 * * *","0 * * * *","*/30 * * * *","0 9 * * 1-5"].includes(wfSchedule)) ? "active" : ""}`}
                            onClick={() => { if (cron !== "custom") setWfSchedule(cron); }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="form-group-row" style={{ marginTop: "0.5rem" }}>
                        <div className="form-group" style={{ flex: 2 }}>
                          <label>Cron Expression</label>
                          <input type="text" value={wfSchedule} onChange={e => setWfSchedule(e.target.value)} placeholder="0 8 * * *" style={{ fontFamily: "monospace" }} />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>Timezone</label>
                          <select value={wfTimezone} onChange={e => setWfTimezone(e.target.value)}>
                            <option value="UTC">UTC</option>
                            <option value="Asia/Kolkata">IST (India)</option>
                            <option value="America/New_York">EST (New York)</option>
                            <option value="America/Los_Angeles">PST (LA)</option>
                            <option value="Europe/London">GMT (London)</option>
                            <option value="Europe/Berlin">CET (Berlin)</option>
                          </select>
                        </div>
                      </div>

                      {/* Action Steps */}
                      <div className="wf-section-label"><Zap size={12} /> Action Pipeline</div>
                      <div className="wf-steps-list">
                        <div className={`wf-step-item ${wfActionSync ? "active" : ""}`}>
                          <label className="wf-step-toggle">
                            <input type="checkbox" checked={wfActionSync} onChange={e => setWfActionSync(e.target.checked)} />
                            <div className="wf-step-info">
                              <span className="wf-step-num">1</span>
                              <div>
                                <div className="wf-step-title"><RefreshCw size={12} /> Sync Emails</div>
                                <div className="wf-step-desc">Pull new messages from Gmail into your inbox</div>
                              </div>
                            </div>
                          </label>
                        </div>

                        <div className={`wf-step-item ${wfActionSummarize ? "active" : ""}`}>
                          <label className="wf-step-toggle">
                            <input type="checkbox" checked={wfActionSummarize} onChange={e => setWfActionSummarize(e.target.checked)} />
                            <div className="wf-step-info">
                              <span className="wf-step-num">2</span>
                              <div>
                                <div className="wf-step-title"><Sparkles size={12} /> Summarize Emails</div>
                                <div className="wf-step-desc">AI-summarize unread emails from the last 24 hours</div>
                              </div>
                            </div>
                          </label>
                        </div>

                        <div className={`wf-step-item ${wfActionJira ? "active" : ""}`}>
                          <label className="wf-step-toggle">
                            <input type="checkbox" checked={wfActionJira} onChange={e => {
                              setWfActionJira(e.target.checked);
                              if (e.target.checked && slackConnected && slackChannels.length === 0) fetchSlackChannels();
                            }} />
                            <div className="wf-step-info">
                              <span className="wf-step-num">3</span>
                              <div>
                                <div className="wf-step-title">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#4A154B" }}><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
                                  Send to Slack
                                </div>
                                <div className="wf-step-desc">Post the email digest to a Slack channel</div>
                              </div>
                            </div>
                          </label>
                          {wfActionJira && (
                            <div className="wf-step-config">
                              {!slackConnected ? (
                                <div className="wf-jira-not-connected">
                                  <AlertCircle size={13} />
                                  <span>Slack not connected. <button type="button" onClick={handleSlackConnect} style={{ background: "none", border: "none", color: "var(--accent-sky)", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Connect now</button></span>
                                </div>
                              ) : (
                                <div className="form-group">
                                  <label>Target Channel</label>
                                  <select
                                    value={wfSlackChannelId}
                                    onChange={e => {
                                      const ch = slackChannels.find(c => c.id === e.target.value);
                                      setWfSlackChannelId(e.target.value);
                                      setWfSlackChannelName(ch?.name || "");
                                    }}
                                  >
                                    {slackChannels.length === 0 && <option value="">Loading channels...</option>}
                                    {slackChannels.map(c => (
                                      <option key={c.id} value={c.id}>#{c.name}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="wf-builder-footer">
                        <button type="button" className="btn-secondary" style={{ fontSize: "0.78rem", padding: "0.4rem 0.8rem" }} onClick={resetWorkflowForm}>Cancel</button>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ fontSize: "0.78rem", padding: "0.4rem 1rem" }}
                          onClick={handleSaveWorkflow}
                          disabled={isSavingWorkflow || !wfName.trim()}
                        >
                          {isSavingWorkflow ? "Saving..." : "Save Workflow"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Workflows List */}
                {isLoadingWorkflows ? (
                  <div className="wf-empty-state">Loading workflows...</div>
                ) : workflows.length === 0 ? (
                  <div className="wf-empty-state">
                    <Zap size={28} style={{ color: "var(--text-dim)", marginBottom: "0.5rem" }} />
                    <p>No workflows yet. Create your first automation to get started.</p>
                  </div>
                ) : (
                  <div className="workflow-cards-list">
                    {workflows.map((wf) => {
                      const actions: any[] = (() => { try { return JSON.parse(wf.actions); } catch { return []; } })();
                      const runState = workflowRunStatus[wf.id];
                      return (
                        <div key={wf.id} className={`workflow-card ${wf.enabled ? "" : "disabled"}`}>
                          <div className="wf-card-left">
                            <div className="wf-card-status-dot" style={{ background: wf.enabled ? "var(--google-green)" : "var(--text-dim)" }} />
                            <div className="wf-card-info">
                              <div className="wf-card-name">{wf.name}</div>
                              {wf.description && <div className="wf-card-desc">{wf.description}</div>}
                              <div className="wf-card-meta-row">
                                <span className="wf-cron-badge"><Clock size={10} /> {wf.schedule}</span>
                                <span className="wf-tz-badge">{wf.timezone}</span>
                                {actions.map((a, i) => (
                                  <span key={i} className="wf-action-chip">
                                    {a.type === "sync_emails" && <><RefreshCw size={9} /> Sync</>}
                                    {a.type === "summarize_emails" && <><Sparkles size={9} /> Summarize</>}
                                    {a.type === "send_to_slack" && <><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg> Slack</>}
                                  </span>
                                ))}
                              </div>
                              {wf.lastRunAt && (
                                <div className="wf-last-run">
                                  Last run: {new Date(wf.lastRunAt).toLocaleString()} ·{" "}
                                  <span className={`wf-run-status ${wf.lastRunStatus}`}>{wf.lastRunStatus}</span>
                                </div>
                              )}
                              {wf.nextRunAt && wf.enabled && (
                                <div className="wf-next-run">Next run: {new Date(wf.nextRunAt).toLocaleString()}</div>
                              )}
                            </div>
                          </div>
                          <div className="wf-card-actions">
                            <button
                              className={`wf-run-btn ${runState === "running" ? "spinning" : ""}`}
                              onClick={() => handleRunWorkflow(wf.id)}
                              disabled={runState === "running"}
                              title="Run now"
                            >
                              {runState === "running" ? <RefreshCw size={13} /> : <Play size={13} />}
                            </button>
                            <button
                              className="wf-toggle-btn"
                              onClick={() => handleToggleWorkflow(wf.id, wf.enabled)}
                              title={wf.enabled ? "Pause" : "Resume"}
                            >
                              {wf.enabled ? <Pause size={13} /> : <Play size={13} />}
                            </button>
                            <button
                              className="wf-delete-btn"
                              onClick={() => handleDeleteWorkflow(wf.id)}
                              title="Delete"
                            >
                              <Trash size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            </div>
          )}


          {/* TAB 4: Unsubscribe Hub */}

          {activeTab === "unsubscribe" && (() => {
            const selectedCount = Object.keys(selectedSenders).filter(email => selectedSenders[email]).length;
            const isAllSelected = newsletterSenders.length > 0 && newsletterSenders.every(sender => selectedSenders[sender.email]);
            const toggleSelectAll = () => {
              if (isAllSelected) {
                setSelectedSenders({});
              } else {
                const newSelected: Record<string, boolean> = {};
                newsletterSenders.forEach(sender => {
                  newSelected[sender.email] = true;
                });
                setSelectedSenders(newSelected);
              }
            };

            return (
              <div className="unsubscribe-container">
                <div className="unsub-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: "1.5rem" }}>
                  <div>
                    <h2 style={{ fontSize: "1.1rem", fontWeight: "800", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                      Unsubscribe & Campaign Helper
                    </h2>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                      The AI detected these senders as circulars, promotional lists, or newsletter campaigns. Trash them all-time to clear Google space.
                    </p>
                  </div>
                  
                  {totalClearedCount > 0 && (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                      padding: "0.75rem 1.25rem",
                      background: "rgba(16, 185, 129, 0.08)",
                      border: "1px solid rgba(16, 185, 129, 0.2)",
                      borderRadius: "10px",
                      boxShadow: "0 4px 12px rgba(16, 185, 129, 0.05)"
                    }}>
                      <ShieldCheck size={18} style={{ color: "var(--google-green)" }} />
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: "0.68rem", color: "var(--google-green)", opacity: 0.85, textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700" }}>All-Time Mailbox Cleared</span>
                        <span style={{ fontSize: "0.85rem", fontWeight: "800", color: "var(--google-green)" }}>
                          {totalClearedCount} emails (~{(totalFreedBytes / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bulk Actions Bar */}
                {selectedCount > 0 && (
                  <div className="bulk-actions-bar" style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem 1.25rem",
                    background: "rgba(26, 115, 232, 0.08)",
                    border: "1px solid rgba(26, 115, 232, 0.2)",
                    borderRadius: "10px",
                    marginBottom: "1rem",
                    animation: "fadeIn 0.2s ease"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <CheckSquare size={16} style={{ color: "var(--accent-indigo)" }} />
                      <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--text-primary)" }}>
                        {selectedCount} sender{selectedCount > 1 ? 's' : ''} selected
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "0.75rem" }}>
                      <button
                        onClick={handleUnsubscribeSelectedSenders}
                        className="btn-bulk-unsub"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          padding: "0.4rem 0.85rem",
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "6px",
                          color: "var(--text-secondary)",
                          fontSize: "0.76rem",
                          fontWeight: "600",
                          cursor: "pointer",
                          transition: "all 0.2s ease"
                        }}
                      >
                        <span>Unsubscribe Selected</span>
                      </button>
                      <button
                        onClick={handleTrashSelectedSenders}
                        disabled={isCleaning}
                        className="btn-bulk-trash"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          padding: "0.4rem 0.85rem",
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid rgba(239, 68, 68, 0.2)",
                          borderRadius: "6px",
                          color: "#f87171",
                          fontSize: "0.76rem",
                          fontWeight: "600",
                          cursor: "pointer",
                          transition: "all 0.2s ease"
                        }}
                      >
                        <Trash2 size={13} />
                        <span>{isCleaning ? "Trashing..." : "Trash All-Time"}</span>
                      </button>
                    </div>
                  </div>
                )}

                {newsletterSenders.length === 0 ? (
                  <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem", fontSize: "0.82rem" }}>
                    🎉 No repetitive newsletters or promotions detected. Your inbox is clean!
                  </div>
                ) : (
                  <table className="unsub-table">
                    <thead>
                      <tr>
                        <th className="checkbox-cell">
                          <input
                            type="checkbox"
                            className="unsub-checkbox"
                            checked={isAllSelected}
                            onChange={toggleSelectAll}
                          />
                        </th>
                        <th style={{ width: "25%" }}>Sender Name</th>
                        <th style={{ width: "30%" }}>Sender Email</th>
                        <th style={{ width: "15%" }}>Synchronized Count</th>
                        <th style={{ width: "25%", textAlign: "right" }}>Cleanup Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newsletterSenders.map((senderInfo) => {
                        const isSelected = !!selectedSenders[senderInfo.email];
                        return (
                          <tr 
                            key={senderInfo.email} 
                            className={`unsub-row ${isSelected ? 'selected-row' : ''}`}
                            onClick={() => {
                              setSelectedSenders(prev => ({
                                ...prev,
                                [senderInfo.email]: !isSelected
                              }));
                            }}
                            style={{ cursor: "pointer" }}
                          >
                            <td className="checkbox-cell" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="unsub-checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  setSelectedSenders(prev => ({
                                    ...prev,
                                    [senderInfo.email]: e.target.checked
                                  }));
                                }}
                              />
                            </td>
                            <td style={{ fontWeight: "700", color: "var(--text-primary)" }}>{senderInfo.name}</td>
                            <td style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>{senderInfo.email}</td>
                            <td>
                              <span className="badge-count" style={{ background: "rgba(0, 0, 0, 0.05)", color: "var(--text-primary)" }}>
                                {senderInfo.count} messages
                              </span>
                            </td>
                            <td className="actions-cell" style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                                {senderInfo.unsubscribeUrl && (
                                  <a 
                                    href={senderInfo.unsubscribeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-unsub-link"
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "0.35rem",
                                      padding: "0.35rem 0.75rem",
                                      background: "rgba(255,255,255,0.04)",
                                      border: "1px solid var(--border-color)",
                                      borderRadius: "6px",
                                      color: "var(--text-secondary)",
                                      fontSize: "0.74rem",
                                      cursor: "pointer",
                                      textDecoration: "none",
                                      transition: "all 0.2s ease",
                                    }}
                                  >
                                    <span>Unsubscribe</span>
                                  </a>
                                )}
                                <button 
                                  className="btn-trash-sender"
                                  onClick={() => handleTrashSender(senderInfo.email)}
                                  disabled={isCleaning}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.35rem",
                                    padding: "0.35rem 0.75rem",
                                    background: "rgba(239, 68, 68, 0.1)",
                                    border: "1px solid rgba(239, 68, 68, 0.2)",
                                    borderRadius: "6px",
                                    color: "#f87171",
                                    fontSize: "0.74rem",
                                    cursor: "pointer",
                                    transition: "all 0.2s ease"
                                  }}
                                >
                                  <Trash2 size={11} />
                                  <span>{isCleaning ? "Trashing..." : "Trash All"}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })()}

        </div>
      </div>
      </div>

      {/* 3. Right Panel: Copilot Chat */}
      {isChatOpen && (
        <div className="chat-column">
          <div className="chat-header">
            <div className="chat-header-left">
              <MessageSquare size={14} style={{ color: "var(--accent-sky)" }} />
              <span>Personal Assistant</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div className="chat-status-dot" />
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginRight: "0.5rem" }}>Online</span>
              <button 
                onClick={() => setIsChatOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: "2px"
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="chat-messages">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`chat-msg ${msg.role}`}>
                {renderMessageContent(msg.content)}
              </div>
            ))}
            {isChatLoading && (
              <div className="chat-msg assistant" style={{ fontStyle: "italic", display: "flex", gap: "0.4rem", alignItems: "center", opacity: 0.7 }}>
                <RefreshCw size={11} className="animate-spin" />
                <span>Thinking...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Suggestion Chips */}
          <div className="chat-suggestions">
            {suggestions.map((sug, idx) => (
              <div key={idx} className="suggestion-chip" onClick={() => handleSendChat(sug.title)}>
                <span style={{ fontSize: "0.74rem", fontWeight: "700", color: "var(--text-primary)" }}>{sug.title}</span>
                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{sug.desc}</span>
              </div>
            ))}
          </div>

          {/* Send panel */}
          <div className="chat-input-container">
            {chatRemainingQueries !== null && chatRemainingQueries <= 3 && (
              <div style={{ fontSize: "0.67rem", color: chatRemainingQueries === 0 ? "#f87171" : "#f59e0b", padding: "0.2rem 0.75rem 0", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <AlertCircle size={10} />
                {chatRemainingQueries === 0 ? "Rate limit reached — wait 1 min" : `${chatRemainingQueries} queries left this minute`}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <input 
                type="text" 
                className="chat-input"
                placeholder="Ask about your emails..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSendChat(chatInput);
                    setChatInput("");
                  }
                }}
              />
              <button 
                className="btn-chat-send"
                onClick={() => {
                  handleSendChat(chatInput);
                  setChatInput("");
                }}
                disabled={isChatLoading || !chatInput.trim()}
              >
                <Send size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Chat Button (FAB) & Personal Assistant Tooltip */}
      <div className="floating-chat-container">
        {showPaTooltip && (
          <div className="pa-tooltip-bubble">
            <span>Use me, I&apos;m your PA!</span>
            <button className="pa-tooltip-close" onClick={dismissTooltip}>×</button>
          </div>
        )}
        <button className={`pa-floating-button ${isChatOpen ? "active" : ""}`} onClick={toggleChat}>
          {isChatOpen ? <X size={22} /> : <MessageSquare size={22} />}
        </button>
      </div>

      {/* 4. Cleanup Strategy Modal */}
      {isCleanModalOpen && (
        <div className="modal-overlay slide-in">
          <div className="modal-card">
            <div className="modal-header">
              <div className="modal-title">
                <Trash2 size={16} style={{ color: "var(--google-red)" }} />
                <span>Configure Storage Saver Agent</span>
              </div>
              <button className="action-icon-btn" onClick={() => setIsCleanModalOpen(false)}>×</button>
            </div>
            
            {!cleanResult ? (
              <>
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                  Select the cleaning strategy. Messages matching the strategy will be moved directly to your Gmail Trash folder and deleted locally.
                </p>
                
                <div className="strategy-list">
                  <div 
                    className={`strategy-row ${cleanStrategy === "both" ? "active" : ""}`}
                    onClick={() => setCleanStrategy("both")}
                  >
                    <div className="radio-dot">
                      <div className="radio-dot-inner" />
                    </div>
                    <div className="strategy-info">
                      <span className="strategy-name">Trash Duplicates & Notifications</span>
                      <span className="strategy-desc-text">Cleans duplicate newsletters and all system notifications.</span>
                    </div>
                  </div>
                  
                  <div 
                    className={`strategy-row ${cleanStrategy === "duplicates" ? "active" : ""}`}
                    onClick={() => setCleanStrategy("duplicates")}
                  >
                    <div className="radio-dot">
                      <div className="radio-dot-inner" />
                    </div>
                    <div className="strategy-info">
                      <span className="strategy-name">Trash Duplicate Newsletters Only</span>
                      <span className="strategy-desc-text">Retains notifications, only clears duplicate circular content.</span>
                    </div>
                  </div>
                  
                  <div 
                    className={`strategy-row ${cleanStrategy === "promotions" ? "active" : ""}`}
                    onClick={() => setCleanStrategy("promotions")}
                  >
                    <div className="radio-dot">
                      <div className="radio-dot-inner" />
                    </div>
                    <div className="strategy-info">
                      <span className="strategy-name">Trash Notifications Only</span>
                      <span className="strategy-desc-text">Retains duplicates, clears the system notifications category.</span>
                    </div>
                  </div>
                </div>
                
                <div className="modal-actions">
                  <button 
                    className="btn-cancel" 
                    onClick={() => setIsCleanModalOpen(false)}
                    disabled={isCleaning}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn-confirm-clean"
                    onClick={handleCleanInbox}
                    disabled={isCleaning}
                  >
                    <RefreshCw size={12} className={isCleaning ? "animate-spin" : ""} />
                    <span>{isCleaning ? "Cleaning Inbox..." : "Confirm & Run"}</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="clean-success-banner">
                  <div className="clean-success-title">
                    <UserCheck size={16} />
                    <span>Cleanup Completed!</span>
                  </div>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                    The Storage Saver Agent has finished trashing matching messages.
                  </p>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", padding: "0 0.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Emails Trashed:</span>
                    <strong style={{ color: "var(--text-primary)" }}>{cleanResult.trashedCount} messages</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Estimated Storage Freed:</span>
                    <strong style={{ color: "var(--google-green)" }}>
                      {(cleanResult.freedBytesEstimate / 1024).toFixed(1)} KB
                    </strong>
                  </div>
                </div>
                
                <div className="modal-actions">
                  <button 
                    className="btn-primary"
                    onClick={() => setIsCleanModalOpen(false)}
                    style={{ width: "100%", justifyContent: "center", display: "flex" }}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
