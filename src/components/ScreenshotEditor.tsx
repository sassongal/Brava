import { useState, useRef, useEffect, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { saveScreenshotRegion, cancelScreenshot, copyScreenshotToClipboard, saveDataUrlToPath } from "../lib/tauri";
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

  // HiDPI/Retina awareness
  const dpr = window.devicePixelRatio || 1;

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
  const magCanvasRef = useRef<HTMLCanvasElement>(null);
  const [saving, setSaving] = useState(false);
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fontSize, setFontSize] = useState(16);
  const [textInput, setTextInput] = useState<{x: number; y: number; value: string} | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, sel: { x: 0, y: 0, w: 0, h: 0 } });

  // Track mouse for crosshair
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    if (resizing && selection) {
      const dx = e.clientX - resizeStart.x;
      const dy = e.clientY - resizeStart.y;
      const s = resizeStart.sel;
      let nx = s.x, ny = s.y, nw = s.w, nh = s.h;

      if (resizing.includes("w")) { nx = s.x + dx; nw = s.w - dx; }
      if (resizing.includes("e")) { nw = s.w + dx; }
      if (resizing.includes("n")) { ny = s.y + dy; nh = s.h - dy; }
      if (resizing.includes("s")) { nh = s.h + dy; }

      // Ensure minimum size
      if (nw < 20) { nw = 20; if (resizing.includes("w")) nx = s.x + s.w - 20; }
      if (nh < 20) { nh = 20; if (resizing.includes("n")) ny = s.y + s.h - 20; }

      // Clamp to screen bounds
      nx = Math.max(0, nx);
      ny = Math.max(0, ny);
      nw = Math.min(nw, window.innerWidth - nx);
      nh = Math.min(nh, window.innerHeight - ny);

      setSelection({ x: nx, y: ny, w: nw, h: nh });
      return;
    }
    if (selecting) {
      const x = Math.min(startPos.x, e.clientX);
      const y = Math.min(startPos.y, e.clientY);
      const w = Math.abs(e.clientX - startPos.x);
      const h = Math.abs(e.clientY - startPos.y);
      setSelection({ x, y, w, h });
    }
  }, [selecting, startPos, resizing, resizeStart, selection]);

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
      ctx.lineWidth = activeTool === "draw" ? strokeWidth + 1 : strokeWidth;
      ctx.lineCap = "round";
    }
  }, [phase, selection, activeColor, activeTool]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (resizing) {
      setResizing(null);
      // Resize the canvas to match new selection
      if (canvasRef.current && selection) {
        // Before resizing canvas, save undo state
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          const undoEntry = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
          setUndoStack(prev => {
            const next = [...prev, undoEntry];
            return next.length > 8 ? next.slice(next.length - 8) : next;
          });
        }
        // Then resize canvas with DPR scaling
        canvasRef.current.width = selection.w * dpr;
        canvasRef.current.height = selection.h * dpr;
        canvasRef.current.style.width = `${selection.w}px`;
        canvasRef.current.style.height = `${selection.h}px`;
        const resizeCtx = canvasRef.current.getContext("2d");
        if (resizeCtx) resizeCtx.scale(dpr, dpr);
      }
      return;
    }
    if (phase === "selecting" && selecting) {
      setSelecting(false);
      if (selection && selection.w > 10 && selection.h > 10) {
        setPhase("annotating");
        // Initialize annotation canvas with DPR scaling
        setTimeout(() => {
          if (canvasRef.current && selection) {
            canvasRef.current.width = selection.w * dpr;
            canvasRef.current.height = selection.h * dpr;
            canvasRef.current.style.width = `${selection.w}px`;
            canvasRef.current.style.height = `${selection.h}px`;
            const ctx = canvasRef.current.getContext("2d");
            if (ctx) ctx.scale(dpr, dpr);
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
  }, [phase, selecting, selection, activeTool, startPos, resizing]);

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

  // Save handler
  const handleSave = async () => {
    if (!selection) return;
    setSaving(true);
    try {
      let annotatedDataUrl: string | undefined;
      if (canvasRef.current) {
        // Composite: draw the original region + annotations at full DPR resolution
        const composite = document.createElement("canvas");
        composite.width = selection.w * dpr;
        composite.height = selection.h * dpr;
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
              selection.w * dpr,
              selection.h * dpr,
            );
          }
          // Draw annotations on top (canvas already at DPR resolution)
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

  const handleSaveAs = async () => {
    if (!selection) return;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({
        filters: [{ name: "PNG Image", extensions: ["png"] }],
        defaultPath: `screenshot_${Date.now()}.png`,
      });
      if (path) {
        let annotatedDataUrl: string | undefined;
        if (canvasRef.current) {
          const composite = document.createElement("canvas");
          composite.width = selection.w * dpr;
          composite.height = selection.h * dpr;
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
                selection.w * dpr,
                selection.h * dpr,
              );
            }
            cCtx.drawImage(canvasRef.current, 0, 0);
            annotatedDataUrl = composite.toDataURL("image/png");
          }
        }
        if (annotatedDataUrl) {
          await saveDataUrlToPath(annotatedDataUrl, path);
        }
      }
    } catch (err) {
      console.error("Failed to save screenshot as:", err);
    }
  };

  const handleCopy = async () => {
    if (!selection) return;
    // Quick copy without saving
    const composite = document.createElement("canvas");
    composite.width = selection.w * dpr;
    composite.height = selection.h * dpr;
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
          selection.w * dpr,
          selection.h * dpr,
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

  // Canvas-based magnifier drawing
  useEffect(() => {
    if (phase !== "selecting" || !magCanvasRef.current) return;
    const bgImg = document.querySelector("#screenshot-bg") as HTMLImageElement;
    if (!bgImg || !bgImg.complete) return;

    const canvas = magCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw a 30x30 pixel region from the source image, scaled to 120x120
    const zoom = 4;
    const srcSize = 120 / zoom; // 30px source region
    const srcX = (mousePos.x / window.innerWidth) * bgImg.naturalWidth - srcSize / 2;
    const srcY = (mousePos.y / window.innerHeight) * bgImg.naturalHeight - srcSize / 2;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bgImg, srcX, srcY, srcSize, srcSize, 0, 0, 120, 120);
  }, [mousePos, phase]);

  // Escape to cancel, Ctrl/Cmd+Z to undo, tool shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (e.key === "Escape") {
        if (textInput) {
          setTextInput(null);
          return;
        }
        cancelScreenshot(imagePath);
        return;
      }
      if (textInput) return; // Don't handle shortcuts when typing text
      if (phase !== "annotating") return;
      switch(e.key) {
        case "1": setActiveTool("arrow"); break;
        case "2": setActiveTool("rect"); break;
        case "3": setActiveTool("circle"); break;
        case "4": setActiveTool("highlight"); break;
        case "5": setActiveTool("blur"); break;
        case "6": setActiveTool("draw"); break;
        case "7": setActiveTool("text"); break;
        case "Enter": handleSave(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [imagePath, handleUndo, phase, textInput, handleSave]);

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

      {/* Magnifier (canvas-based for performance) */}
      {imageReady && phase === "selecting" && (() => {
        const magX = mousePos.x + 140 > window.innerWidth ? mousePos.x - 140 : mousePos.x + 20;
        const magY = mousePos.y + 140 > window.innerHeight ? mousePos.y - 140 : mousePos.y + 20;
        return (
        <div style={{
          position: "absolute",
          left: magX,
          top: magY,
          width: 120,
          height: 120,
          border: "2px solid rgba(191,70,70,0.8)",
          borderRadius: 6,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 25,
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
          background: "#000",
        }}>
          <canvas ref={magCanvasRef} width={120} height={120} style={{ width: 120, height: 120 }} />
          {/* Crosshair in magnifier */}
          <div style={{ position: "absolute", left: 59, top: 0, width: 1, height: 120, background: "rgba(191,70,70,0.5)" }} />
          <div style={{ position: "absolute", top: 59, left: 0, height: 1, width: 120, background: "rgba(191,70,70,0.5)" }} />
          {/* Pixel coordinates */}
          <div style={{ position: "absolute", bottom: 2, left: 4, right: 4, fontSize: 9, color: "rgba(255,255,255,0.6)", textAlign: "center" }}>
            {mousePos.x}, {mousePos.y}
          </div>
        </div>
        );
      })()}

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

      {/* Resize handles during annotating phase */}
      {imageReady && phase === "annotating" && selection && (
        <>
          {[
            { id: "nw", cx: selection.x, cy: selection.y },
            { id: "ne", cx: selection.x + selection.w, cy: selection.y },
            { id: "sw", cx: selection.x, cy: selection.y + selection.h },
            { id: "se", cx: selection.x + selection.w, cy: selection.y + selection.h },
            { id: "n", cx: selection.x + selection.w / 2, cy: selection.y },
            { id: "s", cx: selection.x + selection.w / 2, cy: selection.y + selection.h },
            { id: "w", cx: selection.x, cy: selection.y + selection.h / 2 },
            { id: "e", cx: selection.x + selection.w, cy: selection.y + selection.h / 2 },
          ].map(handle => (
            <div
              key={handle.id}
              onMouseDown={(e) => {
                e.stopPropagation();
                setResizing(handle.id);
                setResizeStart({
                  x: e.clientX, y: e.clientY,
                  sel: { x: selection.x, y: selection.y, w: selection.w, h: selection.h }
                });
              }}
              style={{
                position: "absolute",
                left: handle.cx - 4,
                top: handle.cy - 4,
                width: 8, height: 8,
                background: "#BF4646",
                border: "1px solid white",
                borderRadius: 1,
                zIndex: 25,
                cursor: handle.id === "nw" || handle.id === "se" ? "nwse-resize" :
                        handle.id === "ne" || handle.id === "sw" ? "nesw-resize" :
                        handle.id === "n" || handle.id === "s" ? "ns-resize" : "ew-resize",
              }}
            />
          ))}
        </>
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
          {Math.round(selection.w * dpr)} x {Math.round(selection.h * dpr)}
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
            // Save undo state BEFORE annotation
            if (canvasRef.current && (activeTool !== "select")) {
              const ctx2 = canvasRef.current.getContext("2d");
              if (ctx2) {
                const entry = ctx2.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
                setUndoStack(prev => {
                  const next = [...prev, entry];
                  return next.length > 8 ? next.slice(next.length - 8) : next;
                });
              }
            }
            if (activeTool === "text") {
              setTextInput({ x: e.clientX, y: e.clientY, value: "" });
              return; // Don't start drawing
            }
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
                  ctx.lineWidth = strokeWidth * 10;
                  ctx.globalAlpha = 0.3;
                } else {
                  ctx.lineWidth = strokeWidth + 1;
                }
                ctx.lineCap = "round";
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
                ctx.lineWidth = strokeWidth;
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
                ctx.lineWidth = strokeWidth;
                ctx.strokeRect(sx, sy, rx - sx, ry - sy);
              } else if (activeTool === "circle") {
                ctx.strokeStyle = activeColor;
                ctx.lineWidth = strokeWidth;
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

              // Reset globalAlpha after highlight stroke
              if (activeTool === "highlight") {
                const ctx2 = canvasRef.current.getContext("2d");
                if (ctx2) ctx2.globalAlpha = 1.0;
              }
            }
            setDrawing(false);
          }}
        />
      )}

      {/* Inline text input */}
      {textInput && selection && (
        <input
          autoFocus
          value={textInput.value}
          onChange={(e) => setTextInput({...textInput, value: e.target.value})}
          onKeyDown={(e) => {
            if (e.key === "Enter" && textInput.value && canvasRef.current) {
              const ctx = canvasRef.current.getContext("2d");
              if (ctx) {
                ctx.font = `${fontSize}px 'DM Sans', sans-serif`;
                ctx.fillStyle = activeColor;
                ctx.fillText(textInput.value, textInput.x - selection.x, textInput.y - selection.y);
              }
              setTextInput(null);
            }
            if (e.key === "Escape") setTextInput(null);
          }}
          onBlur={() => {
            if (textInput.value && canvasRef.current && selection) {
              const ctx = canvasRef.current.getContext("2d");
              if (ctx) {
                ctx.font = `${fontSize}px 'DM Sans', sans-serif`;
                ctx.fillStyle = activeColor;
                ctx.fillText(textInput.value, textInput.x - selection.x, textInput.y - selection.y);
              }
            }
            setTextInput(null);
          }}
          style={{
            position: "absolute",
            left: textInput.x,
            top: textInput.y - 10,
            zIndex: 50,
            background: "transparent",
            border: "1px dashed " + activeColor,
            color: activeColor,
            fontSize: fontSize,
            fontFamily: "'DM Sans', sans-serif",
            outline: "none",
            padding: "2px 4px",
            minWidth: 100,
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

          {/* Stroke width */}
          <button onClick={(e) => { e.stopPropagation(); setStrokeWidth(w => Math.max(1, w - 1)); }}
            style={{ padding: "5px 8px", borderRadius: 5, border: "none", background: "transparent", color: "#aaa", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center" }}>-</button>
          <span style={{ color: "#aaa", fontSize: 11, minWidth: 20, textAlign: "center" }}>{strokeWidth}</span>
          <button onClick={(e) => { e.stopPropagation(); setStrokeWidth(w => Math.min(20, w + 1)); }}
            style={{ padding: "5px 8px", borderRadius: 5, border: "none", background: "transparent", color: "#aaa", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center" }}>+</button>

          {/* Font size controls (text tool) */}
          {activeTool === "text" && (
            <>
              <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.15)", margin: "0 4px" }} />
              <span style={{ color: "#888", fontSize: 10 }}>Font</span>
              <button onClick={(e) => { e.stopPropagation(); setFontSize(s => Math.max(8, s - 2)); }}
                style={{ padding: "5px 8px", borderRadius: 5, border: "none", background: "transparent", color: "#aaa", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center" }}>-</button>
              <span style={{ color: "#aaa", fontSize: 11, minWidth: 20, textAlign: "center" }}>{fontSize}</span>
              <button onClick={(e) => { e.stopPropagation(); setFontSize(s => Math.min(72, s + 2)); }}
                style={{ padding: "5px 8px", borderRadius: 5, border: "none", background: "transparent", color: "#aaa", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center" }}>+</button>
            </>
          )}

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
          <button onClick={(e) => { e.stopPropagation(); handleSaveAs(); }} style={{ padding: "5px 12px", borderRadius: 5, border: "none", background: "rgba(255,255,255,0.1)", color: "#ccc", fontSize: 12, cursor: "pointer" }}>
            Save As...
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
