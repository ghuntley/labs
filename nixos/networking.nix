{ ... }:

{
  networking.hostName = "labs-ghuntley-com";
  networking.networkmanager.enable = true;

  services.tailscale = {
    enable = true;
    openFirewall = true; # UDP 41641 for direct peer connections
  };
}
