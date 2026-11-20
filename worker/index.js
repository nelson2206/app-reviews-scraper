// Echo (Reseñas de Apps) · Worker "resenas-web".
// Sirve la página (assets estáticos, ver wrangler.jsonc) y expone la API de Google Play
// en el mismo dominio. La librería google-play-scraper NO corre en Workers (su capa de red
// usa `got`), por eso aquí se llama directo a play.google.com con fetch.
//
// Rutas (contrato compatible con el backend Vercel anterior "app-reviews-api"):
//   GET /api/gplay-search?term=&country=&lang=            (alias: /api/gplay/search?q=)
//   GET /api/gplay-reviews?appId=&country=&lang=&max=&name=&sort=   (alias: /api/gplay/reviews?num=)
//   GET /api/health
//
// Topes (regla 5 del plan): caché 6 h por combinación de parámetros; solo los pedidos que
// llegan a Google (MISS) consumen cupo: 60 por hora por IP y 2.000 por día en total.
// Uso interno y moderado: extraer reseñas de Google Play va contra sus términos de uso.

const GP = 'https://play.google.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CACHE_TTL = 6 * 3600;
const LIMIT_IP_HORA = 60;
const LIMIT_GLOBAL_DIA = 2000;
const MAX_REVIEWS = 2000;
const PAGE_SIZE = 150;
const SORTS = { newest: 2, rating: 3, helpful: 1, helpfulness: 1 };
const ORIGENES_CORS = ['https://resenas.mbc-latam.com', 'https://nelson2206.github.io'];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'Método no permitido.' }, 405, cors);

    const ruta = url.pathname.replace(/\/+$/, '');
    try {
      if (ruta === '/api/health') return json({ ok: true, service: 'resenas-web' }, 200, cors);
      if (ruta === '/api/gplay-search' || ruta === '/api/gplay/search') return await manejar(request, env, ctx, url, cors, 'search');
      if (ruta === '/api/gplay-reviews' || ruta === '/api/gplay/reviews') return await manejar(request, env, ctx, url, cors, 'reviews');
    } catch (e) {
      if (e instanceof ErrorPedido) return json({ error: e.message }, e.status, { ...cors, ...(e.headers || {}) });
      return json({ error: 'Google Play no respondió como se esperaba. Reintenta en unos minutos.' }, 502, cors);
    }
    return json({ error: 'No encontrado.' }, 404, cors);
  },
};

class ErrorPedido extends Error {
  constructor(message, status, headers) { super(message); this.status = status; this.headers = headers; }
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const permitido = origin && (ORIGENES_CORS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return {
    ...(permitido ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...extra },
  });
}

// ---------- validación de parámetros ----------
function parametros(url, tipo) {
  const p = url.searchParams;
  const country = (p.get('country') || 'pe').toLowerCase();
  const lang = p.get('lang') || 'es';
  if (!/^[a-z]{2}$/.test(country)) throw new ErrorPedido('Parámetro "country" inválido.', 400);
  if (!/^[a-z]{2}(-[A-Za-z]{2})?$/.test(lang)) throw new ErrorPedido('Parámetro "lang" inválido.', 400);

  if (tipo === 'search') {
    const term = (p.get('term') || p.get('q') || '').trim();
    if (!term) throw new ErrorPedido('Falta el parámetro "term".', 400);
    if (term.length > 100) throw new ErrorPedido('El término de búsqueda es demasiado largo.', 400);
    return { tipo, term, country, lang };
  }

  const appId = (p.get('appId') || '').trim();
  if (!appId) throw new ErrorPedido('Falta el parámetro "appId".', 400);
  if (!/^[A-Za-z0-9._]{3,150}$/.test(appId)) throw new ErrorPedido('Parámetro "appId" inválido.', 400);
  const sortRaw = (p.get('sort') || 'newest').toLowerCase();
  const sort = SORTS[sortRaw] || (['1', '2', '3'].includes(sortRaw) ? Number(sortRaw) : null);
  if (!sort) throw new ErrorPedido('Parámetro "sort" inválido (newest, rating, helpful).', 400);
  const max = Math.min(Math.max(parseInt(p.get('max') || p.get('num'), 10) || 300, 1), MAX_REVIEWS);
  const name = (p.get('name') || '').slice(0, 120);
  return { tipo, appId, country, lang, sort, max, name };
}

// ---------- caché + topes + upstream ----------
async function manejar(request, env, ctx, url, cors, tipo) {
  const q = parametros(url, tipo);

  // La clave de caché no incluye `name` (solo cambia el texto de app_name, se reescribe al responder).
  const claveParams = tipo === 'search'
    ? `term=${encodeURIComponent(q.term.toLowerCase())}&country=${q.country}&lang=${q.lang}`
    : `appId=${q.appId}&country=${q.country}&lang=${q.lang}&sort=${q.sort}&max=${q.max}`;
  const claveCache = new Request(`https://cache.resenas-web.internal/${tipo}?${claveParams}`);
  const cache = caches.default;

  let cuerpo = null;
  let estadoCache = 'MISS';
  const guardado = await cache.match(claveCache);
  if (guardado) { cuerpo = await guardado.json(); estadoCache = 'HIT'; }

  if (!cuerpo) {
    await consumirCupo(env, request);
    cuerpo = tipo === 'search' ? await buscar(q) : await resenas(q);
    // No se cachean resultados vacíos (podrían ser un fallo transitorio de Google).
    const vacio = tipo === 'search' ? !cuerpo.apps.length : !cuerpo.reviews.length;
    if (!vacio) {
      ctx.waitUntil(cache.put(claveCache, new Response(JSON.stringify(cuerpo), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, s-maxage=${CACHE_TTL}, max-age=${CACHE_TTL}` },
      })));
    }
  }

  if (tipo === 'reviews' && q.name) {
    cuerpo = { ...cuerpo, reviews: cuerpo.reviews.map(r => ({ ...r, app_name: q.name })) };
  }
  return json(cuerpo, 200, { ...cors, 'Cache-Control': 'public, max-age=300', 'X-Cache': estadoCache });
}

function diaLima() { return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10); }
function horaLima() { return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 13); }

// Cupo en KV (aproximado: get+put no es atómico; basta para un tope de uso interno).
async function consumirCupo(env, request) {
  if (!env.USO) return;
  const ip = request.headers.get('CF-Connecting-IP') || 'desconocida';
  const kIp = `ip:${ip}:${horaLima()}`;
  const kDia = `dia:${diaLima()}`;
  const [usoIp, usoDia] = await Promise.all([env.USO.get(kIp), env.USO.get(kDia)]);
  const nIp = Number(usoIp) || 0, nDia = Number(usoDia) || 0;
  // Los topes se pueden bajar con variables (LIMIT_IP_HORA, LIMIT_GLOBAL_DIA) para probarlos.
  const topeIp = Number(env.LIMIT_IP_HORA) || LIMIT_IP_HORA;
  const topeDia = Number(env.LIMIT_GLOBAL_DIA) || LIMIT_GLOBAL_DIA;
  if (nDia >= topeDia) {
    throw new ErrorPedido('Se alcanzó el tope diario de consultas a Google Play. Se restablece mañana (hora de Lima).', 429, { 'Retry-After': '3600' });
  }
  if (nIp >= topeIp) {
    throw new ErrorPedido(`Superaste ${topeIp} consultas nuevas por hora desde tu red. Reintenta en unos minutos (las ya consultadas siguen disponibles).`, 429, { 'Retry-After': '900' });
  }
  await Promise.all([
    env.USO.put(kIp, String(nIp + 1), { expirationTtl: 3700 }),
    env.USO.put(kDia, String(nDia + 1), { expirationTtl: 90000 }),
  ]);
}

// ---------- Google Play ----------
async function gpFetch(u, init = {}) {
  const r = await fetch(u, {
    ...init,
    headers: { 'User-Agent': UA, 'Accept-Language': 'es,en;q=0.8', ...(init.headers || {}) },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`Google Play respondió ${r.status}`);
  return r.text();
}

const at = (o, ...ruta) => ruta.reduce((a, k) => (a == null ? undefined : a[k]), o);

// Extrae los bloques AF_initDataCallback de la página (mismo criterio que google-play-scraper).
function bloquesDatos(html) {
  const out = {};
  const bloques = html.match(/>AF_initDataCallback[\s\S]*?<\/script/g) || [];
  for (const b of bloques) {
    const k = b.match(/(ds:.*?)'/);
    const v = b.match(/data:([\s\S]*?), sideChannel: {}}\);<\//);
    if (!k || !v) continue;
    try { out[k[1]] = JSON.parse(v[1]); } catch { /* bloque no JSON: se ignora */ }
  }
  return out;
}

async function buscar({ term, country, lang }) {
  const html = await gpFetch(`${GP}/store/search?c=apps&q=${encodeURIComponent(term)}&hl=${lang}&gl=${country}&price=0`);
  const datos = bloquesDatos(html);
  const apps = [];
  const vistos = new Set();
  const agregar = a => { if (a.appId && a.title && !vistos.has(a.appId)) { vistos.add(a.appId); apps.push(a); } };

  for (const data of Object.values(datos)) {
    const secciones = at(data, 0, 1);
    if (!Array.isArray(secciones)) continue;
    // Tarjeta de coincidencia exacta (layout distinto, va primero).
    const exacta = at(secciones, 0, 23);
    if (exacta) {
      agregar({
        appId: at(exacta, 16, 3, 12, 0, 0), title: at(exacta, 16, 2, 0, 0), developer: at(exacta, 16, 2, 68, 0) || '',
        icon: at(exacta, 16, 2, 95, 0, 3, 2) || '', score: at(exacta, 16, 2, 51, 0, 1) ?? null, genre: '',
      });
    }
    for (const sec of secciones) {
      const lista = at(sec, 22, 0);
      if (!Array.isArray(lista)) continue;
      for (const item of lista) {
        agregar({
          appId: at(item, 0, 0, 0), title: at(item, 0, 3), developer: at(item, 0, 14) || '',
          icon: at(item, 0, 1, 3, 2) || '', score: at(item, 0, 4, 1) ?? null, genre: '',
        });
      }
    }
    if (apps.length) break;
  }
  return { count: Math.min(apps.length, 24), apps: apps.slice(0, 24) };
}

function fechaGP(arr) {
  if (!Array.isArray(arr) || arr[0] == null) return null;
  return new Date(Number(arr[0]) * 1000 + Math.floor(Number(arr[1] || 0) / 1e6)).toJSON();
}

async function resenas({ appId, country, lang, sort, max }) {
  const extracted_at = new Date().toISOString();
  const out = [];
  const vistos = new Set();
  let token = null;
  const rutaApi = `${GP}/_/PlayStoreUi/data/batchexecute?rpcids=qnKhOb&f.sid=-697906427155521722&bl=boq_playuiserver_20190903.08_p0&hl=${lang}&gl=${country}&authuser&soc-app=121&soc-platform=1&soc-device=1&_reqid=1065213`;

  while (out.length < max) {
    const n = Math.min(PAGE_SIZE, max - out.length);
    const interno = JSON.stringify([null, null, [2, sort, [n, null, token], null, []], [appId, 7]]);
    const cuerpo = 'f.req=' + encodeURIComponent(JSON.stringify([[['UsvDTd', interno, null, 'generic']]]));
    const texto = await gpFetch(rutaApi, {
      method: 'POST',
      body: cuerpo,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    });
    const externo = JSON.parse(texto.substring(5));
    const data = JSON.parse(externo[0][2]);
    if (data == null) break;
    const lote = at(data, 0) || [];
    for (const rv of lote) {
      const id = rv[0];
      if (vistos.has(id)) continue;
      vistos.add(id);
      out.push({
        source: 'Google Play',
        app_name: appId,
        app_id: appId,
        review_id: id,
        review_title: '',
        review_text: at(rv, 4) || '',
        rating: at(rv, 2) || null,
        user_name: at(rv, 1, 0) || 'Anónimo',
        review_date: fechaGP(at(rv, 5)),
        app_version: at(rv, 10) || null,
        developer_response: at(rv, 7, 1) || null,
        country,
        extracted_at,
      });
    }
    token = at(data, 1, 1);
    if (!token || lote.length === 0) break;
  }
  return { app_id: appId, count: out.length, reviews: out.slice(0, max) };
}
