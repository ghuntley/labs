# Dynamic DNS: keep labs.ghuntley.com's A record (Cloudflare, DNS-only)
# pointed at this network's current public IPv4.
#
# The API token is NOT in git. Create it once, root-only:
#   sudo sh -c 'umask 077; cat > /var/lib/secrets/cloudflare-api-token'
# (paste the token, then Ctrl-D). The token needs Zone:DNS:Edit on ghuntley.com.
{ ... }:

{
  systemd.tmpfiles.rules = [ "d /var/lib/secrets 0700 root root -" ];

  services.cloudflare-dyndns = {
    enable = true;
    apiTokenFile = "/var/lib/secrets/cloudflare-api-token";
    domains = [ "labs.ghuntley.com" ];
    proxied = false; # nginx terminates TLS itself (Let's Encrypt)
    frequency = "*:0/2"; # every 2 minutes
  };

  # Don't fail every run before the token has been provisioned.
  systemd.services.cloudflare-dyndns.unitConfig.ConditionPathExists =
    "/var/lib/secrets/cloudflare-api-token";
}
