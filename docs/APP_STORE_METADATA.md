# App Store metadata draft

## 日本語

**名前:** Pinbar

**サブタイトル:** Webサイトをメニューバーに固定

**カテゴリ:** 仕事効率化

**プロモーションテキスト:** よく使うWebサイトを、サイトごとのアイコンとログイン状態のままメニューバーへ。クリックひとつで必要な場所に戻れます。

**説明:**

Pinbarは、好きなWebサイトをmacOSのメニューバーへ固定するためのブラウザユーティリティです。

URLを追加すると、サイト専用のアイコンがメニューバーに現れます。アイコンをクリックすると、そのすぐ下から専用のポップオーバーが開きます。Slack、カレンダー、タスク管理、ダッシュボードなど、毎日確認するページを通常のブラウザから切り離して整理できます。

主な機能:

- URLごとに独立したメニューバーアイコン
- サイトごとに分離されたログインセッション
- プリセットとドラッグ操作によるウィンドウサイズ変更
- favicon、未読表示、ピン留め、切り離し表示
- デスクトップ／モバイルUser-Agent切替
- OAuth・SSOログインを同じサイト領域で継続
- カメラ、マイク、通知などの権限確認
- ライト／ダークモードとキーボードショートカット

Pinbar自身は閲覧履歴や利用状況を収集しません。追加したサイトとログイン状態は、このMac内に保存されます。

**キーワード案:** メニューバー,ブラウザ,Web,サイト,固定,仕事効率化,ポップオーバー,ショートカット

**サポートURL:** https://github.com/mwmwcreate/Pinbar/issues

**プライバシーポリシーURL:** https://github.com/mwmwcreate/Pinbar/blob/main/docs/PRIVACY.md

## Review notes

Pinbar is a menu-bar-only macOS app (`LSUIElement`). After launch, a plus icon appears in the macOS menu bar; no Dock icon is shown.

1. Click the plus icon in the menu bar.
2. Enter `https://example.com` and click “固定”.
3. A new icon appears in the menu bar for that URL.
4. Click the new icon to open the website in an attached popover.
5. Resize it by dragging an edge, or select a preset from the icon's context menu.

No Pinbar account is required. Third-party sites may require their own accounts. Each URL receives an isolated persistent browser session. New-window authentication requests are kept inside the same site session.

The app requires outbound network access because its core purpose is to display user-selected websites. Camera, microphone, notifications, display capture, and location are requested only when the currently displayed website asks for them.

## 提出時の回答メモ

- 年齢レーティング: 任意URLを表示できるため「無制限のWebアクセス」を正直に申告する
- App Privacy: 開発者によるデータ収集なし。利用者が選んだ第三者サイトの処理は各サイトの方針に従う
- 暗号化: 独自暗号は実装せず、OS/Electronの標準HTTPSのみ。輸出コンプライアンス画面で免除対象として回答
- コンテンツ権利: 第三者コンテンツを同梱せず、利用者が自分でURLを指定する
- スクリーンショット: 第三者の商標・個人情報を避け、公開デモサイトまたは許諾済みページを使う
