import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { cx } from "./cx";

const p2 = (n: number) => String(n).padStart(2, "0");
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const MINUTE_STEP = 5;

const trigger =
  "inline-flex h-11 items-center gap-2 rounded-lg border border-line-strong bg-panel px-3.5 text-[15px] text-text outline-none transition-[border-color,box-shadow] hover:border-brand/60 focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_rgb(108_71_255/0.15)] tnum font-mono";
const popover =
  "absolute left-0 top-[calc(100%+6px)] z-30 rounded-xl border border-line bg-panel p-3 shadow-[0_12px_32px_rgb(20_20_43/0.14)]";

/** 바깥 클릭·Esc 로 닫히는 팝오버 틀 */
function Popover({
  label,
  icon,
  text,
  placeholder,
  children,
}: {
  label: string;
  icon: ReactNode;
  text: string;
  placeholder: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={trigger}
      >
        <span className="text-text-faint" aria-hidden>
          {icon}
        </span>
        <span className={text ? "" : "text-text-faint"}>
          {text || placeholder}
        </span>
      </button>
      {open && (
        <div role="dialog" aria-label={label} className={popover}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** value: YYYY-MM-DD */
export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [todayKey] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}`;
  });
  const [view, setView] = useState(() => {
    const [y, m] = (value || todayKey).split("-").map(Number);
    return { y, m: m - 1 };
  });

  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(first).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  const shift = (d: number) =>
    setView((v) => {
      const n = new Date(v.y, v.m + d, 1);
      return { y: n.getFullYear(), m: n.getMonth() };
    });

  return (
    <Popover
      label={label}
      icon={<CalendarDays size={16} />}
      text={value}
      placeholder="날짜 선택"
    >
      {(close) => (
        <div className="w-[264px]">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="이전 달"
              onClick={() => shift(-1)}
              className="grid size-8 place-items-center rounded-md text-text-muted hover:bg-panel-raised"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="tnum text-[14px] font-semibold text-text">
              {view.y}년 {view.m + 1}월
            </span>
            <button
              type="button"
              aria-label="다음 달"
              onClick={() => shift(1)}
              className="grid size-8 place-items-center rounded-md text-text-muted hover:bg-panel-raised"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEK.map((w) => (
              <span key={w} className="py-1 text-[12px] text-text-faint">
                {w}
              </span>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <span key={`e${i}`} />;
              const key = `${view.y}-${p2(view.m + 1)}-${p2(d)}`;
              const selected = key === value;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onChange(key);
                    close();
                  }}
                  className={cx(
                    "tnum grid h-9 place-items-center rounded-md text-[14px] transition-colors",
                    selected
                      ? "bg-brand font-semibold text-white"
                      : "text-text hover:bg-brand-dim",
                    !selected && key === todayKey && "ring-1 ring-brand/50",
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Popover>
  );
}

function Column({
  items,
  selected,
  onPick,
  label,
}: {
  items: string[];
  selected: string;
  onPick: (v: string) => void;
  label: string;
}) {
  const selRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selRef.current?.scrollIntoView({ block: "center" });
  }, []);
  return (
    <div
      role="listbox"
      aria-label={label}
      className="flex h-56 w-16 flex-col gap-0.5 overflow-y-auto pr-1"
    >
      {items.map((it) => (
        <button
          key={it}
          ref={it === selected ? selRef : undefined}
          type="button"
          role="option"
          aria-selected={it === selected}
          onClick={() => onPick(it)}
          className={cx(
            "tnum h-9 shrink-0 rounded-md text-[14px] transition-colors",
            it === selected
              ? "bg-brand font-semibold text-white"
              : "text-text hover:bg-brand-dim",
          )}
        >
          {it}
        </button>
      ))}
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => p2(i));
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) =>
  p2(i * MINUTE_STEP),
);

/** value: HH:MM */
export function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [h, m] = value ? value.split(":") : ["", ""];
  const minutes = MINUTES.includes(m) || !m ? MINUTES : [...MINUTES, m].sort();
  return (
    <Popover
      label={label}
      icon={<Clock size={16} />}
      text={value}
      placeholder="시각 선택"
    >
      {(close) => (
        <div className="flex gap-2">
          <Column
            label="시"
            items={HOURS}
            selected={h}
            onPick={(v) => onChange(`${v}:${m || "00"}`)}
          />
          <Column
            label="분"
            items={minutes}
            selected={m}
            onPick={(v) => {
              onChange(`${h || "09"}:${v}`);
              close();
            }}
          />
        </div>
      )}
    </Popover>
  );
}
