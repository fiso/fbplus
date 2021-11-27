export const flashbackUrl = 'https://www.flashback.org';

const p = (n: number) => String(n).padStart(2, '0');

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatDateAndTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${formatDate(timestamp)}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function flashbackThreadLink(threadId: string, pageIndex?: number) {
  return `${flashbackUrl}/t${threadId}${
    typeof pageIndex === 'number' ? `p${pageIndex + 1}` : ''
  }`;
}
