# Supabase Auth ＆ チーム別完全分離（v2）移行ガイド

本ドキュメントは、**「完全無料のまま、GitHubが公開状態でも突破されない最高強度のセキュリティ」** を実現するための手順書です。

---

## 1. 今回実施した改修内容の概要

| 項目 | 従来の方式（課題） | 今回の方式（新仕様） |
| :--- | :--- | :--- |
| **ログイン照合** | ブラウザ側（クライアント）でハッシュ照合 | **Supabase Auth（サーバー側）で安全に照合** |
| **ユーザーID** | メールアドレスのみ | **従来のID（メール以外も可）のまま移行・利用可能** |
| **データ分離** | クライアント側でフィルター（API直接呼び出しで他チーム取得可能） | **データベース（PostgreSQL RLS）でチーム別に物理遮断** |
| **管理者機能** | ブラウザからDBの1行を直接上書き | **Vercel サーバーレス関数（/api/admin/users）経由で実行** |
| **パスワード保護** | クラウド上に暗号化ハッシュ保存 | **Supabase Auth 内部で bcrypt/Argon2 等の強固な暗号化** |

---

## 2. 移行手順（ステップ・バイ・ステップ）

作業は **Supabase での SQL 実行** と **Vercel での環境変数設定** の2点のみです。

### ステップ 1: Supabase でデータベース構造の更新
1. [Supabase ダッシュボード](https://supabase.com/dashboard) にログインし、対象プロジェクトを選択します。
2. 左メニューの **「SQL Editor」** をクリックします。
3. **「New query」** を押し、プロジェクト内の [supabase/migration_v2_auth_and_rls.sql](file:///Users/ento/baseball-analyzer/supabase/migration_v2_auth_and_rls.sql) の内容をすべて貼り付けます。
4. 右下の **「Run」** ボタンを押して実行します。
5. テーブル一覧とポリシー一覧が表示されれば完了です。

### ステップ 2: Vercel に `SUPABASE_SERVICE_ROLE_KEY` を設定
管理者の操作（ユーザー追加、停止、一時パスワード発行など）を Vercel サーバー経由で安全に行うために、Vercel に秘密鍵（service_role key）を設定します。

1. **Supabase 側でキーをコピー**:
   - Supabase ダッシュボード > 左メニュー下の **「Project Settings（歯車アイコン）」** > **「API」** を開きます。
   - `Project API keys` 欄にある **`service_role` (secret)** の「Reveal」を押してキーをコピーします。
   *(※このキーは絶対に公開リポジトリやブラウザに載せないでください)*

2. **Vercel 側で環境変数を登録**:
   - [Vercel ダッシュボード](https://vercel.com/dashboard) を開きます。
   - `baseball-analyzer-hitting` プロジェクトを選択し、上部メニューの **「Settings」** > **「Environment Variables」** を開きます。
   - 以下の変数を追加します：
     - **Key**: `SUPABASE_SERVICE_ROLE_KEY`
     - **Value**: （先ほどコピーした service_role キー）
   - 「Save」を押します。
   - 次回のデプロイ（または git push）から有効になります。

---

## 3. 既存アカウントの移行 ＆ パスワードリセット手順

1. 管理者アカウントで [Baseball Analyzer](https://baseball-analyzer-hitting.vercel.app) の **「管理者パネル」** を開きます。
2. 画面上部にある緑色の **「旧アカウントをSupabase Authへ移行」** ボタンをクリックします。
3. これまで登録されていたアカウントがすべて Supabase Auth の正式ユーザーおよび `profiles` テーブルへ自動移行されます。
4. 移行された各アカウントには、安全のため **初期一時パスワード** が割り当てられます。
5. 各チーム・利用者は、発行された一時パスワードでログインすると自動的に **「新しいパスワードの設定」** 画面が表示され、各自が自分だけの新パスワードを設定して運用開始できます。

---

## 4. セキュリティ保証
この改修により：
- GitHub のリポジトリが誰でも閲覧できる公開状態（Public）であっても、Supabase の API キー（anon key）が悪用されて他チームのデータが盗み見られることは一切ありません。
- パスワード照合や管理者権限の操作は Vercel のバックエンド（サーバーレス関数）で安全に検証されます。
- すべての通信と機能は、Vercel および Supabase の無料枠（Free Tier / Hobby Plan）の範囲内で永久に無料のまま運用できます。
