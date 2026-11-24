// 所有选择器只用于作者主动打开的官方创作页。字段不匹配时由用户在平台内确认。
export const fieldsByPlatform={
  douyin:{title:['input[placeholder*="标题"]','input[placeholder*="作品名称"]'],body:['[data-placeholder*="描述"]','[contenteditable="true"][data-placeholder]']},
  xiaohongshu:{title:['input[placeholder*="标题"]'],body:['.tiptap[contenteditable="true"]','[contenteditable="true"][data-placeholder]']},
  bilibili:{title:['input[placeholder*="标题"]','textarea[placeholder*="标题"]'],body:['.ql-editor[contenteditable="true"]','.ProseMirror[contenteditable]','textarea[placeholder*="简介"]']},
  channels:{title:['input[placeholder*="短标题"]','input[placeholder*="标题"]'],body:['[contenteditable="true"][data-placeholder]','.input-editor[contenteditable="true"]']},
  wechat:{title:['#title','textarea[placeholder*="标题"]'],body:['#ueditor_0','body.view[contenteditable]','.ProseMirror[contenteditable]']},
  kuaishou:{title:['input[placeholder*="标题"]'],body:['[contenteditable="true"][data-placeholder]','textarea[placeholder*="介绍"]','textarea[placeholder*="描述"]']},
  toutiao:{title:['textarea[placeholder*="标题"]','input[placeholder*="标题"]','.article-title textarea'],body:['.ProseMirror[contenteditable="true"]','[contenteditable="true"][data-placeholder*="内容"]','textarea[placeholder*="简介"]']},
  zhihu:{title:['textarea[placeholder*="标题"]','input[placeholder*="标题"]'],body:['.public-DraftEditor-content[contenteditable="true"]','.ProseMirror[contenteditable="true"]','[contenteditable="true"][role="textbox"]']}
};

// 这个函数在受沙箱保护的平台页面执行，只访问可编辑控件。
export function fillForm(config,expected,apply) {
  const seen=e=>e && e.getClientRects().length && !e.disabled && !e.readOnly;
  const find=selectors=>selectors.flatMap(s=>Array.from(document.querySelectorAll(s))).find(e=>seen(e) && (e.isContentEditable || /^(INPUT|TEXTAREA)$/.test(e.tagName)));
  function set(el,val) {
    if(!el || !val)return false;
    const read=()=>el.isContentEditable?(el.innerText || '').trim():el.value.trim();
    if(read()===val.trim())return true;
    if(!apply || read())return false;
    if(el.isContentEditable){
      el.focus();
      const sel=getSelection();const range=document.createRange();range.selectNodeContents(el);
      sel.removeAllRanges();sel.addRange(range);
      if(!document.execCommand('insertText',false,val))el.textContent=val;
    }else{
      const proto=el.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(el,val);
    }
    el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
    return read().replace(/\s+/g,' ')===val.trim().replace(/\s+/g,' ');
  }
  const t=find(config.title),b=find(config.body);
  const title=set(t,expected.title);
  // 少数视频或想法编辑器只有一个正文框，将标题和描述一起保留。
  const combined=!t && ['video','pin','cards'].includes(expected.type);
  const body=set(b,combined && expected.title ? expected.title+'\n\n'+expected.body : expected.body);
  return {title:title || (combined && body),body,images:b?b.querySelectorAll('img[src]').length:0,editor:Boolean(t||b)};
}
export function findUpload(kind,cover,marker) {
  const inputs=Array.from(document.querySelectorAll('input[type=file]')).filter(e=>!e.disabled);
  const score=e=>{
    const accept=(e.accept||'').toLowerCase(), label=[e.name,e.id,e.getAttribute('aria-label'),e.parentElement?.getAttribute('class'),e.parentElement?.getAttribute('title')].join(' ').toLowerCase();
    const coverLike=/cover|封面/.test(label);
    if(cover && !coverLike || !cover && coverLike)return -1;
    if(kind==='video' && /video|mp4|mov/.test(accept))return 3;
    if(kind==='image' && /image|jpg|png|webp/.test(accept))return 3;
    return -1;
  };
  const el=inputs.filter(e=>score(e)>=0).sort((a,b)=>score(b)-score(a))[0];
  if(!el)return null;
  el.setAttribute('data-creator-upload',marker);
  return {multiple:el.multiple};
}
export function receiptFromPage(platform) {
  const paths={toutiao:/^\/(article|video)\/\d+/,douyin:/^\/video\/\d+/,bilibili:/^\/(video\/BV|read\/cv)/,xiaohongshu:/^\/(explore|discovery\/item)\//,wechat:/^\/s(?:\/|$)/,kuaishou:/^\/short-video\//,zhihu:/^\/(p|pin)\/\d+/};
  const p=paths[platform];
  const notices=Array.from(document.querySelectorAll('[role="alert"],[role="status"],[role="dialog"],[class*="toast"],[class*="message"],h1,h2,h3'));
  const message=notices.filter(n=>n.getClientRects().length && !n.closest('[contenteditable="true"]')).map(n=>n.innerText?.trim()).filter(m=>m && m.length<240).join('\n');
  const acknowledged=/(发布成功|发表成功|投稿成功|已提交审核|作品审核中|投稿已提交)/.test(message);
  if(!acknowledged)return null;
  const eligible=Array.from(document.querySelectorAll('a[href]')).filter(a=>/查看(刚刚发布的)?(作品|稿件|文章|视频)|查看详情|打开作品/.test(a.innerText));
  const link=eligible.map(a=>{try{return new URL(a.href);}catch{return null;}}).find(u=>u && p?.test(u.pathname));
  return {status:/审核中|提交审核/.test(message)?'reviewing':'submitted',url:link?.href || '',detail:'创作页已显示投稿或审核提示。'};
}
export function clickEditorButton(labels) {
  const matches=Array.from(document.querySelectorAll('button,[role="button"]')).filter(e=>e.getClientRects().length && !e.disabled && e.getAttribute('aria-disabled')!=='true' && labels.includes((e.innerText||'').trim()));
  if(matches.length!==1)return false;
  matches[0].click();return true;
}

// 远端草稿必须同时对上当前编辑页的稿件编号和平台自身的保存提示。
export function savedArticle(platform) {
  const u=new URL(location.href);
  const id=platform==='toutiao' && u.hostname==='mp.toutiao.com' && u.pathname.endsWith('/graphic/publish') ? u.searchParams.get('pgc_id')
    : platform==='zhihu' && u.hostname==='zhuanlan.zhihu.com' ? u.pathname.match(/^\/p\/(\d+)\/edit\/?$/)?.[1] : '';
  if(!/^\d{4,32}$/.test(id || ''))return null;
  const labels=document.querySelectorAll('span,small,button,[role="status"],[role="alert"]');
  const saved=Array.from(labels).some(n=>!n.children.length && n.getClientRects().length && !n.closest('[contenteditable="true"]') && /^(?:已保存|已自动保存|草稿已保存|已保存草稿|保存成功|已保存至草稿箱|已保存到草稿箱)(?:\s|$|[，。])/.test((n.innerText||'').trim()));
  return saved ? {status:'draft',kind:'web-draft',remoteId:id,detail:'编辑器已显示草稿保存状态和稿件编号。'} : null;
}
