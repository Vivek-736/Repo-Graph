import http from "node:http";
import { GoogleGenAI } from "@google/genai";

const PORT = process.env.AGENT_PORT || 3001;
const PINNED_MODEL = "gemini-2.5-flash";

const SYSTEM_INSTRUCTIONS = `You are the RepoGraph Standalone Agent Service.
You inspect codebases through deterministic graph tools.
Refuse subjective questions (grading code, quality scores). Answer factual questions (dependencies, blast radius, callers, routes).`;

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "healthy", service: "repograph-agent", port: PORT }));
    return;
  }

  if (req.url === "/chat" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const sendEvent = (type, data) => {
        res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const payload = JSON.parse(body || "{}");
        const { message, token, appBaseUrl = "http://localhost:3000" } = payload;

        if (!token) {
          sendEvent("error", { error: "Missing signed credential token." });
          res.end();
          return;
        }

        // Example tool call directly against read-only tools endpoint
        sendEvent("tool_call", { name: "get_analysis_summary", args: {} });

        let summary = null;
        try {
          const toolRes = await fetch(`${appBaseUrl}/api/agent/tools/get_analysis_summary`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({}),
          });
          const json = await toolRes.json();
          summary = json.data;
          sendEvent("tool_result", { name: "get_analysis_summary", result: summary });
        } catch (fetchErr) {
          sendEvent("tool_result", { name: "get_analysis_summary", result: { error: fetchErr.message } });
        }

        sendEvent("text", {
          text: `[Standalone Agent on port ${PORT}] Retrieved analysis facts: ${summary?.totalFiles || "unknown"} files analyzed.`,
        });

        sendEvent("done", {
          fullText: `Analysis verified through standalone service.`,
          toolCalls: [{ name: "get_analysis_summary", args: {}, result: summary }],
        });
      } catch (err) {
        sendEvent("error", { error: err.message });
      } finally {
        res.end();
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint not found" }));
});

server.listen(PORT, () => {
  console.log(`[RepoGraph Agent] Standalone service listening on http://localhost:${PORT}`);
});