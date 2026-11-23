// JPEG 바이트 → data URL. 이벤트 사진·증거 구간 사진은 data URL 문자열로 서버에 보낸다.

const CHUNK = 0x8000

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return jpegToDataUrl(await blob.arrayBuffer())
}

/** JPEG 바이트를 "data:image/jpeg;base64,..." 로 바꾼다 (큰 배열도 안전하게 나눠서 변환) */
export function jpegToDataUrl(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return `data:image/jpeg;base64,${btoa(bin)}`
}
