class IkmalEditor < Formula
  desc "Standalone LanguageTool manager, background service supervisor, and app auto-configurator"
  homepage "https://github.com/timeworthymedia/ikmal-editor"
  version "0.9.0-beta"
  license "MIT"

  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/timeworthymedia/ikmal-editor/releases/download/v0.9.0-beta/ikmal-editor-v0.9.0-beta-darwin-arm64.tar.gz"
    sha256 "1bbdb0bbbacd37a0904c379e58634f6facfbd7687df87b0cc9af03a57cc7dfef"
  elsif OS.mac? && Hardware::CPU.intel?
    url "https://github.com/timeworthymedia/ikmal-editor/releases/download/v0.9.0-beta/ikmal-editor-v0.9.0-beta-darwin-amd64.tar.gz"
    sha256 "5622db34623f29ec1e1d95966a555ae672885a6d072ac3514e7f47791acbdc56"
  elsif OS.linux?
    url "https://github.com/timeworthymedia/ikmal-editor/releases/download/v0.9.0-beta/ikmal-editor-v0.9.0-beta-linux-amd64.tar.gz"
    sha256 "1af0110816d060586541ad668318345042df785911a89d4e164d0a5b389686fa"
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
