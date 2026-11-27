import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import { Library, atomicJSON, projectFile, readJSON } from '../desktop/storage.mjs';
import { applyManualOverrides, reconcileManualOverrides, sceneVisual } from '../desktop/overrides.mjs';
import { renderProject } from '../desktop/media.mjs';

const shot = (id, props={}) => ({id,title:'原始标题 '+id,text:'已核验字幕。',notes:'原始补充稿',
  seconds:1,zoom:1,short:true,media:'assets/frame.png',audio:'',...props});
const fakeExport = {video:'assets/frame.png',shortVideo:'assets/frame.png',cards:['assets/frame.png'],
  cover:'assets/frame.png',article:'assets/frame.png',markdown:'assets/frame.png'};
const entry = (project, id) => project.ledger.scenes.find(s=>s.sceneId===id);
const edit = (lib, doc, id, patch) => lib.save({...doc,scenes:doc.scenes.map(s=>s.id===id?{...s,...patch}:s)});
const scope = (doc, sceneId) => ({id:doc.id,revision:doc.revision,sceneId,expectedFingerprint:entry(doc,sceneId)?.combinedHash});
const approve = (lib, doc, id) => lib.reviewScene({...scope(doc,id),note:'我人工对照过原稿'});
const setPatch = (lib, doc, id, objectId, property, value) =>
  lib.changeOverride({...scope(doc,id),action:'set',objectId,property,value});
const resolve = (lib, doc, patch, action) =>
  lib.changeOverride({...scope(doc,patch.sceneId),action,overrideId:patch.id});

async function fixture(t) {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'cw-scene-ledger-'));
  t.after(()=>fs.rm(temp,{recursive:true,force:true}));
  const lib=new Library(path.join(temp,'profile'),path.join(temp,'works'));
  const project=await lib.create('brief','示例',null,async root=>{
    await fs.mkdir(path.join(root,'assets'));
    await fs.copyFile(new URL('../examples/brief/assets/basin.png',import.meta.url),path.join(root,'assets','frame.png'));
    await fs.writeFile(path.join(root,'assets','voice.wav'),'original');
    await fs.writeFile(path.join(root,'assets','replacement.wav'),'different');
    return {scenes:[shot('a',{audio:'assets/voice.wav'}),shot('b'),shot('c')]};
  });
  return {lib,project,filename:path.join(lib.root(),projectFile)};
}

test('旧版 v1 无新字段可打开，首次保存保留工程、成片引用和扩展字段',async t=>{
  const {lib,project,filename}=await fixture(t);
  const {ledger,manualOverrides,overrideConflicts,...legacy}=project;
  legacy.exports=fakeExport;
  legacy.externalData={kept:true};
  atomicJSON(filename,legacy);
  const opened=lib.open(project.id);
  assert.deepEqual(readJSON(filename),legacy);
  assert.ok(opened.ledger.scenes.every(s=>s.adoption.status==='draft'));
  assert.deepEqual(opened.manualOverrides,[]);
  const saved=lib.save(opened);
  assert.equal(saved.schemaVersion,1);
  for(const key of ['scenes','exports','externalData','source','variants'])
    assert.deepEqual(saved[key],legacy[key]);
  assert.deepEqual(lib.open(project.id),saved);
  assert.equal(lib.save(saved).revision,saved.revision);
});

test('配音和文案仅失效本镜，时长变更另标后镜偏移，成片失效时保留单镜导出指纹',async t=>{
  const {lib,project}=await fixture(t);
  let current=['a','b','c'].reduce((doc,id)=>approve(lib,doc,id),project);
  lib.commitExport(lib.root(),current,fakeExport);
  current=lib.project();
  const prior=current;
  assert.equal(entry(current,'b').adoption.approvedFingerprint,entry(current,'b').combinedHash);
  assert.ok(entry(current,'b').adoption.reviewedAt);
  current=edit(lib,current,'a',{audio:'assets/replacement.wav'});
  assert.deepEqual(current.ledger.affectedSceneIds,['a']);
  assert.deepEqual(current.ledger.offsetShiftedSceneIds,[]);
  assert.equal(entry(current,'a').adoption.status,'needs_review');
  assert.equal(entry(current,'a').adoption.invalidatedReason,'配音');
  assert.equal(entry(current,'a').adoption.note,'我人工对照过原稿');
  assert.equal(entry(current,'a').scriptHash,entry(prior,'a').scriptHash);
  assert.notEqual(entry(current,'a').audioHash,entry(prior,'a').audioHash);
  assert.equal(current.exports,null);
  assert.deepEqual(entry(current,'b'),entry(prior,'b'));
  current=approve(lib,current,'a');
  const confirmed=entry(current,'a').combinedHash;
  current=edit(lib,current,'a',{text:'新的口播。',seconds:2});
  assert.deepEqual(current.ledger.affectedSceneIds,['a']);
  assert.deepEqual(current.ledger.offsetShiftedSceneIds,['b','c']);
  assert.equal(entry(current,'b').startFrame-entry(prior,'b').startFrame,24);
  assert.equal(entry(current,'b').combinedHash,entry(prior,'b').combinedHash);
  assert.equal(entry(current,'b').exportedFingerprint,entry(prior,'b').exportedFingerprint);
  assert.equal(entry(current,'b').adoption.status,'approved');
  assert.match(entry(current,'a').adoption.invalidatedReason,/文案.*时长/);
  current=edit(lib,current,'a',{text:'已核验字幕。',seconds:1});
  assert.equal(entry(current,'a').combinedHash,confirmed);
  assert.equal(entry(current,'a').adoption.status,'needs_review');
});

test('通用保存不能伪造确认，人工确认与导出拒绝旧版本及原地变动的素材',async t=>{
  const {lib,project}=await fixture(t);
  const fake=structuredClone(project);
  entry(fake,'a').adoption={status:'approved',approvedFingerprint:entry(fake,'a').combinedHash};
  const saved=lib.save(fake);
  assert.equal(entry(saved,'a').adoption.status,'draft');
  const approved=approve(lib,saved,'a');
  assert.throws(()=>approve(lib,project,'b'),/修改/);
  assert.throws(()=>lib.commitExport(lib.root(),project,fakeExport),/导出期间/);
  await fs.writeFile(path.join(lib.root(),project.scenes[0].audio),'changed!');
  assert.throws(()=>lib.commitExport(lib.root(),approved,fakeExport),/导出期间/);
  assert.throws(()=>approve(lib,approved,'a'),/修改/);
  const changed=lib.project();
  assert.deepEqual(changed.ledger.affectedSceneIds,['a']);
  assert.equal(entry(changed,'a').adoption.status,'needs_review');
});

test('批量重生成保留人工覆盖，并且仅匹配同一 sceneId 与白名单属性',async t=>{
  const {lib,project}=await fixture(t);
  let current=setPatch(lib,project,'b','title','displayTitle','人工标题');
  current=setPatch(lib,current,'b','camera','zoom',1.6);
  assert.throws(()=>setPatch(lib,current,'b','title','text','不应保存'),/参数无效/);
  const {manualOverrides,...batch}=current;
  batch.scenes=[current.scenes[2],{...current.scenes[1],notes:'Agent 补充'},current.scenes[0]];
  const regenerated=lib.save(batch);
  assert.deepEqual(regenerated.manualOverrides,manualOverrides);
  assert.deepEqual(regenerated.overrideConflicts,[]);
  const effective=applyManualOverrides(regenerated.scenes,manualOverrides);
  assert.deepEqual(effective.map(s=>sceneVisual(s).zoom),[1,1.6,1]);
  assert.equal(sceneVisual(effective[1]).displayTitle,'人工标题');
  assert.equal(effective[1].title,'原始标题 b');
  assert.equal(effective[1].text,'已核验字幕。');
  assert.ok(!regenerated.scenes[1].visual);
  assert.deepEqual(lib.open(project.id).manualOverrides,manualOverrides);
  const unsupported={id:'unsupported',sceneId:'b',objectId:'captionStyle',property:'text',manualValue:'错误'};
  assert.deepEqual(applyManualOverrides(regenerated.scenes,[unsupported]),regenerated.scenes);
});

test('同字段改基线和删镜冲突明确持久化，即使直接改 JSON 也不套到同名邻镜',async t=>{
  const {lib,project,filename}=await fixture(t);
  const current=setPatch(lib,project,'a','camera','zoom',2);
  const [patch]=current.manualOverrides;
  const next=edit(lib,current,'a',{zoom:1.4});
  const expected={overrideId:patch.id,sceneId:'a',objectId:'camera',property:'zoom',manualValue:2,
    generatedValue:1.4,reason:'generated_value_changed'};
  assert.deepEqual(next.overrideConflicts,[expected]);
  assert.deepEqual(lib.open(project.id).overrideConflicts,[expected]);
  assert.throws(()=>approve(lib,next,'a'),/冲突/);
  const raw=readJSON(filename);
  atomicJSON(filename,{...raw,scenes:[{...raw.scenes[0],id:'replacement'},...raw.scenes.slice(1)]});
  const deleted=lib.project();
  assert.deepEqual(deleted.overrideConflicts,[{...expected,reason:'scene_deleted',generatedValue:null}]);
  assert.deepEqual(applyManualOverrides(deleted.scenes,deleted.manualOverrides).map(s=>sceneVisual(s).zoom),[1.4,1,1]);
  assert.throws(()=>resolve(lib,deleted,patch,'keep'),/分镜已删除/);
  assert.equal(resolve(lib,deleted,patch,'disable').overrideConflicts.length,0);
});

test('保留人工重锚基线，采纳生成移除补丁，停用保留补丁记录',async t=>{
  const {lib,project}=await fixture(t);
  let doc=setPatch(lib,project,'a','title','displayTitle','人工精修');
  const [patch]=doc.manualOverrides;
  doc=edit(lib,doc,'a',{title:'生成版本二'});
  const stale=doc.overrideConflicts[0];
  doc=resolve(lib,doc,patch,'keep');
  assert.deepEqual(doc.overrideConflicts,[]);
  assert.equal(doc.manualOverrides[0].baseValue,'生成版本二');
  assert.equal(sceneVisual(applyManualOverrides(doc.scenes,doc.manualOverrides)[0]).displayTitle,'人工精修');
  doc=edit(lib,doc,'a',{title:'生成版本三'});
  assert.equal(doc.overrideConflicts.length,1);
  assert.throws(()=>lib.changeOverride({...scope(doc,'a'),action:'keep',overrideId:patch.id,expectedConflict:stale}),/已变化/);
  doc=resolve(lib,doc,patch,'disable');
  assert.equal(doc.manualOverrides[0].enabled,false);
  assert.deepEqual(doc.overrideConflicts,[]);
  assert.equal(sceneVisual(applyManualOverrides(doc.scenes,doc.manualOverrides)[0]).displayTitle,'生成版本三');
  doc=resolve(lib,doc,patch,'keep');
  doc=edit(lib,doc,'a',{title:'生成版本四'});
  doc=resolve(lib,doc,patch,'adopt');
  assert.deepEqual(doc.manualOverrides,[]);
  assert.deepEqual(doc.overrideConflicts,[]);
  assert.equal(sceneVisual(doc.scenes[0]).displayTitle,'生成版本四');
  assert.deepEqual(reconcileManualOverrides(doc.scenes,doc.scenes).overrideConflicts,[]);
});

test('返修单绑定工程版本和播放器秒点，始终读回分镜标题与字幕原文',async t=>{
  const {lib,project}=await fixture(t);
  const doc=setPatch(lib,project,'b','title','displayTitle','画面标题');
  const point={format:'short',playbackSeconds:1.23456,sceneSeconds:0.23456,note:'这一秒需要复核'};
  assert.deepEqual(lib.repairSheet({...scope(doc,'b'),...point,title:'旧客户端给出的标题'}),{
    projectId:doc.id,revision:doc.revision,sceneId:'b',format:'short',playbackSeconds:1.235,sceneSeconds:0.235,
    title:'原始标题 b',subtitle:'已核验字幕。',note:'这一秒需要复核',
  });
  assert.throws(()=>lib.repairSheet({...scope(project,'b'),...point}),/修改/);
  assert.throws(()=>lib.repairSheet({...scope(doc,'b'),...point,sceneSeconds:-1}),/秒点/);
});

test('实际导出读取人工展示标题、强调色和运镜，不替换原稿或核验字幕',async t=>{
  const {lib,project}=await fixture(t);
  let doc=lib.save({...project,scenes:[shot('a',{cues:[{text:'已核验字幕。',start:0,end:0.75}],cueAudio:''})]});
  for (const [objectId,property,value] of [['title','displayTitle','展示标题'],['callout','accentColor','#04c92a'],
    ['camera','zoom',1.75],['camera','focusX',0.2],['captionStyle','paddingBottom',12]])
    doc=setPatch(lib,doc,'a',objectId,property,value);
  const root=lib.root();
  const result=await renderProject(root,doc);
  const read=relative=>fs.readFile(path.join(root,relative),'utf8');
  assert.match(await read(result.article),/<h2>展示标题<\/h2>/);
  assert.match(await read(result.script),/原始标题 a/);
  assert.match(await read(result.script),/推镜 1\.75×/);
  assert.match(await read(result.subtitles),/00:00:00,750\s+已核验字幕。/);
  assert.equal(doc.scenes[0].title,'原始标题 a');
  const {stdout}=await promisify(execFile)(ffmpeg,['-nostdin','-loglevel','error','-i',path.join(root,result.video),
    '-vf','crop=2:2:50:604','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-'],{encoding:'buffer'});
  assert.ok(stdout[1]>150 && stdout[0]<70 && stdout[2]<100);
});
