import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Library, safeAsset, projectDirectory, contentFor } from '../desktop/storage.mjs';
import { Ledger, contentKey } from '../desktop/ledger.mjs';
import { creatorUrl, modesFor, publicUrl, platforms } from '../desktop/catalog.mjs';
import { feedUrl, parseFeed, mergeTopics, makeTopic } from '../desktop/topics.mjs';
import { PluginBridge } from '../desktop/plugin-bridge.mjs';

async function fixture(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'cw-library-'));
  t.after(()=>fs.rm(temp,{recursive:true,force:true}));
  const lib = new Library(path.join(temp,'profile'),path.join(temp,'works'));
  const project = await lib.create('tutorial','示例',null,async root=>{
    await fs.mkdir(path.join(root,'assets'));
    await fs.writeFile(path.join(root,'assets','frame.png'),'figure content');
    return {intro:'教程引言',scenes:[{id:'first',title:'开始',text:'说法',notes:'图文解释',media:'assets/frame.png',seconds:4,zoom:1}]};
  });
  return {temp,lib,project,root:lib.root()};
}
test('工程重开保留引言和平台版本，并拒绝过期编辑及过期渲染',async t=>{
  const {temp,lib,project,root}=await fixture(t);
  const exports={video:'assets/frame.png',shortVideo:'assets/frame.png',cards:['assets/frame.png'],articleImages:['assets/frame.png'],cover:'assets/frame.png',article:'assets/frame.png',markdown:'assets/frame.png'};
  lib.commitExport(root,project,exports);
  const snapshot=lib.project();
  const input={...snapshot,variants:{bilibili:{title:'独立标题',body:'B站文本'}}};
  const saved=lib.save(input);
  assert.equal(saved.exports.video,exports.video);
  assert.equal(contentFor(root,saved,'douyin').title,'示例');
  assert.equal(contentFor(root,saved,'bilibili').title,'独立标题');
  assert.equal(contentFor(root,saved,'wechat').body,'教程引言\n\n图文解释');
  assert.throws(()=>lib.save(input),/修改/);
  assert.equal(lib.save({...saved,intro:'新引言'}).exports,null);
  assert.throws(()=>lib.commitExport(root,snapshot,exports),/导出/);
  assert.equal(new Library(path.join(temp,'profile'),lib.defaultRoot).open(project.id).intro,'新引言');
  assert.throws(()=>safeAsset(root,'../profile/workspace.json'),/路径/);
  assert.throws(()=>projectDirectory(root,'..'),/目录/);
});
test('旧索引和目录别名可以重开原工程，独立副本仍会被拒绝', async t => {
  const {temp, lib, project, root} = await fixture(t);
  const alias = path.join(temp, 'works-alias');
  await fs.symlink(lib.defaultRoot, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const aliasedProject = path.join(alias, project.id);
  lib.config.projects[0].folder = aliasedProject;
  lib.persist();

  const reopened = new Library(lib.stateDir, alias);
  assert.equal(reopened.open(project.id).id, project.id);
  assert.equal(reopened.openFolder(aliasedProject).id, project.id);
  assert.equal(reopened.root(), await fs.realpath(root));
  const copy = path.join(temp, 'independent-copy');
  await fs.cp(root, copy, {recursive: true});
  assert.throws(() => reopened.openFolder(copy), /另一份副本/);
  assert.equal(reopened.root(), await fs.realpath(root));
  const moved = path.join(temp, 'relocated');
  await fs.rename(root, moved);
  assert.equal(reopened.openFolder(moved).id, project.id);

  const created = await reopened.create('tutorial', '从别名新建', null, null, true);
  assert.equal(reopened.root(), await fs.realpath(path.join(alias, created.id)));
});
test('同稿跨账号独立，未确认的提交在重启后不会自动重发',async t=>{
  const {root,project}=await fixture(t);
  const l=new Ledger(root);
  const a={id:'1',name:'A',platform:'wechat'},b={...a,id:'2',name:'B'};
  const r=l.start(a,project,'review','same','title','run1').receipt;
  l.change(r.id,{status:'draft',remoteId:'draft-7'});
  const submit=l.start(a,project,'submit','same','title','run1');
  assert.equal(submit.draft.remoteId,'draft-7');
  assert.equal(l.start(a,project,'submit','same','title','run1').run,false);
  let other=l.start(b,project,'submit','same','title','run1');
  assert.equal(other.run,true);
  l.change(other.receipt.id,{status:'failed'});
  assert.equal(l.recover('run2').find(x=>x.id===submit.receipt.id).status,'unknown');
  assert.equal(l.start(a,project,'submit','same','title','run2').run,false);
  other=l.start(b,project,'submit','same','title','run2');
  assert.equal(other.run,true);
  l.change(other.receipt.id,{status:'published',url:'https://mp.weixin.qq.com/s/example'});
  assert.equal(l.change(other.receipt.id,{status:'unknown'}).status,'published');
  l.change(other.receipt.id,{status:'failed',withdrawn:true});
  assert.equal(l.start(b,project,'submit','same','title','run3').run,false);
});
test('媒体内容变化产生新的提交指纹，路径相同也能识别',async t=>{
  const {root}=await fixture(t),f=path.join(root,'assets/frame.png');
  const content={title:'稿件',images:[f],cover:f};
  const key=await contentKey(content);
  await fs.writeFile(f,'replaced image');
  assert.notEqual(key,await contentKey(content));
});
test('根据账号权限及作品类型选择八个平台的入口',()=>{
  assert.equal(platforms.length,8);
  const direct=(platform,channel,params={})=>({platform,channel,capabilities:['submit'],...params});
  assert.deepEqual(modesFor(direct('wechat','api',{subject:'personal'}),'article'),['review']);
  assert.deepEqual(modesFor(direct('wechat','api',{subject:'institution'}),'article'),['review','submit']);
  assert.deepEqual(modesFor(direct('toutiao','browser'),'video'),['review']);
  assert.deepEqual(modesFor(direct('douyin','api'),'cards'),['review']);
  assert.deepEqual(modesFor(direct('zhihu','api'),'pin'),['review','submit']);
  assert.ok(creatorUrl('xiaohongshu','cards').includes('image'));
  assert.equal(publicUrl('douyin','https://douyin.com.invalid.example/p/32'),'');
});
test('RSS 与 Atom 保留来源及日期，重新采集按链接更新',()=>{
  const base='https://example.org/feed';
  const list=parseFeed('<rss><channel><title>作者</title><item><title>第一期</title><link>https://example.org/article</link><pubDate>Mon, 16 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>',base);
  assert.equal(list[0].publishedAt,'2026-11-16T10:00:00.000Z');
  assert.equal(list[0].source,'作者');
  const updated=parseFeed('<feed><title>作者</title><entry><title>修订</title><link rel="alternate" href="/article"/></entry></feed>',base);
  assert.deepEqual(mergeTopics(list,updated).map(x=>[x.title,x.url,x.addedAt]),[['修订','https://example.org/article',list[0].addedAt]]);
  assert.equal(feedUrl('owner/repo'),'https://github.com/owner/repo/releases.atom');
  assert.throws(()=>parseFeed('<!DOCTYPE data><rss/>',base));
  assert.throws(()=>makeTopic('title','file:///unavailable',''));
});
test('插件交接仅向本次授权的标签页提供材料，提交开始后不二次发送',async t=>{
  const {root}=await fixture(t);
  const urls=[],events=[];
  const bridge=new PluginBridge(async url=>urls.push(url),0);
  t.after(()=>bridge.close());
  const file=path.join(root,'assets/frame.png');
  await bridge.start({name:'测试作者',platform:'xiaohongshu'},{type:'cards',title:'专题',body:'正文',images:[file],cover:file},r=>events.push(r),'1');
  const page=new URL(urls[0]),headers={Authorization:'Bearer '+page.hash.slice(1)};
  const call=(route,method='GET',data)=>fetch(page.origin+route,{method,headers,body:data?JSON.stringify(data):undefined});
  assert.equal((await fetch(page.origin+'/payload')).status,403);
  assert.equal((await call('/media/1')).status,200);
  assert.equal((await (await call('/payload')).json()).platform,'xhs');
  assert.equal(await bridge.resume('1'),true);
  assert.equal((await call('/begin','POST')).status,200);
  assert.equal((await call('/begin','POST')).status,409);
  await call('/result','POST',{success:true,remoteId:'post1',url:'https://www.xiaohongshu.com/explore/example'});
  assert.equal(events.at(-1).status,'submitted');
  assert.equal(events.at(-1).remoteId,'post1');
  assert.equal((await call('/payload')).status,403);
  assert.equal(await bridge.resume('1'),false);
});
