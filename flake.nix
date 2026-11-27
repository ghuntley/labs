{
  description = "NixOS configuration for host labs-ghuntley-com";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    # No nixpkgs input upstream: its NixOS module uses the system pkgs.
    vscode-server.url = "github:nix-community/nixos-vscode-server";
  };

  outputs =
    {
      self,
      nixpkgs,
      vscode-server,
      ...
    }:
    let
      labs = nixpkgs.lib.nixosSystem {
        modules = [
          vscode-server.nixosModules.default
          ./hosts/nixos/configuration.nix
          {
            system.configurationRevision = self.rev or self.dirtyRev or "unknown";
          }
        ];
      };
    in
    {
      nixosConfigurations = {
        labs-ghuntley-com = labs;
        # Alias for the pre-rename hostname, so an auto-updater still building
        # `#nixos` can deploy across the rename.
        nixos = labs;
      };

      formatter.x86_64-linux = nixpkgs.legacyPackages.x86_64-linux.nixfmt;
    };
}
