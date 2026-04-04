'use client';

import { useEffect, useRef } from 'react';

interface Hex {
  x: number;
  baseY: number;
  size: number;
  phase: number;
  speed: number;
  opacity: number;
}

export function HexBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let hexagons: Hex[] = [];

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      init(rect.width, rect.height);
    };

    const init = (w: number, h: number) => {
      hexagons = [];
      const gap = 52;
      const rows = Math.ceil(h / (gap * 0.75)) + 2;
      const cols = Math.ceil(w / gap) + 2;

      for (let r = -1; r < rows; r++) {
        for (let c = -1; c < cols; c++) {
          hexagons.push({
            x: c * gap + (r % 2) * (gap / 2),
            baseY: r * gap * 0.75,
            size: 10 + Math.random() * 6,
            phase: Math.random() * Math.PI * 2,
            speed: 0.25 + Math.random() * 0.4,
            opacity: 0.12 + Math.random() * 0.18,
          });
        }
      }
    };

    const hexPath = (cx: number, cy: number, s: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = cx + s * Math.cos(a);
        const py = cy + s * Math.sin(a);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    const draw = (time: number) => {
      const t = time * 0.001;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      // Radial glow at top center
      const grd = ctx.createRadialGradient(w / 2, 0, 0, w / 2, 0, w * 0.6);
      grd.addColorStop(0, 'rgba(245, 158, 11, 0.07)');
      grd.addColorStop(0.5, 'rgba(245, 158, 11, 0.02)');
      grd.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);

      for (const hex of hexagons) {
        const wave = Math.sin(t * hex.speed + hex.phase) * 10;
        const dy = hex.baseY + wave;

        // Vertical fade — strongest at center, fades at edges
        const centerDist = Math.abs(dy - h * 0.4) / (h * 0.45);
        const fade = Math.max(0, 1 - centerDist * centerDist);
        const alpha = hex.opacity * fade;

        if (alpha < 0.01) continue;

        hexPath(hex.x, dy, hex.size);
        ctx.strokeStyle = `rgba(245, 158, 11, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      animationId = requestAnimationFrame(draw);
    };

    resize();
    animationId = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
