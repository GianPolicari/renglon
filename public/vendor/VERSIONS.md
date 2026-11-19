# Third-party files (pinned)

| File | Package | Version | License |
|---|---|---|---|
| `pdfjs/pdf.min.mjs`, `pdfjs/pdf.worker.min.mjs` | pdfjs-dist (Mozilla PDF.js) | 4.10.38 | Apache-2.0 (`pdfjs/LICENSE`) |
| `../assets/fonts/plex-sans-latin-wght.woff2` | @fontsource-variable/ibm-plex-sans | 5.3.0 | OFL-1.1 (`../assets/fonts/LICENSE-ibm-plex-sans.txt`) |
| `../assets/fonts/source-serif-4-latin-wght.woff2` | @fontsource-variable/source-serif-4 | 5.3.1 | OFL-1.1 (`../assets/fonts/LICENSE-source-serif-4.txt`) |

PDF.js is loaded with `isEvalSupported: false` and only when a file is chosen. The .xlsx file is written by
`/xlsx-lite.js` (no third-party code).
