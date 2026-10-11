#!/usr/bin/env python3
"""Render the package-manager manifests for the Luotopia dist repositories.

Consumed by the `publish-dist` job of app-release.yml after a release build:
the job downloads the archives from the GitHub release, hashes them, and runs
this script to produce

  <dist-out>/bucket/luotopia.json   Scoop bucket manifest (x64 + arm64)
  <dist-out>/flake.nix              Nix flake (x86_64-linux + aarch64-linux)
  <brew-out>/Formula/luotopia.rb    Homebrew formula (Linux tarballs)
  <brew-out>/Casks/luotopia.rb      Homebrew cask (only with --macos-arm64-sha)

The winget manifests are copied verbatim from the release assets by the job;
nothing here renders them. Deterministic and dependency-free so it can be run
locally against a past release to seed or repair the dist repos:

  python3 .github/scripts/render_dist_manifests.py \
    --tag v1.1.0+16 --target-repo ClosedWHU/Luotopia \
    --dist-out /tmp/dist --brew-out /tmp/brew \
    --windows-x64-sha ... --windows-arm64-sha ... \
    --linux-x64-sha ... --linux-arm64-sha ... [--macos-arm64-sha ...]
"""

import argparse
import base64
import json
import os
import re
import sys

DESC_ZH = "Luotopia (\u73de\u5bb6) \u2014 \u6b66\u6c49\u5927\u5b66\u4e00\u7ad9\u5f0f\u6570\u5b57\u6821\u56ed\u5ba2\u6237\u7aef"
DESC_EN = "Luotopia campus client for Wuhan University"
HOMEPAGE = "https://www.whu.sb"
LICENSE = "MIT"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def sha_to_sri(hex_digest):
    """sha256 hex -> SRI form (`sha256-<base64>`), what Nix fetchurl wants."""
    return "sha256-" + base64.b64encode(bytes.fromhex(hex_digest)).decode("ascii")


def parse_args(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", required=True, help="release tag, e.g. v1.1.0+16")
    parser.add_argument("--target-repo", required=True, help="owner/name of the release repo")
    parser.add_argument("--dist-out", required=True, help="output root for the Luotopia-Dist repo")
    parser.add_argument("--brew-out", required=True, help="output root for the homebrew-luotopia repo")
    parser.add_argument("--windows-x64-sha", required=True)
    parser.add_argument("--windows-arm64-sha", required=True)
    parser.add_argument("--linux-x64-sha", required=True)
    parser.add_argument("--linux-arm64-sha", required=True)
    parser.add_argument("--macos-arm64-sha", default=None, help="omit when the release has no DMG")
    args = parser.parse_args(argv)

    if not args.tag.startswith("v") or "+" not in args.tag:
        parser.error("--tag must look like v1.2.3+4")
    for name in ("windows_x64_sha", "windows_arm64_sha", "linux_x64_sha", "linux_arm64_sha", "macos_arm64_sha"):
        value = getattr(args, name)
        if value is not None and not SHA256_RE.match(value):
            parser.error(f"--{name.replace('_', '-')} is not 64 lowercase hex characters")
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", args.target_repo):
        parser.error("--target-repo must look like owner/name")
    return args


def derive(args):
    version = args.tag[1:]                    # 1.1.0+16
    safe = version.replace("+", "-")          # asset filename form: 1.1.0-16
    brew_version = safe.replace("-", ".")     # Gem::Version-clean: 1.1.0.16
    base = f"https://github.com/{args.target_repo}/releases/download/{args.tag}"
    return {
        "version": version,
        "safe": safe,
        "brew_version": brew_version,
        "base": base,
        "win_x64_zip": f"{base}/luotopia-{safe}-windows-x64.zip",
        "win_arm64_zip": f"{base}/luotopia-{safe}-windows-arm64.zip",
        "linux_x64_tar": f"{base}/luotopia-{safe}-linux-x64.tar.gz",
        "linux_arm64_tar": f"{base}/luotopia-{safe}-linux-arm64.tar.gz",
        "macos_dmg": f"{base}/luotopia-{safe}-macos-arm64.dmg",
    }


def render_scoop(ctx, args):
    manifest = {
        "version": ctx["version"],
        "description": DESC_ZH,
        "homepage": HOMEPAGE,
        "license": LICENSE,
        "architecture": {
            "64bit": {
                "url": ctx["win_x64_zip"],
                "hash": args.windows_x64_sha,
                "extract_dir": "luotopia",
            },
            "arm64": {
                "url": ctx["win_arm64_zip"],
                "hash": args.windows_arm64_sha,
                "extract_dir": "luotopia",
            },
        },
        "bin": "luotopia.exe",
        "shortcuts": [["luotopia.exe", "Luotopia"]],
        "notes": [
            "Portable build from ClosedWHU/Luotopia releases.",
            "If SmartScreen blocks the exe, choose \u201cmore info \u2192 run anyway\u201d, or install the MSIX from the release instead.",
        ],
    }
    # No checkver/autoupdate: the release workflow pushes a fresh manifest to
    # the bucket on every release, and the asset filenames use the dashed tag
    # form which Scoop's $version interpolation cannot reproduce anyway.
    return json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"


def render_flake(ctx, args):
    return f"""{{
  description = "{DESC_ZH}";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = {{ self, nixpkgs }}:
    let
      version = "{ctx["version"]}";
      supportedSystems = [ "x86_64-linux" "aarch64-linux" ];
      sources = {{
        x86_64-linux = {{
          url = "{ctx["linux_x64_tar"]}";
          sha256 = "{sha_to_sri(args.linux_x64_sha)}";
        }};
        aarch64-linux = {{
          url = "{ctx["linux_arm64_tar"]}";
          sha256 = "{sha_to_sri(args.linux_arm64_sha)}";
        }};
      }};
      forAllSystems = f: nixpkgs.lib.genAttrs supportedSystems (system: f nixpkgs.legacyPackages.${{system}});
    in
    {{
      packages = forAllSystems (pkgs: {{
        default = pkgs.stdenv.mkDerivation {{
          pname = "luotopia";
          inherit version;
          src = pkgs.fetchurl {{ inherit (sources.${{pkgs.system}}) url sha256; }};
          sourceRoot = "luotopia";
          nativeBuildInputs = with pkgs; [ autoPatchelfHook makeWrapper copyDesktopItems ];
          buildInputs = with pkgs; [
            gtk3
            webkitgtk_4_1
            libsecret
            libayatana-appindicator
            util-linux
            xz
            glib
            gdk-pixbuf
          ];
          dontConfigure = true;
          dontBuild = true;
          desktopItems = [
            (pkgs.makeDesktopItem {{
              name = "luotopia";
              desktopName = "Luotopia";
              comment = "{DESC_ZH}";
              exec = "luotopia %u";
              icon = "luotopia";
              startupWMClass = "luotopia";
              categories = [ "Education" "Utility" ];
              keywords = [ "WHU" "campus" ];
              mimeTypes = [ "x-scheme-handler/luotopia" ];
            }})
          ];
          installPhase = ''
            runHook preInstall
            mkdir -p $out/opt $out/bin $out/share/icons/hicolor/256x256/apps
            cp -a . $out/opt/luotopia
            chmod 755 $out/opt/luotopia/luotopia
            makeWrapper $out/opt/luotopia/luotopia $out/bin/luotopia
            install -Dm644 data/flutter_assets/assets/icon/icon.png \\
              $out/share/icons/hicolor/256x256/apps/luotopia.png
            runHook postInstall
          '';
        }};
      }});
    }};
}}
"""


def render_formula(ctx, args):
    return f'''class Luotopia < Formula
  desc "{DESC_EN}"
  homepage "{HOMEPAGE}"
  license "{LICENSE}"
  version "{ctx["brew_version"]}"

  depends_on :linux

  on_linux do
    depends_on "gtk+3"
    depends_on "webkitgtk"
    depends_on "libsecret"
    depends_on "libayatana-appindicator"
    depends_on "util-linux"
    depends_on "xz"

    on_intel do
      url "{ctx["linux_x64_tar"]}"
      sha256 "{args.linux_x64_sha}"
    end
    on_arm do
      url "{ctx["linux_arm64_tar"]}"
      sha256 "{args.linux_arm64_sha}"
    end
  end

  def install
    libexec.install Dir["luotopia/*"]
    (bin/"luotopia").write_exec_script libexec/"luotopia"
    share.install "luotopia/data/flutter_assets/assets/icon/icon.png" => "luotopia-icon.png"
  end

  def caveats
    <<~EOS
      Linux portable build from the ClosedWHU/Luotopia releases.
      Requires a GTK3 + WebKitGTK 4.1 session (Wayland or X11).
    EOS
  end
end
'''


def render_cask(ctx, args):
    return f'''cask "luotopia" do
  version "{ctx["brew_version"]}"
  sha256 "{args.macos_arm64_sha}"

  url "{ctx["macos_dmg"]}"
  name "Luotopia"
  desc "{DESC_EN}"
  homepage "{HOMEPAGE}"
  license "{LICENSE}"

  app "Luotopia.app"

  caveats do
    <<~EOS
      Unsigned, un-notarized build (Apple Silicon only): Gatekeeper will block
      the first launch. Right-click Luotopia.app and choose Open, or run:

        xattr -cr /Applications/Luotopia.app

      Only do this for DMGs you downloaded from the official release page.
    EOS
  end
end
'''


def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(content)
    print(f"rendered {path}", file=sys.stderr)


def main(argv=None):
    args = parse_args(argv if argv is not None else sys.argv[1:])
    ctx = derive(args)
    write(os.path.join(args.dist_out, "bucket", "luotopia.json"), render_scoop(ctx, args))
    write(os.path.join(args.dist_out, "flake.nix"), render_flake(ctx, args))
    write(os.path.join(args.brew_out, "Formula", "luotopia.rb"), render_formula(ctx, args))
    if args.macos_arm64_sha:
        write(os.path.join(args.brew_out, "Casks", "luotopia.rb"), render_cask(ctx, args))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
