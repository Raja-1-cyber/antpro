/* Legacy entry — loads split bundles in order */
(function(){
  var files=['/app-core.js','/app-ui-a.js','/app-ui-b.js'];
  function next(i){
    if(i>=files.length)return;
    var s=document.createElement('script');
    s.src=files[i];
    s.onload=function(){next(i+1)};
    s.onerror=function(){console.error('Failed to load',files[i]);next(i+1)};
    document.head.appendChild(s);
  }
  next(0);
})();
