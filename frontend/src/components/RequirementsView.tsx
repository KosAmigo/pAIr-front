// 요구사항 표시 (DESIGN.md §6.16): '만들 기능' 카드(시그니처·한 문장·매개변수) + '예시' 표(입력 / 결과).
// 응시 화면, 과제 미리보기, 과제 검수 상세, 만드는 중인 과제 상세가 모두 이 컴포넌트 하나를 쓴다.
// 읽을 수 있는 줄이 하나도 없으면(그냥 글만) 예전처럼 번호 목록으로 보여 준다. 좁은 곳(응시 화면 옆 패널)은 컨테이너 폭을 보고 표가 카드로 바뀐다.
import { useMemo } from 'react'
import { cx } from './cx'
import { hasStructure, methodOf, parseRequirements, splitCalls, splitSignature, type ReqTable } from '../data/requirements'

const code = 'font-mono text-[13px] leading-5'

function Signature({ sig }: { sig: string }) {
  const { before, name, after } = splitSignature(sig)
  return (
    <code className={cx(code, 'block break-all whitespace-pre-wrap text-text-muted')}>
      {before}
      {name && <b className="font-bold text-brand">{name}</b>}
      {after}
    </code>
  )
}

/** 예시 입력: 호출은 줄마다 코드로, 남은 한국어 말은 작은 보조 글로 (원문 값·순서 그대로) */
function Input({ text }: { text: string }) {
  const parts = splitCalls(text)
  return (
    <span className="flex flex-col gap-0.5">
      {parts.map((p, i) =>
        p.kind === 'call' ? (
          <code key={i} className={cx(code, 'break-all whitespace-pre-wrap text-text')}>
            {p.text}
          </code>
        ) : parts.length === 1 ? (
          <code key={i} className={cx(code, 'break-all whitespace-pre-wrap text-text')}>
            {p.text}
          </code>
        ) : (
          <span key={i} className="text-[12px] leading-5 break-keep text-text-muted">
            {p.text}
          </span>
        ),
      )}
    </span>
  )
}

/** 함수 하나의 예시: 준비 상자(있으면 한 번) + 매개변수 | 결과 표 */
function ExampleTable({ t, showTitle }: { t: ReqTable; showTitle: boolean }) {
  return (
    <div data-testid="req-table" className="flex flex-col gap-1.5">
      {showTitle && <code className={cx(code, 'font-semibold text-text')}>{t.method}</code>}
      {t.prep && (
        <p data-testid="req-prep" className="rounded-lg bg-panel px-3 py-2 text-[13px] leading-5 break-keep text-text-muted">
          <b className="mr-1.5 font-bold text-text">준비</b>
          {t.prep}
        </p>
      )}
      {t.rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-panel-raised/70 text-[12px] font-bold text-text-muted">
                {t.columns.map((c) => (
                  <th key={c} scope="col" className="px-3.5 py-2 font-mono font-semibold whitespace-nowrap">
                    {c}
                  </th>
                ))}
                <th scope="col" className="px-3.5 py-2 font-bold whitespace-nowrap">
                  결과
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {t.rows.map((r, i) => (
                <tr key={i} data-testid="req-example" className="align-top">
                  {r.values.map((v, j) => (
                    <td key={j} className="px-3.5 py-2.5">
                      <code className={cx(code, 'break-words whitespace-pre-wrap text-text')}>{v}</code>
                    </td>
                  ))}
                  <td className="px-3.5 py-2.5">
                    <code className={cx(code, 'break-words whitespace-pre-wrap font-bold text-brand')}>{r.expected}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const sameMethod = (feature: string, method: string) => {
  const a = methodOf(feature)
  return a === method || (!method.includes('.') && a.split('.').pop() === method) || (!a.includes('.') && method.split('.').pop() === a)
}

export function RequirementsView({ lines, className }: { lines: readonly string[] | null | undefined; className?: string }) {
  const p = useMemo(() => parseRequirements(lines), [lines])
  if (!hasStructure(p)) {
    // 읽을 수 있는 모양이 없으면 예전 번호 목록
    return (
      <ol className={cx('flex flex-col gap-2', className)}>
        {p.other.map((r, i) => (
          <li key={i} className="flex gap-2.5 text-[15px] leading-6 break-keep text-text">
            <span className="tnum mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-dim font-mono text-[12px] font-semibold text-brand">{i + 1}</span>
            {r}
          </li>
        ))}
      </ol>
    )
  }
  // 표는 같은 함수의 '만들 기능' 카드 아래에 붙이고, 카드가 없는 함수는 맨 아래에 이름을 달아 둔다
  const used = new Set<ReqTable>()
  const tableFor = (sig: string) => {
    const t = p.tables.find((x) => !used.has(x) && sameMethod(sig, x.method))
    if (t) used.add(t)
    return t
  }
  const attached = p.features.map((f) => tableFor(f.signature))
  const loose = p.tables.filter((t) => !used.has(t))
  const common = p.common && (
    <p data-testid="req-common" className="rounded-lg bg-panel px-3 py-2 text-[13px] leading-5 break-keep text-text-muted">
      <b className="mr-1.5 font-bold text-text">예시 공통</b>
      {p.common}
    </p>
  )
  return (
    <div className={cx('@container flex flex-col gap-4', className)} data-testid="requirements">
      {p.features.length > 0 && (
        <section aria-label="만들 기능" className="flex flex-col gap-2.5">
          <h4 className="text-[13px] font-bold text-text-muted">만들 기능</h4>
          {common}
          {p.features.map((f, i) => (
            <div key={i} className="flex flex-col gap-2.5">
            <article data-testid="req-feature" className="rounded-xl border border-line bg-panel-raised/50 p-3.5">
              <Signature sig={f.signature} />
              {f.summary && <p className="mt-1.5 text-[14px] leading-6 break-keep text-text">{f.summary}</p>}
              {f.params.length > 0 && (
                <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-t border-line pt-2.5">
                  {f.params.map((a, j) => (
                    <div key={j} className="contents">
                      <dt>
                        <code className={cx(code, 'rounded-sm bg-panel px-1.5 py-0.5 font-semibold text-text')}>{a.name}</code>
                      </dt>
                      <dd className="text-[13px] leading-5 break-keep text-text-muted">{a.meaning}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </article>
            {attached[i] && <ExampleTable t={attached[i]} showTitle={false} />}
            </div>
          ))}
        </section>
      )}

      {(loose.length > 0 || (p.features.length === 0 && p.common)) && (
        <section aria-label="예시" className="flex flex-col gap-3">
          <h4 className="text-[13px] font-bold text-text-muted">예시</h4>
          {p.features.length === 0 && common}
          {loose.map((t) => (
            <ExampleTable key={t.method} t={t} showTitle />
          ))}
        </section>
      )}

      {p.examples.length > 0 && (
        <section aria-label="예시" className="flex flex-col gap-2">
          <h4 className="text-[13px] font-bold text-text-muted">예시</h4>
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full border-collapse text-left">
              <thead className="@max-sm:sr-only">
                <tr className="bg-panel-raised/70 text-[12px] font-bold text-text-muted">
                  <th scope="col" className="w-[62%] px-3.5 py-2 font-bold">
                    입력
                  </th>
                  <th scope="col" className="px-3.5 py-2 font-bold">
                    결과
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {p.examples.map((e, i) => (
                  <tr key={i} data-testid="req-example" className="align-top @max-sm:block @max-sm:px-3.5 @max-sm:py-2.5">
                    <td data-label="입력" className="px-3.5 py-2.5 @max-sm:block @max-sm:p-0 @max-sm:before:mb-0.5 @max-sm:before:block @max-sm:before:text-[12px] @max-sm:before:font-bold @max-sm:before:text-text-muted @max-sm:before:content-[attr(data-label)]">
                      <Input text={e.input} />
                    </td>
                    <td data-label="결과" className="px-3.5 py-2.5 @max-sm:mt-1.5 @max-sm:block @max-sm:p-0 @max-sm:before:mb-0.5 @max-sm:before:block @max-sm:before:text-[12px] @max-sm:before:font-bold @max-sm:before:text-text-muted @max-sm:before:content-[attr(data-label)]">
                      <code className={cx(code, 'break-all whitespace-pre-wrap font-bold text-brand')}>{e.expected}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {p.other.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {p.other.map((r, i) => (
            <li key={i} className="border-l-2 border-line-strong pl-3 text-[14px] leading-6 break-keep text-text">
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
