function doGet() {
  return HtmlService.createHtmlOutputFromFile("集計UI");
}

/**
 * 集計とともに、対象ファイルの一覧も返す
 * @param {string} selectedDateStr YYYY-MM-DD形式の文字列
 * @returns {object} { result: 集計結果配列, fileNames: 対象ファイル名配列 }
 */
function runAggregation(selectedDateStr) {
  const folderName = "作業記録";

  // 新しいコース並び順
  const courseList = [
    "松山", "東予",
    "坂出",
    "徳島",
    "高知",
    "宇和島",
    "岡山",
    "尾道",
    "広島",
    "島根",
    "富山",
    "金沢",
    "福井",
    "和歌山", "串本", "海南",
    "京都北",
    "豊岡", "丹波",
    "神戸", "淡路",
    "西神戸",
    "姫路",
    "鶴見",
    "豊中",
    "東大阪",
    "南大阪"
  ];

  // コース名の変換マップ（複数コースまとめ）
  const courseNameMap = {
    "豊岡": "豊岡 丹波",
    "丹波": null,       // まとめるので単独表示しない
    "和歌山": "和歌山 串本 海南",
    "串本": null,
    "海南": null,
    "松山": "松山 東予",
    "東予": null,
    "神戸": "神戸 淡路",
    "淡路": null
  };

  // 除外コース（単独で集計しない）
  const excludeCourses = ["東予", "串本", "海南", "丹波", "淡路"];

  // 基準日（昼12時）を決める
  let baseDate;
  if (selectedDateStr) {
    const [year, month, day] = selectedDateStr.split('-').map(Number);
    baseDate = new Date(year, month - 1, day, 12, 0, 0);
  } else {
    const now = new Date();
    if (now.getHours() >= 12) {
      baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    } else {
      baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0);
    }
  }

  const endDate = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);

  // 最も早い時刻を記録するためのオブジェクト初期化
  const earliestRecords = {};
  courseList.forEach(c => {
    earliestRecords[c] = { 接岸: null, 検品終了: null, 離岸: null };
  });

  const folder = DriveApp.getFoldersByName(folderName).next();
  const files = folder.getFiles();

  const pickedFileNames = [];

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    if (!name.endsWith(".json")) continue;

    // ファイル名の形式チェックと解析
    const match = name.match(
      /^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})_([^_]+)_(積込_start|積込_end|検品_end)\.json$/
    );
    if (!match) continue;

    const [, ymd, hh, mm, ss, course, type] = match;
    if (!courseList.includes(course)) continue;

    // ファイル名の日時をDateに変換（日本時間）
    const t = new Date(`${ymd}T${hh}:${mm}:${ss}+09:00`);

    // 集計対象期間外なら無視
    if (t < baseDate || t >= endDate) continue;

    // 種類によってアクション名を決定
    let action = null;
    if (type === "積込_start") action = "接岸";
    else if (type === "積込_end") action = "離岸";
    else if (type === "検品_end") action = "検品終了";

    pickedFileNames.push(name);

    // 最も早い時刻の記録を更新
    const current = earliestRecords[course][action];
    if (!current || current.timestamp > t) {
      earliestRecords[course][action] = { course, action, timestamp: t };
    }
  }

  // 「検品終了」 ≤ 「離岸」の補正（離岸が検品終了より早ければ検品終了の1分後に）
  for (const course of courseList) {
    const data = earliestRecords[course];
    if (data["検品終了"] && data["離岸"]) {
      const inspectEnd = new Date(data["検品終了"].timestamp);
      const leave = new Date(data["離岸"].timestamp);
      if (leave < inspectEnd) {
        data["離岸"].timestamp = new Date(inspectEnd.getTime() + 60 * 1000);
      }
    }
  }

  // 5分切り上げ関数
  function ceilTo5Minutes(date) {
    if (!date) return null;
    const ms = 5 * 60 * 1000;
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  }

  // 24時間超過（27時など）表示対応の時刻フォーマット関数
  function formatTime(date) {
    if (!date) return null;

    const baseHour = 12; // 集計開始基準の昼12時
    let hours = date.getHours();
    const minutes = date.getMinutes();

    // 基準時刻より前の時間は24時間加算して27時などに変換
    if (hours < baseHour) {
      hours += 24;
    }

    return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
  }

  // コース名のまとめと除外を反映
  const mergedResultMap = {};

  for (const course of courseList) {
    if (excludeCourses.includes(course)) continue;

    let mergedName = courseNameMap[course] || course;
    if (courseNameMap[course]) {
      mergedName = courseNameMap[course];
    }

    if (!mergedResultMap[mergedName]) {
      mergedResultMap[mergedName] = { 接岸: null, 検品終了: null, 離岸: null, course: mergedName };
    }

    ["接岸", "検品終了", "離岸"].forEach(action => {
      const rec = earliestRecords[course][action];
      if (!rec) return;

      const existing = mergedResultMap[mergedName][action];
      if (!existing || existing.timestamp > rec.timestamp) {
        mergedResultMap[mergedName][action] = rec;
      }
    });
  }

  // 出力用配列に変換し、5分切り上げ＋時刻フォーマット
  const result = Object.values(mergedResultMap).map(rec => {
    return {
      course: rec.course,
      接岸: formatTime(ceilTo5Minutes(rec["接岸"]?.timestamp)),
      検品終了: formatTime(ceilTo5Minutes(rec["検品終了"]?.timestamp)),
      離岸: formatTime(ceilTo5Minutes(rec["離岸"]?.timestamp)),
    };
  });

  return { result, fileNames: pickedFileNames };
}
