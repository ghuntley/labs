{ pkgs, ... }:

{
  environment.systemPackages = with pkgs; [
    git
    htop
    btop
  ];

  programs.neovim = {
    enable = true;
    defaultEditor = true;
    viAlias = true;
    vimAlias = true;
  };

  programs.tmux.enable = true;
}
