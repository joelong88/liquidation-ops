// The warehouse operates on Philippines time (UTC+8, same offset as Singapore) —
// display timestamps in that zone regardless of the server's or viewer's own locale.
const TIME_ZONE = 'Asia/Singapore'

function toDate(value: string | Date) {
  return typeof value === 'string' ? new Date(value) : value
}

// Everywhere in the app: "26 Aug 2026" style, never bare numeric MM/DD/YYYY — an
// operator reading a scan log shouldn't have to guess which number is the month.
export function formatDate(value: string | Date) {
  return toDate(value).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: TIME_ZONE,
  })
}

export function formatDateTime(value: string | Date) {
  return toDate(value).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  })
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
