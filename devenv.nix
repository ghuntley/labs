{
  pkgs,
  inputs,
  ...
}:

# Tooling for managing this machine's NixOS configuration (see flake.nix)
# and for developing/testing the web games under games/.
let
  bombadil = inputs.bombadil.packages.${pkgs.stdenv.system}.default;
in
{
  packages = [
    pkgs.git
    pkgs.gh
    pkgs.nixfmt
    pkgs.nvd
    pkgs.chromium # headless browser for tests (chromium --headless)
    bombadil # property-based UI testing; see AGENTS.md
  ];

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs;
  };
  languages.typescript.enable = true;
  languages.rust.enable = true;

  # Bombadil (and anything else that drives a browser) uses this Chromium.
  env.CHROME = "${pkgs.chromium}/bin/chromium";
  env.PUPPETEER_EXECUTABLE_PATH = "${pkgs.chromium}/bin/chromium";

  scripts = {
    nixos-build.exec = ''
      nixos-rebuild build --flake "$DEVENV_ROOT#labs-ghuntley-com" "$@"
    '';
    nixos-diff.exec = ''
      cd "$DEVENV_ROOT" && nixos-rebuild build --flake ".#labs-ghuntley-com" && nvd diff /run/current-system ./result
    '';
    nixos-switch.exec = ''
      sudo nixos-rebuild switch --flake "$DEVENV_ROOT#labs-ghuntley-com" "$@"
    '';
    nixos-update.exec = ''
      cd "$DEVENV_ROOT" && nix flake update "$@"
    '';
    autoupdate-status.exec = ''
      systemctl list-timers nixos-autoupdate.timer --no-pager
      echo "running revision: $(nixos-version --configuration-revision)"
      journalctl -u nixos-autoupdate.service -n 50 --no-pager
    '';
    autoupdate-now.exec = ''
      sudo systemctl start nixos-autoupdate.service && journalctl -u nixos-autoupdate.service -n 30 --no-pager
    '';
    serve-surf.exec = ''
      node "$DEVENV_ROOT/tests/surf/serve.mjs" "''${1:-8000}"
    '';
    # Unit tests, then Bombadil against a throwaway local server. Extra args
    # go to bombadil (e.g. --time-limit 10m). Exit 2 = property violation.
    test-surf.exec = ''
      set -eu
      cd "$DEVENV_ROOT"
      node --test tests/surf/*.test.mjs
      node tests/surf/serve.mjs 8765 & server=$!
      trap 'kill $server' EXIT
      sleep 1
      for spec in tests/surf/spec.ts tests/surf/ride.spec.ts; do
        echo "== bombadil $spec"
        bombadil browser test --headless --no-sandbox --exit-on-violation \
          --time-limit 2m "$@" "http://localhost:8765/surf/?demo=8" "$spec"
      done
    '';
  };

  git-hooks.hooks.nixfmt.enable = true;

  enterTest = ''
    nix --extra-experimental-features 'nix-command flakes' flake check "$DEVENV_ROOT"
  '';
}
