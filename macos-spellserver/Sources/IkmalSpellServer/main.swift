import Foundation

final class IkmalSpellDelegate: NSObject, NSSpellServerDelegate {
    private let client: LocalCheckerClient

    init(client: LocalCheckerClient) {
        self.client = client
    }

    func spellServer(
        _ sender: NSSpellServer,
        check stringToCheck: String,
        offset: Int,
        types checkingTypes: NSTextCheckingTypes,
        options: [String: Any]?,
        orthography: NSOrthography?,
        wordCount: UnsafeMutablePointer<Int>
    ) -> [NSTextCheckingResult]? {
        wordCount.pointee = stringToCheck.split { $0.isWhitespace || $0.isNewline }.count
        let grammarType = NSTextCheckingResult.CheckingType.grammar.rawValue
        let spellingType = NSTextCheckingResult.CheckingType.spelling.rawValue
        guard (checkingTypes & grammarType) != 0 || (checkingTypes & spellingType) != 0 else { return nil }
        do {
            let findings = try client.check(stringToCheck, offset: offset)
            return findings.map { finding in
                let corrections = finding.replacements.map(\.value)
                var detail: [String: Any] = [
                    "NSGrammarRange": NSValue(range: finding.range),
                    "NSGrammarUserDescription": finding.message,
                ]
                if !corrections.isEmpty {
                    detail["NSGrammarCorrections"] = corrections
                }
                return NSTextCheckingResult.grammarCheckingResult(range: finding.range, details: [detail])
            }
        } catch {
            // A local service failure must leave the host editor usable.
            return nil
        }
    }
}

let endpoint = URL(string: ProcessInfo.processInfo.environment["IKMAL_SPELL_ENDPOINT"] ?? "http://127.0.0.1:8096/v2/check") ?? LocalCheckerClient.defaultEndpoint
let language = ProcessInfo.processInfo.environment["IKMAL_SPELL_LANGUAGE"] ?? "English"
let vendor = ProcessInfo.processInfo.environment["IKMAL_SPELL_VENDOR"] ?? "ikmal editor"
let server = NSSpellServer()
let delegate = IkmalSpellDelegate(client: LocalCheckerClient(endpoint: endpoint))
server.delegate = delegate
guard server.registerLanguage(language, byVendor: vendor) else {
    fputs("ikmal spell server could not register its language\n", stderr)
    exit(EXIT_FAILURE)
}
server.run()
