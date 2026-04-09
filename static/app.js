let currentInput = "0";
let previousInput = "";
let operator = null;
let shouldResetDisplay = false;

const display = document.getElementById("display");
const statusEl = document.getElementById("status");
const micBtn = document.getElementById("micBtn");

const SYMBOL_TO_SPOKEN = {
  "0": "Zero", "1": "One", "2": "Two", "3": "Three", "4": "Four",
  "5": "Five", "6": "Six", "7": "Seven", "8": "Eight", "9": "Nine",
  ".": "Point", "/": "Over", "*": "Times", "+": "Plus", "-": "Minus", "=": "Is",
};

const WORD_TO_KEY = {
  zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  point: ".", decimal: ".",
  over: "/", divided: "/", divide: "/",
  times: "*", multiplied: "*", multiply: "*", by: null,
  plus: "+", add: "+",
  minus: "-", subtract: "-",
  equals: "=", equal: "=", is: "=", result: "=",
};

function setStatus(msg) { statusEl.textContent = msg || ""; }
function updateDisplay() { display.textContent = currentInput; }

function appendNumber(number) {
  if (currentInput === "0" || shouldResetDisplay) {
    currentInput = number;
    shouldResetDisplay = false;
  } else {
    if (number === "." && currentInput.includes(".")) return;
    currentInput += number;
  }
  updateDisplay();
}

function setOperator(op) {
  if (operator !== null && !shouldResetDisplay) {
    calculate();
  }
  previousInput = currentInput; // ← bu satır calculate()'den SONRA çalışmalı, zaten öyle
  operator = op;
  shouldResetDisplay = true;
}

function calculate() {
  if (operator === null) return;
  if (shouldResetDisplay) return;
  
  const prev = parseFloat(previousInput);
  const current = parseFloat(currentInput);
  
  // DEBUG — status'a yaz
  setStatus(`calc: ${prev} ${operator} ${current}`);
  
  if (Number.isNaN(prev) || Number.isNaN(current)) return;
  let result;
  switch (operator) {
    case "+": result = prev + current; break;
    case "-": result = prev - current; break;
    case "*": result = prev * current; break;
    case "/": result = current !== 0 ? prev / current : "Error"; break;
    default: return;
  }
  currentInput = typeof result === "number"
    ? parseFloat(result.toFixed(10)).toString()
    : result;
  operator = null;
  shouldResetDisplay = true;
  updateDisplay();
}

async function speak(text) {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      throw new Error(j?.error || `TTS failed (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.onended = () => URL.revokeObjectURL(url);
    await a.play();
  } catch (e) {
    setStatus(String(e.message || e));
  }
}

function handleKey(key, fromVoice = false) {
  if (key === "=") {
    if (!fromVoice) speak(SYMBOL_TO_SPOKEN["="]);
    calculate();
    return;
  }
  if ("0123456789.".includes(key)) {
    if (!fromVoice) speak(SYMBOL_TO_SPOKEN[key]);
    appendNumber(key);
    return;
  }
  if (["/", "*", "-", "+"].includes(key)) {
    if (!fromVoice) speak(SYMBOL_TO_SPOKEN[key]);
    setOperator(key);
  }
}

document.querySelectorAll("button[data-key]").forEach((btn) => {
  btn.addEventListener("click", () => handleKey(btn.dataset.key, false));
});

function floatTo16BitPCM(output, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  floatTo16BitPCM(view, 44, samples);
  return new Blob([view], { type: "audio/wav" });
}

async function recordWav(ms = 2500) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  processor.onaudioprocess = (e) => {
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(ctx.destination);
  await new Promise((r) => setTimeout(r, ms));
  processor.disconnect();
  source.disconnect();
  stream.getTracks().forEach((t) => t.stop());
  const length = chunks.reduce((sum, c) => sum + c.length, 0);
  const samples = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) { samples.set(c, offset); offset += c.length; }
  const wavBlob = encodeWAV(samples, ctx.sampleRate);
  await ctx.close();
  return wavBlob;
}

function normalizeTokens(text) {
  let s = (text || "")
    .toLowerCase()
    .replace(/[÷]/g, " / ")
    .replace(/[×x]/g, " * ")
    .replace(/[−–—]/g, " - ");

  s = s.replace(/([+*\/=])/g, " $1 ");
  s = s.replace(/(\w)\s*-\s*(\w)/g, "$1 - $2");

  const tokens = s.split(/\s+/).filter(Boolean);
  const keys = [];

  for (const raw of tokens) {
    // Noktayı whitelist'ten çıkardık — "is." → "is" olur
    const w = raw.replace(/^[^a-z0-9+\-*/=]+|[^a-z0-9+\-*/=]+$/g, "");
    if (!w) continue;

    if (["+", "-", "*", "/", "="].includes(w)) {
      keys.push(w);
      continue;
    }

    if (WORD_TO_KEY[w] !== undefined) {
      if (WORD_TO_KEY[w] !== null) keys.push(WORD_TO_KEY[w]);
      continue;
    }

    // Ondalık sayı: "3.14" → ["3",".",","1","4"]
    if (/^\d+\.\d+$/.test(w)) {
      for (const ch of w) keys.push(ch);
      continue;
    }

    // Tam sayı: "5" → ["5"]
    if (/^\d+$/.test(w)) {
      for (const ch of w) keys.push(ch);
      continue;
    }
  }

  return keys;
}

async function transcribeWav(wavBlob) {
  const fd = new FormData();
  fd.append("audio", wavBlob, "speech.wav");
  const res = await fetch("/api/stt", { method: "POST", body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || `STT failed (${res.status})`);
  return j.text || "";
}

micBtn.addEventListener("click", async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Microphone not supported in this browser.");
    return;
  }
  micBtn.classList.add("listening");
  setStatus("Listening...");
  try {
    const wav = await recordWav(2500);
    setStatus("Transcribing...");
    const text = await transcribeWav(wav);
    const keys = normalizeTokens(text);
    setStatus(`Heard: "${text}" → [${keys.join(", ")}]`);
    if (!keys.length) {
      setStatus(`Heard: "${text}" — no valid commands`);
      return;
    }
    keys.forEach((k) => handleKey(k, true));
  } catch (e) {
    setStatus(String(e.message || e));
  } finally {
    micBtn.classList.remove("listening");
  }
});

updateDisplay();