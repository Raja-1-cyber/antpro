/* AntPro loader */
(async function(){
  try{
    const parts = await Promise.all([0,1,2,3].map(i => fetch('/app.b64.'+i+'.txt').then(r=>{if(!r.ok)throw new Error('part '+i);return r.text()})));
    const b64 = parts.join('').replace(/\s/g,'');
    const bin = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
    const code = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const s = document.createElement('script');
    s.textContent = code;
    document.documentElement.appendChild(s);
  }catch(e){
    console.error(e);
    const el=document.getElementById('app');
    if(el) el.innerHTML = '<div style="padding:24px;color:#f66">App load failed. Hard refresh. '+e+'</div>';
  }
})();
