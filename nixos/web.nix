# nginx serving the static site from srv/ on port 80.
{ pkgs, ... }:

let
  site = pkgs.callPackage ../packages/site.nix { };
in
{
  services.nginx = {
    enable = true;
    recommendedGzipSettings = true;
    recommendedOptimisation = true;
    virtualHosts.default = {
      default = true;
      root = site;
    };
  };

  networking.firewall.allowedTCPPorts = [ 80 ];
}
