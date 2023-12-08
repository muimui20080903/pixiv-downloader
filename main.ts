import { load } from "https://deno.land/std@0.207.0/dotenv/mod.ts";
const env = await load();
import Pixiv, { BookmarkRestrict, PixivIllustItem, PixivNovelItem } from "npm:@book000/pixivts"
const refreshToken: string = env.REFRESH_TOKEN;
const client = await Pixiv.Pixiv.of(refreshToken);
import pixivImg from "npm:pixiv-img"
const config: {
  illustSavePath: string,
  illustRepeat: number,
  novelSavePath: string,
  novelRepeat: number,
  targetUserID: number
} = JSON.parse(await Deno.readTextFile("./config.json"))
const userId: number = config.targetUserID || Number(client.userId)
import { extname } from "https://deno.land/std@0.177.0/path/posix.ts"
import { Database } from "https://deno.land/x/sqlite3@0.10.0/mod.ts"
const db = new Database("sqlite3.db")

const main = async (): Promise<void> => {
  try {
    await illustDownload()
  } catch (error) {
    console.error(error)
  }
  try {
    await novelDonwload()
  } catch (error) {
    console.error(error)
  }
  console.log("保存終了")
  db.close()
}

type IllustData = {
  userName: string,
  userAccount: string,
  userID: number,
  type: "illust" | "manga" | "ugoira",
  id: number,
  title: string,
  url: string,
  fileName?: string,
}
const illustDownload = async () => {
  // ユーザーのイラストブックマークを取得
  let max_bookmark_id: number | undefined
  const illusts: PixivIllustItem[] = []
  for (let i = 0; i <= config.illustRepeat; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000))
    const response = await client.userBookmarksIllust({
      userId,
      restrict: BookmarkRestrict.PRIVATE,
      maxBookmarkId: max_bookmark_id
    })
    illusts.push(...response.data.illusts)
    const next_url: string = response.data.next_url ?? ""
    max_bookmark_id = Number(Pixiv.Pixiv.parseQueryString(next_url).max_bookmark_id)
  }
  const illustDataArray: IllustData[] = illusts.flatMap((illust) => {
    const lisults: IllustData[] = []
    const findMetaData = (url: string, index: number) => {
      const illustData: IllustData = {
        userName: illust.user.name,
        userAccount: illust.user.account,
        userID: illust.user.id,
        type: illust.type,
        id: illust.id,
        title: illust.title,
        url,
      }
      const ext: string = extname(illustData.url)
      const fileName = `${illustData.userAccount}-${illustData.id}-${index}${ext}`
      illustData.fileName = fileName
      lisults.push(illustData)
    }
    if (illust.page_count === 1) {
      findMetaData(illust.meta_single_page.original_image_url, 0)
    } else {
      illust.meta_pages.forEach((meta_pages, index) => {
        findMetaData(meta_pages.image_urls.original, index)
      })
    }
    return lisults;
  })
  // SQLと照合して新規のものだけを抽出
  const saveData: IllustData[] = []
  for await (const illustData of illustDataArray) {
    const isNewData = await checkSQL<IllustData>(illustData)
    if (isNewData) {
      saveData.push(illustData)
    }
  }

  // なにやってんだここ
  const newData: IllustData[] = saveData.filter((illustData) => illustData !== null);

  newData.forEach((illustData) => {
    pixivImg(illustData.url, config.illustSavePath + "/" + illustData.fileName)
      .then(() => {
        // console.log(output);
        console.log(`Saved image:${illustData.title}`)
      })
      .catch((error: Error) => {
        console.error(error)
      })
  })
}

type NovelData = {
  userName: string,
  userAccount: string,
  userID: number,
  type: "novel",
  seriesID: number | string | undefined,
  seriesTitle: string | undefined,
  create_date: string,
  id: number,
  title: string,
  caption: string,
  tags: string[],
  url: string,
  pageCount: number,
  fileName?: string,
}
const novelDonwload = async (): Promise<void> => {
  // ユーザーのノベルブックマークを取得
  let max_bookmark_id
  const novels: PixivNovelItem[] = []
  for (let i = 0; i <= config.novelRepeat; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000))
    const response = await client.userBookmarksNovel({
      userId,
      restrict: BookmarkRestrict.PRIVATE,
      maxBookmarkId: max_bookmark_id
    })
    novels.push(...response.data.novels)
    const next_url: string = response.data.next_url ?? ""
    max_bookmark_id = Number(Pixiv.Pixiv.parseQueryString(next_url).max_bookmark_id)
  }
  const novelDataArray: NovelData[] = novels.map((novel) => {
    const tags: string[] = novel.tags.map((tag) => tag.name)
    // ファイル名は255バイト以内にする
    let fileName = `${novel.user.account}-${novel.title}`
    // Convert the string to UTF-8 bytes
    const utf8Bytes = new TextEncoder().encode(fileName)
    // Check if the byte length exceeds 255
    if (utf8Bytes.length > 255) {
      // Truncate the string to fit within 255 bytes
      const truncatedBytes = utf8Bytes.slice(0, 245)
      // Convert the truncated bytes back to a string
      fileName = new TextDecoder().decode(truncatedBytes)
    }
    const novelData: NovelData = {
      userName: novel.user.name,
      userAccount: novel.user.account,
      userID: novel.user.id,
      type: "novel",
      seriesID: novel.series.id,
      seriesTitle: novel.series.title,
      create_date: novel.create_date,
      id: novel.id,
      title: novel.title,
      caption: novel.caption,
      tags: tags,
      url: novel.image_urls.large,
      pageCount: novel.page_count,
      fileName: fileName,
      // text: response.data.novel_text.length,
    }
    if (novelData.seriesID === undefined) novelData.seriesID = "シリーズなし"
    if (novelData.seriesTitle === undefined) novelData.seriesTitle = "シリーズなし"
    return novelData;
  })
  // SQLと照合して新規のものだけを抽出
  const saveData: NovelData[] = []
  for await (const novelData of novelDataArray) {
    const isNewData = checkSQL<NovelData>(novelData)
    if (isNewData) {
      saveData.push(novelData)
    }
  }

  // 新規データのテキストを取得
  for await (const novelData of saveData) {
    // APIを叩くので1秒待つ
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const TextResponse = await client.novelText({ novelId: novelData.id })
    const text: string = TextResponse.data.novel_text
    const captionText: string = novelData.caption.replace(/<br \/>/g, '\n').replace(/<[^>]*>/g, '');
    // データを整形
    const textData = `title:${novelData.title}
author:${novelData.userName}
seriesTitle:${novelData.seriesTitle}
caption:${captionText}
tags:[${novelData.tags}]

--------------------
${text}`;

    const textPath: string = config.novelSavePath + "/" + novelData.fileName + ".txt";
    // テキストを保存
    Deno.writeTextFile(textPath, textData)
      .then(() => {
        console.log(`Saved text:${novelData.title}`)
      })
    // 画像を保存 img_urlがある場合のみ
    if (novelData.url) {
      const ext: string = extname(novelData.url);
      pixivImg(novelData.url, config.novelSavePath + "/" + `${novelData.fileName}${ext}`)
        .then(() => {
          console.log(`Saved image:${novelData.title}`)
        })
        .catch((error: Error) => {
          console.error(error)
        })
    }
  }
}

// SQliteに保存されているかを確認
const checkSQL = <T extends NovelData | IllustData>(mediaInfo: T): boolean => {
  // resultがすでにSQliteに載ってるかを確認
  let sql
  if (mediaInfo.type === "novel") {
    // novelはファイル名が長くなりがちだからidで確認する
    sql = `SELECT COUNT(*) FROM novel WHERE novel_id = '${mediaInfo.id}' LIMIT 1;`
  } else {
    sql = `SELECT COUNT(*) FROM illust WHERE file_name = '${mediaInfo.fileName}' LIMIT 1;`
  }
  try {
    const stmt = db.prepare(sql)
    const row: { "COUNT(*)": number } | undefined = stmt.get(1)
    if (!row) return false;
    // 既にデータが登録されていたらfalseを返す
    if (row["COUNT(*)"] !== 0) return false;
  } catch (error) {
    console.log(sql)
    console.error(error)
  }
  // 新規のデータであった場合mediaInfoをSQliteに格納
  let params: (string | string[] | number | undefined)[] = []
  if (mediaInfo.type === "illust") {
    sql = "INSERT INTO illust (user_name,user_account, user_id, type,illust_id,illust_title, media_url, file_name) VALUES(?,?,?,?,?,?,?,?);";
    params = [
      mediaInfo.userName, //: illust.user.name,
      mediaInfo.userAccount, //: illust.user.account,
      mediaInfo.userID, // illust.user.id,
      mediaInfo.type, //: illust.type,
      mediaInfo.id, // illust.id,
      mediaInfo.title, // : illust.title,
      mediaInfo.url, //: meta_pages.image_urls.original,
      mediaInfo.fileName,
    ]
  } else if (mediaInfo.type === "novel") {
    sql = "INSERT INTO novel (user_name,user_account, user_id, type,series_id,series_title, create_date, novel_id,novel_title, novel_caption, tags, media_url, page_count, file_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?);";
    params = [
      mediaInfo.userName, //: illust.user.name,
      mediaInfo.userAccount, //: illust.user.account,
      mediaInfo.userID, // illust.user.id,
      mediaInfo.type, //: illust.type,
      mediaInfo.seriesID, // illust.id,
      mediaInfo.seriesTitle, // : illust.title,
      mediaInfo.create_date, //: meta_pages.image_urls.original,
      mediaInfo.id, // illust.id,
      mediaInfo.title, // : illust.title,
      mediaInfo.caption, //: meta_pages.image_urls.original,
      mediaInfo.tags, //: meta_pages.image_urls.original,
      mediaInfo.url, //: meta_pages.image_urls.original,
      mediaInfo.pageCount, //: meta_pages.image_urls.original,
      mediaInfo.fileName,
    ]
  } else {
    // 定義されていないtypeの場合はエラーを返す
    return false;
    // reject("mediaInfo.type error\n" + new Error(`mediaInfo.typeが不正です。\nmediaInfo.type:${mediaInfo.type}`));
  }
  try {
    db.exec(sql, params)
  } catch (error) {
    console.log(params)
    console.error(error)
  }
  return true;
}

main()
