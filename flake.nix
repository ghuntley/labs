{
  description = "NixOS configuration for host labs-ghuntley-com";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs =
    { self, nixpkgs, ... }:
    let
      labs = nixpkgs.lib.nixosSystem {
        modules = [
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
