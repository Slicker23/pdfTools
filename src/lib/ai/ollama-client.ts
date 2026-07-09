/** Local Ollama client — free, no API key, runs on your machine. */

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function getOllamaConfig() {
  return {
    baseUrl: (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, ""),
    model: process.env.OLLAMA_MODEL ?? "llama3.2",
  };
}

export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const { baseUrl } = getOllamaConfig();
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ollamaChat(
  messages: OllamaMessage[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const { baseUrl, model } = getOllamaConfig();

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        num_predict: options?.maxTokens ?? 800,
        temperature: options?.temperature ?? 0.3,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    if (res.status === 404 && err.includes("not found")) {
      throw new Error(
        `Model "${model}" is not installed. Run: ollama pull ${model}`
      );
    }
    throw new Error(
      `Ollama unavailable (${res.status}). Is it running? Try: systemctl start ollama`
    );
  }

  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content?.trim();
  if (!content) throw new Error("Ollama returned an empty response.");
  return content;
}
