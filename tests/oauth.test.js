'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateCredentials,save,load,clear}=require('../electron/credential-store');
const {refresh,tokenRequest,GOOGLE_SCOPES}=require('../electron/oauth');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const credential={installed:{client_id:'1234-desktop.apps.googleusercontent.com',client_secret:'example-secret'}};
test('rejects web client and malformed desktop configuration',()=>{
  assert.throws(()=>validateCredentials({web:credential.installed}));
  assert.throws(()=>validateCredentials({installed:{client_id:credential.installed.client_id}}));
  assert.equal(validateCredentials(credential).client_secret,'example-secret');
});
test('refresh sends client secret but never stores access token',async()=>{
  let args;
  const mock=async(_,request)=>{
    args=Object.fromEntries(new URLSearchParams(request.body));
    return {ok:true,json:async()=>({access_token:'temporary',expires_in:3600})};
  };
  const data=await refresh({...validateCredentials(credential),refresh_token:'long-lived'},mock);
  assert.equal(data.access_token,'temporary');
  assert.equal(args.client_secret,'example-secret');
  assert.equal(args.grant_type,'refresh_token');
  assert.equal(args.refresh_token,'long-lived');
});
test('encrypted persistence restores token and clear deletes credentials',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ncm-auth-'));
  const safeStorage={
    isEncryptionAvailable:()=>true,
    getSelectedStorageBackend:()=> 'dpapi',
    encryptString:value=>Buffer.from('encrypted:'+value,'utf8'),
    decryptString:value=>value.toString('utf8').replace(/^encrypted:/,'')
  };
  try{
    const data={...validateCredentials(credential),refresh_token:'test-refresh'};
    await save(dir,safeStorage,data);
    assert.deepEqual(await load(dir,safeStorage),data);
    assert.ok(!(await fs.readFile(path.join(dir,'google-oauth.enc'),'utf8')).startsWith('{'));
    await clear(dir);
    assert.equal(await load(dir,safeStorage),null);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('does not store secrets without system encryption',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ncm-auth-'));
  try{
    await assert.rejects(save(dir,{isEncryptionAvailable:()=>false},validateCredentials(credential)));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('new credentials require upgraded Google Docs scope, without losing legacy tokens',()=>{
  const modern=validateCredentials(credential);
  assert.equal(modern.version,2);
  assert.match(GOOGLE_SCOPES,/https:\/\/www\.googleapis\.com\/auth\/documents/);
  assert.match(GOOGLE_SCOPES,/https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
});
test('legacy OAuth credentials stay readable so users can reconnect without reimporting JSON',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ncm-legacy-'));
  const safeStorage={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'dpapi',encryptString:v=>Buffer.from(v),decryptString:v=>v.toString('utf8')};
  try{
    const old={...validateCredentials(credential),version:1,refresh_token:'old-scope-token'};
    await save(dir,safeStorage,old);
    assert.deepEqual(await load(dir,safeStorage),old);
    const upgraded={...old,version:2,refresh_token:'new-scope-token'};
    await save(dir,safeStorage,upgraded);
    assert.deepEqual(await load(dir,safeStorage),upgraded);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
