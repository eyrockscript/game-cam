import es from './es.json'

type Dict = { [key: string]: string | Dict }

function lookup(dict: Dict, path: string): string {
  const value = path.split('.').reduce<string | Dict | undefined>(
    (node, key) => (typeof node === 'object' ? node[key] : undefined),
    dict,
  )
  return typeof value === 'string' ? value : path
}

export function t(key: string, params: Record<string, string | number> = {}): string {
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    lookup(es as Dict, key),
  )
}

export function applyStaticTranslations(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n ?? '')
  })
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle ?? '')
    el.setAttribute('aria-label', el.title)
  })
}
