// 黛青画册流 v2：语义图标（装饰图标默认 aria-hidden="true"）、声纹与示意画布
if (new URLSearchParams(location.search).get('theme') === 'dark') document.body.classList.add('dark')

const ICONS = {
  play: '<path d="M8 5.2v13.6L19 12z" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.3 2.3 4.7-4.8"/>',
  alertCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4.5M12 16h.01"/>',
  dashedCircle: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3.2 3.2"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M18.5 11a6.5 6.5 0 0 1-13 0M12 17.5V21"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  sparkle: '<path d="M12 3.5 13.9 9l5.6 2-5.6 2L12 18.5 10.1 13 4.5 11l5.6-2z"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  rss: '<path d="M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8"/><circle cx="6" cy="18" r="1.4" fill="currentColor"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>',
  bookmark: '<path d="M7 4h10v16l-5-3.5L7 20z"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m20.5 16-5-5-9 8.5"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  zoom: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  grip: '<circle cx="9" cy="6.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="15" cy="6.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="9" cy="17.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="15" cy="17.5" r="1.15" fill="currentColor" stroke="none"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/>',
  shield: '<path d="M12 3 5 6v6c0 4.5 3 7.8 7 9 4-1.2 7-4.5 7-9V6z"/><path d="m9.2 12.2 2 2 3.8-4"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
}

document.querySelectorAll('i[data-i]').forEach((el) => {
  el.outerHTML = `<svg class="ic ${el.className}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[el.dataset.i] || ''}</svg>`
})

function seeded(seed) {
  let s = seed
  return () => ((s = (s * 9301 + 49297) % 233280), s / 233280)
}
document.querySelectorAll('.wave').forEach((w) => {
  const n = +w.dataset.n || 28
  const p = +(w.dataset.p || 0)
  const r = seeded(+(w.dataset.seed || 7))
  let html = ''
  for (let i = 0; i < n; i++) {
    const env = Math.sin((Math.PI * (i + 0.5)) / n) * 0.5 + 0.5
    const v = Math.max(0.18, Math.min(1, (r() * 0.68 + 0.32) * env))
    html += `<span class="${i / n < p ? 'on' : ''}" style="height:${Math.round(v * 100)}%"></span>`
  }
  w.innerHTML = html
})

const F = `font-family="Noto Sans SC, Microsoft YaHei UI, sans-serif"`
function bars(x0, cy, n, gap, color, seed, max = 22) {
  const r = seeded(seed)
  let out = ''
  for (let i = 0; i < n; i++) {
    const env = Math.sin((Math.PI * (i + 0.5)) / n) * 0.55 + 0.45
    const h = Math.max(4, (r() * 0.7 + 0.3) * env * max)
    out += `<rect x="${x0 + i * gap}" y="${(cy - h / 2).toFixed(1)}" width="${gap * 0.55}" height="${h.toFixed(1)}" rx="${gap * 0.27}" fill="${color}"/>`
  }
  return out
}

const SCENES = {
  open: `<rect width="320" height="180" fill="#ECE8DE"/><rect y="128" width="320" height="52" fill="#E3DDD0"/>
    <rect x="70" y="124" width="196" height="6" rx="3" fill="#CDBFA6"/>
    <rect x="150" y="84" width="76" height="42" rx="4" fill="#2B3431"/><rect x="154" y="88" width="68" height="34" rx="2" fill="#F4F1E8"/>
    ${bars(162, 105, 9, 6, '#19544B', 4, 16)}
    <rect x="142" y="125" width="92" height="4" rx="2" fill="#2B3431"/>
    <circle cx="112" cy="76" r="13" fill="#3B4743"/><path d="M89 124q2-34 23-34t23 34z" fill="#19544B"/>
    <rect x="248" y="106" width="16" height="18" rx="3" fill="#9E6526"/>
    <path d="M256 106q-11-14-3-28M256 106q8-13 2-26M256 106q13-6 11-19" stroke="#478268" stroke-width="3" fill="none" stroke-linecap="round"/>
    <rect x="44" y="24" width="104" height="30" rx="15" fill="#fff"/><path d="M90 53l9 9 3-9z" fill="#fff"/>
    <text x="96" y="44" text-anchor="middle" font-size="13" font-weight="600" fill="#A64635" ${F}>又要重录？</text>`,
  template: `<rect width="320" height="180" fill="#EEEBE3"/>
    <rect x="34" y="20" width="252" height="144" rx="10" fill="#fff" stroke="#DDD8CC"/>
    <path d="M34 30a10 10 0 0 1 10-10h232a10 10 0 0 1 10 10v12H34z" fill="#F4F1EA"/>
    <circle cx="48" cy="31" r="3" fill="#D5CCB8"/><circle cx="58" cy="31" r="3" fill="#D5CCB8"/><circle cx="68" cy="31" r="3" fill="#D5CCB8"/>
    <rect x="112" y="26" width="96" height="10" rx="5" fill="#E8E4DA"/>
    <rect x="52" y="56" width="104" height="90" rx="8" fill="#F7F5EF" stroke="#89AAA0" stroke-dasharray="4 3"/>
    <path d="M104 78v22M95 87l9-9 9 9" stroke="#19544B" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="104" y="124" text-anchor="middle" font-size="11" fill="#47544F" ${F}>拖入十秒人声</text>
    <rect x="168" y="56" width="100" height="90" rx="8" fill="#DEECE7"/>
    <circle cx="190" cy="78" r="11" fill="#19544B"/><path d="M185 78l3.5 3.5 6.5-7" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="180" y="111" font-size="11.5" font-weight="600" fill="#1A231F" ${F}>火柴人音色</text>
    <text x="180" y="129" font-size="10" fill="#47544F" ${F}>模板已生成</text>`,
  voice: `<rect width="320" height="180" fill="#F1ECE2"/>
    <rect x="34" y="38" width="114" height="104" rx="10" fill="#fff"/>
    <rect x="48" y="56" width="70" height="7" rx="3.5" fill="#2B3431"/>
    <rect x="48" y="75" width="86" height="6" rx="3" fill="#D4CEBF"/><rect x="48" y="89" width="78" height="6" rx="3" fill="#D4CEBF"/>
    <rect x="48" y="103" width="82" height="6" rx="3" fill="#D4CEBF"/><rect x="48" y="117" width="50" height="6" rx="3" fill="#D4CEBF"/>
    <path d="M158 90h26M176 82l8 8-8 8" stroke="#9E6526" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="194" y="56" width="94" height="68" rx="10" fill="#19544B"/>
    ${bars(204, 90, 13, 6, '#E9F2EE', 11, 34)}
    <text x="241" y="144" text-anchor="middle" font-size="11" fill="#47544F" ${F}>自动配音</text>`,
  recap: `<rect width="320" height="180" fill="#E9EEEA"/>
    <path d="M86 84h148" stroke="#B7CEC4" stroke-width="2" stroke-dasharray="4 4"/>
    <circle cx="80" cy="84" r="24" fill="#fff"/><text x="80" y="91" text-anchor="middle" font-size="20" font-weight="700" fill="#19544B" font-family="Noto Serif SC, serif">一</text>
    <circle cx="160" cy="84" r="24" fill="#fff"/><text x="160" y="91" text-anchor="middle" font-size="20" font-weight="700" fill="#19544B" font-family="Noto Serif SC, serif">二</text>
    <circle cx="240" cy="84" r="24" fill="#19544B"/><text x="240" y="91" text-anchor="middle" font-size="20" font-weight="700" fill="#F7F5EF" font-family="Noto Serif SC, serif">三</text>
    <text x="80" y="132" text-anchor="middle" font-size="12" fill="#47544F" ${F}>录十秒</text>
    <text x="160" y="132" text-anchor="middle" font-size="12" fill="#47544F" ${F}>建模板</text>
    <text x="240" y="132" text-anchor="middle" font-size="12" fill="#1A231F" font-weight="600" ${F}>出配音</text>`,
}

document.querySelectorAll('[data-scene]').forEach((el) => {
  el.innerHTML = `<svg class="art" aria-hidden="true" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">${SCENES[el.dataset.scene] || ''}</svg>`
})
