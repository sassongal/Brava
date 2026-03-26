import { useState, useRef, useEffect, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { saveScreenshotRegion, cancelScreenshot, copyScreenshotToClipboard } from "../lib/tauri";

type Tool = "select" | "arrow" | "rect" | "draw" | "text";

const COLORS = ["#BF4646", "#3D9970", "#3B82F6", "#F59E0B", "#8B5CF6", "#FFFFFF"];

export function ScreenshotEditor() {
  // Parse image path from URL
  const params = new URLSearchParams(window.location.search);
  const imagePath = decodeURIComponent(params.get("image") || "");
  const imageUrl = convertFileSrc(imagePath);

  // State
  const [phase, setPhase] = useState<"selecting" | "annotating">("selecting");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [selecting, setSelecting] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [selection, setSelection] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("arrow");
  const [activeColor, setActiveColor] = useState(COLORS[0]);
  const [drawing, setDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [saving, setSaving] = useState(false);

  // Track mouse for crosshair
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    if (selecting) {
      const x = Math.min(startPos.x, e.clientX);
      const y = Math.min(startPos.y, e.clientY);
      const w = Math.abs(e.clientX - startPos.x);
      const h = Math.abs(e.clientY - startPos.y);
      setSelection({ x, y, w, h });
    }
  }, [selecting, startPos]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (phase === "selecting") {
      setSelecting(true);
      setStartPos({ x: e.clientX, y: e.clientY });
      setSelection(null);
    } else if (phase === "annotating" && canvasRef.current) {
      setDrawing(true);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx || !selection) return;
      const rx = e.clientX - selection.x;
      const ry = e.clientY - selection.y;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = activeTool === "draw" ? 3 : 2;
      ctx.lineCap = "round";
    }
  }, [phase, selection, activeColor, activeTool]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (phase === "selecting" && selecting) {
      setSelecting(false);
      if (selection && selection.w > 10 && selection.h > 10) {
        setPhase("annotating");
        // Initialize annotation canvas
        setTimeout(() => {
          if (canvasRef.current && selection) {
            canvasRef.current.width = selection.w;
            canvasRef.current.height = selection.h;
          }
        }, 50);
      }
    }
    if (phase === "annotating") {
      setDrawing(false);
      if (canvasRef.current && selection) {
        const ctx = canvasRef.current.getContext("2d");
        if (!ctx) return;
        const rx = e.clientX - selection.x;
        const ry = e.clientY - selection.y;

        if (activeTool === "arrow") {
          // Draw arrow from start to end
          const startRx = (startPos.x || e.clientX) - selection.x;
          const startRy = (startPos.y || e.clientY) - selection.y;
          ctx.beginPath();
          ctx.moveTo(startRx, startRy);
          ctx.lineTo(rx, ry);
          ctx.stroke();
          // Arrowhead
          const angle = Math.atan2(ry - startRy, rx - startRx);
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 12 * Math.cos(angle - 0.4), ry - 12 * Math.sin(angle - 0.4));
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 12 * Math.cos(angle + 0.4), ry - 12 * Math.sin(angle + 0.4));
          ctx.stroke();
        } else if (activeTool === "rect") {
          const startRx = (startPos.x || e.clientX) - selection.x;
          const startRy = (startPos.y || e.clientY) - selection.y;
          ctx.strokeRect(startRx, startRy, rx - startRx, ry - startRy);
        }
      }
    }
    setStartPos({ x: e.clientX, y: e.clientY });
  }, [phase, selecting, selection, activeTool, startPos]);

  // Canvas mouse move for freehand drawing
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing || !canvasRef.current || !selection) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    if (activeTool === "draw") {
      const rx = e.clientX - selection.x;
      const ry = e.clientY - selection.y;
      ctx.lineTo(rx, ry);
      ctx.stroke();
    }
  }, [drawing, selection, activeTool]);

  // Escape to cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelScreenshot(imagePath);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [imagePath]);

  // Save handler
  const handleSave = async () => {
    if (!selection) return;
    setSaving(true);
    try {
      let annotatedDataUrl: string | undefined;
      if (canvasRef.current) {
        // Composite: draw the original region + annotations
        const composite = document.createElement("canvas");
        composite.width = selection.w;
        composite.height = selection.h;
        const cCtx = composite.getContext("2d");
        if (cCtx) {
          // Draw the selected region from the background image
          const bgImg = document.querySelector("#screenshot-bg") as HTMLImageElement;
          if (bgImg) {
            cCtx.drawImage(bgImg, selection.x, selection.y, selection.w, selection.h, 0, 0, selection.w, selection.h);
          }
          // Draw annotations on top
          cCtx.drawImage(canvasRef.current, 0, 0);
          annotatedDataUrl = composite.toDataURL("image/png");
        }
      }
      const savedPath = await saveScreenshotRegion(
        imagePath,
        { x: selection.x, y: selection.y, width: selection.w, height: selection.h },
        annotatedDataUrl,
      );
      // Also copy to clipboard
      await copyScreenshotToClipboard(savedPath);
    } catch (err) {
      console.error("Failed to save screenshot:", err);
    }
    setSaving(false);
  };

  const handleCopy = async () => {
    if (!selection) return;
    // Quick copy without saving
    const composite = document.createElement("canvas");
    composite.width = selection.w;
    composite.height = selection.h;
    const cCtx = composite.getContext("2d");
    if (cCtx) {
      const bgImg = document.querySelector("#screenshot-bg") as HTMLImageElement;
      if (bgImg) {
        cCtx.drawImage(bgImg, selection.x, selection.y, selection.w, selection.h, 0, 0, selection.w, selection.h);
      }
      if (canvasRef.current) {
        cCtx.drawImage(canvasRef.current, 0, 0);
      }
      // Save temp and copy
      const dataUrl = composite.toDataURL("image/png");
      const savedPath = await saveScreenshotRegion(
        imagePath,
        { x: selection.x, y: selection.y, width: selection.w, height: selection.h },
        dataUrl,
      );
      await copyScreenshotToClipboard(savedPath);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        cursor: phase === "selecting" ? "crosshair" : "default",
        userSelect: "none",
        overflow: "hidden",
      }}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {/* Background: full screen capture, slightly dimmed */}
      <img
        id="screenshot-bg"
        src={imageUrl}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: phase === "selecting" ? "brightness(0.5)" : "brightness(0.3)",
          pointerEvents: "none",
        }}
        draggable={false}
      />

      {/* Crosshair guides (only during selection phase) */}
      {phase === "selecting" && !selecting && (
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: mousePos.y, height: 1, background: "rgba(191,70,70,0.6)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: mousePos.x, width: 1, background: "rgba(191,70,70,0.6)", pointerEvents: "none" }} />
        </>
      )}

      {/* Selection rectangle */}
      {selection && (
        <div style={{
          position: "absolute",
          left: selection.x,
          top: selection.y,
          width: selection.w,
          height: selection.h,
          border: "2px solid #BF4646",
          background: phase === "annotating" ? "transparent" : "none",
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
          pointerEvents: phase === "annotating" ? "none" : "auto",
          zIndex: 10,
        }}>
          {/* Bright area -- show the actual image in the selected region */}
          <img
            src={imageUrl}
            alt=""
            style={{
              position: "absolute",
              width: `${window.innerWidth}px`,
              height: `${window.innerHeight}px`,
              left: -selection.x,
              top: -selection.y,
              pointerEvents: "none",
            }}
            draggable={false}
          />
        </div>
      )}

      {/* Dimension label while selecting */}
      {selecting && selection && selection.w > 0 && (
        <div style={{
          position: "absolute",
          left: selection.x + selection.w / 2 - 30,
          top: selection.y - 24,
          background: "rgba(0,0,0,0.75)",
          color: "#fff",
          padding: "2px 8px",
          borderRadius: 4,
          fontSize: 12,
          fontFamily: "monospace",
          zIndex: 20,
          pointerEvents: "none",
        }}>
          {selection.w} x {selection.h}
        </div>
      )}

      {/* Annotation canvas overlay */}
      {phase === "annotating" && selection && (
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            left: selection.x,
            top: selection.y,
            width: selection.w,
            height: selection.h,
            zIndex: 15,
            cursor: activeTool === "draw" ? "crosshair" : activeTool === "text" ? "text" : "crosshair",
          }}
          onMouseMove={handleCanvasMouseMove}
          onMouseDown={(e) => {
            e.stopPropagation();
            setDrawing(true);
            setStartPos({ x: e.clientX, y: e.clientY });
            if (activeTool === "draw" && canvasRef.current) {
              const ctx = canvasRef.current.getContext("2d");
              if (ctx) {
                const rx = e.clientX - selection.x;
                const ry = e.clientY - selection.y;
                ctx.beginPath();
                ctx.moveTo(rx, ry);
                ctx.strokeStyle = activeColor;
                ctx.lineWidth = 3;
                ctx.lineCap = "round";
              }
            }
            if (activeTool === "text") {
              const text = prompt("Enter text:");
              if (text && canvasRef.current) {
                const ctx = canvasRef.current.getContext("2d");
                if (ctx) {
                  const rx = e.clientX - selection.x;
                  const ry = e.clientY - selection.y;
                  ctx.font = "16px 'DM Sans', sans-serif";
                  ctx.fillStyle = activeColor;
                  ctx.fillText(text, rx, ry);
                }
              }
            }
          }}
          onMouseUp={(e) => {
            e.stopPropagation();
            if (canvasRef.current && selection) {
              const ctx = canvasRef.current.getContext("2d");
              if (!ctx) { setDrawing(false); return; }
              const rx = e.clientX - selection.x;
              const ry = e.clientY - selection.y;
              const sx = startPos.x - selection.x;
              const sy = startPos.y - selection.y;

              if (activeTool === "arrow") {
                ctx.strokeStyle = activeColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(rx, ry);
                ctx.stroke();
                const angle = Math.atan2(ry - sy, rx - sx);
                ctx.beginPath();
                ctx.moveTo(rx, ry);
                ctx.lineTo(rx - 14 * Math.cos(angle - 0.4), ry - 14 * Math.sin(angle - 0.4));
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(rx, ry);
                ctx.lineTo(rx - 14 * Math.cos(angle + 0.4), ry - 14 * Math.sin(angle + 0.4));
                ctx.stroke();
              } else if (activeTool === "rect") {
                ctx.strokeStyle = activeColor;
                ctx.lineWidth = 2;
                ctx.strokeRect(sx, sy, rx - sx, ry - sy);
              }
            }
            setDrawing(false);
          }}
        />
      )}

      {/* Annotation Toolbar */}
      {phase === "annotating" && selection && (
        <div style={{
          position: "absolute",
          left: selection.x,
          top: selection.y + selection.h + 8,
          display: "flex",
          gap: 4,
          background: "rgba(28,18,18,0.9)",
          borderRadius: 8,
          padding: "6px 8px",
          zIndex: 30,
          alignItems: "center",
          backdropFilter: "blur(8px)",
        }}>
          {/* Tools */}
          {([
            { tool: "arrow" as Tool, label: "Arrow", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> },
            { tool: "rect" as Tool, label: "Rect", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> },
            { tool: "draw" as Tool, label: "Draw", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> },
            { tool: "text" as Tool, label: "Text", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg> },
          ]).map(({ tool, label, icon }) => (
            <button
              key={tool}
              title={label}
              onClick={(e) => { e.stopPropagation(); setActiveTool(tool); }}
              style={{
                padding: "5px 8px",
                borderRadius: 5,
                border: "none",
                background: activeTool === tool ? "#BF4646" : "transparent",
                color: activeTool === tool ? "#fff" : "#aaa",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              {icon}
            </button>
          ))}

          {/* Separator */}
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.15)", margin: "0 4px" }} />

          {/* Colors */}
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={(e) => { e.stopPropagation(); setActiveColor(color); }}
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: activeColor === color ? "2px solid #fff" : "2px solid transparent",
                background: color,
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}

          {/* Separator */}
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.15)", margin: "0 4px" }} />

          {/* Actions */}
          <button onClick={(e) => { e.stopPropagation(); handleCopy(); }} style={{ padding: "5px 12px", borderRadius: 5, border: "none", background: "#7EACB5", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            Copy
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleSave(); }} disabled={saving} style={{ padding: "5px 12px", borderRadius: 5, border: "none", background: "#BF4646", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {saving ? "..." : "Save"}
          </button>
          <button onClick={(e) => { e.stopPropagation(); cancelScreenshot(imagePath); }} style={{ padding: "5px 12px", borderRadius: 5, border: "none", background: "rgba(255,255,255,0.1)", color: "#aaa", fontSize: 12, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      )}

      {/* Instructions */}
      {phase === "selecting" && !selecting && (
        <div style={{
          position: "absolute",
          bottom: 40,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.75)",
          color: "#fff",
          padding: "10px 24px",
          borderRadius: 8,
          fontSize: 14,
          zIndex: 20,
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}>
          Click and drag to select a region -- Press Esc to cancel
        </div>
      )}
    </div>
  );
}
