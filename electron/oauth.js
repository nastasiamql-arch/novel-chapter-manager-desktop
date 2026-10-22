'use strict';
const { createServer } = require('node:http');
const { randomBytes, createHash } = require('node:crypto');
const VALID_ID = /^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/;
async function authorizeDesktop(clientId, openBrowser) {
  if (typeof clientId !== 'string' || !VALID_ID.test(clientId.trim())) {
    throw new Error('Enter a Google OAuth Desktop application Client ID');
  }
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(24).toString('base64url');
  let completed = false, resolver, timer;
  const codePromise = new Promise((resolve, reject) => { resolver = {resolve, reject}; });
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method !== 'GET' || url.pathname !== '/') {
      res.writeHead(404).end('Not found'); return;
    }
    if (completed) { res.writeHead(409).end('Already completed'); return; }
    if (url.searchParams.get('state') !== state) {
      res.writeHead(400).end('Invalid state'); return;
    }
    completed = true;
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400).end('Authorization rejected');
      resolver.reject(new Error(url.searchParams.get('error') || 'Missing authorization code'));
      return;
    }
    res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store'})
      .end('Connected to Google. You can close this tab.');
    resolver.resolve(code);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    // Desktop OAuth loopback redirect must be an origin with a random port (no extra path).
    const redirect_uri = 'http://127.0.0.1:' + server.address().port;
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for (const [key, val] of Object.entries({
      client_id:clientId.trim(), redirect_uri, response_type:'code',
      scope:'https://www.googleapis.com/auth/drive.file', state,
      code_challenge:challenge, code_challenge_method:'S256',
      access_type:'online', prompt:'consent'
    })) auth.searchParams.set(key,val);
    timer = setTimeout(() => {
      if (!completed) { completed=true; resolver.reject(new Error('Google authorization timed out')); }
    }, 180000);
    await openBrowser(auth.href);
    const code = await codePromise;
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({
        client_id:clientId.trim(), code, code_verifier:verifier, redirect_uri, grant_type:'authorization_code'
      }),
      signal:AbortSignal.timeout(30000)
    });
    const payload = await response.json();
    if (!response.ok || !payload.access_token) {
      throw new Error(payload.error_description || payload.error || 'Google OAuth token exchange failed');
    }
    return { access_token:payload.access_token };
  } finally {
    clearTimeout(timer);
    server.close();
    if (!completed) {
      completed=true;
      resolver.reject(new Error('Authorization interrupted'));
      void codePromise.catch(() => {});
    }
  }
}
module.exports = { authorizeDesktop };
