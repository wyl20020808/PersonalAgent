const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('personalAgent',{invoke:request=>ipcRenderer.invoke('spinner-preview',request)});
