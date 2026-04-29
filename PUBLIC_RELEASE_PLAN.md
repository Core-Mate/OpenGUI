# Minimum Public Release Plan for OpenGUI

This document defines the smallest credible public package for OpenGUI.

The current README positions OpenGUI as a full-stack Android operator system. To make that positioning defensible in a source-available public setting, the repository should expose a minimum set of code, interfaces, and examples that prove the system shape.

## Goal

OpenGUI should be publicly understandable as:

- an Android-native execution client
- a backend task orchestration service
- a remote-dispatchable mobile operator stack

The public repository does not need to expose every internal capability. It does need to expose enough code and assets to prove that OpenGUI is more than a local phone-agent demo.

## Minimum Credible Package

### 1. Backend skeleton

Expose a minimal but real `server/` package with:

- task creation endpoint
- task status endpoint
- device registration or heartbeat endpoint
- one visible execution pipeline entry
- one result schema

Suggested files:

```text
server/
  README.md
  apps/backend/src/
    main.ts
    app.module.ts
    modules/
      task/
        task.controller.ts
        task.service.ts
        dto/
      device/
        device.controller.ts
        device.service.ts
      graph-agent/
        graph-agent.service.ts
      im-channel/
        im-channel.module.ts
  packages/database/
    prisma/schema.prisma
```

Why this matters:

- proves there is a real server-side lifecycle
- proves tasks are first-class objects, not just transient local runs
- proves device and result management exist in the architecture

### 2. Android client skeleton

Expose a minimal but real `client/` package with:

- app startup
- server connection config
- accessibility execution entry
- screenshot or screen-state capture entry
- action executor interface

Suggested files:

```text
client/
  README.md
  app/src/main/
    AndroidManifest.xml
    java/.../
      MainActivity.kt
      settings/
      accessibility/
      network/
      executor/
```

Why this matters:

- proves execution is Android-native
- proves the control path is not only host-side ADB
- makes the README claim about AccessibilityService concrete

### 3. One end-to-end demo path

Expose one narrow but complete path:

- create task
- dispatch to device
- execute one or more actions
- return structured result

Recommended scenario:

- open an app
- search a keyword
- collect the first few visible results
- return a JSON summary

Suggested assets:

- one API example request
- one API example response
- one device log sample
- one screenshot sequence or GIF

Why this matters:

- users need one believable closed loop
- this is the fastest way to convert README claims into trust

### 4. Public schemas and contracts

Expose the core payloads:

- task request schema
- task status schema
- action schema
- structured result schema
- device registration schema

Suggested files:

```text
contracts/
  task-request.json
  task-result.json
  action.json
  device-heartbeat.json
```

Why this matters:

- helps external users understand the system without reading all code
- makes integrations easier
- supports future SDK or hosted API directions

### 5. Remote dispatch example

Expose one minimal integration example for:

- Feishu or Telegram webhook or bot command handling

This does not need production secrets or full internal logic. It does need:

- command entry shape
- task dispatch mapping
- result return shape

Why this matters:

- remote dispatch is one of the clearest differentiators in the README
- without an example, it reads like a promise rather than a feature

## Recommended First Public Milestone

If the team wants the smallest possible high-signal release, ship this first:

1. `server/` minimal backend skeleton
2. `client/` minimal Android execution skeleton
3. one complete demo workflow
4. one architecture diagram
5. one GIF or screenshot sequence
6. public JSON contracts

This is enough to support the current README positioning.

## What Can Stay Private For Now

The following can remain private or stubbed in the first public milestone:

- internal business-specific workflows
- tenant-specific logic
- credit or billing modules
- internal prompt tuning
- experimental evaluation systems
- production orchestration details
- internal dashboards and admin tooling

## Release Order

### Phase 1: Prove the architecture

Publish:

- backend skeleton
- Android client skeleton
- architecture diagram
- one end-to-end example

Success condition:

- an external engineer can understand how OpenGUI works
- the README claims are visibly grounded in code

### Phase 2: Prove repeatable usage

Publish:

- task schemas
n- device heartbeat shape
- example task templates
- structured result examples
- one remote-dispatch example

Success condition:

- an external engineer can see how to integrate or extend OpenGUI

### Phase 3: Prove operational maturity

Publish:

- evaluation hooks
- logging examples
- replay or debug tools
- multi-device notes
- deployment guide

Success condition:

- OpenGUI reads as an operator stack, not just a demo repo

## Anti-Patterns to Avoid

Do not ship the public repository in a state where:

- the README claims a backend and client, but neither is visible
- the project promises remote dispatch, but no integration example exists
- the project claims structured results, but no result schema is shown
- the project claims Android-native execution, but only host-side scripts are public

Those gaps make the project sound more complete than the repository can currently prove.

## Maintainer Checklist

Before promoting the repo more broadly, verify all of the following:

- at least one real backend module is public
- at least one real Android execution module is public
- one end-to-end demo can be followed from README alone
- the architecture diagram matches the visible code
- every major README claim is backed by either code, schema, or example asset

If these are true, the README can safely position OpenGUI as a full-stack Android operator system.
