# Privacy Policy — Smart Long Screenshot

**Last updated:** November 2, 2026

Smart Long Screenshot is a Google Chrome extension that captures long webpages and content within scrollable containers, combines captured sections, and lets users preview and export screenshots as PNG or PDF files.

This policy describes how the extension handles information when you use it. It is based on the extension source code reviewed for version 1.0.30.

**We do not collect, track, sell, or transmit user data to the developer or third parties. Your screenshots stay on your device.** The extension processes webpage content locally to provide the screenshot features you request. Some capture data is stored locally in your browser as explained below.

## 1. Information the Extension Processes

When you start a capture, the extension processes visual content from the selected browser tab. Screenshots may contain webpage text, images, and any other information visible in the captured area, including personal or sensitive information if it appears on the page.

The extension also processes information needed to perform the capture, such as scroll positions, content dimensions, capture progress, and temporary screenshot frames.

## 2. How Information Is Used

Captured content is used only to create the screenshot you request, display its preview, and generate PNG or PDF exports. Capture-related state is used to coordinate the process and show progress.

## 3. No Data Collection and Local Processing

Smart Long Screenshot does not collect personal information, browsing history, or screenshot content for the developer. It does not use analytics, advertising trackers, or remote screenshot processing services.

In the reviewed version, screenshot capture, image stitching, preview generation, and PDF generation run within the Chrome browser. The reviewed source code does not contain functionality to upload captured screenshots or webpage content to a developer-operated server or third-party service.

The extension does not include advertising or analytics integrations in the reviewed source code. It does not sell captured content or use it for advertising, profiling, or creditworthiness decisions. **Local processing and storage described in this policy do not mean that the developer collects the data.**

## 4. Local Storage and Retention

Although we do not collect user data, the extension stores certain capture information **locally on your device** to make previewing and exporting screenshots possible. This data is not uploaded to us.

The extension uses Chrome's local extension storage to maintain capture status and progress. It also uses browser IndexedDB storage to retain the most recent capture and associated data needed for preview and export. Generating another capture can replace the previously saved capture record.

**Closing the preview does not necessarily delete the saved capture.** The reviewed version does not implement an automatic time-based deletion policy for this locally stored capture. Users can remove extension-managed local data through Chrome's site/extension data controls or by uninstalling the extension, subject to Chrome's behavior.

Files that you explicitly export are saved to your device and remain there until you delete them.

## 5. Permissions

The extension requests the following Chrome permissions to perform its screenshot function:

- **activeTab:** Access the active tab when you initiate a capture.
- **scripting:** Inspect page layout and scrollable regions and coordinate scrolling during capture.
- **tabs:** Identify and interact with the tab being captured and open the local preview.
- **downloads:** Support saving generated output files.
- **storage:** Store local capture status and progress.

These permissions support the extension's single purpose: capturing, previewing, and exporting long webpage screenshots.

## 6. Sharing and Third Parties

The reviewed extension does not transmit captured content to the developer or to third parties. If you choose to share or upload an exported screenshot yourself, that action is outside the extension's control and is governed by the destination service's policies.

## 7. Your Choices

You decide when to start or cancel a capture and whether to export the result. Avoid capturing sensitive information unless you are comfortable storing it locally and in any exported files. You can delete exported files using your operating system and remove the extension's locally stored data through Chrome.

## 8. Changes to This Policy

This policy may be updated if the extension's features or data-handling practices change. The latest version will be published in this repository with an updated date.

## 9. Contact

For privacy questions or concerns, please open an issue in the project's GitHub repository:

https://github.com/YTCORIANDER/smart-long-screenshot/issues

---

**Scope note:** This policy reflects the source code reviewed for version 1.0.31. Before publishing an updated extension, review this policy against the exact package submitted to the Chrome Web Store.
