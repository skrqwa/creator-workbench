import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const artifactDir = process.env.CREATOR_SMOKE_ARTIFACTS;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'creator-smoke-'));
const executable = process.env.CREATOR_INSTALLED_EXE || createRequire(import.meta.url)('electron');
const ids = [];
const errors = [];
let app;
let page;

async function launch() {
  const env={...process.env,CREATOR_WORKBENCH_PROFILE:temp,CREATOR_WORKBENCH_DEV:'0'};
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: executable,
    args: process.env.CREATOR_INSTALLED_EXE ? [] : ['.'],
    cwd, timeout: 90000,
    env
  });
  page = await app.firstWindow({ timeout: 90000 });
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.getByTestId('workspace').waitFor();
}
const state = () => page.evaluate(() => window.studio.call('bootstrap'));

async function saveChanges() {
  await page.getByRole('button', {name:'保存项目，保存修改', exact:true}).click();
  await page.getByRole('button', {name:/^保存项目，已保存/}).waitFor();
  return (await state()).project;
}

async function checkMixedConfirmation() {
  await page.evaluate(async () => {
    await window.studio.call('accounts.save', {account: {platform:'wechat', name:'文章复核样例', channel:'browser'}});
    await window.studio.call('accounts.save', {account: {platform:'bilibili', name:'视频直投样例', channel:'api', capabilities:['submit']}});
  });
  await page.reload();
  const navigation = page.getByRole('navigation', {name:'创作流程'});
  await navigation.getByRole('link', {name:'八平台分发'}).click();
  await page.getByRole('button', {name:'批量核对', exact:true}).click();
  const picker = page.getByRole('dialog', {name:'批量核对'});
  await picker.getByRole('checkbox', {name:/文章复核样例/}).check();
  await picker.getByRole('checkbox', {name:/视频直投样例/}).check();
  await picker.getByRole('combobox', {name:'视频直投样例的发布方式'}).selectOption('submit');
  await picker.getByRole('button', {name:/核对所选账号/}).click();

  // 尚未导出的视频无法预览，确认页只能计入可复核的文章。
  const confirm = page.getByRole('dialog', {name:'确认本次发布'});
  await confirm.getByText(/本次 1 个账号去平台复核，0 个账号直接提交/).waitFor();
  await confirm.getByText('本次跳过', {exact:true}).waitFor();
  assert.ok(await confirm.getByRole('button', {name:'确认处理 1 个账号'}).isEnabled());
  await confirm.getByRole('button', {name:'返回修改'}).click();
  assert.deepEqual(await page.evaluate(() => window.studio.call('receipts.list')), []);
  await navigation.getByRole('link', {name:'内容创作'}).click();
}

async function checkSceneReview() {
  const active=page.locator('.studio-story.active');
  await active.getByRole('button',{name:'标记本镜已复核确认'}).click();
  await active.getByText('已确认',{exact:true}).waitFor();
  const approved=(await state()).project;
  const first=approved.scenes[0];
  assert.equal(approved.ledger.scenes[0].adoption.approvedFingerprint,approved.ledger.scenes[0].combinedHash);
  await active.getByRole('button',{name:'画面精修'}).click();
  await active.getByLabel('展示标题',{exact:true}).fill('人工锁定的展示标题');
  await active.getByRole('button',{name:'锁定人工值'}).click();
  await active.getByText('待复核',{exact:true}).waitFor();
  const effectiveTitle=page.locator('.studio-frame-title',{hasText:'人工锁定的展示标题'});
  await effectiveTitle.waitFor();
  await page.evaluate(async () => {
    const {project}=await window.studio.call('bootstrap');
    project.scenes[0].title='Agent 生成的新标题';
    delete project.manualOverrides;
    await window.studio.call('project.save',{project});
  });
  await page.reload();
  const conflict=active.getByRole('group',{name:'人工微调冲突'});
  await conflict.getByText(/新生成：Agent 生成的新标题/).waitFor();
  await effectiveTitle.waitFor();
  if (artifactDir) {
    for (const width of [1440,1280]) {
      const height=width===1440 ? 900 : 800;
      await page.setViewportSize({width,height});
      for (const theme of ['light','dark']) {
        const actual=await page.locator('html').getAttribute('data-theme');
        if (actual!==theme) await page.getByRole('button',{name:theme==='light'?'切换至宣纸浅色':'切换至夜墨深色'}).click();
        await page.locator('html[data-theme="'+theme+'"]').waitFor();
        assert.deepEqual(await page.evaluate(()=>[innerWidth,innerHeight]),[width,height]);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:path.join(artifactDir,'scene-review-'+width+'x'+height+'-'+theme+'.png')});
      }
    }
    await page.getByRole('button',{name:'切换至宣纸浅色'}).click();
    await page.setViewportSize({width:1440,height:900});
  }
  await conflict.getByRole('button',{name:'保留人工值'}).click();
  await conflict.waitFor({state:'hidden'});
  assert.equal((await state()).project.manualOverrides[0].baseValue,'Agent 生成的新标题');

  const step=page.getByRole('slider',{name:'预览进度'});
  await step.press('ArrowRight');
  const repair=page.getByRole('dialog',{name:'分镜返修单'});
  const openRepair=async () => {
    await page.getByRole('button',{name:'导出当前分镜返修单 JSON'}).click();
    await repair.getByLabel('返修备注').fill('请复核这一秒的画面');
  };
  await app.evaluate(({clipboard}) => { clipboard.writeText=text=>{clipboard.readText=()=>text;}; });
  await openRepair();
  await repair.getByRole('button',{name:'复制 JSON'}).click();
  await repair.waitFor({state:'hidden'});
  const copied=JSON.parse(await app.evaluate(({clipboard})=>clipboard.readText()));
  const saved=(await state()).project;
  assert.equal(copied.sceneId,first.id);
  assert.equal(copied.revision,saved.revision);
  assert.equal(copied.title,'Agent 生成的新标题');
  assert.equal(copied.subtitle,first.text);
  assert.equal(copied.note,'请复核这一秒的画面');
  assert.ok(copied.sceneSeconds>0 && copied.playbackSeconds===copied.sceneSeconds);
  const repairPath=path.join(temp,'repair.json');
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},repairPath);
  await openRepair();
  await repair.getByRole('button',{name:'保存 JSON'}).click();
  await repair.waitFor({state:'hidden'});
  assert.deepEqual(JSON.parse(await fs.readFile(repairPath,'utf8')),copied);
  console.log('Passed scene review, regeneration conflict, preview overlay and repair JSON clipboard/file.');
}

try {
  if (artifactDir) await fs.mkdir(artifactDir,{recursive:true});
  await launch();
  for (const kind of ['tutorial','brief']) {
    console.log('Testing editable example:', kind);
    await page.getByTestId('new-project').click();
    await page.getByTestId('new-'+kind).click();
    await page.getByTestId('create-project').click();
    const input = page.getByTestId('scene-text');
    await input.waitFor();
    const initial = (await state()).project;
    assert.equal(initial.kind,kind);
    const replacement = '把这一段改成自己的讲解，保存后可以继续编辑。';
    await input.fill(replacement);
    const edited = await saveChanges();
    assert.equal(edited.scenes[0].text, replacement);

    // 只替换系统选文件对话框，其余导入、复制、界面编辑及编码均经过应用的正式入口。
    const sampleImage = path.join(cwd,'examples', kind,'assets',kind==='brief'?'basin.png':'filter.png');
    await app.evaluate(({ dialog },file) => { dialog.showOpenDialog = async () => ({canceled:false,filePaths:[file]}); }, sampleImage);
    await page.getByRole('button',{name:'媒体素材'}).click();
    await page.getByRole('button',{name:'替换',exact:true}).first().click();
    const current = await saveChanges();
    assert.notEqual(current.scenes[0].media, initial.scenes[0].media);
    assert.match(current.scenes[0].media,/\.png$/i);
    if (kind==='tutorial') {
      await checkMixedConfirmation();
      await checkSceneReview();
    }
    if (artifactDir) await page.screenshot({path:path.join(artifactDir,kind+'-editor.png')});

    await page.getByTestId('export-project').click();
    const exportDialog = page.getByRole('dialog', {name:'导出成品', exact:true});
    await exportDialog.getByTestId('render-project').click();
    const completed = exportDialog.getByText('此版本已导出', {exact:true});
    const failure = page.locator('.feedback.problem[role="alert"]');
    await completed.or(failure).first().waitFor({timeout:720000});
    if (await failure.isVisible()) throw new Error(await failure.innerText());
    await exportDialog.getByRole('button',{name:'关闭',exact:true}).click();
    const model = (await state()).project;
    ids.push(model.id);
    const folder = path.join(temp,'projects',model.id);
    for (const key of ['video','shortVideo','cover','article','markdown']) assert.ok((await fs.stat(path.join(folder,model.exports[key]))).size>40,key);
    for (const pic of model.exports.cards) assert.ok((await fs.stat(path.join(folder,pic))).size>1000);
    const articleText = await fs.readFile(path.join(folder,model.exports.article),'utf8');
    assert.ok(articleText.includes('<img') && articleText.includes(model.name));
    const all = await page.evaluate(async () => {
      const {platforms} = await window.studio.call('bootstrap');
      return Promise.all(platforms.map(p => window.studio.call('publish.preview',{platform:p.id})));
    });
    assert.equal(all.length,8);
    assert.ok(all.every(x=>x.title && x.body && x.cover));
    const saved = await page.evaluate(async () => {
      const {project} = await window.studio.call('bootstrap');
      project.variants.bilibili = {title:'B站独立标题'};
      return window.studio.call('project.save',{project});
    });
    assert.equal(saved.exports.video,model.exports.video);
    const other = await page.evaluate(() => window.studio.call('publish.preview',{platform:'douyin'}));
    assert.equal(other.title,model.name);
    console.log('Passed edit, image import, full/short MP4, cards, article and eight previews:', kind);
  }
  await app.close(); app = null;
  await launch();
  assert.equal((await state()).project.id,ids.at(-1));
  for(const id of ids) {
    const reopened = await page.evaluate(id=>window.studio.call('project.open',{id}),id);
    assert.equal(reopened.id,id);
    assert.equal(reopened.variants.bilibili.title,'B站独立标题');
    assert.ok(reopened.exports?.video);
    assert.match(reopened.scenes[0].text,/自己的讲解/);
  }
  assert.deepEqual(errors,[]);
  console.log('Passed restart and reopening both saved projects.');
} catch (error) {
  if(page && !page.isClosed()) {
    console.error('Desktop state:',(await page.locator('body').innerText().catch(()=>'' )).slice(-1800));
    if(artifactDir)await page.screenshot({path:path.join(artifactDir,'failure.png')}).catch(()=>{});
  }
  console.error('Smoke workspace:',temp);
  throw error;
} finally {
  await app?.close().catch(()=>{});
}
