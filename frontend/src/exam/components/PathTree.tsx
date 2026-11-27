import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText, Folder, Paperclip } from 'lucide-react'
import { cx } from '../../components/cx'
import { ATTACH_MIME, encodeDrag, type AttachRef } from '../../lib/chatAttach'

// ── 파일 트리 (경로 기반) ─────────────────
export type TreeNode = { name: string; path: string; children?: TreeNode[] }
export function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [] }
  for (const p of paths) {
    const parts = p.split('/')
    let cur = root
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/')
      const leaf = i === parts.length - 1
      let next = cur.children!.find((c) => c.name === part)
      if (!next) {
        next = { name: part, path, children: leaf ? undefined : [] }
        cur.children!.push(next)
      }
      cur = next
    })
  }
  const sort = (n: TreeNode[]): TreeNode[] =>
    n
      .sort((a, b) => (a.children ? 0 : 1) - (b.children ? 0 : 1) || a.name.localeCompare(b.name))
      .map((c) => ({ ...c, children: c.children && sort(c.children) }))
  return sort(root.children!)
}

/** 파일 트리의 파일 하나를 채팅 첨부로 바꾼다. PDF 자료는 기본으로 전체(최대 20쪽)를 붙인다 */
export type AttachFor = (path: string) => AttachRef

export function PathTree({
  nodes,
  depth = 0,
  active,
  onOpen,
  attachFor,
  onAttach,
}: {
  nodes: TreeNode[]
  depth?: number
  active: string
  onOpen: (p: string) => void
  /** 있으면 파일 행을 채팅창으로 끌어 첨부할 수 있다(끌기를 못 쓰는 사용자를 위해 행마다 첨부 버튼도 둔다) */
  attachFor?: AttachFor
  onAttach?: (r: AttachRef) => void
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  return (
    <ul>
      {nodes.map((n) =>
        n.children ? (
          <li key={n.path}>
            <button
              type="button"
              onClick={() => setClosed({ ...closed, [n.path]: !closed[n.path] })}
              aria-expanded={!closed[n.path]}
              className="flex h-7 w-full items-center gap-1.5 pr-2 text-[14px] text-text-muted hover:bg-panel-raised hover:text-text"
              style={{ paddingLeft: 8 + depth * 14 }}
            >
              {closed[n.path] ? <ChevronRight size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
              <Folder size={16} strokeWidth={1.75} aria-hidden />
              <span className="font-mono">{n.name}</span>
            </button>
            {!closed[n.path] && <PathTree nodes={n.children} depth={depth + 1} active={active} onOpen={onOpen} attachFor={attachFor} onAttach={onAttach} />}
          </li>
        ) : (
          <li key={n.path} className="group relative">
            <button
              type="button"
              onClick={() => onOpen(n.path)}
              draggable={Boolean(attachFor)}
              onDragStart={(e) => {
                if (!attachFor) return
                e.dataTransfer.setData(ATTACH_MIME, encodeDrag(attachFor(n.path)))
                e.dataTransfer.effectAllowed = 'copy'
              }}
              className={cx(
                'relative flex h-7 w-full items-center gap-1.5 pr-8 text-[14px]',
                active === n.path ? 'bg-panel-raised text-text' : 'text-text-muted hover:bg-panel-raised hover:text-text',
              )}
              style={{ paddingLeft: 22 + depth * 14 }}
            >
              {active === n.path && <span className="absolute inset-y-0 left-0 w-0.5 bg-brand" aria-hidden />}
              <FileText size={16} strokeWidth={1.75} aria-hidden />
              <span className="truncate font-mono">{n.name}</span>
            </button>
            {attachFor && onAttach && (
              <button
                type="button"
                aria-label={`${n.name} 채팅에 첨부`}
                title="채팅에 첨부 (또는 채팅창으로 끌어 놓기)"
                onClick={() => onAttach(attachFor(n.path))}
                className="absolute top-1/2 right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-text-faint opacity-0 hover:bg-panel hover:text-text focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Paperclip size={14} aria-hidden />
              </button>
            )}
          </li>
        ),
      )}
    </ul>
  )
}
