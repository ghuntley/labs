# DuckDNS dynamic DNS updater (https://www.duckdns.org): periodically tells
# DuckDNS this network's public IP. DuckDNS detects the IP from the request.
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.duckdns-updater;
in
{
  options.services.duckdns-updater = {
    enable = lib.mkEnableOption "DuckDNS dynamic DNS updater";

    domains = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      example = [ "ghuntley" ];
      description = "DuckDNS subdomains to update (without .duckdns.org).";
    };

    tokenFile = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/secrets/duckdns-token";
      description = "File containing only the DuckDNS account token (kept out of git).";
    };

    interval = lib.mkOption {
      type = lib.types.str;
      default = "5min";
      description = "How often to refresh the record.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.tmpfiles.rules = [ "d /var/lib/secrets 0700 root root -" ];

    systemd.services.duckdns-updater = {
      description = "Update DuckDNS record(s) with this network's public IP";
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ];
      unitConfig.ConditionPathExists = cfg.tokenFile;
      path = [
        pkgs.curl
        pkgs.coreutils
      ];
      serviceConfig = {
        Type = "oneshot";
        DynamicUser = true;
        LoadCredential = [ "token:${cfg.tokenFile}" ];
      };
      script = ''
        set -euo pipefail
        token=$(tr -d '[:space:]' < "$CREDENTIALS_DIRECTORY/token")
        # Pass the URL via stdin config so the token never appears in argv.
        result=$(printf 'url = "https://www.duckdns.org/update?domains=%s&token=%s&ip=&verbose=true"\n' \
          ${lib.escapeShellArg (lib.concatStringsSep "," cfg.domains)} "$token" \
          | curl --silent --show-error --fail --max-time 30 --config -)
        echo "$result" | tr '\n' ' '; echo
        [ "$(echo "$result" | head -n1)" = "OK" ]
      '';
    };

    systemd.timers.duckdns-updater = {
      wantedBy = [ "timers.target" ];
      timerConfig = {
        OnBootSec = "30s";
        OnUnitActiveSec = cfg.interval;
      };
    };
  };
}
