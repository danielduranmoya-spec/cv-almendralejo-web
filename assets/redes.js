/* Últimas publicaciones de las redes del club.
   - Por defecto se muestra el plugin oficial de Facebook (siempre al día, sin configurar nada).
   - Opcional: para mostrar las 3 últimas publicaciones de Instagram como tarjetas, crea un feed gratuito en
     https://behold.so, copia su URL JSON (https://feeds.behold.so/XXXX) y pégala en FEED_URL. Entonces el plugin
     de Facebook se oculta y las tarjetas se actualizan solas cada vez que el club publique. */
(function () {
  var FEED_URL = '';   // ← pegar aquí la URL del feed de Behold (vacío = plugin de Facebook)
  var box = document.getElementById('redes-feed'), fb = document.getElementById('redes-fb');
  if (!box || !FEED_URL) return;
  function esc(t) { return String(t || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  fetch(FEED_URL).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (d) {
    var posts = (d.posts || d).slice(0, 3);
    if (!posts.length) return;
    box.innerHTML = posts.map(function (p) {
      var img = p.mediaType === 'VIDEO' ? (p.thumbnailUrl || p.mediaUrl) : (p.sizes && p.sizes.medium ? p.sizes.medium.mediaUrl : p.mediaUrl);
      var fecha = p.timestamp ? new Date(p.timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      var cap = esc(p.caption || '').slice(0, 140) + ((p.caption || '').length > 140 ? '…' : '');
      return '<a class="post" href="' + esc(p.permalink) + '" target="_blank" rel="noopener"><div class="th"><img src="' + esc(img) + '" alt="" loading="lazy"></div><div class="bd"><time>' + fecha + '</time><p>' + cap + '</p></div></a>';
    }).join('');
    box.hidden = false; if (fb) fb.hidden = true;
  }).catch(function (e) { console.warn('Feed de redes no disponible → ' + (e && e.message ? e.message : e)); });
})();
