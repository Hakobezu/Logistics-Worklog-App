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

  // ★ 並び順を依頼通りに変更
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
    "和歌山",
    "京都北",
    "豊岡",
    "神戸",
    "西神戸",
    "姫路",
    "鶴見",
    "豊中",
    "東大阪",
    "南大阪"
  ];

  // 表示名の置き換え
  const courseNameMap = {
    "豊岡": "豊岡 丹波",
    "和歌山": "和歌山 串本 海南",
    "松山": "松山 東予",
    "神戸": "神戸 淡路"
  };

  // 除外コース
  const excludeCourses = ["東予"];

  // 基準日計算
  let baseDate;
  if (selectedDateStr) {
    const [year, month, day] = selectedDateStr.split('-').map(Number);
    baseDate = new Date(year, month - 1, day, 12, 0, 0);
  } else {
    const now = new Date();
    if (now.getHours() >= 12) {
      baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    } else if (now.getHours() === 0 && now.getMinutes() < 10) {
      baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0);
    } else {
      baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0);
    }
  }

  const endDate = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);

  // 初期化
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

    const match = name.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})_([^_]+)_(積込_start|積込_end|検品_end)\.json$/);
    if (!match) continue;

    const [, ymd, hh, mm, ss, course, type] = match;
    if (!courseList.includes(course)) continue;

    const t = new Date(`${ymd}T${hh}:${mm}:${ss}+09:00`);

    let action = null;
    if (type === "積込_start") action = "接岸";
    else if (type === "積込_end") action = "離岸";
    else if (type === "検品_end") action = "検品終了";

    if (action === "離岸" && (t < baseDate || t >= endDate)) continue;

    // 対象ファイル名を記録
    pickedFileNames.push(name);

    const current = earliestRecords[course][action];
    if (!current || current.timestamp > t) {
      earliestRecords[course][action] = { course, action, timestamp: t };
    }
  }

  // 検品終了 ≤ 離岸 の補正
  for (const course of courseList) {
    const data = earliestRecords[course];
    if (data["検品終了"] && data["離岸"]) {
      const inspectEnd = new Date(data["検品終了"].timestamp);
      const leave = new Date(data["離岸"].timestamp);
      if (leave < inspectEnd) {
        const corrected = new Date(inspectEnd.getTime() + 60 * 1000);
        data["離岸"].timestamp = corrected;
      }
    }
  }

  // 5分単位に切り上げ
  function ceilTo5Minutes(date) {
    if (!date) return null;
    const ms = 5 * 60 * 1000;
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  }

  // 時刻フォーマット
  function formatTime(date) {
    if (!date) return null;
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // 結果作成
  const result = courseList
    .filter(course => !excludeCourses.includes(course))
    .map(course => {
      const rec = earliestRecords[course];
      return {
        course: courseNameMap[course] || course,
        接岸: formatTime(ceilTo5Minutes(rec["接岸"]?.timestamp)),
        検品終了: formatTime(ceilTo5Minutes(rec["検品終了"]?.timestamp)),
        離岸: formatTime(ceilTo5Minutes(rec["離岸"]?.timestamp)),
      };
    });

  return { result: result, fileNames: pickedFileNames };
}
