/* Mascota del CVA: entra y sale del hero haciendo gestos de voleibol.
   Sprites en assets/mascota/*.webp (todos al mismo dibujo, se escalan con un factor común). */
(function () {
  var stage = document.getElementById('mascota');
  if (!stage || !stage.animate) return;
  var hero = stage.parentElement;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BASE = stage.getAttribute('data-base') || 'assets/mascota/';
  var NAMES = ['frontal', 'tres_cuartos', 'perfil', 'saque', 'recepcion', 'colocacion', 'bloqueo', 'remate', 'plancha'];
  var FRONT_H = 261;                       // alto en píxeles del sprite frontal original

  var outer = document.createElement('div');   // se mueve en horizontal (y se voltea)
  var img = document.createElement('img');     // salta, se inclina y cambia de pose
  outer.className = 'masc'; img.alt = ''; img.decoding = 'async';
  outer.appendChild(img); stage.appendChild(outer);

  var S = {}, K = 1, floor = 0, W = 0, loaded = 0, H0 = 200, ROOM = 0, CX = 0;
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function measure() {
    var hr = hero.getBoundingClientRect(), card = hero.querySelector('.next'), cr = card && card.getBoundingClientRect();
    W = hr.width;
    // suelo = borde superior de la tarjeta de partidos, sin salirse de la pantalla visible
    floor = Math.min(cr ? cr.top - hr.top + 6 : hr.height - 90, innerHeight * .93 - hr.top);
    // hueco libre entre la barra superior y la tarjeta: la mascota se ajusta a él
    var room = floor - 82;
    H0 = innerWidth < 760 ? 130 : Math.max(100, Math.min(innerHeight * .30, 270, room * .62));
    K = H0 / FRONT_H;
    ROOM = Math.max(8, room - H0 - 6);                       // altura máxima de salto sin tocar la barra
    CX = cr ? cr.left - hr.left + cr.width / 2 : W * .7;     // centrada sobre la tarjeta
  }
  var J = function (frac) { return Math.min(frac * H0, ROOM); };   // salto relativo al tamaño, limitado por el hueco
  function pose(name) {
    var s = S[name]; if (!s) return;
    img.src = s.src; img.style.width = s.w * K + 'px'; img.style.marginLeft = -s.w * K / 2 + 'px';
  }
  function place(x, flip) { outer.style.transform = 'translate(' + x + 'px,' + floor + 'px) scaleX(' + (flip ? -1 : 1) + ')'; }
  function run(el, frames, dur, easing, iter) {
    var a = el.animate(frames, { duration: dur, easing: easing || 'ease-in-out', iterations: iter || 1, fill: 'forwards' });
    return a.finished.then(function () { try { a.commitStyles(); a.cancel(); } catch (e) {} });
  }
  var T = function (x, y, r) { return { transform: 'translate(' + x + 'px,' + (y || 0) + 'px) rotate(' + (r || 0) + 'deg)' }; };
  var X = function (x, flip) { return { transform: 'translate(' + x + 'px,' + floor + 'px) scaleX(' + (flip ? -1 : 1) + ')' }; };
  function reset() { img.style.transform = 'none'; }

  // Camina de x0 a x1 alternando pasos (perfil / tres cuartos) con un pequeño rebote
  async function walk(x0, x1, dur, flip) {
    pose('perfil'); place(x0, flip);
    var move = run(outer, [X(x0, flip), X(x1, flip)], dur, 'linear');
    var steps = Math.max(2, Math.round(dur / 340)), done = false;
    move.then(function () { done = true; });
    for (var i = 0; !done; i++) {
      pose(i % 2 ? 'tres_cuartos' : 'perfil');
      await run(img, [T(0, 0, 0), T(0, -J(.07), i % 2 ? 2 : -2), T(0, 0, 0)], 340, 'ease-out');
    }
    await move; reset();
  }
  async function hop(n, h, dur) { for (var i = 0; i < n; i++) await run(img, [T(0, 0), T(0, -h), T(0, 0)], dur, 'ease-out'); }

  async function actoSaque(xs, xr) {
    await walk(xr, xs, 2600, true);
    pose('frontal'); await sleep(500);
    await hop(1, J(.15), 320);                         // saluda con un saltito
    pose('saque');                                          // saque en suspensión
    await run(img, [T(0, 0, 0), T(0, -J(.55), -4), T(0, 0, 0)], 1000, 'ease-in-out');
    pose('frontal'); await sleep(450);
    pose('recepcion');                                       // recepción: se agacha dos veces
    for (var i = 0; i < 2; i++) await run(img, [T(0, 0, 0), T(0, .04 * H0, -3), T(0, 0, 0)], 520, 'ease-in-out');
    pose('colocacion'); await hop(3, J(.12), 380);     // colocación a saltitos
    pose('frontal'); await sleep(350);
    await walk(xs, xr, 2200, false);
  }
  async function actoDefensa(xs, xr) {
    pose('plancha'); place(xr, true);                       // entra en plancha deslizándose
    var slide = run(outer, [X(xr, true), X(xs, true)], 1150, 'cubic-bezier(.2,.7,.3,1)');
    run(img, [T(0, -J(.35), 6), T(0, -6, 0), T(0, 0, 0)], 1150, 'ease-in');
    await slide; reset(); await sleep(650);
    pose('frontal'); await hop(2, J(.16), 330);         // se levanta de un salto
    await sleep(300);
    await walk(xs, xr, 2200, false);
  }
  async function actoRemate(xs, xr) {
    pose('remate'); place(xr, true);                        // remate: llega volando en arco
    var arc = run(outer, [X(xr, true), X(xs, true)], 1250, 'ease-out');
    await run(img, [T(0, 0, 0), T(0, -J(.8), -8), T(0, 0, 0)], 1250, 'ease-in-out');
    await arc; reset();
    pose('frontal'); await sleep(350);
    pose('bloqueo');                                         // bloqueo: dos saltos al cielo
    for (var i = 0; i < 2; i++) await run(img, [T(0, 0, 0), T(0, -J(.5), 0), T(0, 0, 0)], 760, 'ease-in-out');
    pose('frontal'); await sleep(350);
    pose('remate');                                          // se va rematando en arco hacia la derecha
    var out = run(outer, [X(xs, false), X(xr, false)], 1100, 'ease-in');
    await run(img, [T(0, 0, 0), T(0, -J(.7), 8), T(0, 0, 0)], 1100, 'ease-in-out');
    await out; reset();
  }

  async function loop() {
    var acts = [actoSaque, actoDefensa, actoRemate], n = 0;
    while (true) {
      measure();
      var xs = CX, xr = W + S.frontal.w * K * .9;
      outer.style.visibility = 'visible';
      try { await acts[n % acts.length](xs, xr); } catch (e) { console.warn('Mascota: ' + (e && e.message ? e.message : e)); }
      outer.style.visibility = 'hidden';
      n++; await sleep(1400);
    }
  }

  // Móvil: sin animación; medio cuerpo con zoom asomando sobre la tarjeta, a la derecha y sin tapar los botones
  function fija() {
    outer.style.display = 'none';
    var clip = document.createElement('div'), pic = new Image();
    clip.style.cssText = 'position:absolute;right:4px;width:118px;overflow:hidden;pointer-events:none';
    pic.alt = ''; pic.src = S.frontal.src;
    pic.style.cssText = 'position:absolute;left:50%;top:0;transform:translateX(-50%);max-width:none;width:' + Math.round(S.frontal.w / S.frontal.h * 190) + 'px';
    clip.appendChild(pic); stage.appendChild(clip);
    function colocar() {
      var hr = hero.getBoundingClientRect(), card = hero.querySelector('.next'), cr = card && card.getBoundingClientRect();
      var bottom = cr ? cr.top - hr.top + 2 : hr.height - 90, h = 105;
      clip.style.height = h + 'px'; clip.style.top = (bottom - h) + 'px';
    }
    colocar(); addEventListener('resize', colocar); addEventListener('load', colocar);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(colocar);
  }

  NAMES.forEach(function (n) {
    var im = new Image();
    im.onload = function () {
      S[n] = { src: im.src, w: im.naturalWidth, h: im.naturalHeight };
      if (++loaded === NAMES.length) {
        measure();
        if (innerWidth < 760) { fija(); return; }
        if (reduced) { pose('frontal'); place(CX, false); outer.style.visibility = 'visible'; }
        else loop();
      }
    };
    im.src = BASE + n + '.webp';
  });
  addEventListener('resize', function () { if (reduced && S.frontal) { measure(); pose('frontal'); place(CX, false); } });
})();
