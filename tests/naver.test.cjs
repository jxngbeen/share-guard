const {test}=require('node:test');
const assert=require('node:assert/strict');
const edit=require('../extension/naver.js');
function setup(){
 let data={document:{components:[{'@ctype':'text',value:[{id:'p',nodes:[{'@ctype':'textNode',id:'n1',value:'student@',style:{bold:true}},{'@ctype':'textNode',id:'n2',value:'example.com text 010-0000-0000',style:{italic:true}}]}]}, {'@ctype':'image',url:'fixture-image'}]}};
 const original=structuredClone(data);let writes=0,caret=null;
 global.location={origin:'https://blog.naver.com',pathname:'/PostWriteForm.naver'};
 class TextNode {
   constructor({state}){this.data=structuredClone(state);delete this.data.ctype;this.data['@ctype']='textNode';}
   get id(){return this.data.id;}get ctype(){return this.data['@ctype'];}get value(){return this.data.value;}
   setValue(value){this.data.value=value;}cloneNode(){return new TextNode({state:this.toPlainJSON()});}
   toPlainJSON(){const v=structuredClone(this.data);delete v['@ctype'];v.ctype='textNode';return v;}
 }
 const paragraph={
   get nodes(){return data.document.components[0].value[0].nodes.map(state=>new TextNode({state}));},
   replaceAllNodes(nodes){data.document.components[0].value[0].nodes=nodes.map(n=>structuredClone(n.data));writes++;}
 };
 const states=[structuredClone(data)];let index=0,recording=false;
 const history={
   startRecording(){assert.equal(recording,false);recording=true;},
   endRecording(){assert.equal(recording,true);recording=false;if(JSON.stringify(data)!==JSON.stringify(states[index])){states.splice(++index);states.push(structuredClone(data));}},
   undo(){if(index>0)data=structuredClone(states[--index]);},
   redo(){if(index+1<states.length)data=structuredClone(states[++index]);},
   isUndoable:()=>index>0,isRedoable:()=>index+1<states.length
 };
 global.window={SmartEditor:{_editors:{test:{
   _papyrus:{_componentListStore:{getComponentById:()=>({getTextUnits:()=>[{id:'component',getParagraphById:id=>id==='p'?paragraph:null}]})},_selectionInfoStore:{elementFinder:{closestComponentId:()=> 'component',closestUnitId:()=> 'component'},setRange:r=>{caret=r;}}},
   _historyService:history,restoreFocus:()=>{},getDocumentData:()=>structuredClone(data),
   setDocumentData:()=>{throw new Error('Whole-document reset must never be used');}
 }}}};
 global.document={getElementById:id=>({id}),querySelectorAll:()=>[{id:'p',querySelectorAll:()=>data.document.components[0].value[0].nodes.map(n=>({textContent:n.value}))}]};
 return {original,get:()=>data,writes:()=>writes,caret:()=>caret,paragraph,history,recording:()=>recording};
}
test('model edits across styled runs preserve images/styles and undo',async()=>{
 const fixture=setup(),before='student@example.com text 010-0000-0000';
 const result=await edit({action:'apply',before,edits:[{start:0,end:19,replacement:'[이메일 가림]'},{start:25,end:38,replacement:''}]});
 assert.equal(result.ok,true, result.error);
 assert.equal(result.undo.patches[0].afterText,'[이메일 가림] text ');
 const p=fixture.get().document.components[0].value[0];
 assert.equal(p.nodes.map(n=>n.value).join(''),'[이메일 가림] text ');
 assert.deepEqual(p.nodes[0].style,{bold:true});
 assert.deepEqual(fixture.get().document.components[1],fixture.original.document.components[1]);
 assert.equal((await edit({action:'undo',undo:result.undo})).ok,true);
 assert.deepEqual(fixture.get(),fixture.original);
});
test('stale text and unknown models fail before any write',async()=>{
 const fixture=setup();
 assert.equal((await edit({action:'apply',before:'stale',edits:[]})).ok,false);
 fixture.get().document.components[0].value[0].nodes[0]['@ctype']='unknown';
 assert.equal((await edit({action:'apply',before:'student@example.com text 010-0000-0000',edits:[{start:0,end:19,replacement:''}]})).ok,false);
 assert.equal(fixture.writes(),0);
});
test('undo rejects changes to visible text style in the modified paragraph',async()=>{
 const fixture=setup();const result=await edit({action:'apply',before:'student@example.com text 010-0000-0000',edits:[{start:0,end:19,replacement:''}]});
 fixture.get().document.components[0].value[0].nodes[1].style.italic=false;
 assert.equal((await edit({action:'undo',undo:result.undo})).ok,false);
 assert.equal(fixture.writes(),1);
});

test('a no-op native paragraph edit is not reported as success',async()=>{
 const fixture=setup();fixture.paragraph.replaceAllNodes=()=>{};
 assert.equal((await edit({action:'apply',before:'student@example.com text 010-0000-0000',edits:[{start:0,end:19,replacement:''}]})).ok,false);
});

test('changing writing-log timestamps does not block undo or overwrite current metadata',async()=>{
 const fixture=setup();
 const result=await edit({action:'apply',before:'student@example.com text 010-0000-0000',edits:[{start:0,end:19,replacement:'[이메일 가림]'}]});
 fixture.get().document.di={dio:[{dia:{st:300}}]};fixture.get().documentId='saved-document-id';
 const undone=await edit({action:'undo',undo:result.undo});
 assert.equal(undone.ok,true,undone.error);
 assert.deepEqual(fixture.get().document.components,fixture.original.document.components);
 assert.deepEqual(fixture.get().document.di,{dio:[{dia:{st:300}}]});
 assert.equal(fixture.get().documentId,'saved-document-id');
});
test('caret follows last replacement and undo follows restored text',async()=>{
 const fixture=setup();
 const result=await edit({action:'apply',before:'student@example.com text 010-0000-0000',edits:[{start:0,end:19,replacement:'[이메일 가림]'}]});
 assert.equal(result.caretPlaced,true);
 assert.equal(fixture.caret().start.nodeId,'n1');
 assert.equal(fixture.caret().start.offset,'[이메일 가림]'.length);
 assert.deepEqual(fixture.caret().start,fixture.caret().end);
 const undone=await edit({action:'undo',undo:result.undo});
 assert.equal(undone.caretPlaced,true);
 assert.equal(fixture.caret().start.nodeId,'n2');
 assert.equal(fixture.caret().start.offset,'example.com'.length);
});
test('deletion caret is placed where the last selected text was removed',async()=>{
 const fixture=setup();
 const result=await edit({action:'apply',before:'student@example.com text 010-0000-0000',edits:[{start:25,end:38,replacement:''},{start:0,end:19,replacement:''}]});
 assert.equal(result.caretPlaced,true);
 assert.equal(fixture.caret().start.nodeId,'n2');
 assert.equal(fixture.caret().start.offset,' text '.length);
});
test('failed native restore is not reported as successful restoration',async()=>{
 const fixture=setup();const result=await edit({action:'apply',before:'student@example.com text 010-0000-0000',edits:[{start:0,end:19,replacement:''}]});
 fixture.paragraph.replaceAllNodes=()=>{};
 const undone=await edit({action:'undo',undo:result.undo});
 assert.equal(undone.ok,false);
 assert.match(undone.error,/수정이 반영되지/);
});

test('undo accepts regenerated IDs and merged runs while preserving unrelated changes',async()=>{
 const fixture=setup();
 const result=await edit({action:'apply',before:'student@example.com text 010-0000-0000',edits:[{start:0,end:19,replacement:'[이메일 가림]'}]});
 const paragraph=fixture.get().document.components[0].value[0];
 const tail=paragraph.nodes[1];
 paragraph.nodes=[{...paragraph.nodes[0],id:'new-mask'}, {...tail,id:'split1',value:tail.value.slice(0,2)}, {...tail,id:'split2',value:tail.value.slice(2)}];
 fixture.get().document.components[1].url='updated-image';
 fixture.get().document.unrelatedMetadata='latest';
 const undone=await edit({action:'undo',undo:result.undo});
 assert.equal(undone.ok,true,undone.error);
 assert.deepEqual(fixture.get().document.components[0],fixture.original.document.components[0]);
 assert.equal(fixture.get().document.components[1].url,'updated-image');
 assert.equal(fixture.get().document.unrelatedMetadata,'latest');
});
test('undo refuses changed text rather than restoring an old whole document',async()=>{
 const fixture=setup();
 const result=await edit({action:'apply',before:'student@example.com text 010-0000-0000',edits:[{start:0,end:19,replacement:'[이메일 가림]'}]});
 fixture.get().document.components[0].value[0].nodes[0].value+='edited';
 assert.equal((await edit({action:'undo',undo:result.undo})).ok,false);
 assert.equal(fixture.writes(),1);
});

test('native undo and redo retain pre-extension editing history',async()=>{
 const f=setup(),base=structuredClone(f.get());
 f.history.startRecording();f.get().document.components[0].value[0].nodes[1].value+=' 한글';f.history.endRecording();
 const prior=structuredClone(f.get());
 const result=await edit({action:'apply',before:'student@example.com text 010-0000-0000 한글',edits:[{start:0,end:19,replacement:'[이메일 가림]'}]});
 assert.equal(result.ok,true,result.error);const masked=structuredClone(f.get());
 f.history.undo();assert.deepEqual(f.get(),prior);
 f.history.undo();assert.deepEqual(f.get(),base);
 f.history.redo();assert.deepEqual(f.get(),prior);
 f.history.redo();assert.deepEqual(f.get(),masked);
 const restored=await edit({action:'undo',undo:result.undo});assert.equal(restored.ok,true,restored.error);
 assert.deepEqual(f.get(),prior);f.history.undo();assert.deepEqual(f.get(),masked);
 assert.equal(f.recording(),false);
});
test('missing native history capability fails before changing the document',async()=>{
 const f=setup();delete window.SmartEditor._editors.test._historyService.startRecording;
 const r=await edit({action:'apply',before:'student@example.com text 010-0000-0000',edits:[{start:0,end:19,replacement:''}]});
 assert.equal(r.ok,false);assert.deepEqual(f.get(),f.original);assert.equal(f.writes(),0);
});
test('empty and overlapping edit ranges fail before writes',async()=>{
 const f=setup();for(const edits of [[],[{start:0,end:5,replacement:''},{start:4,end:6,replacement:''}]]){
  assert.equal((await edit({action:'apply',before:'student@example.com text 010-0000-0000',edits})).ok,false);
 }
 assert.equal(f.writes(),0);
});
