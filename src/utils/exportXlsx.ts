import { utils, write } from 'xlsx';

export function exportAttendanceToXlsx(
  attendance: Array<{ id: string; name?: string; firstSeen: string; lastSeen: string }>
) {
  const ws = utils.json_to_sheet(attendance);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'attendance');
  const wbout = write(wb, { bookType: 'xlsx', type: 'binary' });

  function s2ab(s: string) {
    const buf = new ArrayBuffer(s.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i !== s.length; ++i) view[i] = s.charCodeAt(i) & 0xff;
    return buf;
  }

  const blob = new Blob([s2ab(wbout)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance_${new Date().toISOString()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
