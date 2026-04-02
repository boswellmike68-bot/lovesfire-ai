# Contributing to LovesfireAI

Thank you for your interest in contributing to LovesfireAI! This document provides guidelines for contributing to the project.

## How to Contribute

### Reporting Issues

If you find a bug or have a feature request, please open an issue on GitHub with:
- A clear description of the problem or feature
- Steps to reproduce (for bugs)
- Expected vs. actual behavior (for bugs)
- Environment details (Node.js version, OS, ffmpeg version)

### Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit your changes (`git commit -am 'Add new feature'`)
6. Push to the branch (`git push origin feature/my-feature`)
7. Open a Pull Request

### Code Style

- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Add types for all interfaces and function signatures
- Document complex logic with comments

## Development Setup

```bash
npm install
npm run dev
```

## Architecture

The project follows a governance-first architecture:
- **BBAI** — Intake and content safety evaluation
- **CCAI** — Alignment and adjustment pipeline
- **BBnCC Engine** — Render orchestration

See `src/governance/` for spec definitions.

## Contact

For questions about contributing, please contact:

- **Mike** – bossbozitive@outlook.com

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
