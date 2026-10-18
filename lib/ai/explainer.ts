import { getAIClient, PINNED_MODEL } from "./client";
import {
  buildFileExplainPrompt,
  buildFolderExplainPrompt,
  buildRoleClassificationPrompt,
  FileNeighbourContext,
  FolderNeighbourContext,
  AllowedModelRole,
  ALLOWED_MODEL_ROLES,
} from "./prompts";

export interface AIExplanationResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface ClassifiedRoleResult {
  path: string;
  role: AllowedModelRole;
  confidence: number;
}

/**
 * Sanitizes model markdown output to ensure compliance with acceptance check:
 * - No headings (#, ##, etc.)
 * - No stray backticks or unmatched formatting
 */
export function sanitizeExplanationOutput(text: string): string {
  // Replace headings (e.g. "# Heading" or "### Title") with bold text
  let cleaned = text.replace(/^#{1,6}\s*(.*?)$/gm, "**$1**");

  // Remove potential markdown code fences like ```markdown ... ``` wrapping the response
  if (cleaned.startsWith("```markdown")) {
    cleaned = cleaned.replace(/^```markdown\s*/i, "").replace(/```\s*$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\w*\s*/, "").replace(/```\s*$/, "");
  }

  return cleaned.trim();
}

/**
 * Generates an explanation for a single file from its neighbours.
 */
export async function explainFileWithGemini(
  ctx: FileNeighbourContext
): Promise<AIExplanationResult> {
  const ai = getAIClient();
  const prompt = buildFileExplainPrompt(ctx);

  const response = await ai.models.generateContent({
    model: PINNED_MODEL,
    contents: prompt,
    config: {
      temperature: 0.2,
    },
  });

  const rawText = response.text || "No explanation could be generated.";
  const content = sanitizeExplanationOutput(rawText);

  const promptTokens = response.usageMetadata?.promptTokenCount || 0;
  const completionTokens = response.usageMetadata?.candidatesTokenCount || 0;

  return {
    content,
    model: PINNED_MODEL,
    promptTokens,
    completionTokens,
  };
}

/**
 * Generates an explanation for a folded folder from its contents and external callers.
 */
export async function explainFolderWithGemini(
  ctx: FolderNeighbourContext
): Promise<AIExplanationResult> {
  const ai = getAIClient();
  const prompt = buildFolderExplainPrompt(ctx);

  const response = await ai.models.generateContent({
    model: PINNED_MODEL,
    contents: prompt,
    config: {
      temperature: 0.2,
    },
  });

  const rawText = response.text || "No folder explanation could be generated.";
  const content = sanitizeExplanationOutput(rawText);

  const promptTokens = response.usageMetadata?.promptTokenCount || 0;
  const completionTokens = response.usageMetadata?.candidatesTokenCount || 0;

  return {
    content,
    model: PINNED_MODEL,
    promptTokens,
    completionTokens,
  };
}

/**
 * Classifies unclassified files into non-routable roles.
 */
export async function classifyRolesWithGemini(
  files: Array<{ path: string; imports: string[]; importedBy: string[] }>
): Promise<{
  roles: ClassifiedRoleResult[];
  model: string;
  promptTokens: number;
  completionTokens: number;
}> {
  if (files.length === 0) {
    return { roles: [], model: PINNED_MODEL, promptTokens: 0, completionTokens: 0 };
  }

  const ai = getAIClient();
  const prompt = buildRoleClassificationPrompt(files);

  const response = await ai.models.generateContent({
    model: PINNED_MODEL,
    contents: prompt,
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const promptTokens = response.usageMetadata?.promptTokenCount || 0;
  const completionTokens = response.usageMetadata?.candidatesTokenCount || 0;

  let parsed: unknown = [];
  try {
    parsed = JSON.parse(response.text || "[]");
  } catch (err) {
    console.warn("[Gemini] Failed to parse classification JSON:", err);
  }

  const roles: ClassifiedRoleResult[] = [];
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        "path" in item &&
        "role" in item &&
        typeof item.path === "string" &&
        typeof item.role === "string"
      ) {
        // Enforce: role MUST be one of the non-structural allowed roles
        const matchedRole = ALLOWED_MODEL_ROLES.find(
          (r) => r.toLowerCase() === item.role.toLowerCase()
        );
        if (matchedRole) {
          roles.push({
            path: item.path,
            role: matchedRole,
            confidence:
              typeof item.confidence === "number" ? Math.min(1.0, Math.max(0.5, item.confidence)) : 0.8,
          });
        }
      }
    }
  }

  return {
    roles,
    model: PINNED_MODEL,
    promptTokens,
    completionTokens,
  };
}