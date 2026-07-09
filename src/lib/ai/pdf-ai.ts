import { isOllamaAvailable, ollamaChat, type OllamaMessage } from "@/lib/ai/ollama-client";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_DOC_CHARS = 48_000;

function trimDocumentText(documentText: string): string {
  if (documentText.length <= MAX_DOC_CHARS) return documentText;

  const head = documentText.slice(0, MAX_DOC_CHARS * 0.6);
  const tail = documentText.slice(-MAX_DOC_CHARS * 0.35);
  return `${head}\n\n[… middle section omitted for length …]\n\n${tail}`;
}

function setupHint(): string {
  return (
    "Install Ollama (free, local): curl -fsSL https://ollama.com/install.sh | sh && " +
    "ollama pull llama3.2 && sudo systemctl enable --now ollama"
  );
}

function demoChatResponse(documentText: string, question: string): string {
  const preview = documentText.slice(0, 400).replace(/\s+/g, " ");
  return (
    `[Ollama not running]\n\n${setupHint()}\n\n` +
    `Document preview (${documentText.length.toLocaleString()} chars): "${preview}…"\n\n` +
    `Question: ${question}`
  );
}

function demoTemplateResponse(prompt: string): string {
  return (
    `[Ollama not running]\n\n${setupHint()}\n\n` +
    `Prompt: "${prompt}"\n\n---\n\nDocument Title\n\nDate: ___________\n\n` +
    `[Generated content will appear here once Ollama is running.]`
  );
}

export async function chatWithPdf(
  documentText: string,
  question: string,
  history: ChatMessage[] = []
): Promise<string> {
  const doc = trimDocumentText(documentText);

  if (!(await isOllamaAvailable())) {
    return demoChatResponse(doc, question);
  }

  const messages: OllamaMessage[] = [
    {
      role: "system",
      content:
        "You are a helpful assistant that answers questions about PDF documents. " +
        "Use only the provided document content. If the answer is not in the document, say so. " +
        "Be concise and cite page markers (e.g. 'Page 2') when relevant. " +
        "Respond in the same language as the user's question when possible.",
    },
    {
      role: "user",
      content: `Document content:\n\n${doc}`,
    },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: question },
  ];

  return ollamaChat(messages, { maxTokens: 800, temperature: 0.3 });
}

export async function generateTemplate(prompt: string): Promise<string> {
  if (!(await isOllamaAvailable())) {
    return demoTemplateResponse(prompt);
  }

  const messages: OllamaMessage[] = [
    {
      role: "system",
      content:
        "Generate professional document content based on the user prompt. " +
        "Output plain text with clear headings and sections, suitable for export as a PDF. " +
        "Use the same language as the user's prompt. Include placeholders like [Name] where useful.",
    },
    { role: "user", content: prompt },
  ];

  return ollamaChat(messages, { maxTokens: 1500, temperature: 0.5 });
}

export async function isAiConfigured(): Promise<boolean> {
  return isOllamaAvailable();
}
