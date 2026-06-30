# Security Policy

## Reporting a vulnerability

脆弱性を見つけた場合は、公開Issueには詳細を書かず、
`yuta.apple.405@icloud.com` まで再現手順と影響範囲を送ってください。

Pinbarは外部サイトをNode.js無効・Context Isolation有効・Chromium Sandbox有効の
WebContentsで開きます。WebサイトにElectronやローカルファイルのAPIは公開しません。
