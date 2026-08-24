/** Package-owned invariant companion for `dsh-coremate-mobile`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = 'dsh-coremate-mobile'

export const name = 'coremate-mobile-invariant'
export const inject = ['invariants']

/**
 * No runtime invariant: task admission, phone observations, selected serials,
 * and repetition state are private to this plugin. Harness services own the
 * command, provider, and tool registrations that expose public relationships.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx Harness invariant context.
 * @returns The registry disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
