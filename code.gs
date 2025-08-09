function doGet() {
  return HtmlService.createHtmlOutputFromFile('index');
}

function saveRecord(records) {
  try {
    if (!records || records.length === 0) {
      return { status: 'error', message: 'データが空です' };
    }

    const folder = DriveApp.getFoldersByName('作業記録').hasNext()
      ? DriveApp.getFoldersByName('作業記録').next()
      : DriveApp.createFolder('作業記録');

    records.forEach(record => {
      const now = new Date();
      const timePart = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd_HH-mm-ss');

      let filename = '';
      if(record.mode === '検品'){
        filename = `${timePart}_${record.course}_${record.mode}_end.json`;
      } else if(record.mode === '積込'){
        const suffix = record.action === '接岸' ? '_start' : '_end';
        filename = `${timePart}_${record.course}_${record.mode}${suffix}.json`;
      } else if(record.mode === '進捗'){
        // 進捗は固定のファイル名フォーマット
        filename = `${timePart}_${record.course}_荷揃_end.json`;
      } else {
        // その他は適当
        filename = `${timePart}_${record.course}_${record.mode}.json`;
      }

      const ordered = {
        course: record.course,
        mode: record.mode,
        action: record.action,
        timestamp: record.timestamp
      };

      const blob = Utilities.newBlob(
        JSON.stringify(ordered, null, 2),
        'application/json',
        filename
      );
      folder.createFile(blob);
    });

    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}
