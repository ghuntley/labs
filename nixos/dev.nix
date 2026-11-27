# Support for running foreign binaries / remote editors.
{ ... }:

{
  programs.nix-ld.enable = true; # run unpatched dynamic binaries
  services.vscode-server.enable = true; # patches VS Code Remote-SSH server binaries
}
