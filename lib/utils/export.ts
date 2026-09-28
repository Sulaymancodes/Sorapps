export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

export function downloadExcelTable(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: string[][]
) {
  const headerRow = headers
    .map((header) => `<Cell><Data ss:Type="String">${xmlEscape(header)}</Data></Cell>`)
    .join('')
  const body = rows
    .map(
      (row) =>
        `<Row>${row
          .map((cell) => `<Cell><Data ss:Type="String">${xmlEscape(cell)}</Data></Cell>`)
          .join('')}</Row>`
    )
    .join('')

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="${xmlEscape(sheetName)}">
  <Table>
   <Row>${headerRow}</Row>
   ${body}
  </Table>
 </Worksheet>
</Workbook>`

  downloadBlob(
    filename.endsWith('.xls') ? filename : `${filename}.xls`,
    new Blob([xml], { type: 'application/vnd.ms-excel' })
  )
}

function pdfPageContent(params: {
  title: string
  subtitle: string
  headers: string[]
  rows: string[][]
  page: number
  pageCount: number
  colX: number[]
}) {
  const pageWidth = 842
  const pageHeight = 595
  const margin = 36
  const lines: string[] = []
  const yTitle = pageHeight - margin - 8

  lines.push('BT')
  lines.push('/F1 14 Tf')
  lines.push(`1 0 0 1 ${margin} ${yTitle} Tm`)
  lines.push(`(${pdfEscape(params.title)}) Tj`)
  lines.push('/F1 9 Tf')
  lines.push(`1 0 0 1 ${margin} ${yTitle - 16} Tm`)
  lines.push(`(${pdfEscape(params.subtitle)}) Tj`)
  lines.push(`1 0 0 1 ${pageWidth - 120} ${yTitle - 16} Tm`)
  lines.push(`(${pdfEscape(`Page ${params.page} of ${params.pageCount}`)}) Tj`)

  const headerY = yTitle - 40
  lines.push('/F1 8 Tf')
  params.headers.forEach((header, index) => {
    lines.push(`1 0 0 1 ${params.colX[index]} ${headerY} Tm`)
    lines.push(`(${pdfEscape(header)}) Tj`)
  })

  let y = headerY - 18
  params.rows.forEach((row) => {
    row.forEach((cell, index) => {
      lines.push(`1 0 0 1 ${params.colX[index]} ${y} Tm`)
      lines.push(`(${pdfEscape(cell)}) Tj`)
    })
    y -= 16
  })
  lines.push('ET')

  lines.unshift(`${margin} ${headerY - 4} m ${pageWidth - margin} ${headerY - 4} l S`)
  lines.unshift('0.6 w')
  return lines.join('\n')
}

export function downloadPdfTable(
  filename: string,
  title: string,
  subtitle: string,
  headers: string[],
  rows: string[][]
) {
  const colX = [36, 170, 320, 410, 500]
  const rowsPerPage = 28
  const chunks: string[][][] = []
  for (let i = 0; i < rows.length; i += rowsPerPage) {
    chunks.push(rows.slice(i, i + rowsPerPage))
  }
  if (!chunks.length) chunks.push([])

  const objects: string[] = []
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')

  const pageCount = chunks.length
  const pageObjectNumbers = chunks.map((_, index) => 4 + index * 2)
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageCount} >>`
  )
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  chunks.forEach((chunk, index) => {
    const stream = pdfPageContent({
      title,
      subtitle,
      headers,
      rows: chunk,
      page: index + 1,
      pageCount,
      colX,
    })
    const pageNumber = 4 + index * 2
    const contentNumber = pageNumber + 1
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Contents ${contentNumber} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`
    )
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`

  downloadBlob(
    filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
    new Blob([pdf], { type: 'application/pdf' })
  )
}
