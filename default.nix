{ pkgs ? import <nixpkgs> {} }:

pkgs.buildGoModule {
  pname = "ikmal-editor";
  version = "0.9.1-beta";

  src = ./.;

  vendorHash = null; # Zero external dependencies

  meta = with pkgs.lib; {
    description = "Standalone LanguageTool manager, background service supervisor, and app auto-configurator";
    homepage = "https://github.com/timeworthy/ikmal-editor";
    license = licenses.mit;
    maintainers = [ ];
    mainProgram = "ikmal-editor";
  };
}
