import { useState, useRef, useEffect, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { saveScreenshotRegion, cancelScreenshot, copyScreenshotToClipboard } from "../lib/tauri";
import { useLocale } from "../lib/i18n";

type Tool = "select" | "arrow" | "rect" | "circle" | "draw" | "highlight" | "blur" | "text";

const COLORS = ["#BF4646", "#3D9970", "#3B82F6", "#F59E0B", "#8B5CF6", "#FFFFFF"];

function mapSelectionToImageRegion(
  selection: { x: number; y: number; w: number; h: number },
  bgImg: HTMLImageElement,
) {
  const rect = bgImg.getBoundingClientRect();
  const displayW = rect.width;
  const displayH = rect.height;
  const imgW = bgImg.naturalWidth || displayW;
  const imgH = bgImg.naturalHeight || displayH;

  const scale = Math.max(displayW / imgW, displayH / imgH);
  const renderedW = imgW * scale;
  const renderedH = imgH * scale;
  const offsetX = (displayW - renderedW) / 2;
  const offsetY = (displayH - renderedH) / 2;

  const localX = selection.x - rect.left - offsetX;
  const localY = selection.y - rect.top - offsetY;

  const sx = Math.max(0, Math.min(imgW, localX / scale));
  const sy = Math.max(0, Math.min(imgH, localY / scale));
  const sw = Math.max(1, Math.min(imgW - sx, selection.w / scale));
  const sh = Math.max(1, Math.min(imgH - sy, selection.h / scale));

  return {
    x: Math.round(sx),
    y: Math.round(sy),
    width: Math.max(1, Math.round(sw)),
    height: Math.max(1, Math.round(sh)),
  };
}

export function ScreenshotEditor() {
  const [, t] = useLocale();
  // Parse image path from URL
  const params = new URLSearchParams(window.location.search);
  const imagePath = decodeURIComponent(params.get("image") || "");
  const imageUrl = convertFileSrc(imagePath);
  const [imageReady, setImageReady] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

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
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);

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
    if (activeTool === "draw" || activeTool === "highlight") {
      const rx = e.clientX - selection.x;
      const ry = e.clientY - selection.y;
      ctx.lineTo(rx, ry);
      ctx.stroke();
      if (activeTool === "highlight") {
        ctx.globalAlpha = 1.0;
      }
    }
  }, [drawing, selection, activeTool]);

  // Undo handler
  const handleUndo = useCallback(() => {
    if (undoStack.length > 0 && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (undoStack.length === 1) {
        // Clear canvas (back to no annotations)
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        setUndoStack([]);
      } else {
        const prev = undoStack[undoStack.length - 2];
        if (ctx && prev) {
          ctx.putImageData(prev, 0, 0);
        }
        setUndoStack(s => s.slice(0, -1));
      }
    }
  }, [undoStack]);

  // Escape to cancel, Ctrl/Cmd+Z to undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (e.key === "Escape") {
        cancelScreenshot(imagePath);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [imagePath, handleUndo]);

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
            const imageRegion = mapSelectionToImageRegion(selection, bgImg);
            cCtx.drawImage(
              bgImg,
              imageRegion.x,
              imageRegion.y,
              imageRegion.width,
              imageRegion.height,
              0,
              0,
              selection.w,
              selection.h,
            );
          }
          // Draw annotations on top
          cCtx.drawImage(canvasRef.current, 0, 0);
          annotatedDataUrl = composite.toDataURL("image/png");
        }
      }
      const savedPath = await saveScreenshotRegion(
        imagePath,
        (() => {
          const bgImg = document.querySelector("#screenshot-bg") as HTMLImageElement | null;
          if (!bgImg) {
            return { x: selection.x, y: selection.y, width: selection.w, height: selection.h };
          }
          return mapSelectionToImageRegion(selection, bgImg);
        })(),
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
        const imageRegion = mapSelectionToImageRegion(selection, bgImg);
        cCtx.drawImage(
          bgImg,
          imageRegion.x,
          imageRegion.y,
          imageRegion.width,
          imageRegion.height,
          0,
          0,
          selection.w,
          selection.h,
        );
      }
      if (canvasRef.current) {
        cCtx.drawImage(canvasRef.current, 0, 0);
      }
      // Save temp and copy
      const dataUrl = composite.toDataURL("image/png");
      const savedPath = await saveScreenshotRegion(
        imagePath,
        (() => {
          const bgImg = document.querySelector("#screenshot-bg") as HTMLImageElement | null;
          if (!bgImg) {
            return { x: selection.x, y: selection.y, width: selection.w, height: selection.h };
          }
          return mapSelectionToImageRegion(selection, bgImg);
        })(),
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
      {(!imagePath || imageError) && (
        <div style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.92)",
          color: "#fff",
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
        }}>
          <h2 style={{ margin: 0, fontSize: "20px" }}>{t("ss.loadFailedTitle")}</h2>
          <p style={{ margin: 0, color: "#ccc", maxWidth: "520px", textAlign: "center" }}>
            {imageError || t("ss.invalidPathDesc")}
          </p>
          <button className="btn" onClick={() => { void cancelScreenshot(imagePath || undefined); }}>
            {t("ss.close")}
          </button>
        </div>
      )}

      {/* Background: full screen capture, slightly dimmed */}
      <img
        id="screenshot-bg"
        src={imageUrl}
        alt=""
        onLoad={() => {
          setImageReady(true);
          setImageError(null);
        }}
        onError={() => {
          setImageReady(false);
          setImageError(t("ss.openImageFailed"));
        }}
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
      {imageReady && phase === "selecting" && !selecting && (
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: mousePos.y, height: 1, background: "rgba(191,70,70,0.6)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: mousePos.x, width: 1, background: "rgba(191,70,70,0.6)", pointerEvents: "none" }} />
        </>
      )}

      {/* Magnifier */}
      {imageReady && phase === "selecting" && (
        <div style={{
          position: "absolute",
          left: mousePos.x + 20,
          top: mousePos.y + 20,
          width: 100,
          height: 100,
          border: "2px solid rgba(191,70,70,0.8)",
          borderRadius: 4,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 25,
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
        }}>
          <img
            src={imageUrl}
            alt=""
            style={{
              position: "absolute",
              width: `${window.innerWidth * 4}px`,
              height: `${window.innerHeight * 4}px`,
              left: -(mousePos.x * 4) + 50,
              top: -(mousePos.y * 4) + 50,
              imageRendering: "pixelated",
              pointerEvents: "none",
            }}
            draggable={false}
          />
          {/* Crosshair in magnifier */}
          <div style={{ position: "absolute", left: 49, top: 0, width: 1, height: 100, background: "rgba(191,70,70,0.5)" }} />
          <div style={{ position: "absolute", top: 49, left: 0, height: 1, width: 100, background: "rgba(191,70,70,0.5)" }} />
        </div>
      )}

      {/* Selection rectangle */}
      {imageReady && selection && (
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
      {imageReady && selecting && selection && selection.w > 0 && (
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
      {imageReady && phase === "annotating" && selection && (
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            left: selection.x,
            top: selection.y,
            width: selection.w,
            height: selection.h,
            zIndex: 15,
            cursor: activeTool === "text" ? "text" : "crosshair",
          }}
          onMouseMove={handleCanvasMouseMove}
          onMouseDown={(e) => {
            e.stopPropagation();
            setDrawing(true);
            setStartPos({ x: e.clientX, y: e.clientY });
            if ((activeTool === "draw" || activeTool === "highlight") && canvasRef.current) {
              const ctx = canvasRef.current.getContext("2d");
              if (ctx) {
                const rx = e.clientX - selection.x;
                const ry = e.clientY - selection.y;
                ctx.beginPath();
                ctx.moveTo(rx, ry);
                ctx.strokeStyle = activeColor;
                if (activeTool === "highlight") {
                  ctx.lineWidth = 20;
                  ctx.globalAlpha = 0.3;
                } else {
                  ctx.lineWidth = 3;
                }
                ctx.lineCap = "round";
              }
            }
            if (activeTool === "text") {
              const text = prompt(t("ss.enterText"));
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
              } else if (activeTool === "circle") {
                ctx.strokeStyle = activeColor;
                ctx.lineWidth = 2;
                const ccx = (sx + rx) / 2;
                const ccy = (sy + ry) / 2;
                const radiusX = Math.abs(rx - sx) / 2;
                const radiusY = Math.abs(ry - sy) / 2;
                ctx.beginPath();
                ctx.ellipse(ccx, ccy, radiusX, radiusY, 0, 0, 2 * Math.PI);
                ctx.stroke();
              } else if (activeTool === "blur") {
                const bx = Math.min(sx, rx);
                const by = Math.min(sy, ry);
                const bw = Math.abs(rx - sx);
                const bh = Math.abs(ry - sy);
                if (bw > 2 && bh > 2) {
                  // First draw the background region
                  const bgImg = document.querySelector("#screenshot-bg") as HTMLImageElement;
                  if (bgImg && selection) {
                    ctx.drawImage(bgImg, selection.x + bx, selection.y + by, bw, bh, bx, by, bw, bh);
                  }
                  // Pixelate
                  const pixelSize = 8;
                  const imageData = ctx.getImageData(bx, by, bw, bh);
                  for (let y = 0; y < bh; y += pixelSize) {
                    for (let x = 0; x < bw; x += pixelSize) {
                      const i = (y * bw + x) * 4;
                      const r = imageData.data[i], g = imageData.data[i+1], b = imageData.data[i+2];
                      ctx.fillStyle = `rgb(${r},${g},${b})`;
                      ctx.fillRect(bx + x, by + y, pixelSize, pixelSize);
                    }
                  }
                }
              }

              // Save undo state
              if (canvasRef.current) {
                const ctx2 = canvasRef.current.getContext("2d");
                if (ctx2) {
                  setUndoStack(prev => [...prev, ctx2.getImageData(0, 0, canvasRef.current!.width, canvasRef.current!.height)]);
                }
              }
            }
            setDrawing(false);
          }}
        />
      )}

      {/* Annotation Toolbar */}
      {imageReady && phase === "annotating" && selection && (
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
            { tool: "arrow" as Tool, label: t("ss.tool.arrow"), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> },
            { tool: "rect" as Tool, label: t("ss.tool.rect"), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> },
            { tool: "circle" as Tool, label: t("ss.tool.circle"), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/></svg> },
            { tool: "highlight" as Tool, label: t("ss.tool.highlight"), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 22h20L12 2z" fill="currentColor" opacity="0.3"/></svg> },
            { tool: "blur" as Tool, label: t("ss.tool.blur"), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2"/></svg> },
            { tool: "draw" as Tool, label: t("ss.tool.draw"), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> },
            { tool: "text" as Tool, label: t("ss.tool.text"), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg> },
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

          {/* Undo button */}
          <button
            title={t("ss.undo")}
            onClick={(e) => { e.stopPropagation(); handleUndo(); }}
            disabled={undoStack.length === 0}
            style={{
              padding: "5px 8px", borderRadius: 5, border: "none",
              background: "transparent", color: undoStack.length > 0 ? "#aaa" : "#555",
              cursor: undoStack.length > 0 ? "pointer" : "default",
              display: "flex", alignItems: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h10a5 5 0 015 5v0a5 5 0 01-5 5H8"/><path d="M3 10l4-4M3 10l4 4"/></svg>
          </button>

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
            {t("common.copy")}
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleSave(); }} disabled={saving} style={{ padding: "5px 12px", borderRadius: 5, border: "none", background: "#BF4646", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {saving ? "..." : t("common.save")}
          </button>
          <button onClick={(e) => { e.stopPropagation(); cancelScreenshot(imagePath); }} style={{ padding: "5px 12px", borderRadius: 5, border: "none", background: "rgba(255,255,255,0.1)", color: "#aaa", fontSize: 12, cursor: "pointer" }}>
            {t("common.cancel")}
          </button>
        </div>
      )}

      {/* Instructions */}
      {imageReady && phase === "selecting" && !selecting && (
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
          {t("ss.instructions")}
        </div>
      )}
    </div>
  );
}
