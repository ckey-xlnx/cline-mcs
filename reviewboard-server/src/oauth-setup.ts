#!/usr/bin/env node

import * as http from 'http';
import * as url from 'url';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface OAuthConfig {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: number;
  client_id: string;
  client_secret: string;
  reviewboard_url: string;
}

const CONFIG_FILE = path.join(__dirname, '..', 'oauth-config.json');

// Generate a random state for CSRF protection
function generateState(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Start a local server to receive the OAuth callback
function startCallbackServer(port: number): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url || '', true);
      
      if (parsedUrl.pathname === '/callback') {
        const code = parsedUrl.query.code as string;
        const state = parsedUrl.query.state as string;
        const error = parsedUrl.query.error as string;

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<html><body><h1>Authorization Failed</h1><p>Error: ${error}</p></body></html>`);
          server.close();
          reject(new Error(`Authorization failed: ${error}`));
          return;
        }

        if (code && state) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Authorization Successful!</h1><p>You can close this window and return to the terminal.</p></body></html>');
          server.close();
          resolve({ code, state });
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Invalid Request</h1><p>Missing code or state parameter.</p></body></html>');
          server.close();
          reject(new Error('Missing code or state parameter'));
        }
      }
    });

    server.listen(port, () => {
      console.log(`\n[OAuth] Callback server listening on http://localhost:${port}/callback`);
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

// Exchange authorization code for access token
async function exchangeCodeForToken(
  reviewboardUrl: string,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token: string; token_type: string; expires_in: number }> {
  console.log('[OAuth] Exchanging authorization code for access token...');
  
  try {
    const response = await axios.post(
      `${reviewboardUrl}/oauth2/token/`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    console.log('[OAuth] Successfully obtained access token');
    return response.data;
  } catch (error: any) {
    console.error('[Error] Failed to exchange code for token:', error.response?.data || error.message);
    throw new Error(`Failed to exchange code for token: ${error.message}`);
  }
}

// Save OAuth configuration to file
function saveConfig(config: OAuthConfig): void {
  console.log(`[OAuth] Saving configuration to ${CONFIG_FILE}`);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log('[OAuth] Configuration saved successfully');
}

// Main OAuth setup flow
async function main() {
  console.log('=== ReviewBoard OAuth2 Setup ===\n');

  // Get configuration from environment or prompt
  const reviewboardUrl = process.env.REVIEWBOARD_URL;
  const clientId = process.env.REVIEWBOARD_CLIENT_ID;
  const clientSecret = process.env.REVIEWBOARD_CLIENT_SECRET;
  const callbackPort = parseInt(process.env.OAUTH_CALLBACK_PORT || '3000');

  if (!reviewboardUrl || !clientId || !clientSecret) {
    console.error('[Error] Missing required environment variables:');
    console.error('  - REVIEWBOARD_URL: Your ReviewBoard server URL');
    console.error('  - REVIEWBOARD_CLIENT_ID: OAuth2 client ID');
    console.error('  - REVIEWBOARD_CLIENT_SECRET: OAuth2 client secret');
    console.error('\nOptional:');
    console.error('  - OAUTH_CALLBACK_PORT: Port for OAuth callback (default: 3000)');
    console.error('\nTo create an OAuth2 application in ReviewBoard:');
    console.error('  1. Log in to ReviewBoard as an administrator');
    console.error('  2. Go to Admin > Integrations > OAuth2 Applications');
    console.error('  3. Create a new application with:');
    console.error(`     - Redirect URI: http://localhost:${callbackPort}/callback`);
    console.error('     - Client type: Confidential');
    console.error('     - Authorization grant type: Authorization code');
    process.exit(1);
  }

  const redirectUri = `http://localhost:${callbackPort}/callback`;
  const state = generateState();

  // Build authorization URL
  const authUrl = new URL(`${reviewboardUrl}/oauth2/authorize/`);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', 'read write');

  console.log('\n[OAuth] Please authorize the application by visiting this URL:\n');
  console.log(authUrl.toString());
  console.log('\n[OAuth] Waiting for authorization...\n');

  try {
    // Start callback server and wait for authorization
    const callbackPromise = startCallbackServer(callbackPort);
    const { code, state: returnedState } = await callbackPromise;

    // Verify state to prevent CSRF
    if (state !== returnedState) {
      throw new Error('State mismatch - possible CSRF attack');
    }

    console.log('[OAuth] Authorization code received');

    // Exchange code for token
    const tokenData = await exchangeCodeForToken(
      reviewboardUrl,
      clientId,
      clientSecret,
      code,
      redirectUri
    );

    // Calculate token expiration time
    const expiresAt = Date.now() + (tokenData.expires_in * 1000);

    // Save configuration
    const config: OAuthConfig = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type,
      expires_at: expiresAt,
      client_id: clientId,
      client_secret: clientSecret,
      reviewboard_url: reviewboardUrl,
    };

    saveConfig(config);

    console.log('\n✓ OAuth2 setup completed successfully!');
    console.log('\nYou can now use the ReviewBoard MCP server with OAuth2 authentication.');
    console.log('The server will automatically refresh the access token when needed.');
    
  } catch (error: any) {
    console.error('\n[Error] OAuth setup failed:', error.message);
    process.exit(1);
  }
}

main();
