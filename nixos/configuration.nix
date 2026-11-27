# Entry point for host labs-ghuntley-com. Each concern lives in its own file.
{ ... }:

{
  imports = [
    ./hardware-configuration.nix
    ./boot.nix
    ./networking.nix
    ./ssh.nix
    ./locale.nix
    ./desktop.nix
    ./users.nix
    ./nix.nix
    ./packages.nix
    ./dev.nix
    ./modules/auto-update.nix
  ];

  services.nixos-autoupdate.enable = true;

  # First NixOS release installed on this machine. Do NOT change; see
  # https://nixos.org/manual/nixos/stable/options#opt-system.stateVersion
  system.stateVersion = "26.05";
}
