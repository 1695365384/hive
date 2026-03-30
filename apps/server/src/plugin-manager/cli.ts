/**
 * Plugin CLI — hive plugin 子命令
 */

import { Command } from 'commander'
import { searchPlugins, formatSearchResults } from './searcher.js'
import { installPlugin } from './installer.js'
import { listPlugins, removePlugin, showPluginInfo, updatePlugin } from './manager.js'

export function createPluginCommand(): Command {
  const plugin = new Command('plugin')
    .description('Manage Hive plugins')

  // hive plugin search [keyword]
  plugin
    .command('search')
    .description('Search for plugins on npm')
    .argument('[keyword]', 'search keyword')
    .action(async (keyword?: string) => {
      try {
        const { packages, total } = await searchPlugins(keyword)
        console.log(formatSearchResults(packages, total))
      } catch (error) {
        console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exitCode = 1
      }
    })

  // hive plugin add <source>
  plugin
    .command('add')
    .description('Install a plugin (npm package, git URL, or local path)')
    .argument('<source>', 'package name, git URL, or local path')
    .action(async (source: string) => {
      try {
        const result = await installPlugin(source)
        if (result.success) {
          console.log(`  ✓ Installed ${result.name}${result.version ? ` v${result.version}` : ''}`)
          console.log('  Restart Hive to activate the plugin.')
        } else {
          console.error(`  ✗ ${result.error}`)
          process.exitCode = 1
        }
      } catch (error) {
        console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exitCode = 1
      }
    })

  // hive plugin list
  plugin
    .command('list')
    .description('List installed plugins')
    .action(() => {
      console.log(listPlugins())
    })

  // hive plugin remove <name>
  plugin
    .command('remove')
    .description('Uninstall a plugin')
    .argument('<name>', 'plugin name')
    .action((name: string) => {
      const result = removePlugin(name)
      if (result.success) {
        console.log(`  ✓ Removed ${name}`)
        console.log('  Restart Hive to apply changes.')
      } else {
        console.error(`  ✗ ${result.error}`)
        process.exitCode = 1
      }
    })

  // hive plugin info <name>
  plugin
    .command('info')
    .description('Show plugin details')
    .argument('<name>', 'plugin name')
    .action((name: string) => {
      const result = showPluginInfo(name)
      if (result.success) {
        console.log(`  Name:      ${result.info.name}`)
        console.log(`  Version:   ${result.info.version}`)
        console.log(`  Source:    ${result.info.source}`)
        console.log(`  Installed: ${result.info.installedAt}`)
        if (result.info.description) console.log(`  Desc:      ${result.info.description}`)
        if (result.info.homepage) console.log(`  Homepage:  ${result.info.homepage}`)
      } else {
        console.error(`  ✗ ${result.error}`)
        process.exitCode = 1
      }
    })

  // hive plugin update [name]
  plugin
    .command('update')
    .description('Update plugin(s) to latest version')
    .argument('[name]', 'plugin name (omit to update all)')
    .action(async (name?: string) => {
      const { updated, skipped, errors } = await updatePlugin(name)

      for (const n of updated) {
        console.log(`  ✓ Updated ${n}`)
      }
      for (const n of skipped) {
        console.log(`  → ${n}: already up to date`)
      }
      for (const e of errors) {
        console.error(`  ✗ ${e.name}: ${e.error}`)
      }

      if (updated.length > 0) {
        console.log('  Restart Hive to apply changes.')
      }
    })

  return plugin
}
