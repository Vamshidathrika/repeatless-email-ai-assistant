"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { 
  Inbox, Sparkles, RefreshCw, LogOut, Send, Search, CheckSquare, 
  MessageSquare, User, AlertCircle, ChevronRight, Mail, Reply, ArrowRight, UserCheck, Star, Trash2
} from "lucide-react";

interface EmailSummary {
  shortSummary: string;
  detailedSummary: string;
  actionItems: string; // JSON string
  category: string;
  importanceScore: number;
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
  labels: string;
  isDuplicate: boolean;
  summary?: EmailSummary;
}

const categories = ["All", "Important", "Promotions", "Finance", "Social", "Updates"];

export default function Home() {
  const { data: session, status } = useSession();
  
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoadingEmails, setIsLoadingEmails] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string>("");
  
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

  // Chat state
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: "Hi! I am your cognitive inbox copilot. Ask me anything about your synced emails, e.g., 'Summarize my week' or 'Do I have any action items?'" }
  ]);
  const [chatInput, setChatInput] = useState<string>("");
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Reply Draft State
  const [replyInstruction, setReplyInstruction] = useState<string>("");
  const [aiDraft, setAiDraft] = useState<string>("");
  const [isDrafting, setIsDrafting] = useState<boolean>(false);
  const [isSendingReply, setIsSendingReply] = useState<boolean>(false);
  const [replyStatus, setReplyStatus] = useState<string>("");

  // Prompt suggestions with descriptions (pro max)
  const suggestions = [
    { title: "Summarize my week", desc: "Compile a high-level briefing of all emails." },
    { title: "List urgent action items", desc: "Find everything expecting your action." },
    { title: "Show important unread mails", desc: "Sort and filter unread items by importance." },
  ];

  // Derive visible (non-archived) emails
  const visibleEmails = emails.filter((email) => !archivedEmails[email.id]);

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


  useEffect(() => {
    if (session) {
      fetchEmails();
    }
  }, [session, categoryFilter]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const fetchEmails = async (search = searchQuery) => {
    setIsLoadingEmails(true);
    try {
      let url = `/api/emails?`;
      if (categoryFilter !== "All") {
        url += `category=${encodeURIComponent(categoryFilter)}&`;
      }
      if (search) {
        url += `search=${encodeURIComponent(search)}&`;
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
    setAiDraft("");
    setReplyStatus("Orchestrating Gemini writer...");
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
      if (data.success) {
        setAiDraft(data.draft);
        setReplyStatus("");
      } else {
        setReplyStatus(`Draft failed: ${data.error}`);
      }
    } catch (error) {
      setReplyStatus("Draft pipeline interrupted.");
    } finally {
      setIsDrafting(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedEmail || !aiDraft.trim()) return;
    setIsSendingReply(true);
    setReplyStatus("Dispatching response...");
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          threadId: selectedEmail.threadId,
          replyText: aiDraft,
          recipient: selectedEmail.sender,
          subject: selectedEmail.subject,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyStatus("Reply dispatched successfully!");
        setReplyInstruction("");
        setAiDraft("");
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

  // Helper to generate a unique gradient background for user initials (avoids boring gray)
  const getAvatarGradient = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `linear-gradient(135deg, hsl(${h}, 70%, 45%) 0%, hsl(${(h + 40) % 360}, 65%, 35%) 100%)`;
  };

  // Login screen (Superhuman style)
  if (status === "unauthenticated") {
    return (
      <div className="login-container">
        <style jsx>{`
          .login-container {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            width: 100vw;
            background-color: var(--bg-primary);
            position: relative;
            overflow: hidden;
          }
          .background-glow {
            position: absolute;
            width: 600px;
            height: 600px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 70%);
            top: -10%;
            right: -10%;
            pointer-events: none;
          }
          .login-card {
            padding: 4rem 3rem;
            max-width: 480px;
            width: 90%;
            border-radius: var(--radius-lg);
            border: 1px solid var(--border-color);
            background: rgba(12, 15, 22, 0.75);
            backdrop-filter: blur(40px);
            box-shadow: var(--shadow-card);
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .brand-badge {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            border-radius: var(--radius-pill);
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border-color);
            font-size: 0.78rem;
            font-weight: 600;
            color: var(--accent-blue);
            margin-bottom: 2rem;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          .title {
            font-size: 2.2rem;
            font-weight: 700;
            letter-spacing: -0.04em;
            margin-bottom: 1rem;
            color: #ffffff;
          }
          .subtitle {
            color: var(--text-secondary);
            font-size: 0.9rem;
            margin-bottom: 3rem;
            line-height: 1.6;
            text-align: center;
          }
          .login-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
            width: 100%;
            padding: 0.95rem;
            font-weight: 600;
            border-radius: var(--radius-sm);
            background: var(--text-primary);
            color: var(--bg-primary);
            transition: all 0.2s ease;
          }
          .login-btn:hover {
            opacity: 0.9;
            transform: translateY(-1px);
          }
        `}</style>
        <div className="background-glow" />
        <div className="login-card">
          <div className="brand-badge">
            <Sparkles size={12} />
            <span>Gmail Intelligence OS</span>
          </div>
          <div className="title">Platform Workspace</div>
          <div className="subtitle">An advanced, single-user cognitive inbox client. Process, summarize, and reply to your threads using Gemini 3.5 Flash.</div>
          <button className="login-btn" onClick={() => signIn("google")}>
            <Mail size={16} />
            Connect Google Account
          </button>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="loading-container">
        <style jsx>{`
          .loading-container {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background-color: var(--bg-primary);
          }
        `}</style>
        <div className="loader" style={{ width: "24px", height: "24px" }}></div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <style jsx>{`
        .dashboard-container {
          display: flex;
          height: 100vh;
          width: 100vw;
          overflow: hidden;
          background: radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.08) 0%, transparent 60%), var(--bg-primary);
          padding: 0.75rem;
          gap: 0.75rem;
        }
        
        .sidebar {
          width: 260px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 1.5rem 1rem;
          flex-shrink: 0;
        }
        
        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          font-weight: 800;
          font-size: 1.15rem;
          color: #ffffff;
          padding-left: 0.5rem;
          margin-bottom: 2rem;
          letter-spacing: -0.5px;
          font-family: var(--font-display);
        }
        .sidebar-brand :global(svg) {
          color: var(--accent-purple);
          filter: drop-shadow(0 0 8px rgba(139, 92, 246, 0.5));
        }
        
        .nav-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .nav-title {
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--text-muted);
          font-weight: 700;
          padding-left: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .nav-pill {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          font-size: 0.88rem;
          font-weight: 500;
          width: 100%;
          text-align: left;
          background: transparent;
          transition: all var(--transition-fast);
          border: 1px solid transparent;
        }

        .nav-pill:hover {
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
        }

        .nav-pill.active {
          background: rgba(99, 102, 241, 0.08);
          border: 1px solid rgba(99, 102, 241, 0.2);
          color: #ffffff;
          font-weight: 600;
          position: relative;
        }

        .nav-pill.active::before {
          content: "";
          position: absolute;
          left: 0;
          top: 25%;
          height: 50%;
          width: 3px;
          background: var(--accent-gradient);
          border-radius: 0 4px 4px 0;
        }

        .nav-pill-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .nav-pill-count {
          font-size: 0.7rem;
          background: rgba(255, 255, 255, 0.05);
          padding: 0.1rem 0.4rem;
          border-radius: 6px;
          color: var(--text-muted);
        }
        
        .workspace-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        
        .panel-header {
          height: 64px;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1.5rem;
          background: rgba(0, 0, 0, 0.15);
        }
        
        .search-wrapper {
          position: relative;
          max-width: 480px;
          width: 100%;
        }
        .search-bar {
          display: flex;
          align-items: center;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          padding: 0.5rem 0.85rem;
          transition: all var(--transition-normal);
        }
        .search-bar:focus-within {
          border-color: var(--accent-indigo);
          background: rgba(0, 0, 0, 0.45);
          box-shadow: 0 0 15px rgba(99, 102, 241, 0.12);
        }
        .search-input {
          background: transparent;
          border: none;
          padding: 0 0.5rem;
          font-size: 0.85rem;
          color: var(--text-primary);
          width: 100%;
          outline: none;
        }
        
        .panel-body {
          display: flex;
          flex: 1;
          overflow: hidden;
        }
        
        /* Premium List View */
        .emails-column {
          width: 380px;
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          flex-shrink: 0;
          background: rgba(0, 0, 0, 0.05);
        }
        .emails-list {
          flex: 1;
          overflow-y: auto;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .email-item {
          padding: 1rem;
          border-radius: var(--radius-sm);
          border: 1px solid transparent;
          cursor: pointer;
          transition: all var(--transition-fast);
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          position: relative;
          background: rgba(255, 255, 255, 0.01);
        }
        .email-item:hover {
          background: rgba(255, 255, 255, 0.03);
          border-color: var(--border-hover);
        }
        .email-item.selected {
          background: rgba(99, 102, 241, 0.06);
          border-color: var(--border-accent);
          box-shadow: inset 0 0 12px rgba(99, 102, 241, 0.05);
        }
        .email-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .sender-badge-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .sender-avatar {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          font-weight: 700;
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .sender-name {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }
        .date-label {
          font-size: 0.72rem;
          color: var(--text-muted);
        }
        .email-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .summary-peek {
          font-size: 0.78rem;
          color: var(--text-secondary);
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* Hover actions overlay */
        .hover-actions {
          position: absolute;
          right: 0.75rem;
          top: 0.75rem;
          display: flex;
          gap: 0.3rem;
          opacity: 0;
          transition: opacity var(--transition-fast);
          background: rgba(8, 12, 24, 0.9);
          padding: 0.2rem;
          border-radius: var(--radius-xs);
          border: 1px solid var(--border-color);
          backdrop-filter: blur(8px);
        }
        .email-item:hover .hover-actions {
          opacity: 1;
        }
        .action-btn {
          width: 24px;
          height: 24px;
          border-radius: 4px;
          background: transparent;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all var(--transition-fast);
        }
        .action-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }
        .action-btn.star-btn.active {
          color: var(--google-yellow);
        }
        
        /* Modern Badges */
        .tag {
          font-size: 0.68rem;
          font-weight: 700;
          padding: 0.15rem 0.5rem;
          border-radius: 6px;
          border: 1px solid transparent;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .tag-important {
          background: rgba(239, 68, 68, 0.06);
          border-color: rgba(239, 68, 68, 0.15);
          color: var(--google-red);
        }
        .tag-promotions {
          background: rgba(59, 130, 246, 0.06);
          border-color: rgba(59, 130, 246, 0.15);
          color: var(--google-blue);
        }
        .tag-finance {
          background: rgba(16, 185, 129, 0.06);
          border-color: rgba(16, 185, 129, 0.15);
          color: var(--google-green);
        }
        .tag-updates {
          background: rgba(245, 158, 11, 0.06);
          border-color: rgba(245, 158, 11, 0.15);
          color: var(--google-yellow);
        }

        .tag-duplicate {
          background: rgba(71, 85, 105, 0.1);
          border-color: rgba(71, 85, 105, 0.2);
          color: var(--text-secondary);
        }

        /* Importance Score Pill */
        .importance-score-badge {
          display: flex;
          align-items: center;
          gap: 0.2rem;
          font-size: 0.7rem;
          font-weight: 700;
          padding: 0.15rem 0.45rem;
          border-radius: 6px;
          border: 1px solid transparent;
        }
        .score-high {
          background: rgba(244, 63, 94, 0.08);
          border-color: rgba(244, 63, 94, 0.2);
          color: var(--accent-pink);
          box-shadow: 0 0 8px rgba(244, 63, 94, 0.15);
        }
        .score-med {
          background: rgba(245, 158, 11, 0.08);
          border-color: rgba(245, 158, 11, 0.2);
          color: var(--google-yellow);
        }
        .score-low {
          background: rgba(16, 185, 129, 0.08);
          border-color: rgba(16, 185, 129, 0.2);
          color: var(--google-green);
        }
        
        .indicator-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent-indigo);
          box-shadow: 0 0 8px var(--accent-indigo);
        }
        
        /* Reading Pane Details */
        .details-column {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          padding: 2rem;
          background: rgba(0, 0, 0, 0.15);
        }
        .tab-bar {
          display: flex;
          gap: 1.5rem;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 0.5rem;
          margin-bottom: 1.5rem;
        }
        .tab-btn {
          background: transparent;
          color: var(--text-secondary);
          font-size: 0.88rem;
          font-weight: 500;
          padding: 0.35rem 0.2rem;
          position: relative;
          transition: all var(--transition-fast);
        }
        .tab-btn:hover {
          color: #ffffff;
        }
        .tab-btn.active {
          color: var(--accent-indigo);
          font-weight: 700;
        }
        .tab-btn.active::after {
          content: "";
          position: absolute;
          bottom: -0.6rem;
          left: 0;
          width: 100%;
          height: 2px;
          background: var(--accent-gradient);
          border-radius: 2px;
        }
        
        .mail-header {
          margin-bottom: 2rem;
        }
        .mail-subject {
          font-size: 1.5rem;
          font-weight: 800;
          color: #ffffff;
          line-height: 1.3;
          margin-bottom: 0.75rem;
          font-family: var(--font-display);
          letter-spacing: -0.02em;
        }
        .mail-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.82rem;
        }
        
        /* Elegant Cognitive summary card */
        .cognitive-doc {
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.015) 0%, rgba(255, 255, 255, 0) 100%);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          margin-bottom: 1.5rem;
          position: relative;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .cognitive-doc::before {
          content: "";
          position: absolute;
          top: -1px;
          left: 10%;
          right: 10%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(99, 102, 241, 0.3), transparent);
        }
        .doc-section-title {
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--accent-indigo);
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-family: var(--font-display);
        }
        .doc-section-title :global(svg) {
          filter: drop-shadow(0 0 4px rgba(99, 102, 241, 0.4));
        }
        
        /* Checklist styles */
        .checklist {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .checklist-item {
          display: flex;
          gap: 0.75rem;
          align-items: flex-start;
          font-size: 0.88rem;
          color: var(--text-primary);
          line-height: 1.45;
          padding: 0.45rem 0.65rem;
          border-radius: var(--radius-xs);
          transition: all var(--transition-fast);
          background: rgba(255, 255, 255, 0.005);
          border: 1px solid transparent;
          cursor: pointer;
        }
        .checklist-item:hover {
          background: rgba(255, 255, 255, 0.02);
          border-color: var(--border-color);
        }
        .checkbox-bullet {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          border: 1.5px solid var(--accent-indigo);
          margin-top: 2px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .checklist-item:hover .checkbox-bullet {
          border-color: var(--accent-purple);
          background: rgba(99, 102, 241, 0.1);
        }
        .checkbox-bullet.checked {
          background: var(--accent-indigo);
          border-color: var(--accent-indigo);
        }
        
        /* Composer Reply Assistance Group */
        .composer-box {
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          background: rgba(255, 255, 255, 0.005);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .composer-input-row {
          display: flex;
          gap: 0.5rem;
        }
        .composer-input {
          flex: 1;
          border-radius: var(--radius-sm);
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid var(--border-color);
          padding: 0.65rem 0.85rem;
          font-size: 0.85rem;
          outline: none;
        }
        .composer-input:focus {
          border-color: var(--accent-indigo);
        }
        .template-pill {
          transition: all var(--transition-fast);
          outline: none;
        }
        .template-pill:hover {
          background: rgba(255, 255, 255, 0.08) !important;
          color: #ffffff !important;
          border-color: var(--border-hover) !important;
          transform: translateY(-1px);
        }
        
        /* Cognitive Chat Panel (Right Sidebar) */
        .chat-column {
          width: 320px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          flex-shrink: 0;
          padding: 1rem 0;
          background: rgba(0, 0, 0, 0.15);
        }
        .chat-title-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 800;
          font-size: 0.95rem;
          padding: 0 1.25rem 1rem 1.25rem;
          border-bottom: 1px solid var(--border-color);
          color: #ffffff;
          font-family: var(--font-display);
        }
        .chat-title-row :global(svg) {
          color: var(--accent-indigo);
        }
        .chat-pane-messages {
          flex: 1;
          overflow-y: auto;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .message-bubble {
          max-width: 88%;
          padding: 0.8rem 1rem;
          font-size: 0.84rem;
          line-height: 1.5;
        }
        .message-bubble.user {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%);
          border: 1px solid rgba(99, 102, 241, 0.35);
          color: #ffffff;
          align-self: flex-end;
          border-radius: 14px 14px 2px 14px;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.05);
        }
        .message-bubble.assistant {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
          align-self: flex-start;
          border-radius: 14px 14px 14px 2px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        }
        
        .suggestion-card {
          padding: 0.75rem 1rem;
          background: rgba(255, 255, 255, 0.015);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          text-align: left;
          width: 100%;
          cursor: pointer;
          transition: all var(--transition-fast);
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .suggestion-card:hover {
          border-color: var(--accent-indigo);
          background: rgba(99, 102, 241, 0.05);
          transform: translateY(-1px);
        }
        .suggestion-card-title {
          font-size: 0.8rem;
          font-weight: 700;
          color: #ffffff;
        }
        .suggestion-card-desc {
          font-size: 0.7rem;
          color: var(--text-muted);
        }
        
        .chat-bottom-bar {
          padding: 1rem 1.25rem 0 1.25rem;
          border-top: 1px solid var(--border-color);
        }
        .chat-input-row {
          display: flex;
          gap: 0.4rem;
        }
        .chat-box-input {
          flex: 1;
          border-radius: var(--radius-sm);
          padding: 0.65rem 0.85rem;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--border-color);
          font-size: 0.84rem;
          outline: none;
        }
        .chat-send-btn {
          width: 38px;
          height: 38px;
          background: var(--text-primary);
          color: var(--bg-primary);
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all var(--transition-fast);
        }
        .chat-send-btn:hover {
          background: #ffffff;
          transform: scale(1.04);
        }
        
        /* Status indicator pulse dot */
        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
          display: inline-block;
          box-shadow: 0 0 8px #10b981;
          animation: pulseStatus 2s infinite ease-in-out;
        }
        @keyframes pulseStatus {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        
        /* Storage Saver Sidebar Card */
        .storage-card {
          margin-top: 1.5rem;
          padding: 1rem;
          border-radius: var(--radius-sm);
          background: rgba(239, 68, 68, 0.02);
          border: 1px solid rgba(239, 68, 68, 0.1);
          transition: all var(--transition-fast);
        }
        .storage-card:hover {
          border-color: rgba(239, 68, 68, 0.2);
          background: rgba(239, 68, 68, 0.04);
        }
        .storage-title {
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--google-red);
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
          font-family: var(--font-display);
        }
        .storage-desc {
          font-size: 0.76rem;
          color: var(--text-secondary);
          line-height: 1.4;
          margin-bottom: 0.75rem;
        }
        .btn-storage {
          width: 100%;
          background: rgba(239, 68, 68, 0.1);
          color: var(--google-red);
          border: 1px solid rgba(239, 68, 68, 0.15);
          padding: 0.5rem;
          border-radius: 8px;
          font-size: 0.78rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          transition: all var(--transition-fast);
        }
        .btn-storage:hover:not(:disabled) {
          background: var(--google-red);
          color: #ffffff;
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.25);
        }

        /* Clean Modal Overlay & Box */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.25s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .modal-box {
          width: 90%;
          max-width: 460px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 1.75rem;
          box-shadow: var(--shadow-card);
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .modal-header {
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }
        .modal-title {
          font-size: 1.2rem;
          font-weight: 800;
          color: #ffffff;
          font-family: var(--font-display);
        }
        .modal-desc {
          font-size: 0.86rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        .strategy-options {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .strategy-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-color);
          cursor: pointer;
          transition: all var(--transition-fast);
          background: rgba(255, 255, 255, 0.005);
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
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 1.5px solid var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .strategy-row.active .radio-dot {
          border-color: var(--accent-indigo);
        }
        .radio-dot-inner {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent-indigo);
          opacity: 0;
          transition: opacity var(--transition-fast);
        }
        .strategy-row.active .radio-dot-inner {
          opacity: 1;
        }
        .strategy-info {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .strategy-name {
          font-size: 0.84rem;
          font-weight: 600;
          color: #ffffff;
        }
        .strategy-desc-text {
          font-size: 0.74rem;
          color: var(--text-muted);
        }
        .modal-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          margin-top: 0.5rem;
        }
        .btn-cancel {
          background: transparent;
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
          padding: 0.65rem 1.25rem;
          border-radius: 8px;
          font-size: 0.82rem;
          font-weight: 600;
        }
        .btn-cancel:hover {
          background: rgba(255, 255, 255, 0.03);
          border-color: var(--border-hover);
          color: #ffffff;
        }
        .btn-confirm-clean {
          background: var(--google-red);
          color: #ffffff;
          padding: 0.65rem 1.25rem;
          border-radius: 8px;
          font-size: 0.82rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          box-shadow: 0 4px 15px rgba(239, 68, 68, 0.2);
        }
        .btn-confirm-clean:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(239, 68, 68, 0.35);
        }
        
        /* Success banner */
        .clean-success-banner {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding: 0.75rem 1rem;
          border-radius: var(--radius-sm);
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.2);
          color: var(--google-green);
          font-size: 0.8rem;
          margin-bottom: 1rem;
        }
        .clean-success-title {
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
      `}</style>

      {/* Floating Left Sidebar */}
      <div className="sidebar glass-panel">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <Sparkles size={18} />
            <span>Gmail Intelligence</span>
          </div>
          
          <button 
            className="btn-ai" 
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "1.5rem" }}
            onClick={triggerSync}
            disabled={isSyncing}
          >
            <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
            <span>{isSyncing ? "Syncing..." : "Sync Inbox"}</span>
          </button>
          
          <div className="nav-section">
            <div className="nav-title">Cognitive Filters</div>
            <ul className="nav-list" style={{ listStyle: "none" }}>
              {categories.map((cat) => {
                const count = cat === "All"
                  ? visibleEmails.length
                  : visibleEmails.filter((e) => e.summary?.category === cat).length;
                return (
                  <li key={cat} style={{ marginBottom: "2px" }}>
                    <button 
                      className={`nav-pill ${categoryFilter === cat ? "active" : ""}`}
                      onClick={() => {
                        setCategoryFilter(cat);
                        setSelectedEmail(null);
                      }}
                    >
                      <div className="nav-pill-left">
                        <Inbox size={15} style={{ opacity: categoryFilter === cat ? 1 : 0.7 }} />
                        <span>{cat}</span>
                      </div>
                      <span className="nav-pill-count">{count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="storage-card">
            <div className="storage-title">
              <Trash2 size={12} />
              <span>Storage Saver</span>
            </div>
            <p className="storage-desc">
              Move duplicate newsletters and promotional emails to Trash automatically to clean up storage.
            </p>
            <button 
              className="btn-storage"
              onClick={() => {
                setCleanResult(null);
                setIsCleanModalOpen(true);
              }}
            >
              <span>Clean Inbox</span>
            </button>
          </div>
        </div>
        
        <div className="sidebar-footer">
          {syncMessage && (
            <div style={{ fontSize: "0.72rem", color: "var(--accent-indigo)", padding: "0 0.5rem", display: "flex", gap: "0.25rem", alignItems: "center", marginBottom: "0.5rem" }}>
              <AlertCircle size={10} />
              <span>{syncMessage}</span>
            </div>
          )}
          
          <div className="user-profile-widget" style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
            <div className="avatar avatar-glow" style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--border-hover)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {session?.user?.image ? (
                <img src={session.user.image} alt={session.user.name || "User"} style={{ width: "100%", height: "100%" }} />
              ) : (
                <User size={12} style={{ color: "var(--text-secondary)" }} />
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", width: "110px" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: "600", color: "#ffffff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {session?.user?.name || "User"}
              </span>
              <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {session?.user?.email}
              </span>
            </div>
            <button 
              onClick={() => signOut()} 
              style={{ marginLeft: "auto", background: "transparent", color: "var(--text-muted)", display: "flex", alignItems: "center" }}
              title="Sign Out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </div>
      
      {/* Workspace Panel */}
      <div className="workspace-panel glass-panel">
        <div className="panel-header">
          <div className="search-wrapper">
            <form className="search-bar" onSubmit={handleSearchSubmit}>
              <Search size={14} style={{ color: "var(--text-muted)" }} />
              <input 
                type="text" 
                className="search-input" 
                placeholder="Search mail or AI context..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
          </div>
          
          <div className="cmd-palette-prompt">
            <span className="cmd-key">⌘</span>
            <span className="cmd-key">K</span>
            <span>AI Command Center</span>
          </div>
        </div>
        
        <div className="panel-body">
          {/* Email list column */}
          <div className="emails-column">
            <div className="emails-list">
              {isLoadingEmails ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
                  <div className="loader"></div>
                </div>
              ) : visibleEmails.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "3rem", fontSize: "0.82rem" }}>
                  No emails matched the filter. Trigger sync.
                </div>
              ) : (
                visibleEmails.map((email) => {
                  let tagClass = "tag-updates";
                  if (email.summary?.category === "Important") tagClass = "tag-important";
                  else if (email.summary?.category === "Promotions") tagClass = "tag-promotions";
                  else if (email.summary?.category === "Finance") tagClass = "tag-finance";
                  
                  const isStarred = !!starredEmails[email.id];
                  const importance = email.summary?.importanceScore || 1;
                  const scoreClass = importance >= 8 ? "score-high" : importance >= 5 ? "score-med" : "score-low";
                  
                  return (
                    <div 
                      key={email.id} 
                      className={`email-item ${selectedEmail?.id === email.id ? "selected" : ""}`}
                      onClick={() => {
                        setSelectedEmail(email);
                        setAiDraft("");
                        setReplyInstruction("");
                      }}
                    >
                      {/* Hover Actions */}
                      <div className="hover-actions">
                        <button 
                          className={`action-btn star-btn ${isStarred ? "active" : ""}`}
                          onClick={(e) => toggleStar(email.id, e)}
                          title={isStarred ? "Unstar" : "Star"}
                        >
                          <Star size={12} fill={isStarred ? "var(--google-yellow)" : "none"} stroke={isStarred ? "var(--google-yellow)" : "currentColor"} />
                        </button>
                        <button 
                          className="action-btn archive-btn" 
                          onClick={(e) => archiveEmail(email.id, e)}
                          title="Archive"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      <div className="email-item-header">
                        <div className="sender-badge-row">
                          <div 
                            className="sender-avatar"
                            style={{ background: getAvatarGradient(email.sender) }}
                          >
                            {email.sender[0].toUpperCase()}
                          </div>
                          <span className="sender-name">{email.sender.split("<")[0].replace(/"/g, "").trim()}</span>
                        </div>
                        <span className="date-label">
                          {new Date(email.date).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      
                      <div className="email-title">{email.subject}</div>
                      <div className="summary-peek">
                        {email.summary ? email.summary.shortSummary : email.bodySnippet}
                      </div>
                      
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem" }}>
                        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                          <span className={`tag ${tagClass}`}>
                            {email.summary?.category || "Updates"}
                          </span>
                          {email.isDuplicate && (
                            <span className="tag tag-duplicate" style={{ fontSize: "0.6rem" }}>
                              Deduplicated
                            </span>
                          )}
                        </div>
                        
                        {email.summary && (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <div className={`importance-score-badge ${scoreClass}`}>
                              <Star size={9} fill="currentColor" />
                              <span>{importance}</span>
                            </div>
                            <div className="indicator-dot" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
          {/* Detailed View Column */}
          <div className="details-column">
            {selectedEmail ? (
              <div>
                <div className="tab-bar">
                  <button 
                    className={`tab-btn ${detailTab === "ai" ? "active" : ""}`}
                    onClick={() => setDetailTab("ai")}
                  >
                    Gemini Workspace Intel
                  </button>
                  <button 
                    className={`tab-btn ${detailTab === "original" ? "active" : ""}`}
                    onClick={() => setDetailTab("original")}
                  >
                    Original Message
                  </button>
                </div>
                
                {detailTab === "ai" ? (
                  <div>
                    <div className="mail-header">
                      <h1 className="mail-subject">{selectedEmail.subject}</h1>
                      <div className="mail-meta">
                        <span style={{ color: "var(--text-secondary)" }}>
                          From: <strong style={{ color: "#ffffff" }}>{selectedEmail.sender}</strong>
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>{new Date(selectedEmail.date).toLocaleString()}</span>
                      </div>
                    </div>
                    
                    {/* Advanced AI Summary Card */}
                    <div className="cognitive-doc">
                      <div className="doc-section-title">
                        <Sparkles size={14} />
                        <span>Cognitive Summary</span>
                      </div>
                      
                      <div className="ai-summary-text">
                        {selectedEmail.summary ? (
                          <div>
                            <p style={{ fontWeight: "700", marginBottom: "0.75rem", color: "#ffffff", fontSize: "0.95rem" }}>
                              {selectedEmail.summary.shortSummary}
                            </p>
                            <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                              {selectedEmail.summary.detailedSummary}
                            </p>
                          </div>
                        ) : (
                          <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                            AI Summary skipped (identified duplicate newsletter).
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* Action Checklist */}
                    {selectedEmail.summary && JSON.parse(selectedEmail.summary.actionItems).length > 0 && (
                      <div className="cognitive-doc">
                        <div className="doc-section-title">
                          <CheckSquare size={14} />
                          <span>Actionable Checklist</span>
                        </div>
                        
                        <div className="checklist">
                          {(JSON.parse(selectedEmail.summary.actionItems) as string[]).map((action, idx) => {
                            const itemKey = `${selectedEmail.id}-${idx}`;
                            const isChecked = !!checkedItems[itemKey];
                            return (
                              <div 
                                key={idx} 
                                className="checklist-item"
                                onClick={() => setCheckedItems(prev => ({ ...prev, [itemKey]: !prev[itemKey] }))}
                                style={{
                                  opacity: isChecked ? 0.55 : 1,
                                  textDecoration: isChecked ? "line-through" : "none"
                                }}
                              >
                                <div className={`checkbox-bullet ${isChecked ? "checked" : ""}`}>
                                  {isChecked && <ChevronRight size={10} style={{ color: "#ffffff" }} />}
                                </div>
                                <span>{action}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* Reply Assistant Box */}
                    {!selectedEmail.isDuplicate && (
                      <div className="composer-box">
                        <div className="doc-section-title" style={{ color: "#ffffff" }}>
                          <Reply size={14} />
                          <span>AI Drafting Assistant</span>
                        </div>
                        
                        {/* Direct instruction template chips */}
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", margin: "0.2rem 0 0.6rem 0" }}>
                          {[
                            { label: "Politely Decline", text: "Politely decline the offer" },
                            { label: "Confirm Meeting", text: "Accept and confirm the proposed meeting time" },
                            { label: "Request More Details", text: "Ask for more detailed context on this topic" },
                            { label: "Acknowledge Receipt", text: "Acknowledge that I received this and am looking into it" }
                          ].map((tmpl) => (
                            <button
                              key={tmpl.label}
                              className="template-pill"
                              style={{
                                background: "rgba(255, 255, 255, 0.03)",
                                border: "1px solid var(--border-color)",
                                borderRadius: "99px",
                                padding: "0.3rem 0.65rem",
                                fontSize: "0.72rem",
                                color: "var(--text-secondary)"
                              }}
                              onClick={() => setReplyInstruction(tmpl.text)}
                            >
                              {tmpl.label}
                            </button>
                          ))}
                        </div>
                        
                        <div className="composer-input-row">
                          <input 
                            type="text" 
                            className="composer-input" 
                            placeholder="State instructions (e.g. 'Say yes', 'Ask to postpone', 'Politely decline')"
                            value={replyInstruction}
                            onChange={(e) => setReplyInstruction(e.target.value)}
                          />
                          <button 
                            className="btn-ai"
                            style={{ padding: "0.5rem 1.25rem", fontSize: "0.82rem" }}
                            onClick={handleGenerateDraft}
                            disabled={isDrafting || !replyInstruction.trim()}
                          >
                            {isDrafting ? "Drafting..." : "Compose"}
                          </button>
                        </div>

                        {replyStatus && (
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                            {replyStatus}
                          </div>
                        )}
                        
                        {aiDraft && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
                            <textarea 
                              className="draft-area" 
                              style={{ width: "100%", minHeight: "120px", borderRadius: "8px", padding: "0.75rem", fontSize: "0.85rem", background: "rgba(255,255,255,0.01)", color: "var(--text-primary)", border: "1px solid var(--border-color)", outline: "none", resize: "vertical" }}
                              value={aiDraft}
                              onChange={(e) => setAiDraft(e.target.value)}
                            />
                            <button 
                              className="btn-primary" 
                              style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem", fontSize: "0.82rem" }}
                              onClick={handleSendReply}
                              disabled={isSendingReply}
                            >
                              <Send size={12} />
                              <span>{isSendingReply ? "Sending..." : "Send Reply"}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="mail-header">
                      <h1 className="mail-subject">{selectedEmail.subject}</h1>
                      <div className="mail-meta">
                        <span>From: <strong>{selectedEmail.sender}</strong></span>
                        <span style={{ color: "var(--text-muted)" }}>{new Date(selectedEmail.date).toLocaleString()}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: "1.7", whiteSpace: "pre-wrap", background: "rgba(255,255,255,0.015)", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                      {selectedEmail.bodyContent}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flex: 1, height: "100%", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                Select a message to open context panels.
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Gemini Chat panel */}
      <div className="chat-column glass-panel">
        <div className="chat-title-row">
          <MessageSquare size={16} />
          <span>Gemini Copilot</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.72rem", color: "var(--text-muted)" }}>
            <span className="status-dot"></span>
            Online
          </span>
        </div>
        
        <div className="chat-pane-messages">
          {chatMessages.map((msg, idx) => (
            <div key={idx} className={`message-bubble slide-in ${msg.role}`}>
              {msg.content}
            </div>
          ))}
          {isChatLoading && (
            <div className="message-bubble assistant slide-in" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div className="loader"></div>
              <span>Processing...</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        
        {chatMessages.length === 1 && (
          <div style={{ padding: "0 1.25rem", display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.5rem" }}>
            {suggestions.map((sug, idx) => (
              <button 
                key={idx} 
                className="suggestion-card"
                onClick={() => handleSendChat(sug.title)}
              >
                <div className="suggestion-card-title">{sug.title}</div>
                <div className="suggestion-card-desc">{sug.desc}</div>
              </button>
            ))}
          </div>
        )}
        
        <div className="chat-bottom-bar">
          <form 
            className="chat-input-row" 
            onSubmit={(e) => {
              e.preventDefault();
              handleSendChat(chatInput);
              setChatInput("");
            }}
          >
            <input 
              type="text" 
              className="chat-box-input" 
              placeholder="Query mailbox..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={isChatLoading}
            />
            <button type="submit" className="chat-send-btn" disabled={isChatLoading}>
              <Send size={14} />
            </button>
          </form>
        </div>
      </div>
      {isCleanModalOpen && (
        <div className="modal-overlay" onClick={() => !isCleaning && setIsCleanModalOpen(false)}>
          <div className="modal-box glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <Trash2 size={20} style={{ color: "var(--google-red)", marginTop: "-2px" }} />
              <div className="modal-title">Storage Saver Agent</div>
            </div>
            
            {!cleanResult ? (
              <>
                <p className="modal-desc">
                  Select which types of emails the cognitive agent should move to the Gmail Trash folder. This action helps free up space on your Google account.
                </p>
                
                <div className="strategy-options">
                  <div 
                    className={`strategy-row ${cleanStrategy === "both" ? "active" : ""}`}
                    onClick={() => setCleanStrategy("both")}
                  >
                    <div className="radio-dot">
                      <div className="radio-dot-inner" />
                    </div>
                    <div className="strategy-info">
                      <span className="strategy-name">Trash Duplicates & Promotions (Recommended)</span>
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
                    <Trash2 size={14} className={isCleaning ? "animate-spin" : ""} />
                    <span>{isCleaning ? "Cleaning Inbox..." : "Confirm & Run"}</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="clean-success-banner">
                  <div className="clean-success-title">
                    <CheckSquare size={16} />
                    <span>Cleanup Completed Successfully!</span>
                  </div>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                    The Storage Saver Agent has finished trashing matching messages.
                  </p>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", padding: "0 0.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                    <span style={{ color: "var(--text-secondary)", flex: 1 }}>Emails Trashed:</span>
                    <strong style={{ color: "#ffffff" }}>{cleanResult.trashedCount} messages</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                    <span style={{ color: "var(--text-secondary)", flex: 1 }}>Estimated Storage Freed:</span>
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
