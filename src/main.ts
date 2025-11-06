import exampleIconUrl from "./noun-paperclip-7598668-00449F.png";
import "./style.css";

document.body.innerHTML = `
  <p>Example image asset: <img src="${exampleIconUrl}" class="icon" /></p>
`;

const app = document.createElement("div");
document.body.appendChild(app);

const title = document.createElement("h1");
title.textContent = "Seamus' Sketcher";
app.appendChild(title);

const canvas = document.createElement("canvas");
canvas.width = 256;
canvas.height = 256;
canvas.id = "sketch-canvas";

// Wrap canvas so we can layer an overlay for the cursor without redrawing strokes
const canvasWrap = document.createElement("div");
canvasWrap.style.position = "relative";
canvasWrap.style.display = "inline-block";
app.appendChild(canvasWrap);
canvasWrap.appendChild(canvas);

// Overlay canvas for cursor preview (drawn separately so we don't redraw strokes on every mouse move)
const overlay = document.createElement("canvas");
overlay.width = canvas.width;
overlay.height = canvas.height;
overlay.id = "overlay-canvas";
overlay.style.position = "absolute";
overlay.style.left = "0";
overlay.style.top = "0";
overlay.style.pointerEvents = "none"; // let mouse events pass through to the main canvas
canvasWrap.appendChild(overlay);

// Controls container
const controls = document.createElement("div");
controls.className = "controls";
app.appendChild(controls);

const undoBtn = document.createElement("button");
undoBtn.textContent = "Undo";
undoBtn.disabled = true;
controls.appendChild(undoBtn);

const redoBtn = document.createElement("button");
redoBtn.textContent = "Redo";
redoBtn.disabled = true;
controls.appendChild(redoBtn);

const clearBtn = document.createElement("button");
clearBtn.textContent = "Clear";
controls.appendChild(clearBtn);

// Simple drawing logic using a display list + observer
type Point = { x: number; y: number };
type Stroke = { points: Point[]; width: number };

let isDrawing = false;
const ctx = canvas.getContext("2d");
const octx = overlay.getContext("2d");
if (ctx) {
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "black";
}

// Display list: array of strokes. Each stroke holds points + width.
const displayList: Stroke[] = [];
// Undo/Redo stacks. We'll push copies of strokes (shallow copy of points arrays and width)
const undoStack: Stroke[][] = [];
const redoStack: Stroke[][] = [];

// Thickness controls (two options)
let currentThickness = 2; // default thickness (pixels)
// remember last tool/mouse position while over the canvas so we can update overlay when thickness changes
let lastToolPos: Point | null = null;
const thicknessLabel = document.createElement("span");
thicknessLabel.textContent = "Thickness: ";
controls.appendChild(thicknessLabel);

const thinBtn = document.createElement("button");
thinBtn.textContent = "Thin";
thinBtn.className = "thickness-btn active";
controls.appendChild(thinBtn);

const thickBtn = document.createElement("button");
thickBtn.textContent = "Thick";
thickBtn.className = "thickness-btn";
controls.appendChild(thickBtn);

function setThickness(n: number) {
  currentThickness = n;
  if (n === 2) {
    thinBtn.classList.add("active");
    thickBtn.classList.remove("active");
  } else {
    thickBtn.classList.add("active");
    thinBtn.classList.remove("active");
  }
  // If we have a last-known tool position (cursor over canvas), update the overlay so the new thickness is shown
  if (lastToolPos) {
    drawCursorOverlay(lastToolPos, currentThickness);
  }
}

thinBtn.addEventListener("click", () => setThickness(2));
thickBtn.addEventListener("click", () => setThickness(6));

function updateButtons() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
  clearBtn.disabled = displayList.length === 0 && undoStack.length === 0;
}

// Helper to get canvas-relative point from mouse event
function getCanvasPoint(e: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function clearOverlay() {
  if (!octx) return;
  octx.clearRect(0, 0, overlay.width, overlay.height);
}

function drawCursorOverlay(pos: Point, thickness: number) {
  if (!octx) return;
  octx.clearRect(0, 0, overlay.width, overlay.height);
  // thin: draw a small filled point; thick: draw a circle outline with radius = thickness/2
  octx.save();
  // shift the overlay slightly downward so it visually covers where the stroke will be drawn
  const offsetY = Math.round(thickness / 2);
  const drawY = pos.y + offsetY;
  if (thickness <= 2) {
    octx.fillStyle = "rgba(0,0,0,0.9)";
    octx.beginPath();
    octx.arc(pos.x, drawY, 1.5, 0, Math.PI * 2);
    octx.fill();
  } else {
    octx.strokeStyle = "rgba(0,0,0,0.9)";
    octx.lineWidth = 1;
    octx.beginPath();
    octx.arc(pos.x, drawY, thickness / 2, 0, Math.PI * 2);
    octx.stroke();
  }
  octx.restore();
}

// Redraw handler: clears canvas and draws all strokes from the display list
function redraw() {
  if (!ctx) return;
  // clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw each stroke (respect stored width)
  for (const stroke of displayList) {
    if (!stroke || stroke.points.length === 0) continue;
    const first = stroke.points[0];
    if (!first) continue;
    ctx.beginPath();
    ctx.lineWidth = stroke.width;
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < stroke.points.length; i++) {
      const p = stroke.points[i];
      if (!p) continue;
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

// Observer: listen for 'drawing-changed' events on the canvas
canvas.addEventListener("drawing-changed", () => {
  redraw();
});

// Observer: listen for 'tool-moved' events and draw cursor overlay
canvas.addEventListener("tool-moved", (e) => {
  const d = (e as CustomEvent).detail as {
    x: number;
    y: number;
    thickness: number;
  } | undefined;
  if (!d) return;
  drawCursorOverlay({ x: d.x, y: d.y }, d.thickness);
});

canvas.addEventListener("mousedown", (e) => {
  isDrawing = true;
  // start a new stroke and add the initial point
  const pt = getCanvasPoint(e);
  // When starting a new stroke, clear redo stack (new branch)
  redoStack.length = 0;
  // push current state to undo stack (shallow copy of strokes and their points)
  undoStack.push(
    displayList.map((s) => ({ points: s.points.slice(), width: s.width })),
  );
  const stroke: Stroke = { points: [pt], width: currentThickness };
  displayList.push(stroke);
  // notify observers that the drawing changed
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
  updateButtons();
});

canvas.addEventListener("mousemove", (e) => {
  // always notify observers of tool movement
  const pt = getCanvasPoint(e);
  // remember last position so thickness changes can refresh overlay
  lastToolPos = pt;
  canvas.dispatchEvent(
    new CustomEvent("tool-moved", {
      detail: { x: pt.x, y: pt.y, thickness: currentThickness },
    }),
  );

  // when drawing, append to the current stroke (last in displayList)
  if (!isDrawing) return;
  const current = displayList[displayList.length - 1];
  if (current) {
    current.points.push(pt);
    // notify observers that the drawing changed
    canvas.dispatchEvent(new CustomEvent("drawing-changed"));
  }
});

canvas.addEventListener("mouseenter", (e) => {
  const pt = getCanvasPoint(e as MouseEvent);
  // hide default cursor so overlay is the visible tool
  canvas.style.cursor = "none";
  lastToolPos = pt;
  canvas.dispatchEvent(
    new CustomEvent("tool-moved", {
      detail: { x: pt.x, y: pt.y, thickness: currentThickness },
    }),
  );
});

canvas.addEventListener("mouseleave", () => {
  // restore default cursor and clear overlay when leaving
  canvas.style.cursor = "";
  clearOverlay();
  lastToolPos = null;
});

["mouseup", "mouseout"].forEach((event) => {
  canvas.addEventListener(event, () => {
    isDrawing = false;
    if (event === "mouseout") {
      // leaving canvas via mouseout: restore cursor and clear overlay
      canvas.style.cursor = "";
      clearOverlay();
      lastToolPos = null;
    }
  });
});

// Button handlers
undoBtn.addEventListener("click", () => {
  if (undoStack.length === 0) return;
  // push current state to redo stack
  redoStack.push(
    displayList.map((s) => ({ points: s.points.slice(), width: s.width })),
  );
  // restore last undo state
  const prev = undoStack.pop();
  displayList.length = 0;
  if (prev) {
    for (const s of prev) {
      displayList.push({ points: s.points.slice(), width: s.width });
    }
  }
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
  updateButtons();
});

redoBtn.addEventListener("click", () => {
  if (redoStack.length === 0) return;
  // push current state to undo stack
  undoStack.push(
    displayList.map((s) => ({ points: s.points.slice(), width: s.width })),
  );
  const next = redoStack.pop();
  displayList.length = 0;
  if (next) {
    for (const s of next) {
      displayList.push({ points: s.points.slice(), width: s.width });
    }
  }
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
  updateButtons();
});

clearBtn.addEventListener("click", () => {
  // push current state to undo stack so clear can be undone
  undoStack.push(
    displayList.map((s) => ({ points: s.points.slice(), width: s.width })),
  );
  displayList.length = 0;
  redoStack.length = 0;
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
  updateButtons();
});

updateButtons();
