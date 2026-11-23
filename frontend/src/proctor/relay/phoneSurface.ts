// 휴대폰 JPEG 프레임을 "영상처럼" 보이게 하는 캔버스 스트림 (환경 점검의 책상 스캔·미리보기 전용).
// 책상 스캔은 video 요소를 읽는 기존 코드(check/deskScan.ts)를 그대로 쓰므로, 받은 프레임을 캔버스에 그려
// captureStream 으로 video 에 붙일 수 있게 한다. 감독(시험 중)에는 만들지 않는다: 그 경로는 JPEG 를 분석 Worker 로 바로 넘긴다.

export class PhoneSurface {
  private readonly canvas = document.createElement('canvas')
  private readonly ctx = this.canvas.getContext('2d')
  readonly stream: MediaStream
  private closed = false
  private drawing = false
  private latest: ArrayBuffer | null = null

  constructor() {
    // 프레임이 오지 않을 때(정지 화면)도 마지막 그림이 이어지도록 captureStream 은 그릴 때마다 새 프레임을 만든다
    this.canvas.width = 2
    this.canvas.height = 2
    this.stream = this.canvas.captureStream()
  }

  /** 새 프레임을 그린다. 그리는 중이면 최신 한 장만 남긴다 */
  draw(jpeg: ArrayBuffer): void {
    if (this.closed) return
    this.latest = jpeg
    if (!this.drawing) void this.drawLatest()
  }

  close(): void {
    this.closed = true
    this.stream.getTracks().forEach((t) => t.stop())
  }

  private async drawLatest() {
    this.drawing = true
    try {
      while (this.latest && !this.closed) {
        const buf = this.latest
        this.latest = null
        const bitmap = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' })).catch(() => null)
        if (!bitmap) continue
        if (this.canvas.width !== bitmap.width) this.canvas.width = bitmap.width
        if (this.canvas.height !== bitmap.height) this.canvas.height = bitmap.height
        this.ctx?.drawImage(bitmap, 0, 0)
        bitmap.close()
      }
    } finally {
      this.drawing = false
    }
  }
}
