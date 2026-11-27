const number = (min, max) => v => Number.isFinite(v) && v >= min && v <= max;
const bool = v => typeof v === 'boolean';
const fields = {
  title: {
    displayTitle: v => typeof v === 'string' && Boolean(v.trim()) && v.length <= 500,
    hidden: bool,
  },
  callout: {accentColor: v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v), hidden: bool},
  camera: {zoom: number(1, 4), focusX: number(0, 1), focusY: number(0, 1)},
  captionStyle: {paddingBottom: number(0, 24)},
};

export function validVisualValue(objectId, property, value) {
  return Object.hasOwn(fields, objectId) && Object.hasOwn(fields[objectId], property) &&
    fields[objectId][property](value);
}

export function generatedVisualValue(scene, objectId, property) {
  const value = scene.visual?.[objectId]?.[property];
  if (validVisualValue(objectId, property, value)) return value;
  if (objectId === 'title' && property === 'displayTitle') return scene.title || '';
  if (objectId === 'camera' && property === 'zoom') return scene.zoom ?? 1;
  if (objectId === 'camera') return 0.5;
  if (property === 'paddingBottom') return 0;
  if (property === 'hidden') return false;
  return null;
}

export const validOverride = patch => patch && typeof patch.id === 'string' && typeof patch.sceneId === 'string' &&
  validVisualValue(patch.objectId, patch.property, patch.manualValue);

export function sceneVisual(scene) {
  const value = (objectId, property) => generatedVisualValue(scene, objectId, property);
  return {
    displayTitle: value('title', 'displayTitle'),
    titleHidden: value('title', 'hidden'),
    accentColor: value('callout', 'accentColor'),
    calloutHidden: value('callout', 'hidden'),
    zoom: value('camera', 'zoom'),
    focusX: value('camera', 'focusX'),
    focusY: value('camera', 'focusY'),
    paddingBottom: value('captionStyle', 'paddingBottom'),
  };
}

export function applyManualOverrides(generatedScenes, manualOverrides = []) {
  const byScene = new Map();
  for (const patch of Array.isArray(manualOverrides) ? manualOverrides : []) {
    if (!validOverride(patch) || patch.enabled === false) continue;
    if (!byScene.has(patch.sceneId)) byScene.set(patch.sceneId, []);
    byScene.get(patch.sceneId).push(patch);
  }
  return generatedScenes.map(scene => {
    const patches = byScene.get(scene.id);
    if (!patches) return scene;
    const visual = {...scene.visual};
    for (const {objectId, property, manualValue} of patches)
      visual[objectId] = {...visual[objectId], [property]: manualValue};
    return {...scene, visual};
  });
}

export function reconcileManualOverrides(prevScenes, nextScenes, manualOverrides = []) {
  const previous = new Map(prevScenes.map(s => [s.id, s]));
  const next = new Map(nextScenes.map(s => [s.id, s]));
  const overrideConflicts = [];
  const patches = (Array.isArray(manualOverrides) ? manualOverrides : []).filter(validOverride).map(patch => {
    const {id, sceneId, objectId, property, manualValue} = patch;
    const before = previous.get(sceneId);
    const scene = next.get(sceneId);
    const baseValue = Object.hasOwn(patch, 'baseValue') ? patch.baseValue
      : before ? generatedVisualValue(before, objectId, property) : null;
    const generatedValue = scene ? generatedVisualValue(scene, objectId, property) : null;
    // 基线随补丁保存，连续重生成不会让未解决的冲突自行消失。
    if (patch.enabled !== false && (!scene || baseValue !== generatedValue))
      overrideConflicts.push({overrideId:id,sceneId,objectId,property,manualValue,generatedValue,
        reason:scene ? 'generated_value_changed' : 'scene_deleted'});
    return {...patch, baseValue};
  });
  return {manualOverrides:patches, overrideConflicts};
}

export function resolveManualOverride(scenes, patches, id, action) {
  const patch = patches.find(p => p.id === id);
  if (!patch) throw new Error('找不到这项人工微调');
  if (action === 'adopt' || action === 'remove') return patches.filter(p => p.id !== id);
  if (action === 'disable') return patches.map(p => p.id === id ? {...p,enabled:false} : p);
  if (action !== 'keep') throw new Error('无效的微调处理方式');
  const scene = scenes.find(s => s.id === patch.sceneId);
  if (!scene) throw new Error('分镜已删除，恢复同一分镜后才能重新确认人工值');
  return patches.map(p => p.id === id ? {...p,enabled:true,baseValue:generatedVisualValue(scene,p.objectId,p.property)} : p);
}
