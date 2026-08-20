# ikmal editor — Thunderbird compose adapter

This dedicated MailExtension checks only the compose body. It projects the
editable HTML body to text, excludes quoted history and signature blocks by
default, and applies replacements through Thunderbird's compose API. The
compose popup owns endpoint, language, and quoted-history settings; the
background script owns the loopback request and Apply operation.

The generic browser content script is deliberately not used for mail compose
windows.
