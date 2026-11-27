# Pull-based auto-deploy: every minute, fetch the config repo from GitHub and
# `nixos-rebuild switch` if the tracked branch moved to a revision that isn't
# already running (and hasn't already been attempted).
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.nixos-autoupdate;
in
{
  options.services.nixos-autoupdate = {
    enable = lib.mkEnableOption "pull-based NixOS auto-update from a git repository";

    repo = lib.mkOption {
      type = lib.types.str;
      default = "https://github.com/ghuntley/labs.git";
      description = "Git URL of the repository holding the flake.";
    };

    branch = lib.mkOption {
      type = lib.types.str;
      default = "trunk";
      description = "Branch to track.";
    };

    dir = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/nixos-config";
      description = "Local checkout used for builds.";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = config.networking.hostName;
      description = "nixosConfigurations attribute to build.";
    };

    interval = lib.mkOption {
      type = lib.types.str;
      default = "1min";
      description = "Delay between the end of one run and the start of the next.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.nixos-autoupdate = {
      description = "Pull NixOS configuration from git and switch to it";
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ];
      # Never restart/stop this unit during a switch it is itself performing.
      restartIfChanged = false;
      stopIfChanged = false;
      path = [
        pkgs.git
        pkgs.coreutils
        pkgs.util-linux
        config.nix.package
        config.system.build.nixos-rebuild
      ];
      environment.HOME = "/root";
      serviceConfig = {
        Type = "oneshot";
        StateDirectory = "nixos-autoupdate";
        TimeoutStartSec = "infinity";
      };
      script = ''
        set -euo pipefail
        exec 9>/run/nixos-autoupdate.lock
        flock -n 9 || { echo "another run in progress"; exit 0; }

        dir=${lib.escapeShellArg cfg.dir}
        branch=${lib.escapeShellArg cfg.branch}
        state=/var/lib/nixos-autoupdate/last-attempt

        if [ ! -d "$dir/.git" ]; then
          rm -rf "$dir"
          if ! git clone --branch "$branch" ${lib.escapeShellArg cfg.repo} "$dir"; then
            echo "clone failed (branch '$branch' may not exist yet); will retry"
            rm -rf "$dir"
            exit 0
          fi
        fi

        cd "$dir"
        git remote set-url origin ${lib.escapeShellArg cfg.repo}
        if ! git fetch --quiet origin "$branch"; then
          echo "fetch failed; will retry"
          exit 0
        fi
        rev=$(git rev-parse FETCH_HEAD)

        running=$(/run/current-system/sw/bin/nixos-version --configuration-revision 2>/dev/null || true)
        if [ "$rev" = "$running" ]; then
          exit 0
        fi
        if [ -f "$state" ] && [ "$(cat "$state")" = "$rev" ]; then
          # Already tried this revision (and it failed or was superseded); wait for a new commit.
          exit 0
        fi

        echo "deploying $rev (running: ''${running:-unknown})"
        git reset --hard --quiet "$rev"
        git clean -fdxq
        echo "$rev" > "$state"
        nixos-rebuild switch --flake "$dir#${cfg.host}"
        echo "switched to $rev"
      '';
    };

    systemd.timers.nixos-autoupdate = {
      wantedBy = [ "timers.target" ];
      timerConfig = {
        OnBootSec = "2min";
        OnUnitInactiveSec = cfg.interval;
        AccuracySec = "5s";
      };
    };
  };
}
