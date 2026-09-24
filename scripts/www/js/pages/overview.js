/* ============================================================
   课时记账 · 概览页（首页）
   本月应收/实收/待结清 + 今日排课进度 + 欠费催收清单
   ============================================================ */
window.App = window.App || {};
App.pages = App.pages || {};
App.pages.overview = (function () {
  const store = App.store;

  function esc(s) { return Utils.escapeHtml(s); }

  function render(el) {
    const cur = Utils.currentMonth();
    const today = Utils.todayKey();

    // ---- 本月应收（在读学生合计）----
    const activeStudents = store.data.students.filter(s => s.status === 'active');
    const recvSum = activeStudents.reduce((sum, s) => sum + store.monthlyReceivable(s.id, cur), 0);

    // ---- 本月实收（按收款发生时间；预收/月结为正、退费为负）----
    const paysThisMonth = store.data.payments.filter(p => (p.createdAt || '').slice(0, 7) === cur);
    const recvSumReal = paysThisMonth.reduce((sum, p) => sum + Number(p.received || 0), 0);

    // ---- 待结清：余额为负（欠费）的在读学生，欠最多在前 ----
    const debtors = activeStudents
      .map(s => ({ s, bal: store.balance(s.id), rec: store.monthlyReceivable(s.id, cur) }))
      .filter(x => x.bal < 0)
      .sort((a, b) => a.bal - b.bal);

    // ---- 今日排课：今天有课的班次（应到=报名学生数，实到=已登记数）----
    const todayRows = store.sessionsForDate(today)
      .map(ses => {
        const should = store.data.enrollments.filter(e => e.courseId === ses.courseId && e.active).length;
        const att = store.attendedIdsFor(today, ses.courseId).length;
        return Object.assign({}, ses, { should, att });
      })
      .filter(r => r.should > 0);

    const stat = (k, v, cls) =>
      '<div class="stat"><div class="k">' + k + '</div><div class="v ' + (cls || '') + '">' + v + '</div></div>';

    el.innerHTML =
      '<div class="page-head"><div><h1 class="page-title">概览</h1>' +
      '<p class="page-sub">' + Utils.monthLabel(cur) + ' · 应收=按已登记出勤计算，实收=本月实际收款；欠费学生请及时催收。</p></div></div>' +

      '<div class="stat-grid" style="margin-bottom:14px;">' +
        stat('本月应收（元）', Utils.fmtMoney(recvSum), 'money') +
        stat('本月实收（元）', Utils.fmtMoney(recvSumReal), recvSumReal >= 0 ? 'money-pos' : 'money-neg') +
        stat('待结清学生', String(debtors.length), debtors.length ? 'money-neg' : 'money-pos') +
        stat('今日有课班次', String(todayRows.length) + '<small style="font-size:12px;color:var(--ink-3);font-weight:400;"> 个</small>') +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title">今日排课 · ' + today.replace(/-/g, '/') + '</div>' +
        (todayRows.length === 0
          ? '<p class="hint" style="margin:0;">今天没有排课班次。</p>'
          : '<div style="display:flex;flex-direction:column;gap:8px;">' +
            todayRows.map(r => {
              const done = r.should > 0 && r.att >= r.should;
              const half = r.att > 0 && !done;
              return '<div style="display:flex;align-items:center;gap:10px;">' +
                '<span class="course-dot" style="background:' + Utils.courseColor(store.data.courses.findIndex(c => c.id === r.courseId)) + ';"></span>' +
                '<div style="flex:1;min-width:0;">' +
                  '<div style="font-weight:600;">' + esc(r.name) + (r.extra ? ' <span class="chip chip-warn" style="font-size:11px;">加</span>' : '') +
                    (r.period ? ' <span class="chip" style="font-size:11px;">' + esc(r.period) + '</span>' : '') + '</div>' +
                  '<div class="hint">应到 ' + r.should + ' · 已登记 ' + r.att + '</div>' +
                '</div>' +
                '<span class="chip ' + (done ? 'chip-ok' : (half ? 'chip-warn' : 'chip-red')) + '">' + (done ? '已完成' : (half ? '部分登记' : '未登记')) + '</span>' +
              '</div>';
            }).join('') +
            '<a class="btn btn-ghost" href="#/calendar">去日历登记</a>' +
          '</div>') +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title">欠费催收清单' +
          (debtors.length ? ' <span class="chip chip-red">' + debtors.length + ' 人</span>' : '') + '</div>' +
        (debtors.length === 0
          ? '<p class="hint" style="margin:0;">没有欠费学生，全部结清。</p>'
          : '<div class="table-wrap"><table class="list">' +
            '<colgroup><col style="width:30%"><col style="width:30%"><col style="width:40%"></colgroup>' +
            '<thead><tr><th>学生</th><th>欠费</th><th>本月应收</th></tr></thead><tbody>' +
            debtors.map(d =>
              '<tr class="row-link" data-sid="' + d.s.id + '">' +
                '<td style="font-weight:600;">' + esc(d.s.name) + '</td>' +
                '<td class="money money-neg">' + Utils.fmtMoney(-d.bal) + '</td>' +
                '<td class="money">' + Utils.fmtMoney(d.rec) + '</td>' +
              '</tr>').join('') +
            '</tbody></table></div>' +
            '<p class="hint" style="margin:8px 0 0;">欠费 = 累计应收 − 实收（抹零已核销不计）。点行可查看该生账单。</p>') +
      '</div>';

    // 欠费行 → 学生详情（hash 路由接管跳转）
    el.addEventListener('click', function (e) {
      const tr = e.target.closest('tr[data-sid]');
      if (tr) location.hash = '#/students/' + tr.dataset.sid;
    });
  }

  return { render, name: '概览' };
})();
