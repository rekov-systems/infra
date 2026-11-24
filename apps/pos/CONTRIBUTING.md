# Contributing to POS S360T

Thank you for your interest in contributing! This project is released under the MIT License.

## How to Contribute

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally.
3. Create a new branch: `git checkout -b feat/short-description` or `fix/short-description`.
4. Make your changes.
5. Run the quality gates:
   ```bash
   npm run lint
   npm run test
   npm run build
   npm run validate:migrations
   ```
6. Commit with clear messages following [Conventional Commits](https://www.conventionalcommits.org/).
7. Push to your fork and open a Pull Request.

## Code Style

- TypeScript strict mode is enabled.
- Use functional React components and hooks.
- Keep UI components in `src/components/ui/` (shadcn/ui pattern) or `src/components/shared/`.
- Business logic belongs in `src/modules/<feature>/`.
- Use Zustand for global client state and TanStack Query for server state.
- All Supabase queries must respect tenant and branch scoping.

## Reporting Issues

When reporting bugs, please include:

- Steps to reproduce
- Expected vs actual behavior
- Browser / OS / Node version
- Screenshots or logs if relevant

## Security

If you discover a security issue, please do not open a public issue. Instead, contact the maintainers privately.

## Questions

For general questions, open a GitHub Discussion or ask in the issue tracker.
