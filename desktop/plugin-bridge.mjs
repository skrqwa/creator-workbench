import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { publicUrl } from './catalog.mjs';

export const pluginIds={douyin:'douyin',xiaohongshu:'xhs',channels:'wxSph'};
const clientFile=fileURLToPath(new URL('./plugin-client.js',import.meta.url));
const page='<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Creator Workbench · 浏览器发布</title><style>body{background:#15202c;color:#f1f3f4;font:17px/1.7 system-ui;max-width:680px;margin:10vh auto;padding:30px}h1{font-size:28px}button,a{color:#9dd6ee}button{background:#25384a;border:1px solid #59758a;padding:9px 16px;cursor:pointer}p{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Creator Workbench · 浏览器发布</h1><h2 id="title">正在连接本机工作台</h2><p id="status" role="status"></p><button id="retry" hidden>重新检查插件和账号</button><p><a href="https://docs.aitoearn.ai/zh/use/plugin-publish/index" target="_blank" rel="noreferrer">AiToEarn 插件安装与本机域名授权说明</a></p><script src="/client.js"></script></html>';
export const mimeTypes={'.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.wav':'audio/wav','.mp3':'audio/mpeg','.m4a':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg'};
export class PluginBridge {
  constructor(openExternal,port=24683){this.openExternal=openExternal;this.port=port;this.tasks=new Map();}
  async listen() {
    if(this.ready)return this.ready;
    this.server=http.createServer((req,res)=>{this.handle(req,res).catch(()=>{if(!res.headersSent)res.writeHead(400);res.end();});});
    this.ready=new Promise((resolve,reject)=>{
      this.server.once('error',reject);
      this.server.listen(this.port,'127.0.0.1',()=>{this.port=this.server.address().port;resolve();});
    });
    try{await this.ready;}catch(e){this.ready=null;throw e;}
  }
  async start(account,content,update,id) {
    await this.listen();
    const token=crypto.randomBytes(32).toString('hex');
    const files=[];
    const add=p=>{if(!p)return null;const i=files.length;files.push(p);return {index:i,name:path.basename(p),type:mimeTypes[path.extname(p).toLowerCase()]||'application/octet-stream'};};
    const data={platform:pluginIds[account.platform],expected:account.name,uid:account.platformUid || '',title:content.title,desc:content.body,type:content.type==='video'?'video':'image',video:add(content.video),cover:add(content.cover),images:content.images.map(add),platformConfig:content.platformConfig || undefined};
    if(data.type==='image' && (!files.length || !data.images.length || data.images.length>(account.platform==='xiaohongshu'?9:35))) throw new Error('图集张数超出该平台允许的范围');
    if(data.type==='video' && (!data.video || ['xiaohongshu','channels'].includes(account.platform) && !data.cover)) throw new Error('此平台的视频需要完整的视频和封面');
    const task={id,account,files,data,update,started:false,done:false};
    const expire=()=>{if(!this.tasks.delete(token))return;update({status:task.started?'unknown':'needs_action',detail:task.started?'浏览器尚未返回结果，请在平台核对作品。':'连接已过期，请重新打开发布。'});};
    task.timer=setTimeout(expire,45*60*1000);task.timer.unref();
    this.tasks.set(token,task);
    try{await this.openExternal('http://127.0.0.1:'+this.port+'/bridge#'+token);}catch(e){this.tasks.delete(token);clearTimeout(task.timer);throw e;}
    return {status:'running',detail:'请在打开的浏览器中检查插件和目标账号。'};
  }
  async resume(id) {
    for(const [token,task] of this.tasks) if(task.id===id && !task.done){
      await this.openExternal('http://127.0.0.1:'+this.port+'/bridge#'+token);
      return true;
    }
    return false;
  }
  async handle(req,res) {
    const origin='http://127.0.0.1:'+this.port;
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    if(req.headers.host!=='127.0.0.1:'+this.port || req.headers.origin && req.headers.origin!==origin){res.writeHead(403);return res.end();}
    if(req.method==='GET' && req.url==='/bridge'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(page);}
    if(req.method==='GET' && req.url==='/client.js'){res.setHeader('Content-Type','application/javascript; charset=utf-8');return res.end(fs.readFileSync(clientFile));}
    const token=req.headers.authorization?.replace(/^Bearer /,'');const task=this.tasks.get(token);
    if(!task || task.done){res.writeHead(403);return res.end();}
    const send=data=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));};
    if(req.url==='/payload' && req.method==='GET')return send({...task.data,started:task.started});
    if(req.method==='GET' && /^\/media\/\d+$/.test(req.url)){
      const file=task.files[Number(req.url.split('/')[2])];if(!file){res.writeHead(404);return res.end();}
      res.setHeader('Content-Type',mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream');
      const input=fs.createReadStream(file);input.on('error',()=>res.destroy());res.on('close',()=>input.destroy());return input.pipe(res);
    }
    if(req.method==='POST' && req.url==='/begin'){
      if(task.started){res.writeHead(409);return res.end();}
      task.started=true;task.update({status:'running',detail:'浏览器已开始提交'});return send({ok:true});
    }
    if(req.method==='POST' && req.url==='/notice'){
      if(!task.started)task.update({status:'running',detail:'请在浏览器页面检查登录账号和插件授权。'});
      return send({ok:true});
    }
    if(req.method==='POST' && req.url==='/result' && task.started){
      let body='';for await(const b of req){body+=b.toString();if(body.length>10000)throw new Error('响应过长');}
      const data=JSON.parse(body);
      const url=publicUrl(task.account.platform,data.url);
      task.done=true;clearTimeout(task.timer);this.tasks.delete(token);
      task.update({status:data.success===true?'submitted':'unknown',remoteId:String(data.remoteId || '').slice(0,300),url,detail:data.success===true?'插件已提交，公开状态请在作品页核对。':'提交结果待核对。'+String(data.detail || '').slice(0,400)});
      return send({ok:true});
    }
    res.writeHead(404);res.end();
  }
  close(){for(const task of this.tasks.values())clearTimeout(task.timer);this.tasks.clear();this.server?.close();}
}
