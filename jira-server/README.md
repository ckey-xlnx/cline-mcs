# Jira MCP Server

A Model Context Protocol server that provides access to multiple Jira instances.

## Features

- Support for multiple Jira instances (AMD, OnTrack, Pensando)
- Get detailed issue information
- Search issues using JQL (Jira Query Language)
- Automatic instance selection based on project

## Configuration

The server is configured via environment variables in the MCP settings. Each Jira instance requires three environment variables:

- `JIRA_INSTANCE_<NAME>_URL` - The Jira instance URL
- `JIRA_INSTANCE_<NAME>_EMAIL` - Your email address
- `JIRA_INSTANCE_<NAME>_TOKEN` - Your API token for that instance

### Supported Instances

1. **AMD** (`amd`)
   - URL: https://amd.atlassian.net
   - For AMD-hosted projects

2. **OnTrack** (`ontrack`)
   - URL: https://ontrack-internal.amd.com
   - For internal AMD tracking

3. **Pensando** (`pensando`)
   - URL: https://pensando.atlassian.net
   - For Pensando-related projects

### Getting API Tokens

For Atlassian Cloud instances (AMD, Pensando):
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Give it a name (e.g., "Cline MCP Server")
4. Copy the token and add it to the MCP settings

For OnTrack (self-hosted):
1. Log into OnTrack
2. Go to your profile settings
3. Navigate to Personal Access Tokens
4. Create a new token
5. Copy the token and add it to the MCP settings

### Project to Instance Mapping

The agent will determine which instance to use based on project prefixes:

- **IFOESW-**, **SIEEMU-**, **FWDEV-** → OnTrack instance
- **AMD-** → AMD instance  
- **PEN-** → Pensando instance

(This mapping should be documented in review-specifics.md or provided to the agent as needed)

## Available Tools

### get_issue

Get detailed information about a specific Jira issue.

**Parameters:**
- `instance` (required): The Jira instance name (`amd`, `ontrack`, or `pensando`)
- `issue_key` (required): The issue key (e.g., `IFOESW-205`)

**Example:**
```json
{
  "instance": "ontrack",
  "issue_key": "IFOESW-205"
}
```

### search_issues

Search for issues using JQL (Jira Query Language).

**Parameters:**
- `instance` (required): The Jira instance name (`amd`, `ontrack`, or `pensando`)
- `jql` (required): JQL query string
- `max_results` (optional): Maximum results to return (default: 50)

**Example:**
```json
{
  "instance": "ontrack",
  "jql": "project = IFOESW AND status = Open",
  "max_results": 25
}
```

## Building

```bash
npm install
npm run build
```

## Development

```bash
npm run watch  # Auto-rebuild on changes
