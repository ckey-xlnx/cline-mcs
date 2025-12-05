# ReviewBoard MCP Server

An MCP (Model Context Protocol) server that provides tools for interacting with ReviewBoard's REST API. Supports both OAuth2 and API token authentication.

## Features

This server provides the following tools:

1. **list_review_requests** - List review requests with filtering options
2. **get_review_request** - Get detailed information about a specific review request
3. **get_review_diffs** - Get the list of diffs for a review request
4. **get_diff_content** - Get the actual diff content (patch) for a specific diff
5. **get_reviews** - Get all reviews for a review request
6. **get_review_comments** - Get all diff comments for a specific review
7. **post_review** - Post a review to a review request
8. **search_review_requests** - Search for review requests using a text query

## Installation

1. Install dependencies and build the server:
```bash
cd reviewboard-server
npm install
npm run build
```

2. Choose your authentication method:
   - **Option A**: API Token (simpler, recommended for getting started)
   - **Option B**: OAuth2 (more secure, requires browser authorization)

3. Configure your MCP settings (see Configuration section below)

## Authentication Methods

This server supports two authentication methods. Choose the one that best fits your needs:

### Option A: API Token Authentication (Recommended for Simplicity)

**Pros**: Simple setup, no browser interaction needed
**Cons**: Tokens don't auto-refresh, less granular permissions

#### Setup Steps:

1. **Get an API Token from ReviewBoard**:
   - Log in to ReviewBoard
   - Go to your account settings
   - Navigate to "API Tokens"
   - Create a new token with appropriate permissions

2. **Configure MCP Settings** with environment variables:
   ```json
   {
     "mcpServers": {
       "reviewboard": {
         "command": "node",
         "args": ["/absolute/path/to/reviewboard-server/build/index.js"],
         "env": {
           "REVIEWBOARD_URL": "https://reviewboard.xilinx.com",
           "REVIEWBOARD_TOKEN": "your-api-token-here"
         },
         "disabled": false,
         "autoApprove": []
       }
     }
   }
   ```

That's it! The server will automatically use API token authentication when these environment variables are present.

### Option B: OAuth2 Authentication (Recommended for Security)

**Pros**: Auto-refreshing tokens, better security, granular permissions
**Cons**: Requires initial browser authorization, admin access to create OAuth app

## OAuth2 Setup

### Step 1: Create an OAuth2 Application in ReviewBoard

1. Log in to your ReviewBoard instance as an administrator
2. Navigate to **Admin > Integrations > OAuth2 Applications**
3. Click **"Add OAuth2 Application"**
4. Configure the application:
   - **Name**: MCP ReviewBoard Server (or any name you prefer)
   - **Client type**: Confidential
   - **Authorization grant type**: Authorization code
   - **Redirect URIs**: `http://localhost:3000/callback` (or use a different port if 3000 is in use)
5. Save the application and note down:
   - **Client ID**
   - **Client Secret**

### Step 2: Run the OAuth Setup Script

Set the required environment variables and run the setup script:

```bash
export REVIEWBOARD_URL="https://reviewboard.xilinx.com"
export REVIEWBOARD_CLIENT_ID="your-client-id-here"
export REVIEWBOARD_CLIENT_SECRET="your-client-secret-here"
# Optional: export OAUTH_CALLBACK_PORT="3000"

npm run oauth-setup
```

The script will:
1. Start a local callback server
2. Display an authorization URL
3. Open your browser to authorize the application
4. Exchange the authorization code for access and refresh tokens
5. Save the tokens to `oauth-config.json`

**Important**: The `oauth-config.json` file contains sensitive credentials. Keep it secure and do not commit it to version control.

### Step 3: Authorize the Application

1. The setup script will display a URL like:
   ```
   https://reviewboard.xilinx.com/oauth2/authorize/?client_id=...
   ```
2. Open this URL in your browser
3. Log in to ReviewBoard if not already logged in
4. Click **"Authorize"** to grant the application access
5. You'll be redirected to the callback URL and see a success message
6. Return to the terminal - the setup should complete automatically

## Configuration

Add the following to your MCP settings file (typically `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` on macOS or similar path on other systems):

```json
{
  "mcpServers": {
    "reviewboard": {
      "command": "node",
      "args": ["/absolute/path/to/reviewboard-server/build/index.js"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

**Note**: Unlike the API token version, OAuth2 configuration does not require environment variables in the MCP settings. All credentials are stored in the `oauth-config.json` file.

## Token Management

The server automatically handles OAuth2 token management:

- **Access tokens** are automatically refreshed when they expire
- **Refresh tokens** are used to obtain new access tokens without re-authorization
- Token expiration is checked before each API request (with a 5-minute buffer)
- Updated tokens are automatically saved to `oauth-config.json`

If token refresh fails, you may need to run the OAuth setup again:
```bash
npm run oauth-setup
```

## Usage Examples

Once configured, you can use the tools through Cline:

### List pending review requests
```
Use the list_review_requests tool with status="pending"
```

### Get details of a specific review
```
Use the get_review_request tool with id=12345
```

### Get diff content
```
First use get_review_diffs to get the diff list, then use get_diff_content with the review_request_id and the diff revision number (not the diff ID from the database).

Example:
1. get_review_diffs returns: [{"id": 62786, "revision": 1, ...}]
2. Use get_diff_content with review_request_id=29107 and diff_id=1 (the revision, not 62786)
```

**Important**: The `diff_id` parameter in `get_diff_content` expects the **revision number** (e.g., 1, 2, 3), not the database ID. The ReviewBoard API uses `/api/review-requests/{id}/diffs/{revision}/` where revision is the sequential diff number.

### Post a review
```
Use the post_review tool with review_request_id and your review text
```

## Logging

The server includes comprehensive logging to stderr for debugging:
- `[Setup]` - Initialization and configuration
- `[OAuth]` - OAuth2 token operations
- `[API]` - API requests and responses
- `[Handler]` - Tool execution
- `[Error]` - Error messages

## Security Considerations

- **oauth-config.json** contains sensitive credentials (access tokens, refresh tokens, client secrets)
- Add `oauth-config.json` to your `.gitignore` file
- Keep the file permissions restricted (readable only by your user)
- The OAuth2 flow uses CSRF protection via state parameter
- Tokens are transmitted over HTTPS only

## Troubleshooting

### "OAuth configuration file not found"
Run the OAuth setup script: `npm run oauth-setup`

### "Failed to refresh access token"
Your refresh token may have expired. Run the OAuth setup again: `npm run oauth-setup`

### "Authorization failed"
- Verify your Client ID and Client Secret are correct
- Ensure the redirect URI in ReviewBoard matches the callback URL (default: `http://localhost:3000/callback`)
- Check that the OAuth2 application is enabled in ReviewBoard

### Port already in use
If port 3000 is already in use, specify a different port:
```bash
export OAUTH_CALLBACK_PORT="3001"
npm run oauth-setup
```
Remember to update the redirect URI in your ReviewBoard OAuth2 application settings.

## Migration from API Token

If you're migrating from the API token version:

1. Run the OAuth setup as described above
2. Update your MCP settings to remove the `env` section (no longer needed)
3. The server will automatically use OAuth2 authentication

## Development

To modify the server:

1. Edit `src/index.ts` or `src/oauth-setup.ts`
2. Run `npm run build` to compile
3. Restart your MCP client to load the changes

## License

ISC
