import { OrthographicCamera, Vector3 } from 'three';
import { gsap } from 'gsap';
import { areaLimits, decimal, layoutDimensions, minimumSide } from './catalog.js';

const iso = { yaw: 0.65, pitch: 0.75 };
const top = { yaw: 0, pitch: Math.PI / 2 - 0.001 };
const defaultLayout = layoutDimensions(24);
const defaultSpan = Math.hypot(defaultLayout.width, defaultLayout.depth);
const tilePixels = 128;
const grout = '#121212';

export function createBlueprint(canvas, annotations, onResize) {
  const ctx = canvas.getContext('2d');
  const labels = annotations.getContext('2d');
  const camera = new OrthographicCamera();
  const point = new Vector3();
  const angle = { ...iso };
  const geometry = { ...defaultLayout };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const parent = canvas.parentElement;
  const handles = [...parent.querySelectorAll('[data-resize]')];
  const handleVectors = new Map();
  const patterns = new Map();
  let tile;
  let mode = '3d';
  let width = 0;
  let height = 0;
  let drag;
  let sizeDrag;
  let framedSpan;

  function project(x, y, z) {
    point.set(x, y, z).project(camera);
    return [(point.x / 2 + 0.5) * width, (0.5 - point.y / 2) * height];
  }

  function path(context, vertices, closed = false) {
    context.beginPath();
    context.moveTo(...vertices[0]);
    for (const vertex of vertices.slice(1)) context.lineTo(...vertex);
    if (closed) context.closePath();
  }

  function line(context, vertices, color, lineWidth = 1) {
    path(context, vertices);
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.stroke();
  }

  function face(vertices, fill, stroke, lineWidth = 1) {
    path(ctx, vertices, true);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  function tilePattern(material) {
    if (patterns.has(material.id)) return patterns.get(material.id);
    const surface = document.createElement('canvas');
    surface.width = surface.height = tilePixels * 2;
    const paint = surface.getContext('2d');

    function makePattern(image) {
      paint.fillStyle = material.fallbackColor;
      paint.fillRect(0, 0, surface.width, surface.height);
      if (image) {
        // Mirroring the sample changes adjacent tiles while keeping the same material.
        for (let row = 0; row < 2; row++) {
          for (let column = 0; column < 2; column++) {
            paint.save();
            paint.translate((column ? 2 : 0) * tilePixels, (row ? 2 : 0) * tilePixels);
            paint.scale(column ? -1 : 1, row ? -1 : 1);
            paint.drawImage(image, 0, 0, tilePixels, tilePixels);
            paint.restore();
          }
        }
      }
      paint.fillStyle = grout;
      for (const offset of [0, tilePixels - 2, 2 * tilePixels - 2]) {
        const lineSize = offset === tilePixels - 2 ? 4 : 2;
        paint.fillRect(offset, 0, lineSize, surface.height);
        paint.fillRect(0, offset, surface.width, lineSize);
      }
      const pattern = ctx.createPattern(surface, 'repeat');
      patterns.set(material.id, pattern);
      return pattern;
    }

    const sample = new Image();
    sample.addEventListener('load', () => {
      makePattern(sample);
      if (tile?.id === material.id) render();
    });
    sample.src = `./textures/${material.id}.jpg`;
    return makePattern();
  }

  function drawTiles(rim, roomWidth, roomDepth) {
    const stepX = tile.size[0] / 100;
    const stepZ = tile.size[1] / 100;
    const [origin, right, , bottom] = rim;
    const across = stepX / (roomWidth * tilePixels);
    const down = stepZ / (roomDepth * tilePixels);
    ctx.save();
    ctx.transform((right[0] - origin[0]) * across, (right[1] - origin[1]) * across,
      (bottom[0] - origin[0]) * down, (bottom[1] - origin[1]) * down, origin[0], origin[1]);
    ctx.fillStyle = tilePattern(tile);
    ctx.fillRect(0, 0, roomWidth / stepX * tilePixels, roomDepth / stepZ * tilePixels);
    ctx.restore();

    const columns = Math.ceil(roomWidth / stepX);
    const rows = Math.ceil(roomDepth / stepZ);
    path(ctx, rim, true);
    if (columns + rows <= 320) {
      // Draw crisp black seams over the texture when tiles are individually visible.
      for (let column = 1; column < columns; column++) {
        const x = column * stepX - roomWidth / 2;
        ctx.moveTo(...project(x, 0, -roomDepth / 2));
        ctx.lineTo(...project(x, 0, roomDepth / 2));
      }
      for (let row = 1; row < rows; row++) {
        const z = row * stepZ - roomDepth / 2;
        ctx.moveTo(...project(-roomWidth / 2, 0, z));
        ctx.lineTo(...project(roomWidth / 2, 0, z));
      }
    }
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = grout;
    ctx.stroke();
  }

  function handleRange(axis, dimensions) {
    const other = axis === 'width' ? dimensions.depth : dimensions.width;
    return [Math.max(minimumSide, areaLimits.min / other), areaLimits.max / other];
  }

  function positionHandle(handle, edge, direction) {
    const axis = handle.dataset.resize;
    const [min, max] = handleRange(axis, geometry);
    const center = project(0, 0, 0);
    const vx = direction[0] - center[0];
    const vy = direction[1] - center[1];
    const length = Math.hypot(vx, vy);
    const rotation = Math.atan2(vy, vx);
    const offset = 9;
    const x = Math.max(22, Math.min(width - 22, edge[0] + offset * vx / length));
    const y = Math.max(22, Math.min(height - 22, edge[1] + offset * vy / length));
    const cursor = Math.round(rotation / (Math.PI / 4));
    handleVectors.set(handle, { vx, vy, length });
    handle.style.left = `${x}px`;
    handle.style.top = `${y}px`;
    handle.style.setProperty('--handle-angle', `${rotation}rad`);
    handle.style.setProperty('--resize-cursor', ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][(cursor + 4) % 4]);
    handle.setAttribute('aria-valuemin', String(min));
    handle.setAttribute('aria-valuemax', String(max));
    handle.setAttribute('aria-valuenow', String(geometry[axis]));
    handle.setAttribute('aria-valuetext', `${decimal.format(geometry[axis])} м`);
    handle.hidden = false;
  }

  function changeDimension(axis, initial, value) {
    const [min, max] = handleRange(axis, initial);
    const step = Math.round(value * 100) / 100;
    onResize({ ...initial, [axis]: Math.min(max, Math.max(min, step)) });
  }

  function drawDimension(start, end, offsetStart, offsetEnd, value) {
    const color = '#c0d8ffb5';
    const dx = offsetEnd[0] - offsetStart[0];
    const dy = offsetEnd[1] - offsetStart[1];
    const span = Math.hypot(dx, dy);
    if (span < 32) return;
    line(labels, [start, offsetStart], '#c0d8ff73');
    line(labels, [end, offsetEnd], '#c0d8ff73');
    line(labels, [offsetStart, offsetEnd], color);
    for (const endpoint of [offsetStart, offsetEnd]) {
      const tick = [(-dx + dy) * 3.5 / span, (-dy - dx) * 3.5 / span];
      line(labels, [[endpoint[0] - tick[0], endpoint[1] - tick[1]], [endpoint[0] + tick[0], endpoint[1] + tick[1]]], '#e5efff');
    }
    let rotation = Math.atan2(dy, dx);
    if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
    labels.save();
    labels.translate(offsetStart[0] + dx * .42, offsetStart[1] + dy * .42);
    labels.rotate(rotation);
    labels.font = '600 12px Consolas, monospace';
    labels.textAlign = 'center';
    labels.textBaseline = 'middle';
    const textWidth = labels.measureText(value).width + 14;
    labels.fillStyle = '#174391';
    labels.fillRect(-textWidth / 2, -8, textWidth, 16);
    labels.fillStyle = '#e7f0ff';
    labels.fillText(value, 0, 0);
    labels.restore();
  }

  function drawAxes() {
    const base = [39, height - 35];
    const x = [57, height - 31];
    const z = [26, height - 27];
    const y = [39, height - 52];
    const color = '#9dbff9';
    line(labels, [z, base, x], color);
    line(labels, [base, y], color);
    labels.fillStyle = color;
    labels.font = '10px Consolas, monospace';
    labels.fillText('X', x[0] + 4, x[1] + 3);
    labels.fillText('Y', z[0] - 8, z[1] + 1);
    labels.fillText('Z', y[0] - 3, y[1] - 4);
  }

  function render() {
    if (!width || !height || !tile) return;
    ctx.clearRect(0, 0, width, height);
    labels.clearRect(0, 0, width, height);
    const { width: roomWidth, depth: roomDepth } = geometry;
    const halfX = roomWidth / 2;
    const halfZ = roomDepth / 2;
    const span = Math.hypot(roomWidth, roomDepth);
    const aspect = width / height;
    // Keep the scale fixed during the gesture so the drawing grows under the pointer.
    framedSpan = sizeDrag?.framedSpan ?? Math.max(Math.min(defaultSpan, span * 1.55), span * .92);
    const visibleHeight = framedSpan / Math.min(aspect * .71, .80);
    const lookAt = new Vector3(0, -framedSpan * .035, 0);
    const horizontal = span * Math.cos(angle.pitch) * 2;
    camera.left = -visibleHeight * aspect / 2;
    camera.right = -camera.left;
    camera.top = visibleHeight / 2;
    camera.bottom = -camera.top;
    camera.near = 0.001;
    camera.far = span * 10;
    camera.position.set(horizontal * Math.sin(angle.yaw), span * Math.sin(angle.pitch) * 2, horizontal * Math.cos(angle.yaw)).add(lookAt);
    camera.lookAt(lookAt);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    const corners = [[-halfX, -halfZ], [halfX, -halfZ], [halfX, halfZ], [-halfX, halfZ]];
    const slabDepth = -span * 0.025;
    const rim = corners.map(([x, z]) => project(x, 0, z));
    const bottom = corners.map(([x, z]) => project(x, slabDepth, z));
    const shadow = corners.map(([x, z]) => project(x * 1.045, slabDepth * 2.1, z * 1.045));
    face(shadow, '#07265c65', '#8ab5ff44');
    for (let index = 0; index < corners.length; index++) {
      const next = (index + 1) % corners.length;
      const [a, b] = rim[index];
      const [c, d] = rim[next];
      const [x, y] = bottom[next];
      if ((c - a) * (y - b) - (d - b) * (x - a) < 0) continue;
      face([rim[index], rim[next], bottom[next], bottom[index]], index % 2 ? '#1a4e9e' : '#103679', '#9fc5ffbb');
    }
    drawTiles(rim, roomWidth, roomDepth);

    const offset = framedSpan * (width < 500 ? .15 : .11);
    const frontZ = Math.cos(angle.yaw) >= 0 ? halfZ : -halfZ;
    const frontX = Math.sin(angle.yaw) >= 0 ? halfX : -halfX;
    const outerZ = frontZ + Math.sign(frontZ) * offset;
    const outerX = frontX + Math.sign(frontX) * offset;
    drawDimension(project(-halfX, 0, frontZ), project(halfX, 0, frontZ), project(-halfX, 0, outerZ), project(halfX, 0, outerZ), `${decimal.format(roomWidth)} м`);
    drawDimension(project(frontX, 0, -halfZ), project(frontX, 0, halfZ), project(outerX, 0, -halfZ), project(outerX, 0, halfZ), `${decimal.format(roomDepth)} м`);
    drawAxes();
    for (const handle of handles) {
      if (handle.dataset.resize === 'width') positionHandle(handle, project(frontX, 0, 0), project(Math.sign(frontX), 0, 0));
      else positionHandle(handle, project(0, 0, frontZ), project(0, 0, Math.sign(frontZ)));
    }
  }

  function resize() {
    const bounds = parent.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    for (const [element, context] of [[canvas, ctx], [annotations, labels]]) {
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    render();
  }

  function setView(value) {
    mode = value;
    parent.classList.toggle('is-top', mode === 'top');
    const target = mode === 'top' ? top : iso;
    gsap.to(angle, { ...target, duration: reduceMotion.matches ? 0 : .48, overwrite: true, ease: 'power2.inOut', onUpdate: render });
  }

  new ResizeObserver(resize).observe(parent);
  canvas.addEventListener('pointerdown', event => {
    if (mode !== '3d' || sizeDrag || event.button !== 0) return;
    gsap.killTweensOf(angle);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, ...angle };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (mode !== '3d' || drag?.id !== event.pointerId) return;
    angle.yaw = (drag.yaw - (event.clientX - drag.x) * .011) % (2 * Math.PI);
    angle.pitch = Math.max(.32, Math.min(1.45, drag.pitch + (event.clientY - drag.y) * .008));
    render();
  });
  canvas.addEventListener('lostpointercapture', () => { drag = undefined; });

  for (const handle of handles) {
    const axis = handle.dataset.resize;
    handle.addEventListener('pointerdown', event => {
      if (sizeDrag || drag || event.button !== 0) return;
      gsap.killTweensOf(geometry);
      for (const tween of gsap.getTweensOf(angle)) tween.progress(1);
      sizeDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, initial: { width: geometry.width, depth: geometry.depth }, framedSpan, ...handleVectors.get(handle) };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (sizeDrag?.id !== event.pointerId) return;
      const { x, y, vx, vy, length, initial } = sizeDrag;
      const delta = ((event.clientX - x) * vx + (event.clientY - y) * vy) / (length * length);
      changeDimension(axis, initial, initial[axis] + 2 * delta);
    });
    handle.addEventListener('lostpointercapture', event => {
      if (sizeDrag?.id !== event.pointerId) return;
      sizeDrag = undefined;
      render();
    });
    handle.addEventListener('keydown', event => {
      const step = event.shiftKey ? .5 : .1;
      const [min, max] = handleRange(axis, geometry);
      const actions = { ArrowUp: geometry[axis] + step, ArrowRight: geometry[axis] + step, ArrowDown: geometry[axis] - step, ArrowLeft: geometry[axis] - step, Home: min, End: max };
      if (!Object.hasOwn(actions, event.key)) return;
      event.preventDefault();
      changeDimension(axis, { width: geometry.width, depth: geometry.depth }, actions[event.key]);
    });
  }

  return {
    setView,
    update(nextTile, dimensions, animate) {
      tile = nextTile;
      if (!animate || reduceMotion.matches || (geometry.width === dimensions.width && geometry.depth === dimensions.depth)) {
        gsap.killTweensOf(geometry);
        Object.assign(geometry, dimensions);
        render();
        return;
      }
      gsap.to(geometry, { ...dimensions, duration: .36, overwrite: true, ease: 'power2.out', onUpdate: render });
    },
  };
}
