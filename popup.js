// Popup UI controller.
// Wires the three buttons to the background service worker and mirrors the
// shared capture status (persisted in chrome.storage.local) into the view.

const statusEl = document.getElementById('status');
const pdfCheckbox = document.getElementById('pdf');

/**
 * Show a message in the status line.
 * @param {string} text
 */
function setStatus(text) {
  statusEl.textContent = text;
}

// Restore the last known status when the popup opens.
chrome.storage.local.get('captureStatus').then(({ captureStatus }) => {
  if (captureStatus) setStatus(captureStatus);
});

// Keep the status line in sync while the popup stays open.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.captureStatus) setStatus(changes.captureStatus.newValue);
});

/**
 * Ask the background worker to capture the active tab.
 * @param {'auto'|'page'} mode - 'auto' finds the best scrollable element,
 *                               'page' captures the main document.
 */
async function startCapture(mode) {
  setStatus('Starting... Keep the page visible and do not scroll.');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const format = pdfCheckbox.checked ? 'pdf' : 'png';

    const result = await chrome.runtime.sendMessage({
      type: 'START',
      tabId: tab.id,
      mode,
      format,
    });

    if (!result?.ok) throw new Error(result?.error || 'Capture failed');

    setStatus(`Done! ${result.format || 'PNG'} saved.`);
  } catch (error) {
    setStatus('Error: ' + error.message);
  }
}

/** Ask the background worker to cancel any running capture. */
async function stopCapture() {
  await chrome.runtime.sendMessage({ type: 'STOP' });
  setStatus('Stopping...');
}

document.getElementById('auto').onclick = () => startCapture('auto');
document.getElementById('page').onclick = () => startCapture('page');
document.getElementById('stop').onclick = stopCapture;
