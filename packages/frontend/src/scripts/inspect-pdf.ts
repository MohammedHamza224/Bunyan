import fs from 'fs'
import zlib from 'zlib'

const pdfPath = 'C:/Users/Lenovo/.gemini/antigravity/brain/56aec371-d4c3-4767-84a3-7d025fbd755e/invoice-bunyan-sample.pdf'
const str = fs.readFileSync(pdfPath).toString('latin1')

// Build ToUnicode CMaps for fonts
const fontObjs: Record<string, Record<string, string>> = {}
const cmapMatches = str.matchAll(/(\d+)\s+0\s+obj[\s\S]*?\/ToUnicode\s+(\d+)\s+0\s+R/g)
for (const m of cmapMatches) {
  const cmapObjNum = m[2]
  const cmapStreamMatch = str.match(new RegExp(`${cmapObjNum}\\s+0\\s+obj[\\s\\S]*?stream\\r?\\n([\\s\\S]*?)\\r?\\nendstream`))
  if (cmapStreamMatch) {
    try {
      const cmapText = zlib.inflateSync(Buffer.from(cmapStreamMatch[1], 'latin1')).toString('utf-8')
      const map: Record<string, string> = {}
      const bfcharMatches = cmapText.matchAll(/<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>/g)
      for (const b of bfcharMatches) {
        const charCode = parseInt(b[1], 16)
        const unicode = String.fromCharCode(parseInt(b[2], 16))
        map[b[1].toLowerCase()] = unicode
      }
      fontObjs[m[1]] = map
    } catch {}
  }
}

// Extract content per page
const pages = str.split(/\/Type\s*\/Page[^s]/)
pages.slice(1).forEach((page, i) => {
  console.log(`\n=================== PAGE ${i + 1} ===================`)
  const contentsMatch = page.match(/\/Contents\s+(\d+)\s+(\d+)\s+R/)
  if (contentsMatch) {
    const objNum = contentsMatch[1]
    const objRegex = new RegExp(`${objNum}\\s+0\\s+obj[\\s\\S]*?stream\\r?\\n([\\s\\S]*?)\\r?\\nendstream`)
    const objMatch = str.match(objRegex)
    if (objMatch) {
      const decompressed = zlib.inflateSync(Buffer.from(objMatch[1], 'latin1')).toString('utf-8')
      // Extract hex strings inside <...> Tj or TJ
      const hexMatches = decompressed.match(/<([0-9a-fA-F]+)>\s*Tj/g) || []
      const extractedWords: string[] = []
      for (const h of hexMatches) {
        const hex = h.replace(/[^0-9a-fA-F]/g, '')
        let word = ''
        for (let j = 0; j < hex.length; j += 4) {
          const chunk = hex.substr(j, 4).toLowerCase()
          // try all maps
          for (const fId in fontObjs) {
            if (fontObjs[fId][chunk]) {
              word += fontObjs[fId][chunk]
              break
            }
          }
        }
        if (word) extractedWords.push(word)
      }
      console.log('Words sample:', extractedWords.slice(0, 30).join(' '))
    }
  }
})
