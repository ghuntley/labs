# labs: NixOS configuration for host `nixos`

This repo holds the whole system configuration for this machine as a flake. devenv provides the tooling around it.

```
flake.nix                         nixosConfigurations.nixos (nixpkgs pinned in flake.lock)
hosts/nixos/configuration.nix     main config (was /etc/nixos/configuration.nix)
hosts/nixos/hardware-configuration.nix
modules/auto-update.nix           pull-based auto-deploy (systemd timer)
devenv.nix                        dev shell: scripts, formatter, git hooks
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
3. Otherwise runs `nixos-rebuild switch --flake /var/lib/nixos-config#nixos`.

To see the logs, run `journalctl -u nixos-autoupdate -f`.

**Security:** anyone who can push to `trunk` gets root on this machine.

## Rollback

```
sudo nixos-rebuild switch --rollback     # or pick an older generation in GRUB
```

After a rollback, the next new commit on `trunk` is still deployed. To stop auto-deploys, run `sudo systemctl stop nixos-autoupdate.timer`.

## Bootstrap (already done once)

```
sudo nixos-rebuild switch --flake .#nixos --option experimental-features 'nix-command flakes'
```

`/etc/nixos` is no longer used. It is kept only as a historical fallback.
