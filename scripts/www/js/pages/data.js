/* ============================================================
   课时记账 · 数据页
   备份导出 / 导入恢复 / CSV 导出 / 示例数据
   ============================================================ */
window.App = window.App || {};
App.pages = App.pages || {};
App.pages.data = (function () {
  const store = App.store;
  let ovMonth = Utils.currentMonth();

  function esc(s) { return Utils.escapeHtml(s); }

  function holidayStatusText() {
    const info = App.holidays.cacheInfo();
    return info
      ? '接口已更新：' + info.years.join('、') + '（' + info.updatedAt + '）'
      : '当前使用内置数据（' + App.holidays.version + '），尚未从接口更新';
  }

  function render(el) {
    const counts = {
      students: store.data.students.length,
      courses: store.data.courses.length,
      enrollments: store.data.enrollments.length,
      attendances: store.data.attendances.length,
      payments: store.data.payments.length,
      exceptions: store.data.exceptions.length,
      vacations: store.data.vacations.length
    };
    el.innerHTML =
      '<div class="page-head"><div><h1 class="page-title">数据管理</h1>' +
      '<p class="page-sub">数据只保存在本机浏览器，定期导出备份；换设备或清缓存前务必导出。</p></div></div>' +

      '<div class="card">' +
        '<div class="card-title">数据概况</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<span class="chip">学生 ' + counts.students + '</span>' +
          '<span class="chip">班次 ' + counts.courses + '</span>' +
          '<span class="chip">报名 ' + counts.enrollments + '</span>' +
          '<span class="chip">出勤 ' + counts.attendances + '</span>' +
          '<span class="chip">账单 ' + counts.payments + '</span>' +
          '<span class="chip">例外 ' + counts.exceptions + '</span>' +
          '<span class="chip">假期 ' + counts.vacations + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
          '<span>班次出勤总览</span>' +
          '<span class="ov-nav" style="display:flex;align-items:center;gap:6px;font-weight:400;">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="ov-prev" aria-label="上一月">‹</button>' +
            '<span class="month-label" id="ov-month">' + Utils.monthLabel(ovMonth) + '</span>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="ov-next" aria-label="下一月">›</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="ov-today">本月</button>' +
          '</span>' +
        '</div>' +
        '<div class="hint" style="margin:-4px 0 10px;">各学生实到/应到（出勤率 &lt;60% 标红），只统计到今天为止的已过去日期</div>' +
        '<div id="overview-body">' + overviewHtml(ovMonth) + '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title">备份与恢复</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
          '<button type="button" class="btn btn-primary" data-act="export-json">导出 JSON 备份</button>' +
          '<button type="button" class="btn btn-ghost" data-act="copy-json">复制 JSON 备份到剪贴板</button>' +
          '<button type="button" class="btn btn-ghost" data-act="import-json">导入 JSON 备份<br>（！警告，覆盖当前数据！）</button>' +
          '<button type="button" class="btn btn-ghost" data-act="export-csv-att">导出出勤流水 CSV（Excel 可打开）</button>' +
          '<button type="button" class="btn btn-ghost" data-act="export-csv-pay">导出账单流水 CSV（Excel 可打开）</button>' +
        '</div>' +
        '<input type="file" id="import-file" accept=".json,application/json" style="display:none;">' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title">法定节假日</div>' +
        '<p class="hint" style="margin:-4px 0 10px;">' + '点击按钮从网络接口获取最新放假与调休安排（当年+下一年），接口更新后优先于内置数据生效。</p>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
          '<div class="hint" id="holiday-status">' + holidayStatusText() + '</div>' +
          '<button type="button" class="btn btn-primary" data-act="update-holidays" id="btn-update-holidays">更新法定节假日</button>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title">演示与重置</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
          '<button type="button" class="btn btn-ghost" data-act="sample">载入示例数据<br>（！警告，覆盖当前数据！）</button>' +
          '<button type="button" class="btn btn-danger" data-act="clear">清空全部数据</button>' +
        '</div>' +
      '</div>';

    el.querySelector('[data-act="update-holidays"]').addEventListener('click', async () => {
      const btn = el.querySelector('#btn-update-holidays');
      btn.disabled = true;
      btn.textContent = '更新中…';
      let result = null;
      let errMsg = '';
      try {
        result = await App.holidays.refreshFromApi();
        el.querySelector('#holiday-status').textContent = '接口已更新：' + result.years.join('、') + '（' + result.updatedAt + '）';
      } catch (err) {
        errMsg = ((err && err.message) || '网络不可用或接口异常') + '，请稍后重试';
      } finally {
        btn.disabled = false;
        btn.textContent = '更新法定节假日';
      }
      if (result) {
        await Utils.choiceDialog('法定节假日已更新',
          '覆盖年份：' + result.years.join('、') + ' · 更新时间：' + result.updatedAt +
          '。排课将按最新放假与调休安排自动停课 / 补班。',
          [{ key: 'ok', text: '好', cls: 'btn-primary' }]);
      } else {
        Utils.toast('更新失败：' + errMsg);
      }
    });
    el.querySelector('[data-act="export-json"]').addEventListener('click', () => {
      Utils.download('课时记账备份-' + Utils.todayKey() + '.json', store.exportJSON(), 'application/json');
    });
    el.querySelector('[data-act="copy-json"]').addEventListener('click', async () => {
      const text = store.exportJSON();
      const ok = await copyText(text);
      Utils.toast(ok ? '备份已复制到剪贴板（粘贴到备忘录/微信即可保存）' : '复制失败，请改用「导出 JSON 备份」');
    });
    el.querySelector('[data-act="import-json"]').addEventListener('click', () => {
      el.querySelector('#import-file').click();
    });
    el.querySelector('#import-file').addEventListener('change', async function () {
      const file = this.files && this.files[0];
      this.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const ok = await Utils.confirmDialog('导入备份？', '导入将覆盖当前全部数据，建议先导出当前数据。', '覆盖导入');
        if (!ok) return;
        await store.importJSON(text);
        Utils.toast('导入成功');
      } catch (err) {
        Utils.toast('导入失败：' + err.message);
      }
    });
    el.querySelector('[data-act="export-csv-att"]').addEventListener('click', () => exportCsvAttendance());
    el.querySelector('[data-act="export-csv-pay"]').addEventListener('click', () => exportCsvPayment());
    el.querySelector('[data-act="sample"]').addEventListener('click', async () => {
      const ok = await Utils.confirmDialog('载入示例数据？', '会覆盖当前全部数据，用于演示功能。', '载入');
      if (!ok) return;
      await App.sample.loadSample();
      Utils.toast('示例数据已载入');
    });
    el.querySelector('[data-act="clear"]').addEventListener('click', async () => {
      const ok = await Utils.confirmDialog('清空全部数据？', '所有学生、课程、出勤和账单将被删除，不可恢复。', '清空');
      if (!ok) return;
      await store.clearAll();
      Utils.toast('已清空');
    });

    // 班次出勤总览：月份切换（局部刷新，不重建整页）
    function refreshOverview() {
      el.querySelector('#ov-month').textContent = Utils.monthLabel(ovMonth);
      el.querySelector('#overview-body').innerHTML = overviewHtml(ovMonth);
    }
    el.querySelector('[data-act="ov-prev"]').addEventListener('click', () => { ovMonth = Utils.shiftMonth(ovMonth, -1); refreshOverview(); });
    el.querySelector('[data-act="ov-next"]').addEventListener('click', () => { ovMonth = Utils.shiftMonth(ovMonth, 1); refreshOverview(); });
    el.querySelector('[data-act="ov-today"]').addEventListener('click', () => { ovMonth = Utils.currentMonth(); refreshOverview(); });
  }

  /* ---------- 班次出勤总览 ---------- */
  function overviewHtml(month) {
    const blocks = store.data.courses.map(c => {
      const st = store.sessionStats(c.id, month);
      if (!st.rows.length) return null;
      return '<div style="margin-bottom:10px;">' +
        '<div style="font-weight:600;margin-bottom:4px;">' + esc(c.name) +
          (c.period ? ' <span class="chip" style="font-size:11px;">' + esc(c.period) + '</span>' : '') +
          ' <span class="hint">应到 ' + st.shouldDays + ' 天</span></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
          st.rows.map(r => {
            const rate = r.should > 0 ? Math.round(r.attend / r.should * 100) : null;
            return '<span class="chip' + (rate !== null && rate < 60 ? ' chip-red' : '') + '">' +
              esc(r.name) + ' ' + r.attend + '/' + r.should + (rate === null ? '' : ' (' + rate + '%)') + '</span>';
          }).join('') +
        '</div></div>';
    }).filter(Boolean).join('');
    return blocks || '<p class="hint">还没有班次或报名</p>';
  }

  /* ---------- 复制到剪贴板（带降级，file:// / WebView 均可用） ---------- */
  function copyText(text) {
    return new Promise(function (resolve) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { resolve(true); }, function () { resolve(legacyCopy(text)); });
        return;
      }
      resolve(legacyCopy(text));
    });
  }
  function legacyCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ---------- CSV（带 BOM，Excel 直接打开不乱码） ---------- */
  function weekOf(dateKey) {
    const wd = Utils.weekdayOf(dateKey);
    return '日一二三四五六'[wd];
  }
  function exportCsvAttendance() {
    const rows = [['学生', '日期', '星期', '班次', '时段', '计费方式', '单价(元)', '包月费(元)', '创建时间']];
    store.data.attendances
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(a => {
        const s = store.studentById(a.studentId);
        const c = store.courseById(a.courseId);
        const isMonthly = a.billingMode === 'monthly';
        rows.push([
          s ? s.name : '未知', a.date, weekOf(a.date), c ? c.name : '未知', c && c.period || '',
          isMonthly ? '包月' : '按节',
          isMonthly ? '' : (a.price == null ? '' : a.price),
          isMonthly ? (a.fee == null ? '' : a.fee) : '',
          a.createdAt
        ]);
      });
    Utils.download('出勤流水-' + Utils.todayKey() + '.csv', '\ufeff' + rows.map(r => r.map(Utils.csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
    Utils.toast('出勤流水 CSV 已导出');
  }

  function exportCsvPayment() {
    const rows = [['学生', '月份', '类型', '应收(元)', '实收(元)', '差额(元)', '备注']];
    store.data.payments
      .slice()
      .sort((a, b) => (a.month || a.createdAt).localeCompare(b.month || b.createdAt))
      .forEach(p => {
        const s = store.studentById(p.studentId);
        const diff = p.received - p.receivable;
        const type = p.type === 'refund' ? '退费' : p.type === 'prepay' ? '预收' : '月结';
        rows.push([s ? s.name : '未知', p.month || '', type, p.receivable, p.received, diff, p.note || '']);
      });
    Utils.download('账单流水-' + Utils.todayKey() + '.csv', '\ufeff' + rows.map(r => r.map(Utils.csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
    Utils.toast('账单流水 CSV 已导出');
  }

  return { render, name: '数据' };
})();
