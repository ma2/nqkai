/** User-Agent からざっくりした端末名を推定する（パスキーの既定表示名用） */
export function deviceLabelFromUA(ua: string | null | undefined): string {
  const s = ua ?? "";
  let device = "パスキー";
  if (/iPhone/.test(s)) device = "iPhone のパスキー";
  else if (/iPad/.test(s)) device = "iPad のパスキー";
  else if (/Android/.test(s)) device = "Android 端末のパスキー";
  else if (/CrOS/.test(s)) device = "Chromebook のパスキー";
  else if (/Macintosh|Mac OS X/.test(s)) device = "Mac のパスキー";
  else if (/Windows/.test(s)) device = "Windows PC のパスキー";
  else if (/Linux/.test(s)) device = "Linux 端末のパスキー";
  return device;
}
