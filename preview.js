// Local preview of the latest capture. Nothing is downloaded until requested.
const $ = id => document.getElementById(id);
const image = $('image');
const pdf = $('pdf');
let blob = null;
let url = null;
let format = 'png';
let nativeWidth = 0;
let zoom = 100;

function setZoom(value) {
  zoom = Math.min(300, Math.max(10, Math.round(value / 5) * 5));
  $('slider').value = String(zoom);
  $('zoomLabel').textContent = `${zoom}%`;
  if (format === 'png' && nativeWidth) image.style.width = `${Math.max(1, Math.round(nativeWidth * zoom / 100))}px`;
  if (format === 'pdf') pdf.style.width = `${zoom}%`;
}

function loadCapture() {
  const request = indexedDB.open('smart-long-screenshot-preview', 1);
  request.onerror = () => showError(request.error);
  request.onsuccess = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('captures')) {
      db.close(); showError('No capture found. Capture a page first.'); return;
    }
    const tx = db.transaction('captures', 'readonly');
    const get = tx.objectStore('captures').get('latest');
    get.onerror = () => showError(get.error);
    get.onsuccess = () => {
      db.close();
      if (!get.result?.blob) { showError('No capture found. Capture a page first.'); return; }
      ({blob, format} = get.result);
      url = URL.createObjectURL(blob);
      $('exportPng').disabled = false;
      $('exportPdf').disabled = false;
      $('status').textContent = `${format.toUpperCase()} · ${(blob.size / 1048576).toFixed(1)} MB`;
      $('hint').hidden = true;
      if (format === 'pdf') {
        pdf.style.display = 'block';
        pdf.src = url;
        setZoom(100);
      } else {
        image.style.display = 'block';
        image.onload = () => {
          nativeWidth = image.naturalWidth;
          setZoom(Math.min(100, Math.max(10, Math.floor(($('workspace').clientWidth - 48) / nativeWidth * 100 / 5) * 5)));
          $('status').textContent += ` · ${image.naturalWidth} × ${image.naturalHeight}`;
        };
        image.onerror = () => showError('Unable to display this image.');
        image.src = url;
      }
    };
  };
}
function showError(err) {
  $('hint').hidden = true;
  $('error').textContent = `Preview error: ${err?.message || err}`;
  $('status').textContent = 'Preview unavailable';
}
// Keep the content under the gesture focal point stationary while zooming.
function zoomAt(nextZoom, clientX, clientY) {
  const target = format === 'pdf' ? pdf : image;
  const before = target.getBoundingClientRect();
  if (!before.width || !before.height) { setZoom(nextZoom); return; }
  const xRatio = (clientX - before.left) / before.width;
  const yRatio = (clientY - before.top) / before.height;
  setZoom(nextZoom);
  const after = target.getBoundingClientRect();
  window.scrollBy({
    left: (after.left + xRatio * after.width) - clientX,
    top: (after.top + yRatio * after.height) - clientY,
    behavior: 'instant'
  });
}

// On macOS, trackpad pinch-to-zoom commonly produces Ctrl+wheel events.
$('workspace').addEventListener('wheel', event => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * 0.012);
  zoomAt(zoom * factor, event.clientX, event.clientY);
}, { passive: false });

// Support browsers that expose native trackpad gesture events.
let gestureStartZoom = 100;
$('workspace').addEventListener('gesturestart', event => {
  event.preventDefault();
  gestureStartZoom = zoom;
}, { passive: false });
$('workspace').addEventListener('gesturechange', event => {
  event.preventDefault();
  zoomAt(gestureStartZoom * event.scale, event.clientX, event.clientY);
}, { passive: false });
$('workspace').addEventListener('gestureend', event => event.preventDefault(), { passive: false });

$('minus').addEventListener('click', () => setZoom(zoom - 10));
$('plus').addEventListener('click', () => setZoom(zoom + 10));
$('slider').addEventListener('input', event => setZoom(Number(event.target.value)));
$('actual').addEventListener('click', () => setZoom(100));
$('fit').addEventListener('click', () => {
  if (format === 'png' && nativeWidth) setZoom(($('workspace').clientWidth - 48) / nativeWidth * 100);
  else setZoom(100);
});
function downloadBlob(fileBlob, extension) {
  const objectUrl = URL.createObjectURL(fileBlob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `long-screenshot-${Date.now()}.${extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}
$('exportPng').addEventListener('click', () => {
  if (blob) downloadBlob(blob, 'png');
});
$('exportPdf').addEventListener('click', async () => {
  const button = $('exportPdf');
  button.disabled = true;
  $('status').textContent = 'Creating smart-split A4 PDF…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'EXPORT_PDF' });
    if (!result?.ok) throw new Error(result?.error || 'PDF conversion failed');
    const pdfBlob = await new Promise((resolve, reject) => {
      const request = indexedDB.open('smart-long-screenshot-preview', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('captures', 'readonly');
        const get = tx.objectStore('captures').get('latest');
        get.onerror = () => { db.close(); reject(get.error); };
        get.onsuccess = () => { const value = get.result?.pdfBlob; db.close(); resolve(value); };
      };
    });
    if (!pdfBlob) throw new Error('PDF data is missing');
    downloadBlob(pdfBlob, 'pdf');
    $('status').textContent = `PDF ready · ${(pdfBlob.size / 1048576).toFixed(1)} MB`;
  } catch (error) {
    $('status').textContent = `PDF export failed: ${error.message}`;
  } finally {
    button.disabled = false;
  }
});
window.addEventListener('pagehide', () => { if (url) URL.revokeObjectURL(url); });
loadCapture();
