"""在独立浏览器上下文内操作练习页并录制视口。开发依赖 Playwright 与其 ffmpeg。"""
import argparse
import asyncio
import json
import math
import subprocess
import tempfile
from pathlib import Path
from time import monotonic

from playwright.async_api import async_playwright


async def capture(browser, folder, scene, ffmpeg):
    with tempfile.TemporaryDirectory() as tmp:
        viewport = {"width": 1056, "height": 580}
        context = await browser.new_context(viewport=viewport, record_video_dir=tmp, record_video_size=viewport)
        page = await context.new_page()
        await page.goto((folder / "practice.html").as_uri())
        if scene["id"] != "capture":
            await page.locator("#new").fill("周末读书清单")
            await page.locator(".save").click()
        if scene["id"] == "find":
            await page.locator("li .tag").first.click()
            await page.locator("[data-filter=queued]").click()
        # 无窗口录制的浏览器不合成系统指针，这个叠层跟随实际派发到页面的输入事件。
        await page.evaluate("""() => {
          const pointer=document.createElement('div');
          pointer.style.cssText='position:fixed;pointer-events:none;z-index:100;filter:drop-shadow(0 1px 2px #191f1b);left:33px;top:28px';
          pointer.innerHTML='<svg width="25" height="32" viewBox="0 0 25 32"><path d="M2 2 21 17 13 18 17 27 13 29 9 20 3 26Z" fill="#243e33" stroke="white" stroke-width="2"/></svg>';
          document.body.append(pointer);
          window.addEventListener('pointermove',e=>{pointer.style.left=e.clientX+'px';pointer.style.top=e.clientY+'px'});
          window.addEventListener('pointerdown',e=>pointer.animate([{opacity:0.45},{opacity:1}],240));
        }""")
        started = monotonic()

        async def at(seconds):
            await asyncio.sleep(max(0, started + seconds - monotonic()))

        current = [35, 28]

        async def move_click(selector):
            box = await page.locator(selector).first.bounding_box()
            target = [box["x"] + box["width"] / 2, box["y"] + box["height"] / 2]
            for frame in range(1, 15):
                k = (1 - math.cos(frame / 14 * math.pi)) / 2
                await page.mouse.move(*(current[i] + (target[i] - current[i]) * k for i in range(2)))
                await asyncio.sleep(0.024)
            await page.mouse.click(*target)
            current[:] = target

        await at(0.4)
        if scene["id"] == "capture":
            await move_click("#new")
            for char in "周末读书清单":
                await page.keyboard.insert_text(char)
                await asyncio.sleep(0.14)
            await at(3.2)
            await move_click(".save")
        elif scene["id"] == "filter":
            await move_click("li .tag")
            await at(3.2)
            await move_click("[data-filter=queued]")
        else:
            await move_click("[data-filter=all]")
            await at(3)
            await move_click("#search")
            for char in "读书":
                await page.keyboard.insert_text(char)
                await asyncio.sleep(0.25)
        await at(scene["seconds"] - 0.45)
        await page.screenshot(path=str(folder / (scene["id"] + ".png")))
        await at(scene["seconds"])
        video = page.video
        await context.close()
        raw = await video.path()
        subprocess.run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", raw, "-ss", "0.28",
                        "-vf", "fps=24,tpad=stop_mode=clone:stop_duration=1", "-t", str(scene["seconds"]),
                        "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p",
                        "-movflags", "+faststart", str(folder / (scene["id"] + ".mp4"))], check=True)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("chrome")
    parser.add_argument("ffmpeg")
    args = parser.parse_args()
    folder = Path(__file__).resolve().parents[1] / "tutorial"
    scenes = json.loads((folder / "project.json").read_text("utf-8"))["scenes"]
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, executable_path=args.chrome)
        await asyncio.gather(*(capture(browser, folder / "assets", scene, args.ffmpeg) for scene in scenes))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
