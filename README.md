# CV Almendralejo · Landing

Landing del Club de Voleibol Almendralejo (HTML + CSS + JS, sin build). Equipos masculino y femenino en igualdad.

- `index.html` — página completa (estilos y scripts propios).
- Calendarios, resultados y clasificaciones: bloque `SEED` del script de `index.html` (si existe `assets/partidos.json`, tiene prioridad). `assets/partidos.js` ya no se carga.
- `assets/redes.js` — últimas publicaciones de redes (opcional, con feed de Behold; si no, plugin de Facebook).
- `assets/mascota.js` + `assets/mascota/` — mascota animada del hero.
- `assets/logos/` — Junta de Extremadura, Ayuntamiento de Almendralejo y Tránsitos Suroeste (cabecera).
- `assets/escudo.png`, `favicon-*.png`, `apple-touch-icon.png` — escudo sin fondo.
- `img/` — fotos de los equipos.

Probar en local: `python -m http.server 8000` y abrir http://localhost:8000
