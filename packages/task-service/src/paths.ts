import { homedir } from 'node:os'
import { join } from 'node:path'

export const TASK_SERVICE_PROTOCOL = 2
export const TASK_SERVICE_LABEL = 'org.opengui.task-service'

/** User-level service root. Tests override it; installers do not point this at a plugin directory. */
export function serviceRoot(): string {
  return process.env.OPENGUI_TASK_SERVICE_ROOT || join(homedir(), 'Library', 'Application Support', 'OpenGUI', 'task-service')
}

export const socketPath = (root: string): string => join(root, 'service.sock')
export const dataPath = (root: string): string => join(root, 'data')
