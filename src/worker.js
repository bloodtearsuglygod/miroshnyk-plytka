import { calculate, currency, parseArea, tiles } from './catalog.js';
import { assets } from './generated-assets.js';

const types = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8', jpg: 'image/jpeg', svg: 'image/svg+xml',
};
const security = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'self'",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { ...security, 'Cache-Control': 'no-store' } });
}

const fail = (error, status) => json({ error }, status);
const trim = value => typeof value === 'string' ? value.trim() : '';

function allowPagesOrigin(response, origin) {
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.append('Vary', 'Origin');
  }
  return response;
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function safeEqual(value, secret) {
  const [left, right] = await Promise.all([digest(value), digest(secret)]);
  return left.reduce((result, byte, index) => result | (byte ^ right[index]), 0) === 0;
}

async function createLead(request, db) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return fail('Неподдерживаемый формат заявки.', 415);
  const reader = request.body?.getReader();
  if (!reader) return fail('Заполните форму заявки.', 400);
  const decoder = new TextDecoder();
  let size = 0;
  let raw = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) {
      await reader.cancel();
      return fail('Заявка слишком длинная.', 413);
    }
    raw += decoder.decode(value, { stream: true });
  }
  let data;
  try { data = JSON.parse(raw + decoder.decode()); } catch { return fail('Не удалось прочитать заявку.', 400); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || trim(data.website)) return fail('Проверьте данные заявки.', 400);

  const name = trim(data.name);
  const phone = trim(data.phone);
  const comment = trim(data.comment);
  const phoneLength = phone.replace(/\D/g, '').length;
  if (name.length < 2 || name.length > 80) return fail('Укажите имя от 2 до 80 символов.', 400);
  if (!/^\+?[\d\s()-]+$/.test(phone) || phoneLength < 7 || phoneLength > 15 || phone.length > 30) return fail('Проверьте номер телефона.', 400);
  if (comment.length > 1200) return fail('Сократите комментарий до 1200 символов.', 400);
  if (data.consent !== true) return fail('Подтвердите согласие на передачу контактных данных.', 400);
  if (data.currency !== currency) return fail('Валюта каталога обновилась. Обновите страницу и проверьте сумму заявки.', 409);

  const id = trim(data.id).toLowerCase();
  const tile = tiles.find(item => item.id === data.tileId);
  const area = parseArea(data.area);
  if (!tile || area === null || typeof data.reserve !== 'boolean' || !uuid.test(id)) return fail('Пересчитайте проект и отправьте заявку ещё раз.', 400);
  const reserve = Number(data.reserve);
  const { billedArea, total } = calculate(tile, area, data.reserve);
  const bytes = await digest(JSON.stringify([name, phone, comment, tile.id, area, reserve, billedArea, tile.price, total, currency]));
  const key = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const insert = await db.prepare(`INSERT INTO leads (id, created_at, name, phone, comment, tile_name, area, reserve, billed_area, price, total, payload_key, currency)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`)
    .bind(id, new Date().toISOString(), name, phone, comment, tile.name, area, reserve, billedArea, tile.price, total, key, currency).run();
  if (!insert.meta.changes) {
    const existing = await db.prepare('SELECT payload_key FROM leads WHERE id = ?').bind(id).first();
    if (existing?.payload_key !== key) return fail('Заявка с этим номером уже существует. Обновите страницу и попробуйте ещё раз.', 409);
  }
  return json({ id }, insert.meta.changes ? 201 : 200);
}

async function listLeads(request, url, env) {
  if (!env.OWNER_PASSWORD) return fail('Доступ владельца ещё не настроен.', 503);
  const access = request.headers.get('authorization') ?? '';
  if (!access.startsWith('Bearer ') || access.length > 300 || !await safeEqual(access.slice(7), env.OWNER_PASSWORD)) {
    return fail('Проверьте пароль владельца.', 401);
  }
  const page = Number(url.searchParams.get('page') ?? 0);
  if (!Number.isSafeInteger(page) || page < 0 || page > 10000) return fail('Такой страницы нет.', 400);
  const size = 50;
  const { results } = await env.DB.prepare(`SELECT id, created_at, name, phone, comment, tile_name, area, reserve, billed_area, price, total, currency
    FROM leads ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).bind(size + 1, page * size).all();
  return json({ leads: results.slice(0, size), hasMore: results.length > size });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const pagesOrigin = origin && origin === env.PAGES_ORIGIN ? origin : null;
    let submission = false;
    try {
      if (url.pathname === '/api/leads') {
        if (request.method === 'OPTIONS' && pagesOrigin && request.headers.get('Access-Control-Request-Method') === 'POST') {
          return allowPagesOrigin(new Response(null, { status: 204, headers: {
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
          } }), pagesOrigin);
        }
        if (request.method === 'POST') {
          if (origin && origin !== url.origin && !pagesOrigin) return fail('Отправьте заявку со страницы калькулятора.', 403);
          submission = true;
          return allowPagesOrigin(await createLead(request, env.DB), pagesOrigin);
        }
        if (request.method === 'GET') return await listLeads(request, url, env);
        return fail('Метод не поддерживается.', 405);
      }

      if (!['GET', 'HEAD'].includes(request.method)) return fail('Метод не поддерживается.', 405);
      const path = url.pathname === '/' ? '/index.html' : url.pathname.replace(/^\/owner\/?$/, '/owner.html');
      if (!Object.hasOwn(assets, path)) return fail('Страница не найдена.', 404);
      const extension = path.split('.').at(-1);
      const content = assets[path];
      const body = extension === 'jpg' ? Uint8Array.from(atob(content), character => character.charCodeAt(0)) : content;
      return new Response(request.method === 'HEAD' ? null : body, { headers: {
        ...security,
        'Content-Type': types[extension],
        'Cache-Control': extension === 'html' ? 'no-cache' : 'public, max-age=300',
      } });
    } catch (error) {
      console.error(error);
      return allowPagesOrigin(fail('Сервис временно недоступен. Попробуйте ещё раз.', 503), submission ? pagesOrigin : null);
    }
  },
};
