# Contributing to OpenGUI

Thank you for your interest in contributing to OpenGUI!

## Getting Started

1. Fork the repository
2. Clone your fork and create a new branch
3. Follow the setup instructions in [README.md](README.md)

## Development

### Server (NestJS)

```bash
cd server
./start.sh
```

- Code style is enforced by [Biome](https://biomejs.dev/) — run `pnpm format-and-lint:fix` before committing
- Tests: `pnpm test`

### Android Client (Kotlin)

```bash
cd client
./gradlew assembleDebug
```

## Adding a Phone Action

A phone action crosses the model prompt, server execution pipeline, WebSocket payload, and Android accessibility implementation. Keep the action name and payload fields aligned across every layer.

### End-to-End Reference: `long_press`

The existing `long_press(point='<point>x y</point>')` action is a useful reference:

1. `server/apps/backend/src/modules/graph-agent/graph/nodes/executor/entry.node.ts` exposes the action to the model in the GUI action space.
2. `server/apps/backend/src/modules/graph-agent/graph/nodes/executor/parse-action.node.ts` parses the model output and normalizes `point` to `start_coords`. Its behavior is covered by `parse-action.node.spec.ts`.
3. `server/apps/backend/src/modules/graph-agent/graph/nodes/executor/execute-action.node.ts` allows the action, converts `start_coords` to the wire fields `start_x` and `start_y`, and sends the request to the selected execution socket.
4. `client/core_common_jvm/src/main/java/com/coremate/opengui/common_jvm/dto/ActionDtos.kt` deserializes those fields into the Android `ActionInputs` model.
5. `client/core_accessibility/src/main/java/com/coremate/opengui/accessibility/ActionExecutor.kt` validates the inputs and dispatches the action.
6. `client/core_accessibility/src/main/java/com/coremate/opengui/accessibility/actions/LongPressAction.kt` calls the low-level implementation in `GestureService.kt`.

Follow the same path when adding a new action.

### Change Checklist

1. **Define the model contract.** Add the action name, parameters, and usage guidance to the action space in `entry.node.ts`.
2. **Parse and validate the output.** Add a focused case to `parse-action.node.spec.ts`. Change `parse-action.node.ts` only when the new action needs syntax or coordinate normalization that the generic parser does not already support.
3. **Update the server action contract.** Add the action to `MobileActionType` in `execute-action.node.ts`. If it introduces new inputs, add them to `ActionInputs` in `state.types.ts` and map them in `buildActionParams()`.
4. **Keep the wire payload aligned.** New fields emitted by `buildActionParams()` must have matching `@SerializedName` fields in the Android `ActionInputs` data class in `ActionDtos.kt`.
5. **Implement Android dispatch.** Add input validation and a dispatch branch in `ActionExecutor.kt`, then add a focused action class under `core_accessibility/.../actions/`.
6. **Add a low-level primitive only when needed.** Reuse existing `GestureService` methods when possible. Extend `GestureService.kt` only if the action requires behavior that existing click, long-press, swipe, text, or global navigation primitives cannot provide.
7. **Review loop semantics.** If the new action is passive or should be treated specially by repetition detection, update `post-execute.node.ts` and its tests.

Use the same action name at every layer. Keep parser coordinates as `start_coords` / `end_coords`, wire coordinates as `start_x` / `start_y` / `end_x` / `end_y`, and explicitly serialize any additional fields shared with Android.

### Verification

Run the focused parser tests and server checks:

```bash
cd server
pnpm --filter backend test -- parse-action.node.spec.ts --runInBand
pnpm build
pnpm format-and-lint
```

Run the Android unit tests and build the APK:

```bash
cd client
./gradlew :core_accessibility:testDebugUnitTest :app:assembleDebug
```

For a new or changed gesture, also test on a real Android device. Start a task that makes the model select the action, confirm that the server sends the expected payload, verify the gesture on the target screen, and confirm that execution continues with a fresh screenshot. Add an instrumented test when the behavior depends on Android framework APIs that cannot be covered by a local unit test.

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a clear description of the change and why it's needed
- Add tests for new functionality when possible
- Ensure `pnpm format-and-lint` passes (server)

## Architecture Notes

- **`graph-agent/`** is the AI orchestration core — changes here require extra care and thorough testing
- **`credits/`**, **`tos/`**, **`knowledge/`** are intentionally stubbed modules — do not delete them, only modify the stub behavior
- See [CLAUDE.md](CLAUDE.md) for detailed architecture context

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- See the [public label policy](docs/labels.md) for how maintainers classify issues and pull requests
- For security vulnerabilities, see [SECURITY.md](SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the Business Source License 1.1 (BUSL-1.1), unless a separate written agreement says otherwise.

You also grant Core-Mate the right to use, modify, distribute, sublicense, commercially license, and relicense your contributions as part of OpenGUI. For substantial external contributions, maintainers should request a Contributor License Agreement before accepting the change.
