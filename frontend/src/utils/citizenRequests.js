export const requestMessages = rows => rows.map(row => ({ ...row,
  message: row.kind === 'transfer' ? `TRANSFER PLOT REQUEST\n${row.message}` : row.message,
}));
export const requestReplies = (rows, includeDismissed = false) => rows
  .filter(row => row.reply && (includeDismissed || !row.reply_dismissed))
  .map(row => ({ id: row.id, date: row.responded_at, admin: row.admin, message: row.reply, appId: row.appId }));
