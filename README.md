# CV Almendralejo · Landing

Landing del Club de Voleibol Almendralejo (HTML + CSS + JS, sin build). Equipos masculino y femenino en igualdad.

- `index.html` — página completa (estilos y scripts propios).
- Calendarios, resultados y clasificaciones: bloque `SEED` del script de `index.html` (si existe `assets/partidos.json`, tiene prioridad). `assets/partidos.js` ya no se carga.
- `assets/redes.js` — últimas publicaciones de redes (opcional, con feed de Behold; si no, plugin de Facebook).
- `assets/mascota.js` + `assets/mascota/` — mascota animada del hero.
- `assets/logos/` — Junta de Extremadura, Ayuntamiento de Almendralejo y Tránsitos Suroeste (cabecera).
- `assets/escudo.png`, `favicon-*.png`, `apple-touch-icon.png` — escudo sin fondo.
- `img/` — fotos de los equipos.

## Autoría

Daniel Durán Moya y Jaime Motos Guijarro.

Probar en local: `python -m http.server 8000` y abrir http://localhost:8000

## Actualización automática de partidos

`.github/workflows/actualizar-partidos.yml` ejecuta `scripts/actualizar.py` cada día (mañana y noche) y cada 4 horas los fines de semana.
Lee la RFEVB (Superliga 2 · Grupo A) y la Federación Extremeña (Senior Femenino Sur) y reescribe `assets/partidos.json`, que la web usa en lugar de los datos de `index.html`.
Se puede lanzar a mano en GitHub → Actions → «Actualizar partidos y clasificación» → Run workflow.
Si una fuente falla, ese equipo se queda como estaba y la web avisa cuando los datos tienen más de 2 semanas.

## Publicar en un hosting propio (con PHP)

Para subir la web a un hosting normal (Apache/Nginx con PHP 7.4+) basta con copiar `index.html`, `actualizar.php`, `assets/` e `img/` en la raíz (`public_html`).
`actualizar.php` es la versión PHP de `scripts/actualizar.py`: la web lo llama en cada visita y, si los datos tienen más de 3 horas, vuelve a leer la RFEVB y la Federación Extremeña y reescribe `assets/partidos.json`. No hace falta cron ni GitHub.
Requisitos: que PHP pueda escribir en `assets/partidos.json` y salir a internet (cURL o `allow_url_fopen`, lo normal en cualquier hosting).
Opcional: un cron del hosting con `php /ruta/a/public_html/actualizar.php` fuerza la actualización.
