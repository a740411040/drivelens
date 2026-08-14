"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  signalDefinitions,
  type Incident,
  type SignalKey,
  type TelemetryPoint,
} from "../lib/demo-data";

function formatSignal(point: TelemetryPoint, key: SignalKey) {
  const definition = signalDefinitions.find((item) => item.key === key);
  const value = point[key];
  return `${value.toFixed(2)}${definition?.unit ? ` ${definition.unit}` : ""}`;
}

export default function SignalChart({ incident, activeSignals }: { incident: Incident; activeSignals: SignalKey[] }) {
  const hasTelemetry = incident.telemetry.length > 0;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [cursorTime, setCursorTime] = useState(0);

  const cursorPoint = useMemo(
    () => hasTelemetry ? incident.telemetry.reduce((closest, point) =>
      Math.abs(point.t - cursorTime) < Math.abs(closest.t - cursorTime) ? point : closest,
    ) : null,
    [cursorTime, hasTelemetry, incident.telemetry],
  );


  useEffect(() => {
    if (!hasTelemetry || !cursorPoint) return;
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = frame.clientWidth;
      const laneMinHeight = 66;
      const height = Math.max(244, activeSignals.length * laneMinHeight + 30);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const left = 92;
      const right = 18;
      const top = 8;
      const bottom = 24;
      const plotWidth = width - left - right;
      const plotHeight = height - top - bottom;
      const laneHeight = plotHeight / activeSignals.length;
      const minT = incident.telemetry[0].t;
      const maxT = incident.telemetry[incident.telemetry.length - 1].t;
      const xAt = (t: number) => left + ((t - minT) / (maxT - minT)) * plotWidth;
      context.font = "12px system-ui, sans-serif";
      context.textBaseline = "middle";

      activeSignals.forEach((key, laneIndex) => {
        const definition = signalDefinitions.find((item) => item.key === key);
        if (!definition) return;
        const values = incident.telemetry.map((point) => point[key]);
        const rawMin = Math.min(...values);
        const rawMax = Math.max(...values);
        const valueRange = rawMax - rawMin;
        const padding = Math.max(valueRange * 0.14, 0.05);
        const min = rawMin - padding;
        const max = rawMax + padding;
        const laneTop = top + laneIndex * laneHeight;
        const yAt = (value: number) => laneTop + laneHeight - 12 - ((value - min) / Math.max(max - min, 0.001)) * (laneHeight - 24);

        // Lane background with alternating shades
        context.fillStyle = laneIndex % 2 === 0 ? "rgba(0, 180, 255, 0.025)" : "rgba(0, 0, 0, 0.18)";
        context.fillRect(left, laneTop, plotWidth, laneHeight - 2);

        // Colored left border for signal identification
        context.fillStyle = definition.color;
        context.globalAlpha = 0.55;
        context.fillRect(left, laneTop, 3, laneHeight - 2);
        context.globalAlpha = 1;

        // Lane separator
        context.strokeStyle = "rgba(255, 255, 255, 0.06)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(left, laneTop + laneHeight - 2);
        context.lineTo(width - right, laneTop + laneHeight - 2);
        context.stroke();

        // Signal label with color dot
        context.fillStyle = definition.color;
        context.beginPath();
        context.arc(12, laneTop + 15, 3.5, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "rgba(232, 236, 244, 0.92)";
        context.font = "600 12px system-ui, sans-serif";
        context.fillText(definition.label, 22, laneTop + 16);

        // Min/max range display
        context.fillStyle = "rgba(139, 155, 180, 0.7)";
        context.font = "11px ui-monospace, monospace";
        const rangeText = valueRange < 0.001
          ? `${rawMax.toFixed(2)} (恒定)`
          : `${rawMax.toFixed(2)} / ${rawMin.toFixed(2)}`;
        context.fillText(rangeText, 22, laneTop + 33);
        context.font = "12px system-ui, sans-serif";

        // Curve with glow for better visibility
        context.save();
        context.shadowColor = definition.color;
        context.shadowBlur = 6;
        context.strokeStyle = definition.color;
        context.lineWidth = 2.6;
        context.lineJoin = "round";
        context.lineCap = "round";
        context.beginPath();
        incident.telemetry.forEach((point, index) => {
          const x = xAt(point.t);
          const y = yAt(point[key]);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();
        context.restore();
      });

      const triggerX = xAt(0);
      context.strokeStyle = "#ff4757";
      context.lineWidth = 1.4;
      context.setLineDash([5, 4]);
      context.beginPath();
      context.moveTo(triggerX, top);
      context.lineTo(triggerX, height - bottom);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#ff4757";
      context.font = "700 11px system-ui, sans-serif";
      context.fillText("触发点 t=0", triggerX + 6, 13);

      const cursorX = xAt(cursorPoint.t);
      context.strokeStyle = "rgba(0, 180, 255, 0.5)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(cursorX, top);
      context.lineTo(cursorX, height - bottom);
      context.stroke();

      context.fillStyle = "rgba(139, 155, 180, 0.6)";
      context.font = "11px ui-monospace, monospace";
      [-20, -10, 0, 10, 20].forEach((tick) => context.fillText(`${tick > 0 ? "+" : ""}${tick}s`, xAt(tick) - 9, height - 8));
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [activeSignals, cursorPoint, incident, hasTelemetry]);

  if (!hasTelemetry || !cursorPoint) {
    return (
      <div className="chart-frame chart-empty">
        <div className="chart-placeholder">
          <strong>真实案例无原始时序数据</strong>
          <small>事实检查观测窗口已在下方时间线中展示</small>
        </div>
      </div>
    );
  }

  const moveCursor = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const left = 92;
    const right = 18;
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left - left) / (bounds.width - left - right)));
    const minT = incident.telemetry[0].t;
    const maxT = incident.telemetry[incident.telemetry.length - 1].t;
    setCursorTime(Math.round(minT + ratio * (maxT - minT)));
  };

  return (
    <div className="chart-frame" ref={frameRef}>
      <div className="cursor-readout" aria-live="polite">
        <span className="cursor-time">t={cursorPoint.t > 0 ? "+" : ""}{cursorPoint.t}s</span>
        {activeSignals.map((key) => {
          const definition = signalDefinitions.find((item) => item.key === key);
          return <span key={key}><i style={{ background: definition?.color }} />{definition?.label} {formatSignal(cursorPoint, key)}</span>;
        })}
      </div>
      <canvas ref={canvasRef} onPointerMove={moveCursor} aria-label={`${incident.title}的同步时序曲线`} />
    </div>
  );
}
