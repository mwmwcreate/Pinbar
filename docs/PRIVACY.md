# Pinbar プライバシーポリシー

最終更新日: 2026年7月1日

## 要点

Pinbarの開発者は、Pinbarを通じて個人情報、閲覧履歴、入力内容、利用状況、診断情報を収集・販売・共有しません。分析SDK、広告SDK、独自のトラッキング機能も組み込んでいません。

## Mac内に保存されるデータ

Pinbarは、次の情報を利用者のMac内に保存します。

- 利用者が追加したURL、表示名、ウィンドウサイズ、User-Agentなどの設定
- Webサイトごとに分離されたCookie、キャッシュ、ローカルストレージなどのログインセッション
- Webサイトから取得したfavicon

これらはPinbarの開発者へ送信されません。サイトを削除すると、そのサイト用に保存されたセッションデータもMacから削除されます。アプリを削除しただけではmacOSのApplication Support領域にデータが残る場合があります。

## Webサイトとの通信

Pinbarは、利用者が指定したWebサイトを表示するためにインターネットへ接続します。表示先のWebサイトは、そのサイト自身のプライバシーポリシーに従ってデータを取得・処理する場合があります。Pinbarの開発者は、利用者が追加した第三者サイトの運営者ではなく、そのデータ処理を管理しません。

カメラ、マイク、画面共有、通知、位置情報へのアクセスは、Webサイトが要求した際にPinbarまたはmacOSが利用者へ確認します。

## お問い合わせ

本ポリシーに関する問い合わせは、`yuta.apple.405@icloud.com` または [GitHub Issues](https://github.com/mwmwcreate/Pinbar/issues) へお寄せください。セキュリティ上の問題は公開Issueに詳細を書かず、メールでご連絡ください。

---

## English summary

The Pinbar developer does not collect, sell, or share personal data, browsing history, entered content, usage analytics, or diagnostics through Pinbar. Site settings and isolated browsing sessions are stored locally on the user's Mac. Websites chosen by the user may process data under their own privacy policies. Permission-sensitive features are presented to the user by Pinbar or macOS when requested.
