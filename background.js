// Smart Long Screenshot — background service worker.
//
// Flow:
//   1. The popup sends a START message for a tab.
//   2. `captureTab` injects `pageScript` into the tab to locate the scrollable
//      element, then repeatedly scrolls and grabs the visible viewport.
//   3. The captured frames are stitched into either one continuous PNG or a
//      smart-paginated A4 PDF, then handed to chrome.downloads.
//
// Sections below:
//   - Job registry & message router
//   - Injected page script (runs inside the target tab)
//   - Capture loop
//   - PDF encoder
//   - PNG encoder
//   - Shared helpers

// ---------------------------------------------------------------------------
// Job registry & utilities
// ---------------------------------------------------------------------------

/** Active capture jobs, keyed by tabId. Each job carries a `cancel` flag. */
const jobs = new Map();

/** The property name used to stash capture state on the target page's window. */
const PAGE_STATE_KEY = '__smartLongScreenshot';

/** Resolve after `ms` milliseconds. */
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `func` inside the target tab and return its result.
 * @param {number} tabId
 * @param {Function} func - serialized and executed in the page context
 * @param {any[]} [args]
 */
async function runInPage(tabId, func, args = []) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });
  return injection.result;
}

/** Persist a status string that the popup mirrors into its UI. */
function reportStatus(text) {
  return chrome.storage.local.set({ captureStatus: text });
}

// ---------------------------------------------------------------------------
// Injected page script
// ---------------------------------------------------------------------------

/**
 * Runs inside the target tab. A single function with an `action` switch so it
 * can be injected once and called repeatedly.
 *
 * Actions:
 *   'init'   - pick the scrollable element, reset it to the top, return geometry
 *   'breaks' - list candidate page-break positions (used for PDF pagination)
 *   'move'   - scroll the element to `requested`
 *   'read'   - report current scroll position and geometry
 *   'finish' - restore the original scroll position and clear state
 *
 * @param {'init'|'breaks'|'move'|'read'|'finish'} action
 * @param {'auto'|'page'} mode
 * @param {number} [requested] - target scrollTop for the 'move' action
 */
function pageScript(action, mode, requested = 0) {
  const STATE_KEY = '__smartLongScreenshot';

  const scrollRoot = document.scrollingElement || document.documentElement;
  const isRoot = (el) => el === scrollRoot;

  if (action === 'init') {
    // Find every element that scrolls meaningfully and is currently on screen.
    const candidates = [scrollRoot, ...document.querySelectorAll('*')].filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        el.scrollHeight > el.clientHeight + 60 &&
        el.clientHeight >= 100 &&
        rect.width >= 180 &&
        rect.bottom > 0 &&
        rect.top < innerHeight &&
        (el === scrollRoot || /(auto|scroll)/.test(style.overflowY))
      );
    });

    // Prefer the element with the most visible area and the most to scroll.
    const score = (el) => {
      const r = el.getBoundingClientRect();
      const visibleWidth = Math.max(0, Math.min(r.right, innerWidth) - Math.max(0, r.left));
      const visibleHeight = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(0, r.top));
      const scrollableAmount = Math.min(10000, el.scrollHeight - el.clientHeight);
      return visibleWidth * visibleHeight + scrollableAmount * 30;
    };

    const target =
      mode === 'page'
        ? scrollRoot
        : candidates.sort((a, b) => score(b) - score(a))[0] || scrollRoot;

    // Clip to the on-screen region of the chosen element.
    const rect = isRoot(target)
      ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
      : target.getBoundingClientRect();
    const clip = {
      left: Math.max(0, rect.left),
      top: Math.max(0, rect.top),
      right: Math.min(innerWidth, rect.right),
      bottom: Math.min(innerHeight, rect.bottom),
    };
    if (clip.right - clip.left < 20 || clip.bottom - clip.top < 20) {
      throw new Error('Scrollable content is not visible.');
    }

    // Neutralize sticky/fixed elements so they scroll away with the content
    // instead of staying pinned and being captured in every frame (which would
    // both duplicate them and hide the content they overlap).
    const neutralized = [];
    for (const node of document.querySelectorAll('*')) {
      const position = getComputedStyle(node).position;
      if (position !== 'sticky' && position !== 'fixed') continue;

      const rect = node.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;

      neutralized.push({ node, position: node.style.position });
      node.style.setProperty('position', 'static', 'important');
    }

    window[STATE_KEY] = { el: target, original: target.scrollTop, clip, neutralized };
    target.scrollTop = 0;
    if (isRoot(target)) window.scrollTo(window.scrollX, 0);

    return { clip, height: target.scrollHeight, view: target.clientHeight };
  }

  const state = window[STATE_KEY];
  if (!state) throw new Error('Capture state was lost. Reload the webpage and retry.');
  const el = state.el;

  if (action === 'breaks') {
    // Collect vertical positions of content blocks so the PDF can avoid
    // slicing through important elements (tables, images, etc.).
    const rootOffset = isRoot(el) ? 0 : el.getBoundingClientRect().top;
    const selector = 'p, li, tr, h1, h2, h3, h4, h5, img, svg, figure, pre, blockquote';
    const nodes = isRoot(el) ? document.querySelectorAll(selector) : el.querySelectorAll(selector);

    const breaks = [];
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.height < 2 || rect.width < 2) continue;

      const top = rect.top - rootOffset + el.scrollTop;
      const bottom = rect.bottom - rootOffset + el.scrollTop;
      if (bottom < 0 || top > el.scrollHeight) continue;

      // Protect "indivisible" blocks with a higher priority.
      const priority = node.matches('tr, img, svg, figure, pre') ? 3 : 1;
      breaks.push({ top: Math.round(top), bottom: Math.round(bottom), priority });
    }
    return breaks;
  }

  if (action === 'move') {
    el.scrollTop = requested;
    return true;
  }

  if (action === 'read') {
    return {
      scroll: el.scrollTop,
      height: el.scrollHeight,
      view: el.clientHeight,
      clip: state.clip,
      dpr: devicePixelRatio,
    };
  }

  if (action === 'finish') {
    // Restore the inline `position` of every element we neutralized.
    for (const { node, position } of state.neutralized || []) {
      if (position) node.style.setProperty('position', position);
      else node.style.removeProperty('position');
    }
    el.scrollTop = state.original;
    delete window[STATE_KEY];
    return true;
  }
}

// ---------------------------------------------------------------------------
// Capture loop
// ---------------------------------------------------------------------------

/** Maximum number of scroll-and-capture iterations (safety cap). */
const MAX_FRAMES = 60;
/** Minimum delay between visible-tab captures to respect Chrome's rate limit. */
const MIN_CAPTURE_INTERVAL = 650;

/**
 * Scroll through the target element, capturing the viewport at each step, then
 * encode and download the result.
 * @param {number} tabId
 * @param {'auto'|'page'} mode
 * @param {{cancel: boolean, format: 'png'|'pdf'}} job
 */
async function captureTab(tabId, mode, job) {
  let initialized = false;

  try {
    await runInPage(tabId, pageScript, ['init', mode]);
    initialized = true;
    await pause(250);

    // Page-break hints are only needed for the PDF path.
    const breakHints = job.format === 'pdf' ? await runInPage(tabId, pageScript, ['breaks', mode]) : [];

    const frames = [];
    let lastScroll = -1;
    let nextScroll = 0;
    let lastCaptureAt = 0;

    for (let i = 0; i < MAX_FRAMES; i++) {
      if (job.cancel) throw new Error('Capture stopped.');

      await runInPage(tabId, pageScript, ['move', mode, nextScroll]);
      await pause(350);

      const info = await runInPage(tabId, pageScript, ['read', mode]);

      // Stop if scrolling no longer advances (reached the bottom).
      if (i > 0 && info.scroll <= lastScroll + 1) break;

      // Honor Chrome's capture rate limit.
      const elapsed = Date.now() - lastCaptureAt;
      if (elapsed < MIN_CAPTURE_INTERVAL) await pause(MIN_CAPTURE_INTERVAL - elapsed);
      if (job.cancel) throw new Error('Capture stopped.');

      const data = await chrome.tabs.captureVisibleTab(undefined, { format: 'png' });
      lastCaptureAt = Date.now();
      frames.push({ data, ...info });
      lastScroll = info.scroll;

      await reportStatus(
        `Captured ${frames.length} section(s), scroll ${Math.round(info.scroll)} px`
      );

      // Stop once the bottom of the content is on screen.
      if (info.scroll + info.view >= info.height - 2) break;

      // Advance by ~65% of the visible region for a comfortable overlap.
      const visible = Math.min(info.view, info.clip.bottom - info.clip.top);
      const step = Math.max(50, Math.floor(visible * 0.65));
      nextScroll = info.scroll + step;
    }

    if (!frames.length) throw new Error('No frames captured.');

    return job.format === 'pdf'
      ? await finishAsPDF(frames, breakHints, job)
      : await finishAsPNG(frames, job);
  } finally {
    if (initialized) {
      try {
        await runInPage(tabId, pageScript, ['finish', mode]);
      } catch (_) {
        // Best-effort cleanup; the page may have navigated away.
      }
    }
  }
}

/** Build a PDF from the captured frames and trigger the download. */
async function finishAsPDF(frames, breakHints, job) {
  await reportStatus('Building smart-paginated PDF...');
  const pdf = await encodeSmartPDF(frames, breakHints, job);

  const url = await blobToDataURL(pdf);
  const downloadId = await chrome.downloads.download({
    url,
    filename: `long-screenshot-${Date.now()}.pdf`,
    saveAs: false,
    conflictAction: 'uniquify',
  });
  if (downloadId === undefined) throw new Error('Chrome did not start the PDF download.');

  return { ok: true, frames: frames.length, parts: 1, images: 1, format: 'PDF' };
}

/** Build one continuous PNG from the captured frames and trigger the download. */
async function finishAsPNG(frames, job) {
  await reportStatus('Encoding one continuous PNG...');
  const png = await encodeContinuousPNG(frames, job);
  if (job.cancel) throw new Error('Capture stopped.');

  await reportStatus('Saving one PNG...');
  const url = await blobToDataURL(png);
  const downloadId = await chrome.downloads.download({
    url,
    filename: `long-screenshot-${Date.now()}.png`,
    saveAs: false,
    conflictAction: 'uniquify',
  });
  if (downloadId === undefined) throw new Error('Chrome did not start the PNG download.');

  return { ok: true, frames: frames.length, parts: 1, images: 1 };
}

// ---------------------------------------------------------------------------
// PDF encoder
// ---------------------------------------------------------------------------

/** A4 page size in PDF points. */
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

/** Decode a data URL into an ImageBitmap. */
async function decodeFrame(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

/**
 * Choose page boundaries close to the A4 page height without slicing through
 * important DOM elements. Returns an ascending list of pixel offsets that
 * starts at 0 and ends at `totalHeight`.
 *
 * @param {number} totalHeight - full image height in device pixels
 * @param {number} pageHeight  - preferred page height in device pixels
 * @param {{top:number,bottom:number,priority:number}[]} elements
 * @param {number} scale - device pixel ratio
 */
function choosePageBreaks(totalHeight, pageHeight, elements, scale) {
  const boundaries = [0];
  let start = 0;

  while (start < totalHeight - 1) {
    const target = Math.min(totalHeight, start + pageHeight);
    if (target === totalHeight) {
      boundaries.push(totalHeight);
      break;
    }

    // Only consider breaks in the lower ~27% of the page so pages stay full.
    const minimum = start + Math.round(pageHeight * 0.73);
    let best = target;
    let bestScore = -Infinity;

    for (const el of elements) {
      const top = Math.round(el.top * scale);
      const bottom = Math.round(el.bottom * scale);

      for (const edge of [top, bottom]) {
        if (edge < minimum || edge > target) continue;

        // Reject edges that would cut through a protected element.
        const cutsProtected = elements.some((other) => {
          const a = Math.round(other.top * scale);
          const b = Math.round(other.bottom * scale);
          return a + 3 < edge && edge < b - 3 && other.priority >= 3 && b - a < pageHeight;
        });
        if (cutsProtected) continue;

        // Prefer breaks at protected elements (slightly) and lower on the page.
        const score = edge - (el.priority === 3 ? 0 : 8);
        if (score > bestScore) {
          bestScore = score;
          best = edge;
        }
      }
    }

    if (best <= start) best = target;
    boundaries.push(best);
    start = best;
  }

  return boundaries;
}

/**
 * Assemble a PDF with one JPEG image per A4 page. Each page is rendered by
 * compositing the relevant slices of every captured frame onto a canvas.
 * @param {Array} frames
 * @param {Array} elements - page-break hints from the page script
 * @param {{cancel: boolean}} job
 */
async function encodeSmartPDF(frames, elements, job) {
  const first = frames[0];
  const scale = first.dpr || 1;
  const clip = first.clip;

  const width = Math.round((clip.right - clip.left) * scale);
  const frameHeight = Math.round((clip.bottom - clip.top) * scale);
  const totalHeight = Math.round((frames.at(-1).scroll - first.scroll) * scale) + frameHeight;

  const pageHeight = Math.max(100, Math.floor((width * A4_HEIGHT) / A4_WIDTH));
  const boundaries = choosePageBreaks(totalHeight, pageHeight, elements, scale);

  // --- Minimal PDF writer -------------------------------------------------
  const encoder = new TextEncoder();
  const chunks = [];
  const objectOffsets = [0];
  let position = 0;

  const append = (value) => {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    chunks.push(bytes);
    position += bytes.length;
  };

  // Objects are 1-indexed in PDF; `addObject` returns the object's id.
  const objects = [];
  const addObject = (value) => objects.push(value);

  const catalogId = addObject(null); // filled in after pages are built
  const pagesId = addObject(null);
  const pageIds = [];

  // --- Render each page to a JPEG and register its PDF objects ------------
  const canvas = new OffscreenCanvas(width, pageHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create PDF page canvas.');

  for (let index = 0; index < boundaries.length - 1; index++) {
    if (job.cancel) throw new Error('Capture stopped.');

    const top = boundaries[index];
    const bottom = boundaries[index + 1];
    const pageSlice = bottom - top;

    canvas.height = pageSlice;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, pageSlice);

    // Composite every frame that overlaps this page's vertical range.
    for (const frame of frames) {
      const frameTop = Math.round((frame.scroll - first.scroll) * scale);
      const intersectTop = Math.max(top, frameTop);
      const intersectBottom = Math.min(bottom, frameTop + frameHeight);
      if (intersectBottom <= intersectTop) continue;

      const bitmap = await decodeFrame(frame.data);
      try {
        const srcX = Math.round(clip.left * scale);
        const srcY = Math.round(clip.top * scale) + intersectTop - frameTop;
        const sliceHeight = intersectBottom - intersectTop;
        ctx.drawImage(
          bitmap,
          srcX, srcY, width, sliceHeight,
          0, intersectTop - top, width, sliceHeight
        );
      } finally {
        bitmap.close();
      }
    }

    const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());

    const imageId = addObject({
      stream: jpeg,
      dict:
        `/Type /XObject /Subtype /Image /Width ${width} /Height ${pageSlice} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
    });

    // Draw the image to fill the A4 page width, keeping its aspect ratio.
    const drawHeight = (pageSlice * A4_WIDTH) / width;
    const content = encoder.encode(
      `q ${A4_WIDTH.toFixed(3)} 0 0 ${drawHeight.toFixed(3)} 0 ` +
        `${(A4_HEIGHT - drawHeight).toFixed(3)} cm /Im0 Do Q`
    );
    const contentId = addObject({ stream: content, dict: '' });

    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4_WIDTH} ${A4_HEIGHT}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);

    await reportStatus(`Building smart PDF page ${index + 1}/${boundaries.length - 1}`);
  }

  // Fill in the catalog and page-tree objects now that pages exist.
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] ` +
    `/Count ${pageIds.length} >>`;

  // --- Serialize the PDF body, xref table and trailer --------------------
  append('%PDF-1.4\n');
  for (let i = 0; i < objects.length; i++) {
    objectOffsets.push(position);
    append(`${i + 1} 0 obj\n`);

    const obj = objects[i];
    if (typeof obj === 'string') {
      append(obj);
    } else {
      append(`<< ${obj.dict} /Length ${obj.stream.length} >>\nstream\n`);
      append(obj.stream);
      append('\nendstream');
    }
    append('\nendobj\n');
  }

  const xrefOffset = position;
  append(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i < objectOffsets.length; i++) {
    append(`${String(objectOffsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  append(
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n` +
      `startxref\n${xrefOffset}\n%%EOF`
  );

  return new Blob(chunks, { type: 'application/pdf' });
}

// ---------------------------------------------------------------------------
// PNG encoder
// ---------------------------------------------------------------------------

/** CRC-32 over `bytes`, as required by the PNG chunk format. */
function pngCRC(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Encode a 32-bit unsigned integer as big-endian bytes. */
function uint32(n) {
  return Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
}

/** Build a single PNG chunk (length + type + payload + CRC). */
function pngChunk(name, payload) {
  const type = new TextEncoder().encode(name);
  const body = new Uint8Array(type.length + payload.length);
  body.set(type);
  body.set(payload, type.length);

  const chunk = new Uint8Array(12 + payload.length);
  chunk.set(uint32(payload.length), 0);
  chunk.set(body, 4);
  chunk.set(uint32(pngCRC(body)), 8 + payload.length);
  return chunk;
}

/**
 * Encode all frames into one tall PNG. To avoid allocating a full-height
 * canvas, rows are streamed through a deflate CompressionStream one viewport
 * region at a time.
 * @param {Array} frames
 * @param {{cancel: boolean}} job
 */
async function encodeContinuousPNG(frames, job) {
  const first = frames[0];
  const scale = first.dpr || 1;
  const clip = first.clip;

  const width = Math.round((clip.right - clip.left) * scale);
  const regionHeight = Math.round((clip.bottom - clip.top) * scale);
  const totalHeight = Math.round((frames.at(-1).scroll - first.scroll) * scale) + regionHeight;
  if (width <= 0 || totalHeight <= 0 || totalHeight > 0x7fffffff) {
    throw new Error('Invalid image dimensions.');
  }

  // Compress IDAT data as it is produced.
  const compression = new CompressionStream('deflate');
  const writer = compression.writable.getWriter();
  const reader = compression.readable.getReader();

  const compressedChunks = [];
  const drainCompressed = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      compressedChunks.push(pngChunk('IDAT', value));
    }
  })();

  const canvas = new OffscreenCanvas(width, regionHeight);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Unable to create a small screenshot canvas.');

  let writtenRows = 0;

  try {
    for (let i = 0; i < frames.length; i++) {
      if (job.cancel) throw new Error('Capture stopped.');

      const frame = frames[i];
      const offset = Math.round((frame.scroll - first.scroll) * scale);

      // Skip rows already written by the previous (overlapping) frame.
      const overlap = Math.max(0, writtenRows - offset);
      const startRow = Math.min(regionHeight, overlap);
      const rows = Math.min(regionHeight - startRow, totalHeight - writtenRows);
      if (rows <= 0) continue;

      const bitmap = await decodeFrame(frame.data);
      try {
        ctx.clearRect(0, 0, width, regionHeight);
        ctx.drawImage(
          bitmap,
          Math.round(clip.left * scale), Math.round(clip.top * scale), width, regionHeight,
          0, 0, width, regionHeight
        );

        const pixels = ctx.getImageData(0, startRow, width, rows).data;
        const stride = width * 4;

        // Write in ~1 MB batches, prefixing each scanline with filter byte 0.
        const batchRows = Math.max(1, Math.floor((1024 * 1024) / (stride + 1)));
        for (let y = 0; y < rows; y += batchRows) {
          const count = Math.min(batchRows, rows - y);
          const raw = new Uint8Array(count * (stride + 1));
          for (let r = 0; r < count; r++) {
            raw.set(
              pixels.subarray((y + r) * stride, (y + r + 1) * stride),
              r * (stride + 1) + 1
            );
          }
          await writer.write(raw);
        }
        writtenRows += rows;
      } finally {
        bitmap.close();
      }

      await reportStatus(`Encoding one PNG: ${i + 1}/${frames.length} sections`);
    }

    if (writtenRows !== totalHeight) {
      throw new Error(`Missing screenshot rows (${writtenRows}/${totalHeight}).`);
    }

    await writer.close();
    await drainCompressed;
  } catch (err) {
    await writer.abort(err).catch(() => {});
    await drainCompressed.catch(() => {});
    throw err;
  }

  // IHDR: width, height, 8-bit depth, color type 6 (RGBA).
  const header = new Uint8Array(13);
  header.set(uint32(width), 0);
  header.set(uint32(totalHeight), 4);
  header[8] = 8;
  header[9] = 6;

  const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  return new Blob(
    [
      PNG_SIGNATURE,
      pngChunk('IHDR', header),
      ...compressedChunks,
      pngChunk('IEND', new Uint8Array()),
    ],
    { type: 'image/png' }
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Convert a Blob into a base64 data URL (chunked to avoid call-stack limits). */
async function blobToDataURL(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 0x6000) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x6000)));
  }
  const type = blob.type || 'application/octet-stream';
  return `data:${type};base64,` + btoa(chunks.join(''));
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg.type === 'STOP') {
    for (const job of jobs.values()) job.cancel = true;
    respond({ ok: true });
    return;
  }

  if (msg.type !== 'START') return;

  if (jobs.has(msg.tabId)) {
    respond({ ok: false, error: 'Capture already running.' });
    return;
  }

  const job = { cancel: false, format: msg.format || 'png' };
  jobs.set(msg.tabId, job);
  reportStatus('Starting capture...');

  captureTab(msg.tabId, msg.mode, job)
    .then((result) => {
      reportStatus('Done!');
      respond(result);
    })
    .catch((err) => {
      reportStatus('Error: ' + err.message);
      respond({ ok: false, error: err.message });
    })
    .finally(() => jobs.delete(msg.tabId));

  return true; // keep the message channel open for the async response
});
