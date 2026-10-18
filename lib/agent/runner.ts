import { getAIClient, PINNED_MODEL, withAiTrace } from "@/lib/ai/client";
import { Content, Part } from "@google/genai";
import { AGENT_FUNCTION_DECLARATIONS } from "./declarations";
import { verifyAnalysisToken } from "./credentials";
import {
  getAnalysisSummary,
  searchFilesByPath,
  listFilesByRole,
  getFileNeighbours,
  performTransitiveWalk,
  getRouteTable,
} from "./tools";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
  }>;
}

export type AgentStreamEvent =
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "text"; text: string }
  | {
      type: "done";
      fullText: string;
      toolCalls: Array<{
        name: string;
        args: Record<string, unknown>;
        result?: unknown;
      }>;
    }
  | { type: "error"; error: string };

const SYSTEM_INSTRUCTIONS = `You are the RepoGraph Codebase Assistant, an AI architect that inspects codebases strictly through deterministic graph tools.

RULES (MANDATORY):
1. MANDATORY LOOKUPS:
   Every question about the repository MUST be backed by at least one tool call before answering. Never answer about files or code without querying tools first.
2. NEVER INFER:
   Every file path, dependency, or relationship you state MUST have been returned by a tool in this session. If a search yields no results, say so clearly.
3. REFUSAL BEHAVIOUR:
   If the user asks subjective questions that cannot be answered from the structural graph (such as "is this code any good?", "how would you rate this code?", "give me quality scores", or "issues found"), you MUST politely decline and state what you CAN answer instead: dependency chains, blast radius, callers, routes, and structural roles.
4. PRONOUN & CONTEXT RESOLUTION:
   If the user says "what breaks if I change that?" or "what depends on it?", resolve "that" to the file mentioned in the previous turn or the currently selected file.
5. FORMATTING:
   - When referring to repository file paths, always wrap them in inline backticks: \`path/to/file.ts\`.
   - Keep answers dense, factual, and concise.`;

/**
 * Executes a tool locally using the verified credential token.
 * Prevents any possibility of the model overriding or forging the target analysis.
 */
async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  token: string,
) {
  const credential = verifyAnalysisToken(token);
  if (!credential) {
    throw new Error(
      "Invalid or expired session token for agent tool execution.",
    );
  }

  const { analysisId, orgId } = credential;

  switch (name) {
    case "get_analysis_summary":
      return await getAnalysisSummary(analysisId, orgId);

    case "search_files_by_path":
      return await searchFilesByPath(
        analysisId,
        orgId,
        String(args.query || ""),
      );

    case "list_files_by_role":
      return await listFilesByRole(analysisId, orgId, String(args.role || ""));

    case "get_file_neighbours":
      return await getFileNeighbours(
        analysisId,
        orgId,
        String(args.filePath || ""),
      );

    case "transitive_walk":
      return await performTransitiveWalk(
        analysisId,
        orgId,
        String(args.filePath || ""),
        (args.direction as "upstream" | "downstream") || "upstream",
        typeof args.depth === "number" ? args.depth : 2,
      );

    case "get_route_table":
      return await getRouteTable(
        analysisId,
        orgId,
        args.filter ? String(args.filter) : undefined,
      );

    default:
      throw new Error(`Unknown tool requested: ${name}`);
  }
}

/**
 * Runs the agent conversation turn with tool calling and LangSmith tracing.
 */
export async function runAgentConversation(
  message: string,
  history: ChatMessage[],
  credentialToken: string,
  selectedContext: { type: "file" | "folder"; path: string } | null,
  onEvent: (event: AgentStreamEvent) => void,
) {
  const ai = getAIClient();

  // Format context for selected item if present
  let augmentedPrompt = message;
  if (selectedContext) {
    augmentedPrompt = `[Context: The user is currently looking at ${selectedContext.type} '${selectedContext.path}' on the canvas]\n\n${message}`;
  }

  // Build Gemini contents history
  const contents: Content[] = [];

  for (const h of history.slice(-6)) {
    contents.push({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    });
  }

  contents.push({
    role: "user",
    parts: [{ text: augmentedPrompt }],
  });

  const toolCallsSummary: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
  }> = [];
  let fullAnswer = "";

  await withAiTrace(
    "agent-turn",
    { message, historyLength: history.length, selectedContext },
    async (traceCtx) => {
      let promptTokens = 0;
      let completionTokens = 0;

      // Tool-calling loop (up to 5 turns)
      for (let turn = 0; turn < 5; turn++) {
        const response = await ai.models.generateContent({
          model: PINNED_MODEL,
          contents,
          config: {
            systemInstruction: SYSTEM_INSTRUCTIONS,
            temperature: 0.1,
            tools: [{ functionDeclarations: AGENT_FUNCTION_DECLARATIONS }],
          },
        });

        promptTokens += response.usageMetadata?.promptTokenCount || 0;
        completionTokens += response.usageMetadata?.candidatesTokenCount || 0;

        const candidate = response.candidates?.[0];
        const parts = candidate?.content?.parts || [];

        // Check for function calls
        const functionCalls = parts.filter((p): p is Part & { functionCall: NonNullable<Part["functionCall"]> } => Boolean(p.functionCall));

        if (functionCalls.length > 0) {
          // Model decided to call tools
          for (const fc of functionCalls) {
            const call = fc.functionCall;
            if (!call || !call.name) continue;
            const callName = call.name;
            const callArgs = (call.args as Record<string, unknown>) || {};

            onEvent({ type: "tool_call", name: callName, args: callArgs });

            let toolResult: unknown;
            try {
              toolResult = await executeAgentTool(
                callName,
                callArgs,
                credentialToken,
              );
            } catch (err: unknown) {
              toolResult = {
                error: err instanceof Error ? err.message : String(err),
              };
            }

            toolCallsSummary.push({
              name: callName,
              args: callArgs,
              result: toolResult,
            });
            onEvent({
              type: "tool_result",
              name: callName,
              result: toolResult,
            });

            await traceCtx.recordModelCall({
              name: `agent-tool:${callName}`,
              model: PINNED_MODEL,
              prompt: JSON.stringify(callArgs),
              response: JSON.stringify(toolResult),
            });

            // Feed tool response back into contents
            contents.push({
              role: "model",
              parts: [{ functionCall: call }],
            });

            contents.push({
              role: "user",
              parts: [
                {
                  functionResponse: {
                    name: callName,
                    response: { result: toolResult },
                  },
                },
              ],
            });
          }
        } else {
          // Model output text response
          const text = response.text || "";
          fullAnswer = text;
          onEvent({ type: "text", text });

          await traceCtx.recordModelCall({
            name: "agent-final-response",
            model: PINNED_MODEL,
            prompt: augmentedPrompt,
            response: text,
            promptTokens,
            completionTokens,
          });

          break;
        }
      }

      onEvent({
        type: "done",
        fullText: fullAnswer,
        toolCalls: toolCallsSummary,
      });

      return {
        result: fullAnswer,
        cached: false,
        promptTokens,
        completionTokens,
      };
    },
  );
}