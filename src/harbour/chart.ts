import type { HarbourReport } from './session';
import type { HarbourWorld } from './world';

/** Debrief chart: coastline, depth, marks, and the track. North is up. */
export function drawHarbourChart(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  world: HarbourWorld,
  track: { x: number; y: number }[],
  boat: { x: number; y: number },
  report: HarbourReport,
): void {
  const course = world.course;
  const pts = track.filter((p) => Number.isFinite(p.x));
  let minX = Math.min(course.dogleg.x, course.marks[0].x, course.marks[1].x, boat.x);
  let maxX = Math.max(course.dogleg.x, course.marks[0].x, course.marks[1].x, boat.x);
  let minY = Math.min(course.cleat.y, course.marks[0].y, boat.y);
  let maxY = Math.max(course.marks[0].y, course.marks[1].y, boat.y);
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const span = Math.max(180, maxX - minX, maxY - minY) * 1.25;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const left = cx - span / 2;
  const bottom = cy - span / 2;
  const mapX = (x: number) => ((x - left) / span) * (w - 36) + 18;
  const mapY = (y: number) => h - 18 - ((y - bottom) / span) * (h - 36);

  ctx.fillStyle = '#071820';
  ctx.fillRect(0, 0, w, h);
  const cols = 36;
  const rows = 28;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = left + ((i + 0.5) / cols) * span;
      const y = bottom + ((j + 0.5) / rows) * span;
      const depth = world.depth.depthAt(x, y);
      ctx.fillStyle = depthColor(depth);
      const x0 = mapX(left + (i / cols) * span);
      const y0 = mapY(bottom + ((j + 1) / rows) * span);
      ctx.fillRect(x0, y0, (w - 36) / cols + 1, (h - 36) / rows + 1);
    }
  }

  strokePoly(ctx, world.extract.coastline.flatMap((l) => l.pts), mapX, mapY, '#d7c4a3', 1.5, false);
  for (const line of world.extract.breakwaters) {
    strokePoly(ctx, line.pts, mapX, mapY, '#5c6560', 3, line.closed);
  }
  for (const light of world.lights) {
    ctx.fillStyle = light.colour === 'green' ? '#3dd68c' : '#e15b4c';
    ctx.beginPath();
    ctx.arc(mapX(light.x), mapY(light.y), 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffd15c';
  for (const mark of course.marks) {
    ctx.beginPath();
    ctx.arc(mapX(mark.x), mapY(mark.y), 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#9ef0b0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  let drawing = false;
  for (const p of track) {
    if (!Number.isFinite(p.x)) {
      drawing = false;
      continue;
    }
    const x = mapX(p.x);
    const y = mapY(p.y);
    if (!drawing) {
      ctx.moveTo(x, y);
      drawing = true;
    } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(mapX(boat.x), mapY(boat.y), 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f4f7f8';
  ctx.font = '13px Segoe UI, sans-serif';
  ctx.fillText('N', 22, 28);
  ctx.beginPath();
  ctx.moveTo(26, 34);
  ctx.lineTo(26, 58);
  ctx.strokeStyle = '#f4f7f8';
  ctx.stroke();
  const bar = (100 / span) * (w - 36);
  ctx.fillRect(w - 18 - bar, h - 28, bar, 3);
  ctx.fillText('100 m', w - 18 - bar, h - 34);
  ctx.fillText(report.wind, 18, h - 16);
}

function depthColor(depth: number): string {
  if (depth <= 0.15) return '#cbb892';
  if (depth < 2) return '#1f8f86';
  if (depth < 6) return '#146a78';
  if (depth < 15) return '#0c4a60';
  return '#082838';
}

function strokePoly(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  mapX: (x: number) => number,
  mapY: (y: number) => number,
  color: string,
  width: number,
  close: boolean,
): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(mapX(pts[0].x), mapY(pts[0].y));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(mapX(pts[i].x), mapY(pts[i].y));
  if (close) ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
