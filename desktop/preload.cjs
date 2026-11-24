const {contextBridge,ipcRenderer}=require('electron');
let projectId='';
contextBridge.exposeInMainWorld('studio',{
  call:async(method,payload)=>{
    const result=await ipcRenderer.invoke('workbench:call',method,payload);
    if(method==='bootstrap')projectId=result.project?.id || '';
    if(['project.create','project.open','project.openFolder','project.save'].includes(method) && result?.id)projectId=result.id;
    return result;
  },
  asset:relative=>typeof relative==='string' && projectId && relative && !relative.split('/').some(p=>!p || p==='..' || p==='.') ? 'studio-media://project/'+projectId+'/'+relative.split('/').map(encodeURIComponent).join('/') : '',
  onProgress:fn=>{const listener=(_,data)=>fn(data);ipcRenderer.on('workbench:progress',listener);return ()=>ipcRenderer.removeListener('workbench:progress',listener);}
});
