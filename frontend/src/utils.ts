
export function utcToLocalString(utcString: string, timeZone: string): string {
  const dateObj = new Date(utcString);
  return dateObj.toLocaleString('en-US', { timeZone });
}

export function localToUTCString(localDateTime: string): string | null {
  if (!localDateTime) return null;
  const d = new Date(localDateTime);
  return d.toISOString(); // from local to UTC
}