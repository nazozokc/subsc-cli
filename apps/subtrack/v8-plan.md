# v8.0.0 Implementation Plan

## Feature 1: `subtrack notify` — Desktop notification for upcoming bills

### Files
| File | Action |
|---|---|
| `src/notify.ts` | New — CLI handler + notification logic |
| `src/config.ts` | Modify — add `notifyDays` to CONFIG_KEYS |
| `src/types.ts` | Modify — add `notifyDays` to SubtrackConfig |
| `src/index.ts` | Modify — register `notify` subCommands |
| `src/commands.ts` | Modify — add `handleNotify` export |
| `package.json` | Modify — add `node-notifier` dependency |

### API
```
subtrack notify                   # 7日以内の請求を通知 (default)
subtrack notify --days 3          # 指定日数以内
subtrack notify --dry-run         # 内容だけ表示、通知は送らない
subtrack notify --json            # JSON出力（通知なし）
```

### Implementation
1. `src/notify.ts`:
   - `handleNotify(options: { days?: number; dryRun?: boolean; json?: boolean })`
   - `calcUpcoming()` を流用して近々の請求を取得
   - `--json` → `process.stdout.write`（notify不要）
   - `--dry-run` → `consola.log` で一覧表示（notify不要）
   - デフォルト → `node-notifier` でOS通知を送信
   - 通知内容: 件名「subtrack: N upcoming bills」 + 各サブ名と金額（最大5件まで）
2. `config.ts`:
   - `notifyDays` キー追加（デフォルト7）
   - `CONFIG_KEYS` に追加
3. `types.ts`:
   - `SubtrackConfig.notifyDays: number` 追加
4. `index.ts`:
   - `notifyCommand` 定義。サブコマンドなしの単一コマンド
5. `commands.ts`:
   - `handleNotify` export → `import { handleNotify } from "./notify.ts"`

### Key decisions
- `node-notifier` は optional dependency? → No, 使うなら必須。ただしnpmサイズは小さい。
- Linux: `notify-send`, macOS: `terminal-notifier`, Windows: native toast
- ランタイムがNode.jsなので `node-notifier` のGrowl/Notification Center対応をそのまま使う
- `--cron` フラグは省く — exit codeで判定するより `--dry-run` で自分でcronジョブを組むのがsubtrackらしい

---

## Feature 2: Price change history (`subtrack history`)

### Files
| File | Action |
|---|---|
| `src/db.ts` | Modify — add `price_history` table, `writePriceHistory`, `getPriceHistory` |
| `src/history.ts` | New — CLI handler |
| `src/subscription.ts` | Modify — hook into `handleEdit` to detect price/currency changes |
| `src/index.ts` | Modify — register `history` command |
| `src/commands.ts` | Modify — re-export `handleHistory` |
| `src/tui/types.ts` | Modify — add `"history"` to Screen type, sidebar items |
| `src/tui/screens/history-screen.tsx` | New — TUI screen for price history |
| `src/tui/screen-router.tsx` | Modify — route `history` screen |
| `src/tui/components/command-bar.tsx` | Modify — add history hints |
| `src/tui/screens/detail.tsx` | Modify — add price history section |

### DB Schema
```sql
CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  old_price INTEGER,
  new_price INTEGER NOT NULL,
  old_currency TEXT,
  new_currency TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
)
```

### API
```
subtrack history <id>             # 特定サブの履歴
subtrack history <id> --json      # JSON出力
subtrack history --all            # 全サブの価格変更一覧
subtrack history --all --days 30  # 直近30日の変更のみ
```

### Implementation

**db.ts:**
- `runMigrations` に `price_history` テーブル作成を追加
- `writePriceHistory(id, oldFields, newFields)` — `updateSubscription` から呼ばれる
  - priceかcurrencyが変わったときだけINSERT
  - `old_price`, `old_currency` は現在の値を保存 / `new_*` は新しい値
- `getPriceHistory(subId): PriceHistoryEntry[]` — id降順で取得
- `getAllPriceChanges(days?: number): PriceHistoryEntry[]` — 全サブの変更
- 型 `PriceHistoryEntry { id, subscriptionId, name, oldPrice, newPrice, oldCurrency, newCurrency, changedAt }`

**subscription.ts (`handleEdit`):**
- `updateSubscription` を呼ぶ前に現在の `sub.price` と `sub.currency` を保持
- `updateSubscription` の後、変更があったら `writePriceHistory` を呼ぶ
- 注意: `updateSubscription` はDBのトランザクション内で動くので、履歴書き込みはその後に行う

**history.ts:**
- `handleHistory(id?, options: { json?, all?, days? })`
- `--all` モード: `getAllPriceChanges(days?)` → テーブル表示 or JSON
- ID指定: `getPriceHistory(id)` → 詳細表示 or JSON
- JSON: `process.stdout.write`

**TUI:**
- Screen type に `"history"` 追加
- サイドバーは追加しない（detail画面から辿る）
- `detail.tsx`: 既存の詳細ペイン下部に「Price History」セクション追加
  - 最新3件程度をインライン表示 + 「View all」リンク → history screenへ
- `history-screen.tsx`: price history専用画面（リスト + 詳細行）
- `Screen` 追加に伴う型の変更: `SCREEN_LABEL`, `SCREEN_TITLES`, `Screen` type

---

## Feature 3: TUI sort/filter/display enhancements

### Files
| File | Action |
|---|---|
| `src/tui/screens/list.tsx` | Modify — column visibility, inline filter UX, sort UX |
| `src/tui/context/app-context.tsx` | Modify — add `showTags`, `showNotes`, `showMethod` to state |
| `src/tui/keyboard.tsx` | Modify — add keybinds for column toggles |

### Changes

**1. Column visibility toggle**
- 新しい状態: `showTags: boolean`, `showNotes: boolean`, `showMethod: boolean` (AppStateに追加)
- デフォルト: 全部false（現状維持）
- キー: 
  - `_` (underscore) → tags列の表示/非表示トグル
  - `<` → notes列の表示/非表示トグル
  - `>` → method列の表示/非表示トグル
- アクション: `TOGGLE_COLUMN { column: "tags" | "notes" | "method" }`
- レンダリング: `list.tsx` のCOLUMNS配列を動的に構築
  - tags列: 非表示時もCOLUMNSから削除する（幅計算に含めない）
  - notes列: nameとtagsの間に挿入
  - method列: cycleとbillの間に挿入
- ヘッダー行に表示状態を示す薄いインジケータ（`[T]`, `[N]`, `[M]`）

**2. Sort UX improvements**
- `s` は今まで通りsort fieldをcyclic (name → price → cycle → status → id)
- `S` (shift+s) → sort direction toggle (今のSTATUS_TOGGLE → shift+Sは空いてる)
  - wait, `S` は今status cycle toggle (`subtrack status cycle`) に使われてる
  - 衝突を避ける: `s` でsort fieldを進めるのはそのまま。方向を変えたいときは `s` を押し続けて目的のfieldで止める。
  - あるいは: `Ctrl+s` で方向トグル（でもCtrl+sはターミナルでよく使われる）
  - → 結論: 今のままで良い。`s` が5 fieldを循環する → name → price → cycle → status → id → (ディレクション反転) name... 今はこの挙動。これで十分。
  - 細かい改善: 現在のsort fieldで2回目 `s` を押したら方向反転（今は1周してから反転）
  - `SET_SORT` アクション変更: 現在のfieldでもう一度押したら `sortDesc` を反転、異なるfieldならそっちに変更（今の挙動）

**3. Filter display**
- 現在filter中なら `state.filterText` の内容をタイトル行に表示（済み）
- 追加: filterがマッチしなかったとき「Esc or Ctrl+L to clear」のヒント（済み）
- 追加: filterヒット件数を表示 `"▶ query (3/10)"` （現在はヒット件数なし）

**4. 行の色分け改善**
- キャンセル済み: `dimColor` + 取り消し線 → 今は `pc.dim` 相当がない
- `status === "cancelled"` の行を `dimColor` で表示

### Order of changes (smallest → largest)
1. Column visibility state + reducers + keybinds ← **small**
2. Sort UX improvement (double-tap reverse) ← **trivial**
3. Filter hit count display ← **trivial**
4. Cancelled row dimming ← **trivial**
