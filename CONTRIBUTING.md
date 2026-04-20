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
- For security vulnerabilities, see [SECURITY.md](SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
