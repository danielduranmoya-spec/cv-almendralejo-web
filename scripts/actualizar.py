#!/usr/bin/env python3
"""Actualizador automático de partidos y clasificaciones del CV Almendralejo.

Lee las webs oficiales y reescribe assets/partidos.json (la web lo usa en lugar
de los datos escritos en index.html):

  - Masculino (Superliga 2, Grupo A): RFEVB / dataproject
      calendario y resultados de las jornadas publicadas + clasificación oficial.
      Las jornadas futuras que la RFEVB aún no publica se conservan del archivo.
  - Femenino (Senior Femenino Sur): resultados.fedexvoleibol.com
      calendario completo; la clasificación se calcula con los resultados
      (3-0 / 3-1 = 3 puntos; 3-2 = 2 al ganador y 1 al perdedor).

Si una fuente falla o cambia de formato, ese equipo se deja como estaba y el
script termina sin romper nada (la web avisa si los datos se quedan viejos).

Uso:  python3 scripts/actualizar.py            (descarga de internet)
      FUENTES_LOCALES=carpeta python3 ...      (lee HTML guardados, para pruebas)
"""
import datetime as dt
import html
import json
import os
import re
import sys
import urllib.request
from zoneinfo import ZoneInfo

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(RAIZ, 'assets', 'partidos.json')
UA = 'Mozilla/5.0 (compatible; CVA-actualizador/1.0; +https://github.com/danielduranmoya-spec/cv-almendralejo-web)'

RFEVB_PARTIDOS = 'https://rfevb-web.dataproject.com/CompetitionMatches.aspx?ID=167&PID=203'
RFEVB_CLASIF = 'https://rfevb-web.dataproject.com/CompetitionStandings.aspx?ID=167&PID=203'
RFEVB_GRUPO = '396'  # Superliga Masculina 2 · Grupo A
FEDEX_CAL = 'https://resultados.fedexvoleibol.com/calendar.php?grupo=155'

LOCAL = os.environ.get('FUENTES_LOCALES')
ARCHIVOS_LOCALES = {RFEVB_PARTIDOS: 'rfevb-partidos.html', RFEVB_CLASIF: 'rfevb-clasif.html',
                    FEDEX_CAL: 'fedexres-calendar_php_grupo_155.html'}


def es_cva(nombre):
    n = nombre.lower()
    return 'almendralejo' in n or 'tránsitos suroeste' in n or 'transitos suroeste' in n or n.startswith('cva ')


def descargar(url):
    if LOCAL:
        with open(os.path.join(LOCAL, ARCHIVOS_LOCALES[url]), encoding='utf-8') as f:
            return f.read()
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('utf-8', 'replace')


def limpio(s):
    s = html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))
    return re.sub(r'\s+', ' ', s).strip()


PEQUENAS = {'de', 'del', 'la', 'las', 'los', 'y', 'el', 'en'}


def nombre_bonito(s):
    """Las webs de la Federación escriben muchos equipos en MAYÚSCULAS."""
    s = limpio(s).replace('"', '«', 1).replace('"', '»', 1)
    if s.upper() != s:
        return s
    out = []
    for i, w in enumerate(s.lower().split(' ')):
        if i and w in PEQUENAS:
            out.append(w)
        elif len(w) <= 2:
            out.append(w.upper())          # AD, CV, A7, «A», «B»…
        else:
            out.append(w[:1].upper() + w[1:] if not w.startswith(('«', '+')) else w[:2].upper() + w[2:])
    return ' '.join(out)


def resultado(sets_cva, sets_rival):
    if sets_cva is None or sets_rival is None:
        return {}
    return {'res': 'G' if sets_cva > sets_rival else 'P', 'marc': f'{sets_cva}-{sets_rival}'}


# ---------------------------------------------------------------- masculino
def rfevb_partidos(t):
    pref = rf'ctl00_Content_Main_{RFEVB_GRUPO}_userControl_RADLIST_Legs_ctrl(\d+)_RADLIST_Matches_ctrl(\d+)_(\w+)'
    datos = {}
    for leg, m, campo, valor in re.findall(r'<span id="' + pref + r'"[^>]*>(.*?)</span>', t, re.S):
        datos.setdefault((int(leg), int(m)), {})[campo] = limpio(valor)
    partidos = []
    for (leg, _), d in sorted(datos.items()):
        local, visit = d.get('Label6') or d.get('Label2') or d.get('LBL_HomeTeamName'), d.get('Label7') or d.get('Label4') or d.get('LBL_GuestTeamName')
        if not local or not visit or not (es_cva(local) or es_cva(visit)):
            continue
        fh = re.match(r'(\d\d)/(\d\d)/(\d{4})(?:\s*-\s*(\d\d:\d\d))?', d.get('LB_DataOra_md') or d.get('LB_DataOra') or '')
        if not fh:
            continue
        casa = es_cva(local)
        sl, sv = d.get('Label1') or d.get('LB_SetCasa'), d.get('Label5') or d.get('LB_SetOspiti')
        sl = int(sl) if sl and sl.isdigit() else None
        sv = int(sv) if sv and sv.isdigit() else None
        jugado = sl is not None and sv is not None and (sl == 3 or sv == 3)
        p = {'j': leg // 2 + 1, 'f': f'{fh[3]}-{fh[2]}-{fh[1]}', 'h': fh[4] if fh[4] and fh[4] != '00:00' else None,
             'rival': visit if casa else local, 'casa': casa, 'sede': d.get('LB_Palasport') or ''}
        if jugado:
            p.update(resultado(sl if casa else sv, sv if casa else sl))
        partidos.append(p)
    return partidos


def rfevb_clasif(t):
    out, vistos = [], set()
    for tr in re.split(r'<tr class="RG_Standing_Main', t)[1:]:
        grupo = re.search(r'Content_Main\$(\d+)_userControl\$RG_Standing_Main', tr)
        if not grupo or grupo[1] != RFEVB_GRUPO:
            continue
        g = lambda k: (re.search(rf'<span id="{k}"[^>]*>(.*?)</span>', tr, re.S) or [None, ''])[1]
        nombre, pts, pj, pg = limpio(g('TeamName')), limpio(g('Points')), limpio(g('MatchesPlayed')), limpio(g('WonMatches'))
        if nombre and nombre not in vistos and pts.isdigit() and pj.isdigit() and pg.isdigit():
            vistos.add(nombre); out.append([nombre, int(pts), int(pj), int(pg)])
    return out


def actualizar_masculino(eq):
    nuevos = rfevb_partidos(descargar(RFEVB_PARTIDOS))
    clasif = rfevb_clasif(descargar(RFEVB_CLASIF))
    if not nuevos or len(clasif) < 6 or not any(es_cva(c[0]) for c in clasif):
        raise ValueError(f'RFEVB: datos incompletos ({len(nuevos)} partidos, {len(clasif)} equipos)')
    por_j = {p['j']: p for p in eq.get('partidos', [])}
    for p in nuevos:
        viejo = por_j.get(p['j'], {})
        if 'res' not in p:          # sin resultado oficial aún: no borres uno puesto a mano
            p = {**p, **{k: viejo[k] for k in ('res', 'marc') if k in viejo and p['f'] == viejo.get('f')}}
        por_j[p['j']] = p
    eq['partidos'] = [por_j[k] for k in sorted(por_j)]
    eq['clasif'] = clasif
    jornadas = max(c[2] for c in clasif)
    eq['clasifNota'] = f'tras {jornadas} jornada' + ('s' if jornadas != 1 else '')
    return eq


# ----------------------------------------------------------------- femenino
def fedex_calendario(t):
    partidos = []
    for jor, cuerpo in re.findall(r'JORNADA\s*(\d+)\s*</h4>(.*?)(?=JORNADA\s*\d+\s*</h4>|$)', t, re.S):
        filas = re.findall(r'<tr[^>]*>(.*?)</tr>', cuerpo, re.S)
        for a, b in zip(filas[0::2], filas[1::2]):
            c = re.findall(r'<td[^>]*>(.*?)</td>', a, re.S)
            if len(c) < 4:
                continue
            f = re.search(r'(\d{4})/(\d\d)/(\d\d)', c[0])
            local, marc, visit = nombre_bonito(c[1]), limpio(c[2]), nombre_bonito(c[3])
            info = limpio(b)
            hora = re.search(r'\b(\d{1,2}:\d\d)\b', info)
            sede = limpio(re.sub(r'<[^>]+>', '', b.split('PingFEDEX.png')[-1]).split('>', 1)[-1]) if 'PingFEDEX' in b else ''
            sets = re.match(r'(\d)\s*-\s*(\d)', marc)
            partidos.append({'j': int(jor), 'f': f'{f[1]}-{f[2]}-{f[3]}' if f else None,
                             'h': hora[1].zfill(5) if hora else None, 'local': local, 'visit': visit,
                             'sl': int(sets[1]) if sets else None, 'sv': int(sets[2]) if sets else None, 'sede': sede})
    return partidos


def fedex_clasif(todos):
    tabla = {}
    for p in todos:
        for n in (p['local'], p['visit']):
            tabla.setdefault(n, [n, 0, 0, 0])
        if p['sl'] is None or max(p['sl'], p['sv']) != 3:
            continue
        g, pe = (p['local'], p['visit']) if p['sl'] > p['sv'] else (p['visit'], p['local'])
        apretado = min(p['sl'], p['sv']) == 2
        tabla[g][1] += 2 if apretado else 3
        tabla[pe][1] += 1 if apretado else 0
        tabla[g][2] += 1; tabla[pe][2] += 1; tabla[g][3] += 1
    return sorted(tabla.values(), key=lambda r: (-r[1], -r[3], r[2], r[0]))


def actualizar_femenino(eq):
    todos = fedex_calendario(descargar(FEDEX_CAL))
    mios = [p for p in todos if es_cva(p['local']) or es_cva(p['visit'])]
    if len(todos) < 6 or not mios:
        raise ValueError(f'FEDEXVB: datos incompletos ({len(todos)} partidos)')
    partidos = []
    for p in sorted(mios, key=lambda x: (x['j'], x['f'] or '')):
        casa = es_cva(p['local'])
        q = {'j': p['j'], 'f': p['f'], 'h': p['h'], 'rival': p['visit'] if casa else p['local'], 'casa': casa,
             'sede': 'Pabellón San Roque' if casa and 'roque' in p['sede'].lower() else p['sede']}
        if p['sl'] is not None and max(p['sl'], p['sv']) == 3:
            q.update(resultado(p['sl'] if casa else p['sv'], p['sv'] if casa else p['sl']))
        partidos.append(q)
    viejos = {p['j']: p for p in eq.get('partidos', [])}
    for q in partidos:
        v = viejos.get(q['j'])
        if not q['h'] and v and v.get('f') == q['f'] and v.get('h'):
            q['h'] = v['h']
    eq['partidos'] = [p for p in partidos if p['f']]
    eq['clasif'] = fedex_clasif(todos)
    eq['clasifNota'] = 'del Senior Femenino Sur (calculada con los resultados oficiales)'
    eq['calendarioUrl'] = 'https://fedexvoleibol.com/calendario-senior-femenino-2'
    return eq


def main():
    with open(JSON_PATH, encoding='utf-8') as f:
        datos = json.load(f)
    hoy = dt.datetime.now(ZoneInfo('Europe/Madrid')).date().isoformat()
    ok = 0
    for clave, fn in (('masculino', actualizar_masculino), ('femenino', actualizar_femenino)):
        try:
            antes = json.dumps(datos[clave])
            datos[clave] = fn(json.loads(antes))
            datos[clave]['actualizado'] = hoy
            ok += 1
            print(f'{clave}: OK ({len(datos[clave]["partidos"])} partidos, {len(datos[clave]["clasif"])} equipos)')
        except Exception as e:  # una fuente rota no tumba la otra
            print(f'::warning::{clave}: no se pudo actualizar → {e}', file=sys.stderr)
    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
        f.write('\n')
    if not ok:
        sys.exit('Ninguna fuente se pudo leer.')


if __name__ == '__main__':
    main()
