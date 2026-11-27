# Dynamic DNS via DuckDNS: keeps ghuntley.duckdns.org on this network's
# current public IP. labs.ghuntley.com is a Cloudflare CNAME (DNS only)
# -> ghuntley.duckdns.org.
#
# The token is NOT in git. Provision it once, root-only:
#   sudo sh -c 'umask 077; cat > /var/lib/secrets/duckdns-token'
# (paste the token from duckdns.org, then Ctrl-D).
{ ... }:

{
  imports = [ ./modules/duckdns.nix ];

  services.duckdns-updater = {
    enable = true;
    domains = [ "ghuntley" ];
  };
}
