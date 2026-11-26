{
  pkgs,
  ...
}:

# Tooling for managing this machine's NixOS configuration (see flake.nix).
{
  packages = [
    pkgs.git
    pkgs.gh
    pkgs.nixfmt
    pkgs.nvd
  ];

  scripts = {
    nixos-build.exec = ''
      nixos-rebuild build --flake "$DEVENV_ROOT#labs-ghuntley-com" "$@"
    '';
    nixos-diff.exec = ''
      cd "$DEVENV_ROOT" && nixos-rebuild build --flake ".#labs-ghuntley-com" && nvd diff /run/current-system ./result
    '';
    nixos-switch.exec = ''
      sudo nixos-rebuild switch --flake "$DEVENV_ROOT#labs-ghuntley-com" "$@"
    '';
    nixos-update.exec = ''
      cd "$DEVENV_ROOT" && nix flake update "$@"
    '';
    autoupdate-status.exec = ''
      systemctl list-timers nixos-autoupdate.timer --no-pager
      echo "running revision: $(nixos-version --configuration-revision)"
      journalctl -u nixos-autoupdate.service -n 50 --no-pager
    '';
    autoupdate-now.exec = ''
      sudo systemctl start nixos-autoupdate.service && journalctl -u nixos-autoupdate.service -n 30 --no-pager
    '';
  };

  git-hooks.hooks.nixfmt.enable = true;

  enterTest = ''
    nix --extra-experimental-features 'nix-command flakes' flake check "$DEVENV_ROOT"
  '';
}
