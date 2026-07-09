"use client";

import { useState } from "react";
import { Loader2, Send, User, Bot } from "lucide-react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import { AiGate, AiCreditsBanner, useAiCredits } from "@/components/tools/ai-gate";
import { Button } from "@/components/ui/button";
import { extractPdfText, textToPdf, downloadPdf } from "@/lib/pdf";
import { downloadBlob } from "@/lib/utils";
import type { ChatMessage } from "@/lib/ai/pdf-ai";

interface AiChatToolProps {
  mode?: "chat" | "template";
}

const CHAT_SUGGESTIONS = [
  "Summarize this document in 5 bullet points",
  "What are the key dates and deadlines?",
  "List all names, organizations, and contact details",
  "What action items or next steps are mentioned?",
];

const TEMPLATE_SUGGESTIONS = [
  "Professional CV for a software engineer with 5 years experience",
  "Invoice template for freelance consulting services",
  "Meeting minutes template with agenda and action items",
  "One-page business proposal outline",
];

export function AiChatTool({ mode = "chat" }: AiChatToolProps) {
  return (
    <AiGate>
      <AiChatInner mode={mode} />
    </AiGate>
  );
}

function AiChatInner({ mode }: { mode: "chat" | "template" }) {
  const { remaining, loading: creditsLoading, refresh: refreshCredits, ollamaAvailable, ollamaModel } = useAiCredits();
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [docText, setDocText] = useState("");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [lastTemplate, setLastTemplate] = useState("");

  const suggestions = mode === "template" ? TEMPLATE_SUGGESTIONS : CHAT_SUGGESTIONS;

  const askAi = async (question?: string) => {
    const q = (question ?? prompt).trim();
    if (!q) return;

    setError(null);
    setLoading(true);
    setPrompt("");

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode === "template" ? "template" : "chat",
          text: docText,
          prompt: q,
          messages: mode === "chat" ? messages : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.requiresPayment) {
          throw new Error("Lifetime access required for AI tools.");
        }
        throw new Error(data.reason ?? data.error ?? "AI request failed");
      }

      if (mode === "template") {
        setLastTemplate(data.content ?? "");
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "user", content: q },
          { role: "assistant", content: data.response ?? "" },
        ]);
      }

      await refreshCredits();
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI request failed");
      if (!question) setPrompt(q);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <AiCreditsBanner
        remaining={remaining}
        loading={creditsLoading}
        ollamaAvailable={ollamaAvailable}
        ollamaModel={ollamaModel}
      />

      {mode === "chat" && (
        <ToolWorkspace
          toolId="chat-pdf"
          onProcess={async (files) => {
            setResult(null);
            setError(null);
            setMessages([]);
            const text = await extractPdfText(files[0]);
            setDocText(text.slice(0, 50000));
            const pdfjs = await import("@/lib/pdf/pdfjs-config").then((m) => m.initPdfJs());
            const pdf = await pdfjs.getDocument({ data: await files[0].arrayBuffer() }).promise;
            setPageCount(pdf.numPages);
            setResult(
              `Loaded ${pdf.numPages} page${pdf.numPages !== 1 ? "s" : ""} · ${text.length.toLocaleString()} characters`
            );
          }}
          processLabel="Extract text from PDF"
        >
          {result && <ResultBanner message={result} />}
          {docText && (
            <p className="text-sm text-muted">
              Document ready{pageCount ? ` (${pageCount} pages)` : ""}. Ask questions below — your
              PDF stays in the browser; only extracted text is sent to the AI.
            </p>
          )}
        </ToolWorkspace>
      )}

      {mode === "chat" && messages.length > 0 && (
        <div className="max-h-96 space-y-3 overflow-y-auto rounded-xl border border-border bg-white p-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100">
                  <Bot className="h-4 w-4 text-violet-700" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-primary text-white"
                    : "bg-slate-100 text-slate-900"
                }`}
              >
                {msg.content}
              </div>
              {msg.role === "user" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200">
                  <User className="h-4 w-4 text-slate-600" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Thinking…
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={loading || (mode === "chat" && !docText)}
            onClick={() => {
              setPrompt(s);
              void askAi(s);
            }}
            className="rounded-full border border-border bg-white px-3 py-1 text-xs text-muted transition hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {s.length > 48 ? `${s.slice(0, 48)}…` : s}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <textarea
          className="min-h-[80px] flex-1 rounded-lg border border-border px-3 py-2 text-sm"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void askAi();
            }
          }}
          placeholder={
            mode === "template"
              ? "Describe the document you want to generate…"
              : "Ask a question about your document…"
          }
        />
        <Button
          className="self-end"
          disabled={!prompt.trim() || loading || (mode === "chat" && !docText)}
          onClick={() => askAi()}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      {mode === "template" && lastTemplate && (
        <div className="space-y-2">
          <div className="rounded-lg bg-slate-50 p-4 text-sm whitespace-pre-wrap">
            {lastTemplate}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                const pdf = await textToPdf(lastTemplate);
                downloadPdf(pdf, "generated_document.pdf");
              }}
            >
              Download as PDF
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                downloadBlob(
                  new Blob([lastTemplate], { type: "text/plain" }),
                  "generated_document.txt"
                )
              }
            >
              Download as text
            </Button>
          </div>
        </div>
      )}

      {mode === "chat" && messages.length > 0 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const transcript = messages
              .map((m) => `${m.role === "user" ? "You" : "AI"}: ${m.content}`)
              .join("\n\n");
            downloadBlob(new Blob([transcript], { type: "text/plain" }), "chat_transcript.txt");
          }}
        >
          Download chat transcript
        </Button>
      )}
    </div>
  );
}
