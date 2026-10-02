/* AntPro loader */
(async function(){
  try{
    const [a,b] = await Promise.all([
      fetch('/app.part1.b64.txt').then(r=>r.text()),
      fetch('/app.part2.b64.txt').then(r=>r.text())
    ]);
    const b64 = (a+b).replace(/\s/g,'');
    const bin = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
    const code = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const s = document.createElement('script');
    s.textContent = code;
    document.documentElement.appendChild(s);
  }catch(e){
    console.error(e);
    const el=document.getElementById('app');
    if(el) el.innerHTML = '<div style="padding:24px;color:#f66">App load failed. Hard refresh.</div>';
  }
})();
