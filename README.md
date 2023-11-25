# pixiv-downloader
[pixiv](https://www.pixiv.net/)のブックマークから画像と小説をダウンロードする

# usage
```
$ deno task start
```
## 事前準備(一回目のみ)
1. `.env`にREFRESH_TOKENを記載する  
```
REFRESH_TOKEN="<あなたのpixivアカウントのリフレッシュトークン>"
```
リフレッシュトークンは https://gist.github.com/ZipFile/c9ebedb224406f4f11845ab700124362 か https://gist.github.com/upbit/6edda27cb1644e94183291109b8a5fde を参考にして取得します

2. `config.json`に設定を書く
```
{
    "illustSavePath":"./pic",
    "novelSavePath":"./novel",
    "targetUserID":"<あなたのpixivアカウントのユーザーID>"
}
```
ユーザーIDはユーザーページを開いたときのURL https://www.pixiv.net/users/<ユーザID> の <ユーザID> の部分の数字です

3. `sqlite3.db`を用意します
```
$ sqlite3 sqlite3.db

sqlite>
CREATE TABLE IF NOT EXISTS illust (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT,
    user_account TEXT,
    user_id INTEGER,
    type TEXT,
    illust_id INTEGER,
    illust_title TEXT,
    media_url TEXT,
    file_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS novel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT,
    user_account TEXT,
    user_id INTEGER,
    type TEXT,
    series_id INTEGER,
    series_title TEXT,
    novel_id INTEGER,
    novel_title TEXT,
    novel_caption TEXT,
    tags TEXT,
    media_url TEXT,
    page_count INTEGER,
    file_name TEXT,
    create_date DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
4. 実行します
```
$ deno task start
```

---
npm:@book000/pixivtsを使っています  
[API Document](https://book000.github.io/pixivts/index.html)