# Agent Note: CoreMate direct phone command

Status: implemented

English | [中文](2026-08-18-coremate-direct-phone-command.zh.md)

## Problem

Starting a phone task required the parent model to select `phone_agent`, even when the human had already expressed that intent. A direct command still had to preserve the same phone-model configuration, child persona, tool restriction, ADB policy, cancellation, and task result semantics. Independent command and tool implementations could drift or control the same deployment-selected phone concurrently.

## Decision

The plugin registers `/coremate <phone task>` through the official Harness command registry. The command sends its trimmed argument directly to a package-owned `PhoneTaskCoordinator`; it never sends the command line to the parent model. `phone_agent` calls the same coordinator, which owns configuration checks, credential resolution, child creation, settlement, and teardown cancellation through one injected start operation.

One plugin instance admits one phone task at a time across both entry points. A competing call fails before model or ADB access because every task selects the same first authorized phone. Plugin disposal aborts the active child signal and awaits settlement. The tool preserves every final content block; the generic command result joins final text blocks and reports a stable run-complete message when none exist.

## Alternatives considered

**Convert `/coremate` into a parent-model prompt.** This would spend a parent-model request and leave tool selection nondeterministic even though the command already names the desired execution path.

**Invoke the registered `phone_agent` tool from the command handler.** The tool runtime owns model-call scheduling and logging, not direct UI composition. An internal coordinator gives both adapters one implementation without fabricating a model tool call.

**Allow command and tool tasks to overlap.** Per-child tool serialization does not prevent two children from selecting and controlling the same physical phone. A plugin-wide admission check fails predictably before either shared resource is touched.

**Project child screenshots into the command result.** The official generic command result accepts text and an optional source event, while the phone screenshots belong to the child session. A client-specific projection would enlarge the plugin beyond the host-only command feature.

## Consequences

Humans can address the phone runner deterministically with one slash command, while ordinary model-led delegation remains available. Direct commands avoid parent-model tokens but display text only. A second session cannot run a phone task concurrently through the same plugin instance, even if a deployment later connects multiple authorized phones; adding explicit device selection would require revisiting that admission rule.
