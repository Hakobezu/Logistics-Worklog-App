function doGet() {
  return HtmlService.createHtmlOutputFromFile("集計UI");
}

/**
 * 集計とともに、対象ファイルの一覧も返す
 * @param {string} selectedDateStr YYYY-MM-DD形式の文字列
 * @returns {object} { result: 集計結果配列, fileNames: 対象ファイル名配列, progressResult: 進捗モード集計配列 }
 */
function runAggregation(selectedDateStr) {
  const folderName = "作業記録";

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

  const courseNameMap = {
    "豊岡": "豊岡 丹波",
    "丹波": null,
    "和歌山": "和歌山 串本 海南",
    "串本": null,
    "海南": null,
    "松山": "松山 東予",
    "東予": null,
    "神戸": "神戸 淡路",
    "淡路": null
  };

  const excludeCourses = ["東予", "串本", "海南", "丹波", "淡路"];

  // 基準日（昼12時）
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

  // 最も早い時刻を記録
  const earliestRecords = {};
  courseList.forEach(c => {
    earliestRecords[c] = { 接岸: null, 検品終了: null, 離岸: null };
  });

  // 進捗モード用
  const progressFloors = ["6F", "5F", "4F"];
  const progressRecords = {};

  const folder = DriveApp.getFoldersByName(folderName).next();
  const files = folder.getFiles();

  const pickedFileNames = [];

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    if (!name.endsWith(".json")) continue;

    // 積込・検品モードのファイル解析
    const match = name.match(
      /^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})_([^_]+)_(積込_start|積込_end|検品_end)\.json$/
    );
    if (match) {
      const [, ymd, hh, mm, ss, course, type] = match;
      if (!courseList.includes(course)) continue;
      const t = new Date(`${ymd}T${hh}:${mm}:${ss}+09:00`);
      if (t < baseDate || t >= endDate) continue;

      let action = null;
      if (type === "積込_start") action = "接岸";
      else if (type === "積込_end") action = "離岸";
      else if (type === "検品_end") action = "検品終了";

      pickedFileNames.push(name);

      const current = earliestRecords[course][action];
      if (!current || current.timestamp > t) {
        earliestRecords[course][action] = { course, action, timestamp: t };
      }
      continue;
    }

    // 進捗モードのファイル解析
    const matchProgress = name.match(
      /^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})_([^_]+)_荷揃_end\.json$/
    );
    if (matchProgress) {
      const [, ymd, hh, mm, ss, floor] = matchProgress;
      if (!progressFloors.includes(floor)) continue;
      const t = new Date(`${ymd}T${hh}:${mm}:${ss}+09:00`);
      if (t < baseDate || t >= endDate) continue;

      pickedFileNames.push(name);

      if (!progressRecords[floor] || progressRecords[floor].timestamp > t) {
        progressRecords[floor] = { floor, timestamp: t };
      }
      continue;
    }
  }

  // 「検品終了」 ≤ 「離岸」補正
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

  function ceilTo5Minutes(date) {
    if (!date) return null;
    const ms = 5 * 60 * 1000;
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  }

  function formatTime(date) {
    if (!date) return null;
    const baseHour = 12;
    let hours = date.getHours();
    const minutes = date.getMinutes();
    if (hours < baseHour) hours += 24;
    return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
  }

  // コース名まとめ・除外反映
  const mergedResultMap = {};
  for (const course of courseList) {
    if (excludeCourses.includes(course)) continue;
    let mergedName = courseNameMap[course] || course;
    if (courseNameMap[course]) mergedName = courseNameMap[course];
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

  const result = Object.values(mergedResultMap).map(rec => ({
    course: rec.course,
    接岸: formatTime(ceilTo5Minutes(rec["接岸"]?.timestamp)),
    検品終了: formatTime(ceilTo5Minutes(rec["検品終了"]?.timestamp)),
    離岸: formatTime(ceilTo5Minutes(rec["離岸"]?.timestamp)),
  }));

  // 進捗モード結果（6F,5F,4F順に固定）
  const progressResult = progressFloors.map(floor => {
    const rec = progressRecords[floor];
    if (!rec) return null;
    return {
      floor: rec.floor,
      荷揃完了: formatTime(ceilTo5Minutes(rec.timestamp)),
    };
  }).filter(x => x !== null);

  return { result, fileNames: pickedFileNames, progressResult };
}
