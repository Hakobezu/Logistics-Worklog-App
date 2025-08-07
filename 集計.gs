function doGet() {
  return HtmlService.createHtmlOutputFromFile("集計UI");
}

function runAggregation() {
  const folderName = "作業記録";

  const courseList = [
    "南大阪","広島","岡山","宇和島","島根","東大阪","豊岡","豊中",
    "松山","高知","坂出","徳島","尾道","和歌山","金沢",
    "富山","福井","神戸","西神戸","姫路","鶴見"
  ];

  // 表示名のマッピング
  const courseNameMap = {
    "豊岡": "豊岡 丹波",
    "和歌山": "和歌山 串本 海南",
    "松山": "松山 東予",
    "神戸": "神戸 淡路"
  };

  const excludeCourses = ["東予"]; // 表示から除外するコース名

  const earliestRecords = {};
  courseList.forEach(c => {
    earliestRecords[c] = { 接岸: null, 検品終了: null, 離岸: null };
  });

  const folder = DriveApp.getFoldersByName(folderName).next();
  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    if (!name.endsWith(".json")) continue;

    try {
      const content = JSON.parse(file.getBlob().getDataAsString());
      const { course, action, timestamp } = content;

      if (!courseList.includes(course)) continue;
      if (!["接岸", "検品終了", "離岸"].includes(action)) continue;

      const t = new Date(timestamp);
      const current = earliestRecords[course][action];
      if (!current || new Date(current.timestamp) > t) {
        earliestRecords[course][action] = { ...content, timestamp: t };
      }
    } catch (e) {
      continue;
    }
  }

  // 補正処理（ただしユーザーには見せない）
  for (const course of courseList) {
    const data = earliestRecords[course];
    if (data["検品終了"] && data["離岸"]) {
      const inspectEnd = new Date(data["検品終了"].timestamp);
      const leave = new Date(data["離岸"].timestamp);
      if (leave < inspectEnd) {
        const corrected = new Date(inspectEnd.getTime() + 60 * 1000);
        data["離岸"].timestamp = corrected;
        // 補正フラグは記録しない（ユーザーに表示しないため）
      }
    }
  }

  const result = courseList
    .filter(course => !excludeCourses.includes(course)) // 除外コースは出さない
    .map(course => {
      const rec = earliestRecords[course];

      const berthed = roundUpTo5Minutes(rec["接岸"]?.timestamp);
      const inspected = roundUpTo5Minutes(rec["検品終了"]?.timestamp);
      const departed = roundUpTo5Minutes(rec["離岸"]?.timestamp);

      return {
        course: courseNameMap[course] || course,
        接岸: formatTime(berthed),
        検品終了: formatTime(inspected),
        離岸: formatTime(departed)
      };
    });

  return result;
}

function formatTime(date) {
  if (!date) return "";
  const d = new Date(date);
  return Utilities.formatDate(d, "Asia/Tokyo", "HH:mm");
}

function roundUpTo5Minutes(date) {
  if (!date) return null;
  const d = new Date(date);
  const ms = d.getTime();
  const interval = 5 * 60 * 1000;
  const roundedMs = Math.ceil(ms / interval) * interval;
  return new Date(roundedMs);
}
