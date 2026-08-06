// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "IkmalSpellServer",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "ikmal-spellserver", targets: ["IkmalSpellServer"]),
    ],
    targets: [
        .executableTarget(name: "IkmalSpellServer"),
        .testTarget(name: "IkmalSpellServerTests", dependencies: ["IkmalSpellServer"]),
    ]
)
