#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";

// Type definitions for Jira API
interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string;
    status: {
      name: string;
    };
    assignee?: {
      displayName: string;
    };
    reporter: {
      displayName: string;
    };
    created: string;
    updated: string;
    priority?: {
      name: string;
    };
    issuetype: {
      name: string;
    };
    labels?: string[];
    comment?: {
      comments: Array<{
        author: {
          displayName: string;
        };
        body: string;
        created: string;
      }>;
    };
  };
}

interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
}

// Jira API Client
class JiraClient {
  private clients: Map<string, AxiosInstance> = new Map();
  private instances: Map<string, { url: string; email: string; token: string }> = new Map();

  constructor() {
    console.error(`[Setup] Initializing Jira client manager`);
    
    // Load instance configurations from environment variables
    // Format: JIRA_INSTANCE_<NAME>_URL, JIRA_INSTANCE_<NAME>_EMAIL, JIRA_INSTANCE_<NAME>_TOKEN
    const instanceNames = new Set<string>();
    
    for (const key of Object.keys(process.env)) {
      const match = key.match(/^JIRA_INSTANCE_(.+)_(URL|EMAIL|TOKEN)$/);
      if (match) {
        instanceNames.add(match[1]);
      }
    }
    
    for (const name of instanceNames) {
      const url = process.env[`JIRA_INSTANCE_${name}_URL`];
      const email = process.env[`JIRA_INSTANCE_${name}_EMAIL`];
      const token = process.env[`JIRA_INSTANCE_${name}_TOKEN`];
      
      if (url && email && token) {
        this.instances.set(name.toLowerCase(), { url, email, token });
        console.error(`[Setup] Registered Jira instance: ${name.toLowerCase()} (${url})`);
      }
    }
    
    if (this.instances.size === 0) {
      console.error('[Warning] No Jira instances configured. Set JIRA_INSTANCE_<NAME>_URL, JIRA_INSTANCE_<NAME>_EMAIL, and JIRA_INSTANCE_<NAME>_TOKEN environment variables.');
    }
    
    console.error(`[Setup] Jira client manager initialized with ${this.instances.size} instance(s)`);
  }

  private getClient(instance: string): AxiosInstance {
    const instanceKey = instance.toLowerCase();
    
    if (!this.instances.has(instanceKey)) {
      throw new Error(
        `Unknown Jira instance: ${instance}. Available instances: ${Array.from(this.instances.keys()).join(', ')}`
      );
    }
    
    if (!this.clients.has(instanceKey)) {
      const config = this.instances.get(instanceKey)!;
      const baseUrl = config.url.replace(/\/$/, "");
      
      this.clients.set(instanceKey, axios.create({
        baseURL: `${baseUrl}/rest/api/3`,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        auth: {
          username: config.email,
          password: config.token,
        },
      }));
      
      console.error(`[Setup] Created client for instance: ${instanceKey}`);
    }
    
    return this.clients.get(instanceKey)!;
  }

  async getIssue(instance: string, issueKey: string): Promise<JiraIssue> {
    console.error(`[API] Fetching issue ${issueKey} from ${instance}`);
    
    try {
      const client = this.getClient(instance);
      const response = await client.get(`/issue/${issueKey}`, {
        params: {
          fields: 'summary,description,status,assignee,reporter,created,updated,priority,issuetype,labels,comment',
        },
      });
      console.error(`[API] Successfully fetched issue ${issueKey}`);
      return response.data;
    } catch (error: any) {
      console.error(`[Error] Failed to fetch issue ${issueKey}:`, error.message);
      throw new Error(`Failed to fetch issue ${issueKey}: ${error.message}`);
    }
  }

  async searchIssues(instance: string, jql: string, maxResults: number = 50): Promise<JiraSearchResponse> {
    console.error(`[API] Searching issues on ${instance} with JQL: ${jql}`);
    
    try {
      const client = this.getClient(instance);
      const response = await client.post('/search', {
        jql,
        maxResults,
        fields: ['summary', 'status', 'assignee', 'reporter', 'created', 'updated', 'priority', 'issuetype'],
      });
      console.error(`[API] Search returned ${response.data.issues.length} issues`);
      return response.data;
    } catch (error: any) {
      console.error(`[Error] Failed to search issues:`, error.message);
      throw new Error(`Failed to search issues: ${error.message}`);
    }
  }

  getAvailableInstances(): string[] {
    return Array.from(this.instances.keys());
  }
}

// MCP Server setup
const server = new Server(
  {
    name: "jira-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize Jira client
let jiraClient: JiraClient | null = null;

function getClient(): JiraClient {
  if (!jiraClient) {
    jiraClient = new JiraClient();
  }
  return jiraClient;
}

// Define available tools
const tools: Tool[] = [
  {
    name: "get_issue",
    description: "Get detailed information about a specific Jira issue by key (e.g., IFOESW-205). Supports multiple Jira instances.",
    inputSchema: {
      type: "object",
      properties: {
        instance: {
          type: "string",
          description: "The Jira instance name (amd, ontrack, or pensando)",
          enum: ["amd", "ontrack", "pensando"],
        },
        issue_key: {
          type: "string",
          description: "The Jira issue key (e.g., IFOESW-205, FWDEV-12345)",
        },
      },
      required: ["instance", "issue_key"],
    },
  },
  {
    name: "search_issues",
    description: "Search for Jira issues using JQL (Jira Query Language). Supports multiple Jira instances.",
    inputSchema: {
      type: "object",
      properties: {
        instance: {
          type: "string",
          description: "The Jira instance name (amd, ontrack, or pensando)",
          enum: ["amd", "ontrack", "pensando"],
        },
        jql: {
          type: "string",
          description: "JQL query string (e.g., 'project = IFOESW AND status = Open')",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return (default: 50)",
        },
      },
      required: ["instance", "jql"],
    },
  },
];

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error("[Handler] Listing available tools");
  return { tools };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  console.error(`[Handler] Executing tool: ${request.params.name}`);
  
  try {
    const client = getClient();

    switch (request.params.name) {
      case "get_issue": {
        const args = request.params.arguments as any;
        const result = await client.getIssue(args.instance, args.issue_key);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "search_issues": {
        const args = request.params.arguments as any;
        const result = await client.searchIssues(
          args.instance,
          args.jql,
          args.max_results
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error: any) {
    console.error(`[Error] Tool execution failed:`, error.message);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  console.error("[Setup] Starting Jira MCP server...");
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("[Setup] Jira MCP server running on stdio");
}

main().catch((error) => {
  console.error("[Error] Fatal error:", error);
  process.exit(1);
});
