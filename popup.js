// Popup UI controller.
// Wires the three buttons to the background service worker and mirrors the
// shared capture status (persisted in chrome.storage.local) into the view.

const statusEl = document.getElementById('status');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressPercent = document.getElementById('progressPercent');
const progressPhase = document.getElementById('progressPhase');

/** Update the visual progress indicator and accessibility attributes. */
function setProgress(progress) {
  if (!progress) return;
  const value = Math.max(0, Math.min(100, Number(progress.percent) || 0));
  progressFill.style.width = `${value}%`;
  progressPercent.textContent = `${Math.round(value)}%`;
  progressPhase.textContent = progress.phase || 'Capturing';
  progressWrap.dataset.phase = progress.phase || '';
  progressWrap.setAttribute('aria-valuenow', String(Math.round(value)));
  if (progress.detail) setStatus(progress.detail);
}

/**
 * Show a message in the status line.
 * @param {string} text
 */
function setStatus(text) {
  statusEl.textContent = text;
}

// Restore the last known status when the popup opens.
chrome.storage.local.get(['captureStatus', 'captureProgress']).then(({ captureStatus, captureProgress }) => {
  if (captureStatus) setStatus(captureStatus);
  if (captureProgress) setProgress(captureProgress);
});

// Keep the status line in sync while the popup stays open.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.captureStatus) setStatus(changes.captureStatus.newValue);
  if (changes.captureProgress) setProgress(changes.captureProgress.newValue);
});

/**
 * Ask the background worker to capture the active tab.
 * @param {'auto'|'page'} mode - 'auto' finds the best scrollable element,
 *                               'page' captures the main document.
 */
async function startCapture(mode) {
  setProgress({ percent: 0, phase: 'Starting', detail: 'Starting... Keep the page visible and do not scroll.' });

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const result = await chrome.runtime.sendMessage({
      type: 'START',
      tabId: tab.id,
      mode,
    });

    if (!result?.ok) throw new Error(result?.error || 'Capture failed');

    setStatus('Done! Preview opened. Choose PNG or PDF there.');
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
document.getElementById('stop').onclick = stopCapture;
