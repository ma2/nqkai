export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** multipart のフィールドを検証して File を取り出す。 */
export function validateImageUpload(
  entry: FormDataEntryValue | null,
): { file: File } | { error: string } {
  if (!(entry instanceof File) || entry.size === 0) {
    return { error: "画像ファイルを選択してください" };
  }
  if (!IMAGE_TYPES.includes(entry.type)) {
    return { error: "PNG / JPEG / WebP のみ対応しています" };
  }
  if (entry.size > IMAGE_MAX_BYTES) {
    return { error: "画像は 2MB 以下にしてください" };
  }
  return { file: entry };
}

/** R2 へ画像を保存し、旧オブジェクトがあれば削除する。 */
export async function replaceImage(
  bucket: R2Bucket,
  newKey: string,
  file: File,
  prevKey: string | null,
): Promise<void> {
  await bucket.put(newKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  if (prevKey && prevKey !== newKey) await bucket.delete(prevKey);
}

/** R2 のオブジェクトを Response としてストリームする（画像配信リソースルート用）。 */
export async function streamImage(bucket: R2Bucket, key: string): Promise<Response> {
  const object = await bucket.get(key);
  if (!object) throw new Response(null, { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=300",
      etag: object.httpEtag,
    },
  });
}
