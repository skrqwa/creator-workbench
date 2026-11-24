import { BrowserWindow, Menu, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { platformById,creatorUrl,publicUrl } from './catalog.mjs';
import { fieldsByPlatform,fillForm,findUpload,receiptFromPage,clickEditorButton,savedArticle } from './browser-forms.mjs';

const windows=new Map();
const pending=new Map();
const evaluate=(frame,fn,...args)=>frame.executeJavaScript('('+fn.toString()+')('+args.map(a=>JSON.stringify(a)).join(',')+')');
function hostOf(url) {try{return new URL(url).hostname;}catch{return '';}}
function editorFrames(win,p) {
  if(!p.hosts.includes(hostOf(win.webContents.getURL())))return [];
  return win.webContents.mainFrame.framesInSubtree.filter(frame=>p.hosts.includes(hostOf(frame.url)));
}
function openWindow(account) {
  const existing=windows.get(account.id);
  if(existing && !existing.isDestroyed()){existing.show();return existing;}
  const w=new BrowserWindow({width:1160,height:840,title:account.name,webPreferences:{partition:'persist:creator-'+account.id,sandbox:true,contextIsolation:true,nodeIntegration:false,webviewTag:false}});
  windows.set(account.id,w);
  w.webContents.on('will-navigate',(e,url)=>{if(!/^https:\/\//i.test(typeof url==='string'?url:url?.url || e.url || ''))e.preventDefault();});
  w.webContents.setWindowOpenHandler(({url})=>{
    if(/^https:\/\//i.test(url))w.loadURL(url).catch(()=>{});
    return {action:'deny'};
  });
  w.on('closed',()=>{windows.delete(account.id);});
  return w;
}
export async function openLogin(account) {
  const work=pending.get(account.id);if(work){work.w.show();work.w.focus();return {opened:true};}
  const w=openWindow(account);
  await w.loadURL(platformById[account.platform].creator);
  return {opened:true};
}
function draftUrl(platform,receipt) {
  if(receipt?.kind!=='web-draft' || !/^\d{4,32}$/.test(receipt.remoteId))return '';
  if(platform==='toutiao')return creatorUrl(platform,'article')+'?pgc_id='+receipt.remoteId;
  if(platform==='zhihu')return 'https://zhuanlan.zhihu.com/p/'+receipt.remoteId+'/edit';
  return '';
}
export async function openSavedDraft(account,receipt) {
  if(account.platform==='wechat' && receipt.kind==='wechat-draft'){
    const w=openWindow(account);
    const preview=publicUrl('wechat',receipt.url);
    await w.loadURL(preview || 'https://mp.weixin.qq.com/');
    if(!preview){
      // 在已登录页面使用平台自己的草稿箱链接，其查询参数由平台提供。
      await w.webContents.executeJavaScript(`(() => {
        const anchors=[...document.querySelectorAll('a[href]')].filter(a=>a.innerText.trim()==='草稿箱' && a.hostname==='mp.weixin.qq.com');
        if(anchors.length===1)anchors[0].click();
      })()`).catch(()=>{});
    }
    return true;
  }
  const target=draftUrl(account.platform,receipt);
  if(!target || pending.has(account.id))return false;
  await openWindow(account).loadURL(target);return true;
}
async function fileInput(win,p,files,kind,cover) {
  if(!files.length)return true;
  const token=randomUUID();let target=null;
  for(const frame of editorFrames(win,p)) {
    const result=await evaluate(frame,findUpload,kind,cover,token).catch(()=>null);
    if(result){target=result;break;}
  }
  if(!target || files.length>1 && !target.multiple)return false;
  const debug=win.webContents.debugger;
  if(debug.isAttached())return false;
  try{
    debug.attach('1.3');
    const doc=await debug.sendCommand('DOM.getDocument',{depth:-1,pierce:true});
    function locate(n) {
      const a=n.attributes || [];
      if(a.some((v,i)=>i%2===0 && v==='data-creator-upload' && a[i+1]===token))return n;
      for(const child of [...(n.children||[]),...(n.shadowRoots||[]),...(n.contentDocument?[n.contentDocument]:[])]){const r=locate(child);if(r)return r;}
    }
    const node=locate(doc.root);if(!node)return false;
    await debug.sendCommand('DOM.setFileInputFiles',{backendNodeId:node.backendNodeId,files});
    return true;
  }finally{if(debug.isAttached())debug.detach();}
}
export async function browserPublish({account,content,mode,id,update,draft}) {
  const p=platformById[account.platform], w=openWindow(account);
  const prior=pending.get(account.id);
  if(prior && mode==='submit' && draft && prior.id===draft.id)prior.detach();
  else if(prior)throw new Error('此账号已有一份材料在创作页中，请先处理或关闭该窗口');
  const {type,title,body,video,cover,images}=content;
  const flags={primary:false,cover:false,clicked:false,saveClicked:false,previewOpened:false,remoteDraft:null};
  const target=draftUrl(account.platform,draft) || creatorUrl(account.platform,type);
  const webArticle=type==='article' && ['toutiao','zhihu'].includes(p.id);
  let busy=false,finished=false,active=true,last='';
  const report=(s)=>{const tag=JSON.stringify(s);if(tag!==last){last=tag;update(s);}};
  const cleanup=()=>{active=false;clearInterval(timer);if(pending.get(account.id)?.id===id)pending.delete(account.id);};
  async function run(){
    if(busy || !active || w.isDestroyed())return;
    busy=true;
    try{
      const frames=editorFrames(w,p);
      if(!frames.length)return;
      if(finished || flags.clicked || flags.previewOpened){
        for(const f of frames){
          const rec=await evaluate(f,receiptFromPage,account.platform).catch(()=>null);
          if(rec){rec.url=publicUrl(account.platform,rec.url);report(rec);cleanup();break;}
          if(finished && webArticle && !flags.remoteDraft){
            const d=await evaluate(f,savedArticle,p.id).catch(()=>null);
            if(d){flags.remoteDraft=d;report(d);}
          }
        }
        if(active && flags.previewOpened && !flags.clicked && await evaluate(w.webContents.mainFrame,clickEditorButton,['确认发布','确认发表'])){
          flags.clicked=true;report({status:'unknown',detail:'已从草稿预览确认发表，正在等待头条号回执。'});
        }
        return;
      }
      if(!flags.primary && type==='video') flags.primary=await fileInput(w,p,[video],'video',false);
      if(!flags.primary && ['cards','article','pin'].includes(type) && images.length && !draft) flags.primary=await fileInput(w,p,images,'image',false);
      const needsCover=Boolean(cover) && (type==='video' || type==='article' && ['wechat','toutiao','bilibili'].includes(p.id));
      if(!flags.cover && needsCover && !draft)flags.cover=await fileInput(w,p,[cover],'image',true);
      const fields={title:false,body:false,editor:false,images:0};
      for(const frame of frames) {
        const r=await evaluate(frame,fillForm,fieldsByPlatform[p.id],{type,title,body},true).catch(()=>null);
        if(r){for(const k of ['title','body','editor'])fields[k] ||= r[k];fields.images=Math.max(fields.images,r.images);}
      }
      const hasMedia=type==='video'||type==='cards'?flags.primary:!images.length||fields.images>=images.length;
      const hasCover=!needsCover || flags.cover || Boolean(draft);
      if(!fields.editor && !flags.primary)return;
      if(!fields.title||!fields.body||!hasMedia||!hasCover){
        const missing=[!fields.title&&'标题',!fields.body&&'正文',!hasMedia&&'媒体',!hasCover&&'封面'].filter(Boolean);
        report({status:'needs_action',detail:'请在「'+account.name+'」创作页检查或补充'+missing.join('、')+'。可从窗口菜单打开素材目录。'});
        return;
      }
      if(webArticle && !flags.remoteDraft){
        flags.remoteDraft=await evaluate(w.webContents.mainFrame,savedArticle,p.id);
        if(!flags.remoteDraft && !flags.saveClicked)flags.saveClicked=await evaluate(w.webContents.mainFrame,clickEditorButton,['保存草稿','存为草稿','保存为草稿']);
      }
      if(mode==='review'){finished=true;report(flags.remoteDraft || {status:'prepared',detail:'材料已填入创作页，请核对账号、媒体上传结果和排版后发表。'});return;}
      if(account.platform==='toutiao' && type==='article'){
        if(!flags.remoteDraft){report({status:'needs_action',detail:'请将文章保存到草稿箱。工作台等待该稿件的保存提示和编号，再从这一份草稿提交通知。'});return;}
        flags.previewOpened=await evaluate(w.webContents.mainFrame,clickEditorButton,['预览并发布','预览并发表']);
        if(!flags.previewOpened)flags.clicked=await evaluate(w.webContents.mainFrame,clickEditorButton,['确认发布','确认发表','发表','发布']);
        if(flags.clicked)report({status:'unknown',remoteId:flags.remoteDraft.remoteId,detail:'已点击头条号发表，等待平台返回结果。'});
        else if(!flags.previewOpened)report({status:'needs_action',detail:'头条草稿已保存，请在创作页检查发表入口。'});
      }
    }finally{busy=false;}
  }
  pending.set(account.id,{id,w,detach:cleanup});
  const timer=setInterval(()=>{run().catch(()=>{});},1800);timer.unref();
  w.on('closed',()=>{
    if(active && (!flags.remoteDraft || flags.clicked))report({status:flags.clicked?'unknown':'needs_action',detail:'创作窗口已关闭，请在平台核对当前作品。'});
    cleanup();
  });
  w.setMenu(Menu.buildFromTemplate([{label:'创作工作台',submenu:[
    {label:'再次检查填写结果',click:()=>{finished=false;run().catch(()=>{});}},
    {label:'打开本次媒体目录',enabled:Boolean(video||images[0]||cover),click:()=>shell.showItemInFolder(video||images[0]||cover)},
    {label:'关闭创作窗口',role:'close'}]}]));
  try{await w.loadURL(target);}catch(e){cleanup();throw new Error('创作页未能打开：'+e.message);}
  setTimeout(()=>run().catch(()=>{}),600);
  return {status:'needs_action',detail:'创作页已打开，请确认登录「'+account.name+'」，工作台将在编辑器就绪后填入材料。'};
}
export function focusReview(id) {
  for (const {id:rid,w} of pending.values())if(rid===id && !w.isDestroyed()){w.show();w.focus();return true;}
  return false;
}
