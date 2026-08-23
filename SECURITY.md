# Security Policy

## Supported versions

Magine is currently an early local-first prototype. Security fixes are applied to the latest commit on `main`; older commits and self-built releases are not maintained separately.

## Reporting a vulnerability

Please use GitHub's private security advisory form:

https://github.com/weibo-job/magine/security/advisories/new

Do not publish API keys, access tokens, private prompts, local file paths, or reproducible exploit details in a public Issue. Include the affected version, operating system, reproduction steps, expected impact, and a minimal redacted example.

## API key safety

- Magine does not ship a shared API key. Every user configures their own provider credentials.
- Never commit `.env`, local storage exports, screenshots containing credentials, or copied application data.
- If a key is exposed in Git history, logs, screenshots, Issues, or chat messages, revoke it at the provider immediately. Removing the visible text from a later commit is not sufficient.
- Use provider-side spend limits and the minimum permissions required for the features you use.

## Local execution boundary

Magine is a desktop application with optional Agent environment tools. Those tools can read or write files inside paths supplied to them and can execute local shell commands through Electron's main process.

- Run Magine only with trusted projects and prompts.
- Review generated commands before relying on them for important work.
- Do not feed untrusted webpage instructions directly into an Agent with local environment access.
- Keep sensitive files outside the working directory when they are not needed.

The browser-only fallback does not expose Electron's local command bridge, but desktop-only file and terminal features will also be unavailable there.

## Data storage

API key ciphertext, drafts, Demo history, canvas versions, and assets are stored locally on the current device. Magine does not currently provide account isolation, cloud backup, remote revocation, or multi-user access control. Treat a shared operating-system account as a shared Magine data environment.
