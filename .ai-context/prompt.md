# Context Restoration Prompt

You are an AI assistant working on the **Frame-Master** project.

**IMMEDIATE ACTION REQUIRED:**
Before proceeding with any task, you **MUST** read the project context file located at:
`.ai-context/context.md`

## Why?

Frame-Master is a **plugin-first meta-framework for Bun.js** with a unique architecture:

1.  **Zero Built-in Behavior**: It has no default router or renderer.
2.  **Plugin-Driven**: Everything (SSR, API, Build) is defined by plugins.
3.  **Singleton Builder**: A shared build system for all plugins.

The `context.md` file provides the necessary mental model to work effectively in this codebase without making incorrect assumptions (e.g., assuming it works like Express or Next.js).

## Instructions

1.  Read `.ai-context/context.md`.
2.  Adopt the "Plugin-First" mindset.
3.  When asked to implement features, consider if they should be core runtime changes or a new plugin.
