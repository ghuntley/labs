# nginx serving the static site from srv/ over plain http on port 80.
#   https://labs.ghuntley.com  via Cloudflare Tunnel (see tunnel.nix);
#                              Cloudflare terminates TLS at its edge
#   http://<LAN/Tailscale IP>  directly
{ pkgs, ... }:

let
  site = pkgs.callPackage ../packages/site.nix { };
in
{
  services.nginx = {
    enable = true;
    recommendedGzipSettings = true;
    recommendedOptimisation = true;

    # Tunnel traffic arrives from cloudflared on localhost; log the real
    # visitor address instead. Only localhost is trusted, so LAN clients
    # cannot spoof the header.
    commonHttpConfig = ''
      set_real_ip_from 127.0.0.1;
      set_real_ip_from ::1;
      real_ip_header CF-Connecting-IP;
    '';

    virtualHosts.default = {
      default = true;
      root = site;
    };
  };

  # LAN and Tailscale only; the ISP uses CGNAT, so nothing reaches this
  # machine inbound from the internet anyway.
  networking.firewall.allowedTCPPorts = [ 80 ];
}
