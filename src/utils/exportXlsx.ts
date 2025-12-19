function escapeCell(v: any) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[,"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

// old function kept (exports arbitrary rows)
export function exportAttendanceToXlsx(rows: any[], filename = 'export.csv') {
  if (!rows || !Array.isArray(rows)) rows = []
  let outName = filename
  if (outName.toLowerCase().endsWith('.xlsx')) outName = outName.replace(/\.xlsx$/i, '.csv')

  if (rows.length === 0) {
    const blob = new Blob([`\uFEFF`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = outName
    a.click()
    URL.revokeObjectURL(url)
    return
  }

  const keys: string[] = []
  rows.forEach(r => Object.keys(r).forEach(k => { if (!keys.includes(k)) keys.push(k) }))

  const header = keys.join(',')
  const lines = rows.map(r => keys.map(k => escapeCell(r[k])).join(','))
  const csv = [header, ...lines].join('\r\n')
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = outName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// NEW: export sessions attendance table
// sessionAttendanceMap: Record<lectureId, Set<userId>>
// usersById: Record<userId, displayName>
export function exportSessionsToXlsx(sessionAttendanceMap: Record<string, Set<string>>, usersById: Record<string, string> = {}, filename = 'attendance_by_lecture.csv') {
  // collect lecture ids in chronological-ish order of keys
  const lectureIds = Object.keys(sessionAttendanceMap)
  if (lectureIds.length === 0) {
    const blob = new Blob([`\uFEFF`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return
  }

  // collect all unique user ids across sessions
  const userSet = new Set<string>()
  lectureIds.forEach(lid => {
    const s = sessionAttendanceMap[lid]
    if (!s) return
    s.forEach(id => userSet.add(id))
  })

  // if nobody found, create empty CSV
  if (userSet.size === 0) {
    const blob = new Blob([`\uFEFF`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return
  }

  const users = Array.from(userSet).sort((a,b) => (usersById[a] || a).localeCompare(usersById[b] || b))

  // build header: Name, lecture_1, lecture_2, ..., total
  const header = ['Person', ...lectureIds.map(l => `lecture_${l}`), 'total']

  const rows = users.map(uid => {
    const row: any[] = []
    row.push(usersById[uid] || uid)
    let total = 0
    lectureIds.forEach(lid => {
      const set = sessionAttendanceMap[lid]
      const present = set && set.has(uid) ? 1 : 0
      row.push(present)
      total += present
    })
    row.push(total)
    return row
  })

  // convert to CSV
  const csvLines = []
  csvLines.push(header.map(escapeCell).join(','))
  rows.forEach(r => csvLines.push(r.map(escapeCell).join(',')))
  const csv = csvLines.join('\r\n')
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
