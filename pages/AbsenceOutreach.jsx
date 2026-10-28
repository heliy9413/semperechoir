import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import ReactMarkdown from "react-markdown";
import { Send, Loader2, MessageSquarePlus, PhoneOutgoing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const AGENT_NAME = "absence_outreach";

const SUGGESTIONS = [
  "ለህዳር ወር የጠፉ አባላትን አሳየኝ / Show me members absent this month",
  "ተከታታይ ሁለት ጊዜ የጠፉ አባላት ማን ናቸው? / Who has 2+ consecutive absences?",
  "የእለቱ የረቡዕ ፕሮግራም ጠፍቶታል — ተከታታይ አባላትን እና የመከታተል መልዕክት አዘጋጅልኝ",
];

function FunctionChip({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const status = toolCall.status || "";
  const isFailed = ["failed", "error"].includes(status);
  const label = toolCall?.display_projection?.label || toolCall.name || "tool";
  const activeLabel = toolCall?.display_projection?.active_label || "Running…";
  const errorLabel = toolCall?.display_projection?.error_label || "Failed";
  const hideDetails = toolCall?.display_projection?.hide_details && toolCall?.display_projection?.details_redacted;

  let parsed;
  try { parsed = JSON.parse(toolCall.results); } catch { parsed = toolCall.results; }
  let args = toolCall.arguments_string;
  try { args = JSON.stringify(JSON.parse(toolCall.arguments_string), null, 2); } catch {}

  if (hideDetails) {
    return (
      <div className="mt-1.5 text-[11px] text-slate-500">
        {isFailed ? errorLabel : ["pending", "running", "in_progress"].includes(status) ? activeLabel : label}
      </div>
    );
  }

  return (
    <div className="mt-2 text-[11px]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${isFailed ? "bg-red-500" : ["pending", "running", "in_progress"].includes(status) ? "bg-amber-400 animate-pulse" : "bg-emerald-500"}`} />
        <span className="font-mono">{label}</span>
        <span className="text-slate-400">{isFailed ? errorLabel : status === "success" || status === "completed" ? "done" : "…"}</span>
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
          {toolCall.arguments_string && (
            <div>
              <p className="font-semibold text-slate-600">Parameters</p>
              <pre className="whitespace-pre-wrap break-words text-[10px] text-slate-500">{args}</pre>
            </div>
          )}
          {toolCall.results != null && (
            <div>
              <p className="font-semibold text-slate-600">Result</p>
              <pre className="whitespace-pre-wrap break-words text-[10px] text-slate-500">{typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${isUser ? "bg-navy text-white" : "bg-white border border-slate-200 text-slate-800"}`}>
        {message.content && (isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        ))}
        {message.tool_calls?.map((tc, i) => <FunctionChip key={i} toolCall={tc} />)}
      </div>
    </div>
  );
}

export default function AbsenceOutreach() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const scrollRef = useRef(null);

  const loadList = async () => {
    try {
      const list = await base44.agents.listConversations({ agent_name: AGENT_NAME });
      setConversations(list || []);
    } catch { setConversations([]); }
    setLoadingList(false);
  };

  useEffect(() => { loadList(); }, []);

  const openConv = async (conv) => {
    setActiveId(conv.id);
    setActiveConv(conv);
    setMessages(conv.messages || []);
  };

  const startNew = async () => {
    const conv = await base44.agents.createConversation({ agent_name: AGENT_NAME, metadata: { name: "Absence Outreach", description: "Follow-up for missed meetings" } });
    setActiveId(conv.id);
    setActiveConv(conv);
    setMessages([]);
    loadList();
  };

  useEffect(() => {
    if (!activeId) return;
    const unsub = base44.agents.subscribeToConversation(activeId, (data) => {
      setMessages(data.messages || []);
      setActiveConv((c) => (c ? { ...c, messages: data.messages } : c));
    });
    return () => unsub && unsub();
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current?.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || !activeConv || sending) return;
    setInput("");
    setSending(true);
    try {
      await base44.agents.addMessage(activeConv, { role: "user", content });
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="grid place-items-center h-11 w-11 rounded-xl bg-gold/15 text-gold-dark">
          <PhoneOutgoing size={22} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-navy">Absence Outreach Assistant</h1>
          <p className="text-sm text-slate-500">የጠፉ አባላትን ይከታተሉ · Pastoral follow-up for missed meetings</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[260px_1fr] gap-4 h-[70vh] min-h-[480px]">
        {/* Conversation list */}
        <div className="border border-slate-200 rounded-xl bg-white p-3 overflow-y-auto">
          <Button onClick={startNew} variant="outline" size="sm" className="w-full mb-3 border-navy/30 text-navy">
            <MessageSquarePlus size={16} /> New conversation
          </Button>
          {loadingList ? (
            <p className="text-xs text-slate-400 text-center py-4">Loading…</p>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No conversations yet.</p>
          ) : (
            <div className="space-y-1">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openConv(c)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-xs transition ${activeId === c.id ? "bg-gold/15 text-navy font-medium" : "hover:bg-slate-50 text-slate-600"}`}
                >
                  <p className="truncate">{c.metadata?.name || "Outreach chat"}</p>
                  <p className="text-[10px] text-slate-400">{c.messages?.length || 0} messages</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chat panel */}
        <div className="flex flex-col border border-slate-200 rounded-xl bg-white overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {!activeConv ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-6">
                <PhoneOutgoing size={28} className="text-slate-300" />
                <p className="text-sm text-slate-500">Start a conversation to identify absent members and draft follow-up messages.</p>
                <Button onClick={startNew} className="bg-navy text-white"><MessageSquarePlus size={16} /> Start</Button>
              </div>
            ) : messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">Ask the assistant about recent absences. Try:</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="text-left text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-gold/50 hover:bg-gold/5 text-slate-700">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => <MessageBubble key={i} message={m} />)
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3"><Loader2 size={16} className="animate-spin text-slate-400" /></div>
              </div>
            )}
          </div>
          <div className="border-t border-slate-200 p-3 flex items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="መልዕክት ይጻፉ… / Type your message…"
              disabled={!activeConv}
            />
            <Button onClick={() => send()} disabled={!activeConv || sending || !input.trim()} className="bg-navy text-white">
              <Send size={16} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}