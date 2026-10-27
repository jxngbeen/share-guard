importScripts('naver.js');
// Session storage contains routing and per-tab pause metadata only.
const key=tabId=>`tab:${tabId}`, pauseKey=tabId=>`paused:${tabId}`;
const queues=new Map();
const isPaused=async tabId=>!!(await chrome.storage.session.get(pauseKey(tabId)))[pauseKey(tabId)];
function enqueue(tabId,operation){const next=(queues.get(tabId)||Promise.resolve()).then(operation);queues.set(tabId,next.catch(()=>{}));return next;}
const emptyState=paused=>({version:0,text:'',matches:[],contexts:[],selectedIndices:[],selectionRevision:0,kind:null,tooLong:false,paused,composing:false,canUndo:false});
const missing={ok:false,error:'아직 검사한 입력창이 없습니다. 글을 입력하거나 페이지를 새로고침해 주세요.'};
async function route(message,sender){
  if(message.type==='SG_INIT'&&sender.tab)return {ok:true,paused:await isPaused(sender.tab.id)};
  if(message.type==='SG_REPORT'&&sender.tab){
    const tabId=sender.tab.id,paused=await isPaused(tabId);
    const previous=(await chrome.storage.session.get(key(tabId)))[key(tabId)];
    if(previous&&previous.documentId!==sender.documentId&&(message.activity||0)<=(previous.activity||0))return {ok:true,opened:false,paused};
    const state={activity:message.activity||0,frameId:sender.frameId,documentId:sender.documentId,count:paused?0:message.count,paused};
    await chrome.storage.session.set({[key(tabId)]:state});
    await chrome.action.setBadgeBackgroundColor({tabId,color:'#c13e3e'});
    await chrome.action.setBadgeText({tabId,text:paused?'OFF':message.tooLong?'!':message.count?String(message.count):''});
    if(message.notify&&!paused){
      const tab=await chrome.tabs.get(tabId),win=await chrome.windows.get(tab.windowId);
      if(tab.active&&win.focused){
        try{await chrome.action.openPopup({windowId:tab.windowId});return {ok:true,opened:true,paused};}
        catch{/* Keep the badge when Chrome refuses to open the popup. */}
      }
    }
    return {ok:true,opened:false,paused};
  }
  if(message.type==='SG_NAVER_EDIT'&&sender.tab){
    const url=new URL(sender.url),state=(await chrome.storage.session.get(key(sender.tab.id)))[key(sender.tab.id)];
    if(await isPaused(sender.tab.id)||url.origin!=='https://blog.naver.com'||!/PostWriteForm\.naver$/.test(url.pathname)||state?.documentId!==sender.documentId)return {ok:false,error:'검사한 네이버 문서가 바뀌었거나 검사가 정지되었습니다.'};
    const results=await chrome.scripting.executeScript({target:{tabId:sender.tab.id,documentIds:[sender.documentId]},world:'MAIN',func:editNaverDocument,args:[message.request]});
    return results[0]?.result||{ok:false,error:'네이버 편집기를 수정하지 못했습니다.'};
  }
  if(message.type==='SG_COMPOSITION'&&sender.tab){
    await chrome.tabs.sendMessage(sender.tab.id,{type:'SG_COMPOSITION_STATE',active:!!message.active}).catch(()=>{});
    return {ok:true};
  }
  // Only our popup may retrieve content or request changes.
  if(sender.tab||sender.url!==chrome.runtime.getURL('popup.html'))return;
  if(message.type==='SG_POPUP'){
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab)return missing;
    const action=message.command.action;
    if(action==='pause')await enqueue(tab.id,async()=>{
      const paused=typeof message.command.paused==='boolean'?message.command.paused:!(await isPaused(tab.id));
      await chrome.storage.session.set({[pauseKey(tab.id)]:paused});
      await chrome.tabs.sendMessage(tab.id,{type:'SG_SET_PAUSED',paused}).catch(()=>{});
      await chrome.action.setBadgeText({tabId:tab.id,text:paused?'OFF':''});
    });
    const paused=await isPaused(tab.id),state=(await chrome.storage.session.get(key(tab.id)))[key(tab.id)];
    if(!state)return paused||action==='pause'?{ok:true,state:emptyState(paused)}:missing;
    if(paused&&!['get','pause'].includes(action))return {ok:false,error:'이 탭의 검사가 꺼져 있습니다. 다시 켠 뒤 확인해 주세요.'};
    if(!['get','pause'].includes(action)&&message.command.documentId!==state.documentId)return {ok:false,error:'입력 문서가 바뀌었습니다. 다시 확인해 주세요.'};
    try{
      if(['get','pause'].includes(action))await chrome.tabs.sendMessage(tab.id,{type:'SG_SET_PAUSED',paused},{documentId:state.documentId});
      const result=await chrome.tabs.sendMessage(tab.id,{...message.command,action:action==='pause'?'get':action,type:'SG_COMMAND'},{documentId:state.documentId});
      if(result?.state)result.state.documentId=state.documentId;
      return result;
    }catch{return paused?{ok:true,state:emptyState(true)}:{ok:false,error:'페이지가 이동했거나 확장이 갱신되었습니다. 페이지를 새로고침한 후 다시 입력해 주세요.'};}
  }
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id||!message?.type?.startsWith('SG_'))return;
  const operation=message.type==='SG_REPORT'?enqueue(sender.tab?.id,()=>route(message,sender)):route(message,sender);
  operation.then(result=>respond(result||{ok:false})).catch(()=>respond({ok:false,error:'검사 상태를 가져오지 못했습니다.'}));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId=>{queues.delete(tabId);chrome.storage.session.remove([key(tabId),pauseKey(tabId)]);});
chrome.tabs.onUpdated.addListener((tabId,info)=>{
  if(info.status==='loading')enqueue(tabId,async()=>{await chrome.storage.session.remove(key(tabId));await chrome.action.setBadgeText({tabId,text:await isPaused(tabId)?'OFF':''}).catch(()=>{});});
});
