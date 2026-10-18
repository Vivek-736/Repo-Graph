import { NextResponse } from "next/server";
import { verifyAnalysisToken } from "@/lib/agent/credentials";
import {
  getAnalysisSummary,
  searchFilesByPath,
  listFilesByRole,
  getFileNeighbours,
  performTransitiveWalk,
  getRouteTable,
} from "@/lib/agent/tools";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ toolName: string }> }
) {
  const { toolName } = await params;

  // Extract signed credential from Authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or malformed Authorization header with signed credential." },
      { status: 401 }
    );
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const credential = verifyAnalysisToken(token);

  if (!credential) {
    return NextResponse.json(
      { error: "Invalid or expired analysis credential." },
      { status: 403 }
    );
  }

  const { analysisId, orgId } = credential;

  try {
    const body = await req.json().catch(() => ({}));

    let result: unknown;
    switch (toolName) {
      case "get_analysis_summary":
        result = await getAnalysisSummary(analysisId, orgId);
        break;

      case "search_files_by_path":
        if (typeof body.query !== "string") {
          return NextResponse.json({ error: "Missing 'query' string parameter" }, { status: 400 });
        }
        result = await searchFilesByPath(analysisId, orgId, body.query);
        break;

      case "list_files_by_role":
        if (typeof body.role !== "string") {
          return NextResponse.json({ error: "Missing 'role' string parameter" }, { status: 400 });
        }
        result = await listFilesByRole(analysisId, orgId, body.role);
        break;

      case "get_file_neighbours":
        if (typeof body.filePath !== "string") {
          return NextResponse.json({ error: "Missing 'filePath' parameter" }, { status: 400 });
        }
        result = await getFileNeighbours(analysisId, orgId, body.filePath);
        break;

      case "transitive_walk":
        if (typeof body.filePath !== "string" || !["upstream", "downstream"].includes(body.direction)) {
          return NextResponse.json(
            { error: "Requires 'filePath' and direction ('upstream' | 'downstream')" },
            { status: 400 }
          );
        }
        result = await performTransitiveWalk(
          analysisId,
          orgId,
          body.filePath,
          body.direction,
          body.depth
        );
        break;

      case "get_route_table":
        result = await getRouteTable(analysisId, orgId, body.filter);
        break;

      default:
        return NextResponse.json(
          { error: `Unknown tool: ${toolName}. Allowed: get_analysis_summary, search_files_by_path, list_files_by_role, get_file_neighbours, transitive_walk, get_route_table.` },
          { status: 404 }
        );
    }

    return NextResponse.json({ success: true, tool: toolName, data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ToolAPI] Error executing ${toolName}:`, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}