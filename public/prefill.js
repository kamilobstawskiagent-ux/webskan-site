// Wybór planu z przycisków cennika i prefill formularza z linku (?product=&url=&email=) – np. z e-maila o końcu 30 dni monitoringu w cenie audytu.
(function(){var q=new URLSearchParams(location.search),f=document.querySelector('form.order');if(!f)return;function pick(v){var r=f.querySelector('input[name=product][value="'+v+'"]');if(r)r.checked=true;}
if(q.get('product'))pick(q.get('product'));if(q.get('url'))f.querySelector('[name=url]').value=q.get('url');if(q.get('email'))f.querySelector('[name=email]').value=q.get('email');
document.querySelectorAll('a[data-plan]').forEach(function(a){a.addEventListener('click',function(){pick(a.getAttribute('data-plan'));});});})();
