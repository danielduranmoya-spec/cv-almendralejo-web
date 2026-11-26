<?php
/*
 * Actualizador de partidos y clasificaciones del CV Almendralejo (versión PHP).
 *
 * Hace lo mismo que scripts/actualizar.py, pero dentro del propio hosting, para
 * que la web se mantenga al día sin depender de GitHub:
 *   - Masculino (Superliga 2, Grupo A): RFEVB / dataproject.
 *   - Femenino (Senior Femenino Sur): resultados.fedexvoleibol.com.
 * y reescribe assets/partidos.json.
 *
 * Cómo se lanza:
 *   - Solo: la web llama a este archivo en cada visita. Si los datos tienen más
 *     de CADA_HORAS horas, los vuelve a leer; si no, devuelve los que hay.
 *   - Cron del hosting (opcional): `php /ruta/actualizar.php` fuerza la lectura.
 *
 * Si una fuente falla, ese equipo se queda como estaba (la web avisa si los
 * datos se quedan viejos). Requisitos: PHP 7.4+ con cURL o allow_url_fopen, y
 * permiso de escritura en assets/partidos.json.
 */

const CADA_HORAS = 3;  // cada cuánto se vuelve a mirar en las webs oficiales

const RFEVB_PARTIDOS = 'https://rfevb-web.dataproject.com/CompetitionMatches.aspx?ID=167&PID=203';
const RFEVB_CLASIF   = 'https://rfevb-web.dataproject.com/CompetitionStandings.aspx?ID=167&PID=203';
const RFEVB_GRUPO    = '396';  // Superliga Masculina 2 · Grupo A
const FEDEX_CAL      = 'https://resultados.fedexvoleibol.com/calendar.php?grupo=155';
const UA = 'Mozilla/5.0 (compatible; CVA-actualizador/1.0; +https://github.com/danielduranmoya-spec/cv-almendralejo-web)';

$JSON_PATH = __DIR__ . '/assets/partidos.json';
$CLI = PHP_SAPI === 'cli';
$INTENTO = sys_get_temp_dir() . '/cva-partidos-' . md5(__DIR__) . '.intento';  // último intento, por si no se puede escribir en assets/
@ini_set('pcre.backtrack_limit', '10000000');
$LOCAL = $CLI ? getenv('FUENTES_LOCALES') : false;  // pruebas con HTML guardados
$ARCHIVOS_LOCALES = [RFEVB_PARTIDOS => 'rfevb-partidos.html', RFEVB_CLASIF => 'rfevb-clasif.html',
                     FEDEX_CAL => 'fedexres-calendar_php_grupo_155.html'];

// ------------------------------------------------------------------ utilidades
function minus($s) { return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s); }
function mayus($s) { return function_exists('mb_strtoupper') ? mb_strtoupper($s, 'UTF-8') : strtoupper($s); }
function trozo($s, $ini, $len = null) {
    return function_exists('mb_substr') ? mb_substr($s, $ini, $len, 'UTF-8') : substr($s, $ini, $len);
}
function largo($s) { return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s); }
function empieza($s, $p) { return strncmp($s, $p, strlen($p)) === 0; }
function digitos($s) { return $s !== null && $s !== '' && ctype_digit($s); }

function es_cva($nombre) {
    $n = minus($nombre);
    return strpos($n, 'almendralejo') !== false || strpos($n, 'tránsitos suroeste') !== false
        || strpos($n, 'transitos suroeste') !== false || empieza($n, 'cva ');
}

function descargar($url) {
    global $LOCAL, $ARCHIVOS_LOCALES;
    if ($LOCAL) {
        $t = @file_get_contents(rtrim($LOCAL, '/') . '/' . $ARCHIVOS_LOCALES[$url]);
        if ($t === false) throw new Exception("no existe el archivo local de $url");
        return $t;
    }
    $cab = ['User-Agent: ' . UA, 'Accept-Language: es-ES,es;q=0.9'];
    if (function_exists('curl_init')) {
        $c = curl_init($url);
        curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => 40, CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_HTTPHEADER => $cab, CURLOPT_ENCODING => '']);
        $t = curl_exec($c);
        $cod = curl_getinfo($c, CURLINFO_HTTP_CODE);
        $err = curl_error($c);
        curl_close($c);
        if ($t === false || $cod >= 400) throw new Exception("no se pudo descargar $url ($cod $err)");
    } else {
        $ctx = stream_context_create(['http' => ['header' => implode("\r\n", $cab), 'timeout' => 40]]);
        $t = @file_get_contents($url, false, $ctx);
        if ($t === false) throw new Exception("no se pudo descargar $url");
    }
    return mb_check_encoding_seguro($t) ? $t : utf8_seguro($t);
}
function mb_check_encoding_seguro($t) { return !function_exists('mb_check_encoding') || mb_check_encoding($t, 'UTF-8'); }
function utf8_seguro($t) { return function_exists('mb_convert_encoding') ? mb_convert_encoding($t, 'UTF-8', 'UTF-8') : $t; }

function limpio($s) {
    $s = html_entity_decode(preg_replace('/<[^>]+>/', ' ', (string)$s), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim(preg_replace('/[\s\x{00A0}]+/u', ' ', $s), " \t\n\r\0\x0B\u{00A0}");
}

const PEQUENAS = ['de', 'del', 'la', 'las', 'los', 'y', 'el', 'en'];

/* Las webs de la Federación escriben muchos equipos en MAYÚSCULAS. */
function nombre_bonito($s) {
    $s = limpio($s);
    foreach (['«', '»'] as $c) { $p = strpos($s, '"'); if ($p !== false) $s = substr_replace($s, $c, $p, 1); }
    if (mayus($s) !== $s) return $s;
    $out = [];
    foreach (explode(' ', minus($s)) as $i => $w) {
        if ($i && in_array($w, PEQUENAS, true)) $out[] = $w;
        elseif (largo($w) <= 2) $out[] = mayus($w);                      // AD, CV, A7, «A», «B»…
        elseif (!empieza($w, '«') && !empieza($w, '+')) $out[] = mayus(trozo($w, 0, 1)) . trozo($w, 1);
        else $out[] = mayus(trozo($w, 0, 2)) . trozo($w, 2);
    }
    return implode(' ', $out);
}

function resultado($sets_cva, $sets_rival) {
    if ($sets_cva === null || $sets_rival === null) return [];
    return ['res' => $sets_cva > $sets_rival ? 'G' : 'P', 'marc' => "$sets_cva-$sets_rival"];
}

// ------------------------------------------------------------------ masculino
function rfevb_partidos($t) {
    $pref = 'ctl00_Content_Main_' . RFEVB_GRUPO . '_userControl_RADLIST_Legs_ctrl(\d+)_RADLIST_Matches_ctrl(\d+)_(\w+)';
    preg_match_all('~<span id="' . $pref . '"[^>]*>(.*?)</span>~s', $t, $m, PREG_SET_ORDER);
    $datos = [];
    foreach ($m as $x) $datos[(int)$x[1]][(int)$x[2]][$x[3]] = limpio($x[4]);
    ksort($datos);
    $partidos = [];
    foreach ($datos as $leg => $porPartido) {
        ksort($porPartido);
        foreach ($porPartido as $d) {
            $v = function ($k) use ($d) { return isset($d[$k]) && $d[$k] !== '' ? $d[$k] : null; };
            $local = $v('Label6') ?? $v('Label2') ?? $v('LBL_HomeTeamName');
            $visit = $v('Label7') ?? $v('Label4') ?? $v('LBL_GuestTeamName');
            if (!$local || !$visit || !(es_cva($local) || es_cva($visit))) continue;
            if (!preg_match('~^(\d\d)/(\d\d)/(\d{4})(?:\s*-\s*(\d\d:\d\d))?~', $v('LB_DataOra_md') ?? $v('LB_DataOra') ?? '', $fh)) continue;
            $casa = es_cva($local);
            $sl = $v('Label1') ?? $v('LB_SetCasa');
            $sv = $v('Label5') ?? $v('LB_SetOspiti');
            $sl = digitos($sl) ? (int)$sl : null;
            $sv = digitos($sv) ? (int)$sv : null;
            $jugado = $sl !== null && $sv !== null && ($sl === 3 || $sv === 3);
            $hora = isset($fh[4]) && $fh[4] !== '' && $fh[4] !== '00:00' ? $fh[4] : null;
            $p = ['j' => intdiv($leg, 2) + 1, 'f' => "$fh[3]-$fh[2]-$fh[1]", 'h' => $hora,
                  'rival' => $casa ? $visit : $local, 'casa' => $casa, 'sede' => $v('LB_Palasport') ?? ''];
            if ($jugado) $p = array_merge($p, resultado($casa ? $sl : $sv, $casa ? $sv : $sl));
            $partidos[] = $p;
        }
    }
    return $partidos;
}

function rfevb_clasif($t) {
    $out = []; $vistos = [];
    foreach (array_slice(explode('<tr class="RG_Standing_Main', $t), 1) as $tr) {
        if (!preg_match('~Content_Main\$(\d+)_userControl\$RG_Standing_Main~', $tr, $g) || $g[1] !== RFEVB_GRUPO) continue;
        $c = function ($k) use ($tr) { return preg_match('~<span id="' . $k . '"[^>]*>(.*?)</span>~s', $tr, $x) ? limpio($x[1]) : ''; };
        $nombre = $c('TeamName'); $pts = $c('Points'); $pj = $c('MatchesPlayed'); $pg = $c('WonMatches');
        if ($nombre !== '' && !isset($vistos[$nombre]) && digitos($pts) && digitos($pj) && digitos($pg)) {
            $vistos[$nombre] = true; $out[] = [$nombre, (int)$pts, (int)$pj, (int)$pg];
        }
    }
    return $out;
}

function actualizar_masculino($eq) {
    $nuevos = rfevb_partidos(descargar(RFEVB_PARTIDOS));
    $clasif = rfevb_clasif(descargar(RFEVB_CLASIF));
    $hayCva = false; foreach ($clasif as $c) if (es_cva($c[0])) $hayCva = true;
    if (!$nuevos || count($clasif) < 6 || !$hayCva)
        throw new Exception('RFEVB: datos incompletos (' . count($nuevos) . ' partidos, ' . count($clasif) . ' equipos)');
    $porJ = [];
    foreach ($eq['partidos'] ?? [] as $p) $porJ[$p['j']] = $p;
    foreach ($nuevos as $p) {
        $viejo = $porJ[$p['j']] ?? [];
        if (!isset($p['res']) && ($viejo['f'] ?? null) === $p['f'])  // sin resultado oficial aún: no borres uno puesto a mano
            foreach (['res', 'marc'] as $k) if (array_key_exists($k, $viejo)) $p[$k] = $viejo[$k];
        $porJ[$p['j']] = $p;
    }
    ksort($porJ);
    $eq['partidos'] = array_values($porJ);
    $eq['clasif'] = $clasif;
    $jornadas = max(array_map(function ($c) { return $c[2]; }, $clasif));
    $eq['clasifNota'] = "tras $jornadas jornada" . ($jornadas !== 1 ? 's' : '');
    return $eq;
}

// ------------------------------------------------------------------- femenino
function fedex_calendario($t) {
    $partidos = [];
    $trozos = preg_split('~JORNADA\s*(\d+)\s*</h4>~', $t, -1, PREG_SPLIT_DELIM_CAPTURE);
    for ($k = 1; $k + 1 < count($trozos); $k += 2) {
        $jor = (int)$trozos[$k];
        $cuerpo = $trozos[$k + 1];
        preg_match_all('~<tr[^>]*>(.*?)</tr>~s', $cuerpo, $fm);
        $filas = $fm[1];
        for ($i = 0; $i + 1 < count($filas); $i += 2) {
            $a = $filas[$i]; $b = $filas[$i + 1];
            preg_match_all('~<td[^>]*>(.*?)</td>~s', $a, $cm);
            $c = $cm[1];
            if (count($c) < 4) continue;
            $f = preg_match('~(\d{4})/(\d\d)/(\d\d)~', $c[0], $fx) ? "$fx[1]-$fx[2]-$fx[3]" : null;
            $local = nombre_bonito($c[1]); $marc = limpio($c[2]); $visit = nombre_bonito($c[3]);
            $info = limpio($b);
            $hora = preg_match('~\b(\d{1,2}:\d\d)\b~', $info, $hx) ? str_pad($hx[1], 5, '0', STR_PAD_LEFT) : null;
            $sede = '';
            if (strpos($b, 'PingFEDEX') !== false) {
                $tras = explode('PingFEDEX.png', $b);
                $x = preg_replace('~<[^>]+>~', '', end($tras));
                $pos = strpos($x, '>');
                $sede = limpio($pos === false ? $x : substr($x, $pos + 1));
            }
            $sets = preg_match('~^(\d)\s*-\s*(\d)~', $marc, $sx);
            $partidos[] = ['j' => $jor, 'f' => $f, 'h' => $hora, 'local' => $local, 'visit' => $visit,
                           'sl' => $sets ? (int)$sx[1] : null, 'sv' => $sets ? (int)$sx[2] : null, 'sede' => $sede];
        }
    }
    return $partidos;
}

function fedex_clasif($todos) {
    $tabla = [];
    foreach ($todos as $p) {
        foreach ([$p['local'], $p['visit']] as $n) if (!isset($tabla[$n])) $tabla[$n] = [$n, 0, 0, 0];
        if ($p['sl'] === null || max($p['sl'], $p['sv']) !== 3) continue;
        [$g, $pe] = $p['sl'] > $p['sv'] ? [$p['local'], $p['visit']] : [$p['visit'], $p['local']];
        $apretado = min($p['sl'], $p['sv']) === 2;
        $tabla[$g][1] += $apretado ? 2 : 3;
        $tabla[$pe][1] += $apretado ? 1 : 0;
        $tabla[$g][2]++; $tabla[$pe][2]++; $tabla[$g][3]++;
    }
    $filas = array_values($tabla);
    usort($filas, function ($x, $y) {
        return [$y[1], $y[3], $x[2]] <=> [$x[1], $x[3], $y[2]] ?: strcmp($x[0], $y[0]);
    });
    return $filas;
}

function actualizar_femenino($eq) {
    $todos = fedex_calendario(descargar(FEDEX_CAL));
    $mios = array_values(array_filter($todos, function ($p) { return es_cva($p['local']) || es_cva($p['visit']); }));
    if (count($todos) < 6 || !$mios) throw new Exception('FEDEXVB: datos incompletos (' . count($todos) . ' partidos)');
    usort($mios, function ($x, $y) { return [$x['j'], $x['f'] ?? ''] <=> [$y['j'], $y['f'] ?? '']; });
    $partidos = [];
    foreach ($mios as $p) {
        $casa = es_cva($p['local']);
        $q = ['j' => $p['j'], 'f' => $p['f'], 'h' => $p['h'], 'rival' => $casa ? $p['visit'] : $p['local'], 'casa' => $casa,
              'sede' => $casa && strpos(minus($p['sede']), 'roque') !== false ? 'Pabellón San Roque' : $p['sede']];
        if ($p['sl'] !== null && max($p['sl'], $p['sv']) === 3)
            $q = array_merge($q, resultado($casa ? $p['sl'] : $p['sv'], $casa ? $p['sv'] : $p['sl']));
        $partidos[] = $q;
    }
    $viejos = [];
    foreach ($eq['partidos'] ?? [] as $p) $viejos[$p['j']] = $p;
    foreach ($partidos as &$q) {
        $v = $viejos[$q['j']] ?? null;
        if (!$q['h'] && $v && ($v['f'] ?? null) === $q['f'] && !empty($v['h'])) $q['h'] = $v['h'];
    }
    unset($q);
    $eq['partidos'] = array_values(array_filter($partidos, function ($p) { return (bool)$p['f']; }));
    $eq['clasif'] = fedex_clasif($todos);
    $eq['clasifNota'] = 'del Senior Femenino Sur (calculada con los resultados oficiales)';
    $eq['calendarioUrl'] = 'https://fedexvoleibol.com/calendario-senior-femenino-2';
    return $eq;
}

// ---------------------------------------------------------------- principal
function leer_json($ruta) {
    $t = @file_get_contents($ruta);
    $d = $t === false ? null : json_decode($t, true);
    return is_array($d) ? $d : null;
}

function actualizar($ruta, &$avisos) {
    $datos = leer_json($ruta);
    if (!$datos) { $avisos[] = 'assets/partidos.json no existe o está dañado'; return null; }
    $hoy = (new DateTime('now', new DateTimeZone('Europe/Madrid')))->format('Y-m-d');
    $ok = 0;
    foreach (['masculino' => 'actualizar_masculino', 'femenino' => 'actualizar_femenino'] as $clave => $fn) {
        try {
            $nuevo = $fn($datos[$clave] ?? []);
            $nuevo['actualizado'] = $hoy;
            $datos[$clave] = $nuevo;
            $ok++;
            $avisos[] = "$clave: OK (" . count($nuevo['partidos']) . ' partidos, ' . count($nuevo['clasif']) . ' equipos)';
        } catch (Throwable $e) {  // una fuente rota no tumba la otra
            $avisos[] = "$clave: no se pudo actualizar → " . $e->getMessage();
        }
    }
    if ($ok) {
        $json = json_encode($datos, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        $tmp = $ruta . '.tmp';
        if ($json === false || @file_put_contents($tmp, $json . "\n") === false || !@rename($tmp, $ruta)) {
            @unlink($tmp);
            $avisos[] = 'no se pudo escribir assets/partidos.json (revisa los permisos)';
        }
    }
    return $datos;
}

if ($CLI) {
    $avisos = [];
    $datos = actualizar($JSON_PATH, $avisos);
    fwrite(STDERR, implode("\n", $avisos) . "\n");
    exit($datos && preg_grep('/: OK/', $avisos) ? 0 : 1);
}

// Llamada desde la web: devuelve los datos y, si están viejos, los refresca antes.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
$datos = null;
function edad($ruta, $intento) {
    clearstatcache();
    return time() - max((int)@filemtime($ruta), (int)@filemtime($intento));
}
$viejo = edad($JSON_PATH, $INTENTO) > CADA_HORAS * 3600;
if ($viejo) {
    // Un único visitante actualiza; los demás reciben lo que ya hay.
    $cerrojo = @fopen($INTENTO . '.lock', 'c');
    if ($cerrojo && flock($cerrojo, LOCK_EX | LOCK_NB)) {
        if (edad($JSON_PATH, $INTENTO) > CADA_HORAS * 3600) {
            @touch($INTENTO);
            @set_time_limit(120);
            ignore_user_abort(true);
            $avisos = [];
            $datos = actualizar($JSON_PATH, $avisos);
            @touch($JSON_PATH);  // aunque fallen las fuentes, no reintentar en cada visita
        }
        flock($cerrojo, LOCK_UN);
    }
    if ($cerrojo) fclose($cerrojo);
}
$datos = $datos ?: leer_json($JSON_PATH);
if (!$datos) { http_response_code(503); echo '{}'; exit; }
echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
