const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain } = require('electron');
const { VolumeMonitor } = require('./volume-monitor');
const { createLoginStartup } = require('./login-startup');

function createBackgroundService({ app, openMainWindow, getMainWindow, getLanguage, onError, directory = __dirname, monitorOptions = {} }) {
  const settingsFile = path.join(app.getPath('userData'), 'background-settings.json');
  let settings = { diskNotices: true };
  try { const saved = JSON.parse(fs.readFileSync(settingsFile,'utf8')); if(typeof saved.diskNotices==='boolean')settings.diskNotices=saved.diskNotices; } catch { /* defaults */ }
  const login = createLoginStartup({app});
  let tray = null, notice = null, noticeVolume = null, noticeTimer = null;
  let waiting = [], recent = [], stopped = false;
  const preparedSources = new Map();
  const english = () => getLanguage()==='en';
  const monitor = new VolumeMonitor({ ...monitorOptions, onArrival: volume => {
    recent = recent.filter(item=>item.root!==volume.root).concat(volume).slice(-8);
    if(settings.diskNotices){waiting.push(volume);waiting=waiting.slice(-8);showNext();}
    updateTray();
  }, onRemoval: root => {
    recent=recent.filter(item=>item.root!==root);waiting=waiting.filter(item=>item.root!==root);
    if(noticeVolume?.root===root)closeNotice();
    updateTray();
  }, onError: error => { if(error.code!=='ENOENT')console.error('Rilevamento dischi:',error.message); } });
  function trustedNotice(event) {
    return notice&&!notice.isDestroyed()&&event.sender===notice.webContents&&event.senderFrame===notice.webContents.mainFrame;
  }
  function updateTray() {
    if(!tray)return;
    const en=english();
    tray.setContextMenu(Menu.buildFromTemplate([
      {label:en?'Open SecureCopy':'Apri SecureCopy',click:()=>openMainWindow()},
      ...recent.map(volume=>({label:(en?'Copy from ':'Copia da ')+volume.name,click:()=>prepare(volume).catch(onError)})),
      {type:'separator'},
      {label:en?'New drive alerts':'Avvisi nuovi dischi',type:'checkbox',checked:settings.diskNotices,click:async item=>{try{await setDiskNotices(item.checked);}catch(error){onError(error)}}},
      {type:'separator'}, {label:en?'Quit SecureCopy':'Esci da SecureCopy',click:()=>app.quit()}
    ]));
  }
  function closeNotice() {
    clearTimeout(noticeTimer);noticeTimer=null;
    const previous=notice;notice=null;noticeVolume=null;
    if(previous&&!previous.isDestroyed())previous.destroy();
    if(!stopped)setTimeout(showNext,250).unref?.();
  }
  function showNext() {
    if(stopped||notice||!settings.diskNotices||!waiting.length)return;
    noticeVolume=waiting.shift();
    const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    notice=new BrowserWindow({width:380,height:254,x:area.x+area.width-396,y:area.y+16,frame:false,transparent:true,resizable:false,minimizable:false,maximizable:false,show:false,skipTaskbar:true,alwaysOnTop:true,hasShadow:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,preload:path.join(directory,'disk-notice-preload.js')}});
    notice.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    notice.webContents.on('will-navigate',event=>event.preventDefault());
    const current=notice;
    current.once('ready-to-show',()=>{if(notice===current)current.showInactive()});
    current.once('closed',()=>{if(notice===current){notice=null;noticeVolume=null;clearTimeout(noticeTimer);if(!stopped)setTimeout(showNext,250).unref?.()}});
    current.loadFile(path.join(directory,'disk-notice.html'));
    noticeTimer=setTimeout(closeNotice,25000);noticeTimer.unref?.();
  }
  async function prepare(volume) {
    const stat=await fs.promises.lstat(volume.root);
    if(!stat.isDirectory()||stat.isSymbolicLink()||`${stat.dev}:${stat.ino}`!==volume.signature)throw new Error('Il disco non è più disponibile. Collegalo di nuovo.');
    const payload={root:volume.root,name:volume.name,id:crypto.randomUUID()};
    preparedSources.set(volume.root, volume.signature);
    if(preparedSources.size>16)preparedSources.delete(preparedSources.keys().next().value);
    openMainWindow();
    const win=getMainWindow();
    if(!win||win.isDestroyed())throw new Error('Impossibile aprire SecureCopy.');
    const send=()=>{if(!win.isDestroyed())win.webContents.send('disk-import-requested',payload)};
    if(win.webContents.isLoading())win.webContents.once('did-finish-load',send);else send();
  }
  async function setDiskNotices(enabled) {
    if(typeof enabled!=='boolean')throw new Error('Impostazione non valida.');
    const next={...settings,diskNotices:enabled};
    const temp=settingsFile+'.tmp';
    await fs.promises.writeFile(temp,JSON.stringify(next),{mode:0o600});await fs.promises.rename(temp,settingsFile);
    settings=next;if(!enabled){waiting=[];closeNotice()}
    updateTray();
    const win=getMainWindow();if(win&&!win.isDestroyed())win.webContents.send('background-settings-updated',getSettings());
    return getSettings();
  }
  function getSettings(){return {...settings,...login.get()};}
  ipcMain.handle('disk-notice-data',event=>{if(!trustedNotice(event))throw new Error('Richiesta non autorizzata.');return {name:noticeVolume.name,card:noticeVolume.card,language:getLanguage()}});
  ipcMain.handle('disk-notice-action',async(event,action)=>{
    if(!trustedNotice(event)||!['prepare','dismiss'].includes(action))throw new Error('Richiesta non autorizzata.');
    const volume=noticeVolume;
    if(action==='prepare')await prepare(volume);
    closeNotice();return true;
  });
  return {
    getSettings, setDiskNotices, setLogin:enabled=>login.set(enabled),
    confirmSelectedSources(sources) { for (const root of sources) preparedSources.delete(root); },
    validateSources(sources) {
      for(const root of sources){
        const expected=preparedSources.get(root);if(!expected)continue;
        const stat=fs.lstatSync(root);
        if(stat.isSymbolicLink()||!stat.isDirectory()||`${stat.dev}:${stat.ino}`!==expected)throw new Error('La scheda sorgente è cambiata. Selezionala di nuovo.');
      }
    },
    async start() {
      if(process.platform!=='darwin')return;
      let icon=nativeImage.createFromNamedImage('NSFolder');
      if(icon.isEmpty())icon=nativeImage.createFromPath(path.join(directory,'Assets','ICON.png'));
      icon=icon.resize({width:18,height:18});icon.setTemplateImage(true);
      tray=new Tray(icon);tray.setToolTip('SecureCopy');updateTray();
      await monitor.start();
    },
    refreshLanguage:updateTray,
    stop(){stopped=true;monitor.stop();waiting=[];closeNotice();tray?.destroy();tray=null;},
    // Test seam: all paths still undergo the same mounted-volume validation.
    monitor
  };
}
module.exports={createBackgroundService};
