import Foundation

public struct SpellReplacement: Equatable {
    public let value: String

    public init(value: String) {
        self.value = value
    }
}

public struct SpellFinding: Equatable {
    public let range: NSRange
    public let message: String
    public let replacements: [SpellReplacement]

    public init(range: NSRange, message: String, replacements: [SpellReplacement] = []) {
        self.range = range
        self.message = message
        self.replacements = replacements
    }
}

struct ProxyReplacement: Decodable {
    let value: String
}

struct ProxyMatch: Decodable {
    let message: String
    let replacements: [ProxyReplacement]
    let offset: Int
    let length: Int
}

struct ProxyResponse: Decodable {
    let matches: [ProxyMatch]
}

public enum SpellBridgeError: Error, Equatable {
    case invalidResponse
    case requestFailed
    case responseTooLarge
}

public final class LocalCheckerClient {
    public static let defaultEndpoint = URL(string: "http://127.0.0.1:8096/v2/check")!
    public static let maximumUTF16Length = 8_000

    private let endpoint: URL
    private let timeout: TimeInterval
    private let session: URLSession

    public init(endpoint: URL = LocalCheckerClient.defaultEndpoint, timeout: TimeInterval = 1.5, session: URLSession = .shared) {
        self.endpoint = endpoint
        self.timeout = timeout
        self.session = session
    }

    public func check(_ text: String, offset: Int = 0) throws -> [SpellFinding] {
        let bounded = Self.boundedText(text, maximumUTF16Length: Self.maximumUTF16Length)
        guard !bounded.isEmpty else { return [] }

        var request = URLRequest(url: endpoint, timeoutInterval: timeout)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "text", value: bounded),
            URLQueryItem(name: "language", value: "en-US"),
            URLQueryItem(name: "enabledOnly", value: "false"),
        ]
        request.httpBody = components.percentEncodedQuery?.data(using: .utf8)

        let semaphore = DispatchSemaphore(value: 0)
        var result: Result<(Data, URLResponse), Error>?
        let task = session.dataTask(with: request) { data, response, error in
            if let error {
                result = .failure(error)
            } else if let data, let response {
                result = .success((data, response))
            } else {
                result = .failure(SpellBridgeError.requestFailed)
            }
            semaphore.signal()
        }
        task.resume()
        if semaphore.wait(timeout: .now() + timeout) == .timedOut {
            task.cancel()
            throw SpellBridgeError.requestFailed
        }

        guard let result else { throw SpellBridgeError.requestFailed }
        let (data, response) = try result.get()
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SpellBridgeError.invalidResponse
        }
        guard data.count <= 2_000_000 else { throw SpellBridgeError.responseTooLarge }
        let decoded = try JSONDecoder().decode(ProxyResponse.self, from: data)
        return Self.findings(from: decoded.matches, baseOffset: offset, sourceUTF16Length: (bounded as NSString).length)
    }

    public static func boundedText(_ text: String, maximumUTF16Length: Int) -> String {
        guard maximumUTF16Length > 0 else { return "" }
        let source = text as NSString
        guard source.length > maximumUTF16Length else { return text }
        var safeLength = maximumUTF16Length
        let lastUnit = source.character(at: safeLength - 1)
        if (0xD800...0xDBFF).contains(lastUnit) {
            safeLength -= 1
        }
        return source.substring(to: safeLength)
    }

    static func findings(from matches: [ProxyMatch], baseOffset: Int, sourceUTF16Length: Int) -> [SpellFinding] {
        matches.compactMap { match in
            guard match.offset >= 0, match.length > 0, match.offset + match.length <= sourceUTF16Length else { return nil }
            let range = NSRange(location: baseOffset + match.offset, length: match.length)
            return SpellFinding(
                range: range,
                message: match.message,
                replacements: match.replacements.map { SpellReplacement(value: $0.value) }
            )
        }
    }
}
