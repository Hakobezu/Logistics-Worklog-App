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
      const timePart = now.toISOString().replace(/[:.]/g, '-');
      const suffix = (record.mode === '検品')
        ? '_end'
        : (record.action === '接岸' ? '_start' : '_end');
      const filename = `${timePart}_${record.course}_${record.mode}${suffix}.json`;

      // ✅ 順番を course → mode → action → timestamp に統一
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
