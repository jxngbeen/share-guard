// Synthetic model adapter fixture. Does not load Naver or access an account.
let model={document:{id:'fixture',components:[{'@ctype':'text',id:'component',value:[{'@ctype':'paragraph',id:'paragraph',nodes:[{'@ctype':'textNode',id:'node',value:'합성 본문',style:{bold:true}}]}]}]}};
let ticks=0;
const selection={
  elementFinder:{closestComponentId:()=> 'component',closestUnitId:()=> 'component'},
  setRange(range){this.start=structuredClone(range.start);this.end=structuredClone(range.end);}
};
const render=()=>{
 const component=document.querySelector('.se-component');component.replaceChildren();
 for(const para of model.document.components[0].value){
  const p=document.createElement('p');p.id=para.id;p.className='se-text-paragraph';
  for(const n of para.nodes){const span=document.createElement('span');span.className='__se-node';span.id=n.id;span.textContent=n.value;p.append(span);}
  component.append(p);
 }
};
// Small native-model contract fixture, not an emulator of Naver internals.
class TextNode {
 constructor({state}){this.data=structuredClone(state);delete this.data.ctype;this.data['@ctype']='textNode';}
 get id(){return this.data.id;}get ctype(){return this.data['@ctype'];}get value(){return this.data.value;}
 toPlainJSON(){const s=structuredClone(this.data);delete s['@ctype'];s.ctype='textNode';return s;}
 cloneNode(){return new TextNode({state:this.toPlainJSON()});}setValue(v){this.data.value=v;}
}
const nativeParagraph=id=>{
 const data=model.document.components[0].value.find(p=>p.id===id);if(!data)return null;
 return {
  get nodes(){return data.nodes.map(state=>new TextNode({state}));},
  replaceAllNodes(nodes){data.nodes=nodes.map(n=>structuredClone(n.data));render();}
 };
};
let historyStates=[structuredClone(model)],historyIndex=0;
const history={
 startRecording(){},
 endRecording(){historyStates.splice(++historyIndex);historyStates.push(structuredClone(model));},
 undo(){if(historyIndex>0){model=structuredClone(historyStates[--historyIndex]);render();}},
 redo(){if(historyIndex+1<historyStates.length){model=structuredClone(historyStates[++historyIndex]);render();}}
};
window.SmartEditor={_editors:{fixture:{
  _papyrus:{_selectionInfoStore:selection,_componentListStore:{getComponentById:()=>({getTextUnits:()=>[{id:'component',getParagraphById:nativeParagraph}]})}},
  _historyService:history,
  restoreFocus:()=>{},
  getDocumentData:()=>{const data=structuredClone(model);data.document.di={dio:[{dia:{st:++ticks}}]};return data;},
  setDocumentData:value=>{
    model=structuredClone(value);historyStates=[structuredClone(model)];historyIndex=0;
    // Reproduce the real setter's argument mutation and initial-caret reset.
    delete value.document.components;
    selection.setRange({start:{compId:'component',unitId:'component',paraId:'paragraph',nodeId:'node',offset:0},end:{compId:'component',unitId:'component',paraId:'paragraph',nodeId:'node',offset:0}});
    setTimeout(render,0);
  }
}}};
document.querySelector('#sample').addEventListener('click',()=> {
 model.document.components[0].value[0].nodes[0].value='합성 연락처 010-0000-0000 및 student@example.com';render();
});
render();
