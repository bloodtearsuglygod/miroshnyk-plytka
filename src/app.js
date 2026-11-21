import { gsap } from 'gsap';
import { areaLimits, calculate, currency, decimal, layoutDimensions, money, parseArea, tiles } from './catalog.js';
import { createBlueprint } from './blueprint.js';

const get = selector => document.querySelector(selector);
const areaInput = get('#area');
const reserveInput = get('#reserve');
const quoteButton = get('#quote-button');
const areaError = get('#area-error');
const dialog = get('#quote-dialog');
const form = get('#quote-form');
const formError = get('#form-error');
const success = get('#quote-success');
const leadEndpoint = get('meta[name="lead-endpoint"]').content;
const submit = form.querySelector('button[type="submit"]');
const viewButtons = document.querySelectorAll('[data-view]');
let tile = tiles[0];
let lastArea = 24;
let lastDimensions = layoutDimensions(lastArea);
let view = '3d';
let quote;
let lastSubmission;

const icon = name => `<svg aria-hidden="true"><use href="#icon-${name}"/></svg>`;
const areaValue = value => decimal.format(value).replace(/\s/g, '');
const blueprint = createBlueprint(get('#model'), get('#annotations'), dimensions => {
  areaInput.value = areaValue(dimensions.width * dimensions.depth);
  update({ dimensions, animate: false });
});
get('#tile-list').innerHTML = tiles.map((item, index) => `
  <label class="tile" title="${item.finish}">
    <input type="radio" name="tile" value="${item.id}" ${index === 0 ? 'checked' : ''}>
    <img src="./textures/${item.id}.jpg" alt="" width="360" height="150">
    <span class="tile-check">${icon('check')}</span>
    <span class="tile-label"><span class="tile-name">${item.name}</span><span class="tile-meta"><span>${item.size.join(' × ')} см</span><span class="tile-price">${money.format(item.price)}/м²</span></span></span>
  </label>`).join('');

function update({ showError = false, dimensions, animate = true } = {}) {
  const area = parseArea(areaInput.value);
  areaError.hidden = area !== null || !showError;
  areaInput.setAttribute('aria-invalid', String(!areaError.hidden));
  quoteButton.disabled = area === null;
  if (area === null) {
    get('#area-tag').textContent = 'Площадь не задана';
    get('#estimate-detail').textContent = 'Укажите площадь';
    get('#estimate-total').textContent = '—';
    blueprint.update(tile, lastDimensions, animate);
    return;
  }

  if (dimensions) lastDimensions = dimensions;
  else if (area !== lastArea) lastDimensions = layoutDimensions(area, lastDimensions.width / lastDimensions.depth);
  lastArea = area;
  const estimate = calculate(tile, area, reserveInput.checked);
  get('#area-tag').textContent = `${decimal.format(area)} м²`;
  get('#estimate-detail').textContent = `${decimal.format(estimate.billedArea)} м² × ${money.format(tile.price)}`;
  get('#estimate-total').textContent = money.format(estimate.total);
  blueprint.update(tile, lastDimensions, animate);
}

get('#tile-list').addEventListener('change', event => {
  tile = tiles.find(item => item.id === event.target.value) ?? tiles[0];
  update({ showError: true });
});
areaInput.addEventListener('input', () => update());
areaInput.addEventListener('change', () => update({ showError: true }));
areaInput.addEventListener('blur', () => update({ showError: true }));
reserveInput.addEventListener('change', () => update({ showError: true }));
document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
  const next = (parseArea(areaInput.value) ?? lastArea) + Number(button.dataset.step);
  areaInput.value = areaValue(Math.min(areaLimits.max, Math.max(areaLimits.min, next)));
  update();
}));

function setView(nextView) {
  view = nextView;
  for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === view));
  get('#drawing-mode').textContent = view === '3d' ? 'Изометрия' : 'План сверху';
  get('#view-hint').textContent = view === '3d' ? 'Перетащите чертёж для поворота' : 'Ортогональная проекция';
  blueprint.setView(view);
}

viewButtons.forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
get('.reset').addEventListener('click', () => setView('3d'));

quoteButton.addEventListener('click', () => {
  const area = parseArea(areaInput.value);
  if (area === null) return;
  quote = { tileId: tile.id, area, reserve: reserveInput.checked, currency };
  const estimate = calculate(tile, area, quote.reserve);
  const reserveLabel = quote.reserve ? ` · ${decimal.format(estimate.billedArea)} м² с запасом` : '';
  get('#quote-summary').textContent = `${tile.name} · ${decimal.format(area)} м²${reserveLabel} · ${money.format(estimate.total)}`;
  formError.hidden = true;
  form.hidden = false;
  success.hidden = true;
  dialog.setAttribute('aria-labelledby', 'quote-title');
  dialog.showModal();
  get('#customer-name').focus();
});

function closeQuote() {
  if (!submit.disabled) dialog.close();
}

get('.close').addEventListener('click', closeQuote);
get('.success-close').addEventListener('click', closeQuote);
dialog.addEventListener('cancel', event => {
  if (submit.disabled) event.preventDefault();
});
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const { top, right, bottom, left } = dialog.getBoundingClientRect();
  if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) closeQuote();
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  const fields = Object.fromEntries(new FormData(form));
  const payload = { ...quote, ...fields };
  payload.consent = fields.consent === 'on';
  const snapshot = JSON.stringify(payload);
  if (lastSubmission?.snapshot !== snapshot) lastSubmission = { snapshot, id: crypto.randomUUID() };
  formError.hidden = true;
  submit.disabled = true;
  submit.textContent = 'Отправляем…';
  try {
    const response = await fetch(leadEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, id: lastSubmission.id }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Не удалось отправить заявку. Попробуйте ещё раз.');
    form.reset();
    form.hidden = true;
    success.hidden = false;
    success.querySelector('h2').id = 'success-title';
    dialog.setAttribute('aria-labelledby', 'success-title');
    get('#success-message').textContent = `Номер ${result.id.slice(0, 8).toUpperCase()}. Владелец получил расчёт и сможет связаться с вами по указанному номеру.`;
    get('.success-close').focus();
    lastSubmission = undefined;
  } catch (error) {
    formError.textContent = ['TypeError', 'TimeoutError', 'SyntaxError'].includes(error.name) ? 'Нет ответа от сервера. Попробуйте отправить ещё раз.' : error.message;
    formError.hidden = false;
  } finally {
    submit.disabled = false;
    submit.innerHTML = `Отправить заявку ${icon('send')}`;
  }
});

update();
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  gsap.from('.drawing, .settings', { y: 9, opacity: .82, duration: .5, stagger: .05, ease: 'power2.out', clearProps: 'transform,opacity' });
}
