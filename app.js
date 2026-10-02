/* Legacy path — redirect to gzip loader */
(function(){
  var s=document.createElement('script');
  s.src='/app-loader-gz.js';
  document.head.appendChild(s);
})();
