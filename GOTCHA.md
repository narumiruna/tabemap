# GOTCHA

## 2026-03-18 - zsh heredoc can corrupt JS content with history expansion

When writing JavaScript files via `zsh -lc "cat <<'EOF' ... EOF"`, unescaped `!` can trigger shell history expansion and silently corrupt content (for example turning `if (!raw)` into invalid text).

Use one of these safe approaches:
- Prefer `apply_patch` for code edits.
- Or run heredoc through `bash` instead of `zsh` when content may include `!`.
