#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as https from "https";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Type definitions for ReviewBoard API
interface ReviewRequest {
  id: number;
  summary: string;
  description: string;
  submitter: {
    username: string;
    fullname: string;
  };
  status: string;
  public: boolean;
  time_added: string;
  last_updated: string;
  repository: {
    name: string;
  };
  target_people: Array<{ username: string }>;
  target_groups: Array<{ name: string }>;
  bugs_closed: string[];
  branch: string;
}

interface ReviewRequestsResponse {
  review_requests: ReviewRequest[];
  total_results: number;
}

interface DiffData {
  id: number;
  name: string;
  revision: number;
  timestamp: string;
}

interface Review {
  id: number;
  user: {
    username: string;
    fullname: string;
  };
  timestamp: string;
  public: boolean;
  ship_it: boolean;
  body_top: string;
  body_bottom: string;
}

interface ReviewComment {
  id: number;
  text: string;
  timestamp: string;
  user: {
    username: string;
  };
  issue_opened: boolean;
  issue_status: string;
}

interface OAuthConfig {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: number;
  client_id: string;
  client_secret: string;
  reviewboard_url: string;
}

// OAuth2 Token Manager
class OAuth2TokenManager {
  private config: OAuthConfig;
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }

  private loadConfig(): OAuthConfig {
    console.error(`[OAuth] Loading configuration from ${this.configPath}`);
    
    if (!fs.existsSync(this.configPath)) {
      throw new Error(
        `OAuth configuration file not found at ${this.configPath}. ` +
        'Please run the OAuth setup script first: npm run oauth-setup'
      );
    }

    const configData = fs.readFileSync(this.configPath, 'utf-8');
    const config = JSON.parse(configData) as OAuthConfig;
    
    console.error('[OAuth] Configuration loaded successfully');
    return config;
  }

  private saveConfig(): void {
    console.error('[OAuth] Saving updated configuration');
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    console.error('[OAuth] Configuration saved');
  }

  private async refreshAccessToken(): Promise<void> {
    console.error('[OAuth] Refreshing access token...');
    
    try {
      const response = await axios.post(
        `${this.config.reviewboard_url}/oauth2/token/`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.config.refresh_token,
          client_id: this.config.client_id,
          client_secret: this.config.client_secret,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const tokenData = response.data;
      
      // Update configuration with new tokens
      this.config.access_token = tokenData.access_token;
      if (tokenData.refresh_token) {
        this.config.refresh_token = tokenData.refresh_token;
      }
      this.config.expires_at = Date.now() + (tokenData.expires_in * 1000);
      
      this.saveConfig();
      console.error('[OAuth] Access token refreshed successfully');
      
    } catch (error: any) {
      console.error('[Error] Failed to refresh access token:', error.response?.data || error.message);
      throw new Error(
        'Failed to refresh access token. You may need to run the OAuth setup again: npm run oauth-setup'
      );
    }
  }

  async getValidAccessToken(): Promise<string> {
    // Check if token is expired or will expire in the next 5 minutes
    const expiryBuffer = 5 * 60 * 1000; // 5 minutes in milliseconds
    const isExpired = Date.now() >= (this.config.expires_at - expiryBuffer);

    if (isExpired) {
      console.error('[OAuth] Access token expired or expiring soon, refreshing...');
      await this.refreshAccessToken();
    }

    return this.config.access_token;
  }

  getReviewBoardUrl(): string {
    return this.config.reviewboard_url;
  }
}

// ReviewBoard API Client
class ReviewBoardClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private tokenManager?: OAuth2TokenManager;
  private apiToken?: string;

  constructor(baseUrlOrTokenManager: string | OAuth2TokenManager, apiToken?: string) {
    console.error(`[Setup] Initializing ReviewBoard client`);
    
    // Create HTTPS agent that accepts self-signed certificates
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false, // Accept self-signed certificates
    });

    // Check if using API token authentication
    if (typeof baseUrlOrTokenManager === 'string' && apiToken) {
      // API Token authentication
      this.baseUrl = baseUrlOrTokenManager.replace(/\/$/, "");
      this.apiToken = apiToken;
      
      this.client = axios.create({
        baseURL: `${this.baseUrl}/api`,
        headers: {
          Accept: "application/json",
          Authorization: `token ${apiToken}`,
        },
        httpsAgent: httpsAgent,
      });
      
      console.error("[Setup] ReviewBoard client initialized with API token");
    } else if (typeof baseUrlOrTokenManager === 'object') {
      // OAuth2 authentication
      this.tokenManager = baseUrlOrTokenManager;
      this.baseUrl = this.tokenManager.getReviewBoardUrl().replace(/\/$/, "");
      
      this.client = axios.create({
        baseURL: `${this.baseUrl}/api`,
        headers: {
          Accept: "application/json",
        },
        httpsAgent: httpsAgent,
      });

      // Add request interceptor to inject fresh access token
      this.client.interceptors.request.use(async (config) => {
        if (this.tokenManager) {
          const accessToken = await this.tokenManager.getValidAccessToken();
          config.headers.Authorization = `Bearer ${accessToken}`;
        }
        return config;
      });
      
      console.error("[Setup] ReviewBoard client initialized with OAuth2");
    } else {
      throw new Error('Invalid ReviewBoardClient constructor arguments');
    }

    console.error("[Setup] ReviewBoard client initialized successfully");
  }

  async getReviewRequests(params: {
    status?: string;
    toUsers?: string;
    toGroups?: string;
    repository?: string;
    maxResults?: number;
  }): Promise<ReviewRequestsResponse> {
    console.error("[API] Fetching review requests with params:", params);
    
    try {
      const queryParams: any = {
        "max-results": params.maxResults || 25,
      };

      if (params.status) queryParams.status = params.status;
      if (params.toUsers) queryParams["to-users"] = params.toUsers;
      if (params.toGroups) queryParams["to-groups"] = params.toGroups;
      if (params.repository) queryParams.repository = params.repository;

      const response = await this.client.get("/review-requests/", {
        params: queryParams,
      });

      console.error(`[API] Successfully fetched ${response.data.review_requests.length} review requests`);
      return response.data;
    } catch (error: any) {
      console.error("[Error] Failed to fetch review requests:", error.message);
      throw new Error(`Failed to fetch review requests: ${error.message}`);
    }
  }

  async getReviewRequest(id: number): Promise<ReviewRequest> {
    console.error(`[API] Fetching review request ${id}`);
    
    try {
      const response = await this.client.get(`/review-requests/${id}/`);
      console.error(`[API] Successfully fetched review request ${id}`);
      return response.data.review_request;
    } catch (error: any) {
      console.error(`[Error] Failed to fetch review request ${id}:`, error.message);
      throw new Error(`Failed to fetch review request ${id}: ${error.message}`);
    }
  }

  async getDiffs(reviewRequestId: number): Promise<DiffData[]> {
    console.error(`[API] Fetching diffs for review request ${reviewRequestId}`);
    
    try {
      const response = await this.client.get(
        `/review-requests/${reviewRequestId}/diffs/`
      );
      console.error(`[API] Successfully fetched ${response.data.diffs.length} diffs`);
      return response.data.diffs;
    } catch (error: any) {
      console.error(`[Error] Failed to fetch diffs:`, error.message);
      throw new Error(`Failed to fetch diffs: ${error.message}`);
    }
  }

  async getDiffContent(reviewRequestId: number, diffId: number): Promise<string> {
    console.error(`[API] Fetching diff content for review ${reviewRequestId}, diff ${diffId}`);
    
    try {
      const response = await this.client.get(
        `/review-requests/${reviewRequestId}/diffs/${diffId}/`,
        {
          headers: {
            Accept: "text/x-patch",
          },
        }
      );
      console.error(`[API] Successfully fetched diff content`);
      return response.data;
    } catch (error: any) {
      console.error(`[Error] Failed to fetch diff content:`, error.message);
      throw new Error(`Failed to fetch diff content: ${error.message}`);
    }
  }

  async getReviews(reviewRequestId: number): Promise<Review[]> {
    console.error(`[API] Fetching reviews for review request ${reviewRequestId}`);
    
    try {
      const response = await this.client.get(
        `/review-requests/${reviewRequestId}/reviews/`
      );
      console.error(`[API] Successfully fetched ${response.data.reviews.length} reviews`);
      return response.data.reviews;
    } catch (error: any) {
      console.error(`[Error] Failed to fetch reviews:`, error.message);
      throw new Error(`Failed to fetch reviews: ${error.message}`);
    }
  }

  async getReviewComments(reviewRequestId: number, reviewId: number): Promise<ReviewComment[]> {
    console.error(`[API] Fetching comments for review ${reviewId}`);
    
    try {
      const response = await this.client.get(
        `/review-requests/${reviewRequestId}/reviews/${reviewId}/diff-comments/`
      );
      console.error(`[API] Successfully fetched ${response.data.diff_comments.length} comments`);
      return response.data.diff_comments;
    } catch (error: any) {
      console.error(`[Error] Failed to fetch review comments:`, error.message);
      throw new Error(`Failed to fetch review comments: ${error.message}`);
    }
  }

  async getReviewReplies(reviewRequestId: number, reviewId: number): Promise<Review[]> {
    console.error(`[API] Fetching replies for review ${reviewId}`);
    
    try {
      const response = await this.client.get(
        `/review-requests/${reviewRequestId}/reviews/${reviewId}/replies/`
      );
      console.error(`[API] Successfully fetched ${response.data.replies.length} replies`);
      return response.data.replies;
    } catch (error: any) {
      console.error(`[Error] Failed to fetch review replies:`, error.message);
      throw new Error(`Failed to fetch review replies: ${error.message}`);
    }
  }

  async postReview(reviewRequestId: number, data: {
    bodyTop?: string;
    bodyBottom?: string;
    shipIt?: boolean;
    public?: boolean;
  }): Promise<Review> {
    console.error(`[API] Posting review to review request ${reviewRequestId}`);
    
    try {
      const formData = new URLSearchParams();
      if (data.bodyTop !== undefined) formData.append('body_top', data.bodyTop);
      if (data.bodyBottom !== undefined) formData.append('body_bottom', data.bodyBottom);
      if (data.shipIt !== undefined) formData.append('ship_it', String(data.shipIt));
      if (data.public !== undefined) formData.append('public', String(data.public));

      const response = await this.client.post(
        `/review-requests/${reviewRequestId}/reviews/`,
        formData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
      console.error(`[API] Successfully posted review`);
      return response.data.review;
    } catch (error: any) {
      console.error(`[Error] Failed to post review:`, error.message);
      throw new Error(`Failed to post review: ${error.message}`);
    }
  }

  async postReviewReply(reviewRequestId: number, reviewId: number, data: {
    bodyTop?: string;
    bodyBottom?: string;
    public?: boolean;
  }): Promise<Review> {
    console.error(`[API] Posting reply to review ${reviewId}`);
    
    try {
      const formData = new URLSearchParams();
      if (data.bodyTop !== undefined) formData.append('body_top', data.bodyTop);
      if (data.bodyBottom !== undefined) formData.append('body_bottom', data.bodyBottom);
      if (data.public !== undefined) formData.append('public', String(data.public));

      const response = await this.client.post(
        `/review-requests/${reviewRequestId}/reviews/${reviewId}/replies/`,
        formData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
      console.error(`[API] Successfully posted reply`);
      return response.data.reply;
    } catch (error: any) {
      console.error(`[Error] Failed to post reply:`, error.message);
      throw new Error(`Failed to post reply: ${error.message}`);
    }
  }

  async searchReviewRequests(query: string): Promise<ReviewRequestsResponse> {
    console.error(`[API] Searching review requests with query: ${query}`);
    
    try {
      const response = await this.client.get("/review-requests/", {
        params: {
          q: query,
          "max-results": 25,
        },
      });
      console.error(`[API] Search returned ${response.data.review_requests.length} results`);
      return response.data;
    } catch (error: any) {
      console.error(`[Error] Failed to search review requests:`, error.message);
      throw new Error(`Failed to search review requests: ${error.message}`);
    }
  }
}

// MCP Server setup
const server = new Server(
  {
    name: "reviewboard-server",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize ReviewBoard client
let rbClient: ReviewBoardClient | null = null;

function getClient(): ReviewBoardClient {
  if (!rbClient) {
    // Check for API token authentication first (simpler, no OAuth setup needed)
    const apiToken = process.env.REVIEWBOARD_TOKEN;
    const baseUrl = process.env.REVIEWBOARD_URL;
    
    if (apiToken && baseUrl) {
      console.error('[Setup] Using API token authentication');
      rbClient = new ReviewBoardClient(baseUrl, apiToken);
    } else {
      // Fall back to OAuth2 authentication
      console.error('[Setup] Using OAuth2 authentication');
      const configPath = path.join(__dirname, '..', 'oauth-config.json');
      const tokenManager = new OAuth2TokenManager(configPath);
      rbClient = new ReviewBoardClient(tokenManager);
    }
  }
  return rbClient;
}

// Define available tools
const tools: Tool[] = [
  {
    name: "list_review_requests",
    description:
      "List review requests from ReviewBoard. Can filter by status (pending, submitted, discarded, all), assigned users, groups, or repository.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter by status: pending, submitted, discarded, or all",
          enum: ["pending", "submitted", "discarded", "all"],
        },
        to_users: {
          type: "string",
          description: "Filter by username(s) the review is assigned to (comma-separated)",
        },
        to_groups: {
          type: "string",
          description: "Filter by group name(s) (comma-separated)",
        },
        repository: {
          type: "string",
          description: "Filter by repository name",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return (default: 25)",
        },
      },
    },
  },
  {
    name: "get_review_request",
    description: "Get detailed information about a specific review request by ID",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "The review request ID",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "get_review_diffs",
    description: "Get the list of diffs for a review request",
    inputSchema: {
      type: "object",
      properties: {
        review_request_id: {
          type: "number",
          description: "The review request ID",
        },
      },
      required: ["review_request_id"],
    },
  },
  {
    name: "get_diff_content",
    description: "Get the actual diff content (patch) for a specific diff",
    inputSchema: {
      type: "object",
      properties: {
        review_request_id: {
          type: "number",
          description: "The review request ID",
        },
        diff_id: {
          type: "number",
          description: "The diff ID",
        },
      },
      required: ["review_request_id", "diff_id"],
    },
  },
  {
    name: "get_reviews",
    description: "Get all reviews for a review request",
    inputSchema: {
      type: "object",
      properties: {
        review_request_id: {
          type: "number",
          description: "The review request ID",
        },
      },
      required: ["review_request_id"],
    },
  },
  {
    name: "get_review_comments",
    description: "Get all diff comments for a specific review",
    inputSchema: {
      type: "object",
      properties: {
        review_request_id: {
          type: "number",
          description: "The review request ID",
        },
        review_id: {
          type: "number",
          description: "The review ID",
        },
      },
      required: ["review_request_id", "review_id"],
    },
  },
  {
    name: "get_review_replies",
    description: "Get all replies to a specific review",
    inputSchema: {
      type: "object",
      properties: {
        review_request_id: {
          type: "number",
          description: "The review request ID",
        },
        review_id: {
          type: "number",
          description: "The review ID",
        },
      },
      required: ["review_request_id", "review_id"],
    },
  },
  {
    name: "post_review",
    description: "Post a review to a review request",
    inputSchema: {
      type: "object",
      properties: {
        review_request_id: {
          type: "number",
          description: "The review request ID",
        },
        body_top: {
          type: "string",
          description: "Review text to appear above comments",
        },
        body_bottom: {
          type: "string",
          description: "Review text to appear below comments",
        },
        ship_it: {
          type: "boolean",
          description: "Whether to mark the review as 'Ship It!'",
        },
        public: {
          type: "boolean",
          description: "Whether to publish the review immediately (default: false)",
        },
      },
      required: ["review_request_id"],
    },
  },
  {
    name: "post_review_reply",
    description: "Post a reply to an existing review",
    inputSchema: {
      type: "object",
      properties: {
        review_request_id: {
          type: "number",
          description: "The review request ID",
        },
        review_id: {
          type: "number",
          description: "The review ID to reply to",
        },
        body_top: {
          type: "string",
          description: "Reply text to appear above comments",
        },
        body_bottom: {
          type: "string",
          description: "Reply text to appear below comments",
        },
        public: {
          type: "boolean",
          description: "Whether to publish the reply immediately (default: false)",
        },
      },
      required: ["review_request_id", "review_id"],
    },
  },
  {
    name: "search_review_requests",
    description: "Search for review requests using a text query",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query text",
        },
      },
      required: ["query"],
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
      case "list_review_requests": {
        const args = request.params.arguments as any;
        const result = await client.getReviewRequests({
          status: args.status,
          toUsers: args.to_users,
          toGroups: args.to_groups,
          repository: args.repository,
          maxResults: args.max_results,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get_review_request": {
        const args = request.params.arguments as any;
        const result = await client.getReviewRequest(args.id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get_review_diffs": {
        const args = request.params.arguments as any;
        const result = await client.getDiffs(args.review_request_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get_diff_content": {
        const args = request.params.arguments as any;
        const result = await client.getDiffContent(
          args.review_request_id,
          args.diff_id
        );

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "get_reviews": {
        const args = request.params.arguments as any;
        const result = await client.getReviews(args.review_request_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get_review_comments": {
        const args = request.params.arguments as any;
        const result = await client.getReviewComments(
          args.review_request_id,
          args.review_id
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

      case "get_review_replies": {
        const args = request.params.arguments as any;
        const result = await client.getReviewReplies(
          args.review_request_id,
          args.review_id
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

      case "post_review": {
        const args = request.params.arguments as any;
        const result = await client.postReview(args.review_request_id, {
          bodyTop: args.body_top,
          bodyBottom: args.body_bottom,
          shipIt: args.ship_it,
          public: args.public,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "post_review_reply": {
        const args = request.params.arguments as any;
        const result = await client.postReviewReply(
          args.review_request_id,
          args.review_id,
          {
            bodyTop: args.body_top,
            bodyBottom: args.body_bottom,
            public: args.public,
          }
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

      case "search_review_requests": {
        const args = request.params.arguments as any;
        const result = await client.searchReviewRequests(args.query);

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
  console.error("[Setup] Starting ReviewBoard MCP server with OAuth2...");
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("[Setup] ReviewBoard MCP server running on stdio");
}

main().catch((error) => {
  console.error("[Error] Fatal error:", error);
  process.exit(1);
});
