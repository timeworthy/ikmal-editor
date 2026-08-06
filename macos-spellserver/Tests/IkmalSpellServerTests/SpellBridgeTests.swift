import Foundation
import XCTest
@testable import IkmalSpellServer

final class SpellBridgeTests: XCTestCase {
    func testBoundedTextUsesUTF16Limit() {
        let value = String(repeating: "a", count: 12) + " 🌿"
        let bounded = LocalCheckerClient.boundedText(value, maximumUTF16Length: 12)
        XCTAssertEqual((bounded as NSString).length, 12)
        XCTAssertEqual(bounded, String(repeating: "a", count: 12))
    }

    func testBoundedTextNeverSplitsSurrogatePair() {
        let bounded = LocalCheckerClient.boundedText("abc 🌿", maximumUTF16Length: 5)
        XCTAssertEqual(bounded, "abc ")
        XCTAssertEqual((bounded as NSString).length, 4)
    }

    func testFindingsAddSpellServerOffsetAndRejectOutOfBounds() throws {
        let data = #"{"message":"Use are","replacements":[{"value":"are"}],"offset":2,"length":2}"#.data(using: .utf8)!
        let match = try JSONDecoder().decode(ProxyMatch.self, from: data)
        let findings = LocalCheckerClient.findings(from: [match], baseOffset: 7, sourceUTF16Length: 8)
        XCTAssertEqual(findings, [SpellFinding(range: NSRange(location: 9, length: 2), message: "Use are", replacements: [SpellReplacement(value: "are")])])

        let invalid = ProxyMatch(message: "bad", replacements: [], offset: 7, length: 4)
        XCTAssertTrue(LocalCheckerClient.findings(from: [invalid], baseOffset: 0, sourceUTF16Length: 8).isEmpty)
    }
}
