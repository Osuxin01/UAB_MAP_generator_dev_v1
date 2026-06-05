# UAB Map Generator

UAB向けの2Dマップをブラウザ上で自動生成・編集できるUIツールです。

## 主な機能

- バリケード自動生成
- マップ傾向設定
- 設定一致度の表示
- バリケード編集モード
- 0.5m単位の移動
- 15度単位の回転
- バリケード追加・削除
- PNG保存
- スマホ対応UI

## ローカル起動

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
```

## Vercel公開設定

- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

詳しい手順は `VERCEL_DEPLOY.md` を参照してください。
