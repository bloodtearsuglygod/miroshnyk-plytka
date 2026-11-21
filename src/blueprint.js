import { Color, OrthographicCamera, Vector3 } from 'three';
import { gsap } from 'gsap';
import { decimal, layoutDimensions } from './catalog.js';

const iso = { yaw: 0.65, pitch: 0.75 };
const top = { yaw: 0, pitch: Math.PI / 2 - 0.001 };

export function createBlueprint(canvas, annotations) {
  const ctx = canvas.getContext('2d');
  const labels = annotations.getContext('2d');
  const camera = new OrthographicCamera();
  const point = new Vector3();
  const stencil = new Color('#b1d0ff');
  const angle = { ...iso };
  const geometry = { area: 24 };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const parent = canvas.parentElement;
  let tile;
  let mode = '3d';
  let width = 0;
  let height = 0;
  let drag;

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
    labels.translate((offsetStart[0] + offsetEnd[0]) / 2, (offsetStart[1] + offsetEnd[1]) / 2);
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
    const [roomWidth, roomDepth] = layoutDimensions(geometry.area);
    const halfX = roomWidth / 2;
    const halfZ = roomDepth / 2;
    const span = Math.hypot(roomWidth, roomDepth);
    const aspect = width / height;
    const dynamicZoom = Math.min(1.09, Math.max(0.80, 1 + Math.log10(geometry.area / 24) * 0.14));
    const visibleHeight = span / (Math.min(aspect * 0.76, 0.87) * dynamicZoom);
    const lookAt = new Vector3(0, -span * 0.04, 0);
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
    stencil.set(tile.blueprint);
    for (let index = 0; index < corners.length; index++) {
      const next = (index + 1) % corners.length;
      const [a, b] = rim[index];
      const [c, d] = rim[next];
      const [x, y] = bottom[next];
      if ((c - a) * (y - b) - (d - b) * (x - a) < 0) continue;
      face([rim[index], rim[next], bottom[next], bottom[index]], index % 2 ? '#1a4e9e' : '#103679', '#9fc5ffbb');
    }
    face(rim, stencil.getStyle(), '#e5f0ff', 1.45);

    const stepX = tile.size[0] / 100;
    const stepZ = tile.size[1] / 100;
    const countX = Math.ceil(roomWidth / stepX);
    const countZ = Math.ceil(roomDepth / stepZ);
    if (countX * countZ < 450) {
      ctx.save();
      path(ctx, rim, true);
      ctx.clip();
      for (let column = 0; column < countX; column++) {
        for (let row = 0; row < countZ; row++) {
          const x = -halfX + column * stepX;
          const z = -halfZ + row * stepZ;
          const value = Math.sin(column * 14.47 + row * 35.41);
          path(ctx, [project(x, 0, z), project(x + stepX, 0, z), project(x + stepX, 0, z + stepZ), project(x, 0, z + stepZ)], true);
          ctx.fillStyle = value < 0 ? `rgb(13 57 130 / ${-value * 0.13})` : `rgb(248 252 255 / ${value * 0.20})`;
          ctx.fill();
        }
      }
      ctx.restore();
    }
    for (let i = Math.max(1, Math.ceil(countX / 110)); i < countX; i += Math.max(1, Math.ceil(countX / 110))) {
      const x = -halfX + i * stepX;
      line(ctx, [project(x, 0, -halfZ), project(x, 0, halfZ)], '#25559d9e', .85);
    }
    for (let i = Math.max(1, Math.ceil(countZ / 110)); i < countZ; i += Math.max(1, Math.ceil(countZ / 110))) {
      const z = -halfZ + i * stepZ;
      line(ctx, [project(-halfX, 0, z), project(halfX, 0, z)], '#25559d9e', .85);
    }
    path(ctx, rim, true);
    ctx.lineWidth = 1.45;
    ctx.strokeStyle = '#e5f0ff';
    ctx.stroke();

    const offset = span * (width < 500 ? 0.105 : 0.085);
    const frontZ = Math.cos(angle.yaw) >= 0 ? halfZ : -halfZ;
    const frontX = Math.sin(angle.yaw) >= 0 ? halfX : -halfX;
    const outerZ = frontZ + Math.sign(frontZ) * offset;
    const outerX = frontX + Math.sign(frontX) * offset;
    drawDimension(project(-halfX, 0, frontZ), project(halfX, 0, frontZ), project(-halfX, 0, outerZ), project(halfX, 0, outerZ), `${decimal.format(roomWidth)} м`);
    drawDimension(project(frontX, 0, -halfZ), project(frontX, 0, halfZ), project(outerX, 0, -halfZ), project(outerX, 0, halfZ), `${decimal.format(roomDepth)} м`);
    drawAxes();
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
    if (mode !== '3d' || event.button !== 0) return;
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

  return {
    setView,
    update(nextTile, area) {
      tile = nextTile;
      if (reduceMotion.matches || geometry.area === area) {
        geometry.area = area;
        render();
        return;
      }
      gsap.to(geometry, { area, duration: .36, overwrite: true, ease: 'power2.out', onUpdate: render });
    },
  };
}
