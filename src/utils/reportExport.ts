export type ExportCell = string | number;
export type ExportSheet = { name: string; rows: ExportCell[][] };

// Quote every cell, retain Cyrillic in Excel, and keep user-supplied text literal.
export function encodeCsv(rows: ExportCell[][]) {
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((value) => {
            const text =
              typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(value)
                ? `'${value}`
                : String(value);
            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(';')
      )
      .join('\r\n')
  );
}
export function downloadCsv(rows: ExportCell[][], filename: string) {
  const url = URL.createObjectURL(new Blob([encodeCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadWorkbook(sheets: ExportSheet[], filename: string) {
  const xlsx = await import('xlsx');
  const workbook = xlsx.utils.book_new();
  for (const sheet of sheets)
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(sheet.rows), sheet.name);
  xlsx.writeFile(workbook, filename);
}
