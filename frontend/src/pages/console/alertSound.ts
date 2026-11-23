// 감독관 콘솔 새 이벤트 알림음. 파일 없이 Web Audio 로 짧은 두 음을 낸다.
// 브라우저는 사용자가 페이지를 한 번 만지기 전에는 소리를 막는다. 콘솔을 쓰는 중이면 이미 풀려 있고, 막혀 있으면 조용히 건너뛴다.

const STORAGE_KEY = 'pair.console.eventSound'
const TONES: ReadonlyArray<{ freq: number; start: number }> = [
  { freq: 880, start: 0 },
  { freq: 660, start: 0.16 },
]
const TONE_SECONDS = 0.14
const VOLUME = 0.12

let ctx: AudioContext | null = null

/** 저장된 설정. 처음엔 켜짐 */
export function loadSoundPref(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function saveSoundPref(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // 저장소를 못 써도 이번 화면에서는 동작한다
  }
}

export function playAlertSound(): void {
  const Ctor = window.AudioContext
  if (!Ctor) return
  ctx ??= new Ctor()
  const audio = ctx
  void audio
    .resume()
    .then(() => {
      if (audio.state !== 'running') return
      const base = audio.currentTime
      for (const { freq, start } of TONES) {
        const osc = audio.createOscillator()
        const gain = audio.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        // 딸깍 소리가 나지 않게 짧게 올렸다 내린다
        gain.gain.setValueAtTime(0, base + start)
        gain.gain.linearRampToValueAtTime(VOLUME, base + start + 0.02)
        gain.gain.linearRampToValueAtTime(0, base + start + TONE_SECONDS)
        osc.connect(gain).connect(audio.destination)
        osc.start(base + start)
        osc.stop(base + start + TONE_SECONDS + 0.02)
      }
    })
    .catch(() => undefined)
}
