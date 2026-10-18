import { FunctionDeclaration, Type } from "@google/genai";

/**
 * The 6 Gemini function declarations.
 * Notice: the agent NEVER receives or passes an analysis ID!
 * The analysis is locked inside the signed bearer token.
 */
export const AGENT_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "get_analysis_summary",
    description: "Returns a high-level summary of the entire repository analysis, including total files, edges, coverage, and the most depended-on modules.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "search_files_by_path",
    description: "Searches for files whose file paths match the given substring query.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "Substring of the path to look for (e.g., 'auth', 'user', 'controller', 'service').",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "list_files_by_role",
    description: "Lists files by their assigned architectural role (e.g., 'service', 'repository', 'model', 'util', 'route', 'controller', 'component', 'hook', 'middleware').",
    parameters: {
      type: Type.OBJECT,
      properties: {
        role: {
          type: Type.STRING,
          description: "The architectural role to filter by.",
        },
      },
      required: ["role"],
    },
  },
  {
    name: "get_file_neighbours",
    description: "Gets the direct incoming callers (files that import this file) and direct outgoing dependencies (files that this file imports) for a specific file path.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        filePath: {
          type: Type.STRING,
          description: "Exact repository file path (e.g. 'src/services/auth.ts').",
        },
      },
      required: ["filePath"],
    },
  },
  {
    name: "transitive_walk",
    description: "Performs a multi-hop transitive graph walk from a start file. 'upstream' reveals the blast radius (everything that breaks or depends on this file transitively). 'downstream' reveals the complete dependency chain.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        filePath: {
          type: Type.STRING,
          description: "The starting file path.",
        },
        direction: {
          type: Type.STRING,
          enum: ["upstream", "downstream"],
          description: "'upstream' for blast radius (who breaks), 'downstream' for dependencies (what it relies on).",
        },
        depth: {
          type: Type.INTEGER,
          description: "Max hop depth (default 2, max 4).",
        },
      },
      required: ["filePath", "direction"],
    },
  },
  {
    name: "get_route_table",
    description: "Returns declared HTTP endpoints (method, route path, handler file) from the repository's route table.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        filter: {
          type: Type.STRING,
          description: "Optional filter for route paths or HTTP methods (e.g. 'GET', '/api/users').",
        },
      },
    },
  },
];