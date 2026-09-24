/* ============================================================
   课时记账 · 工具函数（零依赖）
   ============================================================ */
window.Utils = (function () {
  const MONTHS_CN = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

  function pad(n) { return String(n).padStart(2, '0'); }

  // 本地日期 → 'YYYY-MM-DD'（避免 toISOString 的 UTC 偏移）
  function dateKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function todayKey() { return dateKey(new Date()); }

  // 'YYYY-MM' 的加减
  function shiftMonth(key, delta) {
    const p = key.split('-').map(Number);
    const d = new Date(p[0], p[1] - 1 + delta, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  function monthLabel(key) {
    const p = key.split('-').map(Number);
    return p[0] + '年' + MONTHS_CN[p[1] - 1];
  }
  function monthShort(key) {
    const p = key.split('-').map(Number);
    return p[0] + '.' + pad(p[1]);
  }
  function currentMonth() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  function weekdayLabel(idx) { return '周' + WEEK_CN[idx]; }

  // 'YYYY-MM-DD' → 星期 0-6（0=周日，1=周一 … 6=周六）
  function weekdayOf(key) {
    const p = key.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]).getDay();
  }

  // 生成某月的日历格子（含前后月补位），返回 [{ key, day, inMonth }]
  // 周一为首列（与表头 一~日 对齐）；用 (getDay()+6)%7 避免周日错位一天
  function buildMonthCells(key) {
    const p = key.split('-').map(Number);
    const y = p[0], m = p[1];
    const first = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // 周一为首列
    const cells = [];
    const prev = new Date(y, m - 1, 0);
    for (let i = lead - 1; i >= 0; i--) {
      const d = new Date(y, m - 1, 0 - i);
      cells.push({ key: dateKey(d), day: d.getDate(), inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m - 1, day);
      cells.push({ key: dateKey(d), day, inMonth: true });
    }
    const tail = 7 - (cells.length % 7 || 7);
    for (let i = 1; i <= tail; i++) {
      const d = new Date(y, m, i);
      cells.push({ key: dateKey(d), day: d.getDate(), inMonth: false });
    }
    return { cells, days: daysInMonth, lead, tail, prev };
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function fmtMoney(n) {
    const v = Number(n) || 0;
    return v.toFixed(2);
  }

  // 课程标签色：与 css 里 --course-colors 保持一致
  const COURSE_COLORS = ['#1E6B57', '#3E7CB1', '#A05A4E', '#7A8B4F', '#B07A1E', '#4E8A6E'];
  function courseColor(idx) { return COURSE_COLORS[Math.abs(idx) % COURSE_COLORS.length]; }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 300);
  }

  // CSV 单元格转义（RFC 4180）
  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // 弹层：confirm 风格（返回 Promise<boolean>）
  function confirmDialog(title, message, confirmText) {
    return new Promise(function (resolve) {
      const root = document.getElementById('modal-root');
      const mask = document.createElement('div');
      mask.className = 'modal-mask';
      mask.innerHTML =
        '<div class="modal" style="max-width:380px;">' +
          '<div class="modal-head"><h3 class="modal-title">' + Utils.escapeHtml(title) + '</h3>' +
          '<button type="button" class="modal-close" data-act="cancel" aria-label="关闭">×</button></div>' +
          '<p style="color:var(--ink-2);margin:0 0 18px;">' + Utils.escapeHtml(message) + '</p>' +
          '<div style="display:flex;gap:10px;">' +
            '<button type="button" class="btn btn-ghost" style="flex:1;" data-act="cancel">取消</button>' +
            '<button type="button" class="btn btn-danger" style="flex:1;" data-act="ok">' + Utils.escapeHtml(confirmText || '删除') + '</button>' +
          '</div>' +
        '</div>';
      function close(result) {
        mask.removeEventListener('click', onClick);
        root.removeChild(mask);
        resolve(result);
      }
      function onClick(e) {
        const act = e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'ok') close(true);
        else if (act === 'cancel') close(false);
        else if (e.target === mask) close(false);
      }
      mask.addEventListener('click', onClick);
      root.appendChild(mask);
    });
  }

  // 弹层：多按钮选择（返回 Promise<按钮 key>，点遮罩/× 返回 null）
  // buttons: [{ key, text, cls: 'btn-primary' | 'btn-danger' | 'btn-ghost' }]
  // text 支持 \n 显式换行（如 '返回\n继续登记' 两行按钮），避免窄屏随机折行
  function choiceDialog(title, message, buttons) {
    return new Promise(function (resolve) {
      const root = document.getElementById('modal-root');
      const mask = document.createElement('div');
      mask.className = 'modal-mask';
      const btnsHtml = buttons.map(function (b) {
        return '<button type="button" class="btn ' + (b.cls || 'btn-ghost') + '" style="flex:1;" data-key="' +
          Utils.escapeHtml(b.key) + '">' + Utils.escapeHtml(b.text).replace(/\n/g, '<br>') + '</button>';
      }).join('');
      mask.innerHTML =
        '<div class="modal" style="max-width:380px;">' +
          '<div class="modal-head"><h3 class="modal-title">' + Utils.escapeHtml(title) + '</h3>' +
          '<button type="button" class="modal-close" data-act="cancel" aria-label="关闭">×</button></div>' +
          '<p style="color:var(--ink-2);margin:0 0 18px;line-height:1.6;">' + Utils.escapeHtml(message) + '</p>' +
          '<div style="display:flex;gap:10px;">' + btnsHtml + '</div>' +
        '</div>';
      function close(result) {
        mask.removeEventListener('click', onClick);
        root.removeChild(mask);
        resolve(result);
      }
      function onClick(e) {
        const key = e.target.getAttribute && e.target.getAttribute('data-key');
        if (key) { close(key); return; }
        const act = e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'cancel' || e.target === mask) close(null);
      }
      mask.addEventListener('click', onClick);
      root.appendChild(mask);
    });
  }

  return {
    pad, dateKey, todayKey, shiftMonth, monthLabel, monthShort, currentMonth,
    weekdayLabel, weekdayOf, buildMonthCells, uid, fmtMoney, courseColor, escapeHtml,
    download, csvCell, confirmDialog, choiceDialog
  };
})();
