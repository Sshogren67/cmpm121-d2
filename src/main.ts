import "./style.css";

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
type Stamp = { emoji: string; x: number; y: number; size: number };

let isDrawing = false;
const ctx = canvas.getContext("2d");
const octx = overlay.getContext("2d");
if (ctx) {
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "black";
}

// Display list: array of strokes or stamps.
const displayList: (Stroke | Stamp)[] = [];
// Undo/Redo stacks. We'll push copies of the displayList state.
const undoStack: (Stroke | Stamp)[][] = [];
const redoStack: (Stroke | Stamp)[][] = [];

function copyDisplayList(): (Stroke | Stamp)[] {
  return displayList.map((item) => {
    if ("points" in item) {
      return { points: item.points.slice(), width: item.width } as Stroke;
    }
    return {
      emoji: item.emoji,
      x: item.x,
      y: item.y,
      size: item.size,
    } as Stamp;
  });
}

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
  // switching thickness returns tool to drawing mode
  clearToolSelection();
  currentThickness = n;
  // switching thickness reverts tool back to drawing (lines)
  clearToolSelection();
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

// Tool selection: either drawing (null) or a stamp emoji
let currentToolEmoji: string | null = null;
// Stamp buttons (below thickness buttons) — placed in their own row so they appear under thickness controls
const stampsRow = document.createElement("div");
stampsRow.style.display = "flex";
stampsRow.style.gap = "8px";
stampsRow.style.alignItems = "center";
stampsRow.style.flexBasis = "100%"; // force new row
controls.appendChild(stampsRow);

const stampsLabel = document.createElement("span");
stampsLabel.textContent = "Stamps: ";
stampsRow.appendChild(stampsLabel);

const stampFrisbee = document.createElement("button");
stampFrisbee.className = "stamp-btn stamp-frisbee";
stampFrisbee.setAttribute("aria-label", "Frisbee stamp");
stampsRow.appendChild(stampFrisbee);

const stampFrog = document.createElement("button");
stampFrog.className = "stamp-btn stamp-frog";
stampFrog.setAttribute("aria-label", "Frog stamp");
stampsRow.appendChild(stampFrog);

const stampHand = document.createElement("button");
stampHand.className = "stamp-btn stamp-hand";
stampHand.setAttribute("aria-label", "Hand stamp");
stampsRow.appendChild(stampHand);

function clearToolSelection() {
  currentToolEmoji = null;
  stampFrisbee.classList.remove("active");
  stampFrog.classList.remove("active");
  stampHand.classList.remove("active");
}

function selectStamp(button: HTMLButtonElement, emoji: string) {
  if (currentToolEmoji === emoji) {
    // toggle off
    clearToolSelection();
    return;
  }
  clearToolSelection();
  currentToolEmoji = emoji;
  button.classList.add("active");
}

stampFrisbee.addEventListener("click", () => selectStamp(stampFrisbee, "🥏"));
stampFrog.addEventListener("click", () => selectStamp(stampFrog, "🐸"));
stampHand.addEventListener("click", () => selectStamp(stampHand, "✋"));

// Custom sticker button: prompts for an emoji and creates a new stamp button
const addCustomBtn = document.createElement("button");
addCustomBtn.className = "stamp-btn stamp-add";
addCustomBtn.textContent = "+";
addCustomBtn.title = "Add custom sticker";
controls.appendChild(addCustomBtn);

addCustomBtn.addEventListener("click", () => {
  const v = prompt("Enter an emoji or sticker character:", "⭐");
  if (v === null) return; // user cancelled
  const emoji = v.trim();
  if (!emoji) return;
  // create a new stamp button for this emoji
  const btn = document.createElement("button");
  btn.className = "stamp-btn";
  btn.textContent = emoji;
  controls.appendChild(btn);
  btn.addEventListener("click", () => selectStamp(btn, emoji));
  // select the newly created stamp
  selectStamp(btn, emoji);
});

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

  // draw each item in the display list (strokes and stamps)
  for (const item of displayList) {
    if (!item) continue;
    if ("points" in item) {
      const stroke = item as Stroke;
      if (!stroke.points || stroke.points.length === 0) continue;
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
    } else {
      // stamp
      const stamp = item as Stamp;
      if (!stamp) continue;
      // draw emoji centered at stamp.x, stamp.y
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${stamp.size}px serif`;
      ctx.fillText(stamp.emoji, stamp.x, stamp.y);
      ctx.restore();
    }
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
  const pt = getCanvasPoint(e);
  // If a stamp tool is selected, place a stamp instead of starting a stroke
  if (currentToolEmoji) {
    // snapshot for undo
    undoStack.push(copyDisplayList());
    redoStack.length = 0;
    // place stamp; align vertically with stroke offset so it lines up visually
    const offsetY = Math.round(currentThickness / 2);
    const stampY = pt.y + offsetY;
    const size = Math.max(12, currentThickness * 8);
    const stamp: Stamp = { emoji: currentToolEmoji, x: pt.x, y: stampY, size };
    displayList.push(stamp);
    canvas.dispatchEvent(new CustomEvent("drawing-changed"));
    updateButtons();
    return;
  }

  // start drawing stroke
  isDrawing = true;
  // start a new stroke and add the initial point
  // When starting a new stroke, clear redo stack (new branch)
  redoStack.length = 0;
  // push current state to undo stack (shallow copy of strokes and their points)
  undoStack.push(copyDisplayList());
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
  if (current && "points" in current) {
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
  redoStack.push(copyDisplayList());
  // restore last undo state
  const prev = undoStack.pop();
  displayList.length = 0;
  if (prev) {
    for (const s of prev) {
      if ("points" in s) {
        displayList.push({ points: s.points.slice(), width: s.width });
      } else {
        displayList.push({ emoji: s.emoji, x: s.x, y: s.y, size: s.size });
      }
    }
  }
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
  updateButtons();
});

redoBtn.addEventListener("click", () => {
  if (redoStack.length === 0) return;
  // push current state to undo stack
  undoStack.push(copyDisplayList());
  const next = redoStack.pop();
  displayList.length = 0;
  if (next) {
    for (const s of next) {
      if ("points" in s) {
        displayList.push({ points: s.points.slice(), width: s.width });
      } else {
        displayList.push({ emoji: s.emoji, x: s.x, y: s.y, size: s.size });
      }
    }
  }
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
  updateButtons();
});

clearBtn.addEventListener("click", () => {
  // push current state to undo stack so clear can be undone
  undoStack.push(copyDisplayList());
  displayList.length = 0;
  redoStack.length = 0;
  canvas.dispatchEvent(new CustomEvent("drawing-changed"));
  updateButtons();
});

updateButtons();
