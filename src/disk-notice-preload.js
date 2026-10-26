const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('diskNotice',{
  get:()=>ipcRenderer.invoke('disk-notice-data'),
  act:action=>ipcRenderer.invoke('disk-notice-action',action)
});
