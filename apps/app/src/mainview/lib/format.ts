// Pure formatting utilities. No Td types, no TDLib dependency.

export function formatTime(timestamp: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const dayMs = 86_400_000;

  if (diffMs < dayMs && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffMs < 7 * dayMs) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatLastSeen(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return 'last seen just now';
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return `last seen ${mins} minute${mins !== 1 ? 's' : ''} ago`;
  }
  if (diffSec < 43200) {
    const hours = Math.floor(diffSec / 3600);
    return `last seen ${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }
  if (date.toDateString() === now.toDateString()) {
    return `last seen today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `last seen yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return `last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}
