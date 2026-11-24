import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { platforms, platformById } from './catalog.mjs';

export const projectFile = 'creator-workbench.json';
const filename = 'workspace.json';
export const text = (value, limit = 10000) => typeof value === 'string' ? value.slice(0, limit) : '';

export function atomicJSON(target, value) {
  fs.mkdirSync(path.dirname(target), {recursive: true});
  const tmp = target + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', {flag: 'wx', mode: 0o600});
    fs.renameSync(tmp, target);
  } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}

export function safeAsset(folder, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0') || relative.includes(':') || relative.includes('\\') || relative.startsWith('/') || relative.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('工程素材路径无效');
  const root = fs.realpathSync(folder);
  const file = fs.realpathSync(path.resolve(root, relative));
  const rel = path.relative(root, file);
  if (!rel || path.isAbsolute(rel) || rel.split(path.sep)[0] === '..' || !fs.statSync(file).isFile()) throw new Error('素材必须保存在作品工程中');
  return file;
}
export function fingerprint(obj) { return createHash('sha256').update(JSON.stringify(obj)).digest('hex'); }

export function projectDirectory(folder, name) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('无效的工程子目录');
  const target = path.join(fs.realpathSync(folder), name);
  if (!fs.existsSync(target)) fs.mkdirSync(target);
  if (fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isDirectory()) throw new Error('工程子目录必须位于当前工程内');
  return target;
}

export function webUrl(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; }
  catch { return ''; }
}
export function readJSON(file, fallback) {
  try {return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (err) { if (err.code === 'ENOENT' && arguments.length > 1) return fallback; throw err; }
}
function normalizeProject(project) {
  if (!project || !['tutorial','brief'].includes(project.kind) || !Array.isArray(project.scenes) || project.scenes.length > 250 || !Number.isInteger(project.revision) || !/^[0-9a-f-]{36}$/i.test(project.id)) throw new Error('此文件不是支持的 Creator Workbench 工程');
  if (project.schemaVersion !== 1) throw new Error('该工程的格式版本需要更新的 Creator Workbench');
  return project;
}
function indexEntry(project, folder) {return {id:project.id,name:project.name,kind:project.kind,updatedAt:project.updatedAt,folder};}

export class Library {
  constructor(stateDir, defaultRoot) {
    this.stateDir = stateDir;
    this.configFile = path.join(stateDir, filename);
    this.config = readJSON(this.configFile, {projects:[],accounts:[],topics:[],settings:{},selectedProject:null});
    this.defaultRoot = defaultRoot;
    this.active = null;
  }
  persist() {atomicJSON(this.configFile, this.config);}
  get settings() {return {workspaceRoot:this.defaultRoot,...this.config.settings};}
  list() {return this.config.projects.map(({folder,...info})=>info);}
  root() {if (!this.active) throw new Error('请先打开一个作品');return this.active.folder;}
  project() {return normalizeProject(readJSON(path.join(this.root(), projectFile)));}
  register(folder, doc) {
    const root=fs.realpathSync(folder);
    const entry=indexEntry(doc,root);
    const existing=this.config.projects.find(x=>x.id===doc.id);
    if (existing && existing.folder!==root && fs.existsSync(existing.folder)) {
      // 旧索引可能保留目录别名。以目录本身判断副本，避免误拒 macOS 的 /var 等入口。
      const indexed=fs.statSync(existing.folder,{bigint:true});
      const opened=fs.statSync(root,{bigint:true});
      const sameFolder=indexed.ino===0n ? fs.realpathSync(existing.folder)===root
        : indexed.dev===opened.dev && indexed.ino===opened.ino;
      if (!sameFolder) throw new Error('同一工程的另一份副本已在作品库中，请打开原工程');
    }
    this.config.projects=[entry,...this.config.projects.filter(x=>x.id!==doc.id)];
    this.active=entry;
    this.config.selectedProject=doc.id;
    this.persist();
    return doc;
  }
  openFolder(folder) {
    const root=fs.realpathSync(folder);
    return this.register(root, normalizeProject(readJSON(path.join(root, projectFile))));
  }
  open(id) {
    const entry=this.config.projects.find(x=>x.id===id);
    if (!entry) throw new Error('找不到这个工程');
    return this.openFolder(entry.folder);
  }
  async create(kind, name, source, example, blank=false) {
    if (!['tutorial','brief'].includes(kind)) throw new Error('请选择一种作品类型');
    const id=randomUUID();
    const folder=path.join(this.settings.workspaceRoot, id);
    fs.mkdirSync(this.settings.workspaceRoot, {recursive:true});
    fs.mkdirSync(folder);
    const data=blank || source
      ? {name:text(source?.title,160) || '未命名作品',intro:'',scenes:[{id:randomUUID(),title:'新分镜',text:'',notes:'',media:'',audio:'',seconds:5,zoom:1,short:true}]}
      : await example(folder,kind);
    projectDirectory(folder,'assets');
    const doc={schemaVersion:1,id,kind,name:text(name,160).trim() || data.name,intro:text(data.intro,20000),source:source ?? data.source ?? null,scenes:data.scenes,variants:{},exports:null,revision:1,updatedAt:new Date().toISOString()};
    normalizeProject(doc);
    atomicJSON(path.join(folder,projectFile),doc);
    return this.register(folder,doc);
  }
  save(input) {
    const current=this.project();
    if (!input || input.id!==current.id || input.revision!==current.revision) throw new Error('工程已被修改，请重新打开最新版本');
    if (!Array.isArray(input.scenes) || !input.scenes.length || input.scenes.length>250) throw new Error('工程需要 1 至 250 个分镜');
    const ids=new Set();
    const scenes=input.scenes.map(s=>{
      if (!s || typeof s.id!=='string' || !s.id || ids.has(s.id)) throw new Error('分镜编号重复或缺失');
      ids.add(s.id);
      for (const asset of [s.media,s.audio,s.poster,s.openScreenProject].filter(Boolean)) safeAsset(this.root(),asset);
      return {...s,title:text(s.title,500),text:text(s.text,40000),seconds:Math.max(0.5,Math.min(600,Number(s.seconds)||4)),zoom:Math.max(1,Math.min(3,Number(s.zoom)||1))};
    });
    const variants = {};
    for (const [key,value] of Object.entries(input.variants || {})) {
      if (!platformById[key] || !value || typeof value!=='object') continue;
      if (value.type && !platformById[key].types.includes(value.type)) throw new Error('平台内容类型无效');
      for (const asset of [value.cover,value.video,...(Array.isArray(value.images)? value.images:[])].filter(Boolean)) safeAsset(this.root(),asset);
      variants[key]={...value,title:text(value.title,400),body:text(value.body,150000)};
    }
    const name=text(input.name,160).trim() || current.name;
    const intro=text(input.intro ?? current.intro,20000);
    const source=input.source ?? current.source;
    const changed=fingerprint([name,intro,source,scenes])!==fingerprint([current.name,current.intro || '',current.source,current.scenes]);
    const doc={...current,name,intro,source,scenes,variants,exports:changed ? null : current.exports};
    if (fingerprint(current)===fingerprint(doc)) return current;
    doc.revision++;doc.updatedAt=new Date().toISOString();
    atomicJSON(path.join(this.root(),projectFile),doc);
    return this.register(this.root(),doc);
  }
  commitExport(folder,snapshot,result) {
    for (const v of [result.video,result.shortVideo,result.cover,result.article,result.markdown,...result.cards,...(result.articleImages || [])]) safeAsset(folder,v);
    const current=normalizeProject(readJSON(path.join(folder,projectFile)));
    if (fingerprint([snapshot.name,snapshot.intro,snapshot.source,snapshot.scenes])!==fingerprint([current.name,current.intro,current.source,current.scenes])) throw new Error('导出期间作品已修改，请重新导出最新版本');
    const updated={...current,exports:result,revision:current.revision+1,updatedAt:new Date().toISOString()};
    atomicJSON(path.join(folder,projectFile),updated);
    if(this.active?.id===updated.id) this.register(folder,updated);
    return result;
  }
}
export function contentFor(folder,project,platform) {
  const p=platformById[platform];
  if (!p) throw new Error('未知发布平台');
  const v=project.variants[platform] || {};
  const type=v.type || p.types[0];
  const e=project.exports;
  const resolve=(value)=>value ? safeAsset(folder,value) : '';
  const full=v.videoVersion ? v.videoVersion==='full' : platform==='bilibili';
  const video = type==='video' ? resolve(v.video || (full ? e?.video : e?.shortVideo) || e?.video) : '';
  const defaults=['article','pin'].includes(type) && e?.articleImages?.length ? e.articleImages : e?.cards;
  const cards=Array.isArray(v.images) && v.images.length ? v.images : defaults || [];
  let images = ['cards','article','pin'].includes(type) ? cards.map(resolve) : [];
  const cover=resolve(v.cover || e?.cover || cards[0]);
  if(type==='cards' && v.cover)images=[cover,...images.filter(img=>img!==cover)];
  if (!p.types.includes(type)) throw new Error('该平台不接受此类型');
  if (type==='video' && !video || type==='cards' && !images.length) throw new Error('请先导出作品，或为这个平台选择媒体');
  const paragraphs=['article','pin'].includes(type)
    ? [project.intro,...project.scenes.map(s=>s.notes || s.text)]
    : project.scenes.map(s=>s.text);
  return {...v,type, title:v.title || project.name, body:v.body || paragraphs.filter(Boolean).join('\n\n'),cover,video,images};
}
export const publicAccount=({encrypted,...account})=>account;
export function platformInfo(fields) {
  return platforms.map(p=>({...p,fields:fields[p.id] || [],methods:{browser:p.id==='toutiao'?['review','submit']:['review'],plugin:['review','submit'],api:['review','submit']}}));
}
