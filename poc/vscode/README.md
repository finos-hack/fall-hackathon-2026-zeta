# VS Code plugin: view selector

This folder carries the CALM VS Code plugin changes for the demo, without
vendoring the whole `architecture-as-code` monorepo.

- `view-selector.patch`: diff of `calm-plugins/vscode` against upstream
  `f68eb13d3c659326fd051b5fa9e88be04dc3a311`. It includes committed and
  uncommitted working-tree changes. Apply with:
  `git apply poc/vscode/view-selector.patch`
  from the root of an `architecture-as-code` checkout.
- `calm-vscode-plugin-0.9.6.vsix`: prebuilt extension (2.0 MB), install with
  `code --install-extension poc/vscode/calm-vscode-plugin-0.9.6.vsix`.
  SHA-256: `7bfd2a8d6df0aac21e0bf3de59a3801a285cc4bce08ca92400f8947e2129e66a`

Building the VSIX from source needs Node 26 and the monorepo workspaces
(`npm ci` at the root, then the `vscode` package scripts).

Derived from upstream `finos/architecture-as-code` (Apache-2.0). The patch
declares the demo changes; license and NOTICE stay with the upstream project.
