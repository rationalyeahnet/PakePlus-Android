/* ============================================================
   课时记账 · 台账页（收费流水）
   按月列出每笔账单：日期 | 学生 | 应收 | 实收 | 差额 | 类型 | 明细 | 备注
   月份口径：按收款发生时间（createdAt），即"这个月实际收/退了多少"
   ============================================================ */
window.App = window.App || {};
App.pages = App.pages || {};
App.pages.ledger = (function () {
  const store = App.store;
  let month = Utils.currentMonth();

  function esc(s) { return Utils.escapeHtml(s); }

  // 类型与差额文案
  function typeLabel(p) {
    return p.type === 'refund' ? '退费' : p.type === 'prepay' ? '预收' : '月结';
  }
  // 明细简述：月结=items（如 托管班×8 节 / 包月）；预收/退费=备注
  function detailHtml(p) {
    if (p.type !== 'settle' || !p.items || !p.items.length) return esc(p.note || '');
    return p.items.map(it => {
      const c = store.courseById(it.courseId);
      const name = c ? c.name : '未知';
      return it.billingMode === 'monthly'
        ? esc(name) + ' <span class="chip chip-warn" style="font-size:11px;">包月</span> ' + Utils.fmtMoney(it.fee)
        : esc(name) + ' × ' + it.count + ' 节';
    }).join('　');
  }
  function diffHtml(p) {
    const d = Number(p.received) - Number(p.receivable);
    if (d === 0) return '<span class="hint">结清</span>';
    return d > 0
      ? '<span class="money money-pos">+ ' + Utils.fmtMoney(d) + '</span>'
      : '<span class="money money-neg">− ' + Utils.fmtMoney(-d) + '</span>';
  }

  function render(el) {
    const pays = store.data.payments
      .filter(p => (p.createdAt || '').slice(0, 7) === month)
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

    const sumIn = pays.filter(p => Number(p.received || 0) > 0).reduce((s, p) => s + Number(p.received), 0);
    const sumOut = pays.filter(p => Number(p.received || 0) < 0).reduce((s, p) => s + Number(p.received), 0);

    el.innerHTML =
      '<div class="page-head"><div><h1 class="page-title">台账</h1>' +
      '<p class="page-sub">收费流水按收款发生时间统计（预收/月结计入，退费为负）。' + Utils.monthLabel(month) +
      '：收款 ' + Utils.fmtMoney(sumIn) + (sumOut < 0 ? ' · 退费 ' + Utils.fmtMoney(-sumOut) : '') + ' · 净收 ' + Utils.fmtMoney(sumIn + sumOut) + '</p></div>' +
      '<div class="cal-month-nav">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="prev" aria-label="上一月">‹</button>' +
        '<span class="month-label">' + Utils.monthLabel(month) + '</span>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="next" aria-label="下一月">›</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="today">本月</button>' +
      '</div></div>' +

      (pays.length === 0
        ? '<div class="card"><div class="empty"><div class="big">这个月还没有收费记录</div>' +
          '去「日历」结账或登记预收后，这里会按月列出流水。</div></div>'
        : '<div class="card" style="padding:0;overflow:hidden;"><div class="table-wrap">' +
          '<table class="list" style="min-width:700px;"><colgroup>' +
            '<col style="width:60px"><col style="width:62px">' +
            '<col style="width:76px"><col style="width:76px"><col style="width:92px"><col style="width:56px"><col>' +
          '</colgroup>' +
          '<thead><tr><th>日期</th><th>学生</th><th>应收</th><th>实收</th><th>差额</th><th>类型</th><th>明细</th></tr></thead>' +
          '<tbody>' +
            pays.map(p => {
              const s = store.studentById(p.studentId);
              return '<tr>' +
                '<td class="hint">' + (p.createdAt || '').slice(5, 10).replace('-', '/') + '</td>' +
                '<td style="font-weight:600;">' + esc(s ? s.name : '未知') + '</td>' +
                '<td class="money">' + Utils.fmtMoney(Number(p.receivable) || 0) + '</td>' +
                '<td class="money">' + Utils.fmtMoney(Number(p.received) || 0) + '</td>' +
                '<td class="money">' + diffHtml(p) + '</td>' +
                '<td><span class="chip ' + (p.type === 'refund' ? 'chip-red' : p.type === 'prepay' ? 'chip-warn' : '') + '">' + typeLabel(p) + '</span></td>' +
                '<td style="font-size:12.5px;">' + detailHtml(p) + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody></table></div></div>');

    el.querySelector('[data-act="prev"]').addEventListener('click', () => { month = Utils.shiftMonth(month, -1); render(el); });
    el.querySelector('[data-act="next"]').addEventListener('click', () => { month = Utils.shiftMonth(month, 1); render(el); });
    el.querySelector('[data-act="today"]').addEventListener('click', () => { month = Utils.currentMonth(); render(el); });
  }

  return { render, name: '台账' };
})();
