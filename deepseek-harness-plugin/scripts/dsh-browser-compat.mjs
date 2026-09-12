/** DSH serves client modules individually on old hosts and in batches on 0.1.5. */
export function isOpenGuiClientBundle(value) {
  const url = new URL(value)
  const entry = 'dsh-coremate-mobile/client.js'
  return url.pathname === `/plugins/${entry}` ||
    (url.pathname === '/plugins/' && url.search.startsWith('??') &&
      url.search.slice(2).split('&')[0].split(',').includes(entry))
}

/** Only use the launch URL printed for this isolated loopback fixture. */
export function hostEntryUrl(origin, logs) {
  const printed = logs.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/u)?.[0]
  return printed && new URL(printed).origin === origin ? printed : origin
}

export async function fetchHostBoot(origin, entry) {
  let response = await fetch(entry, { redirect: 'manual', signal: AbortSignal.timeout(2_000) })
  if (response.status === 303 && response.headers.get('location') === '/') {
    const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    response = await fetch(origin, { headers: { Cookie: cookie }, redirect: 'error', signal: AbortSignal.timeout(2_000) })
  }
  const body = await response.text()
  return response.ok && (body.includes('__DSH_BOOT__') || body.includes('__DSH_BOOT_READY__'))
}
