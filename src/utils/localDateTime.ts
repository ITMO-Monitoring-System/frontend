// datetime-local has no offset. Interpret it in the browser's timezone before sending UTC.
export function localDateTimeToISO(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error('Укажите корректные дату и время лекции');
  }
  const date = new Date(value);
  const [year, month, day, hour, minute] = value.split(/\D/).map(Number);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    throw new Error('Укажите корректные дату и время лекции');
  }
  return date.toISOString();
}
