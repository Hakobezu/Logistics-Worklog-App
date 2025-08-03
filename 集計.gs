function doGet() {
  return HtmlService.createHtmlOutputFromFile("集計UI");
}

function runAggregation() {
  const folderName = "作業記録";

  const courseList = [
    "南大阪","広島","岡山","宇和島","島根","東大阪","豊岡","豊中",
    "松山","東予","高知","坂出","徳島","尾道","和歌山","金沢",
    "富山","福井","神戸","西神戸","姫路","鶴見"
  ];

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
      // JSONが壊れている等は無視
      continue;
    }
  }

  // 離岸が検品終了より早いときの補正
  for (const course of courseList) {
    const data = earliestRecords[course];
    if (data["検品終了"] && data["離岸"]) {
      const inspectEnd = new Date(data["検品終了"].timestamp);
      const leave = new Date(data["離岸"].timestamp);
      if (leave < inspectEnd) {
        const corrected = new Date(inspectEnd.getTime() + 60 * 1000);
        data["離岸"].timestamp = corrected;
        data["離岸"].corrected = true;
      }
    }
  }

  // 表データを返す
  const result = courseList.map(course => {
    const rec = earliestRecords[course];
    return {
      course,
      接岸: formatTime(rec["接岸"]?.timestamp),
      検品終了: formatTime(rec["検品終了"]?.timestamp),
      離岸: formatTime(rec["離岸"]?.timestamp),
      補正: rec["離岸"]?.corrected ? "※補正" : ""
    };
  });

  return result;
}

function formatTime(date) {
  if (!date) return "";
  const d = new Date(date);
  return Utilities.formatDate(d, "Asia/Tokyo", "HH:mm");
}

