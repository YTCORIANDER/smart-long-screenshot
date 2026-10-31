# Smart Long Screenshot

**Capture long webpages and nested scrollable content, preview the result, and export it as PNG or A4 PDF.**

Smart Long Screenshot is a **Google Chrome extension** built with **JavaScript, HTML, CSS, and Chrome Extension Manifest V3**. It runs directly in the Chrome browser—no separate desktop application is required. The extension captures content in overlapping frames, stitches them into a continuous image, and provides a preview before export. It is designed for pages where ordinary full-page screenshots can miss content inside independently scrolling panels.

## Built for Google Chrome

All capture, image processing, preview, and export operations are handled in the Chrome browser environment. The extension uses Chrome Extension APIs to work with the active tab and capture visible content as the page scrolls.

| Component | Role |
| --- | --- |
| **Popup interface** (`popup.html`, `popup.js`) | Start or stop captures and view progress. |
| **Background service worker** (`background.js`) | Coordinate scrolling, frame capture, stitching, and export processing. |
| **Chrome APIs** | Interact with the active tab, execute page-side scripts, capture visible frames, and download results. |
| **Preview interface** (`preview.html`, `preview.js`) | Inspect the result, adjust zoom, and choose PNG or A4 PDF export. |
| **Browser storage** | Retain capture progress and temporary data used for preview/export. |

The extension can be installed locally through Chrome's **Load unpacked** option; publication in the Chrome Web Store is not required for local testing.

## Key Features

- **Long screenshot capture** — capture content beyond the visible viewport.
- **Nested scrollable containers** — handle content inside independently scrolling regions.
- **Overlap-aware stitching** — use shared areas between frames to reduce gaps and duplication.
- **Sticky-header handling** — mitigate repeated toolbars and fixed elements where possible.
- **Live progress** — see capture percentage and processing status in the extension popup; progress persists if the popup is closed and reopened.
- **Screenshot preview** — inspect the result with zoom buttons, a slider, fit-to-width, 100% view, and supported trackpad pinch zoom.
- **PNG export** — save the stitched screenshot as an image.
- **A4 PDF export** — generate a paginated PDF on demand using captured frames and page-splitting logic.
- **Stop capture** — cancel an ongoing capture from the popup.

## Installation

Smart Long Screenshot can be installed manually through Google Chrome using **Developer Mode**.

### Step 1: Download the Extension

1. Open the [Smart Long Screenshot GitHub repository](https://github.com/YTCORIANDER/smart-long-screenshot).
2. Click the green **Code** button near the top of the repository.
3. Select **Download ZIP** from the dropdown menu.
4. Wait for the ZIP file to finish downloading.
5. Locate the downloaded ZIP file on your computer, usually in the **Downloads** folder.
6. Extract the ZIP file:
   - **Windows:** Right-click the ZIP file and select **Extract All**.
   - **macOS:** Double-click the ZIP file to extract it.
7. Open the extracted folder and locate the extension files, including `manifest.json`.

> **Important:** Do not select the ZIP file when installing the extension. Chrome requires the extracted folder containing `manifest.json`.

### Step 2: Open Chrome Extensions

1. Open **Google Chrome**.
2. Enter `chrome://extensions` in the address bar.
3. Press **Enter**.
4. Enable **Developer mode** using the toggle in the upper-right corner.

### Step 3: Load the Extension

1. Click **Load unpacked** in the upper-left corner.
2. Navigate to the extracted Smart Long Screenshot folder.
3. Select the folder that directly contains `manifest.json`.
4. Click **Select Folder** (Windows) or **Open** (macOS).
5. Chrome will load the extension.

### Step 4: Pin the Extension

1. Click the **Extensions** icon (puzzle piece) in the Chrome toolbar.
2. Find **Smart Long Screenshot**.
3. Click the **Pin** icon to keep it visible in the toolbar.

### Step 5: Start Using the Extension

1. Open the webpage you want to capture.
2. Click the **Smart Long Screenshot** icon in the Chrome toolbar.
3. Start the screenshot capture.
4. Wait for the extension to finish capturing and processing the webpage.
5. Review the generated screenshot in the preview interface.
6. Export the screenshot as a **PNG image** or **PDF document**.

### Notes

- Google Chrome is required.
- No separate desktop application is needed.
- The extension runs directly within the Chrome browser.
- Keep the extracted extension folder on your computer. Moving or deleting it may prevent Chrome from loading the extension correctly.
- If you download an updated version, extract it and reload the extension from `chrome://extensions`.

> This is a source installation guide, not a claim that the extension is published in the Chrome Web Store.

## How to Use

1. Open the webpage or scrollable document you want to capture.
2. Click the **Smart Long Screenshot** extension icon.
3. Select **Capture Scrollable Content**.
4. Watch the capture and stitching progress in the popup. You can use **Stop Capture** if needed.
5. When the capture is ready, inspect it in the **Screenshot Preview**.
6. Choose **Export PNG** or **Export PDF (A4)**.

## How It Works

```text
User clicks Capture Scrollable Content
                  |
                  v
       Detect target scroll region
                  |
                  v
      Scroll and capture PNG frames
                  |
                  v
       Calculate overlap boundaries
                  |
                  v
       Stitch into a long screenshot
                  |
                  v
             Preview result
                  |
            +-----+-----+
            |           |
            v           v
        Export PNG   Export PDF (A4)
```

The capture pipeline uses Chrome's screenshot API, scroll-position tracking, and overlap-aware seam selection. The implementation also uses **OffscreenCanvas** and **CompressionStream** for image processing and **IndexedDB** for preview/export data. PDF output is generated on demand from the captured content.

## Project Structure

```text
smart-long-screenshot/
├── manifest.json       # Manifest V3 configuration
├── background.js       # Capture orchestration, stitching, and export logic
├── popup.html          # Extension popup interface
├── popup.js            # Popup controls and progress display
├── preview.html        # Screenshot preview interface
├── preview.js          # Zoom, preview, and export interactions
├── README.md           # Project documentation
└── LICENSE             # MIT license
```

## Technical Highlights

### Overlapping frames

Instead of assuming each scroll step perfectly matches the viewport height, the extension captures overlapping frames and computes stitching boundaries. This helps preserve continuity when pages have complex scrolling behavior.

### Long-image processing

Very tall images can exceed practical browser canvas limits. The implementation uses chunk-oriented processing and streamed PNG encoding rather than relying exclusively on a single enormous canvas.

### PDF generation

PDF export is available from the preview interface. The PDF is built on demand with A4 pagination and logic intended to avoid awkward splits and duplicated content.

## Limitations

- Results can vary on websites with highly dynamic layouts, animations, or changing content.
- Sticky or fixed elements may still create artifacts on some pages.
- Extremely large captures depend on available browser memory and device resources.
- Chrome internal pages and other restricted pages may not permit extension screenshot operations.
- PDF export converts captured visual content into pages; it does not reconstruct the webpage as selectable HTML text.

## Documentation

Explore the [project Wiki](https://github.com/YTCORIANDER/smart-long-screenshot/wiki) for more details:

- [Key Features](https://github.com/YTCORIANDER/smart-long-screenshot/wiki/Key-Features)
- [How It Works](https://github.com/YTCORIANDER/smart-long-screenshot/wiki/How-It-Works)
- [Image Stitching](https://github.com/YTCORIANDER/smart-long-screenshot/wiki/Image-Stitching)
- [Technical Architecture](https://github.com/YTCORIANDER/smart-long-screenshot/wiki/Technical-Architecture)
- [Technical Learning Reflection](https://github.com/YTCORIANDER/smart-long-screenshot/wiki/Technical-Learning-Reflection)

## License

Released under the **MIT License**. See [LICENSE](LICENSE).
