export function buildPlayerProfileUrl(uid: string): string {
  const cleanUid = uid.trim();
  if (!cleanUid) throw new Error('Rivals Data requires a Marvel Rivals UID.');
  return `https://rivalsdata.com/player/${encodeURIComponent(cleanUid)}`;
}
