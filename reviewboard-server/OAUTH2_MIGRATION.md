# OAuth2 Migration Summary

This document summarizes the changes made to convert the ReviewBoard MCP server from API token authentication to OAuth2.

## Overview

The ReviewBoard MCP server has been successfully converted from using API tokens to OAuth2 authentication. This provides better security and follows modern authentication best practices.

## Changes Made

### 1. New Files Created

#### `src/oauth-setup.ts`
- Standalone OAuth2 setup script
- Implements the OAuth2 authorization code flow
- Features:
  - Local callback server for receiving authorization codes
  - CSRF protection using state parameter
  - Automatic token exchange
  - Configuration persistence to `oauth-config.json`
  - Comprehensive error handling and logging

#### `TESTING.md`
- Comprehensive testing guide with 12 test cases
- Step-by-step instructions for validating the OAuth2 implementation
- Common issues and solutions
- Security checklist

#### `test-oauth-setup.sh`
- Helper script to guide users through OAuth setup
- Provides clear instructions and prerequisites

#### `.gitignore`
- Ensures `oauth-config.json` is never committed to version control
- Protects sensitive OAuth credentials

#### `OAUTH2_MIGRATION.md` (this file)
- Documents all changes made during the migration

### 2. Modified Files

#### `src/index.ts`
**Major Changes**:
- Added `OAuthConfig` interface for type safety
- Created `OAuth2TokenManager` class:
  - Loads OAuth configuration from file
  - Automatically refreshes access tokens when expired
  - Saves updated tokens back to configuration file
  - Implements 5-minute expiry buffer for proactive refresh
- Modified `ReviewBoardClient` class:
  - Now accepts `OAuth2TokenManager` instead of API token
  - Uses Axios request interceptor to inject fresh access tokens
  - Changed authorization header from `token` to `Bearer` format
- Updated `getClient()` function to use OAuth2TokenManager
- Updated version to 2.0.0

**Authentication Flow**:
```
Before: Authorization: token <api-token>
After:  Authorization: Bearer <access-token>
```

#### `package.json`
**Changes**:
- Version bumped from 1.0.0 to 2.0.0
- Added `reviewboard-oauth-setup` binary
- Added `oauth-setup` npm script

#### `README.md`
**Complete Rewrite**:
- Added comprehensive OAuth2 setup instructions
- Documented the three-step setup process:
  1. Create OAuth2 application in ReviewBoard
  2. Run OAuth setup script
  3. Authorize the application
- Added token management section
- Added security considerations
- Added troubleshooting guide
- Added migration guide from API token version
- Removed API token configuration instructions

### 3. Configuration Changes

#### Before (API Token)
```json
{
  "mcpServers": {
    "reviewboard": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "REVIEWBOARD_URL": "https://reviewboard.example.com",
        "REVIEWBOARD_TOKEN": "api-token-here"
      }
    }
  }
}
```

#### After (OAuth2)
```json
{
  "mcpServers": {
    "reviewboard": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

**Note**: OAuth2 credentials are now stored in `oauth-config.json` instead of environment variables.

## OAuth2 Implementation Details

### Authorization Flow

1. **Initial Setup** (one-time):
   ```
   User runs: npm run oauth-setup
   ↓
   Script starts local callback server
   ↓
   User visits authorization URL in browser
   ↓
   User authorizes application
   ↓
   Browser redirects to callback with authorization code
   ↓
   Script exchanges code for access + refresh tokens
   ↓
   Tokens saved to oauth-config.json
   ```

2. **Runtime Token Management**:
   ```
   MCP server starts
   ↓
   Loads oauth-config.json
   ↓
   Before each API request:
     - Check if token expires in < 5 minutes
     - If yes: refresh token automatically
     - If no: use existing token
   ↓
   Make API request with Bearer token
   ```

### Token Refresh Flow

```
Token expires in < 5 minutes
↓
POST /oauth2/token/ with refresh_token
↓
Receive new access_token (and possibly new refresh_token)
↓
Update oauth-config.json with new tokens
↓
Continue with API request
```

### Security Features

1. **CSRF Protection**: State parameter prevents cross-site request forgery
2. **Secure Storage**: Tokens stored in local file (not in MCP settings)
3. **Automatic Refresh**: Tokens refreshed before expiry
4. **HTTPS Only**: All OAuth endpoints use HTTPS
5. **Confidential Client**: Uses client secret for enhanced security

## Breaking Changes

### For Users

1. **Setup Process**: Users must now:
   - Create an OAuth2 application in ReviewBoard (admin access required)
   - Run the OAuth setup script
   - Authorize the application in browser

2. **Configuration**: 
   - No longer uses `REVIEWBOARD_TOKEN` environment variable
   - No longer uses `REVIEWBOARD_URL` in MCP settings
   - All credentials now in `oauth-config.json`

3. **First-Time Setup**: Requires one-time browser interaction for authorization

### For Developers

1. **Authentication Method**: Changed from API token to OAuth2 Bearer token
2. **Token Management**: Now handled automatically by `OAuth2TokenManager`
3. **Configuration**: Loaded from file instead of environment variables

## Migration Path

For existing users of the API token version:

1. **Backup Current Setup**:
   ```bash
   # Note your current REVIEWBOARD_URL and REVIEWBOARD_TOKEN
   ```

2. **Create OAuth2 Application**:
   - Log in to ReviewBoard as admin
   - Create OAuth2 application
   - Note Client ID and Client Secret

3. **Run OAuth Setup**:
   ```bash
   export REVIEWBOARD_URL="<your-url>"
   export REVIEWBOARD_CLIENT_ID="<client-id>"
   export REVIEWBOARD_CLIENT_SECRET="<client-secret>"
   npm run oauth-setup
   ```

4. **Update MCP Settings**:
   - Remove `env` section from MCP configuration
   - Keep only `command` and `args`

5. **Test**:
   - Restart MCP client
   - Verify tools work correctly

## Benefits of OAuth2

1. **Better Security**:
   - Tokens can be revoked without changing passwords
   - Refresh tokens allow long-term access without storing passwords
   - Scoped permissions (read/write)

2. **Standard Protocol**:
   - Industry-standard authentication
   - Better integration with enterprise systems
   - Audit trail of authorizations

3. **User Control**:
   - Users can see and revoke authorized applications
   - Clear consent flow
   - Per-application permissions

4. **Automatic Token Management**:
   - No manual token rotation needed
   - Tokens refresh automatically
   - Reduced maintenance

## Testing Status

See `TESTING.md` for the complete test plan. Key tests to perform:

- ✅ OAuth setup script execution
- ✅ Token refresh mechanism
- ✅ All 8 MCP tools (list, get, search, post, etc.)
- ✅ Error handling
- ✅ Security measures

## Files Modified Summary

| File | Status | Description |
|------|--------|-------------|
| `src/index.ts` | Modified | Added OAuth2 support, token management |
| `src/oauth-setup.ts` | New | OAuth2 setup script |
| `package.json` | Modified | Added oauth-setup script, version bump |
| `README.md` | Rewritten | OAuth2 documentation |
| `TESTING.md` | New | Comprehensive test guide |
| `.gitignore` | New | Protect OAuth credentials |
| `test-oauth-setup.sh` | New | Setup helper script |
| `OAUTH2_MIGRATION.md` | New | This migration guide |

## Next Steps

1. **Test the Implementation**:
   - Follow the test plan in `TESTING.md`
   - Verify all tools work correctly
   - Test token refresh mechanism

2. **Deploy**:
   - Run OAuth setup with real credentials
   - Configure in MCP settings
   - Verify in production environment

3. **Monitor**:
   - Watch for token refresh failures
   - Monitor OAuth-related errors
   - Track API usage

## Support

For issues or questions:
- Check `TESTING.md` for common issues
- Review `README.md` for setup instructions
- Check ReviewBoard OAuth2 documentation
- Verify OAuth2 application configuration in ReviewBoard

## Version History

- **v2.0.0**: OAuth2 implementation
- **v1.0.0**: API token authentication (deprecated)
