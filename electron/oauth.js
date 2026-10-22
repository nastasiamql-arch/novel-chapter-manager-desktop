'use strict';
const {createServer}=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const VALID_ID=/^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/;

async function tokenRequest(params,post=fetch) {
  const response=await post('https://oauth2.googleapis.com/token',{
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams(params), signal:AbortSignal.timeout(30000)
  });
  const data=await response.json();
  if(!response.ok || !data.access_token) {
    const error=new Error(data.error_description||data.error||'Google token request failed');
    error.oauthCode=data.error||'';
    throw error;
  }
  return data;
}
async function refresh(credentials,post=fetch) {
  if(!credentials?.refresh_token)throw new Error('No stored Google refresh token');
  return tokenRequest({client_id:credentials.client_id,client_secret:credentials.client_secret,
    refresh_token:credentials.refresh_token,grant_type:'refresh_token'},post);
}
async function authorizeDesktop(credentials,openBrowser,post=fetch) {
  if(!VALID_ID.test(credentials?.client_id||'') || !credentials.client_secret)
    throw new Error('ต้องนำเข้า OAuth JSON ประเภท Desktop app ก่อนเชื่อม Google');
  const verifier=randomBytes(48).toString('base64url');
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  const state=randomBytes(24).toString('base64url');
  let done=false,settle,timer;
  const codePromise=new Promise((resolve,reject)=>{settle={resolve,reject};});
  const server=createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    if(req.method!=='GET'||url.pathname!=='/'){res.writeHead(404).end('Not found');return;}
    if(url.searchParams.get('state')!==state){res.writeHead(400).end('Invalid state');return;}
    if(done){res.writeHead(409).end('Already completed');return;}
    done=true;
    const code=url.searchParams.get('code');
    res.writeHead(code?200:400,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'})
      .end(code?'Connected to Google. You may close this tab.':'Authorization declined.');
    if(code)settle.resolve(code);else settle.reject(new Error(url.searchParams.get('error')||'Missing authorization code'));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try {
    const redirect_uri='http://127.0.0.1:'+server.address().port;
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for(const [k,v] of Object.entries({client_id:credentials.client_id,redirect_uri,
      response_type:'code',scope:'https://www.googleapis.com/auth/drive.file',
      state,code_challenge:challenge,code_challenge_method:'S256',
      access_type:'offline',prompt:'consent'}))url.searchParams.set(k,v);
    timer=setTimeout(()=>{if(!done){done=true;settle.reject(new Error('หมดเวลารอ Google authorization'));}},180000);
    await openBrowser(url.href);
    const code=await codePromise;
    return tokenRequest({client_id:credentials.client_id,client_secret:credentials.client_secret,
      code,code_verifier:verifier,redirect_uri,grant_type:'authorization_code'},post);
  }finally{
    clearTimeout(timer);
    server.close();
    if(!done){done=true;settle.reject(new Error('Authorization interrupted'));void codePromise.catch(()=>{});}
  }
}
module.exports={authorizeDesktop,refresh,tokenRequest};
