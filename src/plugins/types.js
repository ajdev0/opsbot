/**
 * @typedef {object} PluginLogger
 * @property {(msg: string, ...args: unknown[]) => void} info
 * @property {(msg: string, ...args: unknown[]) => void} warn
 * @property {(msg: string, ...args: unknown[]) => void} error
 */

/**
 * Passed to {@link OpsBotPlugin.setupDaemon} only.
 * @typedef {object} DaemonPluginApi
 * @property {PluginLogger} logger
 * @property {() => Record<string, unknown>} loadConfig
 * @property {(name: string, intervalMs: number, fn: () => void | Promise<void>) => void} schedule
 *   Use namespaced job names, e.g. `${plugin.id}:task`.
 * @property {(text: string) => void | Promise<void>} alert
 */

/**
 * @typedef {object} TelegramPluginContext
 * @property {import('node-telegram-bot-api')} bot
 * @property {number} chatId
 * @property {string[]} args
 * @property {() => Record<string, unknown>} getConfig
 * @property {PluginLogger} logger
 */

/**
 * Default export of a built-in plugin module under `plugins/builtin/<id>/`.
 * @typedef {object} OpsBotPlugin
 * @property {string} id - Stable id `[a-z0-9-]+`, must match config entry and folder name.
 * @property {(program: import('commander').Command) => void} [registerCli]
 * @property {(api: DaemonPluginApi) => void | Promise<void>} [setupDaemon]
 * @property {Record<string, (ctx: TelegramPluginContext) => void | Promise<void>>} [telegramCommands]
 */

export {};
