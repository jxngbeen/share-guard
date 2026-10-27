let state, working=false, selectionWrite=Promise.resolve();
const $ = selector => document.querySelector(selector);
const tell = text => {$('#status').textContent=text;};
function updateSelection() {
  const checks=[...document.querySelectorAll('#list input')],count=checks.filter(n=>n.checked).length;
  $('#selection-count').textContent=`${count}/${checks.length}개 선택`;
  $('#select-all').disabled=working||!checks.length||count===checks.length;
  $('#deselect-all').disabled=working||!count;
  checks.forEach(n=>{n.disabled=working;});
  $('#mask').disabled=$('#delete').disabled=working||!state||state.kind==='rich'||state.paused||state.tooLong||state.composing||!count;
}
const request = async command => {
  const result=await chrome.runtime.sendMessage({type:'SG_POPUP',command:{...command,documentId:command.documentId??state?.documentId}});
  if (!result?.ok) throw new Error(result?.error || '검사 결과를 불러오지 못했습니다.');
  return result;
};
function render(next) {
  state=next; $('#list').replaceChildren();
  $('#popup-title').textContent=state.paused?'검사를 잠시 껐어요.':state.tooLong?'입력 길이를 확인해 주세요.':state.composing?'입력이 끝나면 확인할게요.':state.matches.length?`민감정보 후보 ${state.matches.length}개`:'한 번 더 확인했어요.';
  $('.sg-pill').textContent=state.paused?'검사 꺼짐':'자동 검사';
  $('#empty-result').hidden=state.paused||state.tooLong||state.composing||state.matches.length>0;
  tell(state.paused ? '이 탭 전체의 검사가 꺼져 있습니다.' : state.tooLong ? '20,000자를 초과하여 검사하지 않았습니다.' : state.composing ? '글 입력이 끝나면 다시 확인해 주세요.' : state.matches.length ? '남길 정보인지 확인하고, 필요한 항목만 선택하세요.' : '지원하는 형식의 정보가 발견되지 않았습니다.');
  state.matches.forEach((match,index)=> {
    const label=document.createElement('label'), check=document.createElement('input'), span=document.createElement('span');
    label.className='sg-item';span.className='sg-item-copy';
    check.type='checkbox';check.value=index;check.checked=state.selectedIndices?.includes(index)??true;
    const info=state.contexts?.[index];
    const heading=document.createElement('strong'),location=document.createElement('small'),excerpt=document.createElement('span');
    heading.textContent=match.label;
    location.className='sg-location';location.textContent=info?`${info.line}행 · ${info.column}번째 글자`:'';
    excerpt.className='sg-context';excerpt.textContent=info?.excerpt||'문맥을 불러오려면 글쓰기 페이지를 새로고침하세요.';
    heading.append(location);span.append(heading,excerpt);
    label.append(check,span);$('#list').append(label);
  });
  $('#editor-note').textContent=state.paused?'새로고침해도 정지가 유지됩니다. 이 탭을 닫거나 다시 켜기를 누르면 해제됩니다. 다른 탭에는 영향을 주지 않습니다.':state.kind==='naver' ? '네이버 본문에 바로 반영 · 실행 취소/다시 실행 이력 유지' : state.kind==='rich' ? '이 서식 편집기는 감지만 지원합니다.' : '선택한 항목을 입력창에서 바로 변경합니다.';
  $('#undo').disabled=!state.canUndo; $('#pause').textContent=state.paused?'이 탭 검사 다시 켜기':'이 탭 검사 끄기';
  updateSelection();
}
function saveSelection(){
  updateSelection();
  if(!state||working)return;
  const revision=++state.selectionRevision;
  const command={action:'selection',version:state.version,documentId:state.documentId,revision,indices:[...document.querySelectorAll('#list input:checked')].map(n=>Number(n.value))};
  selectionWrite=request(command).catch(error=>{if(state?.selectionRevision===revision)tell(error.message);});
}
$('#list').addEventListener('change',saveSelection);
for(const [id,checked] of [['#select-all',true],['#deselect-all',false]]) $(id).addEventListener('click',()=>{
  if(working)return;
  document.querySelectorAll('#list input').forEach(n=>{n.checked=checked;});
  saveSelection();
});
async function load() {const result=await request({action:'get'});render(result.state);}
function bind(id,fn) {$(id).addEventListener('click',async()=> {
  if (working) return; working=true;
  for (const button of document.querySelectorAll('button')) button.disabled=true;
  updateSelection();
  try {await selectionWrite;await fn();} catch(error) {tell(error.message);}
  finally {
    working=false; $('#refresh').disabled=false; $('#pause').disabled=false;
    $('#undo').disabled=!state?.canUndo;
    updateSelection();
  }
});}
for (const [id,mode] of [['#mask','mask'],['#delete','delete']]) bind(id,async()=> {
  const indices=[...document.querySelectorAll('#list input:checked')].map(n=>Number(n.value));
  const result=await request({action:'apply',version:state.version,indices,mode});
  render(result.state);tell(result.caretPlaced===false?'내용은 수정했지만 커서를 옮기지 못했습니다. 수정한 부분을 눌러 이어 쓰세요.':'선택한 내용을 변경하고 커서를 수정한 부분 뒤로 옮겼습니다.');
});
bind('#undo',async()=> {const result=await request({action:'undo'});render(result.state);tell(result.caretPlaced===false?'직전 수정을 복원했습니다. 이어 쓸 위치를 눌러 주세요.':'직전 수정을 복원하고 커서를 복원한 부분 뒤로 옮겼습니다.');});
bind('#refresh',load);
bind('#pause',async()=> {const result=await request({action:'pause',paused:!state.paused});render(result.state);});
load().catch(error=> {tell(error.message);for(const button of document.querySelectorAll('button'))button.disabled=true;$('#refresh').disabled=false;});
