{ pkgs ? import <nixpkgs> {} }:

pkgs.buildGoModule {
  pname = "ikmal-editor";
  version = "0.9.0-beta";

  src = ./.;

  vendorHash = null; # Zero external dependencies

  meta = with pkgs.lib; {
    description = "Standalone LanguageTool manager, background service supervisor, and app auto-configurator";
    homepage = "https://github.com/timeworthymedia/ikmal-editor";
    license = licenses.mit;
    maintainers = [ ];
    mainProgram = "ikmal-editor";
  };
}
