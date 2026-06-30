# Mac App Store 提出ガイド

このリポジトリには、App Sandbox、MAS用Electronランタイム、権限文言、entitlements、提出用メタデータの雛形まで含まれています。証明書、プロビジョニングプロファイル、App Store Connect上のアプリレコードはApple Developerアカウントに紐づくため、リポジトリには含めません。

## 1. Apple Developerで作成するもの

1. macOS App IDをBundle ID `com.yuta.pinbar` で登録する。
2. App Group `BZ5UXHD4A4.com.yuta.pinbar` を登録し、App IDへ関連付ける。
3. App Sandboxを有効にしたMac App Store Distribution用プロビジョニングプロファイルを作る。
4. キーチェーンへ配布用アプリ証明書とMac Installer Distribution証明書を入れる。
5. App Store ConnectでmacOSアプリ「Pinbar」を作り、Bundle IDを選択する。

証明書やプロファイルはGitへ追加しないでください。`.gitignore` で一般的な拡張子を除外しています。

## 2. ローカル検証

```bash
npm ci
npm run verify
plutil -lint build/entitlements.mas.plist
plutil -lint build/entitlements.mas.inherit.plist
npm run build:mas:unsigned
```

`build:mas:unsigned` はMASランタイムでパッケージできることを調べる構造確認です。未署名成果物は提出できません。

## 3. 署名済み提出パッケージ

```bash
MAS_PROVISIONING_PROFILE="/absolute/path/Pinbar.provisionprofile" npm run dist:mas
```

生成後に確認します。

```bash
codesign --verify --deep --strict --verbose=2 "dist/mas-arm64/Pinbar.app"
codesign -d --entitlements :- "dist/mas-arm64/Pinbar.app"
pkgutil --check-signature "dist/Pinbar-1.0.0-arm64.pkg"
```

Apple SiliconとIntelの両方へ配布する場合は、App Store Connectで複数アーキテクチャのビルドを扱うか、ElectronのUniversalビルドを別途検証します。最初の提出では、実機で確実に検証できるApple Silicon版から始めるのが安全です。

## 4. App Store Connect

1. [APP_STORE_METADATA.md](APP_STORE_METADATA.md) を基に説明、キーワード、サポートURL、プライバシーURLを入力する。
2. 「無制限のWebアクセス」を含め、年齢レーティング質問へ実態どおり回答する。
3. App Privacyは開発者が収集するデータを基準に回答し、第三者サイトには各サイトの方針が適用される旨を説明する。
4. Review Notesへ、Dockではなくメニューバーの「＋」から操作することと、アカウント不要の確認手順を記載する。
5. Transporterで生成した `.pkg` をアップロードし、処理完了後にビルドを選択する。

## 5. リリース前チェック

- 新規macOSユーザー環境で初回起動時に「＋」が表示される
- URL追加、削除、再起動後の復元が動く
- OAuth/SSOログインで別の通常ウィンドウが残らない
- カメラ、マイク、通知、位置情報を許可／拒否できる
- ライト／ダークモードと複数ディスプレイでポップオーバー位置が正しい
- ネットワーク切断時や不正URLでクラッシュしない
- すべてのスクリーンショットと説明が最終ビルドと一致する
- Privacy PolicyとSupport URLがログアウト状態のブラウザから閲覧できる
