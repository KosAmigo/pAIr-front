// 과제 파일 탐색기: 폴더 계층 트리 (폴더 접기·펼치기, 들여쓰기 안내선, 폴더·파일 아이콘).
// `_gen/` 처럼 밑줄로 시작하는 생성기 내부 폴더는 맨 아래로 보내 접어 둔다. 긴 경로 대신 이름만 보인다.
import { useMemo, useState } from 'react'
import { ChevronRight, EyeOff, FileCode2, FileText, Folder, FolderOpen } from 'lucide-react'
import { cx } from '../../../components/cx'
import type { AdminTaskFile } from '../../../consoleApi'
import { Collapse } from './Collapse'

type Dir = { kind: 'dir'; name: string; path: string; children: TreeNode[]; internal: boolean }
type Leaf = { kind: 'file'; name: string; path: string; file: AdminTaskFile }
type TreeNode = Dir | Leaf

function buildTree(files: readonly AdminTaskFile[]): TreeNode[] {
  const root: Dir = { kind: 'dir', name: '', path: '', children: [], internal: false }
  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean)
    let cur = root
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/')
      if (i === parts.length - 1) {
        cur.children.push({ kind: 'file', name: part, path: f.path, file: f })
        return
      }
      let d = cur.children.find((c): c is Dir => c.kind === 'dir' && c.name === part)
      if (!d) {
        d = { kind: 'dir', name: part, path, children: [], internal: part.startsWith('_') || cur.internal }
        cur.children.push(d)
      }
      cur = d
    })
  }
  const internal = (n: TreeNode) => (n.kind === 'dir' && n.internal ? 1 : 0)
  const isDir = (n: TreeNode) => (n.kind === 'dir' ? 1 : 0)
  // 폴더 하나만 든 폴더는 한 줄로 합친다 (src/main/java/com/… 처럼 깊은 길이 줄을 다 먹지 않게)
  const merge = (d: Dir): void => {
    d.children = d.children.map((c) => {
      while (c.kind === 'dir' && c.children.length === 1 && c.children[0].kind === 'dir') {
        const only: Dir = c.children[0]
        c = { ...only, name: `${c.name}/${only.name}`, internal: c.internal }
      }
      return c
    })
    d.children.forEach((c) => c.kind === 'dir' && merge(c))
  }
  merge(root)
  const sort = (d: Dir) => {
    d.children.sort((a, b) => internal(a) - internal(b) || isDir(b) - isDir(a) || a.name.localeCompare(b.name))
    d.children.forEach((c) => c.kind === 'dir' && sort(c))
  }
  sort(root)
  return root.children
}

const fileIcon = (name: string) => (/\.(md|txt|pdf)$/i.test(name) ? FileText : FileCode2)

function countFiles(d: Dir): number {
  return d.children.reduce((n, c) => n + (c.kind === 'file' ? 1 : countFiles(c)), 0)
}

export function FileTree({ files, current, openFile, onPick }: { files: readonly AdminTaskFile[]; current: string; openFile: string; onPick: (path: string) => void }) {
  const tree = useMemo(() => buildTree(files), [files])
  // 접힌 폴더 경로. 처음엔 생성기 내부 폴더만 접혀 있다
  const [closed, setClosed] = useState<Set<string>>(() => {
    const s = new Set<string>()
    const walk = (nodes: TreeNode[]) =>
      nodes.forEach((n) => {
        if (n.kind !== 'dir') return
        if (n.internal) s.add(n.path)
        walk(n.children)
      })
    walk(tree)
    return s
  })
  const toggle = (path: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (!next.delete(path)) next.add(path)
      return next
    })

  const render = (nodes: TreeNode[], depth: number) => (
    <ul role={depth === 0 ? 'tree' : 'group'} className={cx(depth > 0 && 'ml-[15px] border-l border-line pl-1')}>
      {nodes.map((n) => {
        if (n.kind === 'dir') {
          const open = !closed.has(n.path)
          return (
            <li key={n.path} role="treeitem" aria-expanded={open}>
              <button
                type="button"
                onClick={() => toggle(n.path)}
                className={cx('flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left font-mono text-[13px] transition-colors hover:bg-panel-raised active:scale-[0.99]', n.internal ? 'text-text-faint' : 'text-text')}
              >
                <ChevronRight size={14} aria-hidden className={cx('shrink-0 text-text-faint transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-90')} />
                {open ? <FolderOpen size={15} aria-hidden className="shrink-0 text-caution" /> : <Folder size={15} aria-hidden className="shrink-0 text-caution/80" />}
                <span className="truncate">{n.name}</span>
                <span className="tnum ml-auto font-sans text-[11px] text-text-faint">{countFiles(n)}</span>
              </button>
              <Collapse open={open}>{render(n.children, depth + 1)}</Collapse>
            </li>
          )
        }
        const on = n.path === current
        const hidden = n.file.visibility === 'HIDDEN'
        const Icon = fileIcon(n.name)
        return (
          <li key={n.path} role="treeitem" aria-selected={on}>
            <button
              type="button"
              aria-current={on || undefined}
              title={n.path}
              onClick={() => onPick(n.path)}
              className={cx('flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 pl-[26px] text-left font-mono text-[13px] transition-colors active:scale-[0.99]', on ? 'bg-brand-dim font-semibold text-text' : 'hover:bg-panel-raised', hidden ? 'text-text-muted' : 'text-text')}
            >
              {hidden ? <EyeOff size={14} className="shrink-0 text-text-faint" aria-label="응시자에게 숨김" /> : <Icon size={14} className="shrink-0 text-branch-2" aria-hidden />}
              <span className="truncate">{n.name}</span>
              {n.path === openFile && <span className="ml-auto shrink-0 rounded-sm bg-brand-dim px-1 font-sans text-[11px] font-semibold text-brand">처음</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )

  return (
    <nav aria-label="과제 파일" className="min-h-0 overflow-auto border-b border-line p-2 md:border-r md:border-b-0">
      <p className="label px-2 py-1.5">EXPLORER</p>
      {render(tree, 0)}
    </nav>
  )
}
