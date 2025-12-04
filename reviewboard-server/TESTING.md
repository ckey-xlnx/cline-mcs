# Testing Guide for ReviewBoard OAuth2 MCP Server

This guide provides step-by-step instructions for testing the OAuth2 implementation.

## Prerequisites

Before testing, ensure you have:

1. ✅ Built the project: `npm run build`
2. ✅ Access to a ReviewBoard instance with admin privileges
3. ✅ Network access to your ReviewBoard server

## Test Plan

### Test 1: OAuth2 Application Setup in ReviewBoard

**Objective**: Verify you can create an OAuth2 application in ReviewBoard

**Steps**:
1. Log in to ReviewBoard as an administrator
2. Navigate to **Admin > Integrations > OAuth2 Applications**
3. Click **"Add OAuth2 Application"**
4. Fill in the form:
   - Name: `MCP ReviewBoard Server Test`
   - Client type: `Confidential`
   - Authorization grant type: `Authorization code`
   - Redirect URIs: `http://localhost:3000/callback`
5. Save the application

**Expected Result**: 
- Application is created successfully
- You receive a Client ID and Client Secret

**Status**: ⬜ Not tested | ✅ Passed | ❌ Failed

---

### Test 2: OAuth Setup Script Execution

**Objective**: Verify the OAuth setup script runs and completes the authorization flow

**Steps**:
1. Set environment variables:
   ```bash
   export REVIEWBOARD_URL="https://your-reviewboard-instance.com"
   export REVIEWBOARD_CLIENT_ID="your-client-id"
   export REVIEWBOARD_CLIENT_SECRET="your-client-secret"
   ```

2. Run the setup script:
   ```bash
   npm run oauth-setup
   ```

3. Observe the output:
   - Callback server starts on port 3000
   - Authorization URL is displayed

4. Open the authorization URL in your browser

5. Log in to ReviewBoard (if not already logged in)

6. Click "Authorize" to grant access

7. Verify you're redirected to the callback URL with a success message

8. Return to the terminal and verify the setup completes

**Expected Result**:
- ✅ Callback server starts successfully
- ✅ Authorization URL is displayed
- ✅ Browser authorization succeeds
- ✅ Tokens are exchanged successfully
- ✅ `oauth-config.json` file is created
- ✅ File contains: `access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret`, `reviewboard_url`

**Status**: ⬜ Not tested | ✅ Passed | ❌ Failed

---

### Test 3: OAuth Configuration File Validation

**Objective**: Verify the oauth-config.json file is created correctly

**Steps**:
1. Check that `oauth-config.json` exists:
   ```bash
   ls -la oauth-config.json
   ```

2. Verify file permissions (should be readable only by owner):
   ```bash
   stat -c "%a %n" oauth-config.json  # Linux
   # or
   ls -l oauth-config.json  # macOS/Linux
   ```

3. Inspect the file contents (be careful not to expose credentials):
   ```bash
   cat oauth-config.json | jq 'keys'
   ```

**Expected Result**:
- ✅ File exists
- ✅ Contains required keys: `access_token`, `refresh_token`, `token_type`, `expires_at`, `client_id`, `client_secret`, `reviewboard_url`
- ✅ `expires_at` is a future timestamp
- ✅ `token_type` is "Bearer"

**Status**: ⬜ Not tested | ✅ Passed | ❌ Failed

---

### Test 4: MCP Server Startup

**Objective**: Verify the MCP server starts without errors

**Steps**:
1. Ensure `oauth-config.json` exists from Test 2

2. Try to start the server manually:
   ```bash
   node build/index.js
   ```

3. Observe the startup logs in stderr

4. Press Ctrl+C to stop the server

**Expected Result**:
- ✅ Server starts without errors
- ✅ Logs show: `[OAuth] Loading configuration from...`
- ✅ Logs show: `[OAuth] Configuration loaded successfully`
- ✅ Logs show: `[Setup] ReviewBoard MCP server running on stdio`
- ✅ No error messages about missing configuration

**Status**: ⬜ Not tested | ✅ Passed | ❌ Failed

---

### Test 5: Tool Execution - List Review Requests

**Objective**: Verify the server can successfully call the ReviewBoard API

**Steps**:
1. Configure the server in your MCP settings
2. Use Cline to execute: `list_review_requests` with `status="pending"`
3. Observe the response

**Expected Result**:
- ✅ Request succeeds
- ✅ Returns a list of review requests (or empty array if none exist)
- ✅ No authentication errors
- ✅ Logs show: `[API] Fetching review requests...`
- ✅ Logs show: `[API] Successfully fetched X review requests`

**Status**: ⬜ Not tested | ✅ Passed | ❌ Failed

---

### Test 6: Tool Execution - Get Review Request

**Objective**: Verify the server can fetch a specific review request

**Steps**:
1. Identify a valid review request ID from Test 5 (or use a known ID)
2. Use Cline to execute: `get_review_request` with `id=<valid-id>`
3. Observe the response

**Expected Result**:
- ✅ Request succeeds
- ✅ Returns detailed review request information
- ✅ Response includes: `id`, `summary`, `description`, `submitter`, `status`, etc.

**Status**: ⬜ Not tested | ✅ Passed | ❌ Failed

---

### Test 7: Tool Execution - Get Diffs

**Objective**: Verify the server can fetch diffs for a review request

**Steps**:
1. Use a review request ID that has diffs
2. Use Cline to execute: `get_review_diffs` with `review_request_id=<id>`
3. Observe the response

**Expected Result**:
- ✅ Request succeeds
- ✅ Returns array of diffs
- ✅ Each diff has: `id`, `name`, `revision`, `timestamp`

**Status**: ⬜ Not tested | ✅ Passed | ❌ Failed

---

### Test 8: Tool Execution - Get Diff Content

**Objective**: Verify the server can fetch actual diff content

**Steps**:
1. Use a review request ID and diff ID from Test 7
2. Use Cline to execute: `get_diff_content` with `review_request_id=<id>` and `diff_id=<diff-id>`
3. Observe the response

**Expected Result**:
- ✅ Request succeeds
- ✅ Returns patch/diff content as text
- ✅ Content looks like a valid unified diff

**Status**: ⬜ Not tested | ✅ Passed | ❌ Failed

---

### Test 9: Token Refresh

**Objective**: Verify automatic token refresh works

**Steps**:
1. Manually edit `oauth-config.json` to set `expires_at` to a past timestamp:
   ```json
   "expires_at": 1000000000000
   ```

2. Execute any tool (e.g., `list_review_requests`)

3. Observe the logs

4. Check `oauth-config.json` to verify `expires_at` was updated

**Expected Result**:
- ✅ Logs show: `[OAuth] Access token expired or expiring soon, refreshing...`
- ✅ Logs show: `[OAuth] Refreshing access token...`
- ✅ Logs show: `[OAuth] Access token refreshed successfully`
- ✅ Request succeeds after token refresh
- ✅ `oauth-config.json` has updated `expires_at` timestamp
- ✅ `oauth-config.json` has new `access_token`

**Status**: ⬜ Not tested | ✅ Passed | ❌ Failed

---

### Test 10: Error Handling - Missing Configuration

**Objective**: Verify proper error handling when oauth-config.json is missing

**Steps**:
1. Rename or remove `oauth-config.json`:
   ```bash
   mv oauth-config.json oauth-config.json.backup
   ```

2. Try to start the server:
   ```bash
   node build/index.js
   ```

3. Observe the error message

4. Restore the configuration:
   ```bash
   mv oauth-config.json.backup oauth-config.json
   ```

**Expected Result**:
- ✅ Server fails to start with clear error message
- ✅ Error mentions: "OAuth configuration file not found"
- ✅ Error suggests running: "npm run oauth-setup"

**Status**: ⬜ Not tested | ✅ Passed | ❌ Failed

---

### Test 11: Search Functionality

**Objective**: Verify search functionality works

**Steps**:
1. Use Cline to execute: `search_review_requests` with `query="test"`
2. Observe the response

**Expected Result**:
- ✅ Request succeeds
- ✅ Returns search results
- ✅ Results match the search query

**Status**: ⬜ Not tested | ✅ Passed | ❌ Failed

---

### Test 12: Post Review (Write Operation)

**Objective**: Verify write operations work with OAuth2

**Steps**:
1. Identify a review request where you can post a review
2. Use Cline to execute: `post_review` with:
   - `review_request_id=<id>`
   - `body_top="Test review from OAuth2 MCP server"`
   - `public=false` (draft mode for safety)
3. Observe the response
4. Check ReviewBoard UI to verify the draft review was created

**Expected Result**:
- ✅ Request succeeds
- ✅ Returns review object with `id`
- ✅ Draft review appears in ReviewBoard UI
- ✅ Review content matches what was sent

**Status**: ⬜ Not tested | ✅ Passed | ❌ Failed

---

## Test Summary

| Test # | Test Name | Status | Notes |
|--------|-----------|--------|-------|
| 1 | OAuth2 App Setup | ⬜ | |
| 2 | OAuth Setup Script | ⬜ | |
| 3 | Config File Validation | ⬜ | |
| 4 | Server Startup | ⬜ | |
| 5 | List Review Requests | ⬜ | |
| 6 | Get Review Request | ⬜ | |
| 7 | Get Diffs | ⬜ | |
| 8 | Get Diff Content | ⬜ | |
| 9 | Token Refresh | ⬜ | |
| 10 | Error Handling | ⬜ | |
| 11 | Search | ⬜ | |
| 12 | Post Review | ⬜ | |

## Common Issues and Solutions

### Issue: "Port already in use"
**Solution**: Use a different port:
```bash
export OAUTH_CALLBACK_PORT="3001"
npm run oauth-setup
```
Remember to update the redirect URI in ReviewBoard.

### Issue: "Failed to refresh access token"
**Solution**: Re-run the OAuth setup:
```bash
npm run oauth-setup
```

### Issue: "Authorization failed"
**Solution**: 
- Verify Client ID and Client Secret are correct
- Check redirect URI matches exactly
- Ensure OAuth2 application is enabled in ReviewBoard

### Issue: "ECONNREFUSED" or network errors
**Solution**:
- Verify ReviewBoard URL is correct and accessible
- Check network connectivity
- Verify ReviewBoard server is running

## Security Checklist

- ✅ `oauth-config.json` is in `.gitignore`
- ✅ File permissions on `oauth-config.json` are restrictive
- ✅ Client Secret is not exposed in logs or error messages
- ✅ Tokens are transmitted over HTTPS only
- ✅ CSRF protection (state parameter) is implemented

## Next Steps After Testing

Once all tests pass:

1. ✅ Document any issues encountered and their solutions
2. ✅ Update README if needed based on testing experience
3. ✅ Configure the server in your production MCP settings
4. ✅ Remove test review/comments created during testing
5. ✅ Set up monitoring for token refresh failures (if applicable)
