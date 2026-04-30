# 5421 Enjoy組團結日 #03 — 熱量大罷工

一個用於追蹤跑步活動里程與卡路里的網站，支援 Firebase 即時同步，部署於 GitHub Pages。

---

## 🚀 部署步驟

### 1. 建立 Firebase 專案

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 點「新增專案」→ 輸入名稱（例如 `bogoto-running-bank`）
3. 建立完成後，點「網頁應用程式」(</>) 圖示
4. 取得您的 `firebaseConfig` 設定物件

### 2. 啟用 Firestore

1. 在 Firebase Console 左側選單 → **Firestore Database**
2. 點「建立資料庫」→ 選「**測試模式**」（或設定規則）
3. 選擇地區後確認

### 3. 設定 Firestore 安全規則（建議）

在 Firestore → 規則 → 貼上以下內容：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // 測試用，上線請改為更嚴格的規則
    }
  }
}
```

### 4. 填入 Firebase 設定

打開 `app.js`，將第 7-15 行的 `firebaseConfig` 替換成您的設定：

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### 5. 修改組員名單

在 `app.js` 第 26-29 行找到 `ALL_MEMBERS` 陣列，替換成您的組員名單：

```js
const ALL_MEMBERS = [
  "組員A", "組員B", "組員C", ...
];
```

### 6. 部署到 GitHub Pages

```bash
# 1. 建立新的 GitHub Repository（例如：bogoto-running-bank）
# 2. 初始化並推送
git init
git add .
git commit -m "init: 熱量大罷工網站"
git remote add origin https://github.com/YOUR_USERNAME/bogoto-running-bank.git
git push -u origin main

# 3. 在 GitHub → Settings → Pages
#    Source: Deploy from branch → main → / (root)
#    儲存後等約 1 分鐘即可訪問
```

---

## 📋 功能說明

| 功能 | 說明 |
|------|------|
| 🌡️ 熱量進度條 | 即時顯示全組消耗大卡 / 5000 大卡目標 |
| 活動報名 Tab | 選取組員 + 填入預計里程，自動計算預計大卡 |
| 里程回報 Tab | 選取已報名組員 + 填入實際里程，即時更新全組大卡 |
| 成員列表 | 顯示所有成員里程與大卡，可編輯/刪除 |
| Firebase 同步 | 所有資料即時同步，多人同時操作不衝突 |

## 🔢 熱量計算公式

- 跑 5K = 350 大卡（基準）
- 每多跑 1K = 加 70 大卡
- 進位規則：小數點 > 0.11 進位（例如 5.12K 視為 6K）

---

## 📁 檔案結構

```
├── index.html   # 主頁面
├── style.css    # 樣式
├── app.js       # 邏輯 + Firebase 連線
└── README.md    # 說明文件
```

---

## 🔄 下次活動更新方式

只需修改 `app.js` 中的：
- `EVENT_ID`：改為新活動 ID（例如 `event04`）以隔離資料
- `TARGET_KCAL`：修改目標大卡
- `ALL_MEMBERS`：更新組員名單
- `index.html` 中的活動標題文字
