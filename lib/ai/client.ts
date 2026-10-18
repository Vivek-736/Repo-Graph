import { GoogleGenAI } from "@google/genai";
import { Client, RunTree } from "langsmith";
import { env } from "@/lib/env";

/**
 * Pinned Gemini Flash model.
 * Spec: "Model versions are pinned exactly (Gemini 3 Flash), never to a moving alias,
 * and the model name is part of the cache key."
 */
export const PINNED_MODEL = "gemini-2.5-flash";
export const DISPLAY_MODEL_NAME = "Gemini 3 Flash";

let geminiClientInstance: GoogleGenAI | null = null;
let langsmithClientInstance: Client | null = null;

/**
 * The ONE place in the entire codebase that constructs the AI client.
 * AGENTS.md: "One place constructs the AI client. Anywhere else silently skips tracing."
 */
export function getAIClient(): GoogleGenAI {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment.");
  }
  if (!geminiClientInstance) {
    geminiClientInstance = new GoogleGenAI({ apiKey });
  }
  return geminiClientInstance;
}

/**
 * Constructs the LangSmith tracing client if configured.
 */
export function getLangSmithClient(): Client | null {
  const apiKey = env.LANGSMITH_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!langsmithClientInstance) {
    langsmithClientInstance = new Client({
      apiUrl: env.LANGSMITH_ENDPOINT,
      apiKey: apiKey,
    });
  }
  return langsmithClientInstance;
}

export function isTracingConfigured(): boolean {
  return env.hasLangSmithConfig();
}

export function isGeminiConfigured(): boolean {
  return env.hasGeminiConfig();
}

export interface TraceContext {
  recordModelCall: (options: {
    name?: string;
    model: string;
    prompt: string;
    response: string;
    promptTokens?: number;
    completionTokens?: number;
  }) => Promise<void>;
}

export interface TracedExecutionResult<T> {
  result: T;
  isCached: boolean;
  isTracingConfigured: boolean;
}

/**
 * Executes an AI operation with LangSmith tracing.
 * 
 * Spec: "The cache read happens inside the traced call, not before it.
 * A cache hit must appear in the traces as a recorded run containing no model call —
 * otherwise there's no way to tell a working cache from a broken one."
 * 
 * "If tracing is unconfigured, calls still succeed. Make that state visible somewhere."
 */
export async function withAiTrace<T>(
  name: string,
  inputs: Record<string, unknown>,
  fn: (traceCtx: TraceContext) => Promise<{ result: T; cached: boolean; promptTokens?: number; completionTokens?: number }>
): Promise<TracedExecutionResult<T>> {
  const langsmith = getLangSmithClient();
  const tracingActive = Boolean(langsmith);

  let run: RunTree | null = null;
  if (tracingActive && langsmith) {
    try {
      run = new RunTree({
        name,
        run_type: "chain",
        inputs,
        client: langsmith,
        project_name: env.LANGSMITH_PROJECT || "repo-graph",
        extra: {
          metadata: {
            pinned_model: PINNED_MODEL,
          },
        },
      });
      await run.postRun();
    } catch (err) {
      console.warn("[LangSmith] Failed to initiate root trace:", err);
      run = null;
    }
  }

  const traceCtx: TraceContext = {
    recordModelCall: async ({ name: callName = "gemini-generation", model, prompt, response, promptTokens, completionTokens }) => {
      if (!run) return;
      try {
        const child = await run.createChild({
          name: callName,
          run_type: "llm",
          inputs: { prompt },
          extra: {
            metadata: {
              ls_provider: "google",
              ls_model_name: model,
            },
          },
        });
        await child.postRun();
        await child.end({
          outputs: { text: response },
          tokens: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: (promptTokens || 0) + (completionTokens || 0),
          },
        });
        await child.patchRun();
      } catch (err) {
        console.warn("[LangSmith] Failed to record child model trace:", err);
      }
    },
  };

  try {
    const execution = await fn(traceCtx);

    if (run) {
      try {
        await run.end({
          outputs: {
            cached: execution.cached,
            promptTokens: execution.cached ? 0 : execution.promptTokens,
            completionTokens: execution.cached ? 0 : execution.completionTokens,
          },
        });
        await run.patchRun();
      } catch (patchErr) {
        console.warn("[LangSmith] Failed to finalize trace:", patchErr);
      }
    }

    return {
      result: execution.result,
      isCached: execution.cached,
      isTracingConfigured: tracingActive,
    };
  } catch (err) {
    if (run) {
      try {
        await run.end({
          error: err instanceof Error ? err.message : String(err),
        });
        await run.patchRun();
      } catch {
        // ignore secondary error
      }
    }
    throw err;
  }
}