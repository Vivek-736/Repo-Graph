import { auth } from "@clerk/nextjs/server";
import { createServerDatabaseClient } from "@/lib/supabase/server";
import { createAdminDatabaseClient } from "@/lib/supabase/admin";
import { signAnalysisToken } from "@/lib/agent/credentials";
import { runAgentConversation, ChatMessage, AgentStreamEvent } from "@/lib/agent/runner";

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.userId;
  const orgId = session?.orgId;

  if (!userId && !orgId) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const { analysisId, message, history = [], selectedContext = null } = body;

  if (!analysisId || !message) {
    return new Response(
      JSON.stringify({ error: "Missing required parameters: analysisId, message." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 1. Verify and fetch analysis (use admin client to bypass JWT template claim mismatch)
  const db = createAdminDatabaseClient() || (await createServerDatabaseClient());
  if (!db) {
    return new Response(JSON.stringify({ error: "Database client unavailable." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: analysis, error: analysisErr } = await db
    .from("analyses")
    .select("id, organization_id")
    .eq("id", analysisId)
    .single();

  if (!analysis || analysisErr) {
    return new Response(JSON.stringify({ error: "Analysis not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // If user has an active orgId and it does not match, deny
  if (orgId && analysis.organization_id && analysis.organization_id !== orgId) {
    return new Response(JSON.stringify({ error: "Unauthorized access to this analysis." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Mint the short-lived signed credential token
  const effectiveOrgId = analysis.organization_id || orgId || "default";
  const token = signAnalysisToken(analysisId, effectiveOrgId);

  // 3. Create SSE Stream
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: AgentStreamEvent) => {
        const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      try {
        await runAgentConversation(
          message,
          history as ChatMessage[],
          token,
          selectedContext,
          sendEvent
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendEvent({ type: "error", error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}