// /badania/: zwijane karty pomiarów na telefonie i powiększenie wykresu. Bez skryptu wszystko jest rozwinięte, a wykres otwiera się jako plik.
(function () {
  var mq = window.matchMedia('(max-width:640px)');
  var cards = [].slice.call(document.querySelectorAll('.study > details'));
  function setAll(open) { cards.forEach(function (d) { d.open = open; }); }
  function openFor(hash, scroll) {
    if (!hash || hash.length < 2) return;
    var el = null; try { el = document.getElementById(decodeURIComponent(hash.slice(1))); } catch (e) {}
    if (!el || !el.classList.contains('study')) return;
    var d = el.querySelector('details'); if (d) d.open = true;
    if (scroll) el.scrollIntoView();
  }
  if (mq.matches) { setAll(false); openFor(location.hash, true); }
  var onMq = function () { if (!mq.matches) setAll(true); };
  if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  window.addEventListener('beforeprint', function () { setAll(true); });
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var s = t.closest('.study summary');
    if (s && !mq.matches) { e.preventDefault(); return; }
    var a = t.closest('a[href^="#"]'); if (a) openFor(a.getAttribute('href'), false);
  });
  window.addEventListener('hashchange', function () { openFor(location.hash, true); });

  var z = document.querySelector('.chart a.zoom');
  if (!z || !window.HTMLDialogElement) return;
  var dlg = null;
  z.addEventListener('click', function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    var src = z.querySelector('img');
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.className = 'lightbox'; dlg.setAttribute('aria-label', 'Wykres w powiększeniu');
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Zamknij powiększenie'); b.textContent = '×';
      var i = document.createElement('img'); i.alt = src.alt;
      dlg.appendChild(b); dlg.appendChild(i); document.body.appendChild(dlg);
      b.addEventListener('click', function () { dlg.close(); });
      i.addEventListener('click', function () { dlg.classList.toggle('zoomed'); });
      dlg.addEventListener('close', function () { dlg.classList.remove('zoomed'); });
    }
    var im = dlg.querySelector('img'); im.src = src.currentSrc || src.src;
    dlg.classList.toggle('tall', src.naturalHeight > src.naturalWidth * 1.5);
    dlg.showModal(); dlg.scrollTop = 0;
  });
})();
