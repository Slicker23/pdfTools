import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { checkAiCredits, incrementAiCredits } from "@/lib/usage";
import { chatWithPdf, generateTemplate, type ChatMessage } from "@/lib/ai/pdf-ai";
import { isOllamaAvailable, getOllamaConfig } from "@/lib/ai/ollama-client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const check = await checkAiCredits(session.user.id);
  const ollama = await isOllamaAvailable();
  const { model } = getOllamaConfig();

  return NextResponse.json({
    authenticated: true,
    paid: session.user.paid,
    allowed: check.allowed,
    remaining: check.remaining ?? 0,
    reason: check.reason,
    requiresPayment: check.requiresPayment,
    ollamaAvailable: ollama,
    ollamaModel: model,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const check = await checkAiCredits(session.user.id);
  if (!check.allowed) {
    return NextResponse.json(check, { status: 403 });
  }

  const body = await request.json();
  const { action, text, prompt, messages } = body as {
    action: string;
    text?: string;
    prompt?: string;
    messages?: ChatMessage[];
  };

  try {
    if (action === "chat") {
      if (!text?.trim()) {
        return NextResponse.json({ error: "Document text required" }, { status: 400 });
      }
      if (!prompt?.trim()) {
        return NextResponse.json({ error: "Question required" }, { status: 400 });
      }

      const history = Array.isArray(messages) ? messages.slice(-8) : [];
      const response = await chatWithPdf(text, prompt, history);
      await incrementAiCredits(session.user.id);

      const after = await checkAiCredits(session.user.id);
      return NextResponse.json({
        response,
        remaining: after.remaining ?? 0,
      });
    }

    if (action === "template") {
      if (!prompt?.trim()) {
        return NextResponse.json({ error: "Prompt required" }, { status: 400 });
      }

      const content = await generateTemplate(prompt);
      await incrementAiCredits(session.user.id);

      const after = await checkAiCredits(session.user.id);
      return NextResponse.json({
        content,
        remaining: after.remaining ?? 0,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
