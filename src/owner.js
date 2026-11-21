import { decimal, money } from './catalog.js';

const get = selector => document.querySelector(selector);
const login = get('#owner-login');
const passwordInput = get('#owner-password');
const results = get('#owner-results');
const message = get('#owner-message');
const loginError = get('#owner-error');
const table = get('.leads');
const controls = get('#owner-pages');
const prev = get('#owner-prev');
const next = get('#owner-next');
const refresh = get('#owner-refresh');
const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
const previousMoney = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
let password = '';
let page = 0;
let activeRequest;

function renderRow(lead) {
  const row = document.createElement('tr');
  row.insertCell().textContent = `${lead.id.slice(0, 8).toUpperCase()} · ${dateFormat.format(new Date(lead.created_at))}`;
  const customer = row.insertCell();
  const link = document.createElement('a');
  link.href = `tel:${lead.phone.replace(/[^+\d]/g, '')}`;
  link.textContent = lead.phone;
  customer.append(lead.name, document.createElement('br'), link);
  const reserve = lead.reserve ? ` · ${decimal.format(lead.billed_area)} м² с запасом` : '';
  row.insertCell().textContent = `${lead.tile_name} · ${decimal.format(lead.area)} м²${reserve}`;
  row.insertCell().textContent = (lead.currency === 'RUB' ? previousMoney : money).format(lead.total);
  const comment = row.insertCell();
  comment.className = 'comment';
  comment.textContent = lead.comment || '—';
  return row;
}

async function loadLeads(targetPage) {
  activeRequest?.abort();
  const request = new AbortController();
  activeRequest = request;
  loginError.hidden = true;
  message.textContent = 'Загружаем заявки…';
  try {
    const response = await fetch(`/api/leads?page=${targetPage}`, {
      headers: { Authorization: `Bearer ${password}` },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(12000)]),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (request.signal.aborted) return;
    page = targetPage;
    login.hidden = true;
    passwordInput.value = '';
    results.hidden = false;
    table.tBodies[0].replaceChildren(...data.leads.map(renderRow));
    table.hidden = !data.leads.length;
    message.textContent = data.leads.length ? '' : 'Заявок пока нет.';
    controls.hidden = page === 0 && !data.hasMore;
    prev.hidden = page === 0;
    next.hidden = !data.hasMore;
  } catch (error) {
    if (request.signal.aborted) return;
    const text = ['TypeError', 'TimeoutError', 'SyntaxError'].includes(error.name) ? 'Не удалось загрузить заявки. Попробуйте ещё раз.' : error.message;
    if (login.hidden) message.textContent = text;
    else {
      loginError.textContent = text;
      loginError.hidden = false;
    }
  }
}

login.addEventListener('submit', event => {
  event.preventDefault();
  password = passwordInput.value.trim();
  loadLeads(0);
});
refresh.addEventListener('click', () => loadLeads(0));
prev.addEventListener('click', () => loadLeads(page - 1));
next.addEventListener('click', () => loadLeads(page + 1));
get('#owner-exit').addEventListener('click', () => {
  activeRequest?.abort();
  password = '';
  table.tBodies[0].replaceChildren();
  results.hidden = true;
  login.hidden = false;
  passwordInput.focus();
});
