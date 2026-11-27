# nginx serving the static site from srv/.
#   https://labs.ghuntley.com  Let's Encrypt cert (HTTP-01); http redirects to https
#   http://<any other name/IP> default vhost, e.g. LAN or Tailscale IP
{ pkgs, ... }:

let
  site = pkgs.callPackage ../packages/site.nix { };
in
{
  security.acme = {
    acceptTerms = true;
    defaults.email = "ghuntley@ghuntley.com";
  };

  services.nginx = {
    enable = true;
    recommendedGzipSettings = true;
    recommendedOptimisation = true;
    recommendedTlsSettings = true;

    virtualHosts."labs.ghuntley.com" = {
      enableACME = true;
      forceSSL = true;
      root = site;
    };

    virtualHosts.default = {
      default = true;
      root = site;
    };
  };

  networking.firewall.allowedTCPPorts = [
    80
    443
  ];
}
