"use client";

import { useState, useRef, useEffect } from "react";
import { ExplanationContent } from "./explanation-content";

export interface ToolCallItem {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallItem[];
  timestamp: string;
}

interface ChatPanelProps {
  analysisId?: string;
  selectedFilePath: string | null;
  selectedNodeId: string | null;
  allFilePaths: string[];
  onSelectFile?: (filePath: string) => void;
  onExitAskMode: () => void;
}

const SUGGESTIONS = [
  "Where is authentication handled?",
  "What breaks if I change this file?",
  "Show declared HTTP routes",
  "Is this code any good?",
];

export function ChatPanel({
  analysisId,
  selectedFilePath,
  selectedNodeId,
  allFilePaths,
  onSelectFile,
  onExitAskMode,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallItem[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [expandedToolIndex, setExpandedToolIndex] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, activeToolCalls]);

  const selectedContext = selectedFilePath
    ? { type: "file" as const, path: selectedFilePath }
    : selectedNodeId
    ? { type: "folder" as const, path: selectedNodeId }
    : null;

  const handleSubmit = async (textToSend?: string) => {
    const question = (textToSend || input).trim();
    if (!question || isStreaming || !analysisId) return;

    setInput("");
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setActiveToolCalls([]);
    setStreamingText("");

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          message: question,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          selectedContext,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Agent request failed: HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      let finalFullText = "";
      let finalTools: ToolCallItem[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          if (!block.trim()) continue;
          const matchEvent = block.match(/^event:\s*(\w+)/m);
          const matchData = block.match(/^data:\s*(.+)$/m);

          if (!matchEvent || !matchData) continue;
          const eventType = matchEvent[1];
          const data = JSON.parse(matchData[1]);

          if (eventType === "tool_call") {
            setActiveToolCalls((prev) => [...prev, { name: data.name, args: data.args }]);
          } else if (eventType === "tool_result") {
            setActiveToolCalls((prev) =>
              prev.map((t) => (t.name === data.name && !t.result ? { ...t, result: data.result } : t))
            );
          } else if (eventType === "text") {
            setStreamingText((prev) => prev + data.text);
            finalFullText += data.text;
          } else if (eventType === "done") {
            finalFullText = data.fullText || finalFullText;
            finalTools = data.toolCalls || [];
          } else if (eventType === "error") {
            throw new Error(data.error);
          }
        }
      }

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: finalFullText || "No response received.",
        toolCalls: finalTools.length > 0 ? finalTools : activeToolCalls,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `Agent error: ${msg}. If the standalone agent service is stopped, you can restart it or continue browsing the map.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsStreaming(false);
      setActiveToolCalls([]);
      setStreamingText("");
    }
  };

  return (
    <div className="flex h-full flex-col font-mono text-xs select-none">
      {/* Header bar: Scope & Exit Ask Mode */}
      <div className="flex h-10 items-center justify-between border-b border-border bg-surface px-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          <span className="font-semibold text-foreground">Ask Assistant</span>
          <span className="rounded bg-accent/15 px-1 py-0.2 text-[9px] text-accent border border-accent/30 font-bold">
            AGENT
          </span>
        </div>
        <button
          type="button"
          onClick={onExitAskMode}
          className="text-[11px] text-muted hover:text-foreground cursor-pointer px-1.5 py-0.5 rounded hover:bg-surface-raised transition-colors"
          title="Return to Inspect pane"
        >
          Exit Ask ✕
        </button>
      </div>

      {/* Selected context banner */}
      {selectedContext && (
        <div className="border-b border-border/80 bg-surface-raised/60 px-3 py-1.5 text-[10px] text-muted flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1 truncate pr-2">
            <span className="uppercase font-semibold tracking-wider text-[9px]">Context:</span>
            <span className="font-bold text-foreground truncate">{selectedContext.path}</span>
          </div>
          <span className="text-[9px] text-accent shrink-0">in-scope</span>
        </div>
      )}

      {/* Message conversation scroll area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {messages.length === 0 && (
          <div className="rounded border border-border/70 bg-surface-raised/30 p-4 space-y-3">
            <div className="text-xs font-bold text-foreground">Ask the repository a question</div>
            <p className="text-[11px] text-muted leading-relaxed">
              The agent explores the graph using 6 deterministic tools (summary, path search, roles, neighbours, transitive walk, and routes).
            </p>
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] uppercase font-semibold text-muted tracking-wider block">
                Try asking:
              </span>
              {SUGGESTIONS.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSubmit(s)}
                  className="w-full text-left rounded border border-border/80 bg-surface-raised/80 hover:bg-surface-raised hover:border-accent/60 p-2 text-[11px] text-foreground/90 cursor-pointer transition-colors"
                >
                  &ldquo;{s}&rdquo;
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, msgIdx) => (
          <div
            key={m.id}
            className={`space-y-1.5 ${
              m.role === "user" ? "ml-4" : "mr-2"
            }`}
          >
            <div className="flex items-center justify-between text-[10px] text-muted px-1">
              <span className="font-semibold text-foreground/80">
                {m.role === "user" ? "You" : "Agent"}
              </span>
              <span>{m.timestamp}</span>
            </div>

            {/* Tool Calls Accordion (Spec: showing each tool call as it happens, visible above answer) */}
            {m.toolCalls && m.toolCalls.length > 0 && (
              <div className="space-y-1 my-1.5">
                {m.toolCalls.map((tc, tcIdx) => {
                  const isExpanded = expandedToolIndex === tcIdx;
                  return (
                    <div
                      key={tcIdx}
                      className="rounded border border-border/70 bg-surface-raised/50 text-[10px] overflow-hidden"
                    >
                      <div
                        onClick={() => setExpandedToolIndex(isExpanded ? null : tcIdx)}
                        className="flex items-center justify-between p-1.5 cursor-pointer hover:bg-surface-raised select-none transition-colors"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-accent font-bold">⚙</span>
                          <span className="font-mono font-semibold text-foreground">{tc.name}</span>
                          <span className="text-muted truncate max-w-[120px]">
                            {JSON.stringify(tc.args)}
                          </span>
                        </div>
                        <span className="text-[9px] text-muted">{isExpanded ? "▲" : "▼"}</span>
                      </div>
                      {isExpanded && tc.result !== undefined && (
                        <div className="border-t border-border/60 p-2 bg-background font-mono text-[9px] text-foreground/80 overflow-x-auto max-h-40">
                          <pre>{JSON.stringify(tc.result, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Message Body */}
            <div
              className={`rounded p-3 text-xs leading-relaxed ${
                m.role === "user"
                  ? "bg-accent/15 border border-accent/30 text-foreground"
                  : "bg-surface-raised border border-border text-foreground/90"
              }`}
            >
              {m.role === "user" ? (
                <span>{m.content}</span>
              ) : (
                <ExplanationContent
                  content={m.content}
                  allFilePaths={allFilePaths}
                  onSelectFile={onSelectFile}
                />
              )}
            </div>
          </div>
        ))}

        {/* Live Streaming State with Active Tool Calls */}
        {isStreaming && (
          <div className="mr-2 space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] text-muted px-1">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
              <span>Agent is looking up answer...</span>
            </div>

            {/* Active tool calls appearing in real time */}
            {activeToolCalls.length > 0 && (
              <div className="space-y-1">
                {activeToolCalls.map((tc, tcIdx) => (
                  <div
                    key={tcIdx}
                    className="flex items-center justify-between rounded border border-accent/40 bg-accent/5 p-1.5 text-[10px]"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-accent">⚙</span>
                      <span className="font-bold text-foreground">{tc.name}</span>
                      <span className="text-muted truncate max-w-[120px]">
                        {JSON.stringify(tc.args)}
                      </span>
                    </div>
                    <span className="text-[9px] text-accent font-semibold">
                      {tc.result !== undefined ? "✓ done" : "executing..."}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Streaming text */}
            {streamingText && (
              <div className="rounded border border-border bg-surface-raised p-3 text-xs leading-relaxed text-foreground/90">
                <ExplanationContent
                  content={streamingText}
                  allFilePaths={allFilePaths}
                  onSelectFile={onSelectFile}
                />
              </div>
            )}
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-border bg-surface p-2.5 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex items-center gap-1.5"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isStreaming}
            placeholder="Ask about this repo..."
            className="flex-1 rounded border border-border bg-surface-raised px-2.5 py-1.5 text-xs text-foreground focus:outline-hidden font-mono disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50 cursor-pointer transition-colors shrink-0"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}