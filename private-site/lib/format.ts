/** Business dates use New York time, wherever the server or browser is. */
export const APP_TZ = 'America/New_York';

/** Today's calendar date in New York, as a local Date at midnight. */
export function todayInAppTz(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return new Date(get('year'), get('month') - 1, get('day'));
}
