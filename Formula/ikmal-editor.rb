class IkmalEditor < Formula
  desc "Standalone LanguageTool manager, background service supervisor, and app auto-configurator"
  homepage "https://github.com/timeworthy/ikmal-editor"
  version "0.9.1-beta"
  license "MIT"

  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/timeworthy/ikmal-editor/releases/download/v0.9.1-beta/ikmal-editor-v0.9.1-beta-darwin-arm64.tar.gz"
    sha256 "380a892e1461e782831594f8332fff560f522511e1510faa4d79a20955cc1129"
  elsif OS.mac? && Hardware::CPU.intel?
    url "https://github.com/timeworthy/ikmal-editor/releases/download/v0.9.1-beta/ikmal-editor-v0.9.1-beta-darwin-amd64.tar.gz"
    sha256 "6afeb6ca9d8f7de8fd6f2a0ef2e3232cb3d886873080ed0ab0624914a5a37c52"
  elsif OS.linux?
    url "https://github.com/timeworthy/ikmal-editor/releases/download/v0.9.1-beta/ikmal-editor-v0.9.1-beta-linux-amd64.tar.gz"
    sha256 "99b4fccbad64b27791f5101ff2311577d9c791cd99aececb14a7d368e7a35940"
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
