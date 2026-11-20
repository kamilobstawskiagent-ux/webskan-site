// Drobne animacje strony (v5): wejścia przy przewijaniu, płynne FAQ, strzałka „do góry”. Bez danych, bez cookies.
(function(){
var calm=window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches;
// Strzałka do góry
var t=document.querySelector('.totop');
if(t){var tick=false,upd=function(){tick=false;t.classList.toggle('on',window.scrollY>700);};
  addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(upd);}},{passive:true});upd();
  t.addEventListener('click',function(e){e.preventDefault();scrollTo({top:0,behavior:calm?'auto':'smooth'});});}
if(calm)return;
// Wskaźniki w karcie wyniku: animacja jest w CSS; jeśli karta jest poniżej ekranu (telefon), czeka na przewinięcie
var rc=document.querySelector('.result');
if(rc&&'IntersectionObserver' in window&&rc.getBoundingClientRect().top>innerHeight*.6){rc.classList.add('wait');
  var ro=new IntersectionObserver(function(es){if(es[0].isIntersecting){rc.classList.remove('wait');ro.disconnect();}},{threshold:.35});ro.observe(rc);}
// Wejścia: chowamy tylko to, co jest poniżej ekranu w chwili startu (bez mignięcia treści)
if('IntersectionObserver' in window){
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{rootMargin:'0px 0px -8% 0px',threshold:.12});
  var vh=innerHeight,row={};
  document.querySelectorAll('[data-rv]').forEach(function(el){var r=el.getBoundingClientRect();if(r.top<vh*.92)return;
    var k=Math.round(r.top+scrollY);row[k]=(row[k]||0)+1;el.style.transitionDelay=((row[k]-1)*90)+'ms';el.classList.add('rv');io.observe(el);});
}
// FAQ: płynne otwieranie i zamykanie
if(!Element.prototype.animate)return;
document.querySelectorAll('.faq details').forEach(function(d){
  var s=d.querySelector('summary'),a=document.createElement('div'),an=null;a.className='a';
  while(s.nextSibling)a.appendChild(s.nextSibling);d.appendChild(a);
  function done(){an=null;d.classList.remove('closing');}
  s.addEventListener('click',function(e){e.preventDefault();
    if(an){an.onfinish=null;an.cancel();done();}
    if(!d.open){d.open=true;an=a.animate([{height:'0px',opacity:0},{height:a.offsetHeight+'px',opacity:1}],{duration:280,easing:'cubic-bezier(.2,.7,.2,1)'});an.onfinish=done;}
    else{d.classList.add('closing');an=a.animate([{height:a.offsetHeight+'px',opacity:1},{height:'0px',opacity:0}],{duration:220,easing:'ease-in'});an.onfinish=function(){d.open=false;done();};}
  });
});
})();
