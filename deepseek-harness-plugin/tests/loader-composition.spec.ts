import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const binScript = fileURLToPath(new URL('./fixtures/assembled/snapshot.ts', import.meta.url))
const disabledConfigPath = fileURLToPath(new URL('./fixtures/assembled/disabled.cordis.yml', import.meta.url))
const enabledConfigPath = fileURLToPath(new URL('./fixtures/assembled/enabled.cordis.yml', import.meta.url))
const rootConfigPath = fileURLToPath(new URL('./fixtures/assembled/root.cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../tsconfig.json', import.meta.url))
const prepare = (cwd: string): Promise<void> => copyFile(rootConfigPath, join(cwd, 'root.cordis.yml'))

describe('OpenGUI assembled snapshot', () => {
  it('publishes its command and model protocol only while the Loader entry is mounted', async () => {
    const disabled = await runLoaderSmoke({
      label: 'coremate-mobile disabled snapshot',
      tempDirPrefix: 'coremate-mobile-disabled-',
      binScript,
      libBinScript: binScript,
      configPath: disabledConfigPath,
      tsconfigPath,
      mode: 'src',
      prepare,
    })
    const enabled = await runLoaderSmoke({
      label: 'coremate-mobile enabled snapshot',
      tempDirPrefix: 'coremate-mobile-enabled-',
      binScript,
      libBinScript: binScript,
      configPath: enabledConfigPath,
      tsconfigPath,
      mode: 'src',
      prepare,
    })

    expect(disabled.stderr).toBe('')
    expect(enabled.stderr).toBe('')
    expect(JSON.parse(disabled.stdout) as unknown).toMatchInlineSnapshot(`
      {
        "afterUnload": {
          "commands": [],
          "configurableProviders": [],
          "providers": [],
          "routingSections": [],
          "tools": [],
        },
        "before": {
          "commands": [],
          "configurableProviders": [],
          "providers": [],
          "routingSections": [],
          "tools": [],
        },
        "entry": null,
      }
    `)
    expect(JSON.parse(enabled.stdout) as unknown).toMatchInlineSnapshot(`
      {
        "afterUnload": {
          "commands": [],
          "configurableProviders": [],
          "providers": [],
          "routingSections": [],
          "tools": [],
        },
        "before": {
          "commands": [
            {
              "description": "Legacy alias for /opengui",
              "input": {
                "hint": "<task>",
              },
              "name": "coremate",
            },
            {
              "description": "Run a phone or local-browser task with OpenGUI",
              "input": {
                "hint": "<task>",
              },
              "name": "opengui",
            },
          ],
          "configurableProviders": [
            {
              "displayName": "OpenGUI 模型",
              "provider": "coremate-mobile",
              "settingsNs": "coremate-mobile",
              "settingsPath": [],
            },
          ],
          "providers": [
            {
              "id": "coremate-inherited",
              "name": "Current DSH model",
            },
            {
              "id": "coremate-mobile",
              "name": "OpenGUI model",
            },
          ],
          "routingSections": [
            {
              "name": "tool:opengui-root-routing",
              "text": "When phone_agent is available, every request to inspect, operate, test, or coordinate an Android phone, mobile app, or mobile game must use phone_agent. This routing is based on the user's intent; the user does not need to mention OpenGUI, @OpenGUI, or /opengui. Never substitute Bash, shell commands, raw adb, or another UI-control path. If phone_agent cannot start, report the OpenGUI connection or configuration problem instead of bypassing it.",
            },
          ],
          "tools": [
            {
              "description": "Delegate one complete website task to a visible local browser managed entirely by this plugin. On first use, waits for the user to approve the pinned Chromium installation.",
              "name": "browser_agent",
              "parameters": {
                "properties": {
                  "task": {
                    "type": "string",
                  },
                },
                "required": [
                  "task",
                ],
                "type": "object",
              },
            },
            {
              "description": "Observe or perform one allowlisted action in the visible local browser bound to this browser-agent task. Coordinate actions use the current screenshot and require its exact observationId. Every action returns a verified observation.",
              "name": "browser_control",
              "parameters": {
                "properties": {
                  "action": {
                    "enum": [
                      "observe",
                      "navigate",
                      "tap",
                      "text",
                      "key",
                      "scroll",
                      "back",
                      "reload",
                      "wait",
                    ],
                    "type": "string",
                  },
                  "deltaX": {
                    "description": "Horizontal scroll delta from -2000 through 2000.",
                    "type": "integer",
                  },
                  "deltaY": {
                    "description": "Vertical scroll delta from -2000 through 2000.",
                    "type": "integer",
                  },
                  "key": {
                    "enum": [
                      "Enter",
                      "Escape",
                      "Tab",
                      "Backspace",
                      "ArrowUp",
                      "ArrowDown",
                      "ArrowLeft",
                      "ArrowRight",
                    ],
                    "type": "string",
                  },
                  "observationId": {
                    "description": "Exact observationId from the latest browser_control result; required except for observe and navigate.",
                    "type": "string",
                  },
                  "targetBBox": {
                    "additionalProperties": false,
                    "description": "Tight visible target bounds in pixels of the current browser screenshot; tap uses its center.",
                    "properties": {
                      "bottom": {
                        "type": "number",
                      },
                      "left": {
                        "type": "number",
                      },
                      "right": {
                        "type": "number",
                      },
                      "top": {
                        "type": "number",
                      },
                    },
                    "required": [
                      "left",
                      "top",
                      "right",
                      "bottom",
                    ],
                    "type": "object",
                  },
                  "text": {
                    "description": "Unicode text inserted into the currently focused field.",
                    "type": "string",
                  },
                  "url": {
                    "description": "HTTP or HTTPS URL for navigate.",
                    "type": "string",
                  },
                  "waitMs": {
                    "description": "Explicit page settle wait from 100 through 10000 ms.",
                    "type": "integer",
                  },
                },
                "required": [
                  "action",
                ],
                "type": "object",
              },
            },
            {
              "description": "Delegate one complete Android phone task to the receiving DSH model or the dedicated fallback and wait for its verified result.",
              "name": "phone_agent",
              "parameters": {
                "properties": {
                  "task": {
                    "type": "string",
                  },
                },
                "required": [
                  "task",
                ],
                "type": "object",
              },
            },
            {
              "description": "Observe or perform one allowlisted action on the Android phone locked to this phone-agent task. Mutations require the current observationId; tap and swipe coordinates are pixels in that observation screenshot. Every action returns a verified observation.",
              "name": "phone_control",
              "parameters": {
                "properties": {
                  "action": {
                    "enum": [
                      "observe",
                      "tap",
                      "swipe",
                      "text",
                      "key",
                      "launch",
                      "wait",
                    ],
                    "type": "string",
                  },
                  "durationMs": {
                    "type": "integer",
                  },
                  "key": {
                    "enum": [
                      "Back",
                      "Home",
                      "Enter",
                      "AppSwitch",
                    ],
                    "type": "string",
                  },
                  "observationId": {
                    "description": "Exact observationId from the latest phone_control result; required except for observe.",
                    "type": "string",
                  },
                  "packageName": {
                    "type": "string",
                  },
                  "targetBBox": {
                    "additionalProperties": false,
                    "description": "Tight visible target bounds in pixels of the current screenshot; tap uses its center.",
                    "properties": {
                      "bottom": {
                        "type": "number",
                      },
                      "left": {
                        "type": "number",
                      },
                      "right": {
                        "type": "number",
                      },
                      "top": {
                        "type": "number",
                      },
                    },
                    "required": [
                      "left",
                      "top",
                      "right",
                      "bottom",
                    ],
                    "type": "object",
                  },
                  "text": {
                    "type": "string",
                  },
                  "waitMs": {
                    "description": "Explicit UI settle wait from 100 through 10000 ms.",
                    "type": "integer",
                  },
                  "x1": {
                    "description": "Swipe start x in current screenshot pixels.",
                    "type": "number",
                  },
                  "x2": {
                    "description": "Swipe end x in current screenshot pixels.",
                    "type": "number",
                  },
                  "y1": {
                    "description": "Swipe start y in current screenshot pixels.",
                    "type": "number",
                  },
                  "y2": {
                    "description": "Swipe end y in current screenshot pixels.",
                    "type": "number",
                  },
                },
                "required": [
                  "action",
                ],
                "type": "object",
              },
            },
          ],
        },
        "entry": {
          "config": {
            "api": "openai-responses",
            "baseURL": "https://gateway.example/v1",
            "model": "vision-model",
          },
          "id": "coremate-mobile",
          "name": "dsh-coremate-mobile",
        },
      }
    `)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS * 2)
})
