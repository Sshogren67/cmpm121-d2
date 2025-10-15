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

// Simple drawing logic
let isDrawing = false;
const ctx = canvas.getContext("2d");
if (ctx) {
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "black";
}

canvas.addEventListener("mousedown", (e) => {
  isDrawing = true;
  const rect = canvas.getBoundingClientRect();
  ctx?.beginPath();
  ctx?.moveTo(e.clientX - rect.left, e.clientY - rect.top);
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDrawing) return;
  const rect = canvas.getBoundingClientRect();
  ctx?.lineTo(e.clientX - rect.left, e.clientY - rect.top);
  ctx?.stroke();
  ctx?.beginPath();
  ctx?.moveTo(e.clientX - rect.left, e.clientY - rect.top);
});

["mouseup", "mouseout"].forEach((event) => {
  canvas.addEventListener(event, () => {
    isDrawing = false;
  });
});
