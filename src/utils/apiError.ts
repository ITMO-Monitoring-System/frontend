import axios from 'axios';

export function apiError(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) return fallback;
  const status = error.response?.status;
  if (status === 409)
    return 'Запись с таким кодом, ИСУ или псевдонимом уже существует либо используется. Проверьте данные.';
  if (status === 403) return 'Недостаточно прав для этого действия.';
  if (status === 404) return 'Запись не найдена. Обновите список и проверьте выбранные данные.';
  const message = error.response?.data?.error;
  if (status === 400 && typeof message === 'string') return message.replace(/^invalid input: /, '');
  return fallback;
}
