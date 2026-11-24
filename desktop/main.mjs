import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Library, safeAsset, projectDirectory, webUrl, publicAccount, platformInfo, contentFor, text } from './storage.mjs';
import { platforms, platformById, modesFor, publicUrl } from './catalog.mjs';
import { fetchTopics, mergeTopics, makeTopic } from './topics.mjs';
import { Ledger, contentKey } from './ledger.mjs';
import { createExample, renderProject, runOpenScreen, synthesizeVoice } from './media.mjs';
import { sendOfficial, checkOfficial, providerFields } from './providers/index.mjs';
import { browserPublish, focusReview, openLogin, openSavedDraft } from './browser.mjs';
import { PluginBridge, mimeTypes } from './plugin-bridge.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const sessionId=randomUUID();
if(process.env.CREATOR_WORKBENCH_PROFILE) app.setPath('userData',path.resolve(process.env.CREATOR_WORKBENCH_PROFILE));
protocol.registerSchemesAsPrivileged([{scheme:'studio-media',privileges:{standard:true,secure:true,stream:true,supportFetchAPI:true}}]);
const locked=app.requestSingleInstanceLock();
let main,library;
const bridge=new PluginBridge(url=>shell.openExternal(url));
const exporting=new Set();
const exts={image:['png','jpg','jpeg','webp','gif','svg'],video:['mp4','mov','m4v','webm'],audio:['wav','mp3','m4a','ogg','flac','aac']};
const toolKeys=['openScreenExe','voicePython','voiceScript','voiceTemplate'];
const sendProgress=(data)=>{if(main && !main.isDestroyed())main.webContents.send('workbench:progress',data);};
function safeMessage(error) {
  return String(error?.message || error || '操作失败').replace(/(access_token|refresh_token|appsecret|app_secret|authorization|access_key|client_secret)([=: ]+)[^&\s]+/gi,'$1$2***').slice(0,520);
}
function accountFor(id) {const a=library.config.accounts.find(x=>x.id===id);if(!a)throw new Error('找不到该账号');return a;}
function secrets(account) {return account.encrypted?JSON.parse(safeStorage.decryptString(Buffer.from(account.encrypted,'base64'))):{};}
function accounts(){return library.config.accounts.map(publicAccount);}
const trustedDev=()=>!app.isPackaged && process.env.CREATOR_WORKBENCH_DEV==='1';
const page=()=>trustedDev()?'http://127.0.0.1:5173/':pathToFileURL(path.join(here,'../dist/index.html')).href;
function showMain(){
  main=new BrowserWindow({width:1440,height:940,minWidth:740,minHeight:590,show:false,backgroundColor:'#16202c',autoHideMenuBar:true,title:'Creator Workbench · 创作工作台',webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webviewTag:false}});
  main.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  main.webContents.on('will-navigate',(e,target)=>{if(typeof target!=='string' || target.split('#')[0]!==page())e.preventDefault();});
  main.once('ready-to-show',()=>main?.show());main.on('closed',()=>{main=null;});
  return main.loadURL(page());
}
async function chooseFile(options) {const r=await dialog.showOpenDialog(main,options);return r.canceled?[]:r.filePaths;}
function filesInside(folder,relative) {
  const input=safeAsset(folder,relative);
  if(!mimeTypes[path.extname(input).toLowerCase()]) throw new Error('该文件不支持预览');
  return input;
}
async function importAssets(type) {
  const arr=type==='media'?[...exts.image,...exts.video]:exts[type==='images'?'image':type];
  if(!arr)throw new Error('不支持的素材类型');
  const folder=library.root();
  const picks=await chooseFile({title:'导入工程素材',properties:type==='images'?['openFile','multiSelections']:['openFile'],filters:[{name:'媒体',extensions:arr}]});
  if(library.root()!==folder)throw new Error('工程已经切换，请重新选择素材');
  projectDirectory(folder,'assets');
  const paths=[];
  for(const file of picks){
    const ext=path.extname(file).slice(1).toLowerCase();if(!arr.includes(ext))throw new Error('请选择支持的媒体文件');
    const rel='assets/'+randomUUID()+'-'+path.basename(file).replace(/[^\p{L}\p{N}._-]/gu,'_').slice(-110);
    fs.copyFileSync(file,path.join(folder,rel),fs.constants.COPYFILE_EXCL);paths.push(rel);
  }
  return {paths};
}
function checkCredentials(raw,platform) {
  const allowed=new Set((providerFields[platform] || []).map(item=>item.key));
  return Object.fromEntries(Object.entries(raw||{}).filter(([k,v])=>allowed.has(k) && typeof v==='string' && v.trim()).map(([k,v])=>[k,v.trim()]));
}
async function saveAccount(data) {
  const p=platformById[data?.platform];
  if(!p || !p.channels.includes(data.channel) || !text(data.name,130).trim())throw new Error('请指定平台、接入方式和实际账号名称');
  const previous=data.id?accountFor(data.id):null;
  if(previous && (previous.platform!==p.id || previous.channel!==data.channel))throw new Error('请为新平台或接入方式单独添加账号');
  const candidate={...secrets(previous||{}),...checkCredentials(data.credentials,p.id)};
  let encrypted='';
  if(Object.keys(candidate).length) {
    if(!safeStorage.isEncryptionAvailable())throw new Error('系统凭据保护不可用，请先启用系统钥匙串');
    encrypted=safeStorage.encryptString(JSON.stringify(candidate)).toString('base64');
  }
  const subject=p.id==='wechat' && data.subject!=='institution'?'personal':p.id==='wechat'?'institution':'';
  const direct=data.capabilities?.includes('submit') && subject!=='personal';
  const a={id:previous?.id||randomUUID(),platform:p.id,name:text(data.name,130).trim(),platformUid:text(data.platformUid,200).trim(),channel:data.channel,subject,capabilities:['review',...(direct?['submit']:[])],encrypted,credentialKeys:Object.keys(candidate)};
  if(library.config.accounts.some(v=>v.id!==a.id && v.platform===a.platform && v.name===a.name && v.channel===a.channel))throw new Error('已连接同名账号');
  library.config.accounts=[...library.config.accounts.filter(v=>v.id!==a.id),a];library.persist();return accounts();
}
function preview(p) {
  const folder=library.root(),c=contentFor(folder,library.project(),p), relative=f=>f?path.relative(folder,f).split(path.sep).join('/'):'';
  return {...c,cover:relative(c.cover),video:relative(c.video),images:c.images.map(relative)};
}
async function dispatchOne({account,project,folder,mode,existingKey}) {
  const ledger=new Ledger(folder);
  let content,key;
  try{content=contentFor(folder,project,account.platform);key=await contentKey(content);}
  catch(e){const r=ledger.start(account,project,mode,'unprepared:'+project.revision,project.name,sessionId);if(r.run)ledger.change(r.receipt.id,{status:'failed',detail:safeMessage(e)});return;}
  if(existingKey && !existingKey.startsWith('unprepared:') && existingKey!==key)throw new Error('发布版本已修改，请预览最新内容后重新发起');
  if(library.active?.id!==project.id || library.project().revision!==project.revision)throw new Error('作品已更改，请重新预览');
  const {run,receipt,draft}=ledger.start(account,project,mode,key,content.title,sessionId);
  if(!run){if(mode==='review' && !focusReview(receipt.id))await openSavedDraft(account,receipt);return;}
  const update=r=>{const value=ledger.change(receipt.id,r);sendProgress({type:'receipt',id:value.id,status:value.status});return value;};
  if(!modesFor(account,content.type).includes(mode)){update({status:'failed',detail:'账号或内容类型不支持此发布方式'});return;}
  try {
    if(account.channel==='api' && (mode==='submit'||account.platform==='wechat')){
      const result=await sendOfficial({platform:account.platform,mode,credentials:secrets(account),content,receipt:draft || undefined});
      update(result);
      if(mode==='review' && result.kind==='wechat-draft' && result.status==='draft'){
        const checked=await checkOfficial({platform:'wechat',credentials:secrets(account),receipt:result});
        update(checked);
        await openSavedDraft(account,checked).catch(()=>{});
      }
      return;
    }
    if(mode==='submit' && account.channel==='plugin'){
      const result=await bridge.start(account,content,update,receipt.id);
      if(ledger.get(receipt.id).status==='running')update(result);return;
    }
    const result=await browserPublish({account,content,mode,id:receipt.id,update,draft});
    if(ledger.get(receipt.id).status==='running')update(result);
  }catch(e){update({status:mode==='submit' && account.channel==='api'?'unknown':'failed',detail:safeMessage(e)});}
}
async function publishBatch({accountIds,mode,confirmed,projectRevision}) {
  if(confirmed!==true || !['review','submit'].includes(mode))throw new Error('请先预览并确认操作');
  const ids=[...new Set(accountIds||[])];if(!ids.length || ids.length>100)throw new Error('请选择发布账号');
  const project=library.project(),folder=library.root();
  if(projectRevision!==undefined && projectRevision!==project.revision)throw new Error('预览已过期，请重新检查作品');
  for (const id of ids) await dispatchOne({account:accountFor(id),project,folder,mode});
  return new Ledger(folder).all();
}
async function checkReceipt(id) {
  const ledger=new Ledger(library.root()),r=ledger.get(id),a=accountFor(r.accountId);
  if(a.channel==='api' && (r.remoteId||r.kind)) {
    try {const result=await checkOfficial({platform:a.platform,credentials:secrets(a),receipt:r});ledger.change(id,result);}
    catch(e){ledger.change(id,{status:r.status,detail:'回查未完成。'+safeMessage(e)});}
  }else if(focusReview(id) || await bridge.resume(id) || await openSavedDraft(a,r)){}
  else if(r.url && publicUrl(r.platform,r.url))await shell.openExternal(r.url);
  else if(r.status==='unknown' || r.status==='submitted' || r.status==='reviewing')await openLogin(a);
  const current=ledger.get(id);
  ledger.change(id,{status:current.status,lastCheckedAt:new Date().toISOString()});
  return ledger.all();
}
async function exportCurrent(){
  const folder=library.root(),project=library.project();
  if(exporting.has(folder))throw new Error('该工程正在导出，请等待完成');
  exporting.add(folder);
  try{
    const result=await renderProject(folder,project,{onProgress:v=>sendProgress({type:'export',projectId:project.id,...v})});
    return library.commitExport(folder,project,result);
  }finally{exporting.delete(folder);}
}
async function openScreen(opts) {
  const settings=library.settings,exe=settings.openScreenExe;
  if(!exe || !fs.existsSync(exe))throw new Error('请在设置中选择 OpenScreen v2.3 或更新版本的程序');
  if(opts.action==='launch'){
    if(process.platform==='darwin' && exe.endsWith('.app')){const msg=await shell.openPath(exe);if(msg)throw new Error(msg);}
    else{const child=spawn(exe,[],{detached:true,stdio:'ignore',windowsHide:false});await new Promise((res,rej)=>{child.once('spawn',res);child.once('error',rej);});child.unref();}
    return {started:true};
  }
  let executable=exe;
  if(process.platform==='darwin' && exe.endsWith('.app')) {
    const directory=path.join(exe,'Contents','MacOS');
    executable=path.join(directory,fs.readdirSync(directory).find(f=>f.toLowerCase()==='openscreen') || 'Openscreen');
  }
  const sources=async()=>{const r=await runOpenScreen({executable,action:'sources'});return {sources:r.windows || r.sources || []};};
  if(opts.action==='sources')return sources();
  const folder=library.root(),assets=projectDirectory(folder,'assets');
  let projectPath;
  if(opts.action==='import'){
    const [picked]=await chooseFile({title:'选择已经调整推镜的 OpenScreen 工程',properties:['openFile'],filters:[{name:'OpenScreen',extensions:['openscreen']}]});if(!picked)return null;
    projectPath=picked;
  }else if(opts.action==='record'){
    const selection=(await sources()).sources.filter(w=>w.id===opts.sourceId);
    if(selection.length!==1)throw new Error('选中的窗口已关闭或已变更，请重新选择');
    const result=await runOpenScreen({executable,action:'record',folder:assets,sourceId:opts.sourceId,windowId:opts.sourceId,windowTitle:selection[0].name,seconds:Math.max(2,Math.min(300,Number(opts.duration)||20))});
    projectPath=result.projectPath;
  }else throw new Error('不支持的录屏操作');
  const rel='assets/recording-'+randomUUID()+'.mp4';
  await runOpenScreen({executable,action:'export',projectPath,output:path.join(folder,rel),autoZoom:opts.action==='record'});
  safeAsset(folder,rel);
  const openScreenProject=opts.action==='record' ? path.relative(folder,projectPath).split(path.sep).join('/') : '';
  if(openScreenProject)safeAsset(folder,openScreenProject);
  return {path:rel,openScreenProject};
}
async function makeVoice({sceneId}){
  const folder=library.root(),project=library.project(),s=project.scenes.find(v=>v.id===sceneId);
  if(!s?.text)throw new Error('请先保存分镜旁白');
  const {voicePython:python,voiceScript:script,voiceTemplate:template}=library.settings;
  if(!python||!script||!template)throw new Error('请在设置中指定声音克隆环境、脚本和音色模板');
  projectDirectory(folder,'assets');
  const rel='assets/voice-'+randomUUID()+'.wav';
  await synthesizeVoice({python,script,template,text:s.text,output:path.join(folder,rel)});
  safeAsset(folder,rel);return {path:rel};
}
const handlers={
  bootstrap:()=>({project:library.active?library.project():null,projects:library.list(),accounts:accounts(),platforms:platformInfo(providerFields),receipts:library.active?new Ledger(library.root()).recover(sessionId):[],settings:library.settings,topics:library.config.topics}),
  'project.create':p=>library.create(p.kind,p.name,p.source,createExample,p.blank),
  'project.open':p=>library.open(p.id),
  'project.openFolder':async()=>{const [folder]=await chooseFile({properties:['openDirectory']});return folder?library.openFolder(folder):null;},
  'project.save':p=>library.save(p.project),
  'project.import':p=>importAssets(p.type),
  'export.run':()=>exportCurrent(),
  'file.show':p=>{shell.showItemInFolder(safeAsset(library.root(),p.path));return true;},
  'file.external':async p=>{const u=webUrl(p.url);if(!u)throw new Error('链接无效');await shell.openExternal(u);return true;},
  'tools.choose':async p=>{if(![...toolKeys,'workspaceRoot'].includes(p.key))throw new Error('未知路径');const r=await chooseFile({properties:[p.key==='workspaceRoot'?'openDirectory':'openFile']});return r[0] || '';},
  'settings.save':p=>{const s={...library.config.settings};for(const k of [...toolKeys,'workspaceRoot'])if(p.settings && k in p.settings){const v=text(p.settings[k],4000);if(v && (!path.isAbsolute(v) || !fs.existsSync(v)))throw new Error('指定的路径不存在：'+k);if(v)s[k]=v;else delete s[k];}library.config.settings=s;library.persist();return library.settings;},
  'tools.openscreen':p=>openScreen(p),
  'tools.voice':p=>makeVoice(p),
  'topics.fetch':async p=>{const found=await fetchTopics(p.input);library.config.topics=mergeTopics(library.config.topics,found);library.persist();return library.config.topics;},
  'topics.add':p=>{library.config.topics=mergeTopics(library.config.topics,[makeTopic(p.title,p.url,'手工收藏')]);library.persist();return library.config.topics;},
  'accounts.save':p=>saveAccount(p.account),
  'accounts.remove':p=>{accountFor(p.id);library.config.accounts=library.config.accounts.filter(a=>a.id!==p.id);library.persist();return accounts();},
  'accounts.login':p=>openLogin(accountFor(p.id)),
  'publish.preview':p=>preview(p.platform),
  'publish.batch':p=>publishBatch(p),
  'publish.check':p=>checkReceipt(p.id),
  'publish.reconcile':p=>{
    const ledger=new Ledger(library.root()),r=ledger.get(p.id);
    if(r.status!=='unknown' || !r.lastCheckedAt || p.confirmedAbsent!==true)throw new Error('请先到对应账号核对这次提交记录');
    ledger.change(r.id,{status:'failed',detail:'作者已核对平台作品及草稿记录，确认此次未提交。',reconciledAt:new Date().toISOString()});
    return ledger.all();
  },
  'publish.retry':async p=>{const ledger=new Ledger(library.root()),r=ledger.get(p.id);if(!p.confirmed||!['failed','needs_action'].includes(r.status))throw new Error('请先核对原投稿，只有明确未提交的记录才可重试');await dispatchOne({account:accountFor(r.accountId),project:library.project(),folder:library.root(),mode:r.mode,existingKey:r.key});return ledger.all();},
  'publish.link':p=>{const l=new Ledger(library.root()),r=l.get(p.id),url=publicUrl(r.platform,p.url);if(!url)throw new Error('请输入该平台的作品链接');l.change(r.id,{status:r.status==='published'?'published':'submitted',url,detail:'作者提供的作品链接，可打开核对公开状态。'});return l.all();},
  'receipts.list':()=>library.active?new Ledger(library.root()).recover(sessionId):[]
};
async function start(){
  const storage=app.getPath('userData');
  const projects=process.env.CREATOR_WORKBENCH_PROFILE?path.join(storage,'projects'):path.join(app.getPath('documents'),'Creator Workbench');
  library=new Library(storage,projects);
  if(library.config.selectedProject && library.config.projects.some(x=>x.id===library.config.selectedProject && fs.existsSync(x.folder))) library.open(library.config.selectedProject);
  protocol.handle('studio-media',async request=>{
    try{
      const u=new URL(request.url);if(u.hostname!=='project'||!library.active)return new Response(null,{status:404});
      const [,projectId,...segments]=u.pathname.split('/');
      if(projectId!==library.active.id)return new Response(null,{status:404});
      const file=filesInside(library.root(),segments.map(decodeURIComponent).join('/'));
      return await net.fetch(pathToFileURL(file).href,{headers:request.headers,bypassCustomProtocolHandlers:true});
    }catch{return new Response(null,{status:404});}
  });
  ipcMain.handle('workbench:call',async(event,method,payload={})=>{
    if(!main || event.sender!==main.webContents || event.senderFrame!==main.webContents.mainFrame || !Object.hasOwn(handlers,method))throw new Error('无效的工作台请求');
    try{return await handlers[method](payload || {});}catch(e){throw new Error(safeMessage(e));}
  });
  await showMain();
}
if(!locked)app.quit();
else{
  app.on('second-instance',()=>{main?.restore();main?.show();main?.focus();});
  app.whenReady().then(start).catch(e=>{dialog.showErrorBox('无法打开创作工作台',safeMessage(e));app.quit();});
  app.on('activate',()=>{if(library && !main)showMain().catch(()=>{});});
  app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
  app.on('before-quit',()=>bridge.close());
}
