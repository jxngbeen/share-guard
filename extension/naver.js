// Runs only in the selected Naver writing document, after a popup command.
// No publishing, saving, network access, or permanent storage is performed here.
async function editNaverDocument(request) {
  try {
    if (location.origin !== 'https://blog.naver.com' || !/PostWriteForm\.naver$/.test(location.pathname)) throw new Error('네이버 글쓰기 페이지가 아닙니다.');
    const instances=Object.values(window.SmartEditor?._editors || {});
    const editors=instances.filter(e=>typeof e.getDocumentData==='function');
    if (editors.length!==1) throw new Error('네이버 편집기를 찾지 못했습니다. 페이지를 새로고침해 주세요.');
    const editor=editors[0], before=JSON.parse(JSON.stringify(editor.getDocumentData()));
    const canonical=value=>JSON.stringify(value,(_,v)=>v && typeof v==='object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
    const clone=value=>JSON.parse(JSON.stringify(value));
    function paragraphsIn(value, result=new Map()) {
      if (!value || typeof value!=='object') return result;
      if (value.id && Array.isArray(value.nodes)) result.set(value.id,value);
      for (const child of Object.values(value)) if (typeof child==='object') paragraphsIn(child,result);
      return result;
    }
    // Node IDs and adjacent run boundaries are editor bookkeeping, not text/style changes.
    function runs(nodes) {
      const result=[];
      for (const node of nodes) {
        if (node['@ctype']!=='textNode' || typeof node.value!=='string') throw new Error('이 문단 구조는 복원할 수 없습니다.');
        if (!node.value) continue;
        const attributes={...node};delete attributes.id;delete attributes.value;
        const key=canonical(attributes), last=result.at(-1);
        if (last?.key===key) last.value+=node.value;
        else result.push({key,value:node.value});
      }
      return canonical(result);
    }
    // Use the same paragraph replacement primitive as Naver's spell checker.
    // The facade setDocumentData() resets native undo, focus and media state.
    const history=editor._historyService;
    const componentList=editor._papyrus?._componentListStore;
    if (typeof history?.startRecording!=='function' || typeof history?.endRecording!=='function' ||
        typeof componentList?.getComponentById!=='function') throw new Error('네이버 편집기 호환성을 확인할 수 없어 수정하지 않았습니다.');
    function nativeParagraph(id) {
      const element=document.getElementById(id);
      const store=editor._papyrus?._selectionInfoStore;
      const compId=element && store?.elementFinder?.closestComponentId(element);
      const component=compId && componentList.getComponentById(compId);
      const units=component?.getTextUnits?.();
      const candidates=(units||[]).map(unit=>({unit,paragraph:unit.getParagraphById?.(id)})).filter(x=>x.paragraph);
      if (candidates.length!==1) throw new Error('이 문단 구조는 직접 수정할 수 없습니다. 원문은 바꾸지 않았습니다.');
      const {unit,paragraph}=candidates[0];
      if (typeof paragraph.replaceAllNodes!=='function' || !paragraph.nodes?.length ||
          paragraph.nodes.some(n=>n.ctype!=='textNode'||typeof n.toPlainJSON!=='function'||typeof n.cloneNode!=='function'||typeof n.setValue!=='function'))
        throw new Error('이 문단 구조는 직접 수정할 수 없습니다. 원문은 바꾸지 않았습니다.');
      return {paragraph,compId,unitId:unit.id};
    }
    function nativeCaret(caret, targets) {
      const target=targets.get(caret.paragraphId);if(!target)return false;
      let remaining=caret.offset, node;
      for(const candidate of target.paragraph.nodes){node=candidate;if(remaining<=candidate.value.length)break;remaining-=candidate.value.length;}
      if(!node || remaining>node.value.length)return false;
      const point={compId:target.compId,unitId:target.unitId,paraId:caret.paragraphId,nodeId:node.id,offset:remaining};
      editor._papyrus._selectionInfoStore.setRange({start:point,end:point});return true;
    }
    // All capability/content checks and node construction happen before any write.
    // This synchronous recording group makes multi-paragraph edits one native undo step.
    function replaceParagraphs(plans, caret) {
      const targets=new Map(plans.map(p=>[p.id,p.target]));
      history.startRecording({sync:true,throttle:false});
      try {
        for(const plan of plans)plan.target.paragraph.replaceAllNodes(plan.nodes);
        const actual=paragraphsIn(editor.getDocumentData());
        if(plans.some(p=>!actual.has(p.id)||runs(actual.get(p.id).nodes)!==p.expected))
          throw new Error('수정이 반영되지 않아 원문 복원을 요청했습니다. 글을 확인해 주세요.');
        nativeCaret(caret,targets);
      } catch(error) {
        // Roll back only touched paragraphs, within the same recording group.
        for(const plan of plans)plan.target.paragraph.replaceAllNodes(plan.original);
        throw error;
      } finally {history.endRecording({sync:true,throttle:false});}
    }
    const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
    async function placeCaret(caret) {
      await settle();
      try {
        if (!caret) return false;
        const data=editor.getDocumentData(); let paragraph;
        function find(value) {
          if (!value || typeof value!=='object') return;
          if (value.id===caret.paragraphId && Array.isArray(value.nodes)) paragraph=value;
          for (const child of Object.values(value)) if (typeof child==='object') find(child);
        }
        find(data);
        if (!paragraph) return false;
        let remaining=caret.offset, node;
        for (const candidate of paragraph.nodes) {
          if (candidate['@ctype']!=='textNode' || typeof candidate.value!=='string') return false;
          node=candidate;
          if (remaining<=candidate.value.length) break;
          remaining-=candidate.value.length;
        }
        const element=node && document.getElementById(node.id);
        // The exposed SmartEditor is a facade; Papyrus owns the actual selection store.
        const store=editor._papyrus?._selectionInfoStore || editor._canvasScrollingService?._selectionInfoStore || editor._selectionInfoStore;
        const finder=store?.elementFinder;
        if (!element || !finder || typeof store.setRange!=='function' || remaining>node.value.length) return false;
        const compId=finder.closestComponentId(element), unitId=finder.closestUnitId(element)||compId;
        if (!compId) return false;
        const point={compId,unitId,paraId:paragraph.id,nodeId:node.id,offset:remaining};
        // The editor's blinking caret is model-backed; a native DOM Range alone is insufficient.
        store.setRange({start:point,end:point});
        await settle();
        editor.restoreFocus();
        editor._canvasScrollingService?.scrollToFocus();
        return true;
      } catch {return false;}
    }
    if (request.action==='undo') {
      const patches=request.undo?.patches;
      if (!Array.isArray(patches) || !patches.length) throw new Error('이전 버전의 복원 정보입니다. 새 수정 후 사용해 주세요.');
      const current=paragraphsIn(before),plans=[];
      for (const patch of patches) {
        const paragraph=current.get(patch.id);
        if (!paragraph || runs(paragraph.nodes)!==patch.afterRuns) throw new Error('수정한 문단의 글 또는 서식이 바뀌어 되돌리지 않았습니다.');
        if(!Array.isArray(patch.nativeNodes)||!patch.nativeNodes.length)throw new Error('이전 버전의 복원 정보입니다. 새 수정 후 사용해 주세요.');
        const target=nativeParagraph(patch.id), Type=target.paragraph.nodes[0].constructor;
        const nodes=patch.nativeNodes.map(state=>{
          if(state.ctype!=='textNode'||typeof state.value!=='string')throw new Error('복원 정보를 확인할 수 없습니다.');
          return new Type({state:clone(state)});
        });
        plans.push({id:patch.id,target,nodes,original:[...target.paragraph.nodes],expected:runs(patch.beforeNodes)});
      }
      replaceParagraphs(plans,request.undo.caret);
      return {ok:true,caretPlaced:await placeCaret(request.undo.caret)};
    }
    if (request.action!=='apply') throw new Error('지원하지 않는 변경입니다.');
    if (!Array.isArray(request.edits)||!request.edits.length) throw new Error('변경할 항목을 선택해 주세요.');
    const ordered=[...request.edits].sort((a,b)=>a.start-b.start);
    if(ordered.some((e,i)=>!Number.isSafeInteger(e.start)||!Number.isSafeInteger(e.end)||e.start<0||e.end<=e.start||typeof e.replacement!=='string'||(i>0&&ordered[i-1].end>e.start)))throw new Error('수정 범위가 올바르지 않습니다.');
    const next=JSON.parse(JSON.stringify(before)), byId=new Map();
    function walk(value) {
      if (!value || typeof value!=='object') return;
      if (value.id && Array.isArray(value.nodes)) byId.set(value.id,value);
      for (const child of Object.values(value)) if (typeof child==='object') walk(child);
    }
    walk(next);
    const paragraphs=[...document.querySelectorAll('.se-components-wrap .se-text-paragraph')];
    const read=p=>[...p.querySelectorAll('.__se-node')].map(n=>n.textContent).join('');
    if (paragraphs.map(read).join('\n')!==request.before) throw new Error('글이 바뀌었습니다. 다시 확인해 주세요.');
    let offset=0;
    const segments=paragraphs.map(p=>{const value=read(p), segment={p,value,start:offset,end:offset+value.length};offset+=value.length+1;return segment;});
    for (const change of [...request.edits].sort((a,b)=>b.start-a.start)) {
      const segment=segments.find(s=>change.start>=s.start && change.end<=s.end);
      const model=segment && byId.get(segment.p.id);
      if (!model || model.nodes.some(n=>n['@ctype']!=='textNode' || typeof n.value!=='string')) throw new Error('이 문단 구조는 직접 수정할 수 없습니다. 원문은 바꾸지 않았습니다.');
      // Validate the original model, including styled runs, before changing any copy.
      const original=byId.get(segment.p.id);
      if (!segment.validated) {
        if (original.nodes.map(n=>n.value).join('')!==segment.value) throw new Error('화면과 문서 내용이 달라 수정하지 않았습니다.');
        segment.validated=true;
      }
      const start=change.start-segment.start,end=change.end-segment.start;
      let position=0, inserted=false;
      for (const node of model.nodes) {
        const from=position,to=position+node.value.length; position=to;
        if (to<=start || from>=end) continue;
        const left=node.value.slice(0,Math.max(0,start-from)), right=node.value.slice(Math.min(node.value.length,end-from));
        node.value=left+(inserted?'':change.replacement)+right; inserted=true;
      }
      if (!inserted) throw new Error('수정할 텍스트를 찾지 못했습니다.');
    }
    const last=[...request.edits].sort((a,b)=>a.end-b.end).at(-1);
    const lastSegment=segments.find(s=>last.start>=s.start && last.end<=s.end);
    const undoCaret={paragraphId:lastSegment.p.id,offset:last.end-lastSegment.start};
    const delta=request.edits.filter(e=>e.start>=lastSegment.start && e.end<=last.end).reduce((n,e)=>n+e.replacement.length-(e.end-e.start),0);
    const caret={...undoCaret,offset:undoCaret.offset+delta};
    const originalParagraphs=paragraphsIn(before),plans=[],patches=[];
    for(const segment of segments.filter(s=>s.validated)) {
      const id=segment.p.id,target=nativeParagraph(id), original=[...target.paragraph.nodes];
      const expectedNodes=byId.get(id).nodes;
      if(original.length!==expectedNodes.length || original.some((n,i)=>n.id!==expectedNodes[i].id || n.value!==originalParagraphs.get(id).nodes[i].value))
        throw new Error('화면과 문서 내용이 달라 수정하지 않았습니다.');
      const nodes=original.map((node,i)=>{const copy=node.cloneNode();copy.setValue(expectedNodes[i].value);return copy;});
      plans.push({id,target,original,nodes,expected:runs(expectedNodes)});
      patches.push({id,beforeNodes:clone(originalParagraphs.get(id).nodes),nativeNodes:original.map(n=>clone(n.toPlainJSON())),afterRuns:runs(expectedNodes),afterText:expectedNodes.map(n=>n.value).join('')});
    }
    replaceParagraphs(plans,caret);
    // Only this extension's one-step restore payload stays in content-script memory.
    return {ok:true,undo:{patches,caret:undoCaret},caretPlaced:await placeCaret(caret)};
  } catch(error) {return {ok:false,error:error.message};}
}
if (typeof module!=='undefined') module.exports=editNaverDocument;
