"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect, useRef, useMemo } from "react";
import { 
  Inbox, Sparkles, RefreshCw, LogOut, Send, Search, CheckSquare, 
  MessageSquare, User, AlertCircle, ChevronRight, Mail, Reply, ArrowRight, UserCheck, Star, Trash2,
  BarChart2, Calendar, ShieldCheck, MailOpen, X
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

const categories = ["All", "Important", "Promotions", "Finance", "Social", "Updates"];

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
  
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoadingEmails, setIsLoadingEmails] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string>("");
  
  // Dashboard tab state
  const [activeTab, setActiveTab] = useState<"inbox" | "matrix" | "brief" | "unsubscribe">("inbox");

  // Local interaction states
  const [starredEmails, setStarredEmails] = useState<Record<string, boolean>>({});
  const [archivedEmails, setArchivedEmails] = useState<Record<string, boolean>>({});
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  // Storage Saver Agent states
  const [isCleanModalOpen, setIsCleanModalOpen] = useState<boolean>(false);
  const [cleanStrategy, setCleanStrategy] = useState<string>("both");
  const [isCleaning, setIsCleaning] = useState<boolean>(false);
  const [cleanResult, setCleanResult] = useState<{ trashedCount: number; freedBytesEstimate: number } | null>(null);

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

    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsChatLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMsg }),
      });
      const data = await res.json();
      if (data.success) {
        setChatMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
      } else {
        setChatMessages((prev) => [...prev, { role: "assistant", content: `Error: ${data.error}` }]);
      }
    } catch (error) {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Failed to communicate with the assistant." }]);
    } finally {
      setIsChatLoading(false);
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
    <div className="dashboard-container slide-in">
      <style jsx>{`
        .dashboard-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          width: 100vw;
          overflow: hidden;
          background: var(--bg-primary);
          padding: 0.75rem;
          gap: 0.75rem;
        }
        
        /* Top Navigation Bar Styling */
        .top-navbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 0.5rem 1.25rem;
          height: 56px;
          flex-shrink: 0;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        
        .navbar-left {
          display: flex;
          align-items: center;
          gap: 2rem;
        }
        
        .navbar-brand {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          font-weight: 800;
          font-size: 1.15rem;
          color: var(--text-primary);
          letter-spacing: -0.5px;
          font-family: var(--font-display);
        }
        
        .navbar-brand :global(svg) {
          color: var(--accent-indigo);
        }
        
        .navbar-tabs {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }
        
        .navbar-tab-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.45rem 0.85rem;
          border-radius: var(--radius-pill);
          font-size: 0.8rem;
          color: var(--text-secondary);
          background: transparent;
          border: none;
          cursor: pointer;
          transition: all var(--transition-fast);
          font-weight: 600;
        }
        
        .navbar-tab-btn:hover {
          background: var(--bg-surface-hover);
          color: var(--text-primary);
        }
        
        .navbar-tab-btn.active {
          background: var(--border-accent);
          color: #041e49;
        }
        
        .navbar-tab-badge {
          font-size: 0.68rem;
          background: rgba(0, 0, 0, 0.06);
          color: var(--text-muted);
          padding: 0.1rem 0.35rem;
          border-radius: var(--radius-xs);
          font-weight: 700;
          margin-left: 0.25rem;
        }
        
        .navbar-tab-btn.active .navbar-tab-badge {
          background: rgba(0, 0, 0, 0.09);
          color: #041e49;
        }
        
        .navbar-right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        
        .btn-navbar-clean {
          background: rgba(239, 68, 68, 0.06);
          border: 1px solid rgba(239, 68, 68, 0.15);
          color: var(--google-red);
          font-size: 0.74rem;
          font-weight: 600;
          padding: 0.45rem 0.85rem;
          border-radius: var(--radius-pill);
          display: flex;
          align-items: center;
          gap: 0.35rem;
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .btn-navbar-clean:hover {
          background: var(--google-red);
          color: #ffffff;
          border-color: var(--google-red);
        }
        
        .btn-navbar-sync {
          background: linear-gradient(135deg, var(--accent-indigo) 0%, var(--accent-sky) 100%);
          border: none;
          color: #ffffff;
          font-size: 0.74rem;
          font-weight: 600;
          padding: 0.45rem 0.85rem;
          border-radius: var(--radius-pill);
          display: flex;
          align-items: center;
          gap: 0.35rem;
          cursor: pointer;
          transition: all var(--transition-fast);
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
        }
        .btn-navbar-sync:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
        }
        .btn-navbar-sync:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .navbar-profile-widget {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding-left: 0.5rem;
          border-left: 1px solid var(--border-color);
        }
        
        .navbar-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--bg-surface-hover);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border: 1px solid var(--border-color);
        }
        
        .navbar-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .navbar-profile-info {
          display: flex;
          flex-direction: column;
          max-width: 100px;
        }
        
        .navbar-username {
          font-size: 0.76rem;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .navbar-logout-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          border-radius: 4px;
          transition: all var(--transition-fast);
        }
        
        .navbar-logout-btn:hover {
          color: var(--google-red);
          background: rgba(239, 68, 68, 0.05);
        }

        /* Horizontal Category Filters */
        .category-scroll-bar {
          display: flex;
          gap: 0.35rem;
          padding: 0.5rem 1.25rem;
          border-bottom: 1px solid var(--border-color);
          overflow-x: auto;
          background: var(--bg-primary);
          scrollbar-width: none;
        }
        
        .category-scroll-bar::-webkit-scrollbar {
          display: none;
        }
        
        .category-pill {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.35rem 0.65rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-pill);
          color: var(--text-secondary);
          font-size: 0.72rem;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: all var(--transition-fast);
        }
        
        .category-pill:hover {
          background: var(--bg-surface-hover);
          color: var(--text-primary);
        }
        
        .category-pill.active {
          background: rgba(99, 102, 241, 0.08);
          border-color: var(--accent-indigo);
          color: var(--accent-indigo);
        }
        
        .category-badge {
          font-size: 0.64rem;
          background: rgba(0, 0, 0, 0.04);
          color: var(--text-muted);
          padding: 0.05rem 0.3rem;
          border-radius: 4px;
          font-weight: 700;
        }
        
        .category-pill.active .category-badge {
          background: rgba(99, 102, 241, 0.15);
          color: var(--accent-indigo);
        }

        /* Main panels layout */
        .workspace {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          min-width: 0;
        }

        /* Sync Notification Bar */
        .sync-notification-bar {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(26, 115, 232, 0.08);
          border: 1px solid rgba(26, 115, 232, 0.2);
          border-radius: var(--radius-sm);
          color: var(--accent-indigo);
          font-size: 0.78rem;
          padding: 0.6rem 1rem;
          flex-shrink: 0;
        }

        /* Content pane styling */
        .workspace-content {
          flex: 1;
          display: flex;
          min-height: 0;
          min-width: 0;
          gap: 0.75rem;
        }
        
        .emails-column {
          width: 380px;
          display: flex;
          flex-direction: column;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          overflow: hidden;
          flex-shrink: 0;
        }
        
        .search-container {
          padding: 1rem;
          border-bottom: 1px solid var(--border-color);
        }
        .search-form {
          position: relative;
          display: flex;
          align-items: center;
        }
        .search-input {
          width: 100%;
          padding: 0.5rem 0.75rem 0.5rem 2rem;
          font-size: 0.8rem;
        }
        .search-icon-pos {
          position: absolute;
          left: 0.75rem;
          opacity: 0.6;
        }
        
        .emails-list {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        
        /* Email Card */
        .email-card {
          padding: 0.85rem;
          border-radius: var(--radius-sm);
          background: transparent;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all var(--transition-fast);
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .email-card:hover {
          background: var(--bg-surface-hover);
          border-color: var(--border-color);
        }
        .email-card.selected {
          background: #eaf1fb;
          border-color: var(--border-accent);
        }
        .card-row-1 {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .sender-info {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          max-width: 70%;
        }
        .sender-avatar {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.58rem;
          color: #ffffff;
          font-weight: 700;
          flex-shrink: 0;
        }
        .sender-name {
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .email-date {
          font-size: 0.7rem;
          color: var(--text-muted);
        }
        .email-subject {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .email-short-summary {
          font-size: 0.74rem;
          color: var(--text-secondary);
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .card-row-1 {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 0.25rem;
        }
        .tag {
          font-size: 0.65rem;
          font-weight: 600;
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
        }
        .tag-important { background: rgba(239, 68, 68, 0.1); color: var(--google-red); }
        .tag-promotions { background: rgba(16, 185, 129, 0.1); color: var(--google-green); }
        .tag-finance { background: rgba(245, 158, 11, 0.1); color: var(--google-yellow); }
        .tag-social { background: rgba(59, 130, 246, 0.1); color: var(--google-blue); }
        .tag-updates { background: rgba(99, 102, 241, 0.1); color: var(--google-indigo); }
        .tag-duplicate { background: rgba(0, 0, 0, 0.05); color: var(--text-muted); border: 1px solid var(--border-color); }
        
        .card-actions-icons {
          display: flex;
          gap: 0.4rem;
          opacity: 0;
          transition: opacity var(--transition-fast);
        }
        .email-card:hover .card-actions-icons {
          opacity: 1;
        }
        .action-icon-btn {
          background: transparent;
          color: var(--text-muted);
          padding: 0.15rem;
          border-radius: 4px;
        }
        .action-icon-btn:hover {
          color: var(--accent-indigo);
          background: rgba(0,0,0,0.06);
        }
        .action-icon-btn.starred {
          color: var(--google-yellow);
        }

        /* Detail pane styling */
        .detail-column {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          overflow: hidden;
          min-width: 0;
        }
        
        .detail-header-panel {
          padding: 1.5rem;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .detail-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .detail-subject {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--text-primary);
          line-height: 1.3;
          font-family: var(--font-display);
        }
        .detail-sender {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .detail-date {
          font-size: 0.74rem;
          color: var(--text-muted);
        }
        
        .pane-toggle-bar {
          display: flex;
          gap: 0.5rem;
          border-bottom: 1px solid var(--border-color);
          padding: 0 1.5rem;
          background: var(--bg-primary);
        }
        .pane-toggle-btn {
          padding: 0.75rem 1rem;
          background: transparent;
          color: var(--text-muted);
          font-size: 0.78rem;
          font-weight: 700;
          border-bottom: 2px solid transparent;
          text-transform: uppercase;
          letter-spacing: 0.75px;
          border-left: none;
          border-right: none;
          border-top: none;
        }
        .pane-toggle-btn.active {
          color: var(--accent-indigo);
          border-color: var(--accent-indigo);
        }
        
        .detail-body {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
        }
        
        /* Cognitive Doc card */
        .cognitive-card {
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          background: var(--bg-primary);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          margin-bottom: 1.5rem;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
        }
        .section-header {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--accent-indigo);
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .summary-text-styled {
          font-size: 0.88rem;
          line-height: 1.6;
          color: var(--text-secondary);
        }
        
        /* Checklist items */
        .action-item-row {
          display: flex;
          align-items: flex-start;
          gap: 0.65rem;
          padding: 0.4rem 0.5rem;
          border-radius: var(--radius-xs);
          background: transparent;
          transition: background var(--transition-fast);
        }
        .action-item-row:hover {
          background: rgba(255, 255, 255, 0.015);
        }
        .action-checkbox-mock {
          width: 14px;
          height: 14px;
          border: 1px solid var(--border-color);
          border-radius: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 0.15rem;
          cursor: pointer;
          background: rgba(0, 0, 0, 0.2);
          flex-shrink: 0;
        }
        .action-checkbox-mock.checked {
          background: var(--google-green);
          border-color: var(--google-green);
        }
        .action-text {
          font-size: 0.8rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        .action-text.checked {
          text-decoration: line-through;
          color: var(--text-muted);
        }

        /* Compose assistant box */
        .compose-assistant {
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          background: var(--bg-primary);
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .compose-chips {
          display: flex;
          gap: 0.4rem;
          flex-wrap: wrap;
        }
        .chip-btn {
          font-size: 0.72rem;
          padding: 0.3rem 0.65rem;
          border-radius: 6px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
        }
        .chip-btn:hover {
          border-color: var(--border-hover);
          background: var(--bg-surface-hover);
          color: var(--text-primary);
        }
        .compose-input-row {
          display: flex;
          gap: 0.5rem;
        }
        .compose-text-input {
          flex: 1;
          font-size: 0.8rem;
          padding: 0.5rem 0.75rem;
        }
        .draft-editor {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          padding: 1rem;
          font-size: 0.82rem;
          color: var(--text-secondary);
          line-height: 1.6;
          white-space: pre-wrap;
        }

        /* ── Gmail-style compose window ── */
        .compose-window {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 2px 12px rgba(0,0,0,0.07);
          margin-top: 0.75rem;
        }
        .compose-window-header {
          background: var(--bg-secondary);
          padding: 0.55rem 1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border-color);
        }
        .compose-window-title {
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: 0.2px;
        }
        .compose-mode-toggle {
          display: flex;
          gap: 0.25rem;
        }
        .compose-mode-btn {
          font-size: 0.7rem;
          padding: 0.22rem 0.65rem;
          border-radius: 12px;
          border: 1px solid var(--border-color);
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          font-weight: 600;
          transition: all 0.15s;
        }
        .compose-mode-btn.active {
          background: var(--text-primary);
          color: var(--bg-primary);
          border-color: var(--text-primary);
        }
        .compose-field-row {
          display: flex;
          align-items: center;
          border-bottom: 1px solid var(--border-color);
          padding: 0 1rem;
          min-height: 38px;
          gap: 0.5rem;
        }
        .compose-field-label {
          font-size: 0.7rem;
          font-weight: 700;
          color: var(--text-muted);
          min-width: 34px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          flex-shrink: 0;
        }
        .compose-field-input {
          flex: 1;
          border: none;
          outline: none;
          padding: 0.45rem 0;
          font-size: 0.82rem;
          color: var(--text-primary);
          background: transparent;
          font-family: inherit;
        }
        .compose-field-input::placeholder { color: var(--text-muted); }
        .compose-field-actions {
          display: flex;
          gap: 0.25rem;
          flex-shrink: 0;
          align-items: center;
        }
        .compose-cc-btn {
          font-size: 0.68rem;
          font-weight: 700;
          color: var(--text-muted);
          padding: 0.12rem 0.45rem;
          border-radius: 4px;
          border: 1px solid var(--border-color);
          background: transparent;
          cursor: pointer;
          letter-spacing: 0.3px;
          transition: all 0.12s;
        }
        .compose-cc-btn:hover, .compose-cc-btn.active {
          background: var(--bg-secondary);
          color: var(--text-primary);
          border-color: var(--text-primary);
        }
        .compose-body-area {
          padding: 0.75rem 1rem;
        }
        .compose-body-textarea {
          width: 100%;
          border: none;
          outline: none;
          resize: none;
          font-size: 0.82rem;
          line-height: 1.65;
          color: var(--text-primary);
          background: transparent;
          min-height: 130px;
          font-family: inherit;
        }
        .compose-body-textarea::placeholder { color: var(--text-muted); }
        .compose-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.6rem 1rem;
          border-top: 1px solid var(--border-color);
          background: var(--bg-secondary);
          gap: 0.5rem;
        }
        .compose-toolbar-left {
          display: flex;
          gap: 0.4rem;
          align-items: center;
        }
        .compose-discard-btn {
          font-size: 0.74rem;
          padding: 0.35rem 0.8rem;
          border-radius: 6px;
          border: 1px solid var(--border-color);
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          font-weight: 600;
          transition: all 0.12s;
        }
        .compose-discard-btn:hover {
          background: var(--bg-primary);
          color: var(--text-primary);
          border-color: var(--border-hover);
        }
        .compose-forward-btn {
          font-size: 0.74rem;
          padding: 0.35rem 0.8rem;
          border-radius: 6px;
          border: 1px solid var(--border-color);
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          transition: all 0.12s;
        }
        .compose-forward-btn:hover {
          background: var(--bg-primary);
          color: var(--text-primary);
          border-color: var(--border-hover);
        }
        .compose-send-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: #1a73e8;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          padding: 0.4rem 1.1rem;
          font-size: 0.81rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .compose-send-btn:hover { background: #1557b0; }
        .compose-send-btn:disabled { opacity: 0.6; cursor: not-allowed; }



        /* Alignment utility */
        .accordion-container {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        /* Priority Matrix tab styled layout */
        .priority-grid {
          flex: 1;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
          gap: 0.75rem;
          min-height: 0;
          min-width: 0;
          width: 100%;
          height: 100%;
        }
        .matrix-quadrant {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          min-height: 0;
          min-width: 0;
        }
        .matrix-quadrant.do-first { border-left: 3px solid var(--google-red); }
        .matrix-quadrant.schedule { border-left: 3px solid var(--google-yellow); }
        .matrix-quadrant.delegate { border-left: 3px solid var(--google-blue); }
        .matrix-quadrant.eliminate { border-left: 3px solid var(--text-muted); }
        
        .quadrant-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
          flex-shrink: 0;
        }
        .quadrant-title {
          font-size: 0.85rem;
          font-weight: 800;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 0.45rem;
        }
        .quadrant-subtitle {
          font-size: 0.68rem;
          color: var(--text-muted);
        }
        .quadrant-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding-right: 0.25rem;
        }
        .matrix-item-card {
          padding: 0.65rem 0.85rem;
          border-radius: var(--radius-sm);
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .matrix-item-card:hover {
          background: var(--bg-surface-hover);
          border-color: var(--border-hover);
          transform: translateX(2px);
        }
        .matrix-item-subject {
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 0.15rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .matrix-item-sender {
          font-size: 0.68rem;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Executive Brief tab layout */
        .brief-container {
          flex: 1;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 1.5rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          min-width: 0;
          min-height: 0;
        }
        .brief-welcome {
          background: linear-gradient(90deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0) 100%);
          border-radius: var(--radius-sm);
          padding: 1.25rem 1.5rem;
          border-left: 2px solid var(--accent-indigo);
        }
        .brief-grid-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.75rem;
        }
        .stat-card-brief {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .stat-card-val {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text-primary);
          font-family: var(--font-display);
        }
        .stat-card-label {
          font-size: 0.7rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .brief-layout-split {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 1.25rem;
          align-items: flex-start;
        }
        .brief-box {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        /* Unsubscribe hub layout */
        .unsubscribe-container {
          flex: 1;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 1.5rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          min-width: 0;
          min-height: 0;
        }
        .unsub-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .unsub-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          table-layout: fixed;
        }
        .unsub-table th {
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--text-muted);
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--border-color);
          font-weight: 700;
        }
        .unsub-table td {
          padding: 1rem;
          border-bottom: 1px solid var(--border-color);
          font-size: 0.8rem;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .unsub-row:hover {
          background: var(--bg-surface-hover);
        }
        .btn-trash-sender {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.15);
          color: var(--google-red);
          padding: 0.35rem 0.75rem;
          border-radius: 6px;
          font-size: 0.72rem;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
        }
        .btn-trash-sender:hover {
          background: var(--google-red);
          color: #ffffff;
        }

        /* Chat Copilot panel styling */
        /* Chat Copilot panel styling */
        .chat-column {
          position: fixed;
          bottom: 92px;
          right: 24px;
          width: 360px;
          height: 620px;
          max-height: calc(100vh - 135px);
          display: flex;
          flex-direction: column;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          overflow: hidden;
          z-index: 1000;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
          animation: chatSlideUp 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        @keyframes chatSlideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        /* Floating Chat Button & Tooltip */
        .floating-chat-container {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 1001;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
        }
        
        .pa-floating-button {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--accent-indigo) 0%, var(--accent-sky) 100%);
          border: none;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .pa-floating-button:hover {
          transform: scale(1.08) translateY(-2px);
          box-shadow: 0 6px 24px rgba(99, 102, 241, 0.5);
        }
        .pa-floating-button.active {
          background: #374151;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          transform: rotate(90deg);
        }
        
        .pa-tooltip-bubble {
          position: relative;
          background: var(--accent-indigo);
          color: #ffffff;
          padding: 0.6rem 1rem;
          border-radius: 12px;
          font-size: 0.76rem;
          font-weight: 600;
          white-space: nowrap;
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
          animation: floatBounce 2.5s infinite ease-in-out;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 4px;
        }
        
        .pa-tooltip-bubble::after {
          content: "";
          position: absolute;
          bottom: -6px;
          right: 22px;
          border-width: 6px 6px 0;
          border-style: solid;
          border-color: var(--accent-indigo) transparent;
          display: block;
          width: 0;
        }
        
        .pa-tooltip-close {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          font-size: 0.95rem;
          font-weight: 700;
          padding: 0 0 0 4px;
          line-height: 1;
          transition: color 0.2s;
        }
        .pa-tooltip-close:hover {
          color: #ffffff;
        }
        
        @keyframes floatBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        
        .chat-header {
          padding: 1.25rem;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }
        .chat-header-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .chat-status-dot {
          width: 6px;
          height: 6px;
          background: var(--google-green);
          border-radius: 50%;
          filter: drop-shadow(0 0 3px rgba(16, 185, 129, 0.8));
        }
        
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .chat-msg {
          max-width: 85%;
          padding: 0.75rem 0.85rem;
          border-radius: var(--radius-sm);
          font-size: 0.78rem;
          line-height: 1.5;
        }
        .chat-msg.assistant {
          align-self: flex-start;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
        }
        .chat-msg.user {
          align-self: flex-end;
          background: var(--border-accent); /* Gmail light blue active color */
          color: #041e49; /* Gmail dark blue text */
          border: 1px solid rgba(26, 115, 232, 0.15);
        }
        
        .chat-suggestions {
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          border-top: 1px solid var(--border-color);
          background: var(--bg-secondary);
          flex-shrink: 0;
        }
        .suggestion-chip {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          padding: 0.45rem 0.65rem;
          border-radius: 6px;
          cursor: pointer;
          transition: all var(--transition-fast);
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
        }
        .suggestion-chip:hover {
          border-color: var(--border-hover);
          background: var(--bg-surface-hover);
        }
        
        .chat-input-container {
          padding: 0.75rem;
          border-top: 1px solid var(--border-color);
          display: flex;
          gap: 0.4rem;
          flex-shrink: 0;
        }
        .chat-input {
          flex: 1;
          padding: 0.5rem 0.75rem;
          font-size: 0.78rem;
        }
        .btn-chat-send {
          background: var(--accent-indigo);
          color: #ffffff;
          padding: 0.5rem;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn-chat-send:hover {
          background: var(--accent-purple);
        }
 
        /* Clean Inbox Modal styling */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5); /* lighter overlay */
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }
        .modal-card {
          width: 440px;
          background: var(--bg-glass);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-card);
          padding: 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-title {
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 0.45rem;
        }
        .strategy-list {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .strategy-row {
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .strategy-row:hover {
          background: rgba(255, 255, 255, 0.02);
          border-color: var(--border-hover);
        }
        .strategy-row.active {
          border-color: var(--accent-indigo);
          background: rgba(99, 102, 241, 0.05);
        }
        .radio-dot {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .strategy-row.active .radio-dot {
          border-color: var(--accent-indigo);
        }
        .radio-dot-inner {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: transparent;
        }
        .strategy-row.active .radio-dot-inner {
          background: var(--accent-indigo);
        }
        .strategy-info {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .strategy-name {
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .strategy-desc-text {
          font-size: 0.72rem;
          color: var(--text-muted);
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.6rem;
          margin-top: 0.5rem;
        }
        .btn-cancel {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
          padding: 0.5rem 1.25rem;
          border-radius: var(--radius-xs);
          font-size: 0.8rem;
        }
        .btn-cancel:hover {
          background: rgba(255,255,255,0.04);
          color: #ffffff;
        }
        .btn-confirm-clean {
          background: var(--google-red);
          color: #ffffff;
          padding: 0.5rem 1.25rem;
          border-radius: var(--radius-xs);
          font-size: 0.8rem;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
        }
        .btn-confirm-clean:hover {
          opacity: 0.9;
        }
        .clean-success-banner {
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.15);
          border-radius: var(--radius-sm);
          padding: 0.85rem;
          text-align: center;
        }
        .clean-success-title {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--google-green);
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }

        /* Chronological Accordion Styles */
        .accordion-container {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          width: 100%;
          height: 100%;
          overflow-y: auto;
          padding-right: 0.25rem;
        }
        .accordion-item {
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          overflow: hidden;
          background: rgba(255, 255, 255, 0.01);
          transition: all var(--transition-fast);
        }
        .accordion-item.expanded {
          border-color: var(--border-hover);
          background: rgba(255, 255, 255, 0.02);
          box-shadow: var(--shadow-glow);
        }
        .accordion-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          cursor: pointer;
          user-select: none;
          background: rgba(255, 255, 255, 0.01);
          transition: background var(--transition-fast);
        }
        .accordion-header:hover {
          background: rgba(255, 255, 255, 0.03);
        }
        .accordion-sender {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          max-width: 45%;
        }
        .accordion-sender-avatar {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.65rem;
          font-weight: 700;
          color: #ffffff;
          flex-shrink: 0;
        }
        .accordion-sender-name {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .accordion-snippet {
          font-size: 0.78rem;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          margin: 0 1.5rem;
          text-align: left;
        }
        .accordion-date {
          font-size: 0.72rem;
          color: var(--text-muted);
          margin-right: 1rem;
          flex-shrink: 0;
        }
        .accordion-chevron {
          color: var(--text-muted);
          transition: transform var(--transition-fast);
          flex-shrink: 0;
        }
        .accordion-chevron.rotated {
          transform: rotate(90deg);
          color: var(--text-primary);
        }
        .accordion-body {
          border-top: 1px solid var(--border-color);
          padding: 1rem;
          background: var(--bg-primary);
        }
        .accordion-body-iframe {
          width: 100%;
          height: 450px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-xs);
          background: #ffffff;
        }
        .accordion-body-text {
          font-size: 0.82rem;
          color: var(--text-secondary);
          line-height: 1.6;
          white-space: pre-wrap;
          background: var(--bg-secondary);
          padding: 1rem;
          border-radius: var(--radius-xs);
          border: 1px solid var(--border-color);
          overflow-y: auto;
          max-height: 400px;
        }
      `}</style>

      {/* 1. Top Navigation Bar */}
      <div className="top-navbar">
        <div className="navbar-left">
          <div className="navbar-brand">
            <Inbox size={18} />
            <span>Aether</span>
          </div>
          <div className="navbar-tabs">
            <button className={`navbar-tab-btn ${activeTab === "inbox" ? "active" : ""}`} onClick={() => setActiveTab("inbox")}>
              <Inbox size={13} style={{ opacity: activeTab === "inbox" ? 1 : 0.75 }} />
              <span>Inbox Reader</span>
              <span className="navbar-tab-badge">{threads.length}</span>
            </button>
            <button className={`navbar-tab-btn ${activeTab === "matrix" ? "active" : ""}`} onClick={() => setActiveTab("matrix")}>
              <BarChart2 size={13} style={{ opacity: activeTab === "matrix" ? 1 : 0.75 }} />
              <span>Priority Matrix</span>
              <span className="navbar-tab-badge">{matrixData.doFirst.length}</span>
            </button>
            <button className={`navbar-tab-btn ${activeTab === "brief" ? "active" : ""}`} onClick={() => setActiveTab("brief")}>
              <Calendar size={13} style={{ opacity: activeTab === "brief" ? 1 : 0.75 }} />
              <span>Executive Brief</span>
            </button>
            <button className={`navbar-tab-btn ${activeTab === "unsubscribe" ? "active" : ""}`} onClick={() => setActiveTab("unsubscribe")}>
              <ShieldCheck size={13} style={{ opacity: activeTab === "unsubscribe" ? 1 : 0.75 }} />
              <span>Unsubscribe Hub</span>
              <span className="navbar-tab-badge" style={{ color: "var(--google-red)" }}>{newsletterSenders.length}</span>
            </button>
          </div>
        </div>

        <div className="navbar-right">
          {/* Storage Cleaner Trigger */}
          <button 
            className="btn-navbar-clean"
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
            className="btn-navbar-sync"
            onClick={triggerSync}
            disabled={isSyncing}
          >
            <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
            <span>{isSyncing ? "Syncing..." : "Sync Inbox"}</span>
          </button>

          {/* User profile */}
          {session?.user && (
            <div className="navbar-profile-widget">
              <div className="navbar-avatar" title={session.user.email || ""}>
                {session.user.image ? (
                  <img src={session.user.image} alt={session.user.name || "User"} />
                ) : (
                  <User size={12} />
                )}
              </div>
              <div className="navbar-profile-info">
                <span className="navbar-username">{session.user.name || "Logged User"}</span>
              </div>
              <button 
                onClick={() => signOut()}
                className="navbar-logout-btn"
                title="Sign Out"
              >
                <LogOut size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Workspace Views */}
      <div className="workspace">
        {/* Sync notification bar */}
        {syncMessage && (
          <div className="sync-notification-bar">
            <RefreshCw size={14} className="animate-spin" style={{ color: "var(--accent-indigo)" }} />
            <span>{syncMessage}</span>
          </div>
        )}

        {/* Tab Contents */}
        <div className="workspace-content">
          
          {/* TAB 1: Inbox Reader Split Pane */}
          {activeTab === "inbox" && (
            <>
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

                {/* Horizontal Category Filters */}
                <div className="category-scroll-bar">
                  {categories.map((cat) => {
                    const count = cat === "All" 
                      ? threads.length 
                      : threads.filter(t => t.latestEmail.summary?.category === cat).length;
                    const isActive = categoryFilter === cat;
                    return (
                      <button 
                        key={cat} 
                        className={`category-pill ${isActive ? "active" : ""}`}
                        onClick={() => setCategoryFilter(cat)}
                      >
                        <span>{cat}</span>
                        <span className="category-badge">{count}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="emails-list">
                  {isLoadingEmails ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
                      <RefreshCw size={18} className="animate-spin" style={{ color: "var(--text-muted)" }} />
                    </div>
                  ) : threads.length === 0 ? (
                    <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "3rem", fontSize: "0.82rem" }}>
                      No emails matched the filter. Trigger sync.
                    </div>
                  ) : (
                    threads.map((thread) => {
                      const { threadId, emails: threadEmails, latestEmail } = thread;
                      const isSelected = selectedEmail?.threadId === threadId;
                      const isStarred = threadEmails.some(e => starredEmails[e.id]);
                      
                      // Format the combined senders list, e.g. "Srinija, Vamshi (2)"
                      const uniqueSenders = Array.from(new Set(
                        [...threadEmails].reverse().map(e => e.sender.replace(/<[^>]+>/, "").trim().replace(/^["']|["']$/g, "").trim())
                      ));
                      const sendersDisplay = uniqueSenders.join(", ") + (threadEmails.length > 1 ? ` (${threadEmails.length})` : "");

                      return (
                        <div 
                          key={threadId} 
                          className={`email-card ${isSelected ? "selected" : ""}`}
                          onClick={() => setSelectedEmail(latestEmail)}
                        >
                          <div className="card-row-1">
                            <div className="sender-info">
                              <div className="sender-avatar" style={{ background: getAvatarGradient(latestEmail.sender) }}>
                                {latestEmail.sender.charAt(0).toUpperCase()}
                              </div>
                              <span className="sender-name">{sendersDisplay}</span>
                            </div>
                            <span className="email-date">
                              {new Date(latestEmail.date).toLocaleDateString([], { month: "short", day: "numeric" })}
                            </span>
                          </div>
                          
                          <div className="email-subject">{latestEmail.subject}</div>
                          
                          <p className="email-short-summary">
                            {latestEmail.summary ? latestEmail.summary.shortSummary : latestEmail.bodySnippet}
                          </p>

                          <div className="card-row-1" style={{ marginTop: "0.25rem" }}>
                            <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                              {latestEmail.summary && (
                                <span className={`tag tag-${latestEmail.summary.category.toLowerCase()}`}>
                                  {latestEmail.summary.category}
                                </span>
                              )}
                              {threadEmails.some(e => e.isDuplicate) && (
                                <span className="tag tag-duplicate">Newsletter</span>
                              )}
                              {latestEmail.summary && latestEmail.summary.importanceScore >= 7 && (
                                <span style={{ fontSize: "0.68rem", color: "var(--google-red)", fontWeight: "bold" }}>
                                  ★ {latestEmail.summary.importanceScore}
                                </span>
                              )}
                            </div>

                            <div className="card-actions-icons">
                              <button 
                                className={`action-icon-btn ${isStarred ? "starred" : ""}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setStarredEmails((prev) => ({ ...prev, [latestEmail.id]: !prev[latestEmail.id] }));
                                }}
                              >
                                <Star size={12} fill={isStarred ? "currentColor" : "none"} />
                              </button>
                              <button 
                                className="action-icon-btn"
                                onClick={(e) => archiveThread(threadEmails, threadId, e)}
                                title="Archive Thread"
                              >
                                <CheckSquare size={12} />
                              </button>
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
                    </div>

                    <div className="pane-toggle-bar">
                      <button 
                        className={`pane-toggle-btn ${detailTab === "ai" ? "active" : ""}`}
                        onClick={() => setDetailTab("ai")}
                      >
                        AI Insights
                      </button>
                      <button 
                        className={`pane-toggle-btn ${detailTab === "original" ? "active" : ""}`}
                        onClick={() => setDetailTab("original")}
                      >
                        Original Message
                      </button>
                    </div>

                    <div className="detail-body">
                      {detailTab === "ai" ? (
                        <>
                          {/* Cognitive Summary */}
                          <div className="cognitive-card">
                            <div className="section-header">
                              <MailOpen size={14} />
                              <span>COGNITIVE SUMMARY</span>
                            </div>
                            
                            {selectedEmail.summary ? (
                              <>
                                <p className="summary-text-styled" style={{ fontWeight: "700", color: "var(--text-primary)" }}>
                                  {selectedEmail.summary.shortSummary}
                                </p>
                                <p className="summary-text-styled">
                                  {selectedEmail.summary.detailedSummary}
                                </p>
                              </>
                            ) : (
                              <p className="summary-text-styled" style={{ fontStyle: "italic", color: "var(--text-muted)" }}>
                                Summarization was skipped for this item.
                              </p>
                            )}
                          </div>

                          {/* Action Items extracted */}
                          {selectedEmail.summary && (
                            <div className="cognitive-card">
                              <div className="section-header">
                                <CheckSquare size={14} />
                                <span>EXTRACTED ACTION ITEMS</span>
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
                                    <Reply size={14} />
                                    <span>WORKSPACE DRAFTING ASSISTANT</span>
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
            </>
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

          {/* TAB 4: Unsubscribe Hub */}
          {activeTab === "unsubscribe" && (
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

              {newsletterSenders.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem", fontSize: "0.82rem" }}>
                  🎉 No repetitive newsletters or promotions detected. Your inbox is clean!
                </div>
              ) : (
                <table className="unsub-table">
                  <thead>
                    <tr>
                      <th style={{ width: "25%" }}>Sender Name</th>
                      <th style={{ width: "35%" }}>Sender Email</th>
                      <th style={{ width: "20%" }}>Synchronized Count</th>
                      <th style={{ width: "20%", textAlign: "right" }}>Cleanup Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newsletterSenders.map((senderInfo) => (
                      <tr key={senderInfo.email} className="unsub-row">
                        <td style={{ fontWeight: "700", color: "var(--text-primary)" }}>{senderInfo.name}</td>
                        <td style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>{senderInfo.email}</td>
                        <td>
                          <span className="badge-count" style={{ background: "rgba(0, 0, 0, 0.05)", color: "var(--text-primary)" }}>
                            {senderInfo.count} messages
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
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
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

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
              <div className="chat-msg assistant" style={{ fontStyle: "italic", display: "flex", gap: "0.4rem", alignItems: "center" }}>
                <RefreshCw size={11} className="animate-spin" />
                <span>Compiling context...</span>
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
            <input 
              type="text" 
              className="chat-input"
              placeholder="Query mailbox (e.g. 'Summarize my week')..."
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
      )}

      {/* Floating Chat Button (FAB) & Personal Assistant Tooltip */}
      <div className="floating-chat-container">
        {showPaTooltip && (
          <div className="pa-tooltip-bubble">
            <span>Use me, I'm your PA!</span>
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
                      <span className="strategy-name">Trash Newsletters & Promotions</span>
                      <span className="strategy-desc-text">Cleans weekly duplicate newsletters and all promotions.</span>
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
                      <span className="strategy-desc-text">Retains promotions, only clears duplicate circular content.</span>
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
                      <span className="strategy-name">Trash Promotions Only</span>
                      <span className="strategy-desc-text">Retains duplicates, clears the promotions category.</span>
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
