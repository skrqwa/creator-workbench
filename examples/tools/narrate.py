"""用公开的朝闻模型重建示例旁白及其分句时间。开发依赖 piper-tts[zh]、pypinyin。"""
import argparse
import json
import re
import wave
from pathlib import Path

import numpy as np
from piper import PiperVoice
from piper.phonemize_chinese import PHONEME_TO_ID, PINYIN_INITIALS, phonemes_to_ids
from pypinyin import Style, lazy_pinyin


def phonemes(text):
    result = []
    for syllable in lazy_pinyin(text, style=Style.TONE3, neutral_tone_with_five=True, tone_sandhi=True):
        match = re.fullmatch(r"([a-zvü]+)([1-5])", syllable)
        if not match:
            result.extend(char for char in syllable if char in PHONEME_TO_ID)
            continue
        base, tone = match.groups()
        initial = next((value for value in PINYIN_INITIALS if base.startswith(value)), "")
        result.extend([initial or "Ø", base[len(initial):].replace("ü", "v"), tone])
    return result


def create_voice(model, project_path):
    project = json.loads(project_path.read_text("utf-8"))
    rate = model.config.sample_rate
    for scene in project["scenes"]:
        chunks, cues = [], []
        cursor = 0
        for phrase in re.findall(r"[^，。！？；、]+[，。！？；、]*", scene["text"]):
            signal = model.phoneme_ids_to_audio(phonemes_to_ids(phonemes(phrase)))
            active = np.flatnonzero(np.abs(signal) > 0.009)
            if active.size:
                signal = signal[max(0, active[0] - 320):min(len(signal), active[-1] + 550)]
            pause = np.zeros(round(rate * (0.22 if phrase.endswith("。") else 0.11)))
            chunk = np.concatenate((np.clip(signal, -1, 1), pause))
            chunks.append(chunk)
            cues.append({"text": phrase, "start": round(cursor / rate, 3), "end": round((cursor + len(chunk)) / rate, 3)})
            cursor += len(chunk)
        output = project_path.parent / scene["audio"]
        output.parent.mkdir(exist_ok=True, parents=True)
        samples = np.concatenate(chunks)
        samples = samples * (0.88 / max(float(np.max(np.abs(samples))), 0.01))
        with wave.open(str(output), "wb") as wav:
            wav.setparams((1, 2, rate, 0, "NONE", "not compressed"))
            wav.writeframes((samples * 32767).astype("<i2").tobytes())
        scene["seconds"] = round(cursor / rate + 0.3, 2)
        scene["cues"] = cues
        print(scene["id"], scene["seconds"], flush=True)
    project_path.write_text(json.dumps(project, ensure_ascii=False, indent=2) + "\n", "utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("model", type=Path, help="公开的 zh_CN-chaowen-medium.onnx 文件")
    args = parser.parse_args()
    voice = PiperVoice.load(args.model)
    root = Path(__file__).resolve().parents[1]
    for kind in ("tutorial", "brief"):
        create_voice(voice, root / kind / "project.json")
