// The warehouse operates on Philippines time (UTC+8, same offset as Singapore) —
// display timestamps in that zone regardless of the server's or viewer's own locale.
const TIME_ZONE = 'Asia/Singapore'

function toDate(value: string | Date) {
  return typeof value === 'string' ? new Date(value) : value
}

export function formatDateTime(value: string | Date) {
  return toDate(value).toLocaleString('en-US', { timeZone: TIME_ZONE })
}

export function formatDate(value: string | Date) {
  return toDate(value).toLocaleDateString('en-US', { timeZone: TIME_ZONE })
}

export function formatDateShort(value: string | Date) {
  return toDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TIME_ZONE })
}

export function formatDateLong(value: string | Date) {
  return toDate(value).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: TIME_ZONE,
  })
}
