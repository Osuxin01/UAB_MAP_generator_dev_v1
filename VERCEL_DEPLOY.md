# Vercel公開手順

このプロジェクトはUI版のReact/ViteアプリとしてVercelに公開できます。

## 1. 事前確認

ローカルでビルドできることを確認します。

```bash
npm install
npm run build
```

## 2. GitHubにpush

VercelはGitHubリポジトリと連携して公開するのが簡単です。

```bash
git add .
git commit -m "Prepare Vercel deployment"
git push
```

## 3. Vercelで公開

1. Vercelにログイン
2. `Add New Project` を選択
3. GitHubリポジトリを選択
4. Framework Preset が `Vite` になっていることを確認
5. Build Command が `npm run build` になっていることを確認
6. Output Directory が `dist` になっていることを確認
7. `Deploy` を押す

## 4. 公開後

Vercelが公開URLを発行します。

例:

```text
https://your-project-name.vercel.app
```

以後はGitHubにpushすると、Vercelが自動で再デプロイします。
