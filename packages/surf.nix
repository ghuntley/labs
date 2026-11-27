# The surf game: everything under games/surf/, copied verbatim into the store.
# Plain ES modules, no build step. Served by nginx at /surf/ (nixos/web.nix).
{ lib, stdenvNoCC }:

stdenvNoCC.mkDerivation {
  pname = "surf";
  version = "0.1.0";

  src = lib.fileset.toSource {
    root = ../games/surf;
    fileset = ../games/surf;
  };

  dontConfigure = true;
  dontBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r . $out/
    runHook postInstall
  '';
}
