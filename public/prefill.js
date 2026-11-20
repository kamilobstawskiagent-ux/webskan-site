// Wybór planu z przycisków cennika i prefill formularza z linku (?product=&url=&email=) – np. z e-maila o końcu 30 dni monitoringu w cenie audytu.
(function(){var q=new URLSearchParams(location.search),f=document.querySelector('form.order');
// Źródło wejścia (?utm_source= lub ?src=) jako ukryte pole formularzy – bez cookies i bez pamięci przeglądarki.
var s=(q.get('utm_source')||q.get('src')||'').toLowerCase().replace(/[^a-z0-9._-]/g,'').slice(0,40);if(s)document.querySelectorAll('form.order,form.scanform').forEach(function(x){var i=document.createElement('input');i.type='hidden';i.name='src';i.value=s;x.appendChild(i);});
document.querySelectorAll('a[data-agplan]').forEach(function(a){a.addEventListener('click',function(){var r=document.querySelector('form.order input[name=plan][value="'+a.getAttribute('data-agplan')+'"]');if(r)r.checked=true;});});
if(!f)return;function pick(v){var r=f.querySelector('input[name=product][value="'+v+'"]');if(r)r.checked=true;}
if(q.get('product'))pick(q.get('product'));if(q.get('url'))f.querySelector('[name=url]').value=q.get('url');if(q.get('email'))f.querySelector('[name=email]').value=q.get('email');
document.querySelectorAll('a[data-plan]').forEach(function(a){a.addEventListener('click',function(){pick(a.getAttribute('data-plan'));});});})();
