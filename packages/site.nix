# Static site: everything under srv/, copied verbatim into the store.
{ lib, stdenvNoCC }:

stdenvNoCC.mkDerivation {
  pname = "labs-site";
  version = "0.1.0";

  src = lib.fileset.toSource {
    root = ../srv;
    fileset = ../srv;
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
