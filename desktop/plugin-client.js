// 网页仅在本机回环地址运行。登录响应中只取可用于核对目标账号的字段。
const token=location.hash.slice(1) || sessionStorage.getItem('current-job');
if(token)sessionStorage.setItem('current-job',token);
history.replaceState(null,'',location.pathname);
const status=document.getElementById('status');
const retry=document.getElementById('retry');
const headers={Authorization:'Bearer '+token};
async function api(url,options={}) {
  const r=await fetch(url,{...options,headers:{...headers,...options.headers}});
  if(!r.ok)throw new Error(r.status===409?'该任务已提交，请回工作台核对结果。':'无法连接当前任务（HTTP '+r.status+'）');
  return r;
}
async function file(item){
  if(!item)return undefined;
  const blob=await (await api('/media/'+item.index)).blob();
  return new File([blob],item.name,{type:item.type});
}
async function start(){
  retry.hidden=true;let begun=false;
  try{
    const data=await (await api('/payload')).json();
    document.getElementById('title').textContent=data.title;
    if(data.started){status.textContent='本次提交已启动，请回工作台查看回执。';return;}
    const p=window.AIToEarnPlugin;
    if(!p)throw new Error('请安装 AiToEarn 浏览器插件，为 '+location.origin+' 开启「仅授权」，再从工作台重新打开此任务。');
    if(!(await p.checkPermission()).granted)throw new Error('请在插件中授权 '+location.origin);
    const {uid,nickname,account}=await p.login(data.platform);
    if(data.uid ? String(uid)!==data.uid : ![nickname,account,String(uid)].includes(data.expected))
      throw new Error('当前平台账号为「'+String(nickname || account || uid)+'」，本次目标为「'+data.expected+'」。请切到对应账号后重试。');
    const params={platform:data.platform,type:data.type,title:data.title,desc:data.desc,platformConfig:data.platformConfig};
    status.textContent='正在准备「'+data.expected+'」的媒体…';
    if(data.type==='video'){params.video=await file(data.video);if(data.cover)params.cover=await file(data.cover);}
    else params.images=await Promise.all(data.images.map(file));
    await api('/begin',{method:'POST'});begun=true;
    const result=await p.publish(params,event=>{status.textContent=String(event.message || event.stage)+' '+Math.round(event.progress || 0)+'%';});
    await api('/result',{method:'POST',body:JSON.stringify({success:result.success,remoteId:result.workId,url:result.shareLink,detail:result.failReason})});
    sessionStorage.removeItem('current-job');
    status.textContent=result.success?'已提交，回执已交回工作台。':'请回工作台核对平台返回的结果。';
  }catch(e){
    status.textContent=e.message;
    if(begun)await api('/result',{method:'POST',body:JSON.stringify({success:false,detail:e.message})}).catch(()=>{});
    else{retry.hidden=false;await api('/notice',{method:'POST'}).catch(()=>{});}
  }
}
retry.onclick=start;
start();
