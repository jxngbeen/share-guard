document.querySelector('#controlled').addEventListener('input',event=>{if(!event.isTrusted)queueMicrotask(()=>{event.target.value='사이트가 되돌린 합성 본문';});});
