import { connectionHint } from './connection-status.ts'
import { VERSION } from './state.ts'
import { BASE_EXECUTION_BUDGET } from './execution-budget.ts'

const ICONS: Record<string, string> = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="m9 5 10 7-10 7Z"/>',
  hand: '<path d="M8 13V7a2 2 0 0 1 4 0v5-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 4-3 7-7 7h-1c-2 0-4-1-5-3l-4-5a2 2 0 0 1 3-3l2 2Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v5"/><circle cx="12" cy="16.2" r=".6" fill="currentColor" stroke="none"/>',
}
const icon = (name: string): string => `<svg class="ui-icon icon-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
const GITHUB_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>'

/** Presentation for the local workbench, independent of the host chat and phone controller. */
export function workbenchShell(): string {
  return String.raw`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenGUI · 手机任务工作台</title>
<style>
:root {
	color-scheme: light;
	--ink: #292927;
	--muted: #8c8c86;
	--faint: #a2a29b;
	--line: #e9e9e5;
	--line-strong: #e4e4df;
	--bg: #fafaf8;
	--primary: #34342e;
	--accent: #637753;
	--soft: #e9ede4;
	--soft-ink: #48553f;
	--ready: #7e9278;
	--warning: #b8843e;
	--amber: #976629;
	--alert: #fcf7ee;
	--alert-line: #efe2c8;
	--danger: #ae5e4e;
	--danger-soft: #f3e9e3;
	--model: #a0ae90;
	--tool: #9aaebb;
}
* { box-sizing: border-box; }
body {
	margin: 0;
	background: var(--bg);
	color: var(--ink);
	font: 13px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
}
button, input, textarea { font: inherit; }
button, a.button {
	border: 1px solid var(--line);
	background: #fff;
	color: var(--ink);
	border-radius: 7px;
	padding: 6px 11px;
	cursor: pointer;
	text-decoration: none;
	transition: background 0.15s;
}
button:hover, a.button:hover { background: #f3f4f0; }
button:disabled { opacity: 0.45; cursor: not-allowed; }
button.primary, a.button.primary { background: var(--primary); color: #fff; border-color: var(--primary); }
button.primary:hover, a.button.primary:hover { background: #22221e; }
button.quiet { background: transparent; border-color: transparent; }
button.quiet:hover { background: #f1f2ee; }
:focus-visible { outline: 2px solid #a3ad98; outline-offset: 2px; }
h1, h2, h3, p { margin: 0; }
h2 { font-size: 13px; font-weight: 600; }
h3 { font-size: 12px; font-weight: 600; }
small, .muted { color: var(--muted); font-size: 11px; }
a { color: var(--accent); }
svg.ui-icon { width: 14px; height: 14px; flex: none; }
[hidden] { display: none !important; }

/* Header */
.panel-header { display: flex; align-items: center; justify-content: space-between; min-height: 51px; padding: 0 22px; }
.brand { display: flex; align-items: baseline; gap: 8px; }
.opengui-name { font-size: 15px; font-weight: 600; letter-spacing: -0.35px; }
.version-tag { font-size: 10px; color: var(--faint); }
.pluginlinks { display: flex; align-items: center; gap: 10px; }
.plugin-account { font-size: 11px; color: #81817a; border: 0; background: transparent; padding: 3px 6px; }
.icon-link { width: 27px; height: 27px; display: grid; place-items: center; border-radius: 5px; color: #181717; }
.icon-link:hover { background: #f2f4f2; }
.icon-link svg { width: 18px; height: 18px; }

/* Device bar */
.devicebar { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; min-height: 54px; padding: 9px 20px; border-bottom: 1px solid var(--line); }
.device-info, .device-actions { display: flex; align-items: center; gap: 7px; min-width: 0; }
.device-info { flex: 1 1 auto; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--faint); display: inline-block; flex: none; }
.dot.ready { background: var(--ready); }
.dot.warning { background: var(--warning); }
.status-dot { position: relative; display: grid; place-items: center; width: 14px; height: 22px; border: 0; padding: 0; background: transparent; }
.device-selector, .model-selector { display: inline-flex; align-items: center; gap: 6px; border-color: transparent; background: transparent; min-width: 0; }
.device-selector { font-size: 12px; font-weight: 600; padding: 6px 8px 6px 3px; }
.device-selector span, .model-selector span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
.model-selector { font-size: 11px; color: #84847c; padding: 6px 10px; border-left: 1px solid var(--line); border-radius: 0 7px 7px 0; }
.device-selector:disabled, .model-selector:disabled { opacity: 0.55; }
.device-actions > button, .more > button { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; padding: 4px 9px; min-height: 29px; border-radius: 6px; color: #55554d; border-color: var(--line-strong); }
.device-actions .scenario-button { background: var(--soft); color: var(--soft-ink); border-color: transparent; font-weight: 500; padding: 0 10px; }
.device-actions .scenario-button:hover { background: #dfe5d8; }
.device-actions .takeover { background: #333b32; border-color: #333b32; color: #fff; box-shadow: 0 1px 2px #20261e15; }
.device-actions .takeover:hover { background: #262c25; }
.device-actions .takeover.returning { background: #8a6a33; border-color: #8a6a33; }
.more { position: relative; }
.more > button { width: 29px; justify-content: center; padding: 0; color: var(--muted); border-color: transparent; background: transparent; }

/* Popovers (model picker and more menu) */
.popover { position: fixed; margin: 0; width: 330px; max-width: calc(100vw - 24px); padding: 6px; border: 1px solid #e4e4dd; border-radius: 12px; background: #fff; color: var(--ink); box-shadow: 0 8px 30px #1c221814, 0 1px 4px #1c22180a; z-index: 20; }
.popover-label { padding: 7px 10px 4px; font-size: 10px; color: #99a095; }
.menu-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 38px; padding: 9px 10px; border: 0; border-radius: 7px; background: transparent; text-align: left; font-size: 12px; color: #33332b; }
.menu-item:hover, .menu-item.selected { background: #eef0eb; }
.menu-item small { display: block; font-size: 10px; color: var(--faint); line-height: 1.4; }
.menu-item.danger { color: var(--danger); }
.model-meta { display: flex; align-items: center; gap: 8px; flex: none; }
.tag { font-size: 10px; color: #979b94; border-radius: 4px; }
.tag.popular { color: #9271b4; }
.model-check { width: 15px; display: grid; place-items: center; }
.popover-note { padding: 8px 10px 6px; font-size: 10px; color: var(--muted); line-height: 1.6; border-top: 1px solid #f0f0ec; margin-top: 4px; }
#more-menu { width: 230px; }

/* Alerts */
.alerts { display: grid; gap: 8px; padding: 12px 20px 0; }
.alerts:empty { display: none; }
.alert { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 10px 12px; background: var(--alert); border: 1px solid var(--alert-line); border-radius: 8px; font-size: 11px; color: #6f5b3c; }
.alert strong { display: block; color: var(--amber); font-size: 12px; margin-bottom: 2px; }
.alert p { white-space: pre-wrap; overflow-wrap: anywhere; }
.alert .alert-actions { display: flex; gap: 6px; flex-wrap: wrap; flex: none; }
.alert button { font-size: 11px; padding: 4px 9px; }
.alert.info { background: #f4f6f1; border-color: #e3e8dc; color: #5c6852; }
.alert.info strong { color: var(--soft-ink); }

/* Canvas */
.canvas { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); column-gap: 24px; align-items: stretch; padding: 46px 22px 26px; min-height: 360px; }
/* Without a review column, center the phone and plan together. */
.canvas.task-canvas { grid-template-columns: minmax(0, max-content) minmax(180px, 260px); justify-content: center; }
.canvas.task-canvas > #workbench { grid-column: 1; min-width: 0; }
.canvas.task-canvas > .floating-plan { grid-column: 2; }
.canvas > .start-panel { grid-column: 1 / -1; justify-self: center; }
.environment-status { position: absolute; left: 22px; top: 12px; display: flex; align-items: center; gap: 5px; color: #83877e; font-size: 11px; z-index: 3; max-width: calc(100% - 80px); }
.environment { position: relative; }
.environment summary { list-style: none; cursor: pointer; min-height: 22px; display: flex; align-items: center; color: #92928a; }
.environment summary::-webkit-details-marker { display: none; }
.environment-panel { position: absolute; left: 0; top: 26px; width: min(340px, calc(100vw - 44px)); padding: 12px 14px; background: #fff; border: 1px solid var(--line-strong); border-radius: 10px; box-shadow: 0 10px 30px #1c22181a; color: var(--ink); font-size: 11px; line-height: 1.7; }
.environment-panel > p { color: #6c6c64; }
.checks { display: grid; gap: 4px; margin-top: 8px; }
.check-row { display: flex; justify-content: space-between; gap: 10px; }
.check-row span:last-child { color: var(--muted); text-align: right; overflow-wrap: anywhere; }
.check-row.failed span:last-child { color: var(--danger); }
.check-row.unknown span:last-child { color: var(--amber); }
.environment-help { position: relative; display: flex; }
.environment-help button { display: grid; place-items: center; width: 18px; height: 22px; padding: 0; border: 0; background: transparent; color: #858b7f; }
.environment-help.has-issue button { color: #bf5a51; }
.environment-help [role="tooltip"] { position: absolute; left: -6px; top: 26px; width: 250px; padding: 9px 11px; background: #2f322d; color: #f4f4ef; border-radius: 7px; font-size: 11px; line-height: 1.6; opacity: 0; pointer-events: none; transition: opacity 0.12s; z-index: 5; }
.environment-help:hover [role="tooltip"], .environment-help:focus-within [role="tooltip"], .status-dot:hover + [role="tooltip"] { opacity: 1; }
.access-link { font-size: 10px; padding: 2px 5px; border: 0; border-radius: 4px; background: transparent; color: var(--accent); }
.access-link.issue { color: var(--danger); background: var(--danger-soft); }
.zoom { position: absolute; right: 18px; top: 10px; width: 28px; height: 28px; padding: 0; display: grid; place-items: center; color: var(--muted); }
#workbench { grid-column: 2; grid-row: 1; display: flex; flex-direction: column; align-items: center; }
.phones { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; }
.phone { position: relative; text-align: center; min-width: 0; }
.phone h2 { display: none; }
.screen { position: relative; display: inline-block; padding: 5px; background: #363633; border: 1px solid #4a4a46; border-radius: 33px; box-shadow: 0 18px 28px -18px #29292155, 0 3px 6px #29292116; max-width: 100%; }
.screen canvas { display: block; width: auto; height: auto; max-width: 100%; max-height: min(480px, 64vh); min-height: 220px; border-radius: 27px; background: #f7f8f5; }
.zoomed .screen canvas { max-height: 80vh; }
.screen canvas.stale { opacity: 0.45; }
.screen:has(.watermark.placeholder:not([hidden])) canvas { opacity: 1; }
.watermark { position: absolute; inset: 5px; border-radius: 27px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 6px; padding: 15px; background: #12150f66; color: #fff; font-size: 12px; pointer-events: none; text-align: center; }
.watermark.placeholder { background: transparent; color: #8a8a83; }
.watermark.placeholder::before { content: ""; width: 14px; height: 24px; border: 1.2px solid currentColor; border-radius: 3px; opacity: 0.8; }
.manual .screen { outline: 2px solid #c49a59; outline-offset: 3px; }
/* Device action cursor (ported from CoreMate's canvas): pointer, tap ripple, swipe trail, key label. */
.device-action-layer { position: absolute; z-index: 3; overflow: hidden; pointer-events: none; border-radius: 27px; }
.device-pointer { position: absolute; z-index: 2; width: 0; height: 0; pointer-events: none; transition-property: left, top; transition-timing-function: ease-out; }
.device-pointer-arrow { position: absolute; left: -2px; top: -2px; overflow: visible; filter: drop-shadow(0 1px 2px rgb(16 24 32 / 45%)); transform-origin: 2px 2px; transition: transform 90ms ease-out; }
.device-pointer-arrow path { fill: #101820; stroke: #fff; stroke-width: 1.6px; stroke-linejoin: round; }
.device-pointer.is-pressing .device-pointer-arrow { transform: scale(0.82); }
.device-action { position: absolute; z-index: 1; pointer-events: none; animation: device-action-fade var(--visible-ms, 1600ms) ease-in forwards; }
.device-action.is-tap { width: 0; height: 0; }
.device-action.is-swipe { inset: 0; }
.device-action-dot { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border: 2px solid #fff; border-radius: 50%; background: #2f6fd6; box-shadow: 0 0 0 1px rgb(16 24 32 / 55%), 0 2px 6px rgb(16 24 32 / 45%); box-sizing: border-box; opacity: 0.85; }
.device-action-ring { position: absolute; left: 0; top: 0; width: 36px; height: 36px; margin: -18px 0 0 -18px; border: 3px solid #fff; border-radius: 50%; box-shadow: 0 0 0 2px #2f6fd6, 0 0 8px rgb(16 24 32 / 45%); box-sizing: border-box; animation: device-action-ring 700ms ease-out forwards; }
.device-action-trail { position: absolute; inset: 0; overflow: visible; }
.device-action-trail line { stroke: #2f6fd6; stroke-width: 4px; stroke-linecap: round; filter: drop-shadow(0 0 1px #fff) drop-shadow(0 1px 3px rgb(16 24 32 / 50%)); }
.device-action-trail marker path { fill: #2f6fd6; }
.device-action.is-key { left: 50%; bottom: 7%; padding: 3px 10px; border-radius: 999px; background: rgb(16 24 32 / 82%); box-shadow: 0 0 0 1px rgb(255 255 255 / 50%); color: #fff; font: 700 11px/1.4 system-ui, sans-serif; letter-spacing: 0.04em; white-space: nowrap; transform: translateX(-50%); }
@keyframes device-action-fade { 0%, 70% { opacity: 1; } 100% { opacity: 0; } }
@keyframes device-action-ring { from { opacity: 1; transform: scale(0.3); } to { opacity: 0; transform: scale(1.5); } }
@media (prefers-reduced-motion: reduce) { .device-pointer, .device-pointer-arrow { transition: none !important; } .device-action-ring { animation: none; opacity: 0.9; } }
/* 接管设备: the live picture takes mouse, wheel and keyboard input. */
.phone.takeover canvas { cursor: pointer; touch-action: none; user-select: none; }
.phone.takeover .screen:focus-within { outline-color: var(--accent); }
.takeover-keys { position: absolute; left: 50%; top: 50%; width: 1px; height: 1px; padding: 0; border: 0; opacity: 0; resize: none; pointer-events: none; }
.takeover-bar { display: none; align-items: center; justify-content: center; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.phone.takeover .takeover-bar { display: flex; }
.takeover-bar p { flex-basis: 100%; font-size: 10px; color: var(--amber); }
.takeover-bar button { font-size: 10px; padding: 3px 10px; }
.phone .message { font-size: 10px; color: var(--muted); margin-top: 10px; min-height: 0; }
.phone .message:empty { display: none; }
.phone .retry { font-size: 10px; margin-top: 6px; padding: 3px 9px; }

/* Start confirmation: request, model and device before any phone work */
.start-panel { width: min(600px, 100%); background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; box-shadow: 0 6px 24px #1c22180a; }
.start-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.start-head h2 { font-size: 15px; }
.start-hint { margin-top: 4px; font-size: 11px; color: var(--muted); }
.start-field { margin-top: 16px; }
.start-label { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #77776f; margin-bottom: 6px; }
.start-prefix { display: inline-block; margin-bottom: 8px; color: var(--soft-ink); background: var(--soft); border-radius: 5px; padding: 2px 7px; font-size: 11px; font-weight: 600; }
.start-request { display: block; width: 100%; min-height: 104px; max-height: 300px; resize: vertical; padding: 10px 12px; border: 1px solid var(--line-strong); background: #fff; border-radius: 8px; color: var(--ink); font-size: 12px; line-height: 1.75; }
.start-request::placeholder { color: var(--faint); }
.start-options { display: grid; gap: 6px; }
.start-option { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; background: #fff; cursor: pointer; }
.start-group > .start-option + .start-option { margin-top: 8px; }
.start-option:hover { background: #fafbf8; }
.start-option:has(input:checked) { border-color: #a9b59d; background: #f3f6ef; }
.start-option.disabled { cursor: default; opacity: 0.6; }
.start-option input { margin: 0; accent-color: #34342e; }
.start-option b { display: block; font-size: 12px; font-weight: 500; overflow-wrap: anywhere; }
.start-option small { display: block; font-size: 10px; color: var(--muted); overflow-wrap: anywhere; }
.start-option .side { font-size: 10px; color: var(--muted); text-align: right; }
.start-option .side.popular { color: #9271b4; }
.start-option .side.warning { color: #b28055; }
.start-empty { font-size: 11px; color: var(--muted); padding: 8px 2px; }
.start-label-actions { display: flex; align-items: center; gap: 10px; }
.help-link { border: 0; background: none; padding: 0; font-size: 11px; color: #2f6fd6; cursor: help; }
.help-link:hover { background: none; text-decoration: underline; }
.start-group + .start-group { margin-top: 10px; }
.start-device-layout { display: grid; grid-template-columns: minmax(0, 1fr) 124px; gap: 20px; align-items: start; }
.start-preview { display: grid; justify-items: center; gap: 7px; margin: 0; padding-top: 2px; }
.start-preview-frame { width: 124px; aspect-ratio: 9 / 19.5; max-height: 300px; padding: 4px; border-radius: 18px; background: #23261f; box-shadow: 0 6px 18px #1c22181c; }
.start-preview-screen { position: relative; height: 100%; display: grid; place-items: center; border-radius: 14px; overflow: hidden; background: #30342c; }
.start-preview-screen canvas { display: block; width: 100%; height: 100%; object-fit: contain; }
.start-preview-screen canvas[hidden] { display: none; }
.start-preview-note { position: absolute; inset: auto 10px; font-size: 10px; line-height: 1.6; color: #c6cbbf; text-align: center; }
.start-preview-caption { display: flex; align-items: center; gap: 5px; max-width: 124px; font-size: 10px; color: var(--muted); }
.start-preview-caption::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--line-strong); }
.start-preview[data-state="live"] .start-preview-caption::before { background: var(--ready); animation: live-dot 1.6s ease-in-out infinite; }
.start-preview[data-state="error"] .start-preview-caption::before { background: var(--warning); }
@keyframes live-dot { 50% { opacity: 0.35; } }
.start-group-title { display: flex; align-items: baseline; gap: 6px; margin-bottom: 6px; font-size: 11px; font-weight: 500; color: #4d5447; }
.start-group-title small { font-size: 10px; font-weight: 400; color: var(--faint); }
.start-placeholder { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 11px; border: 1px dashed var(--line-strong); border-radius: 8px; background: #fbfbf9; font-size: 11px; color: var(--muted); }
.start-placeholder .soon { flex: none; font-size: 10px; color: var(--soft-ink); background: var(--soft); border-radius: 10px; padding: 1px 8px; }
/* 高级选项: opt-in content review before publishing. */
.review-kind { margin-right: 6px; padding: 0 6px; border-radius: 8px; background: var(--soft); color: var(--soft-ink); font-style: normal; font-size: 10px; }
.review-title { margin-top: 8px; font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
.start-advanced-row { display: flex; align-items: center; gap: 8px; padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
.start-switch { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; }
.start-switch input { position: absolute; opacity: 0; pointer-events: none; }
.start-switch-track { position: relative; flex: none; width: 28px; height: 16px; border-radius: 8px; background: #d9dbd4; transition: background 0.15s; }
.start-switch-track::after { content: ""; position: absolute; left: 2px; top: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px #1c221833; transition: transform 0.15s; }
.start-switch input:checked + .start-switch-track { background: var(--accent); }
.start-switch input:checked + .start-switch-track::after { transform: translateX(12px); }
.start-switch input:focus-visible + .start-switch-track { outline: 2px solid #2f6fd6; outline-offset: 2px; }
.content-review-help { position: relative; display: inline-flex; }
.content-review-help .help-icon { display: grid; place-items: center; width: 16px; height: 16px; padding: 0; border: 1px solid #b9bdb2; border-radius: 50%; background: #fff; color: #7c8276; font-size: 10px; line-height: 1; cursor: help; }
.content-review-help [role="tooltip"] { position: absolute; left: -120px; bottom: 24px; z-index: 20; width: 300px; padding: 9px 11px; background: #2f322d; color: #f4f4ef; border-radius: 7px; font-size: 11px; line-height: 1.7; opacity: 0; pointer-events: none; transition: opacity 0.12s; }
.content-review-help:hover [role="tooltip"], .content-review-help:focus-within [role="tooltip"] { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .start-switch-track, .start-switch-track::after { transition: none; } }
/* One-click Android emulator in the device pickers. */
.emulator-box { margin-top: 6px; padding: 10px 11px; border: 1px solid var(--line); border-radius: 8px; background: #fff; font-size: 11px; text-align: left; }
.emulator-box[hidden] { display: none; }
.emulator-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.emulator-row b { display: block; font-weight: 500; }
.emulator-row p { margin-top: 2px; font-size: 10px; color: var(--muted); overflow-wrap: anywhere; }
.emulator-row .actions { display: flex; flex: none; gap: 6px; }
.emulator-row button { font-size: 11px; padding: 5px 12px; }
.emulator-row select { font-size: 11px; max-width: 160px; }
.emulator-error p { color: var(--danger); }
.emulator-progress { margin-top: 8px; height: 4px; border-radius: 2px; background: var(--soft); overflow: hidden; }
.emulator-progress span { display: block; height: 100%; width: 0; background: var(--accent); transition: width 0.4s ease; }
.emulator-progress.indeterminate span { width: 35%; animation: emulator-sweep 1.4s ease-in-out infinite; }
@keyframes emulator-sweep { from { transform: translateX(-100%); } to { transform: translateX(300%); } }
@media (prefers-reduced-motion: reduce) { .emulator-progress.indeterminate span { animation: none; width: 100%; opacity: 0.5; } }
#emulator-dialog ul { margin: 12px 0 0 18px; font-size: 11px; line-height: 1.9; color: #6a6a60; }
#emulator-dialog .emulator-license { display: flex; align-items: center; gap: 8px; margin-top: 16px; font-size: 12px; }
#emulator-dialog .emulator-license a { color: #2f6fd6; }
.start-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
.start-blocker { font-size: 11px; color: var(--amber); }
.start-actions .primary { padding: 9px 22px; flex: none; }

/* Floating plan */
/* The plan sits right of the phone at the phone's height (the absolute body adds no row height);
   long plans scroll inside it. The left column is reserved for comment review. */
.floating-plan { grid-column: 3; grid-row: 1; justify-self: start; width: min(260px, 100%); position: relative; }
.plan-body { position: absolute; inset: 0; display: flex; flex-direction: column; min-height: 0; }
.plan-body .task-list { position: relative; flex: 1; min-height: 0; overflow-y: auto; align-content: start; padding: 2px 4px 2px 0; }
.floating-plan.collapsed .task-list { display: none !important; }
.plan-head { display: flex; flex-direction: column; align-items: stretch; gap: 3px; margin-bottom: 12px; }
.plan-toggle { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 2px 0; border: 0; background: transparent; text-align: left; }
.plan-toggle:hover { background: transparent; }
.plan-toggle .icon-chevron { width: 12px; height: 12px; color: var(--muted); transition: transform 0.15s; }
.floating-plan.collapsed .plan-toggle .icon-chevron { transform: rotate(-90deg); }
.plan-title { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.plan-title strong { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plan-title span { font-size: 10px; color: var(--muted); flex: none; }
.plan-state { font-size: 10px; color: #8b9285; overflow-wrap: anywhere; }
.task-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.task-list[data-layout="row"] { grid-template-columns: repeat(var(--steps), minmax(0, 1fr)); gap: 0; }
.task-row { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 3px 8px; align-items: start; position: relative; font-size: 11px; }
.task-row strong { font-weight: 500; color: #5f5f57; overflow-wrap: anywhere; }
.task-row p { grid-column: 2; font-size: 10px; color: var(--muted); overflow-wrap: anywhere; }
.task-status { grid-column: 2; font-size: 10px; color: #a3a397; }
.task-mark { width: 15px; height: 15px; border-radius: 50%; display: grid; place-items: center; font-size: 9px; color: #9a9a90; background: #f0f0ec; position: relative; z-index: 1; margin-top: 2px; }
.task-mark svg { width: 9px; height: 9px; }
.task-row[data-status="completed"] .task-mark { background: #e5ebe0; color: #6f8260; }
.task-row[data-status="in_progress"] .task-mark { background: #667958; color: #fff; box-shadow: 0 0 0 3px #66795822; animation: breathe 1.6s ease-in-out infinite; }
.task-row[data-status="in_progress"] strong { color: var(--ink); font-weight: 600; }
.task-row[data-status="awaiting_user"] .task-mark { background: #f4e7cf; color: var(--amber); }
.task-row[data-status="awaiting_user"] .task-status { color: var(--amber); }
.task-row[data-status="failed"] .task-mark { background: var(--danger-soft); color: var(--danger); }
.task-row[data-status="failed"] .task-status { color: var(--danger); }
.task-row[data-status="skipped"] strong { color: var(--faint); text-decoration: line-through; }
.task-list[data-layout="row"] .task-row { grid-template-columns: 1fr; padding-right: 10px; }
.task-list[data-layout="row"] .task-row::before { content: ""; position: absolute; left: 22px; right: 4px; top: 9px; height: 1px; background: var(--line); }
.task-list[data-layout="row"] .task-row:last-child::before { display: none; }
.task-list[data-layout="row"] .task-row p, .task-list[data-layout="row"] .task-status { grid-column: 1; }
/* As in the design, a horizontal step only names its state when it needs attention. */
.task-list[data-layout="row"] .task-row:is([data-status="completed"], [data-status="pending"], [data-status="in_progress"]) .task-status { display: none; }
.review-panel .review-list { margin-top: 0; }
@keyframes breathe { 50% { box-shadow: 0 0 0 6px #66795800; } }
/* Motion: only new rows and changed states animate, so an unchanged re-render stays still. */
.task-row.enter { animation: row-in 0.34s cubic-bezier(0.2, 0.7, 0.3, 1) var(--delay, 0ms) both; }
.task-row.changed .task-mark { animation: mark-pop 0.42s cubic-bezier(0.3, 1.6, 0.5, 1); }
.task-row.changed[data-status="in_progress"] .task-mark { animation: mark-pop 0.42s cubic-bezier(0.3, 1.6, 0.5, 1), breathe 1.6s ease-in-out 0.42s infinite; }
.task-row.changed[data-status="completed"] .task-mark path { stroke-dasharray: 24; stroke-dashoffset: 24; animation: check-draw 0.32s ease-out 0.14s forwards; }
.task-row.changed[data-status="in_progress"] strong, .task-row.changed .task-status { animation: fade-in 0.4s ease-out; }
.plan-title span.bump { animation: count-bump 0.45s ease-out; }
@keyframes row-in { from { opacity: 0; transform: translateY(6px); } }
@keyframes mark-pop { 0% { transform: scale(0.6); } 60% { transform: scale(1.15); } }
@keyframes check-draw { to { stroke-dashoffset: 0; } }
@keyframes fade-in { from { opacity: 0.2; } }
@keyframes count-bump { 40% { transform: translateY(-2px); color: var(--accent); } }
@media (prefers-reduced-motion: reduce) {
	.task-row[data-status="in_progress"] .task-mark, .start-preview .start-preview-caption::before, .task-row, .task-row *, .plan-title span, .run-entry, .run-entry *, .run-bar { animation: none !important; transition: none !important; }
	.task-row.changed[data-status="completed"] .task-mark path { stroke-dashoffset: 0; }
}

/* Comment scenario: plan and reviews beside the phone */
/* Review tasks reserve the left column for review cards. */
.review-panel { grid-column: 1; grid-row: 1; justify-self: end; align-self: start; width: min(300px, 100%); }
.comment-progress { display: flex; justify-content: space-between; gap: 8px; margin: 4px 0 12px; font-size: 10px; color: #5c6e60; }
.review-list { display: grid; gap: 2px; margin-top: 12px; }
.review-row { display: grid; grid-template-columns: 19px minmax(0, 1fr); gap: 0 9px; padding: 7px 0; font-size: 11px; }
.review-row .task-mark { width: 19px; height: 19px; font-size: 10px; }
.review-row strong { font-weight: 500; overflow-wrap: anywhere; }
.review-row small { grid-column: 2; font-size: 10px; }
.review { margin: 8px 0; padding: 11px; background: #fffdf8; border: 1px solid #e7decb; border-radius: 8px; font-size: 11px; }
.review-head { display: flex; justify-content: space-between; align-items: start; gap: 8px; font-size: 12px; }
.review-head strong { font-weight: 600; overflow-wrap: anywhere; }
.review-head span { flex: none; font-size: 10px; color: var(--amber); }
.quote { padding: 8px 0; font-size: 10px; line-height: 1.7; color: #83897f; border-bottom: 1px solid #ede8dd; white-space: pre-wrap; overflow-wrap: anywhere; }
.draft { margin: 9px 0; font-size: 11px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }
.review textarea { width: 100%; min-height: 96px; margin: 8px 0; border: 1px solid var(--line-strong); border-radius: 6px; padding: 8px; font-size: 11px; line-height: 1.7; }
.review input { width: 100%; border: 1px solid var(--line-strong); border-radius: 6px; padding: 6px 8px; font-size: 11px; margin-top: 6px; }
.review-actions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.review-actions button { font-size: 10px; padding: 4px 8px; }
.review details { margin-top: 10px; font-size: 10px; color: var(--muted); }
.review details p { margin: 6px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.review .original { margin-top: 10px; padding: 8px 10px; background: #f6f3ea; border-radius: 6px; font-size: 10px; }

/* Workspace sections */
.workspace { padding: 6px 22px 28px; display: grid; gap: 14px; }
.section { border-top: 1px solid var(--line); padding-top: 16px; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.section-head strong { font-size: 12px; font-weight: 500; color: #42423a; }
.section-head span { font-size: 11px; color: #7b7b72; text-align: right; }
.section-head small { color: var(--faint); margin-left: 4px; }

/* Budget */
#execution-budget { display: grid; gap: 8px; }
#execution-budget input { width: 100%; border: 1px solid var(--line-strong); border-radius: 6px; padding: 6px 8px; }

/* Checks (test cases) */
.case { border-bottom: 1px solid #efefeb; padding: 10px 0; font-size: 11px; }
.case:last-child { border-bottom: 0; }
.case-head { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
.case-head strong { font-weight: 500; overflow-wrap: anywhere; }
.badge { flex: none; font-size: 10px; padding: 1px 7px; border-radius: 10px; background: #f0f0ec; color: #77776f; }
.badge.passed { background: #e7eee2; color: #557046; }
.badge.failed { background: var(--danger-soft); color: var(--danger); }
.badge.unverified { background: #f6ecd9; color: var(--amber); }
.case p { margin-top: 4px; color: #66665e; overflow-wrap: anywhere; }
.case details { margin-top: 6px; color: var(--muted); font-size: 10px; }
.case details p { white-space: pre-wrap; color: var(--muted); }
.case a { font-size: 10px; margin-right: 10px; }

/* Report */
.report-card { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; }
.eyebrow { font-size: 9px; letter-spacing: 1.2px; color: var(--faint); }
.report-title { font-size: 15px; font-weight: 600; margin: 4px 0 12px; overflow-wrap: anywhere; }
.report-callout { padding: 10px 12px; background: #f4f6f1; border-radius: 8px; }
.report-callout strong { font-size: 12px; }
.report-callout p { font-size: 11px; color: #66665e; margin-top: 2px; white-space: pre-wrap; overflow-wrap: anywhere; }
.report-callout.blocked { background: var(--alert); }
.report-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 6px 16px; margin: 12px 0; font-size: 11px; color: var(--muted); }
.report-meta b { color: var(--ink); font-weight: 500; margin-left: 4px; overflow-wrap: anywhere; }
.result-list { display: grid; font-size: 11px; }
.result-list > div { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-top: 1px solid #f0f0ec; }
.result-list span { color: var(--muted); flex: none; }
.result-list span.failed { color: var(--danger); }
.result-list span.passed { color: #557046; }
.exports { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
.exports a, .exports button { font-size: 11px; padding: 5px 10px; }
.exports .new-task { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; }
.report-note { margin-top: 10px; font-size: 10px; color: var(--faint); overflow-wrap: anywhere; }

/* Run overview (trace) */
.run-axis { display: flex; justify-content: space-between; margin-left: 39px; font-size: 9px; color: #abab9f; font-variant-numeric: tabular-nums; }
.run-track-row { display: flex; align-items: center; gap: 11px; margin-top: 9px; font-size: 10px; color: #939386; }
.run-track-row > span { width: 28px; flex: none; }
.run-track { position: relative; flex: 1; height: 20px; background: repeating-linear-gradient(to right, #ededE6 0, #ededE6 1px, transparent 1px, transparent 25%); }
.run-bar { position: absolute; top: 5px; height: 10px; min-width: 3px; border: 0; padding: 0; border-radius: 2px; background: var(--tool); cursor: pointer; transform-origin: left center; transition: left 0.45s ease, width 0.45s ease; }
.run-bar.enter { animation: bar-grow 0.45s cubic-bezier(0.2, 0.7, 0.3, 1) both; }
.run-bar.running { background-image: repeating-linear-gradient(135deg, #ffffff66 0 3px, transparent 3px 7px); background-size: 9.9px 9.9px; animation: bar-run 0.7s linear infinite; }
.run-bar.enter.running { animation: bar-grow 0.45s cubic-bezier(0.2, 0.7, 0.3, 1) both, bar-run 0.7s linear infinite; }
@keyframes bar-grow { from { transform: scaleX(0); opacity: 0.3; } }
@keyframes bar-run { to { background-position: 9.9px 0; } }
.run-bar.model { background: var(--model); }
.run-bar.derived { background: repeating-linear-gradient(135deg, var(--model) 0 4px, #b9c4ac 4px 7px); }
.run-bar.wait { background: #e8d5b0; }
.run-bar.failed, .run-bar.unknown { background: #c09354; }
.run-note { margin-top: 10px; font-size: 10px; color: var(--faint); }
.run-log { margin-top: 12px; border-top: 1px solid #efefea; max-height: 420px; overflow: auto; }
.run-entry summary { display: grid; grid-template-columns: 44px minmax(0, 1fr) 6px 44px 12px; align-items: center; gap: 9px; padding: 10px 0; font-size: 11px; color: #5c5c50; cursor: pointer; list-style: none; border-bottom: 1px solid #f2f2ee; }
.run-entry summary::-webkit-details-marker { display: none; }
.run-entry time { font-size: 10px; color: #a0a090; font-variant-numeric: tabular-nums; }
.run-entry summary > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-entry small { font-size: 10px; color: #939386; text-align: right; font-variant-numeric: tabular-nums; }
.run-step { font-style: normal; color: var(--faint); }
.run-think { display: inline-block; margin-right: 7px; padding: 0 6px; border-radius: 8px; background: #edf0e8; color: #77856a; font-size: 10px; line-height: 16px; vertical-align: 1px; font-variant-numeric: tabular-nums; }
.run-type { width: 6px; height: 6px; border-radius: 2px; background: var(--tool); }
.run-type.model { background: var(--model); }
.run-type.wait { background: #e0c48f; }
.run-type.failed, .run-type.unknown { background: #c09354; }
.run-entry .icon-chevron { width: 12px; height: 12px; color: #b4b4aa; transition: transform 0.15s; }
.run-entry[open] .icon-chevron { transform: rotate(180deg); }
.run-entry.enter { animation: row-in 0.3s cubic-bezier(0.2, 0.7, 0.3, 1) both; }
.run-entry.enter summary { animation: entry-flash 1.4s ease-out; }
.run-entry.running .run-type { animation: live-dot 0.9s ease-in-out infinite; }
.run-entry.running small { color: var(--accent); }
@keyframes entry-flash { from { background: #eef2e8; } }
.run-detail { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 4px 10px; padding: 8px 0 12px 53px; font-size: 10px; color: #6a6a60; }
.run-detail dt { color: var(--faint); }
.run-detail dd { margin: 0; overflow-wrap: anywhere; }
.run-empty { font-size: 11px; color: var(--muted); padding: 14px 0; }

/* Dialogs */
dialog { width: min(560px, calc(100vw - 32px)); max-height: 86vh; border: 1px solid #e4e4dc; border-radius: 14px; padding: 23px; background: #fff; color: var(--ink); box-shadow: 0 20px 60px #1f302323; }
dialog::backdrop { background: #202e282f; backdrop-filter: blur(2px); }
dialog.wide { width: min(640px, calc(100vw - 32px)); }
.dialog-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.dialog-heading h2 { font-size: 16px; font-weight: 600; }
.dialog-heading button { border: 0; background: #eef0eb; color: #929c91; font-size: 16px; line-height: 1; width: 30px; height: 30px; padding: 0; }
.dialog-description { margin: 4px 0 18px; font-size: 11px; color: #858d88; line-height: 1.8; }
.dialog-footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; border-top: 1px solid #edf0e9; padding-top: 16px; margin-top: 18px; }
.dialog-footer .left { margin-right: auto; }
.prompt-library { display: grid; gap: 10px; }
.template { border: 1px solid #ecefe7; background: #fafbf8; border-radius: 8px; padding: 12px 13px; }
.template-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.template-heading strong { font-size: 12px; }
.template-heading button { font-size: 10px; padding: 3px 9px; }
.template pre { margin: 0; font-family: inherit; font-size: 11px; line-height: 1.8; white-space: pre-wrap; color: #6f766a; }
.connection-faq details { border-bottom: 1px solid var(--line); }
.connection-faq summary { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 0; cursor: pointer; list-style: none; font-size: 12px; color: #9a4f3e; }
.connection-faq summary::-webkit-details-marker { display: none; }
.connection-faq details[open] .icon-chevron { transform: rotate(180deg); }
.connection-faq p, .connection-faq ol { margin: 0 0 12px; font-size: 11px; line-height: 1.85; color: #6c6c64; }
.connection-faq ol { padding-left: 18px; }
.diagnostic { margin-top: 16px; padding: 12px; background: #f6f7f3; border-radius: 8px; font-size: 11px; color: #66665e; }
.diagnostic-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.diagnostic-head button { font-size: 10px; padding: 3px 9px; }
#connection-diagnostic p { margin-top: 4px; }

/* Device picker */
.device-section-title { display: flex; align-items: baseline; gap: 8px; margin: 12px 0 8px; font-size: 12px; font-weight: 500; color: #4d5447; }
.device-section-title { flex-wrap: wrap; }
.device-section-title span { white-space: nowrap; }
.device-section-title small { font-size: 10px; font-weight: 400; }
.device-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 15px; gap: 8px; align-items: center; min-height: 56px; padding: 10px; border-radius: 7px; cursor: pointer; }
.device-row:hover { background: #f5f6f2; }
.device-row:has(input:checked) { background: #edf0e9; }
.device-row.disabled { cursor: default; }
.device-row input { position: absolute; opacity: 0; pointer-events: none; }
.device-row b { display: block; font-size: 12px; font-weight: 500; overflow-wrap: anywhere; }
.device-row small { display: block; font-size: 10px; color: #949c8b; }
.device-state { font-size: 10px; color: #88957c; text-align: right; max-width: 150px; }
.device-state.needs-help { color: #b28055; }
.row-check { width: 15px; color: var(--soft-ink); visibility: hidden; }
.device-row:has(input:checked) .row-check { visibility: visible; }
.device-help { grid-column: 1 / -1; font-size: 10px; color: var(--muted); }
.device-help summary { cursor: pointer; width: fit-content; }
.sim-install { margin: 0 10px 6px; font-size: 10px; color: #788769; }
.sim-install summary { cursor: pointer; width: fit-content; }
.sim-install p { color: var(--muted); margin-top: 4px; line-height: 1.7; }
.cloud-coming { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; margin-top: 18px; padding: 15px 12px; border-radius: 9px; background: linear-gradient(115deg, #e7ecdf, #eef2e8); color: #415d35; }
.cloud-coming b { font-size: 12px; }
.cloud-coming p { font-size: 10px; color: #6d7d62; }
.cloud-coming span { font-size: 10px; color: #6d7d62; }
.device-goal { margin-bottom: 8px; padding: 8px 10px; background: #f6f7f3; border-radius: 6px; font-size: 11px; color: #66665e; overflow-wrap: anywhere; }

/* Account dialog */
#account-dialog { width: min(520px, calc(100vw - 32px)); }
#account-dialog .account-description { margin: 6px 0 20px; color: #8c8c86; font-size: 11px; line-height: 1.8; }
#account-dialog label { display: block; font-size: 12px; margin: 14px 0 6px; }
#account-dialog input { width: 100%; border: 1px solid #e9e9e5; padding: 9px 12px; border-radius: 6px; background: #fff; color: #292927; font-size: 12px; min-width: 0; }
#account-dialog input::placeholder { color: #a2a29b; }
#account-dialog button { font-size: 12px; border-radius: 6px; }
#account-dialog .sms-row { display: flex; gap: 8px; }
#account-dialog .sms-row input { flex: 1; }
#account-dialog #send-otp { flex: none; min-width: 105px; white-space: nowrap; }
#account-dialog summary { cursor: pointer; width: fit-content; }
#account-profile:not([hidden]) { display: flex; align-items: center; gap: 12px; padding: 12px 0; }
#account-profile strong { font-size: 14px; font-weight: 500; }
#account-profile p { margin: 2px 0 0; font-size: 11px; color: #8c8c86; }
.account-avatar { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: #f3f3ef; color: #74796c; }
.account-avatar svg { width: 22px; height: 22px; }
#account-error { color: #a34238; margin: 12px 0 0; font-size: 12px; }

#toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #2f342d; color: #fff; padding: 9px 15px; border-radius: 8px; font-size: 12px; z-index: 30; max-width: 90vw; box-shadow: 0 8px 24px #1c221822; }

@media (max-width: 640px) {
	.canvas:not(.task-canvas) { display: flex; flex-direction: column; align-items: center; }
	.canvas:not(.task-canvas) .floating-plan { width: min(520px, 100%); margin-top: 18px; }
	.canvas:not(.task-canvas) .plan-body { position: static; }
	.canvas:not(.task-canvas) .plan-body .task-list { max-height: 280px; }
	.review-panel { order: 3; width: min(520px, 100%); margin-top: 18px; }
	.canvas.task-canvas { column-gap: 16px; }
}
@media (max-width: 480px) {
	.canvas.task-canvas { display: flex; flex-direction: column; align-items: center; }
	.canvas.task-canvas .floating-plan { width: 100%; margin-top: 18px; }
	.canvas.task-canvas .plan-body { position: static; }
	.canvas.task-canvas .plan-body .task-list { max-height: 280px; }
}
@media (max-width: 560px) {
	.start-device-layout { grid-template-columns: minmax(0, 1fr) 92px; gap: 12px; }
	.start-preview-frame { width: 92px; border-radius: 14px; padding: 3px; }
	.start-preview-screen { border-radius: 11px; }
	.start-preview-caption { max-width: 92px; }
	.panel-header, .devicebar { padding-left: 14px; padding-right: 14px; }
	.devicebar { align-items: flex-start; }
	.device-actions { flex-wrap: wrap; justify-content: flex-end; }
	.device-actions > button { padding: 4px 7px; }
	.device-selector span, .model-selector span { max-width: 140px; }
	.alerts { padding: 10px 14px 0; }
	.canvas { padding: 46px 14px 20px; }
	.environment-status { left: 14px; }
	.canvas.comment-canvas .review-panel { order: 3; }
	.workspace { padding: 4px 14px 22px; }
	.run-detail { padding-left: 0; }
	.screen canvas { max-height: 380px; }
}
</style></head><body>
<header class="panel-header"><div class="brand"><h1 class="opengui-name">OpenGUI</h1><span class="version-tag">${VERSION}</span></div><div class="pluginlinks"><button class="plugin-account" id="account-button" aria-haspopup="dialog">登录</button><a class="icon-link" href="https://github.com/Core-Mate/OpenGUI" target="_blank" rel="noopener noreferrer" title="OpenGUI GitHub" aria-label="OpenGUI GitHub">${GITHUB_ICON}</a></div></header>
<div class="devicebar"><div class="device-info"><span class="environment-help"><button class="status-dot" id="connection-dot-button" aria-describedby="connection-tip" aria-label="设备连接状态"><span class="dot" id="connection-dot"></span></button><span role="tooltip" id="connection-tip">等待设备画面</span></span><button class="device-selector" id="device-name" aria-haspopup="dialog"><span id="device-label">选择设备</span>${icon('chevron')}</button><button class="model-selector" id="model" aria-haspopup="dialog" aria-controls="model-info" aria-expanded="false"><span id="model-label">跟随 WorkBuddy</span>${icon('chevron')}</button></div><div class="device-actions"><button class="scenario-button" id="examples">场景示例</button><button class="takeover" id="takeover" hidden>${icon('hand')}<span>接管设备</span></button><div class="more"><button id="more" aria-label="更多设备操作" aria-haspopup="menu" aria-expanded="false">${icon('more')}</button></div></div></div>
<div class="alerts" id="alerts" aria-live="polite"><div class="alert" id="handoff-notice" hidden><div><strong id="handoff-title">需要你在手机上处理</strong><p id="handoff-reason"></p><p id="handoff-instruction"></p></div></div><div class="alert" id="input-notice" hidden><div><strong id="input-title">手机拒绝了模拟点击</strong><p id="input-guidance"></p><p id="input-state"></p></div><div class="alert-actions"><button id="input-details">查看处理方法</button></div></div><div class="alert" id="connection-alert" hidden><div><strong id="connection-alert-title"></strong><p id="connection-alert-detail"></p></div><div class="alert-actions"><button id="recheck">重新检测</button></div></div><div class="alert" id="apk-alert" hidden></div><div class="alert info" id="device-preference-notice" hidden></div><div class="alert" id="execution-budget" hidden></div></div>
<div class="canvas" id="stage"><div class="environment-status"><details class="environment" id="environment-details"><summary id="health-label">正在连接设备画面…</summary><div class="environment-panel"><p id="health-detail">正在等待第一帧画面。</p><div id="environment"></div></div></details><span class="environment-help" id="environment-help"><button id="health-info" aria-label="连接诊断" aria-describedby="environment-tip">${icon('info')}</button><span role="tooltip" id="environment-tip">遇到连接或操作问题，点击查看解决办法。</span></span><button class="access-link" id="access-link">连接帮助</button></div><button class="quiet zoom" id="zoom" aria-label="放大设备画面" aria-pressed="false" hidden>${icon('expand')}</button><section class="start-panel" id="start-panel" hidden aria-labelledby="start-title"><div class="start-head"><h2 id="start-title">新建任务</h2></div><p class="start-hint">先登录并选择执行模型，再连接设备、填写任务。点击「开始执行」后才会操作手机；首次使用可从「场景示例」选一个简单任务。</p><div class="start-field"><label class="start-label" for="start-request">你的任务</label><span class="start-prefix" id="start-prefix">@opengui</span><textarea class="start-request" id="start-request" aria-describedby="start-prefix" maxlength="4000" placeholder="描述你想让手机完成的任务，例如：打开小红书，搜索少儿英语"></textarea></div><div class="start-field"><span class="start-label">执行设备<span class="start-label-actions"><button class="help-link" id="start-device-help" title="查看设备连接帮助">未检测到已连接设备？</button><button class="access-link" id="start-refresh">重新检测</button></span></span><div class="start-device-layout"><div class="start-options" id="start-devices" role="radiogroup" aria-label="执行设备"></div><figure class="start-preview" id="start-preview" data-state="idle" aria-label="所选设备实时画面"><div class="start-preview-frame" id="start-preview-frame"><div class="start-preview-screen"><canvas id="start-preview-canvas" width="540" height="1170" hidden></canvas><span class="start-preview-note" id="start-preview-note">选择设备后显示画面</span></div></div><figcaption class="start-preview-caption" id="start-preview-caption">实时画面</figcaption></figure></div></div><div class="start-field start-advanced"><span class="start-label">高级选项</span><div class="start-advanced-row"><label class="start-switch"><input type="checkbox" role="switch" id="start-content-review"><span class="start-switch-track" aria-hidden="true"></span><span>发内容前需要审核</span></label><span class="content-review-help"><button type="button" class="help-icon" aria-label="发内容前需要审核是怎么工作的" aria-describedby="content-review-tip">?</button><span role="tooltip" id="content-review-tip">开启后，OpenGUI 在发帖、评论、回复、私信等对外发布文字内容前会先暂停，把发布账号、发布位置、上下文和完整内容交给你审核，你可以批准、修改或跳过。批准的内容输入后会与输入框逐字核对，一致才会发布；发布后截图确认已出现，结果不确定时不会自动重发。点赞、关注、收藏等不含文字的操作不需要审核。</span></span></div></div><div class="start-actions"><p class="start-blocker" id="start-blocker" aria-live="polite"></p><button class="primary" id="start-run" disabled>开始执行</button></div></section><div id="workbench"><main id="wall" class="phones"></main></div><aside class="review-panel" id="review-panel" aria-label="评论审核" hidden><div class="comment-progress" id="comment-progress"></div><div id="reviews"></div></aside><aside class="floating-plan" id="plan" aria-label="执行步骤"><div class="plan-body"><div class="plan-head"><button class="plan-toggle" id="plan-heading" aria-expanded="true" aria-controls="todos" hidden><span class="plan-title"><strong id="plan-title">执行步骤</strong><span id="plan-count"></span></span>${icon('chevron')}</button><p class="plan-state" id="task" aria-live="polite">准备中</p></div><ol class="task-list" id="todos" hidden></ol></div></aside></div>
<div class="workspace"><section class="section" id="report-section" hidden aria-labelledby="report-title"><div class="report-card"><div class="eyebrow">TASK REPORT · 任务报告</div><h2 class="report-title" id="report-title">任务报告</h2><div class="report-callout" id="report-callout"><strong id="report-state">任务尚未结束</strong><p id="report-summary"></p></div><div class="report-meta" id="report-meta"></div><div class="result-list" id="report-tests"></div><div class="exports"><a class="button primary" id="export-md">下载 Markdown</a><a class="button" id="export-pdf">下载 PDF</a><a class="button" id="export-word">下载 Word</a><a class="button" id="export-evidence">截图证据包</a><button type="button" class="primary new-task" id="report-new-task">${icon('plus')}新建任务</button></div><p class="report-note" id="report-note"></p></div></section><section class="section" id="checks-section" hidden><div class="section-head"><strong>检查项</strong><span id="scenario-counts"></span></div><div id="test-cases"></div></section><section class="section" id="trace-section" aria-label="本次运行"><div class="section-head"><strong>本次运行</strong><span id="trace-stats">等待执行</span></div><div id="trace-chart" hidden><div class="run-axis" id="trace-axis" aria-label="时间刻度"></div><div class="run-track-row"><span>模型</span><div class="run-track" id="model-track"></div></div><div class="run-track-row"><span>设备</span><div class="run-track" id="tool-track"></div></div><p class="run-note" id="model-source"></p></div><div class="run-log" id="trace-list"></div></section></div>
<dialog id="examples-dialog" aria-labelledby="examples-title"><div class="dialog-heading"><h2 id="examples-title">场景示例</h2><button data-close aria-label="关闭">×</button></div><p class="dialog-description">首次使用可先试「设置与返回桌面」。选择「填入任务」后可继续编辑，替换【】中的占位内容，再点击「开始执行」。也可复制到 WorkBuddy 对话。</p><div class="prompt-library" id="templates"></div></dialog>
<dialog id="guide" aria-labelledby="guide-title"><div class="dialog-heading"><h2 id="guide-title">设备连接帮助</h2><button data-close aria-label="关闭">×</button></div><p class="dialog-description">找到你遇到的问题，按提示在手机或电脑上操作。</p><div class="connection-faq">
<details open><summary>第一次连接 Android 手机，要做什么？${icon('chevron')}</summary><ol><li>打开「设置 → 关于手机」，连续点击「版本号」7 次，直到提示已进入开发者模式。</li><li>进入「设置 → 系统 → 开发者选项」，打开「USB 调试」。</li><li>用支持数据传输的数据线连接电脑，通知栏的 USB 用途选择「传输文件（MTP）」，不要选「仅充电」。</li><li>小米、Redmi、vivo 等机型还需打开「USB 调试（安全设置）」和「允许通过 USB 安装应用」。</li><li>手机弹出「允许 USB 调试吗？」时，勾选「始终允许」并点击确定。</li></ol></details>
<details><summary>电脑找不到手机怎么办？${icon('chevron')}</summary><p>解锁手机，把 USB 用途改为「传输文件」（仅充电模式无法建立调试连接），再看手机是否出现授权弹窗。仍找不到时，换一根支持数据传输的线或换一个 USB 接口，然后点击「重新检测连接」。</p></details>
<details><summary>提示需要授权（unauthorized）？${icon('chevron')}</summary><p>手机已被发现，但还没允许这台电脑调试。解锁手机，在「允许 USB 调试吗？」弹窗中点击允许；没有弹窗时重新插拔数据线，或在开发者选项中撤销授权后再连接。</p></details>
<details><summary>能看到画面，却不能点击？${icon('chevron')}</summary><p>多见于小米 / Redmi：在开发者选项中打开「USB 调试（安全设置）」，按系统提示允许模拟点击。权限和安全弹窗请在手机上手动确认，处理后点击「重新检测连接」。</p></details>
<details><summary>连接突然断开，任务会丢吗？${icon('chevron')}</summary><p>不会。任务会自动暂停并保留进度、草稿和截图。重新连接同一台手机后点击「重新检测连接」，系统会先核对当前画面，再从原步骤继续，不会重复上一步。</p></details>
<details><summary>可以用模拟器或 iPhone 吗？${icon('chevron')}</summary><p>支持 Android 模拟器（在 Android Studio 中创建并启动）；macOS 上也可使用已启动的 iOS 模拟器做界面测试。iOS 真机暂不支持，云手机敬请期待。</p></details>
</div><div class="diagnostic"><div class="diagnostic-head"><span>仍然找不到设备？检查一下电脑侧的 USB 与调试连接。</span><button id="diagnose-connection">检查当前连接</button></div><div id="connection-diagnostic" aria-live="polite" hidden></div></div><div class="dialog-footer"><button data-close>关闭</button><button class="primary" id="guide-recheck">重新检测连接</button></div></dialog>
<dialog id="devices" class="wide" aria-labelledby="devices-heading"><div class="dialog-heading"><h2 id="devices-heading">选择设备</h2><button data-close aria-label="关闭">×</button></div><p class="dialog-description" id="devices-message" aria-live="polite"></p><p class="device-goal" id="device-goal" hidden></p><div id="device-list"></div><div class="cloud-coming" aria-disabled="true"><div><b>云手机</b><p>让 AI 在多台云端设备上并行工作。</p></div><span>敬请期待</span></div><p class="dialog-description" id="device-binding" style="margin:14px 0 0">每个任务只绑定一台设备，确认后不会自动切换。</p><div class="dialog-footer"><button class="left" id="device-help">连接帮助</button><button id="refresh-devices">重新检测</button><button data-close>取消</button><button class="primary" id="confirm-device" disabled>连接设备</button></div></dialog><dialog id="emulator-dialog" aria-labelledby="emulator-title"><div class="dialog-heading"><h2 id="emulator-title">安装 Android 模拟器</h2><button data-close aria-label="关闭">×</button></div><p class="dialog-description">没有手机也能使用 OpenGUI：下载官方 Android 模拟器和 Android 14 系统镜像（约 <span id="emulator-size">2.0 GB</span>），在本机创建一台虚拟手机并在后台启动，完成后会出现在设备列表中。</p><ul><li>需要约 8 GB 可用磁盘空间；下载时间取决于网络，关闭工作台不影响下载，中断后再次安装会续传。</li><li>文件来自 Google 官方源或腾讯云镜像，均按 Google 公布的大小和校验值核对。</li><li>只安装在 OpenGUI 自己的目录，不改动已有的 Android Studio 和模拟器。</li><li>Windows 需在「启用或关闭 Windows 功能」中开启「Windows 虚拟机监控程序平台」。</li></ul><label class="emulator-license"><input type="checkbox" id="emulator-accept">我已阅读并同意 <a href="https://developer.android.com/studio/terms" target="_blank" rel="noopener noreferrer">Android SDK 许可协议</a></label><div class="dialog-footer"><button data-close>取消</button><button class="primary" id="emulator-install" disabled>开始安装</button></div></dialog>
<dialog id="model-info" class="popover" aria-labelledby="model-title"><div class="popover-label" id="model-title">执行模型</div><div id="model-list"></div><p class="popover-note" id="model-message" aria-live="polite">任务执行期间不能切换模型。</p></dialog>
<dialog id="more-menu" class="popover" aria-label="更多设备操作"><button class="menu-item" id="menu-recheck">重新检测连接与环境</button><button class="menu-item" id="menu-help">设备连接帮助</button><button class="menu-item danger" id="disconnect" title="停止本次控制并释放设备；不会卸载应用或删除数据"><span>断开当前设备<small>停止本次控制，不卸载应用、不删数据</small></span></button></dialog>
<dialog id="account-dialog" aria-labelledby="account-title" aria-describedby="account-state"><div class="dialog-heading"><h2 id="account-title">OpenGUI登录/注册</h2><button data-close aria-label="关闭">×</button></div><p id="account-state" class="account-description">欢迎体验OpenGUI，登录时若未注册，将自动注册</p><form id="login-form" novalidate><label for="account-phone">手机号</label><input id="account-phone" type="tel" autocomplete="tel" inputmode="numeric" maxlength="11" placeholder="请输入 11 位手机号"><label for="account-code">验证码</label><div class="sms-row"><input id="account-code" autocomplete="one-time-code" inputmode="numeric" maxlength="6" placeholder="6 位验证码"><button type="button" id="send-otp">获取验证码</button></div></form><div id="account-profile" hidden><span class="account-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg></span><div><strong id="account-phone-display"></strong><p>已登录</p></div></div><p id="account-error" role="alert" hidden></p><p id="account-lock-note" class="account-description" hidden>任务执行中，结束后可切换账号或服务。</p><div class="dialog-footer"><button class="left" id="sign-out" hidden>退出登录</button><button data-close>取消</button><button id="sign-in" class="primary" type="submit" form="login-form">登录</button></div></dialog>
<dialog id="input-help" aria-labelledby="input-help-title"><div class="dialog-heading"><h2 id="input-help-title">能看到画面，但手机拒绝点击</h2><button data-close aria-label="关闭">×</button></div><p class="dialog-description" id="input-help-guidance"></p><p class="dialog-description">请在手机上处理系统安全设置。失败的操作不会自动重放；处理后重新检测，并以后续操作结果为准。</p><p class="muted" id="input-help-state"></p><div class="dialog-footer"><button id="input-connection-help">查看连接帮助</button><button id="input-recheck" class="primary">我已处理，重新检测</button></div></dialog>
<div id="toast" role="status" hidden></div>`
}

export function workbenchScript(): string {
  return String.raw`<script>
const connectionHint = ${connectionHint.toString()};
const ICONS = ${JSON.stringify(ICONS)};
const icon = (name) => '<svg class="ui-icon icon-' + name + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
const byId = (id) => document.getElementById(id),
	boardKey = "opengui-board:" + location.pathname,
	boardToken = new URLSearchParams(location.hash.slice(1)).get("board") || sessionStorage.getItem(boardKey);
if (boardToken) {
	sessionStorage.setItem(boardKey, boardToken);
	history.replaceState(null, "", location.pathname);
}
let connectionPromptedAt = null, inputPromptedAt = null, boardStatus = null, traceSnapshot = "", reviewSnapshot = "", testSnapshot = "", planSnapshot = "", reportSnapshot = "", finishedReport = false, toastTimer;
const openTraces = new Set(), traceBars = new Map();
let traceSeen = null;
const kindLabels = { environment: "环境检查", apk_inspect: "安装包检查", apk_install: "安装应用", model: "模型推理", observe: "读取屏幕", tap: "点击", swipe: "滑动", text: "输入文本", replace_text: "替换输入框文字", read_text: "读取输入框", key: "按键", launch: "启动应用", wait: "等待页面" };
const stateLabels = { running: "进行中", executed: "已完成", failed: "失败", unknown: "结果待确认" };
const reviewLabels = { pending: "待你审核", approved: "已批准 · 等待发送", skipped: "已跳过", submitted: "已发送 · 待核验", sent: "已发送并核验", unknown: "结果待确认" };
const todoLabels = { pending: "待执行", in_progress: "执行中", awaiting_user: "待你处理", completed: "已完成", failed: "失败", skipped: "已跳过", unfinished: "未完成" };
const caseLabels = { passed: "通过", failed: "失败", unverified: "待确认", not_checked: "未检查" };
const errorLabels = { model_upstream_error: "模型服务返回错误", model_network_error: "模型请求失败（已重试）", model_request_failed: "模型请求失败", screen_changed: "画面已变化，未执行", stop_before_submit: "按约定停在提交前，未执行", stop_action_unclassified: "未标明操作用途，未执行", budget_exhausted: "执行次数已用完", task_paused: "任务已暂停", device_offline: "设备离线", connection_lost: "连接中断", input_permission_denied: "手机拒绝模拟输入", no_progress: "多次操作画面无变化", observation_required: "需要先读取最新画面", operation_failed: "执行失败", cancelled: "已取消", review_required: "需要先审核评论" };
const outcomeLabels = { completed: "任务已完成", stopped: "已按约定停止", blocked: "任务受阻", unknown: "结果待确认", cancelled: "任务已停止" };
function toast(message) {
	byId("toast").textContent = message;
	byId("toast").hidden = false;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => (byId("toast").hidden = true), 3500);
}
function el(tag, className, text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}
function seconds(ms) { return ms >= 10000 ? Math.round(ms / 1000) + "s" : (ms / 1000).toFixed(1) + "s"; }
function shortTitle(text, fallback) {
	const first = String(text || "").replace(/^@opengui\s*/i, "").split(/[，。,.;；\n]/)[0].trim();
	if (!first) return fallback;
	return first.length > 22 ? first.slice(0, 21) + "…" : first;
}
function closePopovers(except) { for (const id of ["model-info", "more-menu"]) if (id !== except && byId(id).open) byId(id).close(); }
function show(id) {
	closePopovers();
	document.querySelectorAll("dialog[open]").forEach((d) => d.close());
	byId(id).showModal();
}
document.querySelectorAll("[data-close]").forEach((button) => (button.onclick = () => button.closest("dialog").close()));
function placePopover(popover, trigger) {
	if (!popover.open) return;
	const rect = trigger.getBoundingClientRect();
	popover.style.left = Math.max(12, Math.min(rect.left, innerWidth - popover.offsetWidth - 12)) + "px";
	popover.style.top = Math.max(12, Math.min(rect.bottom + 7, innerHeight - popover.offsetHeight - 12)) + "px";
}
function togglePopover(id, trigger) {
	const popover = byId(id);
	if (popover.open) { popover.close(); return false; }
	closePopovers(id);
	popover.show(); trigger.setAttribute("aria-expanded", "true");
	placePopover(popover, trigger);
	return true;
}
for (const [id, trigger] of [["model-info", "model"], ["more-menu", "more"]]) {
	byId(id).addEventListener("close", () => byId(trigger).setAttribute("aria-expanded", "false"));
	byId(id).addEventListener("keydown", (event) => { if (event.key === "Escape") { byId(id).close(); byId(trigger).focus(); } });
}
document.addEventListener("pointerdown", (event) => {
	for (const [id, trigger] of [["model-info", "model"], ["more-menu", "more"]]) {
		const popover = byId(id);
		if (popover.open && !popover.contains(event.target) && !byId(trigger).contains(event.target)) popover.close();
	}
});
addEventListener("resize", () => { placePopover(byId("model-info"), byId("model")); placePopover(byId("more-menu"), byId("more")); });

for (const id of ["access-link", "menu-help", "device-help", "health-info", "input-connection-help"]) byId(id).onclick = () => show("guide");
byId("examples").onclick = () => show("examples-dialog");
byId("report-new-task").onclick = async () => {
	const button = byId("report-new-task"); button.disabled = true;
	if (!await boardAction("new_task")) button.disabled = !boardToken;
};
byId("device-name").onclick = () => { if (boardStatus?.startRequired) { byId("start-devices").scrollIntoView({ block: "center", behavior: "smooth" }); byId("start-devices").querySelector("input:not(:disabled)")?.focus(); } else void showDevices(); };
byId("more").onclick = () => togglePopover("more-menu", byId("more"));
byId("account-button").onclick = () => show("account-dialog");
byId("zoom").onclick = () => {
	const zoomed = byId("stage").classList.toggle("zoomed");
	byId("zoom").setAttribute("aria-pressed", String(zoomed));
	byId("zoom").setAttribute("aria-label", zoomed ? "还原设备画面" : "放大设备画面");
};
byId("diagnose-connection").onclick = async () => {
	const button = byId("diagnose-connection"), result = byId("connection-diagnostic");
	if (button.disabled) return;
	button.disabled = true; result.hidden = false; result.textContent = "正在检查…";
	try {
		const response = await fetch(location.pathname + "connection-diagnostic", { cache: "no-store", signal: AbortSignal.timeout(10000) });
		if (!response.ok) throw Error("connection_diagnostic_unavailable");
		const diagnostic = await response.json();
		result.replaceChildren();
		const append = (text) => result.append(el("p", "", text));
		append(diagnostic.adb.status === "checked" ? "调试连接：已授权 " + diagnostic.adb.authorizedUsb + " 台，待授权 " + diagnostic.adb.unauthorizedUsb + " 台，离线 " + diagnostic.adb.unavailableUsb + " 台" : "调试连接：未能完成检测");
		append(diagnostic.usb.status === "checked" ? "电脑 USB 接口：调试 " + diagnostic.usb.adbInterfaces + " 个，文件传输 / 相机 " + diagnostic.usb.mediaInterfaces + " 个" : "电脑 USB 接口：未能完成检测");
		for (const guidance of diagnostic.guidance) append(guidance);
		append("检测时间 " + new Date(diagnostic.checkedAt).toLocaleTimeString());
	} catch { result.textContent = "这次检测没有完成，请检查连接后重试。"; }
	finally { button.disabled = false; }
};

let deviceInventory = [], deviceSelectedId = "", devicePickerPending = false, deviceSelectionPrompted = false;
function deviceDetails(device) {
	const connection = { usb: "真机 · USB", network: "真机 · 无线调试", local_simulator: "模拟器" }[device.connection] || "连接方式未知";
	return [(device.os === "ios" ? "iOS " : "Android ") + (device.osVersion || "版本待确认"), connection, "…" + (device.serialSuffix || "????"), device.manufacturer].filter(Boolean).join(" · ");
}
function updateDeviceButtons() {
	const choosing = Boolean(boardStatus?.selectionRequired);
	const available = boardStatus?.canSelectDevice && !devicePickerPending && Boolean(boardToken);
	byId("confirm-device").hidden = !choosing;
	byId("confirm-device").disabled = !available || !deviceInventory.some((d) => d.id === deviceSelectedId && d.selectable);
	byId("refresh-devices").disabled = devicePickerPending;
	byId("devices-heading").textContent = choosing ? "选择设备" : "当前设备";
	byId("device-binding").textContent = choosing ? "每个任务只绑定一台设备。确认后沿用当前任务，看到新画面后才开始操作。" : "当前任务已绑定这台设备。如需换设备，请先结束任务再发起新任务。";
	byId("device-goal").hidden = !boardStatus?.board?.objective;
	byId("device-goal").textContent = "当前任务：" + (boardStatus?.board?.objective || "");
}
function renderDeviceChoices() {
	const list = byId("device-list");
	list.replaceChildren();
	const sections = [
		[false, "Android 真机", "USB / 无线调试 · 需 Android 5.0+ · iOS 真机暂不支持"],
		[true, "本地模拟器", "Android 模拟器 · macOS 上的 iOS 模拟器"],
	];
	for (const [simulator, heading, advice] of sections) {
		const title = el("div", "device-section-title");
		title.append(el("span", "", heading));
		title.append(el("small", "muted", advice));
		list.append(title);
		const all = deviceInventory.filter((d) => (d.connection === "local_simulator") === simulator);
		// Shut-down simulators are listed once, folded, instead of as a column of failures.
		const idle = simulator ? all.filter((d) => !d.selected && d.selectionStatus === "not_connected") : [];
		const devices = all.filter((d) => !idle.includes(d));
		if (!devices.length) list.append(el("p", "device-help", simulator ? "  暂未发现运行中的模拟器。" : "  暂未发现手机。连接后点击「重新检测」。"));
		for (const device of devices) {
			const row = el("label", "device-row"), radio = el("input"), copy = el("span"), state = el("span", "device-state"), check = el("span", "row-check");
			radio.type = "radio"; radio.name = "selected-device"; radio.value = device.id;
			radio.checked = device.id === deviceSelectedId || (!deviceSelectedId && device.selected);
			radio.disabled = !boardStatus?.canSelectDevice || !device.selectable || devicePickerPending || !boardToken;
			radio.onchange = () => { deviceSelectedId = device.id; updateDeviceButtons(); };
			const hint = device.connectionHint || connectionHint(device);
			copy.append(el("b", "", device.name), el("small", "", deviceDetails(device)));
			state.textContent = (device.selected ? "当前设备" : hint.warning ? hint.label : "可连接") + (device.preferred ? " · 上次使用" : "");
			state.classList.toggle("needs-help", hint.warning);
			check.innerHTML = icon("check");
			row.classList.toggle("disabled", radio.disabled);
			row.title = hint.detail;
			row.append(radio, copy, state, check);
			if (hint.warning) {
				const help = el("details", "device-help"), summary = el("summary", "", "原因与处理");
				help.append(summary, el("p", "", hint.detail));
				help.onclick = (event) => event.stopPropagation();
				row.append(help);
			}
			list.append(row);
		}
		if (idle.length) {
			const folded = el("details", "sim-install"), summary = el("summary", "", "另有 " + idle.length + " 个未启动的模拟器");
			folded.append(summary, el("p", "", idle.map((d) => d.name + "（" + deviceDetails(d) + "）").join("；") + "。启动后点击「重新检测」即可选择。"));
			list.append(folded);
		}
		if (simulator) {
			const install = el("details", "sim-install"), summary = el("summary", "", "安装与环境检查");
			install.append(summary, el("p", "", "Android：在 Android Studio 的 SDK Manager 安装 Emulator、Platform Tools 和系统镜像，创建并启动虚拟设备。iOS（仅 macOS）：安装 Xcode 与 iOS Simulator runtime，启动模拟器后重新检测。"));
			list.append(install);
		}
	}
	updateDeviceButtons();
}
async function showDevices(autoBind = false) {
	show("devices");
	if (devicePickerPending) return;
	devicePickerPending = true; updateDeviceButtons(); byId("devices-message").textContent = "正在读取已连接的设备…";
	try {
		const response = await fetch(location.pathname + "devices?refresh=1"), result = await response.json();
		if (!response.ok) throw Error(result.error || "设备检测没有完成，请检查连接后重试");
		deviceInventory = result.devices;
		const preferred = deviceInventory.find((d) => d.id === result.preferredDeviceId && d.selectable);
		if (!result.canSelectDevice) deviceSelectedId = deviceInventory.find((d) => d.selected)?.id || "";
		else if (!deviceInventory.some((d) => d.id === deviceSelectedId && d.selectable)) deviceSelectedId = preferred?.id || "";
		byId("devices-message").textContent = result.devicePreferenceError
			|| (result.canSelectDevice && result.preferredDeviceId && !preferred ? "上次使用的设备当前不可用。连接后重新检测，或选择另一台；任务要求已保留。"
			: !deviceInventory.length ? "还没有发现设备。连接手机并允许 USB 调试，或启动模拟器后点击「重新检测」。任务要求已保留。"
			: result.canSelectDevice ? "按型号、系统版本和序列号后 4 位确认要使用的设备。" : "本次任务已绑定这台设备，重新检测不会切换手机。");
		devicePickerPending = false; renderDeviceChoices(); void refreshEmulator();
		const eligible = deviceInventory.filter((d) => d.selectable);
		const reusable = preferred || (!result.preferredDeviceId && eligible.length === 1 ? eligible[0] : undefined);
		if (autoBind && result.canSelectDevice && reusable) { deviceSelectedId = reusable.id; renderDeviceChoices(); await confirmDevice(); }
	} catch (error) { byId("devices-message").textContent = error.message; }
	finally { devicePickerPending = false; updateDeviceButtons(); }
}
async function confirmDevice() {
	if (devicePickerPending || !boardStatus?.canSelectDevice || !deviceInventory.some((d) => d.id === deviceSelectedId && d.selectable)) return;
	devicePickerPending = true; renderDeviceChoices();
	try { if (await boardAction("select_device", { deviceId: deviceSelectedId })) byId("devices").close(); }
	finally { devicePickerPending = false; renderDeviceChoices(); }
}
byId("refresh-devices").onclick = () => void showDevices();
byId("confirm-device").onclick = () => void confirmDevice();

/* One-click Android emulator: shown in both device pickers when no Android device is attached,
   or while an install/start is running. The broker does the work; the page only polls progress. */
let emulatorState = null, emulatorTimer = 0, emulatorLoading = false, emulatorPhase = "";
const emulatorBoxes = [];
function emulatorBox() { const box = el("div", "emulator-box"); box.hidden = true; emulatorBoxes.push(box); return box; }
const startEmulatorBox = emulatorBox(), dialogEmulatorBox = emulatorBox();
byId("device-list").after(dialogEmulatorBox);
const sizeLabel = (bytes) => bytes >= 1024 ** 3 ? (bytes / 1024 ** 3).toFixed(1) + " GB" : Math.round(bytes / 1024 ** 2) + " MB";
function openEmulatorDialog() {
	byId("emulator-size").textContent = sizeLabel(emulatorState?.downloadBytes || 2.1 * 1024 ** 3);
	byId("emulator-accept").checked = false; byId("emulator-install").disabled = true;
	show("emulator-dialog");
}
const emulatorErrorText = (error) => error === "emulator_cancelled" ? "已取消" : String(error || "").includes(": ") ? String(error).slice(String(error).indexOf(": ") + 2) : "没有完成，请重试";
async function refreshEmulator() {
	clearTimeout(emulatorTimer);
	if (emulatorLoading) return;
	emulatorLoading = true;
	try { const response = await fetch(location.pathname + "emulator", { signal: AbortSignal.timeout(12000) }); if (response.ok) emulatorState = await response.json(); }
	catch {} finally { emulatorLoading = false; }
	const phase = emulatorState?.job?.phase || "";
	// A finished boot attaches a new device: refresh whichever picker is showing.
	if (phase === "ready" && emulatorPhase && emulatorPhase !== "ready") {
		startDevicesLoaded = false; if (boardStatus) renderStart(boardStatus, true);
		if (byId("devices").open) void showDevices();
		toast("Android 模拟器已就绪");
	}
	emulatorPhase = phase;
	renderEmulator();
	if (phase && !["ready", "error"].includes(phase)) emulatorTimer = setTimeout(() => void refreshEmulator(), 1500);
}
async function emulatorAction(body) {
	try {
		const response = await fetch(location.pathname + "emulator", { method: "POST", headers: { "Content-Type": "application/json", "X-OpenGUI-Board": boardToken || "" }, body: JSON.stringify(body) });
		const result = await response.json().catch(() => ({}));
		if (!response.ok) throw Error(result.error || "操作没有完成，请稍后重试");
		emulatorState = result; emulatorPhase = result.job?.phase || "checking"; renderEmulator(); void refreshEmulator();
	} catch (error) { toast(error.message); }
}
function emulatorRow(box, title, detail, buttons, className = "") {
	const row = el("div", "emulator-row" + (className ? " " + className : "")), copy = el("div"), actions = el("div", "actions");
	copy.append(el("b", "", title)); if (detail) copy.append(el("p", "", detail));
	for (const button of buttons) actions.append(button);
	row.append(copy, actions); box.append(row);
}
function emulatorButton(label, primary, onClick) { const button = el("button", primary ? "primary" : "", label); button.disabled = !boardToken; button.onclick = onClick; return button; }
function renderEmulator() {
	const state = emulatorState, job = state?.job, active = Boolean(job && !["ready", "error"].includes(job.phase));
	const avds = (state?.avds || []).filter((avd) => !avd.running);
	for (const box of emulatorBoxes) {
		const androidFound = box === startEmulatorBox ? startDevices.length > 0 : (deviceInventory || []).some((d) => d.os !== "ios");
		box.replaceChildren();
		box.hidden = !state?.supported || (!active && job?.phase !== "error" && androidFound);
		if (box.hidden) continue;
		if (active) {
			const percent = job.total ? Math.min(100, Math.floor(job.received / job.total * 100)) : undefined;
			emulatorRow(box, job.label, job.total ? "已下载 " + sizeLabel(job.received || 0) + " / " + sizeLabel(job.total) + "（" + percent + "%）" + (job.source ? " · 来源 " + job.source : "") : "", [emulatorButton("取消", false, () => void emulatorAction({ action: "cancel" }))]);
			const bar = el("div", "emulator-progress" + (percent === undefined ? " indeterminate" : "")), fill = el("span");
			if (percent !== undefined) fill.style.width = percent + "%";
			bar.append(fill); box.append(bar);
		} else if (job?.phase === "error") {
			emulatorRow(box, "Android 模拟器" + (job.error === "emulator_cancelled" ? "已取消" : "没有完成"), emulatorErrorText(job.error), [emulatorButton("重试", true, () => avds.length ? void emulatorAction({ action: "start", name: avds[0].name }) : openEmulatorDialog())], "emulator-error");
		} else if (avds.length) {
			const select = el("select");
			for (const avd of avds) { const option = el("option", "", avd.name + (avd.origin === "opengui" ? "（OpenGUI）" : "（Android Studio）")); option.value = avd.name; select.append(option); }
			const controls = avds.length > 1 ? [select] : [];
			emulatorRow(box, avds.length > 1 ? "启动已有的 Android 模拟器" : "已有模拟器：" + avds[0].name, "在后台启动，启动后出现在设备列表中", [...controls, emulatorButton("启动模拟器", true, () => void emulatorAction({ action: "start", name: avds.length > 1 ? select.value : avds[0].name }))]);
		} else {
			emulatorRow(box, "没有手机？一键安装 Android 模拟器", "下载约 " + sizeLabel(state.downloadBytes || 2.1 * 1024 ** 3) + "，在本机后台运行一台虚拟手机", [emulatorButton("一键安装", true, openEmulatorDialog)]);
		}
	}
}
byId("emulator-accept").onchange = () => { byId("emulator-install").disabled = !byId("emulator-accept").checked || !boardToken; };
byId("emulator-install").onclick = () => {
	if (!byId("emulator-accept").checked) return;
	byId("emulator-dialog").close();
	void emulatorAction({ action: "install", acceptLicense: true });
};

const templates = [
	["先试一下 · 设置与返回桌面", "@opengui 打开手机设置，再返回桌面，确认回到桌面后结束。"],
	["自动化测试", "@opengui 帮我测试【应用／页面】的【功能或操作流程】，使用【测试数据】，预期看到【结果】。如果发现异常，记录操作步骤和截图，做到【结束位置】就停。"],
	["运营评论", "@opengui 帮我处理【平台／账号／帖子链接】下的【评论范围】。逐条查看评论及上下文并用【期望语气】起草回复，交给我审核后发送。不需要回复的直接跳过并记录原因。直到【处理满 N 条／运行 X 分钟】或我主动停止，最后汇总处理结果。"],
];
for (const [title, text] of templates) {
	const section = el("div", "template"), heading = el("div", "template-heading"), copy = el("button", "", "复制模板"), pre = el("pre", "", text);
	copy.onclick = async () => {
		try {
			await navigator.clipboard.writeText(text);
			toast("模板已复制，请粘贴到 WorkBuddy 对话框并修改");
		} catch {
			const range = document.createRange();
			range.selectNodeContents(pre);
			getSelection().removeAllRanges();
			getSelection().addRange(range);
			toast("剪贴板不可用，已选中模板文字，请手动复制");
		}
	};
	const use = el("button", "", "填入任务");
	use.onclick = () => {
		if (!boardStatus?.startRequired || startBusy) { toast("请先点击「新建任务」，再填入示例"); return; }
		byId("start-request").value = taskText(text); startRequestDirty = true;
		byId("examples-dialog").close(); renderStart(boardStatus, true); byId("start-request").focus();
		toast("已填入任务，请检查内容；点击「开始执行」后才会运行");
	};
	heading.append(el("strong", "", title), use, copy);
	section.append(heading, pre);
	byId("templates").append(section);
}

async function boardAction(action, extra = {}) {
	if (!boardToken) {
		toast("这是只读画面，请从当前任务打开工作台");
		return;
	}
	const buttons = [...document.querySelectorAll("#takeover,#recheck,#menu-recheck,#guide-recheck,#disconnect,#send-otp,#sign-in,#sign-out")];
	buttons.forEach((b) => (b.disabled = true));
	try {
		const response = await fetch(location.pathname + "board", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-OpenGUI-Board": boardToken },
			body: JSON.stringify({ action, ...extra }),
		});
		if (!response.ok)
			throw Error(response.status === 403 ? "控制入口已失效，请回到当前任务"
				: response.status === 409 ? "任务已结束"
				: (await response.json().catch(() => ({}))).error || "操作没有完成，请确认设备仍然连接");
		const result = await response.json();
		if (action === "new_task") { location.assign(result.workbenchUrl); return true; }
		renderBoard(result);
		if (action === "recheck" || action === "resume") {
			const originalIds = new Set((boardStatus?.devices || []).map((device) => device.id));
			for (const c of cards.values()) if (originalIds.has(c.id) && (!c.ws || !c.rendered || c.canvas.classList.contains("stale") || Date.now() - c.decodedAt > 3000)) { c.retries = 0; connect(c); }
		}
		const control = boardStatus?.board?.control;
		toast(action === "resume" || action === "recheck"
			? control === "manual" ? "连接已检测，你仍在控制设备；处理完后点击「恢复控制」"
				: control === "paused" ? "连接已检测，任务仍暂停；请确认设备连接后再次重新检测"
				: "已检测，下一步先核对当前画面再继续"
			: action === "select_device" ? "已连接所选设备，等待画面"
			: action === "takeover" ? "已暂停 AI 操作并交给你控制，处理完后点击「恢复控制」"
			: action === "model" ? "模型选择已更新：" + (boardStatus?.board?.model || "跟随 WorkBuddy")
			: "状态已更新");
		return true;
	} catch (error) {
		toast(error.message);
		if (action === "account") accountError(error.message);
		return false;
	} finally {
		buttons.forEach((b) => (b.disabled = false));
		if (boardStatus) renderBoard(boardStatus);
	}
}

let modelRequest;
async function showModels() {
	const picker = byId("model-info"), trigger = byId("model");
	if (trigger.disabled) return;
	if (!togglePopover("model-info", trigger)) return;
	const request = new AbortController(); modelRequest = request;
	const list = byId("model-list"); list.replaceChildren();
	const current = boardStatus?.modelSelectionError ? "" : boardStatus?.board?.modelConfig?.id || "host";
	const option = (model, tag) => {
		const button = el("button", "menu-item" + (model.id === current ? " selected" : "")), name = el("span"), meta = el("span", "model-meta"), check = el("span", "model-check");
		name.append(el("b", "", model.name));
		if (model.model) name.append(el("small", "", model.model));
		if (tag) meta.append(el("span", tag === "推荐" ? "tag popular" : "tag", tag === "推荐" ? "✦ 推荐" : tag));
		if (model.id === current) check.innerHTML = icon("check");
		meta.append(check);
		button.append(name, meta);
		button.setAttribute("aria-pressed", String(model.id === current));
		button.disabled = !boardToken || boardStatus?.board?.control !== "idle";
		button.onclick = async () => { if (await boardAction("model", { modelId: model.id })) picker.close(); };
		list.append(button);
	};
	if (!boardStatus?.workbenchManaged) option({ id: "host", name: "跟随 WorkBuddy", model: "使用当前对话的模型" }, "默认");
	byId("model-message").textContent = "正在读取可用模型…";
	try {
		const response = await fetch(location.pathname + "models", { signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]) }), result = await response.json();
		if (modelRequest !== request || !picker.open) return;
		if (!response.ok) throw Error(result.error || "模型列表暂不可用，请稍后重试");
		for (const model of result.models) option(model, model.recommended ? "推荐" : undefined);
		byId("model-message").textContent = result.models.length ? "官方模型由后台统一配置，密钥不经过本机；选中即生效，任务执行期间锁定。" : boardStatus?.account?.user ? "后台暂无可用的手机模型。" : "登录后可使用官方模型。";
	} catch (error) {
		if (modelRequest === request && picker.open) byId("model-message").textContent = error.name === "TimeoutError" ? "模型列表读取超时，请稍后重试。" : error.message;
	} finally { if (modelRequest === request && picker.open) placePopover(picker, trigger); }
}
byId("model").onclick = () => void showModels();
byId("model-info").addEventListener("close", () => { modelRequest?.abort(); modelRequest = undefined; });

let otpDeadline = 0, accountPending = false;
function accountError(message, field) { byId("account-error").textContent = message; byId("account-error").hidden = !message; if (field) byId(field).focus(); }
async function accountAction(extra) {
	if (accountPending) return false;
	accountPending = true; accountError(""); if (boardStatus) renderBoard(boardStatus);
	try { return await boardAction("account", extra); }
	finally { accountPending = false; if (boardStatus) renderBoard(boardStatus); }
}
function accountServiceReady() {
	if (boardStatus?.account?.serviceUrl) return true;
	accountError("当前版本未内置账号服务，暂时无法登录。"); return false;
}
byId("send-otp").onclick = async () => {
	if (Date.now() < otpDeadline || accountPending) return;
	const phone = byId("account-phone").value.trim();
	if (!/^1[3-9][0-9]{9}$/.test(phone)) return accountError("请输入正确的 11 位手机号。", "account-phone");
	if (!accountServiceReady()) return;
	if (await accountAction({ operation: "send-otp", phone })) {
		otpDeadline = Date.now() + 60000; toast("验证码已发送"); if (boardStatus) renderBoard(boardStatus);
	}
};
byId("login-form").onsubmit = async (event) => {
	event.preventDefault(); if (accountPending) return;
	const phone = byId("account-phone").value.trim(), code = byId("account-code").value.trim();
	if (!/^1[3-9][0-9]{9}$/.test(phone)) return accountError("请输入正确的 11 位手机号。", "account-phone");
	if (!/^[0-9]{6}$/.test(code)) return accountError("请输入 6 位短信验证码。", "account-code");
	if (!accountServiceReady()) return;
	if (await accountAction({ operation: "login", phone, code })) {
		byId("account-code").value = ""; byId("account-phone").value = "";
		byId("account-dialog").close(); toast("登录成功");
	}
};
byId("sign-out").onclick = async () => { if (await accountAction({ operation: "logout" })) { byId("account-dialog").close(); toast("已退出登录"); } };

byId("takeover").onclick = () => boardAction(boardStatus?.board?.control === "manual" ? "resume" : "takeover");
function recheck() {
	closePopovers();
	if (boardStatus?.selectionRequired) void showDevices(true);
	else void boardAction("recheck");
}
for (const id of ["recheck", "menu-recheck"]) byId(id).onclick = recheck;
byId("guide-recheck").onclick = () => { byId("guide").close(); recheck(); };
byId("disconnect").onclick = () => { closePopovers(); void boardAction("disconnect"); };
byId("input-details").onclick = () => show("input-help");
byId("input-recheck").onclick = async () => { if (await boardAction("recheck")) byId("input-help").close(); };

/* Run overview. In follow mode the host does not report model timing, so the gaps between
   device operations are shown as derived host time, clearly marked as an estimate. */
function waitWindows(board) {
	const now = Date.now(), windows = [];
	for (const handoff of board.handoffs || []) windows.push([Date.parse(handoff.requestedAt), handoff.resumedAt ? Date.parse(handoff.resumedAt) : now, "等待你在手机上处理"]);
	for (const review of board.reviews || []) {
		const drafted = review.draftVersions?.[0]?.savedAt;
		if (drafted) windows.push([Date.parse(drafted), review.reviewedAt ? Date.parse(review.reviewedAt) : now, review.kind && review.kind !== "comment" ? "等待你审核内容" : "等待你审核评论"]);
	}
	return windows;
}
function timeline(board) {
	const traces = (board.traces || []).slice().sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
	const entries = traces.map((t) => ({ ...t, track: t.kind === "model" ? "model" : "tool", label: t.label || kindLabels[t.kind] || "设备操作" }));
	if (!board.modelConfig) {
		const tools = entries.filter((t) => t.track === "tool"), windows = waitWindows(board);
		for (let i = 1; i < tools.length; i++) {
			const start = Date.parse(tools[i - 1].startedAt) + (tools[i - 1].durationMs || 0), end = Date.parse(tools[i].startedAt), gap = end - start;
			if (gap < 400) continue;
			// Several reviews or handoffs can share one gap; their combined overlap decides.
			const overlaps = windows.map(([from, to, label]) => [Math.max(0, Math.min(end, to) - Math.max(start, from)), label]).sort((a, b) => b[0] - a[0]);
			const wait = overlaps.reduce((sum, [covered]) => sum + covered, 0) > gap / 2 ? [0, 0, overlaps[0][1]] : undefined;
			entries.push({ id: "gap-" + tools[i].id, track: "model", derived: true, wait: Boolean(wait), label: wait ? wait[2] : "模型思考（推算）", kind: "host", startedAt: new Date(start).toISOString(), durationMs: gap, status: "executed" });
		}
	}
	return entries.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}
function thinkingTime(thinking) { return thinking.reduce((sum, t) => sum + (t.durationMs || 0), 0); }
function traceDetail(entry, start, thinking = []) {
	const dl = el("dl", "run-detail");
	const rows = [
		["结果", entry.derived ? (entry.wait ? "等待中，不计入模型或设备耗时" : "两次设备操作之间的宿主时间") : stateLabels[entry.status] || entry.status],
		["开始", new Date(entry.startedAt).toLocaleTimeString() + " · +" + seconds(Date.parse(entry.startedAt) - start)],
		[thinking.length ? "设备耗时" : "耗时", entry.durationMs === undefined ? "进行中" : entry.durationMs + " ms"],
		["时间来源", entry.derived ? "推算：WorkBuddy 未提供模型耗时，按设备操作间隔计算（含模型推理与网络）" : entry.kind === "model" ? "模型请求往返（含网络）" : "本地设备操作计时"],
	];
	if (entry.step && !entry.derived) rows.splice(1, 0, ["所属步骤", entry.step]);
	if (thinking.length) rows.splice(1, 0, ["模型思考", thinkingTime(thinking) + " ms · " + (thinking.some((t) => t.derived) ? "推算：上一次设备操作结束到这次开始的间隔，含模型推理与网络" : "实测：模型请求往返，含网络") + (thinking.length > 1 ? "（" + thinking.length + " 次请求）" : "")]);
	if (entry.code) rows.push(["原因", errorLabels[entry.code] || "执行未成功"]);
	for (const [label, value] of rows) dl.append(el("dt", "", label), el("dd", "", value));
	if (entry.observationId && boardStatus?.board?.evidenceFiles?.[entry.observationId]) {
		const link = el("a", "", "查看截图");
		link.href = location.pathname + "evidence?observationId=" + encodeURIComponent(entry.observationId); link.target = "_blank"; link.rel = "noopener";
		const dd = el("dd"); dd.append(link);
		dl.append(el("dt", "", "证据"), dd);
	}
	return dl;
}
function renderTrace(status) {
	const board = status.board || {}, entries = timeline(board);
	const snapshot = JSON.stringify({ entries, files: Object.keys(board.evidenceFiles || {}).length, budget: board.executionBudget?.initialLimits });
	if (snapshot === traceSnapshot) return;
	traceSnapshot = snapshot;
	const tools = entries.filter((t) => t.track === "tool"), log = byId("trace-list");
	// Only entries that appear after the first render animate; reused bars glide to their new scale.
	const seen = traceSeen, ids = new Set(entries.map((t) => t.id)), following = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
	traceSeen = ids;
	for (const [id, bar] of traceBars) if (!ids.has(id)) { bar.remove(); traceBars.delete(id); }
	byId("trace-chart").hidden = !entries.length;
	log.replaceChildren();
	if (!entries.length) {
		byId("trace-stats").textContent = "等待执行";
		log.append(el("p", "run-empty", "开始执行后，这里会按时间列出每一步操作和耗时。"));
		return;
	}
	const start = Date.parse(entries[0].startedAt), end = entries.reduce((last, t) => Math.max(last, Date.parse(t.startedAt) + (t.durationMs || 0)), start), total = Math.max(1, end - start);
	const operations = tools.filter((t) => !["environment", "apk_inspect"].includes(t.kind)).length, limit = board.executionBudget?.initialLimits?.operationLimit;
	const unknown = tools.filter((t) => t.status === "unknown").length;
	byId("trace-stats").textContent = seconds(total) + " · " + operations + (limit ? " / " + limit : "") + " 次操作" + (unknown ? " · " + unknown + " 项待确认" : "");
	byId("trace-axis").replaceChildren(...[0, 1, 2, 3, 4].map((i) => el("span", "", seconds(total * i / 4))));
	// Follow-WorkBuddy runs show no note; only configured models explain their measured timeline.
	byId("model-source").textContent = board.modelConfig ? "模型推理与设备操作使用同一时间轴，模型耗时包含网络往返。" : "";
	byId("model-source").hidden = !board.modelConfig;
	// The log reads one row per device action: the model time that produced it (estimated when
	// following WorkBuddy, measured for configured models) is folded in as a 思考 tag. Waits for the
	// person, failed or running model requests and thinking with no action yet keep their own rows.
	const rows = [], pending = [], rowOf = new Map();
	for (const entry of entries) {
		if (entry.track === "model" && !entry.wait && entry.durationMs !== undefined && (entry.derived || entry.status === "executed")) pending.push(entry);
		else if (entry.track === "tool") rows.push({ entry, thinking: pending.splice(0) });
		else rows.push(...pending.splice(0).map((t) => ({ entry: t, thinking: [] })), { entry, thinking: [] });
	}
	rows.push(...pending.map((t) => ({ entry: t, thinking: [] })));
	let fresh = false;
	for (const entry of entries) {
		const offset = Date.parse(entry.startedAt) - start, left = Math.min(99, offset / total * 100), running = entry.durationMs === undefined, added = Boolean(seen) && !seen.has(entry.id);
		let bar = traceBars.get(entry.id);
		if (!bar) {
			bar = el("button"); traceBars.set(entry.id, bar); byId(entry.track === "model" ? "model-track" : "tool-track").append(bar);
			if (added) { bar.dataset.entering = "1"; bar.addEventListener("animationend", () => { delete bar.dataset.entering; bar.classList.remove("enter"); }, { once: true }); }
		}
		bar.className = "run-bar " + entry.track + (entry.derived ? (entry.wait ? " wait" : " derived") : "") + (["failed", "unknown"].includes(entry.status) ? " " + entry.status : "") + (running ? " running" : "") + (bar.dataset.entering ? " enter" : "");
		bar.style.left = left + "%";
		bar.style.width = Math.max(0.6, Math.min(100 - left, (entry.durationMs || 0) / total * 100)) + "%";
		bar.title = entry.label + " · " + seconds(entry.durationMs || 0);
		bar.setAttribute("aria-label", bar.title);
		bar.onclick = () => { const item = rowOf.get(entry.id); if (!item) return; item.open = true; item.scrollIntoView({ block: "nearest", behavior: "smooth" }); };
	}
	for (const { entry, thinking } of rows) {
		const offset = Date.parse(entry.startedAt) - start, running = entry.durationMs === undefined, added = Boolean(seen) && !seen.has(entry.id);
		fresh ||= added;
		const item = el("details", "run-entry" + (added ? " enter" : "") + (running ? " running" : "")), summary = el("summary");
		for (const part of [entry, ...thinking]) rowOf.set(part.id, item);
		item.open = openTraces.has(entry.id);
		item.ontoggle = () => { if (item.open) openTraces.add(entry.id); else openTraces.delete(entry.id); };
		const name = entry.derived ? entry.label : entry.label + (entry.status === "executed" ? "" : " · " + (entry.code && errorLabels[entry.code] || stateLabels[entry.status]));
		const nameEl = el("span");
		if (thinking.length) {
			const estimated = thinking.some((t) => t.derived), tag = el("span", "run-think", "思考 " + (estimated ? "≈" : "") + seconds(thinkingTime(thinking)));
			tag.title = estimated ? "模型思考（推算）：上一次设备操作结束到这次开始的间隔，含模型推理与网络" : "模型规划下一步：模型请求往返，含网络";
			nameEl.append(tag);
		}
		nameEl.append(name);
		if (entry.step && !entry.derived) nameEl.append(el("em", "run-step", " · " + entry.step));
		summary.append(el("time", "", "+" + seconds(offset)), nameEl, el("i", "run-type " + (entry.wait ? "wait" : entry.track === "model" ? "model" : ["failed", "unknown"].includes(entry.status) ? entry.status : "tool")), el("small", "", entry.durationMs === undefined ? "…" : seconds(entry.durationMs)));
		summary.insertAdjacentHTML("beforeend", icon("chevron"));
		item.append(summary, traceDetail(entry, start, thinking));
		log.append(item);
	}
	// Follow new steps while the person is reading the latest ones.
	if (fresh && following) log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
}

/* Task plan beside the phone; the person can fold it, and the choice is remembered locally. */
let planCollapsed = false, planSeen = null;
try { planCollapsed = localStorage.getItem("opengui-plan-collapsed") === "1"; } catch {}
function applyPlanCollapse() {
	byId("plan").classList.toggle("collapsed", planCollapsed);
	byId("plan-heading").setAttribute("aria-expanded", String(!planCollapsed));
	byId("plan-heading").title = planCollapsed ? "展开任务清单" : "收起任务清单";
}
byId("plan-heading").onclick = () => {
	planCollapsed = !planCollapsed; applyPlanCollapse();
	try { localStorage.setItem("opengui-plan-collapsed", planCollapsed ? "1" : "0"); } catch {}
};
applyPlanCollapse();
function renderPlan(status) {
	const board = status.board || {}, todos = status.todos || [], reviews = board.reviews || [];
	const comments = board.scenario === "comments" || reviews.length > 0;
	byId("stage").classList.toggle("comment-canvas", comments && (status.devices || []).length > 0);
	byId("stage").classList.toggle("task-canvas", !board.contentReview && !comments && !status.startRequired && (status.devices || []).length > 0);
	const ended = status.taskState === "ended" || board.control === "ended";
	const snapshot = JSON.stringify({ todos, objective: board.objective, comments, ended });
	if (snapshot !== planSnapshot) {
		planSnapshot = snapshot;
		const list = byId("todos");
		list.replaceChildren();
		list.hidden = !todos.length;
		byId("plan-heading").hidden = !todos.length;
		const done = todos.filter((t) => t.status === "completed").length;
		const count = byId("plan-count"), counted = todos.length ? done + " / " + todos.length : "";
		if (planSeen && count.textContent && count.textContent !== counted) { count.classList.remove("bump"); void count.offsetWidth; count.classList.add("bump"); }
		count.textContent = counted;
		list.dataset.layout = "column";
		const seen = planSeen, next = new Map();
		let entering = 0;
		todos.forEach((todo, index) => {
			const row = el("li", "task-row"), mark = el("span", "task-mark");
			// After the run ends an unfinished step is shown as unfinished, never as still running.
			const shown = ended && ["in_progress", "pending", "awaiting_user"].includes(todo.status) ? "unfinished" : todo.status;
			row.dataset.status = shown;
			const key = todo.stepId || index + ":" + todo.content, before = seen?.get(key);
			if (before === undefined) { row.classList.add("enter"); row.style.setProperty("--delay", Math.min(entering++ * 45, 450) + "ms"); }
			else if (before !== shown) row.classList.add("changed");
			next.set(key, shown);
			if (todo.status === "completed") mark.innerHTML = icon("check");
			else if (todo.status === "failed") mark.textContent = "!";
			else if (todo.status === "skipped") mark.textContent = "–";
			else mark.textContent = String(index + 1);
			row.append(mark, el("strong", "", todo.content));
			if (todo.reason && ["in_progress", "awaiting_user", "failed", "skipped"].includes(todo.status)) row.append(el("p", "", todo.reason));
			row.append(el("span", "task-status", todoLabels[shown] || todo.status));
			row.setAttribute("aria-label", (index + 1) + ". " + todo.content + "：" + (todoLabels[shown] || todo.status));
			list.append(row);
		});
		planSeen = next;
		// Keep the active step visible inside the scrolling list without moving the page.
		const current = list.querySelector('[data-status="in_progress"], [data-status="awaiting_user"]');
		if (current && (current.offsetTop < list.scrollTop || current.offsetTop + current.offsetHeight > list.scrollTop + list.clientHeight)) list.scrollTop = Math.max(0, current.offsetTop - 8);
	}
	const progress = byId("comment-progress");
	byId("review-panel").hidden = !comments;
	if (comments) {
		const sent = reviews.filter((r) => r.status === "sent").length, target = board.commentBudget?.targetCount;
		progress.replaceChildren(el("span", "", sent + (target ? " / " + target : "") + (board.scenario === "comments" ? " 条已发送并核验" : " 条已发布并核验")), el("span", "", board.contentReview && board.scenario !== "comments" ? "发内容前需要审核" : "逐条审核后发送"));
	}
}

const unsavedDrafts = new Map(), skipOpen = new Set();
// Content review generalizes comment review: posts, replies and messages share the same card and gates.
const contentKinds = { post: "帖子", comment: "评论", reply: "回复", message: "私信" };
function reviewTitle(review, index) { const kind = contentKinds[review.kind] || "评论"; return (index + 1) + ". " + (review.title ? shortTitle(review.title, kind) : shortTitle(review.target, kind + " " + (index + 1))); }
function renderReviews(board) {
	const snapshot = JSON.stringify({ reviews: board.reviews || [], control: board.control, skip: [...skipOpen] });
	if (snapshot === reviewSnapshot) return;
	reviewSnapshot = snapshot;
	const host = byId("reviews");
	host.replaceChildren();
	const reviews = board.reviews || [];
	if (!reviews.length) return;
	const list = el("div", "review-list");
	reviews.forEach((review, index) => {
		const open = review.status === "pending" || review.status === "approved" && review.platformInput?.status === "differs";
		if (!open) {
			const row = el("div", "review-row"), mark = el("span", "task-mark");
			if (review.status === "sent") mark.innerHTML = icon("check"); else mark.textContent = review.status === "skipped" ? "–" : String(index + 1);
			row.dataset.status = review.status;
			row.append(mark, el("strong", "", reviewTitle(review, index)), el("small", "", (review.status === "sent" && review.kind === "post" ? "已发布并核验" : reviewLabels[review.status]) + (review.skipReason ? " · " + review.skipReason : "")));
			list.append(row);
			return;
		}
		list.append(reviewCard(board, review, index));
	});
	host.append(list);
}
function reviewCard(board, review, index) {
	const card = el("article", "review"), head = el("div", "review-head");
	const status = el("span", "", reviewLabels[review.status]);
	if (review.kind && review.kind !== "comment") status.prepend(el("em", "review-kind", contentKinds[review.kind]));
	head.append(el("strong", "", reviewTitle(review, index)), status);
	const where = review.kind === "post" ? "发布位置：" + review.target + "\n当前账号：" + review.account + "\n背景：" + review.context
		: review.kind === "message" ? "对话背景：" + review.context + "\n当前账号：" + review.account + " · 发给：" + review.target
		: "原帖摘要：" + review.context + "\n当前账号：" + review.account + " · 目标：" + review.target;
	const quote = el("div", "quote", where);
	card.append(head, quote);
	if (review.title) card.append(el("p", "review-title", "标题：" + review.title));
	const editable = review.status === "pending" && boardToken && board.control !== "ended";
	const editing = unsavedDrafts.has(review.id);
	const draft = el("p", "draft", review.draft), editor = el("textarea");
	editor.value = unsavedDrafts.get(review.id)?.draft ?? review.draft;
	editor.maxLength = 2000; editor.setAttribute("aria-label", "修改评论草稿");
	editor.oninput = () => unsavedDrafts.set(review.id, { draft: editor.value, expectedVersion: unsavedDrafts.get(review.id)?.expectedVersion ?? (review.contentVersion || 1) });
	draft.hidden = editing && editable; editor.hidden = !(editing && editable);
	card.append(draft, editor);
	if (review.platformInput) card.append(originalDraft(board, review));
	if (editable) {
		const actions = el("div", "review-actions"), reason = el("input");
		reason.placeholder = "跳过原因（可选，仅跳过此条，任务继续）"; reason.maxLength = 2000; reason.setAttribute("aria-label", "跳过原因");
		reason.hidden = !skipOpen.has(review.id);
		const submit = async (action, extra) => {
			actions.querySelectorAll("button").forEach((b) => (b.disabled = true));
			const saved = await boardAction(action === "save" ? "review_save" : "review", {
				reviewId: review.id, ...(action === "save" ? {} : { decision: action }),
				expectedVersion: unsavedDrafts.get(review.id)?.expectedVersion ?? (review.contentVersion || 1),
				draft: editor.value, ...extra,
			});
			if (saved) { unsavedDrafts.delete(review.id); skipOpen.delete(review.id); reviewSnapshot = ""; renderReviews(boardStatus.board || {}); }
			actions.querySelectorAll("button").forEach((b) => (b.disabled = false));
		};
		const button = (label, className, onclick) => { const b = el("button", className, label); b.onclick = onclick; actions.append(b); };
		if (skipOpen.has(review.id)) {
			button("确认跳过", "primary", () => submit("skip", { reason: reason.value }));
			button("取消", "", () => { skipOpen.delete(review.id); reviewSnapshot = ""; renderReviews(boardStatus.board || {}); });
		} else if (editing) {
			button("保存草稿", "primary", () => submit("save"));
			button("批准并发送", "", () => submit("approve"));
			button("取消修改", "quiet", () => { unsavedDrafts.delete(review.id); reviewSnapshot = ""; renderReviews(boardStatus.board || {}); });
		} else {
			button("批准并发送", "primary", () => submit("approve"));
			button("修改草稿", "", () => { unsavedDrafts.set(review.id, { draft: review.draft, expectedVersion: review.contentVersion || 1 }); reviewSnapshot = ""; renderReviews(boardStatus.board || {}); byId("reviews").querySelector("textarea:not([hidden])")?.focus(); });
			button("跳过此条", "quiet", () => { skipOpen.add(review.id); reviewSnapshot = ""; renderReviews(boardStatus.board || {}); byId("reviews").querySelector("input")?.focus(); });
		}
		card.append(reason, actions);
	}
	card.append(reviewHistory(board, review));
	return card;
}
function originalDraft(board, review) {
	const input = review.platformInput, box = el("div", "original");
	const labels = { empty: "评论框为空", matches: "评论框内容与最终稿一致", differs: "评论框里已有其他文字", unreadable: "未能读取评论框内容" };
	box.append(el("strong", "", labels[input.status]));
	const text = el("p", "", input.text === undefined ? "未能读取，不会填入或发送。" : input.text === "" ? "（空）" : input.text);
	text.style.whiteSpace = "pre-wrap";
	box.append(text, el("small", "", (input.source === "device_clipboard" ? "从手机读取" : "根据画面识别") + " · " + new Date(input.readAt).toLocaleTimeString()));
	const choice = review.replacementDecisions?.at(-1), granted = choice?.decision === "replace" && !choice.usedAt && choice.originalText === input.text && choice.contentVersion === (review.contentVersion || 1);
	if (input.status === "differs" && !(review.inputAttempts || []).some((a) => a.platformVersion === input.version && a.beforeObservationId === input.evidenceObservationId) && ["pending", "approved"].includes(review.status) && boardToken && board.control !== "ended" && !granted) {
		const buttons = el("div", "review-actions");
		for (const [name, decision] of [["保留原文字，不发送", "keep"], ["替换为最终稿", "replace"]]) {
			const button = el("button", decision === "replace" ? "primary" : "", name);
			button.onclick = async () => { buttons.querySelectorAll("button").forEach((b) => (b.disabled = true)); await boardAction("comment_original", { reviewId: review.id, decision, platformVersion: input.version, contentVersion: review.contentVersion || 1 }); buttons.querySelectorAll("button").forEach((b) => (b.disabled = false)); };
			buttons.append(button);
		}
		box.append(buttons);
	} else if (granted) box.append(el("p", "", "已允许替换；发送前仍会再次核对评论框内容。"));
	return box;
}
function reviewHistory(board, review) {
	const history = el("details"), sourceLabels = { generated: "AI 草稿", human: "人工修改", platform: "评论框原文" };
	history.append(el("summary", "", "草稿版本与审核记录"));
	for (const item of review.draftVersions || []) {
		history.append(el("p", "", "版本 " + item.version + " · " + (sourceLabels[item.source] || item.source) + " · " + new Date(item.savedAt).toLocaleString() + "\n" + item.draft));
		if (review.status === "pending" && boardToken && board.control !== "ended" && item.draft.trim()) {
			const choose = el("button", "", "使用版本 " + item.version);
			choose.onclick = () => { unsavedDrafts.set(review.id, { draft: item.draft, expectedVersion: review.contentVersion || 1 }); reviewSnapshot = ""; renderReviews(boardStatus.board || {}); };
			history.append(choose);
		}
	}
	for (const item of review.decisions || []) history.append(el("p", "", (item.decision === "approve" ? "已批准" : "已跳过") + " · 版本 " + item.contentVersion + " · " + new Date(item.decidedAt).toLocaleString() + (item.reason ? " · " + item.reason : "")));
	for (const item of review.replacementDecisions || []) history.append(el("p", "", (item.decision === "keep" ? "保留原文字" : "允许替换一次") + " · 版本 " + item.contentVersion + " · " + new Date(item.decidedAt).toLocaleString() + (item.usedAt ? " · 已使用" : "")));
	const attemptLabels = { executed: "已填入", unknown: "结果待确认", pending: "填入中" };
	for (const item of review.inputAttempts || []) history.append(el("p", "", "填入 · " + (attemptLabels[item.outcome] || item.outcome) + " · " + new Date(item.startedAt).toLocaleString()));
	return history;
}

function renderTests(board) {
	const cases = board.testCases || [];
	const count = (status) => cases.filter((test) => test.result?.status === status).length;
	const parts = [["通过", count("passed")], ["失败", count("failed")], ["待确认", count("unverified")], ["未检查", count("not_checked")], ["待执行", cases.filter((test) => !test.result).length]].filter(([, n]) => n > 0);
	byId("scenario-counts").textContent = parts.map(([label, n]) => label + " " + n).join(" · ");
	byId("checks-section").hidden = !cases.length;
	const snapshot = JSON.stringify({ cases, active: board.activeTestCaseId, stop: board.stopBeforeSubmit });
	if (snapshot === testSnapshot) return;
	testSnapshot = snapshot;
	const host = byId("test-cases");
	host.replaceChildren();
	if (board.stopBeforeSubmit) host.append(el("p", "muted", "本任务约定停在提交前：最终提交、发送、支付等操作不会执行。"));
	const sourceLabels = { user: "用户要求", prd: "需求文档", case: "已有用例", unknown: "未注明" };
	for (const test of cases) {
		const d = test.definition, r = test.result, card = el("article", "case"), head = el("div", "case-head");
		const label = r ? caseLabels[r.status] : board.activeTestCaseId === test.id ? "检查中" : "待执行";
		head.append(el("strong", "", d.title), el("span", "badge " + (r?.status || ""), label));
		card.append(head, el("p", "", "预期：" + d.expected), el("p", "", "实际：" + (r?.actual || "尚未记录") + (r?.reason ? "（" + r.reason + "）" : "")));
		const details = el("details"), body = el("p");
		details.append(el("summary", "", "步骤、输入与环境"));
		body.textContent = [
			"预期来源：" + (sourceLabels[d.expectedSource.kind] || d.expectedSource.kind) + (d.expectedSource.reference ? " · " + d.expectedSource.reference : ""),
			"应用 / 版本：" + d.context.app + " / " + d.context.version,
			"环境 / 账号 / 起点：" + d.context.environment + " / " + d.context.account + " / " + d.context.startPage,
			"前置条件：" + (d.prerequisites.join("；") || "无"),
			"测试数据：" + (d.testData.source === "generated" ? "系统生成 · " : d.testData.source === "user" ? "用户提供 · " : "") + d.testData.description,
			"停止条件：" + d.stoppingCondition,
			"计划步骤：\n" + d.steps.map((s, i) => (i + 1) + ". " + s).join("\n"),
			r?.checkedStepIndexes ? "已核对步骤：" + (r.checkedStepIndexes.map((i) => i + 1).join("、") || "无") : "",
			"实际执行：\n" + (r?.executedSteps.length ? r.executedSteps.map((s, i) => (i + 1) + ". " + s).join("\n") : "未记录"),
			r?.reproduction ? "复现结论：" + ({ reproduced: "已复现", not_reproduced: "本次未复现", unknown: "无法确认" }[r.reproduction] || r.reproduction) : "",
			r?.status === "failed" ? "缺陷 DEF-" + test.id.slice(0, 8) + " · 发生页面：" + (r.page || "未知页面") : "",
			test.origin ? "复测：关联上次结果「" + (caseLabels[test.origin.result?.status] || "未检查") + "」；条件变化：" + (Object.keys(d.context).filter((k) => d.context[k] !== test.origin.context[k]).join("、") || "无") : "",
		].filter(Boolean).join("\n");
		details.append(body);
		card.append(details);
		(r?.evidenceObservationIds || []).forEach((id, i) => {
			const link = el("a", "", "截图 " + (i + 1));
			link.href = location.pathname + "evidence?observationId=" + encodeURIComponent(id); link.target = "_blank"; link.rel = "noopener";
			card.append(link);
		});
		host.append(card);
	}
}

function renderExecutionBudget(status) {
	const board = status.board || {}, budget = board.executionBudget, host = byId("execution-budget");
	const operationLimit = budget?.operationLimit || ${BASE_EXECUTION_BUDGET}, inferenceLimit = budget?.inferenceLimit || ${BASE_EXECUTION_BUDGET};
	const deviceId = status.devices?.[0]?.id, operations = budget?.operations?.[deviceId] ?? (board.traces || []).filter((t) => t.deviceId === deviceId && !["model", "environment", "apk_inspect"].includes(t.kind)).length;
	const inference = (board.traces || []).filter((t) => t.kind === "model").length;
	const exhausted = operations >= operationLimit || inference >= inferenceLimit;
	const eligible = Boolean(board.control === "ended" && board.result?.outcome === "blocked" && exhausted && status.archivePath && status.devices?.length === 1 && !board.commentBudget?.stopReason && (!board.commentBudget?.deadlineAt || Date.parse(board.commentBudget.deadlineAt) > Date.now()));
	const latest = budget?.extensions?.at(-1), pending = Boolean(latest && board.control === "ended" && !exhausted);
	host.hidden = !eligible && !pending;
	const key = JSON.stringify({ eligible, pending, operations, inference, operationLimit, inferenceLimit, latest: latest?.id, viewerId: status.viewerId });
	if (host.dataset.state === key) return;
	host.dataset.state = key; host.replaceChildren();
	if (!eligible && !pending) return;
	const copy = el("div");
	copy.append(el("strong", "", eligible ? "执行次数已用完" : "已追加执行次数"), el("p", "", eligible ? "已用 " + operations + " / " + operationLimit + " 次。目标、清单和已有结果都已保留，可以追加有限次数继续同一任务。" : "请回到 WorkBuddy 对话继续；恢复后会先核对当前画面。"));
	const actions = el("div", "alert-actions");
	if (eligible) {
		const input = el("input"), button = el("button", "primary", "追加");
		input.type = "number"; input.min = "1"; input.max = "100"; input.step = "1"; input.id = "budget-additional"; input.placeholder = "1–100"; input.setAttribute("aria-label", "追加的执行次数（1–100）"); input.style.width = "76px";
		button.id = "extend-budget";
		button.onclick = async () => { const additional = Number(input.value); if (!Number.isInteger(additional) || additional < 1 || additional > 100) { toast("请输入 1–100 的整数"); return; } button.disabled = true; await boardAction("budget_extend", { additional, operationLimit, inferenceLimit }); button.disabled = false; };
		actions.append(input, button);
	} else {
		const button = el("button", "", "复制继续指令");
		button.id = "copy-budget-continuation";
		button.onclick = async () => { try { await navigator.clipboard.writeText("@opengui 继续原任务 " + status.viewerId + "，使用工作台已追加的执行次数。沿用原目标、原设备和已有结果，先重新读取画面，不重复发送结果未知或已提交的评论。"); toast("已复制，请粘贴到当前对话"); } catch { toast("复制失败，请在对话中说明继续任务 " + status.viewerId); } };
		actions.append(button);
	}
	host.append(copy, actions);
}

function renderEnvironment(board) {
	const host = byId("environment"), apkAlert = byId("apk-alert");
	host.replaceChildren(); apkAlert.replaceChildren();
	apkAlert.hidden = !board.apk;
	if (board.apk) {
		const apk = board.apk, labels = { prepared: "已准备，待安装", installing: "安装中", installed: "已安装", failed: "安装失败", unknown: "安装结果未知，不会重复安装" };
		const copy = el("div");
		copy.append(el("strong", "", "安装包 · " + labels[apk.status]), el("p", "", apk.fileName + " · " + apk.packageName + " · 版本 " + (apk.versionName || "未知")));
		apkAlert.append(copy);
		if (apk.existingApp) {
			copy.append(el("p", "", "手机上已有这个应用（版本 " + (apk.existingApp.version || "未知") + "）。安装会覆盖应用并保留数据。"));
			if (apk.updateApprovedAt) copy.append(el("p", "", "你已确认更新。"));
			else if (apk.status === "prepared" && board.control !== "ended") {
				const actions = el("div", "alert-actions"), confirm = el("button", "primary", "确认更新"), cancel = el("button", "", "停止任务");
				confirm.onclick = () => boardAction("apk_update_confirm", { artifactId: apk.id, sha256: apk.sha256, existingVersion: apk.existingApp.version || "unknown" });
				cancel.title = "停止本次任务，不安装";
				cancel.onclick = () => boardAction("disconnect");
				actions.append(confirm, cancel); apkAlert.append(actions);
			}
		}
	}
	const state = board.environment;
	if (!state) return;
	const ok = state.checks.filter((item) => item.required).every((item) => item.status === "passed");
	host.append(el("p", "", "应用 " + state.spec.packageName + " · " + (state.stale ? "需要重新检查" : ok ? "必需项已通过" : "有未通过或待确认的必需项")));
	const checks = el("div", "checks"), labels = { passed: "通过", failed: "未通过", unknown: "待确认" };
	for (const check of state.checks) {
		const row = el("div", "check-row " + check.status);
		row.title = check.detail;
		row.append(el("span", "", check.label + (check.required ? "" : "（参考）")), el("span", "", labels[check.status] + (check.observedValue ? " · " + check.observedValue : "")));
		checks.append(row);
	}
	host.append(checks);
}

function renderInputDiagnostic(status) {
	const diagnostic = status.board?.inputDiagnostic;
	const pending = diagnostic && diagnostic.status !== "resolved";
	byId("input-notice").hidden = !pending;
	if (!diagnostic) return;
	const detail = diagnostic.status === "blocked" ? "已暂停操作。处理手机的安全设置后，点击「我已处理，重新检测」。"
		: diagnostic.status === "recheck_pending" ? "已重新检测，下一步会先读取画面；点击权限是否恢复，以后续操作结果为准。"
		: "后续操作已返回结果。";
	byId("input-guidance").textContent = diagnostic.guidance;
	byId("input-help-guidance").textContent = diagnostic.guidance;
	byId("input-state").textContent = detail;
	byId("input-help-state").textContent = status.taskState === "ended" ? "本次任务已结束，记录已保留。" : detail;
	byId("input-recheck").disabled = !boardToken || status.taskState === "ended";
	if (pending && diagnostic.status === "blocked" && status.taskState !== "ended" && inputPromptedAt !== diagnostic.detectedAt && !document.querySelector("dialog[open]:not(.popover)")) {
		inputPromptedAt = diagnostic.detectedAt; show("input-help");
	}
}

function renderReport(status) {
	const board = status.board || {}, outcome = board.result?.outcome;
	byId("report-section").hidden = !outcome;
	byId("report-new-task").disabled = !boardToken || status.taskState !== "ended";
	if (!outcome) { finishedReport = false; return; }
	for (const [id, format] of [["export-md", "md"], ["export-word", "docx"], ["export-pdf", "pdf"], ["export-evidence", "zip"]]) byId(id).setAttribute("download", (status.reportFileName || "opengui-report") + "." + format);
	const cases = board.testCases || [], reviews = board.reviews || [];
	const snapshot = JSON.stringify({ outcome, summary: board.result?.summary, cases, reviews, exports: status.reportExports, archive: status.archivePath, evidence: board.evidenceCount, traces: (board.traces || []).length });
	if (snapshot !== reportSnapshot) {
		reportSnapshot = snapshot;
		const count = (s) => cases.filter((c) => c.result?.status === s).length;
		byId("report-title").textContent = shortTitle(board.objective, "任务报告");
		byId("report-state").textContent = cases.length
			? [["项通过", count("passed")], ["项失败", count("failed")], ["项待确认", count("unverified")], ["项未检查", count("not_checked")]].filter(([, n]) => n).map(([l, n]) => n + " " + l).join(" · ") || outcomeLabels[outcome]
			: reviews.length ? reviews.filter((r) => r.status === "sent").length + " 条发送成功 · " + reviews.filter((r) => r.status === "skipped").length + " 条跳过" + (reviews.some((r) => ["submitted", "unknown"].includes(r.status)) ? " · " + reviews.filter((r) => ["submitted", "unknown"].includes(r.status)).length + " 条待核验" : "")
			: outcomeLabels[outcome];
		byId("report-summary").textContent = [outcomeLabels[outcome] + "。" + (board.result?.summary || ""), board.stopBeforeSubmit ? "按约定停在提交前，最终提交未执行。" : ""].filter(Boolean).join("\n");
		byId("report-callout").classList.toggle("blocked", ["blocked", "unknown"].includes(outcome));
		const traces = board.traces || [], start = traces.length ? Date.parse(traces[0].startedAt) : 0;
		const end = traces.reduce((last, t) => Math.max(last, Date.parse(t.startedAt) + (t.durationMs || 0)), start);
		const device = (status.devices || [])[0];
		const meta = byId("report-meta"); meta.replaceChildren();
		for (const [label, value] of [["设备", device ? device.name + " · …" + (device.serialSuffix || "") : "未绑定"], ["模型", board.model || "跟随 WorkBuddy"], ["用时", traces.length ? seconds(end - start) : "—"], ["截图证据", (board.evidenceCount || 0) + " 张"]]) {
			const item = el("div", "", label); item.append(el("b", "", value)); meta.append(item);
		}
		const results = byId("report-tests"); results.replaceChildren();
		for (const test of cases) { const row = el("div", "", test.definition.title); row.append(el("span", test.result?.status || "", test.result ? caseLabels[test.result.status] : "未执行")); results.append(row); }
		reviews.forEach((review, index) => { const row = el("div", "", reviewTitle(review, index)); row.append(el("span", review.status === "sent" ? "passed" : "", reviewLabels[review.status])); results.append(row); });
		byId("report-note").textContent = [status.archivePath ? "本地归档：" + status.archivePath : "", status.reportExports?.error ? "导出失败：" + status.reportExports.error : ""].filter(Boolean).join("\n");
	}
	if (!finishedReport) { finishedReport = true; setTimeout(() => byId("report-section").scrollIntoView({ block: "start", behavior: "smooth" }), 150); }
}

function connectionState(status, board, devices, connected) {
	const hints = devices.map((device) => {
		const advisory = deviceInventory.find((item) => item.id === device.id)?.connectionHint;
		return advisory?.warning ? advisory : connectionHint(device, board.environment);
	});
	let hint = hints.find((item) => item.warning) || hints[0] || { label: "未连接设备", detail: "连接 Android 手机或启动本地模拟器，然后点击「选择设备」。", warning: true };
	if (status.startRequired) return { label: "等待开始执行", detail: "确认任务、模型和执行设备后点击「开始执行」，之后才会连接设备。", warning: false };
	const mode = board.control || "idle";
	// The first frame is still on its way: connecting is normal, not a fault to diagnose.
	if (devices.length && ["preparing", "waiting_for_frame"].includes(status.state) && !status.errorCode && !board.connectionRecovery) hint = { label: "正在连接设备画面…", detail: "首帧画面出现后才会开始操作手机。超过 30 秒没有画面时，本次任务会停止且不会操作手机。", warning: false };
	// A takeover or pause invalidates the environment on purpose; it is rechecked on handback.
	if (board.environment?.stale && (mode === "manual" || mode === "paused") && !hints.some((item) => item.warning && item.label !== "已连接 · 环境待确认")) hint = { label: mode === "manual" ? "你正在控制设备" : "任务已暂停", detail: "恢复控制后，会自动重新检查设备与应用环境。", warning: false };
	if (status.errorCode === "display_timeout") hint = { label: "设备画面连接超时", detail: "30 秒内没有收到可显示的画面，本次任务已停止，没有操作手机。任务要求已保留，请检查连接后在对话中重新发起。", warning: true };
	const recovery = board.connectionRecovery;
	if (recovery && recovery.status !== "resolved") {
		hint = recovery.status === "waiting_recheck"
			? { label: "连接中断 · 已暂停", detail: "重新连接同一台设备后点击「重新检测」。进度、草稿和截图都已保留，不会切换设备或重复上一步。", warning: true, alert: true }
			: { label: "已重新检测 · 等待核对画面", detail: "下一步先读取最新画面，确认上一步的实际结果后再继续。", warning: true };
		if (connectionPromptedAt !== recovery.detectedAt) connectionPromptedAt = recovery.detectedAt;
	}
	if (board.inputDiagnostic && board.inputDiagnostic.status !== "resolved") hint = { label: board.inputDiagnostic.status === "blocked" ? "手机拒绝模拟点击" : "触控权限待核对", detail: board.inputDiagnostic.guidance, warning: true };
	return hint;
}

/* Start confirmation. Sign-in, the cached model (WorkBuddy on first use) and the device are
   confirmed here; only 开始执行 binds the device and lets the waiting host open control. */
let startDevices = [], startDevicesLoaded = false, startDevicesLoading = false, startDeviceId = null, startLoginPrompted = false, startBusy = false, startMessage = "", startRequestDirty = false, startRequestSource = "";
const taskText = (text) => String(text || "").replace(/^\s*@(?:skill:)?opengui\b\s*/iu, "").trim();
byId("start-request").oninput = () => { startRequestDirty = true; if (boardStatus) renderStart(boardStatus, true); };
async function loadStartDevices() {
	startDevicesLoaded = true; startDevicesLoading = true;
	try {
		const response = await fetch(location.pathname + "devices?refresh=1"), result = await response.json();
		if (!response.ok) throw Error(result.error || "设备检测没有完成");
		startDevices = (result.devices || []).filter((d) => d.os !== "ios");
		const suggested = boardStatus?.suggestedDeviceId || result.preferredDeviceId;
		if (!startDevices.some((d) => d.id === startDeviceId && d.selectable)) startDeviceId = startDevices.find((d) => d.id === suggested && d.selectable)?.id || (startDevices.filter((d) => d.selectable).length === 1 ? startDevices.find((d) => d.selectable).id : null);
	} catch (error) { startDevices = []; startMessage = error.message; }
	startDevicesLoading = false;
	if (boardStatus) renderStart(boardStatus, true);
}
function startOption(name, value, checked, disabled, title, detail, side, sideClass, onPick) {
	const row = el("label", "start-option" + (disabled ? " disabled" : "")), input = el("input"), copy = el("span");
	input.type = "radio"; input.name = name; input.value = value; input.checked = checked; input.disabled = disabled;
	input.onchange = () => { onPick(value); renderStart(boardStatus, true); };
	copy.append(el("b", "", title)); if (detail) copy.append(el("small", "", detail));
	row.append(input, copy, el("span", "side" + (sideClass ? " " + sideClass : ""), side || ""));
	return row;
}
function renderStart(status, force = false) {
	const panel = byId("start-panel"), visible = Boolean(status.startRequired) && status.taskState !== "ended";
	panel.hidden = !visible; byId("workbench").hidden = visible;
	syncPreview();
	if (!visible) return;
	byId("plan").hidden = true;
	const board = status.board || {}, user = status.account?.user;
	if (!user && boardToken && !startLoginPrompted && !document.querySelector("dialog[open]")) { startLoginPrompted = true; show("account-dialog"); }
	if (!startDevicesLoaded) void loadStartDevices();
	const snapshot = JSON.stringify({ request: board.request, objective: board.objective, criteria: board.successCriteria, user, startDevices, startDevicesLoading, startDeviceId, startBusy, startMessage, modelError: status.modelSelectionError });
	if (!force && panel.dataset.snapshot === snapshot) return;
	panel.dataset.snapshot = snapshot;
	startRequestSource = board.objective ? taskText(board.request || board.objective) : "";
	if (!startRequestDirty) byId("start-request").value = startRequestSource;
	byId("start-request").disabled = startBusy || !boardToken;
	byId("start-title").textContent = status.workbenchManaged ? "新建任务" : "确认任务";
	// Android (phones and emulators) is selectable; iOS and cloud phones are listed as coming soon.
	const devices = byId("start-devices"); devices.replaceChildren();
	const group = (title, note) => { const box = el("div", "start-group"), heading = el("div", "start-group-title", title); if (note) heading.append(el("small", "", note)); box.append(heading); devices.append(box); return box; };
	const placeholder = (box, text, soon) => { const row = el("div", "start-placeholder"); row.append(el("span", "", text)); if (soon) row.append(el("span", "soon", soon)); box.append(row); };
	const android = group("Android 设备", "真机 · 模拟器");
	if (!startDevicesLoaded || startDevicesLoading) placeholder(android, "正在读取设备…");
	else if (!startDevices.length) placeholder(android, "未检测到已连接设备");
	placeholder(group("iOS 设备", "真机 · 模拟器"), "暂不可选", "即将支持");
	placeholder(group("云真机"), "在云端设备上执行任务", "即将支持");
	for (const device of startDevices) {
		const hint = device.connectionHint || connectionHint(device);
		android.append(startOption("start-device", device.id, startDeviceId === device.id, !device.selectable, device.name, deviceDetails(device), device.selectable ? (device.preferred ? "上次使用" : "可连接") : hint.label, device.selectable ? "" : "warning", (v) => { startDeviceId = v; }));
	}
	if (startDevicesLoaded && !startDevicesLoading) { android.append(startEmulatorBox); renderEmulator(); if (!emulatorState) void refreshEmulator(); }
	const blocker = !boardToken ? "请从当前任务打开工作台" : !user ? "请先登录" : startDevicesLoaded && !startDevicesLoading && !startDevices.length ? "请连接 Android 手机并允许 USB 调试，或在下方启动模拟器，再点击「重新检测」" : !taskText(byId("start-request").value) ? "请填写要执行的任务" : status.workbenchManaged && !board.modelConfig ? "请在上方选择执行模型" : !startDeviceId ? "请选择执行设备" : startMessage || "准备就绪。开始后在右侧查看进度；需审核或接管时会显示提示。";
	byId("start-blocker").textContent = blocker;
	byId("start-run").disabled = startBusy || !boardToken || !user || !startDeviceId || !taskText(byId("start-request").value) || Boolean(status.workbenchManaged && !board.modelConfig);
	byId("start-run").textContent = startBusy ? "正在连接设备…" : "开始执行";
}
byId("start-refresh").onclick = () => { startDevicesLoaded = false; if (boardStatus) renderStart(boardStatus, true); };
byId("start-device-help").onclick = () => show("guide");
/* Live view of the chosen device while the person is choosing: the device's video stream, or a
   screenshot every few seconds where video is unavailable. It is display-only and never reaches a model. */
let previewDeviceId = null, previewShown = null, previewRun = 0, previewTimer = 0, previewAspect = "";
function setPreview(state, note, caption) {
	byId("start-preview").dataset.state = state;
	byId("start-preview-note").textContent = note; byId("start-preview-note").hidden = !note;
	byId("start-preview-caption").textContent = caption;
}
function syncPreview() {
	const wanted = !byId("start-panel").hidden && !startBusy && document.visibilityState === "visible" ? startDeviceId : null;
	if (wanted === previewDeviceId) return;
	previewDeviceId = wanted; previewRun++; clearTimeout(previewTimer); globalThis.openguiPreview?.close();
	// Pausing (while starting or with the page hidden) keeps the last frame; another device clears it.
	if (startDeviceId !== previewShown) { previewShown = null; previewAspect = ""; byId("start-preview-canvas").hidden = true; byId("start-preview-frame").style.aspectRatio = ""; }
	if (!wanted) { setPreview("idle", previewShown || startDeviceId ? "" : "选择设备后显示画面", "实时画面"); return; }
	if (!previewShown) setPreview("loading", "正在连接画面…", "实时画面");
	const run = previewRun, canvas = byId("start-preview-canvas");
	const video = globalThis.openguiPreview?.open(wanted, canvas, () => { if (run === previewRun) showPreviewFrame(wanted, "实时画面"); }, () => { if (run === previewRun) void pullPreview(run, wanted, 0); });
	if (!video) void pullPreview(run, wanted, 0);
}
function showPreviewFrame(deviceId, caption) {
	const canvas = byId("start-preview-canvas"), aspect = canvas.width + " / " + canvas.height;
	if (previewShown === deviceId && previewAspect === aspect && byId("start-preview-caption").textContent === caption) return;
	previewShown = deviceId; previewAspect = aspect;
	byId("start-preview-frame").style.aspectRatio = aspect; canvas.hidden = false; setPreview("live", "", caption);
}
async function pullPreview(run, deviceId, failures) {
	const canvas = byId("start-preview-canvas");
	try {
		const response = await fetch(location.pathname + "device-preview?deviceId=" + encodeURIComponent(deviceId), { signal: AbortSignal.timeout(10000) });
		if (response.status === 409) return; // The task has started; the live view is over.
		if (!response.ok) throw Error("preview_unavailable");
		const frame = await createImageBitmap(await response.blob());
		if (run !== previewRun) { frame.close(); return; }
		if (canvas.width !== frame.width || canvas.height !== frame.height) { canvas.width = frame.width; canvas.height = frame.height; }
		canvas.getContext("2d").drawImage(frame, 0, 0); frame.close();
		failures = 0; showPreviewFrame(deviceId, "定时截图");
	} catch {
		if (run !== previewRun) return;
		failures++;
		setPreview("error", canvas.hidden ? "画面暂不可用" : "", canvas.hidden ? "正在重试…" : "画面暂停更新");
	}
	if (run === previewRun) previewTimer = setTimeout(() => void pullPreview(run, deviceId, failures), failures ? Math.min(8000, 1500 * failures) : 800);
}
document.addEventListener("visibilitychange", syncPreview);
byId("start-run").onclick = async () => {
	if (startBusy || byId("start-run").disabled) return;
	startBusy = true; renderStart(boardStatus, true);
	try { if (await boardAction("start", { modelId: boardStatus?.modelSelectionError ? "host" : boardStatus?.board?.modelConfig?.id || "host", deviceId: startDeviceId, request: taskText(byId("start-request").value), contentReview: byId("start-content-review").checked })) toast("已开始执行，正在连接设备画面"); }
	finally { startBusy = false; if (boardStatus) { renderBoard(boardStatus); renderStart(boardStatus, true); } }
};

function renderBoard(status) {
	boardStatus = status;
	const board = status.board || {}, devices = status.devices || [], mode = board.control || "idle";
	const ended = status.taskState === "ended" || mode === "ended";
	const active = ["agent", "paused", "manual", "reconciling"].includes(mode) && !ended;
	const connected = devices.length > 0 && devices.every((d) => d.state === "ready");
	byId("device-preference-notice").hidden = !status.devicePreferenceError;
	byId("device-preference-notice").textContent = status.devicePreferenceError || "";
	renderInputDiagnostic(status);

	byId("task").textContent = status.errorCode === "display_timeout" ? "画面连接超时 · 任务已停止"
		: ended ? (outcomeLabels[board.result?.outcome] || "任务已结束")
		: mode === "manual" ? "你正在手动控制设备"
		: mode === "paused" ? "任务已暂停 · 已有进度已保留"
		: mode === "reconciling" ? "正在核对当前画面，确认后继续"
		: !board.objective && mode === "idle" ? "等待任务 · 在 WorkBuddy 对话中描述目标"
		: status.selectionRequired && board.objective ? "任务已保留 · 连接并选择设备后继续"
		: status.progress?.message || (devices.length ? "正在准备" : "等待连接设备");

	const account = status.account || {}, user = account.user;
	byId("account-button").textContent = user?.phone || "登录";
	byId("account-title").textContent = user ? "账号设置" : "OpenGUI登录/注册";
	byId("account-state").textContent = user ? "管理当前登录的账号。" : "欢迎体验OpenGUI，登录时若未注册，将自动注册";
	byId("login-form").hidden = Boolean(user); byId("sign-in").hidden = Boolean(user); byId("sign-out").hidden = !user;
	byId("account-profile").hidden = !user; byId("account-phone-display").textContent = user?.phone || "";
	const accountLocked = ["agent", "paused", "manual", "reconciling"].includes(mode);
	byId("account-lock-note").hidden = !accountLocked;
	for (const id of ["send-otp", "sign-in", "sign-out", "account-phone", "account-code"]) byId(id).disabled = accountPending || account.busy || !boardToken || accountLocked;
	byId("send-otp").disabled ||= Date.now() < otpDeadline;
	byId("send-otp").textContent = Date.now() < otpDeadline ? "重新获取（" + Math.ceil((otpDeadline - Date.now()) / 1000) + "s）" : "获取验证码";
	byId("sign-in").textContent = accountPending ? "请稍候…" : "登录";

	byId("model-label").textContent = status.modelSelectionError || status.workbenchManaged && !board.modelConfig ? "选择执行模型" : board.model || "跟随 WorkBuddy";
	byId("model").disabled = !boardToken || mode !== "idle";
	byId("model").title = byId("model").disabled ? "任务执行期间锁定模型，下次任务开始前可切换" : "选择执行模型";
	if (byId("model").disabled && byId("model-info").open) byId("model-info").close();

	const handoff = (board.handoffs || []).find((item) => item.status !== "resolved");
	byId("handoff-notice").hidden = !handoff;
	if (handoff) {
		const labels = { password: "输入密码", otp: "输入验证码", payment: "确认支付", security: "处理安全提示", login: "登录账号", verification: "完成身份验证", other: "人工处理" };
		byId("handoff-title").textContent = "需要你在手机上" + (labels[handoff.category] || "处理");
		byId("handoff-reason").textContent = handoff.reason;
		byId("handoff-instruction").textContent = ended ? "任务已结束，这一步没有完成。" : handoff.status === "waiting_observation" ? "已恢复控制，正在核对当前画面。" : "完成后点击右上角「恢复控制」，系统会重新核对画面再继续。请不要在对话中发送密码或验证码。";
	}

	byId("wall").hidden = devices.length === 0;
	byId("plan").hidden = devices.length === 0 && !(status.todos || []).length;
	byId("device-label").textContent = devices.length === 1 ? devices[0].name + " · …" + (devices[0].serialSuffix || "") : devices.length ? devices.length + " 台设备" : "选择设备";

	const hint = connectionState(status, board, devices, connected);
	byId("connection-dot").className = "dot " + (devices.length && !hint.warning ? "ready" : hint.warning ? "warning" : "");
	byId("connection-tip").textContent = hint.label + "：" + hint.detail;
	byId("connection-dot-button").setAttribute("aria-label", "设备连接状态：" + hint.label);
	byId("health-label").textContent = status.startRequired ? hint.label : !devices.length ? "未连接设备" : hint.warning || !connected || ["manual", "paused"].includes(mode) ? hint.label : "环境已就绪";
	byId("health-detail").textContent = hint.detail;
	byId("environment-tip").textContent = hint.warning ? hint.detail : "设备连接正常。遇到连接或操作问题，点击查看解决办法。";
	byId("environment-help").classList.toggle("has-issue", hint.warning);
	byId("access-link").textContent = hint.warning ? "接入指引" : "连接帮助";
	byId("access-link").classList.toggle("issue", hint.warning);
	const needsRecheck = active && (hint.alert || board.connectionRecovery?.status === "waiting_recheck" || board.environment?.stale && mode === "reconciling" || status.errorCode === "device_unavailable");
	byId("connection-alert").hidden = !needsRecheck;
	if (needsRecheck) { byId("connection-alert-title").textContent = hint.label; byId("connection-alert-detail").textContent = hint.detail; }

	byId("stage").classList.toggle("manual", mode === "manual");
	byId("stage").dataset.control = mode;
	const showControls = devices.length > 0 && !ended && Boolean(boardToken);
	byId("takeover").hidden = !showControls; byId("takeover").disabled = !active;
	// Takeover is the pause: no screenshots or model calls until the person resumes control.
	byId("takeover").innerHTML = mode === "manual" ? icon("play") + "<span>恢复控制</span>" : icon("hand") + "<span>接管设备</span>";
	byId("takeover").title = mode === "manual" ? "恢复后会先重新截图核对画面，再继续执行" : "暂停 AI 操作，由你直接操作手机";
	byId("takeover").classList.toggle("returning", mode === "manual");
	byId("menu-recheck").disabled = (!active && !status.canSelectDevice) || !boardToken;
	byId("disconnect").disabled = !active || !boardToken;
	byId("zoom").hidden = devices.length === 0;
	updateDeviceButtons();
	if (status.selectionRequired && status.selectionRequested && !status.startRequired && !deviceSelectionPrompted) { deviceSelectionPrompted = true; void showDevices(); }

	for (const device of devices) {
		const c = cards.get(device.id);
		if (!c) continue;
		const stale = device.state !== "ready" || c.canvas.classList.contains("stale");
		// During takeover an Android phone is operated directly on the live picture, so it stays uncovered.
		const controllable = mode === "manual" && device.os !== "ios" && Boolean(boardToken) && typeof globalThis.openguiTakeover === "function";
		globalThis.openguiTakeover?.(c, controllable);
		const covered = controllable ? stale : mode === "manual" || stale;
		c.watermark.hidden = !covered;
		c.watermark.classList.toggle("placeholder", !(mode === "manual" && !controllable) && !c.hadFrame);
		// An open stream waiting for its next key frame is refreshing, not disconnected.
		c.watermark.textContent = mode === "manual" && !controllable ? "你正在手动控制设备" : !c.hadFrame ? "正在连接设备画面…" : ended && !c.ws ? "最后画面 · 任务已结束" : c.ws ? "正在刷新画面…" : "连接中断 · 最后有效画面";
	}
	renderPlan(status);
	renderStart(status);
	renderTrace(status);
	byId("trace-section").hidden = !byId("start-panel").hidden && !(board.traces || []).length;
	renderReviews(board);
	renderTests(board);
	renderExecutionBudget(status);
	renderEnvironment(board);
	renderReport(status);
}
for (const [id, format] of [["export-md", "md"], ["export-word", "docx"], ["export-pdf", "pdf"], ["export-evidence", "zip"]]) {
	byId(id).href = location.pathname + "report?format=" + format;
}
</script>`
}
