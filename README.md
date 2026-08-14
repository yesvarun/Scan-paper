# ScanPaper

**Open-source Instapaper-style reader for scanned newspaper PDFs**

Turn multi-column scanned newspapers into clean, distraction-free articles — entirely in the browser.  
No servers. No uploads. Your PDFs never leave your device.

![License](https://img.shields.io/badge/license-MIT-blue)
![PWA](https://img.shields.io/badge/PWA-ready-green)
![OCR](https://img.shields.io/badge/OCR-Tesseract.js-orange)

## Features

- **Upload scanned PDF newspapers** → automatic OCR + article segmentation
- **Instapaper-like reading experience** — clean typography, adjustable font size, light/dark themes
- **Background processing** with live log, progress bar, elapsed time & ETA
- **Built-in dictionary** — click or long-press any word → definition + save to personal list
- **100% client-side** using open-source libraries only
- **Installable PWA** — works offline after first load (OCR language data cached by browser)
- Ready to host on **GitHub Pages**

## How it works

1. **pdf.js** renders each PDF page to a high-resolution canvas
2. **Tesseract.js** (WebAssembly port of Tesseract OCR) extracts text + layout blocks
3. Heuristic segmentation groups headlines + body text into individual “articles”
4. Articles are presented in a clean reader view with interactive words

> **Note on accuracy**: Newspaper layouts are complex (multi-column, varying font sizes, ads, images).  
> Segmentation is heuristic and works best on reasonably clean scans.  
> You can choose different Page Segmentation Modes (PSM) and DPI for better results.

## Tech stack (all open source)

| Component          | Library / Tool                          | License   |
|--------------------|-----------------------------------------|-----------|
| PDF rendering      | [pdf.js](https://mozilla.github.io/pdf.js/) | Apache-2.0 |
| OCR engine         | [Tesseract.js](https://github.com/naptha/tesseract.js) | Apache-2.0 |
| Dictionary API     | [Free Dictionary API](https://dictionaryapi.dev/) | Free / open data |
| App                | Vanilla HTML / CSS / JS                 | MIT       |

No frameworks, no build step required for basic use.

## Quick start (local)

```bash
# Clone or download this folder
cd scanpaper

# Any static server works
python3 -m http.server 8080
# or
npx serve .
```

Open http://localhost:8080

## Deploy to GitHub Pages

1. Create a new repository on GitHub (e.g. `scanpaper`)
2. Upload all files in this folder (or push via git)
3. Go to **Settings → Pages**
4. Source: **Deploy from a branch** → `main` / root
5. Your app will be live at `https://<username>.github.io/scanpaper/`

You can also use Cloudflare Pages, Netlify, Vercel, or any static host.

## Usage tips for best OCR

- Prefer **200–300 DPI** scans (use the DPI selector in the app)
- Clean, high-contrast black text on white background works best
- For multi-column newspapers try **PSM “Auto + OSD”** or **Fully automatic**
- First run downloads language data (~15–25 MB). Subsequent runs are faster
- Large multi-page PDFs take time — the progress bar + ETA keep you informed

## Dictionary

- Click (or long-press on mobile) any word in the reader
- Definitions come from the free [dictionaryapi.dev](https://api.dictionaryapi.dev)
- Save words to a personal list stored in `localStorage`
- Access saved words via the 📖 icon in the header

## Browser support

Modern browsers with WebAssembly + Canvas support:

- Chrome / Edge / Brave (recommended)
- Firefox
- Safari (iOS 15+ / macOS)

## Privacy

- All processing happens locally in your browser
- PDF files are never uploaded anywhere
- Only dictionary lookups (single words) leave the device
- No analytics, no tracking, no accounts

## Limitations & future ideas

- Article segmentation is rule-based (not ML layout analysis). Complex pages may produce imperfect splits
- Heavy pages can be memory-intensive on low-end mobile devices
- Possible improvements: better column detection, OpenCV.js pre-processing, Scribe.js integration, offline dictionary pack

## License

MIT — do whatever you want. Attribution appreciated.

---

Built with ❤️ for open-source reading tools.  
Inspired by Instapaper, wallabag, and the Tesseract community.
