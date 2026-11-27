# Cloudflare Tunnel: the ISP uses CGNAT, so nothing can connect in.
# cloudflared dials out to Cloudflare, which serves https://labs.ghuntley.com
# (TLS at Cloudflare's edge) and forwards requests to nginx on localhost.
#
# Tunnel "labs" was created once with `cloudflared tunnel create labs`;
# labs.ghuntley.com is a proxied CNAME to <id>.cfargotunnel.com
# (`cloudflared tunnel route dns labs labs.ghuntley.com`).
#
# The credentials file is NOT in git. Provision it once, root-only:
#   sudo install -D -m 0400 <id>.json /var/lib/secrets/cloudflared-labs.json
{ ... }:

{
  services.cloudflared = {
    enable = true;
    tunnels."007fd428-81f4-4177-a512-d52ea4855c8e" = {
      credentialsFile = "/var/lib/secrets/cloudflared-labs.json";
      ingress."labs.ghuntley.com" = "http://localhost:80";
      default = "http_status:404";
    };
  };
}
