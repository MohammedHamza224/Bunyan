import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const htmlPath = 'C:/Users/Lenovo/.gemini/antigravity/brain/56aec371-d4c3-4767-84a3-7d025fbd755e/invoice-bunyan-sample.html'
let html = fs.readFileSync(htmlPath, 'utf-8')

// Add print tuning
const printFix = `
<style>
  @page {
    size: A4 portrait;
    margin: 8mm 8mm 8mm 8mm;
  }
  @media print {
    html, body {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      font-size: 10px !important;
    }
    .a4-wrapper {
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .a4-print-sheet {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
      border: none !important;
    }
    .space-y-4 > * + * {
      margin-top: 0.4rem !important;
    }
  }
</style>
`

html = html.replace('</head>', `${printFix}</head>`)
html = html.replace('<div style="max-width: 900px; margin: 0 auto;">', '<div class="a4-wrapper" style="max-width: 900px; margin: 0 auto;">')

const outPath = 'C:/Users/Lenovo/.gemini/antigravity/brain/56aec371-d4c3-4767-84a3-7d025fbd755e/invoice-bunyan-tuned.html'
fs.writeFileSync(outPath, html, 'utf-8')

const pdfPath = 'C:/Users/Lenovo/.gemini/antigravity/brain/56aec371-d4c3-4767-84a3-7d025fbd755e/invoice-bunyan-tuned.pdf'
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

execSync(`"${edgePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "file:///${outPath}"`)

const pdfBytes = fs.readFileSync(pdfPath)
const pdfText = pdfBytes.toString('latin1')
const pageMatches = pdfText.match(/\/Type\s*\/Page[^s]/g)
console.log('Tuned PDF page count:', pageMatches ? pageMatches.length : 0)
