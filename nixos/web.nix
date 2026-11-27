# nginx serving the static site from srv/ over plain http on port 80.
#   https://labs.ghuntley.com  via Cloudflare Tunnel (see tunnel.nix);
#                              Cloudflare terminates TLS at its edge
#   http://<LAN/Tailscale IP>  directly
{ pkgs, ... }:

let
  site = pkgs.callPackage ../packages/site.nix { };
  surf = pkgs.callPackage ../packages/surf.nix { };
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

      # Edge (Cloudflare) cache policy by response type. Cloudflare reads
      # Cloudflare-CDN-Cache-Control for its own cache and strips it before
      # the browser. HTML stays uncached at the edge so a deploy shows up
      # at once; other assets are cached briefly. stale-if-error keeps the
      # site up through tunnel/origin outages.
      map $sent_http_content_type $cf_cdn_cache_control {
        ~^text/html "no-store";
        default     "public, max-age=60, stale-while-revalidate=60, stale-if-error=86400";
      }
    '';

    # Caching. ETags already change on every deploy: NixOS's nginx derives
    # them from the Nix store path hash (mtimes in the store are all 1970),
    # and drops the meaningless Last-Modified. Cloudflare weakens them to
    # W/"..." when it compresses, which nginx still matches for 304s.
    #
    # Browsers: "no-cache" = keep a copy but revalidate every load, so a
    # cheap 304 normally and never a stale mix of old and new ES modules.
    # This also stops Cloudflare inventing a long browser max-age.
    # add_header without `always` skips errors, so 404s are not cached.
    virtualHosts.default.extraConfig = ''
      add_header Cache-Control "public, no-cache";
      add_header Cloudflare-CDN-Cache-Control $cf_cdn_cache_control;
    '';

    virtualHosts.default = {
      default = true;
      root = site;
      # games/surf/ (packages/surf.nix)
      locations."= /surf".return = "301 /surf/";
      locations."/surf/".alias = "${surf}/";
    };
  };

  # LAN and Tailscale only; the ISP uses CGNAT, so nothing reaches this
  # machine inbound from the internet anyway.
  networking.firewall.allowedTCPPorts = [ 80 ];
}
