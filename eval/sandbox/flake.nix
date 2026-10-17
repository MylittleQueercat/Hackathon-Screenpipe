{
  # The container the workflow agents' tools run in. Pins match eval-sketch's.
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/8edc0c72e3a38faf5434e40d1f19431125fe4b30";
    nix2container.url = "github:nlewo/nix2container/4e83e6724dcb9eb1b3e855426fa4c8cd19f5ce5a";
  };

  outputs = { nixpkgs, nix2container, ... }:
    let
      host = "aarch64-darwin";
      linux = "aarch64-linux";
      pkgs = import nixpkgs { system = linux; };
      n2c = nix2container.packages.${linux}.nix2container;
      # Part of the agent environment: changing this list is a variant like any other.
      # curl is how the workflow prompts reach screenpipe; portal.py relays port 3030.
      tools = with pkgs; [ bashInteractive coreutils findutils gnugrep gnused gawk diffutils
                           less jq python3 curl ];
      portal = pkgs.runCommand "portal" { } ''
        mkdir -p $out/opt/portal
        cp ${./portal.py} $out/opt/portal/portal.py
      '';
    in {
      packages.${host} = {
        image = n2c.buildImage {
          name = "wfeval-sandbox";
          tag = "latest";
          copyToRoot = pkgs.buildEnv {
            name = "sandbox-root";
            paths = tools ++ [ portal ];
            pathsToLink = [ "/bin" "/opt" ];
          };
          config = {
            Entrypoint = [ "/bin/sleep" ];
            Cmd = [ "infinity" ];
            User = "65534:65534";
            WorkingDir = "/tmp";
            Env = [ "PATH=/bin" "HOME=/tmp" ];
          };
        };
        skopeo = nix2container.packages.${host}.skopeo-nix2container;
      };
    };
}
