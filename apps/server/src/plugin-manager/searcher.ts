/**
 * Plugin Searcher — npm Registry Search API
 */

import type { NpmSearchResponse, NpmSearchPackage } from './types.js'

const NPM_SEARCH_URL = 'https://registry.npmjs.org/-/v1/search'

interface SearchResult {
  packages: NpmSearchPackage[]
  total: number
}

/**
 * 搜索 npm 上的 hive plugin 插件
 */
export async function searchPlugins(keyword?: string, size = 20): Promise<SearchResult> {
  const text = keyword
    ? `${keyword} keywords:hive-plugin`
    : 'keywords:hive-plugin'

  const url = `${NPM_SEARCH_URL}?text=${encodeURIComponent(text)}&size=${size}&refresh=${Date.now()}`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`npm Registry returned ${res.status}`)
    }
    const data = (await res.json()) as NpmSearchResponse
    const packages = data.objects.map(obj => obj.package)
    return { packages, total: data.total }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: failed to reach npm Registry. Check your internet connection.')
    }
    throw error
  }
}

/**
 * 格式化搜索结果为终端表格
 */
export function formatSearchResults(packages: NpmSearchPackage[], total: number): string {
  if (packages.length === 0) {
    return 'No plugins found.\n\nUse `hive plugin search <keyword>` to discover plugins.'
  }

  const lines: string[] = []
  lines.push('')

  for (const pkg of packages) {
    const name = pkg.name.padEnd(35)
    const version = `v${pkg.version}`.padEnd(12)
    const desc = (pkg.description || '').slice(0, 50)
    lines.push(`  ${name} ${version} ${desc}`)
  }

  lines.push('')
  lines.push(`  Showing ${packages.length} of ${total} plugin(s).`)
  lines.push('  Install: hive plugin add <package-name>')
  lines.push('')

  return lines.join('\n')
}
