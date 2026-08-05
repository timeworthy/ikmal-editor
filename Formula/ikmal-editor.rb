class IkmalEditor < Formula
  desc "Standalone LanguageTool manager, background service supervisor, and app auto-configurator"
  homepage "https://github.com/timeworthy/ikmal-editor"
  version "0.9.0-beta"
  license "MIT"

  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/timeworthy/ikmal-editor/releases/download/v0.9.0-beta/ikmal-editor-v0.9.0-beta-darwin-arm64.tar.gz"
    sha256 "0c0110eb3e250f6dc7ccff9c25a86a23810c7280f3beb301b4748de83a7907d0"
  elsif OS.mac? && Hardware::CPU.intel?
    url "https://github.com/timeworthy/ikmal-editor/releases/download/v0.9.0-beta/ikmal-editor-v0.9.0-beta-darwin-amd64.tar.gz"
    sha256 "9dec56604a3a5780ddac4fd9bb5cc5d9bf38cef6e6f114fc68c1f5f33f35aa5c"
  elsif OS.linux?
    url "https://github.com/timeworthy/ikmal-editor/releases/download/v0.9.0-beta/ikmal-editor-v0.9.0-beta-linux-amd64.tar.gz"
    sha256 "bb2eb5c968f6293e34b7c53112afb2248492c233d501d078ef22cc6dbfefa3e9"
  end

  def install
    if OS.mac? && Hardware::CPU.arm?
      bin.install "ikmal-editor-darwin-arm64" => "ikmal-editor"
    elsif OS.mac? && Hardware::CPU.intel?
      bin.install "ikmal-editor-darwin-amd64" => "ikmal-editor"
    elsif OS.linux?
      bin.install "ikmal-editor-linux-amd64" => "ikmal-editor"
    end
  end

  test do
    system "#{bin}/ikmal-editor", "-version"
  end
end
