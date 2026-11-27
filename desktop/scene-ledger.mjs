import { createHash } from 'node:crypto';
import { applyManualOverrides, sceneVisual } from './overrides.mjs';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export const stableHash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const hashes = ['scriptHash','audioHash','mediaHash','timingHash'];
const reasons = ['文案','配音','媒体或画面设置','时长或字幕时间'];

export function reconcileSceneLedger(previous, scenes, overrides, assetHash = () => null) {
  const old = new Map((previous?.scenes || []).map(item => [item.sceneId, item]));
  const affectedSceneIds = [], offsetShiftedSceneIds = [];
  let startFrame = 0;
  const entries = applyManualOverrides(scenes, overrides).map(scene => {
    const before = old.get(scene.id);
    old.delete(scene.id);
    const signature = relative => relative ? [relative,assetHash(relative)] : null;
    const cues = Array.isArray(scene.cues) ? scene.cues : [];
    const embeddedAudio = scene.media && !/\.(png|jpe?g|bmp|webp)$/i.test(scene.media) ? scene.media : '';
    const scriptHash = stableHash([scene.title,scene.text,scene.notes,scene.source,cues.map(c => c?.text)]);
    const audioHash = stableHash([signature(scene.audio || embeddedAudio), Boolean(scene.audio)]);
    const mediaHash = stableHash([signature(scene.media),signature(scene.poster),signature(scene.openScreenProject),sceneVisual(scene)]);
    const timingHash = stableHash([scene.seconds,scene.short,scene.cueAudio,cues.map(c => [c?.start,c?.end])]);
    const combinedHash = stableHash([scriptHash,audioHash,mediaHash,timingHash]);
    // 用主工程的编排时长记录全局偏移，位置不参与单镜确认指纹。
    const endFrame = startFrame + Math.ceil((Number(scene.seconds) || 4) * 24);
    const entry = {sceneId:scene.id,scriptHash,audioHash,mediaHash,timingHash,combinedHash,startFrame,endFrame};
    if (previous && before?.combinedHash !== combinedHash) affectedSceneIds.push(scene.id);
    if (before && before.startFrame !== startFrame) offsetShiftedSceneIds.push(scene.id);
    startFrame = endFrame;
    let adoption = before?.adoption || {status:'draft'};
    if (adoption.status === 'approved' && adoption.approvedFingerprint !== combinedHash) {
      const changed = hashes.flatMap((key, i) => before[key] !== entry[key] ? [reasons[i]] : []);
      adoption = {...adoption,status:'needs_review',invalidatedReason:changed.join('、') || '分镜指纹'};
    }
    return {...entry,adoption,...(before?.exportedFingerprint ? {exportedFingerprint:before.exportedFingerprint} : {})};
  });
  affectedSceneIds.push(...old.keys());
  const sceneChange = Boolean(affectedSceneIds.length || offsetShiftedSceneIds.length);
  return {
    ledger:{scenes:entries,
      affectedSceneIds:sceneChange ? affectedSceneIds : previous?.affectedSceneIds || [],
      offsetShiftedSceneIds:sceneChange ? offsetShiftedSceneIds : previous?.offsetShiftedSceneIds || []},
    sceneChange,
  };
}
