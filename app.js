/**
 * ScanPaper — Open-source Instapaper-style newspaper OCR reader
 * 100% client-side · pdf.js + Tesseract.js · PWA ready
 */

import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";

// Worker for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

// ---------- State ----------
const state = {
  articles: [],
  currentArticle: null,
  processing: false,
  cancelFlag: false,
  savedWords: JSON.parse(localStorage.getItem("scanpaper_words") || "[]"),
  fontSize: parseFloat(localStorage.getItem("scanpaper_fontsize") || "1.15"),
  theme: localStorage.getItem("scanpaper_theme") || "light",
  readerTheme: localStorage.getItem("scanpaper_reader_theme") || "light",
  startTime: 0,
  pageTimes: [],
};

// ---------- DOM helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showView(name) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  const el = $(`#view-${name}`);
  if (el) el.classList.add("active");
  if (name === "dictionary") renderDictionary();
  updateDictBadge();
}

window.showView = showView;

// ---------- Theme ----------
function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  localStorage.setItem("scanpaper_theme", state.theme);
}
function toggleTheme() {
  state.theme = state.theme === "light" ? "dark" : "light";
  applyTheme();
}
window.toggleTheme = toggleTheme;

function toggleReaderTheme() {
  state.readerTheme = state.readerTheme === "light" ? "dark" : "light";
  localStorage.setItem("scanpaper_reader_theme", state.readerTheme);
  const body = $("#reader-content");
  if (state.readerTheme === "dark") {
    body.style.background = "#1a1a1a";
    body.style.color = "#e0ddd5";
  } else {
    body.style.background = "";
    body.style.color = "";
  }
}
window.toggleReaderTheme = toggleReaderTheme;

applyTheme();

// ---------- Upload ----------
const dropZone = $("#drop-zone");
const fileInput = $("#file-input");

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file && file.type === "application/pdf") startProcessing(file);
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) startProcessing(file);
});

// ---------- Logging & Progress ----------
function log(msg) {
  const out = $("#log-output");
  const time = new Date().toLocaleTimeString();
  out.textContent += `[${time}] ${msg}\n`;
  out.scrollTop = out.scrollHeight;
}

function setProgress(pct, timeStr = null) {
  const fill = $("#progress-fill");
  const pctEl = $("#progress-pct");
  fill.style.width = `${Math.min(100, pct)}%`;
  pctEl.textContent = `${Math.round(pct)}%`;
  if (timeStr) $("#progress-time").textContent = timeStr;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function updateETA(currentPage, totalPages, pageTimes) {
  if (pageTimes.length === 0) {
    $("#eta-text").textContent = "Estimating time…";
    return;
  }
  const avg = pageTimes.reduce((a, b) => a + b, 0) / pageTimes.length;
  const remaining = (totalPages - currentPage) * avg;
  const elapsed = Date.now() - state.startTime;
  $("#eta-text").textContent = `Elapsed ${formatDuration(elapsed)} · ~${formatDuration(remaining)} left`;
}

// ---------- Main processing ----------
async function startProcessing(file) {
  if (state.processing) return;
  state.processing = true;
  state.cancelFlag = false;
  state.articles = [];
  state.pageTimes = [];
  state.startTime = Date.now();

  showView("processing");
  $("#log-output").textContent = "";
  setProgress(0);
  log(`Loading PDF: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

  const lang = $("#lang-select").value;
  const scale = parseFloat($("#dpi-select").value);
  const psm = parseInt($("#psm-select").value, 10);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    log(`PDF loaded · ${numPages} page(s)`);

    // Create Tesseract worker once
    log("Initializing OCR engine (first run downloads ~15–25 MB language data)…");
    const worker = await Tesseract.createWorker(lang, 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          // per-page progress handled outside
        } else if (m.progress !== undefined && m.status) {
          // initial load progress
        }
      },
    });

    await worker.setParameters({
      tessedit_pageseg_mode: psm,
      preserve_interword_spaces: "1",
    });

    log(`OCR ready · language: ${lang} · PSM: ${psm} · scale: ${scale}`);

    for (let i = 1; i <= numPages; i++) {
      if (state.cancelFlag) {
        log("Cancelled by user.");
        break;
      }

      const pageStart = Date.now();
      log(`Page ${i}/${numPages}: rendering…`);

      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { alpha: false });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      await page.render({
        canvasContext: ctx,
        viewport,
        intent: "print",
      }).promise;

      log(`Page ${i}/${numPages}: OCR running…`);
      const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });

      const pageArticles = segmentArticles(data, i);
      state.articles.push(...pageArticles);

      const elapsed = Date.now() - pageStart;
      state.pageTimes.push(elapsed);
      log(`Page ${i}/${numPages}: done in ${formatDuration(elapsed)} · ${pageArticles.length} article(s) found`);

      const overallPct = (i / numPages) * 100;
      setProgress(overallPct, formatDuration(Date.now() - state.startTime));
      updateETA(i, numPages, state.pageTimes);

      // free memory
      canvas.width = 0;
      canvas.height = 0;
    }

    await worker.terminate();
    log("OCR finished. Building reader…");

    if (!state.cancelFlag) {
      renderResults(file.name, numPages);
      showView("results");
    } else {
      showView("home");
    }
  } catch (err) {
    console.error(err);
    log(`ERROR: ${err.message || err}`);
    alert("Processing failed: " + (err.message || err));
    showView("home");
  } finally {
    state.processing = false;
  }
}

function cancelProcessing() {
  state.cancelFlag = true;
  log("Cancelling… (will finish current page)");
}
window.cancelProcessing = cancelProcessing;

// ---------- Article segmentation (heuristic) ----------
/**
 * Uses Tesseract blocks + line heights to detect possible articles.
 * Headlines tend to have larger bounding-box height / shorter length.
 * Groups consecutive body text under a title.
 */
function segmentArticles(data, pageNum) {
  const articles = [];
  const blocks = data.blocks || [];

  if (blocks.length === 0) {
    // fallback: whole page text
    const text = (data.text || "").trim();
    if (text.length > 30) {
      articles.push({
        id: `p${pageNum}-1`,
        title: `Page ${pageNum}`,
        text,
        page: pageNum,
        preview: text.slice(0, 180).replace(/\n+/g, " "),
      });
    }
    return articles;
  }

  // Collect text lines with approximate size
  const lines = [];
  for (const block of blocks) {
    if (!block.paragraphs) continue;
    for (const para of block.paragraphs) {
      if (!para.lines) continue;
      for (const line of para.lines) {
        const text = (line.text || "").trim();
        if (!text) continue;
        const h = line.bbox ? line.bbox.y1 - line.bbox.y0 : 20;
        lines.push({ text, h, bbox: line.bbox });
      }
    }
  }

  if (lines.length === 0) {
    const text = (data.text || "").trim();
    if (text.length > 30) {
      articles.push({
        id: `p${pageNum}-1`,
        title: `Page ${pageNum}`,
        text,
        page: pageNum,
        preview: text.slice(0, 180).replace(/\n+/g, " "),
      });
    }
    return articles;
  }

  // Estimate median line height
  const heights = lines.map((l) => l.h).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 20;
  const titleThreshold = medianH * 1.35;

  let current = null;
  let articleIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLikelyTitle =
      line.h >= titleThreshold ||
      (line.text.length < 80 && line.text === line.text.toUpperCase() && line.text.length > 8);

    if (isLikelyTitle && (current === null || current.bodyLines.length > 2)) {
      // start new article
      if (current && (current.bodyLines.length > 0 || current.title)) {
        finalizeArticle(current, articles, pageNum, ++articleIdx);
      }
      current = {
        title: line.text,
        bodyLines: [],
      };
    } else {
      if (!current) {
        current = { title: `Page ${pageNum} · Section ${articleIdx + 1}`, bodyLines: [] };
      }
      current.bodyLines.push(line.text);
    }
  }

  if (current) {
    finalizeArticle(current, articles, pageNum, ++articleIdx);
  }

  // If we got almost nothing useful, fallback to full page
  if (articles.length === 0 || articles.every((a) => a.text.length < 40)) {
    const text = (data.text || "").trim();
    if (text.length > 30) {
      return [
        {
          id: `p${pageNum}-full`,
          title: `Page ${pageNum}`,
          text,
          page: pageNum,
          preview: text.slice(0, 180).replace(/\n+/g, " "),
        },
      ];
    }
  }

  return articles;
}

function finalizeArticle(curr, list, pageNum, idx) {
  const body = curr.bodyLines.join("\n").trim();
  const full = (curr.title + "\n\n" + body).trim();
  if (full.length < 25) return;

  list.push({
    id: `p${pageNum}-${idx}`,
    title: curr.title || `Article ${idx}`,
    text: full,
    page: pageNum,
    preview: (body || curr.title).slice(0, 180).replace(/\n+/g, " "),
  });
}

// ---------- Results UI ----------
function renderResults(filename, numPages) {
  $("#results-title").textContent = `Extracted Articles`;
  $("#results-meta").textContent = `${state.articles.length} article(s) from ${numPages} page(s) · ${filename}`;

  const list = $("#articles-list");
  list.innerHTML = "";

  state.articles.forEach((art, i) => {
    const card = document.createElement("div");
    card.className = "article-card";
    card.innerHTML = `
      <h3>${escapeHtml(art.title)}</h3>
      <div class="preview">${escapeHtml(art.preview)}…</div>
      <div class="meta">Page ${art.page} · ${art.text.split(/\s+/).length} words</div>
    `;
    card.addEventListener("click", () => openReader(art));
    list.appendChild(card);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------- Reader ----------
function openReader(art) {
  state.currentArticle = art;
  $("#reader-title").textContent = art.title;
  $("#reader-meta").textContent = `Page ${art.page} · ${art.text.split(/\s+/).length} words`;

  // Make words interactive
  const container = $("#reader-text");
  container.innerHTML = "";
  container.style.fontSize = state.fontSize + "rem";

  // Split into paragraphs first
  const paragraphs = art.text.split(/\n\s*\n|\n{2,}/).filter((p) => p.trim());

  paragraphs.forEach((para) => {
    const p = document.createElement("p");
    // Tokenize words while keeping punctuation attached for display
    const tokens = para.split(/(\s+)/);
    tokens.forEach((tok) => {
      if (/^\s+$/.test(tok)) {
        p.appendChild(document.createTextNode(tok));
      } else {
        // strip trailing punctuation for lookup key
        const match = tok.match(/^([^\w]*)([\w''-]+)([^\w]*)$/);
        if (match) {
          const [, pre, word, post] = match;
          if (pre) p.appendChild(document.createTextNode(pre));
          const span = document.createElement("span");
          span.className = "word";
          span.textContent = word;
          span.dataset.word = word.toLowerCase().replace(/['']/g, "'");
          span.addEventListener("click", (e) => {
            e.preventDefault();
            lookupWord(span.dataset.word, span.textContent);
          });
          // long-press support
          let pressTimer;
          span.addEventListener("touchstart", (e) => {
            pressTimer = setTimeout(() => {
              lookupWord(span.dataset.word, span.textContent);
            }, 500);
          });
          span.addEventListener("touchend", () => clearTimeout(pressTimer));
          span.addEventListener("touchmove", () => clearTimeout(pressTimer));
          p.appendChild(span);
          if (post) p.appendChild(document.createTextNode(post));
        } else {
          p.appendChild(document.createTextNode(tok));
        }
      }
    });
    container.appendChild(p);
  });

  // Apply reader theme
  if (state.readerTheme === "dark") {
    $("#reader-content").style.background = "#1a1a1a";
    $("#reader-content").style.color = "#e0ddd5";
  }

  showView("reader");
  window.scrollTo(0, 0);
}

function changeFontSize(delta) {
  state.fontSize = Math.max(0.9, Math.min(1.8, state.fontSize + delta * 0.1));
  localStorage.setItem("scanpaper_fontsize", state.fontSize);
  $("#reader-text").style.fontSize = state.fontSize + "rem";
}
window.changeFontSize = changeFontSize;

function saveCurrentArticle() {
  if (!state.currentArticle) return;
  const blob = new Blob([state.currentArticle.text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (state.currentArticle.title || "article").slice(0, 40).replace(/[^\w]+/g, "_") + ".txt";
  a.click();
  URL.revokeObjectURL(url);
}
window.saveCurrentArticle = saveCurrentArticle;

function exportAllText() {
  const all = state.articles
    .map((a) => `=== ${a.title} (Page ${a.page}) ===\n\n${a.text}`)
    .join("\n\n\n");
  const blob = new Blob([all], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "newspaper_articles.txt";
  a.click();
  URL.revokeObjectURL(url);
}
window.exportAllText = exportAllText;

// ---------- Dictionary ----------
async function lookupWord(key, displayWord) {
  const popup = $("#dict-popup");
  $("#dict-word").textContent = displayWord;
  $("#dict-phonetic").textContent = "Loading…";
  $("#dict-meanings").innerHTML = "";
  $("#btn-save-word").dataset.word = key;
  $("#btn-save-word").dataset.display = displayWord;
  popup.hidden = false;

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`);
    if (!res.ok) throw new Error("Not found");
    const data = await res.json();
    const entry = data[0];

    const phonetic =
      entry.phonetic ||
      (entry.phonetics && entry.phonetics.find((p) => p.text)?.text) ||
      "";
    $("#dict-phonetic").textContent = phonetic;

    let html = "";
    (entry.meanings || []).slice(0, 4).forEach((m) => {
      html += `<div class="meaning-block">`;
      html += `<div class="pos">${m.partOfSpeech || ""}</div>`;
      (m.definitions || []).slice(0, 2).forEach((d) => {
        html += `<div class="def">${escapeHtml(d.definition)}</div>`;
        if (d.example) html += `<div class="example">“${escapeHtml(d.example)}”</div>`;
      });
      html += `</div>`;
    });
    $("#dict-meanings").innerHTML = html || "<p>No definitions found.</p>";
  } catch (err) {
    $("#dict-phonetic").textContent = "";
    $("#dict-meanings").innerHTML =
      "<p>Definition not found. You can still save the word.</p>";
  }
}

function closeDictPopup() {
  $("#dict-popup").hidden = true;
}
window.closeDictPopup = closeDictPopup;

function saveWordFromPopup() {
  const key = $("#btn-save-word").dataset.word;
  const display = $("#btn-save-word").dataset.display;
  if (!key) return;

  // Get current definition text
  const meanings = $("#dict-meanings").innerText || "";
  const existing = state.savedWords.find((w) => w.word === key);
  if (!existing) {
    state.savedWords.unshift({
      word: key,
      display,
      def: meanings.slice(0, 300),
      savedAt: Date.now(),
    });
    localStorage.setItem("scanpaper_words", JSON.stringify(state.savedWords));
    updateDictBadge();
  }
  closeDictPopup();
}
window.saveWordFromPopup = saveWordFromPopup;

function updateDictBadge() {
  const badge = $("#dict-badge");
  if (state.savedWords.length > 0) {
    badge.hidden = false;
    badge.textContent = state.savedWords.length;
  } else {
    badge.hidden = true;
  }
}

function renderDictionary() {
  const list = $("#dict-list");
  const empty = $("#dict-empty");
  list.innerHTML = "";

  if (state.savedWords.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  state.savedWords.forEach((item, idx) => {
    const div = document.createElement("div");
    div.className = "dict-item";
    div.innerHTML = `
      <h4>${escapeHtml(item.display || item.word)}</h4>
      <div class="def">${escapeHtml(item.def || "")}</div>
      <button class="remove" data-idx="${idx}">Remove</button>
    `;
    div.querySelector(".remove").addEventListener("click", () => {
      state.savedWords.splice(idx, 1);
      localStorage.setItem("scanpaper_words", JSON.stringify(state.savedWords));
      renderDictionary();
      updateDictBadge();
    });
    list.appendChild(div);
  });
}

// ---------- PWA install ----------
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = $("#btn-install");
  btn.hidden = false;
  btn.onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    btn.hidden = true;
  };
});

// Service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
  });
}

// Init
updateDictBadge();
console.log("ScanPaper ready · open-source · client-side OCR");
