# Pinbar

Pinbarは、好きなWebサイトをURLごとに1つのアイコンとしてmacOSのメニューバーへ固定するアプリです。アイコンをクリックすると、その真下からサイト専用のポップオーバーが開きます。

## 主な機能

- 1 URLにつき1つのメニューバーアイコン（アプリ側の個数制限なし）
- サイトごとに独立したCookie・キャッシュ・ログインセッション
- ノッチ付きポップオーバー、4つのサイズプリセット、ドラッグによる自由なリサイズ
- favicon、未読表示、ピン留め、切り離し表示、アドレスバー
- Mac・iPhone・iPad・Android・カスタムUser-Agent
- OAuth/SSOや新規ウィンドウ要求を同じサイトセッション内で継続
- カメラ・マイク・通知・位置情報などの明示的な権限確認
- ライト／ダークモード、キーボード操作、ログイン時起動

## 開発

必要環境はmacOS 13以降とNode.js 22以降です。

```bash
npm ci
npm run verify
npm start
```

通常の未署名macOSビルドは次のコマンドで作成します。

```bash
npm run build
npm run dist
```

## Mac App Storeビルド

Mac App Store版はApp Sandboxを有効にし、ElectronのMASランタイムを使います。署名を行わない構造確認は次で実行できます。

```bash
npm run build:mas:unsigned
```

提出用ビルドには、Bundle ID `com.yuta.pinbar` とApp Group `BZ5UXHD4A4.com.yuta.pinbar` を含むMac App Store用プロビジョニングプロファイル、および配布用アプリ／インストーラ証明書が必要です。

```bash
MAS_PROVISIONING_PROFILE="/absolute/path/Pinbar.provisionprofile" npm run dist:mas
```

詳しい作成・検証・提出手順は [App Store提出ガイド](docs/APP_STORE_SUBMISSION.md) を参照してください。

## データとセキュリティ

追加したサイト一覧と各サイトのセッションはElectronの `userData` ディレクトリ内に保存されます。外部サイトはNode.js無効、Context Isolation有効、Chromium Sandbox有効の領域で実行され、Electron APIやローカルファイルAPIにはアクセスできません。

Pinbar自身は分析SDKを含まず、閲覧履歴や利用状況を収集・送信しません。詳細は [プライバシーポリシー](docs/PRIVACY.md) と [セキュリティポリシー](SECURITY.md) を参照してください。

## ショートカット

| キー | 操作 |
| --- | --- |
| `Option + X` | 最後に使ったサイトを表示・非表示 |
| `Command + N` | サイト追加・管理 |
| `Command + W` | ウィンドウを隠す |
| `Command + L` | アドレスバーを表示してフォーカス |
| `Command + R` | 再読み込み |
| `Command + Shift + R` | キャッシュを無視して再読み込み |
| `Command + Shift + B` | アドレスバー表示・非表示 |
| `Command + Shift + P` | ピン留め・解除 |
| `Command + Shift + D` | 切り離し・再接続 |
| `Command + Shift + O` | 通常ブラウザで開く |
| `Command + + / - / 0` | ズーム |

macOSのメニューバーに収まる物理的なアイコン数は画面幅やノッチに依存します。

## ライセンス

[MIT License](LICENSE)
