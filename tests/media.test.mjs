import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { Resvg } from "@resvg/resvg-js";
import ffmpeg from "ffmpeg-static";
import { createExample, renderProject, runOpenScreen, synthesizeVoice } from "../desktop/media.mjs";

const exec = promisify(execFile);

test("仅靠随附字体也能绘制不同的汉字", () => {
  const font = fileURLToPath(new URL("../examples/fonts/WorkbenchHan.ttf", import.meta.url));
  const render = word => new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="70" height="70"><text x="2" y="57" font-size="54" font-family="Workbench Han">${word}</text></svg>`,
    { font: { fontFiles: [font], defaultFontFamily: "Workbench Han", loadSystemFonts: false } }).render().pixels;
  const first = render("影");
  assert.ok(first.filter((byte, index) => index % 4 === 3 && byte > 50).length > 150);
  assert.notDeepEqual(first, render("声"));
});

async function temp(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cw-media-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

async function probe(file) {
  const { stderr } = await exec(ffmpeg, ["-nostdin", "-hide_banner", "-i", file, "-af", "volumedetect", "-t", "2", "-f", "null", "-"]);
  const match = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(stderr);
  assert.ok(match);
  assert.match(stderr, /Video: h264/);
  assert.match(stderr, /Audio: aac/);
  assert.ok(Number(/max_volume: ([\d.-]+) dB/.exec(stderr)?.[1]) > -35);
  return { description: stderr, seconds: Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) };
}

for (const kind of ["tutorial", "brief"]) {
  test("真实导出全部 " + kind + " 示例产物", { timeout: 150_000 }, async t => {
    const folder = await temp(t);
    const project = await createExample(folder, kind);
    const progress = [];
    const result = await renderProject(folder, project, { onProgress: event => progress.push(event.percent) });
    const get = relative => fs.readFile(path.join(folder, relative));
    assert.equal(progress.at(-1), 100);
    const [full, short] = await Promise.all([probe(path.join(folder, result.video)), probe(path.join(folder, result.shortVideo))]);
    assert.match(full.description, /1280x720/);
    assert.match(short.description, /720x1280/);
    assert.ok(short.seconds < full.seconds - 2);
    assert.equal(result.cards.length, 3);
    for (const relative of [result.cover, ...result.cards]) {
      const image = await get(relative);
      assert.deepEqual([image.readUInt32BE(16), image.readUInt32BE(20)], [1080, 1440]);
    }
    assert.equal(result.articleImages.length, 3);
    for (const image of result.articleImages) assert.ok((await get(image)).length > 1024);
    const html = (await get(result.article)).toString("utf8");
    const manuscript = (await get(result.markdown)).toString("utf8");
    assert.equal((html.match(/src="data:image\/png;base64,/g) || []).length, 3);
    for (const paragraph of project.scenes[1].notes.split(/\n+/)) assert.ok(html.includes(paragraph));
    if (kind === "brief") assert.ok(html.includes(project.scenes[2].source.url));
    assert.match(manuscript, /images\/scene-2\.png/);
    assert.ok((await get(result.script)).toString("utf8").includes(project.scenes[0].text));
    const captions = (await get(result.subtitles)).toString("utf8");
    assert.ok(captions.includes(project.scenes[2].cues.at(-1).text));
    assert.ok(!(await get(result.shortSubtitles)).toString("utf8").includes(project.scenes[2].cues.at(-1).text));
    assert.match((await get(result.credits)).toString("utf8"), /Cori Samuel/);
  });
}

test("失败导出不留下成品，不读取相对路径或符号链接指向的工程外素材", async t => {
  const dir = await temp(t), outside = await temp(t);
  const p = await createExample(dir, "brief");
  p.scenes[0].media = "../outside.png";
  await assert.rejects(renderProject(dir, p), /工程内/);
  assert.deepEqual(await fs.readdir(path.join(dir, "exports")), []);
  await fs.symlink(outside, path.join(dir, "assets", "linked"), process.platform === "win32" ? "junction" : "dir");
  await fs.writeFile(path.join(outside, "test.png"), "sentinel");
  p.scenes[0].media = "assets/linked/test.png";
  await assert.rejects(renderProject(dir, p), /工程目录以外/);
  assert.deepEqual(await fs.readdir(path.join(dir, "exports")), []);
});

test("同时交付同一工程的两个版本，各自绑定当次正文与截图", async t => {
  const dir = await temp(t);
  const example = await createExample(dir, "brief");
  const project = { ...example, name: "A < B", scenes: [{ ...example.scenes[0], audio: "", title: "<b>第一段</b>", text: "本次编辑。", seconds: 0.5, zoom: 1 }] };
  const [oldVersion, newVersion] = await Promise.all([renderProject(dir, project), renderProject(dir, { ...project, name: "第二版" })]);
  assert.notEqual(oldVersion.article, newVersion.article);
  const before = await fs.readFile(path.join(dir, oldVersion.article), "utf8");
  assert.match(before, /<h1>A &lt; B<\/h1>/);
  assert.match(before, /&lt;b&gt;第一段&lt;\/b&gt;/);
  assert.ok(!(await fs.readFile(path.join(dir, newVersion.article), "utf8")).includes("A &lt; B"));
  assert.equal((await fs.readdir(path.join(dir, "exports"))).length, 2);
});

test("OpenScreen 必须选择单窗 ID", async t => {
  const dir = await temp(t);
  await assert.rejects(runOpenScreen({ executable: process.execPath, action: "record", folder: dir, windowId: "screen:0:0", seconds: 1 }), /单个窗口/);
});

test("语音 CLI 收到独立 UTF-8 正文和离线参数，重试保留既有 WAV", async t => {
  const dir = await temp(t);
  const script = path.join(dir, "voice fixture.py"), template = path.join(dir, "public template.pt"), output = path.join(dir, "voice.wav");
  const text = "一段有空格的中文旁白。\n第二行。";
  const model = "model with spaces";
  const project = await createExample(dir, "brief");
  const publicWav = path.join(dir, project.scenes[0].audio);
  // 临时 CLI 用 Node 解释，验证跨系统参数边界和回滚，不需要安装语音模型。
  const fake = `const fs=require('node:fs');const args=process.argv.slice(2);
    function value(key){return args[args.indexOf(key)+1];}
    if(args[0]!=='speak'||!args.includes('--offline')||value('--template')!==${JSON.stringify(template)}||value('--model')!==${JSON.stringify(model)})process.exit(2);
    if(fs.readFileSync(value('--text'),'utf8')!==${JSON.stringify(text)})process.exit(3);
    fs.copyFileSync(${JSON.stringify(publicWav)},value('--output'));`;
  await fs.writeFile(script, fake);
  await fs.writeFile(template, "test template");
  const request = { python: process.execPath, script, template, text, output, model };
  assert.equal((await synthesizeVoice(request)).output, output);
  const original = await fs.readFile(output);
  await assert.rejects(synthesizeVoice(request), /EEXIST/);
  assert.deepEqual(await fs.readFile(output), original);
  assert.ok(!(await fs.readdir(dir)).some(f => f.startsWith(".media-")));
});
