import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import bundledFfmpeg from "ffmpeg-static";

const sourceExamples = fileURLToPath(new URL("../examples/", import.meta.url));
const exampleDir = process.resourcesPath && /[\\/]app\.asar[\\/]/.test(sourceExamples)
  ? path.join(process.resourcesPath, "examples") : sourceExamples;
const fps = 24;
const sampleRate = 48000;
const imageTypes = new Set([".png", ".jpg", ".jpeg", ".bmp", ".webp"]);
const formats = {
  ".png": "image2", ".jpg": "image2", ".jpeg": "image2", ".bmp": "image2", ".webp": "image2",
  ".mp4": "mov", ".mov": "mov", ".m4v": "mov", ".m4a": "mov", ".webm": "matroska", ".mkv": "matroska",
  ".avi": "avi", ".gif": "gif", ".wav": "wav", ".mp3": "mp3", ".aac": "aac", ".flac": "flac", ".ogg": "ogg",
};
const fonts = { win32: "Microsoft YaHei", darwin: "PingFang SC", linux: "Noto Sans CJK SC" };
const font = fonts[process.platform] || "sans-serif";
const fallbackFont = path.join(exampleDir, "fonts", "WorkbenchHan.ttf");
const ffmpegDefault = bundledFfmpeg?.replace(/([\\/])app\.asar([\\/])/, "$1app.asar.unpacked$2");
const themes = {
  tutorial: { label: "录屏教程", bg: "#f3f3ec", ink: "#182f29", muted: "#53675d", accent: "#ac462c", line: "#c3c9bb", mat: "#dbe1d5" },
  brief: { label: "热点口播", bg: "#101e2b", ink: "#f9f1df", muted: "#b0c2cd", accent: "#efad67", line: "#49616c", mat: "#243947" },
};

function within(root, target) {
  const relative = path.relative(root, target);
  return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

async function assetPath(root, relative) {
  if (typeof relative !== "string" || !relative || /^[a-z]+:/i.test(relative) ||
      path.win32.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === "..")) {
    throw new Error("素材须使用工程内的相对路径。");
  }
  const actual = await fs.realpath(path.resolve(root, relative));
  if (!within(root, actual) || !(await fs.stat(actual)).isFile()) throw new Error("素材位于工程目录以外或不是文件。");
  return actual;
}

async function localDirectory(root, name) {
  const target = path.join(root, name);
  await fs.mkdir(target, { recursive: true });
  const actual = await fs.realpath(target);
  if (!within(root, actual)) throw new Error("输出目录指向工程以外。");
  return actual;
}

function localInput(filename) {
  const ext = path.extname(filename).toLowerCase();
  const demuxer = formats[ext];
  if (!demuxer) throw new Error("暂不支持这种素材格式：" + ext);
  const args = ["-protocol_whitelist", "file,pipe", "-f", demuxer];
  if (demuxer === "image2") args.push("-pattern_type", "none");
  if (demuxer === "mov") args.push("-enable_drefs", "0", "-use_absolute_path", "0");
  return [...args, "-i", filename];
}

function run(executable, args, { cwd, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "", lastLine = "", pending = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    const accept = line => {
      if (!line.trim()) return;
      lastLine = line.trim().slice(-2500);
      onLine?.(line);
    };
    child.stdout.on("data", chunk => {
      const lines = (pending + chunk).split(/\r?\n/);
      pending = lines.pop().slice(-1048576);
      for (const line of lines) accept(line);
    });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-6000); });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (pending) accept(pending);
      if (code === 0) resolve();
      else reject(new Error((stderr.trim() || lastLine || "媒体工具已退出").slice(-2200) + " [" + (code ?? signal) + "]"));
    });
  });
}

export async function createExample(folder, kind) {
  if (!Object.hasOwn(themes, kind)) throw new Error("未知示例类型。");
  await fs.mkdir(folder, { recursive: true });
  const root = await fs.realpath(folder);
  const assets = await localDirectory(root, "assets");
  const staging = await fs.mkdtemp(path.join(assets, ".example-"));
  const name = kind + "-" + path.basename(staging).slice(-6);
  try {
    const source = path.join(exampleDir, kind);
    const project = JSON.parse(await fs.readFile(path.join(source, "project.json"), "utf8"));
    const assetDir = path.join(source, "assets");
    for (const filename of await fs.readdir(assetDir)) {
      await fs.writeFile(path.join(staging, filename), await fs.readFile(path.join(assetDir, filename)));
    }
    await fs.writeFile(path.join(staging, "CREDITS.md"), await fs.readFile(path.join(exampleDir, "CREDITS.md")));
    for (const scene of project.scenes) {
      for (const field of ["media", "audio", "poster"]) {
        if (scene[field]) scene[field] = "assets/" + name + "/" + path.basename(scene[field]);
      }
      // 跟踪有精确分句时间的原音频，换声或改稿后会重新分配字幕时间。
      scene.cueAudio = scene.audio;
    }
    await fs.rename(staging, path.join(assets, name));
    return project;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

const xml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const glyphWidth = c => /\s/.test(c) ? 0.32 : /[!-~]/.test(c) ? 0.58 : 1;
const textWidth = value => [...value].reduce((sum, c) => sum + glyphWidth(c), 0);

function linesOf(value, capacity) {
  const lines = [];
  let line = "";
  for (const token of String(value ?? "").match(/[A-Za-z0-9]+(?:[.’'-][A-Za-z0-9]+)*|[^\r]/gu) || []) {
    if (token === "\n") {
      if (line.trim()) lines.push(line.trim());
      line = "";
      continue;
    }
    const parts = textWidth(token) > capacity ? [...token] : [token];
    for (const part of parts) {
      if (line && textWidth(line + part) > capacity) {
        lines.push(line.trimEnd());
        line = "";
      }
      if (line || part.trim()) line += part;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function limitLines(lines, count) {
  if (lines.length <= count) return lines;
  return [...lines.slice(0, count - 1), [...lines[count - 1]].slice(0, -1).join("") + "…"];
}

function svgText(lines, x, y, size, step, color, weight = 400) {
  return lines.map((line, i) => `<text x="${x}" y="${y + i * step}" font-size="${size}" font-weight="${weight}" fill="${color}">${xml(line)}</text>`).join("");
}

function png(width, height, drawing) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" font-family="'${font}','Workbench Han',sans-serif">${drawing}</svg>`;
  return new Resvg(svg, { font: { defaultFontFamily: "Workbench Han", fontFiles: [fallbackFont], loadSystemFonts: true } }).render().asPng();
}

function validCues(scene, duration) {
  if (!Array.isArray(scene.cues) || !scene.cues.length || scene.audio !== scene.cueAudio) return false;
  let end = 0;
  for (const cue of scene.cues) {
    if (!cue || typeof cue.text !== "string" || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) ||
        cue.start < end - 0.005 || cue.end <= cue.start || cue.end > duration + 0.15) return false;
    end = cue.end;
  }
  return scene.cues.map(cue => cue.text).join("").trim() === scene.text.trim();
}

function captions(scene, duration) {
  if (validCues(scene, duration)) return scene.cues;
  const phrases = scene.text.match(/[^，。！？；、,.!?;\n]+[，。！？；、,.!?;]*/gu) || [scene.text];
  const chunks = phrases.flatMap(phrase => linesOf(phrase.trim(), 25)).filter(Boolean);
  const total = chunks.reduce((sum, chunk) => sum + Math.max(2.5, textWidth(chunk)), 0);
  let offset = 0;
  return chunks.map(text => {
    const start = offset;
    offset += duration * Math.max(2.5, textWidth(text)) / total;
    return { start, end: offset, text };
  });
}

function validateProject(project) {
  if (!project || typeof project.name !== "string" || !project.name.trim() ||
      !Array.isArray(project.scenes) || !project.scenes.length) throw new Error("请填写作品标题并添加至少一个分镜。");
  for (const scene of project.scenes) {
    if (!scene || typeof scene.title !== "string" || !scene.title.trim() || typeof scene.text !== "string" || !scene.text.trim()) {
      throw new Error("每段分镜都需要标题和字幕正文。");
    }
    if (!Number.isFinite(scene.seconds) || scene.seconds <= 0 ||
        !Number.isFinite(scene.zoom ?? 1) || (scene.zoom ?? 1) < 1 || (scene.zoom ?? 1) > 4) {
      throw new Error("镜头时长须为正数，推镜倍率须在 1 至 4 之间。");
    }
  }
}

async function prepareScene(root, work, figures, scene, index, ffmpeg) {
  const media = await assetPath(root, scene.media);
  const still = imageTypes.has(path.extname(media).toLowerCase());
  const imageName = "scene-" + (index + 1) + ".png";
  const imagePath = path.join(figures, imageName);
  let poster = media;
  if (scene.poster && path.parse(scene.poster).name === path.parse(scene.media).name &&
      path.dirname(scene.poster) === path.dirname(scene.media)) poster = await assetPath(root, scene.poster);
  const thumb = !still && poster === media ? "thumbnail=24," : "";
  await ffmpeg([...localInput(poster), "-vf", thumb + "scale=1200:1060:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
    "-frames:v", "1", "-update", "1", imagePath]);
  const image = await fs.readFile(imagePath);
  const pcm = path.join(work, "voice-" + index + ".raw");
  let soundSeconds = 0;
  if (scene.audio || !still) {
    const audio = scene.audio ? await assetPath(root, scene.audio) : media;
    try {
      const trim = scene.audio ? [] : ["-t", String(scene.seconds)];
      await ffmpeg([...localInput(audio), "-map", "0:a:0", ...trim, "-vn", "-ac", "1", "-ar", String(sampleRate), "-f", "s16le", pcm]);
      soundSeconds = (await fs.stat(pcm)).size / (2 * sampleRate);
      if (scene.audio && !soundSeconds) throw new Error("配音文件不含声音采样。");
    } catch (error) {
      if (scene.audio || !/matches no streams|does not contain any stream/i.test(error.message)) throw error;
    }
  }
  const seconds = Math.max(scene.seconds, soundSeconds);
  return { scene, index, media, still, image, imageName, pcm: soundSeconds ? pcm : null,
    ratio: image.readUInt32BE(16) / image.readUInt32BE(20), soundSeconds, seconds,
    cues: captions(scene, soundSeconds || seconds) };
}

function layout(portrait, ratio) {
  if (!portrait) return { w: 1280, h: 720, x: 42, y: 87, mw: 1196, mh: 502, titleY: 57, captionY: 651 };
  const mh = Math.round(Math.max(342, Math.min(748, 656 / ratio)) / 2) * 2;
  const y = Math.round((950 - mh) / 4) * 2 + 82;
  return { w: 720, h: 1280, x: 32, y, mw: 656, mh, titleY: 140, captionY: Math.max(815, y + mh + 107) };
}

function videoOverlay(view, data, theme, portrait, caption, total) {
  const { w, h, x, y, mw, mh, titleY, captionY } = view;
  const { scene, index } = data;
  let drawing = svgText([theme.label + "   /   " + (index + 1) + " · " + total], x, portrait ? 65 : 51,
    portrait ? 24 : 23, 0, theme.muted);
  const titleLines = limitLines(linesOf(scene.title, portrait ? 14 : 23), portrait ? 2 : 1);
  drawing += svgText(titleLines, portrait ? x : 292, titleY, portrait ? 44 : 37, 58, theme.ink, 700);
  drawing += `<rect x="${x}" y="${y}" width="${mw}" height="${mh}" fill="none" stroke="${theme.line}" stroke-width="2"/>`;
  const size = portrait ? 38 : 36;
  const captionLines = linesOf(caption, portrait ? 16 : 31);
  drawing += `<rect x="${x}" y="${captionY - 49}" width="50" height="5" fill="${theme.accent}"/>`;
  drawing += svgText(captionLines, x, captionY + (portrait ? 12 : 1), size, portrait ? 56 : 45, theme.ink, 600);
  return png(w, h, drawing);
}

function cardImage(project, data, theme, lines, page, pages, cover = false) {
  const title = cover ? project.name : data.scene.title;
  const heading = limitLines(linesOf(title, cover ? 13 : 15), 3);
  const y = (cover ? 243 : 205) + (heading.length - 1) * 84;
  const imgY = y + 62;
  const imgH = 535;
  const src = data.image.toString("base64");
  const label = cover ? theme.label : theme.label + "   /   " + (data.index + 1) + " · " + project.scenes.length;
  let drawing = `<rect width="1080" height="1440" fill="${theme.bg}"/><rect x="64" y="67" width="48" height="6" fill="${theme.accent}"/>`;
  drawing += svgText([label], 64, 135, 29, 0, theme.muted, 600);
  drawing += svgText(heading, 64, cover ? 243 : 205, cover ? 70 : 62, 84, theme.ink, 700);
  drawing += `<rect x="64" y="${imgY}" width="952" height="${imgH}" fill="${theme.mat}"/><image x="64" y="${imgY}" width="952" height="${imgH}" preserveAspectRatio="xMidYMid meet" xlink:href="data:image/png;base64,${src}"/>`;
  drawing += svgText(lines, 64, imgY + imgH + 79, cover ? 40 : 43, 65, theme.ink);
  if (pages > 1) drawing += svgText([(page + 1) + " / " + pages], 875, 1385, 26, 0, theme.muted);
  return png(1080, 1440, drawing);
}

function chooseShort(scenes) {
  if (scenes.some(({ scene }) => typeof scene.short === "boolean")) {
    const included = scenes.filter(({ scene }) => scene.short !== false);
    if (!included.length) throw new Error("请将至少一个分镜纳入精简版。");
    return included;
  }
  return scenes.slice(0, Math.max(1, Math.ceil(scenes.length * 0.6)));
}

async function renderSegment(data, theme, total, portrait, dir, ffmpeg) {
  const { scene } = data;
  const speed = portrait ? 1.08 : 1;
  const sourceSeconds = portrait && data.soundSeconds ? Math.min(data.seconds, data.soundSeconds + 0.16) : data.seconds;
  const frames = Math.ceil(sourceSeconds / speed * fps);
  const duration = frames / fps;
  const view = layout(portrait, data.ratio);
  const stem = (portrait ? "tall" : "wide") + "-" + data.index;
  const cues = data.cues.map(cue => ({ text: cue.text, start: cue.start / speed, end: Math.min(duration, cue.end / speed) }));
  const overlayList = [], tiles = [];
  // 话语间停顿和手动延长的镜尾恢复空白，与独立 SRT 使用同一时间线。
  let previousEnd = 0;
  for (const cue of cues) {
    if (cue.start - previousEnd > 1 / fps) tiles.push({ text: "", start: previousEnd, end: cue.start });
    tiles.push(cue);
    previousEnd = cue.end;
  }
  if (!tiles.length || duration - previousEnd > 1 / fps) tiles.push({ text: "", start: previousEnd, end: duration });
  for (const [i, tile] of tiles.entries()) {
    const name = stem + "-caption-" + i + ".png";
    await fs.writeFile(path.join(dir, name), videoOverlay(view, data, theme, portrait, tile.text, total));
    overlayList.push("file '" + name + "'", "duration " + Math.max(1 / fps, (tiles[i + 1]?.start ?? duration) - tile.start).toFixed(5));
    if (i === tiles.length - 1) overlayList.push("file '" + name + "'");
  }
  const overlay = path.join(dir, stem + "-captions.txt");
  await fs.writeFile(overlay, overlayList.join("\n") + "\n");
  const { w, h, x, y, mw, mh } = view;
  const mat = theme.mat.replace("#", "0x"), bg = theme.bg.replace("#", "0x");
  const zoom = scene.zoom ?? 1;
  const filters = ["setpts=(PTS-STARTPTS)/" + speed, "fps=" + fps,
    `scale=${mw}:${mh}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
    `pad=${mw}:${mh}:(ow-iw)/2:(oh-ih)/2:color=${mat}`, "setsar=1"];
  if (zoom > 1.001) {
    const position = `1+(${zoom}-1)*(1-cos(PI*min(on/${Math.max(1, frames - 1)},1)))/2`;
    filters.push(`zoompan=z='${position}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${mw}x${mh}:fps=${fps}`);
  }
  filters.push("tpad=stop_mode=clone:stop_duration=" + duration.toFixed(5), `pad=${w}:${h}:${x}:${y}:color=${bg}`);
  const vf = "[0:v]" + filters.join(",") + "[base];[base][1:v]overlay=eof_action=repeat,format=yuv420p[v]";
  const audio = data.pcm ? ["-f", "s16le", "-ar", String(sampleRate), "-ac", "1", "-i", data.pcm] :
    ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono"];
  const output = path.join(dir, stem + ".mkv");
  const mediaInput = data.still ? ["-loop", "1", "-framerate", String(fps), ...localInput(data.media)] : localInput(data.media);
  await ffmpeg([...mediaInput, "-f", "concat", "-safe", "1", "-i", overlay, ...audio,
    "-filter_complex_threads", "2", "-filter_complex", vf, "-map", "[v]", "-map", "2:a:0",
    "-af", `atempo=${speed},apad,atrim=duration=${duration.toFixed(6)}`, "-t", duration.toFixed(6),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-threads", "4", "-c:a", "pcm_s16le", output]);
  return { output, duration, cues, sampleVoice: Boolean(scene.audio && scene.audio === scene.cueAudio) };
}

function srtTime(seconds) {
  const ms = Math.round(seconds * 1000);
  const pair = a => String(a).padStart(2, "0");
  return `${pair(Math.floor(ms / 3600000))}:${pair(Math.floor(ms / 60000) % 60)}:${pair(Math.floor(ms / 1000) % 60)},${String(ms % 1000).padStart(3, "0")}`;
}

const creditLine = "Built-in narration: Piper Chaowen (OHF-Voice), Cori Samuel / Hi-Fi TTS (Bakhturina et al.), CC BY 4.0. https://www.openslr.org/109/ https://creativecommons.org/licenses/by/4.0/";

async function joinSegments(segments, name, directory, work, project, ffmpeg) {
  const list = path.join(work, name + "-clips.txt");
  await fs.writeFile(list, segments.map(s => "file '" + path.basename(s.output) + "'\nduration " + s.duration.toFixed(6)).join("\n") + "\n");
  const credit = segments.some(s => s.sampleVoice) ? ["-metadata", "comment=" + creditLine] : [];
  await ffmpeg(["-f", "concat", "-safe", "1", "-i", list, "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
    "-metadata", "title=" + project.name, ...credit, path.join(directory, name + ".mp4")]);
  let start = 0, number = 0;
  const entries = [];
  for (const section of segments) {
    for (const cue of section.cues) {
      entries.push(`${++number}\n${srtTime(start + cue.start)} --> ${srtTime(start + cue.end)}\n${cue.text}\n`);
    }
    start += section.duration;
  }
  await fs.writeFile(path.join(directory, name + ".srt"), "\uFEFF" + entries.join("\n"));
}

const md = value => String(value ?? "").replace(/[\\\x60*_{}[\]<>#!|]/g, "\\$&");

function sourceText(source) {
  if (!source || typeof source !== "object") return null;
  const title = [source.title, source.publishedAt].filter(value => typeof value === "string" && value).join(" · ");
  let href = "";
  try {
    const url = new URL(source.url);
    if (["https:", "http:"].includes(url.protocol)) href = url.href;
  } catch { /* 手工资料来源也可以只有名称。 */ }
  return title || href ? { title: title || href, href } : null;
}

async function writeArticle(directory, prepared, project) {
  const references = [project.source, ...prepared.map(data => data.scene.source)].map(sourceText).filter(Boolean);
  const sources = new Map(references.map(source => [source.href || source.title, source]));
  const pieces = [], markdown = ["# " + md(project.name), "", md(project.intro || "")], script = ["# " + md(project.name), ""];
  for (const data of prepared) {
    const { scene } = data;
    const articleText = [scene.text, scene.notes].filter(Boolean).flatMap(text => String(text).split(/\n+/).filter(Boolean));
    pieces.push(`<section><h2>${xml(scene.title)}</h2><figure><img loading="lazy" src="data:image/png;base64,${data.image.toString("base64")}" alt="${xml(scene.title)}"></figure>${articleText.map(p => "<p>" + xml(p) + "</p>").join("")}</section>`);
    markdown.push("", "## " + md(scene.title), "", "![" + md(scene.title) + "](images/" + data.imageName + ")", "", articleText.map(md).join("\n\n"));
    script.push("## " + (data.index + 1) + ". " + md(scene.title), "", md(scene.text), "",
      "画面 " + md(scene.media) + "　｜　配音 " + md(scene.audio || "素材原声或静音") + "　｜　推镜 " + (scene.zoom ?? 1) + "×", "");
  }
  const citations = [];
  for (const source of sources.values()) {
    const link = source.href ? `<a href="${xml(source.href)}" rel="noreferrer">${xml(source.title)}</a>` : xml(source.title);
    citations.push("<p>资料来源 · " + link + "</p>");
    markdown.push("", "资料来源 · " + (source.href ? "[" + md(source.title) + "](<" + source.href.replace(/>/g, "%3E") + ">)" : md(source.title)));
  }
  markdown.push("");
  const html = `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>${xml(project.name)}</title>
<style>
body{margin:0;background:#faf9f4;color:#222c29;font:18px/1.9 system-ui,sans-serif}
main{width:min(91%,720px);margin:60px auto}h1,h2{line-height:1.35;text-wrap:balance}
h1{font-size:clamp(33px,6vw,55px)}h2{font-size:29px;margin:1.9em 0 .65em}
figure{margin:0 0 1em}img{display:block;width:100%;height:auto}p{overflow-wrap:anywhere}
footer{margin-top:3rem;border-top:1px solid #c6cdc4;color:#52615b;font-size:15px}a{color:#165e4d}
</style></head><body><main>
<h1>${xml(project.name)}</h1>
${project.intro ? "<p>" + xml(project.intro) + "</p>" : ""}
${pieces.join("\n")}
${citations.length ? "<footer>" + citations.join("\n") + "</footer>" : ""}
</main></body></html>`;
  await Promise.all([fs.writeFile(path.join(directory, "article.html"), html), fs.writeFile(path.join(directory, "article.md"), markdown.join("\n")),
    fs.writeFile(path.join(directory, "script.md"), script.join("\n")), fs.writeFile(path.join(directory, "CREDITS.md"), await fs.readFile(path.join(exampleDir, "CREDITS.md")))]);
}

export async function renderProject(folder, project, { ffmpegPath = ffmpegDefault, onProgress } = {}) {
  validateProject(project);
  if (!ffmpegPath) throw new Error("未找到适用于当前系统的 FFmpeg。");
  const root = await fs.realpath(folder);
  const exportsDir = await localDirectory(root, "exports");
  const build = await fs.mkdtemp(path.join(exportsDir, ".building-"));
  const work = path.join(build, ".work"), figures = path.join(build, "images");
  const runName = new Date().toISOString().replace(/[:.]/g, "-") + "-" + path.basename(build).slice(-6);
  const out = name => path.posix.join("exports", runName, name);
  const ffmpeg = args => run(ffmpegPath, ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", ...args]);
  const progress = (percent, message) => onProgress?.({ percent, message });
  try {
    await Promise.all([fs.mkdir(work), fs.mkdir(figures), fs.mkdir(path.join(build, "cards"))]);
    const prepared = [], cards = [];
    const theme = themes[project.kind] || themes.tutorial;
    for (const [i, scene] of project.scenes.entries()) {
      progress(Math.round(i / project.scenes.length * 21), "读取第 " + (i + 1) + " 段素材与声音");
      const data = await prepareScene(root, work, figures, scene, i, ffmpeg);
      prepared.push(data);
      const allLines = linesOf(scene.text, 21);
      const headingCount = Math.min(3, linesOf(scene.title, 15).length);
      const pageSize = Math.max(3, 7 - headingCount);
      const count = Math.max(1, Math.ceil(allLines.length / pageSize));
      for (let page = 0; page < count; page++) {
        const name = "cards/scene-" + (i + 1) + (count > 1 ? "-" + (page + 1) : "") + ".png";
        await fs.writeFile(path.join(build, name), cardImage(project, data, theme, allLines.slice(page * pageSize, (page + 1) * pageSize), page, count));
        cards.push(out(name));
      }
    }
    const first = prepared[0];
    const coverText = limitLines(linesOf(first.scene.text, 21), 3);
    await fs.writeFile(path.join(build, "cover.png"), cardImage(project, first, theme, coverText, 0, 1, true));
    await writeArticle(build, prepared, project);
    const short = chooseShort(prepared);
    const total = prepared.length + short.length;
    let completed = 0;
    for (const portrait of [false, true]) {
      const segments = [];
      for (const item of portrait ? short : prepared) {
        progress(22 + Math.round(completed / total * 74), (portrait ? "制作精简竖版" : "制作完整横版") + " · " + item.scene.title);
        segments.push(await renderSegment(item, theme, prepared.length, portrait, work, ffmpeg));
        completed++;
      }
      await joinSegments(segments, portrait ? "short" : "full", build, work, project, ffmpeg);
    }
    await fs.rm(work, { recursive: true });
    await fs.rename(build, path.join(exportsDir, runName));
    progress(100, "导出完成");
    return { video: out("full.mp4"), shortVideo: out("short.mp4"), cards, cover: out("cover.png"), article: out("article.html"),
      articleImages: prepared.map(item => out("images/" + item.imageName)),
      markdown: out("article.md"), script: out("script.md"), subtitles: out("full.srt"), shortSubtitles: out("short.srt"), credits: out("CREDITS.md") };
  } finally {
    await fs.rm(build, { recursive: true, force: true });
  }
}

async function requireFile(filename, suffix) {
  if (typeof filename !== "string" || !path.isAbsolute(filename) || (suffix && path.extname(filename).toLowerCase() !== suffix) ||
      !(await fs.stat(filename)).isFile()) throw new Error("请选择已有的本机文件。");
  return filename;
}

async function produceFile(output, suffix, produce) {
  if (typeof output !== "string" || !path.isAbsolute(output) || path.extname(output).toLowerCase() !== suffix) {
    throw new Error("请指定有效的输出文件。");
  }
  const parent = await fs.realpath(path.dirname(output));
  const dir = await fs.mkdtemp(path.join(parent, ".media-"));
  const tmp = path.join(dir, "result" + suffix);
  try {
    const info = await produce(tmp, dir);
    if (!(await fs.stat(tmp)).size) throw new Error("工具返回了空文件。");
    // 只在生成成功后占用目标名，已有作品或并发任务均不能被覆盖。
    const reservation = await fs.open(output, "wx");
    await reservation.close();
    try {
      await fs.rename(tmp, output);
    } catch (error) {
      await fs.unlink(output);
      throw error;
    }
    return { ...info, output };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function openScreenCommand(executable, args, onEvent) {
  let done, error;
  try {
    await run(executable, [...args, "--json"], { onLine: line => {
      let event;
      try { event = JSON.parse(line); } catch { return; }
      if (event.event === "done") done = event;
      if (event.event === "error") error = event.message;
      onEvent?.(event);
    } });
  } catch (cause) {
    throw new Error(error || done?.error || cause.message);
  }
  if (done?.success !== true) throw new Error(error || done?.error || "OpenScreen 缺少成功回执。请使用支持 CLI 的正式版本。");
  return done;
}

export async function runOpenScreen({ executable, action, folder, windowId, sourceId, windowTitle, seconds = 12,
  projectPath, output, autoZoom = false, onEvent } = {}) {
  await requireFile(executable);
  const command = args => openScreenCommand(executable, args, onEvent);
  if (action === "sources") {
    const response = await command(["sources"]);
    return { windows: response.sources?.windows || [] };
  }
  if (action === "export") {
    await requireFile(projectPath, ".openscreen");
    return produceFile(output, ".mp4", async tmp => {
      const result = await command(["export", projectPath, "-o", tmp, "--quality", "good", "--fps", "30", ...(autoZoom ? ["--auto-zoom"] : [])]);
      return { width: result.width, height: result.height };
    });
  }
  if (action !== "record") throw new Error("不支持的 OpenScreen 操作。");
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 3600) throw new Error("录制时长须为 1 至 3600 秒。");
  const id = windowId || sourceId;
  if (typeof id !== "string" || !id.startsWith("window:")) throw new Error("请先选择要录制的单个窗口。");
  const { sources } = await command(["sources"]);
  const selected = (sources?.windows || []).find(item => item.id === id);
  if (!selected?.name?.trim() || (windowTitle && selected.name !== windowTitle)) throw new Error("选中的窗口已关闭或标题已变化。请刷新窗口列表。");
  // OpenScreen CLI 只按标题子串选第一个窗口。重名、包含关系和改名都必须在启动录制前处理。
  const key = selected.name.toLowerCase();
  if (sources.windows.filter(item => item.name?.toLowerCase().includes(key)).length !== 1) {
    throw new Error("有多个窗口匹配这个标题。请先给目标窗口使用一个独立标题。");
  }
  const root = await fs.realpath(folder);
  const temp = await fs.mkdtemp(path.join(root, ".record-"));
  const bundle = path.join(root, "take-" + randomUUID());
  let published = false;
  try {
    const raw = path.join(temp, "take.openscreen");
    const take = await command(["record", "--window", selected.name, "--cursor", "editable-overlay", "--duration", String(seconds), "--project", raw]);
    // pack 同时复制原始视频、真实指针轨迹及可编辑工程，移动工作目录后仍可重新导出。
    const packed = await command(["pack", raw, "--out", bundle]);
    const packedPath = await fs.realpath(packed.projectPath);
    if (!within(bundle, packedPath)) throw new Error("OpenScreen 返回了工作目录以外的工程。");
    const media = JSON.parse(await fs.readFile(packedPath, "utf8")).media;
    const screenVideoPath = await fs.realpath(path.join(bundle, path.basename(media.screenVideoPath)));
    const telemetry = screenVideoPath + ".cursor.json";
    const cursorData = await fs.stat(telemetry).then(stat => stat.isFile() && stat.size > 0, () => false);
    published = true;
    return { projectPath: packedPath, screenVideoPath, durationMs: take.durationMs, cursorData };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
    if (!published) await fs.rm(bundle, { recursive: true, force: true });
  }
}

export async function synthesizeVoice({ python, script, template, text, output, model, offline = true } = {}) {
  await Promise.all([requireFile(python), requireFile(script, ".py"), requireFile(template, ".pt")]);
  if (typeof text !== "string" || !text.trim()) throw new Error("请先填写这段旁白。");
  return produceFile(output, ".wav", async (tmp, dir) => {
    const manuscript = path.join(dir, "speech.txt");
    await fs.writeFile(manuscript, text, "utf8");
    const args = [script, "speak", "--template", template, "--text", manuscript, "--output", tmp, "--language", "Chinese"];
    if (offline) args.push("--offline");
    if (model) args.push("--model", model);
    await run(python, args, { cwd: path.dirname(script) });
    const file = await fs.open(tmp);
    try {
      const header = Buffer.alloc(12);
      await file.read(header, 0, header.length, 0);
      if (header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8) !== "WAVE") throw new Error("语音工具返回的文件不是 WAV。");
    } finally { await file.close(); }
  });
}
