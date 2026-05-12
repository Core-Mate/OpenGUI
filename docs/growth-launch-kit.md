# OpenGUI Growth Launch Kit

This launch kit is for honest community growth: show the project clearly, invite real use cases, and make it easy for developers to try the APK or contribute.

## Current Proof Points

- Repository: https://github.com/Core-Mate/OpenGUI
- Homepage: https://opengui.ai/
- Latest APK: https://github.com/Core-Mate/OpenGUI/releases/latest
- Current positioning: AI mobile operator for real Android phones.
- Early traction: 100+ GitHub stars, 13 forks, and 40 downloads on the v0.1.1 debug APK as of 2026-05-12.
- New contribution entry points: issues #9 through #14.

## Core Message

OpenGUI lets an AI operate real Android phones for long-running mobile workflows. It combines a backend graph, Android AccessibilityService execution, standby device dispatch, and model routing so phones can act like remote workers for research, social media, app workflows, and structured mobile tasks.

## Hacker News Draft

Title:

```text
Show HN: OpenGUI - an AI operator for real Android phones
```

Body:

```text
Hi HN, we are building OpenGUI, a source-available AI mobile operator system for real Android phones.

The goal is to move beyond short phone-agent demos. OpenGUI has a backend graph for task state, an Android client for screenshots and AccessibilityService actions, standby dispatch through REST/IM channels, and model routing so planning and VLM execution can use different providers.

Example workflows:
- collect recent posts for a topic from an Android app
- read and summarize Reddit or Hacker News threads on a live phone
- trigger phone tasks remotely from Discord, Telegram, Feishu, or REST
- run longer mobile workflows with progress, review, and recovery

The repo includes setup docs and a debug APK release for testing:
https://github.com/Core-Mate/OpenGUI

We especially want feedback on real phone workflows, setup failures, and where people would trust or not trust this kind of system.
```

## Reddit Draft

Suggested communities: `r/LocalLLaMA`, `r/MachineLearning`, `r/androiddev`, `r/opensource`, and specific automation communities where self-promotion rules allow it.

Title:

```text
OpenGUI: source-available AI operator for real Android phones
```

Body:

```text
I am working on OpenGUI, a source-available system that lets AI operate real Android phones.

It is built around a backend task graph, Android AccessibilityService execution, screenshot/VLM loops, standby device dispatch, and model routing. The practical goal is to run phone-based workflows that need more state and recovery than a short demo loop.

Repo: https://github.com/Core-Mate/OpenGUI
Latest APK: https://github.com/Core-Mate/OpenGUI/releases/latest

Useful feedback would be:
- what Android workflows you would actually want to automate
- where a physical phone is required vs. an emulator
- what setup step fails first
- what model/provider mix works for cost and reliability

There are starter issues open for physical-device setup docs, emulator setup notes, troubleshooting, example prompts, and model-routing profiles.
```

## X / Twitter Thread Draft

```text
We are building OpenGUI: an AI mobile operator for real Android phones.

Instead of only driving a phone from a laptop demo loop, OpenGUI has:
- backend task graph
- Android AccessibilityService execution
- screenshot/VLM action loop
- standby device dispatch
- model routing by role

Repo: https://github.com/Core-Mate/OpenGUI
```

```text
Why phones?

A lot of useful workflows still live inside mobile apps: research, social, messaging, local services, creator tools, and operations dashboards.

OpenGUI is for long-running phone tasks with state, review, retry, and structured results.
```

```text
We just opened contribution and feedback issues:
- physical Android setup docs
- emulator setup notes
- troubleshooting guide
- runnable task prompt examples
- model routing profiles
- real use case collection

Try the APK and tell us what breaks:
https://github.com/Core-Mate/OpenGUI/releases/latest
```

## Discord / Community Draft

```text
We are opening up OpenGUI for more external feedback.

OpenGUI is a source-available AI operator for real Android phones: backend graph, Android client, AccessibilityService execution, standby dispatch, and model routing.

Repo: https://github.com/Core-Mate/OpenGUI
Latest APK: https://github.com/Core-Mate/OpenGUI/releases/latest

We are looking for real phone workflows, setup reports, and contributors for docs/examples/troubleshooting. Good entry issues are now open in the repo.
```

## Outreach Order

1. Merge the community onboarding PR.
2. Pin or highlight issue #14 for use case collection.
3. Post to the project Discord with the Discord draft.
4. Post the X thread and link to issue #14.
5. Post to Hacker News only when someone can monitor comments for the next 2 hours.
6. Post to one Reddit community at a time after checking that community's self-promotion rules.
7. Reply to every substantive comment with a concrete link: APK, setup docs, issue #14, or a relevant starter issue.

## Channel Notes

- **Hacker News**: use a neutral `Show HN` title, link the GitHub repo, and have a builder available to answer comments for at least 2 hours. Do not ask anyone for upvotes or comments.
- **r/androiddev**: lead with technical implementation detail and source code. Avoid app-store-style copy. Good angle: Android AccessibilityService execution, emulator vs. physical device setup, and backend/device networking.
- **r/LocalLLaMA**: treat as high-risk for self-promotion. Post only if the angle is model routing, local/open-compatible endpoints, or VLM cost/reliability, and make the post useful without requiring a click.
- **r/opensource**: lead with contribution areas and licensing clarity. Since OpenGUI is BUSL source-available, be explicit rather than calling it OSI open source.
- **X / Twitter**: use the thread to drive people to the GitHub repo and issue #14. Do not ask for stars; ask for real phone workflows and setup feedback.
- **Discord / existing community**: post first here because the audience is already opted in and can sanity-check the message before broader launch.

## Do Not Do

- Do not buy stars, ask for fake stars, or trade stars.
- Do not mass-post the same text across communities.
- Do not create fake issues or sockpuppet discussion.
- Do not post into communities whose rules prohibit project promotion.
