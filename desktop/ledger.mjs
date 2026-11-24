import path from 'node:path';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { atomicJSON, readJSON, fingerprint } from './storage.mjs';
import { publicUrl } from './catalog.mjs';

const states=new Set(['running','prepared','draft','submitted','reviewing','published','failed','needs_action','unknown']);
const protectedStates=new Set(['running','submitted','reviewing','published','unknown']);
function sameAccount(r,a) {
  if(r.accountId===a.id)return true;
  if(r.platform!==a.platform)return false;
  if(r.platformUid && a.platformUid)return r.platformUid===a.platformUid;
  return Boolean(a.name && r.accountName===a.name);
}
async function hashFile(file) {
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function contentKey(content) {
  const {images=[],video,cover,...fields}=content;
  const hashes=new Map();
  for(const p of [...new Set([video,cover,...images].filter(Boolean))]) hashes.set(p,await hashFile(p));
  return fingerprint([fields,hashes.get(video)||'',hashes.get(cover)||'',images.map(x=>hashes.get(x))]);
}
export class Ledger {
  constructor(folder) {this.file=path.join(folder,'.creator-receipts.json');}
  all() {return readJSON(this.file,[]);}
  get(id) {const r=this.all().find(x=>x.id===id);if(!r)throw new Error('找不到发布记录');return r;}
  change(id,updates) {
    const items=this.all();const r=items.find(x=>x.id===id);
    if (!r) throw new Error('找不到发布记录');
    const status=updates?.status;
    if(!states.has(status)) throw new Error('服务返回了无法识别的发布状态');
    if(r.status==='published' && status!=='published' && updates.withdrawn!==true) return r;
    const patch={...updates};
    if('url' in patch) patch.url=publicUrl(r.platform,patch.url);
    for (const key of ['accountId','accountName','id','platform','mode','key','projectId']) delete patch[key];
    Object.assign(r,patch,{updatedAt:new Date().toISOString()});
    atomicJSON(this.file,items);return r;
  }
  start(account,project,mode,key,title,session) {
    const items=this.all();
    const withdrawn=items.find(x=>sameAccount(x,account) && x.key===key && x.withdrawn);
    if(withdrawn)return {run:false,receipt:withdrawn};
    const previous=items.find(x=>sameAccount(x,account) && x.key===key &&
      (x.mode===mode || mode==='submit' && protectedStates.has(x.status)) &&
      (protectedStates.has(x.status) || mode==='review' && ['draft','prepared'].includes(x.status)));
    if(previous)return {run:false,receipt:previous};
    const reused=mode==='submit' ? items.find(x=>x.accountId===account.id && x.key===key && x.status==='draft' && x.remoteId) : null;
    const r={id:randomUUID(),accountId:account.id,accountName:account.name,platformUid:account.platformUid || '',platform:account.platform,projectId:project.id,title,mode,key,status:'running',session,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    items.unshift(r);atomicJSON(this.file,items);return {run:true,receipt:r,draft:reused};
  }
  recover(session) {
    const items=this.all();let changed=false;
    for (const r of items) {
      if(r.session===session || !['running','prepared'].includes(r.status))continue;
      r.status=r.mode==='submit'?'unknown':'needs_action';
      r.detail='上一次工作台关闭时，操作尚未返回。请在平台核对实际记录。';
      r.updatedAt=new Date().toISOString();changed=true;
    }
    if(changed) atomicJSON(this.file,items);
    return items;
  }
}
