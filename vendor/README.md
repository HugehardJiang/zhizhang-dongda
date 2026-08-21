# Bundled PDF renderer licenses

The desktop curriculum PDF export bundles the following browser libraries so it
works in an unpacked extension without a network dependency:

- `html2canvas.min.js` 1.4.1 — MIT License, source: https://github.com/niklasvonhertzen/html2canvas
- `jspdf.umd.min.js` 2.5.1 — MIT License, source: https://github.com/parallax/jsPDF

The original license headers are retained in both minified files. These files
are used only by the desktop browser extension; the Android shell does not show
the curriculum entry or load the curriculum export UI.
