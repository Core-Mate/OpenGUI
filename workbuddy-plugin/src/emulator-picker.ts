interface EmulatorChoice { name: string; origin: string }
interface EmulatorPickerOptions {
  label: string
  disabled: boolean
  chevronIcon: string
  checkIcon: string
  onSelect: (name: string) => void
  onOpen: (picker: EmulatorPicker) => void
}
interface EmulatorPicker { element: HTMLElement; close: () => void; refresh: () => void }

/** Self-contained for the embedded workbench; choosing an emulator never starts it. */
export function createEmulatorPicker(choices: readonly EmulatorChoice[], selectedName: string, options: EmulatorPickerOptions): EmulatorPicker {
  const root = document.createElement('div'), trigger = document.createElement('button'), list = document.createElement('div')
  const id = 'emulator-options-' + crypto.randomUUID()
  root.className = 'emulator-picker'; trigger.className = 'emulator-trigger'; trigger.type = 'button'; trigger.disabled = options.disabled
  trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-controls', id); trigger.setAttribute('aria-expanded', 'false')
  list.className = 'emulator-options'; list.id = id; list.role = 'listbox'; list.hidden = true; list.setAttribute('aria-label', options.label)
  let selected = Math.max(0, choices.findIndex(choice => choice.name === selectedName)), active = selected, search = '', lastTyped = 0
  const rows: HTMLButtonElement[] = []
  function copy(choice: EmulatorChoice): HTMLElement {
    const text = document.createElement('span'), name = document.createElement('span'), origin = document.createElement('small')
    text.className = 'emulator-value'; name.className = 'emulator-name'; origin.className = 'emulator-origin'
    name.textContent = choice.name; origin.textContent = choice.origin; text.append(name, origin); return text
  }
  function updateTrigger(): void {
    const choice = choices[selected]!, arrow = document.createElement('span')
    arrow.className = 'emulator-chevron'; arrow.innerHTML = options.chevronIcon
    trigger.replaceChildren(copy(choice), arrow); trigger.title = choice.name + ' (' + choice.origin + ')'
    trigger.setAttribute('aria-label', options.label + ': ' + choice.name)
  }
  function refresh(): void {
    if (list.hidden || !trigger.isConnected) return
    const rect = trigger.getBoundingClientRect(), dialog = root.closest('dialog')?.getBoundingClientRect()
    const below = Math.min(innerHeight, dialog?.bottom ?? innerHeight) - rect.bottom - 12, above = rect.top - Math.max(0, dialog?.top ?? 0) - 12
    const upward = below < Math.min(list.scrollHeight, 144) && above > below
    list.style.top = upward ? 'auto' : 'calc(100% + 6px)'; list.style.bottom = upward ? 'calc(100% + 6px)' : 'auto'
    list.style.maxHeight = Math.max(40, Math.min(224, upward ? above : below)) + 'px'
  }
  function setActive(index: number): void {
    active = (index + choices.length) % choices.length
    rows.forEach((row, i) => row.classList.toggle('active', i === active))
    trigger.setAttribute('aria-activedescendant', rows[active]!.id)
    rows[active]!.scrollIntoView({ block: 'nearest' })
  }
  function close(): void { list.hidden = true; trigger.setAttribute('aria-expanded', 'false'); trigger.removeAttribute('aria-activedescendant') }
  function open(): void {
    if (trigger.disabled) return
    options.onOpen(picker); list.hidden = false; trigger.setAttribute('aria-expanded', 'true'); refresh(); setActive(selected)
  }
  function choose(index: number): void {
    selected = index; rows.forEach((row, i) => row.setAttribute('aria-selected', String(i === selected)))
    updateTrigger(); close(); trigger.focus({ preventScroll: true }); options.onSelect(choices[selected]!.name)
  }
  choices.forEach((choice, index) => {
    const row = document.createElement('button'), check = document.createElement('span')
    row.type = 'button'; row.className = 'emulator-option'; row.id = id + '-' + index; row.role = 'option'; row.tabIndex = -1
    row.setAttribute('aria-selected', String(index === selected)); check.className = 'emulator-option-check'; check.innerHTML = options.checkIcon
    row.append(copy(choice), check); row.onpointerdown = event => event.preventDefault(); row.onpointermove = () => setActive(index); row.onclick = () => choose(index)
    rows.push(row); list.append(row)
  })
  trigger.onclick = () => { if (list.hidden) open(); else close() }
  trigger.onkeydown = event => {
    const key = event.key
    if (key === 'Tab') { close(); return }
    if (key === 'Escape' && !list.hidden) { event.preventDefault(); event.stopPropagation(); close(); return }
    if (key === 'ArrowDown' || key === 'ArrowUp') { event.preventDefault(); if (list.hidden) open(); else setActive(active + (key === 'ArrowDown' ? 1 : -1)); return }
    if (key === 'Home' || key === 'End') { event.preventDefault(); if (list.hidden) open(); setActive(key === 'Home' ? 0 : choices.length - 1); return }
    if (key === 'Enter' || key === ' ') { event.preventDefault(); if (list.hidden) open(); else choose(active); return }
    if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault(); const now = Date.now(); search = (now - lastTyped < 700 ? search : '') + key.toLocaleLowerCase(); lastTyped = now
      if (list.hidden) open()
      for (let offset = 1; offset <= choices.length; offset++) { const index = (active + offset) % choices.length; if (choices[index]!.name.toLocaleLowerCase().startsWith(search)) { setActive(index); break } }
    }
  }
  const picker = { element: root, close, refresh }
  updateTrigger(); root.append(trigger, list); return picker
}
