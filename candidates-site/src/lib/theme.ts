import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'
const listeners = new Set<() => void>()
const read = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

export function toggleTheme() {
  const next: Theme = read() === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  try { localStorage.setItem('pipeops-theme', next) } catch { /* theme just won't persist */ }
  listeners.forEach((l) => l())
}

export const useTheme = () =>
  useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), read)
