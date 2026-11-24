"""用球体光照与程序纹理重绘示意图。开发依赖 Pillow 与 NumPy。"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def paint(font_path, out):
    rng = np.random.default_rng(23)
    w, h = 1280, 720
    ivory, gold, blue = "#f5ecd7", "#e7a860", "#b2c6ca"

    def text(draw, x, y, value, size, color):
        draw.text((x, y), value, font=ImageFont.truetype(font_path, size), fill=color, stroke_width=0)

    def field():
        yy, xx = np.mgrid[:h, :w]
        light = np.exp(-((xx - 820) ** 2 + (yy - 260) ** 2) / 440000)
        bg = np.stack([9 + light * 15, 23 + light * 26, 36 + light * 25], axis=-1).astype("uint8")
        im = Image.fromarray(bg)
        d = ImageDraw.Draw(im)
        for _ in range(170):
            x, y = rng.integers(w), rng.integers(h)
            v = int(rng.integers(50, 155))
            d.ellipse((x, y, x + 1, y + 1), fill=(v, v + 6, v + 9))
        return im

    def sphere(diameter):
        n = diameter
        yy, xx = np.mgrid[:n, :n]
        u, v = (xx - n / 2) / (n / 2), (yy - n / 2) / (n / 2)
        r = u * u + v * v
        z = np.sqrt(np.maximum(0, 1 - r))
        tone = np.zeros((n, n), dtype=float)
        for scale, weight in [(7, 15), (26, 7), (89, 5), (284, 2.5)]:
            noise = rng.integers(0, 255, (scale, scale), dtype="uint8")
            noise = np.array(Image.fromarray(noise).resize((n, n), Image.Resampling.BICUBIC))
            tone += (noise / 127.0 - 1) * weight
        for _ in range(diameter):
            cx, cy = rng.integers(n, size=2)
            rad = 2 + rng.power(0.5) * 23
            x0, x1 = max(0, int(cx - rad * 2)), min(n, int(cx + rad * 2 + 1))
            y0, y1 = max(0, int(cy - rad * 2)), min(n, int(cy + rad * 2 + 1))
            ygrid, xgrid = np.mgrid[y0:y1, x0:x1]
            dx, dy = (xgrid - cx) / rad, (ygrid - cy) / rad
            distance = np.sqrt(dx * dx + dy * dy)
            rim = np.exp(-((distance - 0.95) / 0.135) ** 2)
            tone[y0:y1, x0:x1] += 19 * rim * (-0.76 * dx - 0.59 * dy + 0.34) - 8 * np.exp(-(distance / 0.69) ** 4)
        shade = np.maximum(0, -0.77 * u - 0.41 * v + 0.46 * z)
        channels = [a + (b + tone) * (0.14 + 0.86 * shade) for a, b in [(18, 210), (29, 187), (40, 159)]]
        rgba = np.stack([*channels, 255 * np.clip((1 - np.sqrt(r)) * n / 2, 0, 1)], axis=-1)
        return Image.fromarray(np.clip(rgba, 0, 255).astype("uint8"))

    out.mkdir(exist_ok=True, parents=True)
    im = field()
    d = ImageDraw.Draw(im)
    d.arc((320, 75, 1345, 679), 5, 172, fill="#6c7d7e", width=2)
    moon = sphere(635)
    im.paste(moon, (628, 39), moon)
    text(d, 77, 82, "嫦娥六号", 28, blue)
    text(d, 70, 188, "月背", 116, ivory)
    text(d, 71, 335, "采样返回", 79, ivory)
    d.line((79, 516, 304, 516), fill=gold, width=3)
    text(d, 76, 538, "2024.06.25", 38, gold)
    im.save(out / "return.png", optimize=True)

    im = Image.new("RGB", (w, h), "#e8ded0")
    d = ImageDraw.Draw(im)
    d.ellipse((738, 109, 1185, 574), fill="#b1a896", outline="#8d826d", width=5)
    d.ellipse((755, 126, 1169, 555), fill="#d8d1bf", outline="#f8f2df", width=5)
    for _ in range(6200):
        dx, dy = rng.normal(0, 56), rng.normal(0, 48)
        if dx * dx + dy * dy > 150 ** 2:
            continue
        x, y = 963 + dx, 347 + dy
        radius = 1 + rng.power(0.48) * 5
        shade = int(rng.uniform(51, 150))
        d.ellipse((x, y, x + 2 * radius, y + radius * 1.4), fill=(shade, int(shade * 0.91), int(shade * 0.77)))
    text(d, 78, 93, "月背样品的质量", 39, "#514d43")
    text(d, 63, 203, "1935.3", 143, "#29342d")
    text(d, 89, 400, "克", 55, "#904f2d")
    d.line((85, 563, 594, 563), fill="#a5947f", width=2)
    text(d, 83, 587, "地面交接  ·  2024.06.28", 28, "#5d5c50")
    im.save(out / "mass.png", optimize=True)

    im = field()
    d = ImageDraw.Draw(im)
    moon = sphere(574)
    im.paste(moon, (62, 50), moon)
    d.ellipse((308, 361, 442, 462), outline=gold, width=4)
    d.line((439, 419, 622, 454, 720, 454), width=3, fill=gold)
    text(d, 692, 154, "采样区位置示意", 30, blue)
    text(d, 684, 224, "南极—", 70, ivory)
    text(d, 683, 320, "艾特肯盆地", 74, ivory)
    text(d, 692, 511, "月球背面  /  南半球", 31, gold)
    im.save(out / "basin.png", optimize=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("font", help="本机中文字体文件")
    args = parser.parse_args()
    paint(args.font, Path(__file__).resolve().parents[1] / "brief" / "assets")
