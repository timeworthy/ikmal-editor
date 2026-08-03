class IkmalEditor < Formula
  desc "Standalone LanguageTool manager, background service supervisor, and app auto-configurator"
  homepage "https://github.com/timeworthymedia/ikmal-editor"
  version "0.9.0-beta"
  license "MIT"

  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/timeworthymedia/ikmal-editor/releases/download/v0.9.0-beta/ikmal-editor-v0.9.0-beta-darwin-arm64.tar.gz"
    sha256 "b0a0dfc88d0adf26f772052ecce595cd06253cbd3c559590e42774cb69caad96"
  elsif OS.mac? && Hardware::CPU.intel?
    url "https://github.com/timeworthymedia/ikmal-editor/releases/download/v0.9.0-beta/ikmal-editor-v0.9.0-beta-darwin-amd64.tar.gz"
    sha256 "3e98295b376d0aedf3c7546ea7933742d8819e4d6e301e7a80ee59dc91e77c10"
  elsif OS.linux?
    url "https://github.com/timeworthymedia/ikmal-editor/releases/download/v0.9.0-beta/ikmal-editor-v0.9.0-beta-linux-amd64.tar.gz"
    sha256 "cc88134b0359537e3ed26807d267e738859df58e3380858470a0ba043a720d44"
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
