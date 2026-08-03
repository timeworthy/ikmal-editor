{
  description = "Ikmal Editor - Launch Manager for LanguageTool";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        packages.default = pkgs.buildGoModule {
          pname = "ikmal-editor";
          version = "0.9.0-beta";
          src = ./.;
          vendorHash = null;

          meta = with pkgs.lib; {
            description = "Standalone LanguageTool manager, background service supervisor, and app auto-configurator";
            homepage = "https://github.com/timeworthymedia/ikmal-editor";
            license = licenses.mit;
            mainProgram = "ikmal-editor";
          };
        };

        apps.default = flake-utils.lib.mkApp {
          drv = self.packages.${system}.default;
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [ pkgs.go_1_22 ];
        };
      }
    );
}
