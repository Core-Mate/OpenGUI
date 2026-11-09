import { englishMessages } from './ui-messages.ts'
import { formatUiEnvironment, formatUiProgress, formatUiTrace } from './ui-formatters.ts'

export type UiLocale = 'zh-CN' | 'en'

/** Prefer Chinese for any Chinese locale; unsupported languages fall back to English. */
export function normalizeUiLocale(language: string | null | undefined): UiLocale {
  return /^zh(?:[-_]|$)/iu.test(language ?? '') ? 'zh-CN' : 'en'
}

/** Interpolate named values after translation, without interpreting HTML or replacement syntax. */
export function translateUi(source: string, locale: UiLocale, values: Record<string, string | number> = {}): string {
  const message = locale === 'en' && Object.hasOwn(englishMessages, source) ? englishMessages[source]! : source
  return message.replace(/\{(\w+)\}/gu, (placeholder, name: string) => String(values[name] ?? placeholder))
}

/** Embedded locally: no CDN, network translator, task mutation or page reload is needed. */
export function browserI18nScript(hostLocale?: UiLocale): string {
  return String.raw`<script>
const englishMessages = ${JSON.stringify(englishMessages).replaceAll('<', '\\u003c')};
const normalizeUiLocale = ${normalizeUiLocale.toString()};
const translateUi = ${translateUi.toString()};
const formatUiEnvironment = ${formatUiEnvironment.toString()};
const formatUiProgress = ${formatUiProgress.toString()};
const formatUiTrace = ${formatUiTrace.toString()};
const i18n = (() => {
 const storageKey = 'opengui.ui.language';
 let saved; try { saved = localStorage.getItem(storageKey); } catch {}
 let preference = saved === 'en' || saved === 'zh-CN' ? saved : 'auto';
 let hostLocale = ${JSON.stringify(hostLocale ?? null)};
 const resolvedLocale = () => preference === 'auto' ? hostLocale || normalizeUiLocale(navigator.language) : preference;
 let locale = resolvedLocale();
 function apply() {
  document.documentElement.lang = locale;
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  for (const attr of ['aria-label', 'title', 'placeholder']) {
   document.querySelectorAll('[data-i18n-' + attr + ']').forEach(node => node.setAttribute(attr, t(node.getAttribute('data-i18n-' + attr))));
  }
  const select = document.getElementById('ui-language'); if (select) select.value = preference;
 }
 function setLocale(value, persist = true) {
  if (value !== 'auto' && value !== 'en' && value !== 'zh-CN') return;
  preference = value; const next = resolvedLocale(), changed = locale !== next; locale = next;
  if (persist) { try { localStorage.setItem(storageKey, preference); } catch {} }
  apply();
  if (changed) dispatchEvent(new Event('opengui:languagechange'));
 }
 document.documentElement.lang = locale;
 document.addEventListener('DOMContentLoaded', () => {
  apply(); document.getElementById('ui-language').addEventListener('change', event => setLocale(event.target.value));
 });
 function setHostLocale(value) {
  const next = value === 'en' || value === 'zh-CN' ? value : null;
  if (hostLocale === next) return;
  hostLocale = next; if (preference === 'auto') setLocale('auto', false);
 }
 addEventListener('storage', event => { if (event.key === storageKey || event.key === null) setLocale(event.newValue || 'auto', false); });
 addEventListener('languagechange', () => { if (preference === 'auto') setLocale('auto', false); });
 // Only interface-owned transient notices use this reverse lookup when changing language.
 const source = message => Object.entries(englishMessages).find(([, value]) => value === message)?.[0] ?? message;
 return { get locale() { return locale; }, setLocale, setHostLocale, source };
})();
const t = (source, values) => translateUi(String(source ?? ''), i18n.locale, values);
const localizedLabels = labels => new Proxy(labels, { get: (target, key) => typeof target[key] === 'string' ? t(target[key]) : target[key] });
</script>`
}
