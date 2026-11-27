# labs: NixOS configuration for host `labs-ghuntley-com`

This repo holds the whole system configuration for this machine as a flake. devenv provides the tooling around it.

```
flake.nix                    nixosConfigurations.labs-ghuntley-com (nixpkgs pinned in flake.lock)
nixos/configuration.nix      entry point: imports + stateVersion
nixos/hardware-configuration.nix
nixos/boot.nix               GRUB
nixos/networking.nix         hostname, NetworkManager, Tailscale
nixos/ssh.nix                key-only OpenSSH, mosh
nixos/locale.nix             timezone, locale
nixos/desktop.nix            XFCE, PipeWire, printing, Firefox
nixos/users.nix              users, SSH keys, sudo
nixos/nix.nix                nix settings, allowUnfree
nixos/packages.nix           system packages, neovim, tmux
nixos/dev.nix                nix-ld, vscode-server
nixos/web.nix                nginx: https://labs.ghuntley.com (ACME) + http default vhost
nixos/ddns.nix               DuckDNS: ghuntley.duckdns.org (labs.ghuntley.com CNAMEs to it)
nixos/modules/duckdns.nix    DuckDNS updater module (token in /var/lib/secrets)
nixos/modules/auto-update.nix  pull-based auto-deploy (systemd timer)
packages/site.nix            packages srv/ as a derivation
srv/                         static site content (index.html, ...)
devenv.nix                   dev shell: scripts, formatter, git hooks
```

## Workflow

`devenv shell` gives you these scripts:

| script              | what it does                                              |
|---------------------|-----------------------------------------------------------|
| `nixos-build`       | build the system without activating it                    |
| `nixos-diff`        | build, then `nvd diff` against the running system         |
| `nixos-switch`      | `sudo nixos-rebuild switch` from this checkout            |
| `nixos-update`      | `nix flake update` (bump nixpkgs)                         |
| `autoupdate-status` | timer schedule, running revision, recent deploy logs      |
| `autoupdate-now`    | trigger a pull and deploy immediately                     |

Normally you just commit and push to `trunk`. The machine deploys the change itself.

## Auto-update

`nixos-autoupdate.timer` runs `nixos-autoupdate.service` one minute after the previous run finishes. Each run does the following:

1. Fetches `trunk` from `https://github.com/ghuntley/labs.git` into `/var/lib/nixos-config`.
2. Exits if that revision is already running (`nixos-version --configuration-revision`) or was already attempted (`/var/lib/nixos-autoupdate/last-attempt`). A broken commit is therefore tried once, not every minute. Push a fix to move on.
3. Otherwise runs `nixos-rebuild switch --flake /var/lib/nixos-config#labs-ghuntley-com`.

To see the logs, run `journalctl -u nixos-autoupdate -f`.

**Security:** anyone who can push to `trunk` gets root on this machine.

## Rollback

```
sudo nixos-rebuild switch --rollback     # or pick an older generation in GRUB
```

After a rollback, the next new commit on `trunk` is still deployed. To stop auto-deploys, run `sudo systemctl stop nixos-autoupdate.timer`.

## Bootstrap (already done once)

```
sudo nixos-rebuild switch --flake .#labs-ghuntley-com --option experimental-features 'nix-command flakes'
```

`/etc/nixos` is no longer used. It is kept only as a historical fallback.
