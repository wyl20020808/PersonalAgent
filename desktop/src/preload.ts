import {contextBridge,ipcRenderer} from 'electron';
import type {Request} from './types.js';
contextBridge.exposeInMainWorld('personalAgent',Object.freeze({invoke:(request:Request)=>ipcRenderer.invoke('personalagent:request',request)}));
