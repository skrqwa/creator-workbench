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
    await page.getByTestId('project-save').click();
    await page.waitForFunction(async line => (await window.studio.call('bootstrap')).project.scenes[0].text === line, replacement);

    // 只替换系统选文件对话框，其余导入、复制、界面编辑及编码均经过应用的正式入口。
    const sampleImage = path.join(cwd,'examples', kind,'assets',kind==='brief'?'basin.png':'filter.png');
    await app.evaluate(({ dialog },file) => { dialog.showOpenDialog = async () => ({canceled:false,filePaths:[file]}); }, sampleImage);
    await page.getByRole('button',{name:'媒体素材'}).click();
    await page.getByRole('button',{name:'替换',exact:true}).first().click();
    await page.getByTestId('project-save').click();
    await page.waitForFunction(async old => (await window.studio.call('bootstrap')).project.scenes[0].media !== old, initial.scenes[0].media);
    const current = (await state()).project;
    assert.match(current.scenes[0].media,/\.png$/i);
    if (artifactDir) await page.screenshot({path:path.join(artifactDir,kind+'-editor.png')});

    await page.getByTestId('export-project').click();
    await page.getByTestId('render-project').click();
    await page.waitForFunction(async () => Boolean((await window.studio.call('bootstrap')).project.exports), null, {timeout:720000,polling:1500});
    await page.getByRole('button',{name:'关闭',exact:true}).last().click();
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
