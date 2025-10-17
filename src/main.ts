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
app.appendChild(canvas);

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
type Stroke = Point[];

let isDrawing = false;
const ctx = canvas.getContext("2d");
if (ctx) {
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "black";
}

// Display list: array of strokes. Each stroke is an array of points.
const displayList: Stroke[] = [];
// Undo/Redo stacks. We'll push copies of strokes (shallow copy of arrays)
const undoStack: Stroke[][] = [];
const redoStack: Stroke[][] = [];

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

// Redraw handler: clears canvas and draws all strokes from the display list
function redraw() {
  if (!ctx) return;
  // clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw each stroke
  for (const stroke of displayList) {
    if (stroke.length === 0) continue;
    const first = stroke[0];
    if (!first) continue;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < stroke.length; i++) {
      const p = stroke[i];
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

canvas.addEventListener("mousedown", (e) => {
  isDrawing = true;
  // start a new stroke and add the initial point
  const pt = getCanvasPoint(e);
  // When starting a new stroke, clear redo stack (new branch)
  redoStack.length = 0;
  // push current state to undo stack (shallow copy of strokes)
  undoStack.push(displayList.map((s) => s.slice()));
  const stroke: Stroke = [pt];
  displayList.push(stroke);
  // notify observers that the drawing changed
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
  updateButtons();
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDrawing) return;
  const pt = getCanvasPoint(e);
  // append to the current stroke (last in displayList)
  const current = displayList[displayList.length - 1];
  if (current) {
    current.push(pt);
    // notify observers that the drawing changed
    canvas.dispatchEvent(new CustomEvent("drawing-changed"));
  }
});

["mouseup", "mouseout"].forEach((event) => {
  canvas.addEventListener(event, () => {
    isDrawing = false;
  });
});

// Button handlers
undoBtn.addEventListener("click", () => {
  if (undoStack.length === 0) return;
  // push current state to redo stack
  redoStack.push(displayList.map((s) => s.slice()));
  // restore last undo state
  const prev = undoStack.pop();
  displayList.length = 0;
  if (prev) {
    for (const s of prev) displayList.push(s.slice());
  }
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
  updateButtons();
});

redoBtn.addEventListener("click", () => {
  if (redoStack.length === 0) return;
  // push current state to undo stack
  undoStack.push(displayList.map((s) => s.slice()));
  const next = redoStack.pop();
  displayList.length = 0;
  if (next) {
    for (const s of next) displayList.push(s.slice());
  }
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
  updateButtons();
});

clearBtn.addEventListener("click", () => {
  // push current state to undo stack so clear can be undone
  undoStack.push(displayList.map((s) => s.slice()));
  displayList.length = 0;
  redoStack.length = 0;
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
  updateButtons();
});

updateButtons();
