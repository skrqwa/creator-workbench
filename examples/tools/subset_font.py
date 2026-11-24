"""把 SIL OFL 的 Noto Sans SC 制成横排中文回退字体。开发依赖 fontTools。"""
import argparse
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("noto", help="上游 NotoSansSC[wght].ttf")
    args = parser.parse_args()
    font = TTFont(args.noto)
    options = subset.Options()
    options.layout_features = ["kern", "liga", "locl"]
    options.drop_tables += ["vhea", "vmtx", "VORG", "BASE"]
    options.name_IDs = ["*"]
    tool = subset.Subsetter(options=options)
    points = set()
    for start, stop in [(0x20, 0x024F), (0x2000, 0x22FF), (0x2460, 0x25FF), (0x3000, 0x30FF),
                        (0x3400, 0x9FFF), (0xF900, 0xFAFF), (0xFE10, 0xFFEF)]:
        points.update(range(start, stop + 1))
    tool.populate(unicodes=points)
    tool.subset(font)
    instantiateVariableFont(font, {"wght": 500}, inplace=True)
    names = {1: "Workbench Han", 2: "Regular", 3: "Workbench Han Regular 1.0", 4: "Workbench Han Regular",
             6: "WorkbenchHan-Regular", 16: "Workbench Han", 17: "Regular"}
    for record in font["name"].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding())
    output = Path(__file__).resolve().parents[1] / "fonts" / "WorkbenchHan.ttf"
    output.parent.mkdir(exist_ok=True)
    font.save(output)
