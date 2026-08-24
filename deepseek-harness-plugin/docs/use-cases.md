# OpenGUI use cases

English | [中文](use-cases.zh.md)

OpenGUI uses the current DSH conversation model to operate authorized Android phones and can call its managed browser when the task requires it. Select phones in the **OpenGUI** tab, then use `@OpenGUI` or `/opengui`. Templates and completion suggestions fill a draft but never submit automatically.

## QA assistant

```text
@OpenGUI Act as a tester. Explore the current app, produce test cases first, execute them one by one, and summarize issues. Ask before login, payment, or destructive data changes.
```

Use this for smoke tests, regression passes, UI consistency checks, and defect reproduction. State the test account, priority areas, and prohibited actions. With multiple selected phones, OpenGUI runs a separate fixed-device child for each one.

## Operations assistant

```text
@OpenGUI Act as an operations assistant for the target platform and complete basic engagement. Ask before publishing, sending private messages, or changing account settings.
```

Use this to review comments, prepare a reply queue, perform low-risk interactions, and summarize results. Specify the platform, account scope, tone, and interaction boundaries. Confirm every external or account-changing action.

## Game assistant

```text
@OpenGUI Claim the free daily rewards in Game A, Game B, and Game C. Ask before spending money, drawing items, or consuming resources.
```

Use this for check-ins, mail rewards, free stamina, and repetitive daily benefits. Name each game and the allowed rewards. Confirm purchases, draws, scarce-resource exchanges, and guild changes.

## Multiple phones

Select several phones before submitting one task. OpenGUI locks the device snapshot after detection and creates one independent phone-control child per device. This works well for:

- running the same regression set across OS versions;
- collecting free daily rewards on several devices;
- comparing pages across accounts or devices.

Selection stays editable while the task waits for a phone, then locks when model routing begins.

## Phone and browser together

```text
@OpenGUI Read the campaign rules in the phone app, verify the deadline on the official website, and summarize any differences. Do not submit forms.
```

The router decides whether to call the phone agent, browser agent, or both in sequence. Every non-empty OpenGUI task checks for a selected phone first, even when it later uses only the browser. Managed Chromium downloads only when required and only after approval.

## Boundaries

- Empty `/opengui` and bare `@OpenGUI` show usage without checking phones or models.
- A current model with declared image support is reused directly; the dedicated visual model is a compatibility fallback.
- Capability failures never retry automatically, avoiding duplicate side effects.
- Native mirrors are read-only and open only after an eye button is clicked.
- Completion suggestions create an `@OpenGUI` draft. Review it before submitting.

For help, join the [OpenGUI Discord](https://discord.gg/pqHHw7XgJ3). The WeChat entry in this release is explicitly non-scannable; do not trust unofficial QR codes.
