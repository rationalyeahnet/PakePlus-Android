/* ============================================================
   课时记账 · 学生页
   列表（余额/欠费）→ 详情（报名课程 / 月结收费 / 预收 / 历史账单）
   ============================================================ */
window.App = window.App || {};
App.pages = App.pages || {};
App.pages.student = (function () {
  const store = App.store;

  function esc(s) { return Utils.escapeHtml(s); }

  /* ---------- 列表 ---------- */
  function renderList(el) {
    const rows = store.allStudentsWithBalance();
    el.innerHTML =
      '<div class="page-head">' +
        '<div><h1 class="page-title">学生</h1><p class="page-sub">点击学生查看课时、账单与余额</p></div>' +
        '<a class="btn btn-primary" href="#/settings">添加学生</a>' +
      '</div>' +
      '<div class="card" style="padding:6px 16px;">' +
        (rows.length === 0
          ? '<div class="empty" style="padding:32px 8px;"><div class="big">还没有学生</div>点右上角「添加学生」开始建档，并在设置里为学生报名课程。</div>'
          : '<div class="table-wrap"><table class="list"><colgroup>' +
              '<col style="width:22%"><col style="width:18%"><col style="width:20%"><col style="width:22%"><col style="width:18%">' +
            '</colgroup><thead><tr><th>姓名</th><th>状态</th><th>本月应收</th><th>余额</th><th>报名</th></tr></thead><tbody>' +
            rows.map(r => {
              const b = r.balance;
              const enrs = store.activeEnrollments(r.student.id);
              const balTxt = b === 0
                ? '<span class="hint">结清</span>'
                : b < 0
                  ? '<span class="money money-neg">欠 ' + Utils.fmtMoney(-b) + '</span>'
                  : '<span class="money money-pos">余 ' + Utils.fmtMoney(b) + '</span>';
              return '<tr class="row-link" data-id="' + r.student.id + '">' +
                '<td style="font-weight:600;">' + esc(r.student.name) + '</td>' +
                '<td>' + (r.student.status === 'active' ? '<span class="chip">在读</span>' : '<span class="chip chip-gray">停课</span>') + '</td>' +
                '<td class="money">' + Utils.fmtMoney(store.monthlyReceivable(r.student.id, Utils.currentMonth())) + '</td>' +
                '<td>' + balTxt + '</td>' +
                '<td class="hint">' + enrs.length + ' 门</td>' +
              '</tr>';
            }).join('') +
          '</tbody></table></div>') +
      '</div>';
    el.querySelectorAll('tr.row-link').forEach(tr => {
      tr.addEventListener('click', () => { location.hash = '#/students/' + tr.dataset.id; });
    });
  }

  /* ---------- 详情 ---------- */
  function renderDetail(el, id) {
    const student = store.studentById(id);
    if (!student) { el.innerHTML = '<div class="empty"><div class="big">学生不存在</div><a class="btn btn-ghost" href="#/students">返回列表</a></div>'; return; }
    const ui = App._uiState = App._uiState || {};
    const month = ui.detailMonth && ui.detailMonth[student.id] || Utils.currentMonth();
    const bal = store.balance(id);
    const receivable = store.monthlyReceivable(id, month);
    const count = store.monthlyCount(id, month);
    const should = store.monthlyShouldAttend(id, month);
    const rate = should > 0 ? Math.round(count / should * 100) : null;
    const items = store.monthlyItems(id, month);
    const alerts = store.leaveAlerts(id, month);

    el.innerHTML =
      '<div class="page-head">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<a class="btn btn-ghost btn-sm" href="#/students" aria-label="返回">‹ 返回</a>' +
          '<div><h1 class="page-title" style="font-size:18px;">' + esc(student.name) + '</h1>' +
          '<p class="page-sub">' + (student.status === 'active' ? '在读' : '停课') + (student.note ? ' · ' + esc(student.note) : '') + '</p></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<a class="btn btn-ghost btn-sm" href="#/calendar">去日历标记</a>' +
        '</div>' +
      '</div>' +

      '<div class="stat-grid" style="margin-bottom:14px;">' +
        '<div class="stat"><div class="k">' + Utils.monthShort(month) + ' 出勤（实到/应到）</div><div class="v">' + count + '/' + should + '</div></div>' +
        '<div class="stat"><div class="k">本月出勤率</div><div class="v ' + (rate !== null && rate < 60 ? 'money-neg' : '') + '">' + (rate === null ? '—' : rate + '%') + '</div></div>' +
        '<div class="stat"><div class="k">' + Utils.monthShort(month) + ' 应收</div><div class="v money">' + Utils.fmtMoney(receivable) + '</div></div>' +
        '<div class="stat"><div class="k">账户余额</div><div class="v ' + (bal < 0 ? 'money-neg' : bal > 0 ? 'money-pos' : '') + '">' +
          (bal === 0 ? Utils.fmtMoney(0) : (bal < 0 ? '-' : '+') + Utils.fmtMoney(Math.abs(bal))) +
        '</div></div>' +
      '</div>' +

      (alerts.length
        ? '<div class="card" style="border-color:#e5a50a;">' +
            '<div class="card-title" style="color:#a16207;">请假退费提醒</div>' +
            alerts.map(a =>
              '<div style="padding:7px 0;border-bottom:1px solid var(--line-soft);font-size:13px;">' +
                esc(a.course.name) + '：本月已请假 <b>' + a.days + '</b> 天（已达 ' + a.threshold + ' 天提醒线）' +
                '<div class="hint">如需退费或转按次，请手动登记（下方「登记退费」）。</div>' +
              '</div>').join('') +
          '</div>'
        : '') +

      '<div class="card">' +
        '<div class="card-title">报名课程 <span class="hint">' + store.activeEnrollments(id).length + ' 门在读</span></div>' +
        (store.activeEnrollments(id).length === 0
          ? '<div class="empty" style="padding:20px;"><div class="big">未报名课程</div>到「设置」给学生报名并填写优惠单价</div>'
          : '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
            store.activeEnrollments(id).map(e => {
              const c = store.courseById(e.courseId);
              const wds = c && c.weekdays || [];
              const wk = wds.length
                ? '一二三四五六日'.split('').map((_, i) => i).filter(i => wds.indexOf(i) >= 0).map(i => '日一二三四五六'[i]).join('')
                : '未排课';
              return '<span class="chip" style="font-size:13px;padding:5px 12px;">' +
                esc(c ? c.name : '未知') + '（' + esc(wk) + '）' +
                (e.billingMode === 'monthly'
                  ? ' <span class="chip chip-warn" style="margin-left:2px;">包月</span> ' + Utils.fmtMoney(e.monthlyFee) + '/月'
                  : Utils.fmtMoney(e.price) + '/节') +
              '</span>';
            }).join('') +
          '</div>') +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title">本月账单 · 收费 <button type="button" class="btn btn-ghost btn-sm" data-act="refund">登记退费</button></div>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">' +
          '<label class="hint">结算月份</label>' +
          '<select class="input" id="settle-month" style="width:140px;min-height:36px;">' +
            [Utils.shiftMonth(month, -1), month, Utils.shiftMonth(month, 1)].map(m =>
              '<option value="' + m + '"' + (m === month ? ' selected' : '') + '>' + Utils.monthLabel(m) + '</option>'
            ).join('') +
          '</select>' +
        '</div>' +
        '<div id="settle-body">' + buildSettle(student, month) + '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title">历史账单 <span class="hint" style="font-weight:400;">实收 − 应收</span></div>' +
        '<div id="pay-list">' + buildPayList(student.id) + '</div>' +
      '</div>';

    el.querySelector('#settle-month').addEventListener('change', e => {
      const ui = App._uiState = App._uiState || {};
      ui.detailMonth = ui.detailMonth || {};
      ui.detailMonth[student.id] = e.target.value;
      renderDetail(el, student.id);
    });
    bindSettle(el, student);
    bindPayList(el, student);
  }

  /* ---------- 收费表单 ---------- */
  function buildSettle(student, month) {
    const items = store.monthlyItems(student.id, month);
    const keys = Object.keys(items);
    if (keys.length === 0) {
      return '<div class="hint" style="padding:6px 0 2px;">该月没有出勤记录，先去日历标记上课。</div>' +
        '<div style="margin-top:10px;"><button type="button" class="btn btn-ghost btn-sm" data-act="prepay">登记预收（客户提前交）</button></div>';
    }
    const receivable = store.monthlyReceivable(student.id, month);
    const rowsHtml = keys.map(k => {
      const c = store.courseById(k);
      const it = items[k];
      const isMonthly = it.billingMode === 'monthly';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--line-soft);">' +
        '<span>' + esc(c ? c.name : '未知') +
          (isMonthly
            ? ' <span class="chip chip-warn">包月</span>（' + Utils.fmtMoney(it.fee) + '/月，本月有出勤）'
            : ' × ' + it.count + ' 节（' + Utils.fmtMoney(it.price) + '/节）') +
        '</span>' +
        '<b class="money">' + Utils.fmtMoney(isMonthly ? it.fee : it.count * it.price) + '</b></div>';
    }).join('');
    return rowsHtml +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0 12px;font-weight:600;">' +
        '<span>应收合计</span><span class="money" style="font-size:17px;">' + Utils.fmtMoney(receivable) + '</span></div>' +
      '<div class="form-row">' +
        '<div class="field"><label for="received">实收金额（元）</label>' +
        '<input class="input input-amount" id="received" type="number" step="0.01" min="0" placeholder="手动填写，可抹零或多收"></div>' +
        '<div class="field" style="min-width:150px;"><label>差额处理</label><div id="diff-box" style="font-size:13px;color:var(--ink-2);padding:10px 2px;">填实收后自动判断</div></div>' +
      '</div>' +
      '<div class="field"><label for="pay-note">备注（可选）</label><input class="input" id="pay-note" placeholder="如：9月课时费、抹零 5 元"></div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button type="button" class="btn btn-primary" style="flex:1;" id="btn-save-settle" disabled>保存账单</button>' +
        '<button type="button" class="btn btn-ghost" data-act="prepay" id="btn-prepay">登记预收</button>' +
      '</div>';
  }

  function bindSettle(el, student) {
    const receivedInput = el.querySelector('#received');
    if (receivedInput) {
      receivedInput.addEventListener('input', function () {
        updateDiffBox(el, student);
      });
    }
    const saveBtn = el.querySelector('#btn-save-settle');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        const month = el.querySelector('#settle-month').value;
        const receivable = store.monthlyReceivable(student.id, month);
        const received = Number(el.querySelector('#received').value);
        if (!(received >= 0)) { Utils.toast('请填写实收金额'); return; }
        let diffType = 'exact';
        const diff = received - receivable;
        if (diff > 0) diffType = 'credit';
        else if (diff < 0) {
          const sel = el.querySelector('input[name="diff-kind"]:checked');
          diffType = sel ? sel.value : 'waive';
        }
        const items = Object.keys(store.monthlyItems(student.id, month)).map(k => {
          const it = store.monthlyItems(student.id, month)[k];
          return { courseId: k, count: it.count, price: it.price, fee: it.fee, billingMode: it.billingMode };
        });
        await store.addPayment({
          studentId: student.id, type: 'settle', month,
          items, receivable, received, diffType,
          note: el.querySelector('#pay-note').value.trim()
        });
        Utils.toast('账单已保存');
      });
    }
    const prepayBtns = el.querySelectorAll('[data-act="prepay"]');
    prepayBtns.forEach(b => b.addEventListener('click', () => openPrepay(student.id)));
    const refundBtns = el.querySelectorAll('[data-act="refund"]');
    refundBtns.forEach(b => b.addEventListener('click', () => openRefund(student.id)));
  }

  // 差额提示：diff > 0 → 多收（下次少收）；diff < 0 → 抹零 / 欠费二选一；0 → 正好
  function updateDiffBox(el, student) {
    const month = el.querySelector('#settle-month').value;
    const receivable = store.monthlyReceivable(student.id, month);
    const received = Number(el.querySelector('#received').value);
    const diff = (received || 0) - receivable;
    const box = el.querySelector('#diff-box');
    const saveBtn = el.querySelector('#btn-save-settle');
    if (received === '') { box.textContent = '填实收后自动判断'; saveBtn.disabled = true; return; }
    saveBtn.disabled = false;
    if (diff === 0) {
      box.innerHTML = '<span class="chip">正好结清</span>';
    } else if (diff > 0) {
      box.innerHTML = '<span class="chip chip-warn">多收 ' + Utils.fmtMoney(diff) + ' 元，计入余额，下次少收</span>';
    } else {
      const amt = Utils.fmtMoney(-diff);
      box.innerHTML =
        '<div style="display:flex;flex-direction:column;gap:6px;margin-top:2px;">' +
          '<span>少收 ' + amt + ' 元：</span>' +
          '<label style="display:flex;gap:6px;align-items:center;"><input type="radio" name="diff-kind" value="waive" checked> 抹零（核销，不算欠费）</label>' +
          '<label style="display:flex;gap:6px;align-items:center;"><input type="radio" name="diff-kind" value="debt"> 欠费（记入余额，待催收）</label>' +
        '</div>';
    }
  }

  function openPrepay(studentId) {
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal">' +
        '<div class="modal-head"><h3 class="modal-title">登记预收</h3>' +
        '<button type="button" class="modal-close" data-act="close" aria-label="关闭">×</button></div>' +
        '<p class="hint" style="margin:0 0 12px;">客户信任老师提前交一个月时使用，金额计入余额，月结时自动抵扣。</p>' +
        '<div class="field"><label>实收金额（元）</label><input class="input input-amount" id="prepay-amount" type="number" step="0.01" min="0" placeholder="如 900"></div>' +
        '<div class="field"><label>备注（可选）</label><input class="input" id="prepay-note" placeholder="如：提前交 9 月课时费"></div>' +
        '<button type="button" class="btn btn-primary btn-block" id="prepay-save">保存预收</button>' +
      '</div>';
    mask.addEventListener('click', async function (e) {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'close' || e.target === mask) { root.removeChild(mask); return; }
      if (e.target.id === 'prepay-save') {
        const amount = Number(mask.querySelector('#prepay-amount').value);
        if (!(amount > 0)) { Utils.toast('请填写预收金额'); return; }
        await store.addPayment({
          studentId, type: 'prepay', month: Utils.currentMonth(),
          items: [], receivable: 0, received: amount, diffType: 'prepay',
          note: mask.querySelector('#prepay-note').value.trim()
        });
        root.removeChild(mask);
        Utils.toast('预收已登记，余额 ' + Utils.fmtMoney(store.balance(studentId)));
      }
    });
    root.appendChild(mask);
  }

  // 登记退费：缺勤超过约定天数时手动计算退费金额，系统只记录并扣减余额
  function openRefund(studentId) {
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    const cur = Utils.currentMonth();
    const months = [Utils.shiftMonth(cur, -1), cur, Utils.shiftMonth(cur, 1)];
    mask.innerHTML =
      '<div class="modal">' +
        '<div class="modal-head"><h3 class="modal-title">登记退费</h3>' +
        '<button type="button" class="modal-close" data-act="close" aria-label="关闭">×</button></div>' +
        '<p class="hint" style="margin:0 0 12px;">缺勤较多需要退费时使用。退费金额从账户余额中扣减，可在历史账单中查到。退多少由你根据缺勤天数计算。</p>' +
        '<div class="field"><label>对应月份</label><select class="input" id="refund-month">' +
          months.map(m => '<option value="' + m + '"' + (m === cur ? ' selected' : '') + '>' + Utils.monthLabel(m) + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>退费金额（元）</label><input class="input input-amount" id="refund-amount" type="number" step="0.01" min="0" placeholder="如缺勤退费 300"></div>' +
        '<div class="field"><label>原因（可选）</label><input class="input" id="refund-note" placeholder="如：9月缺勤较多，退费 300"></div>' +
        '<button type="button" class="btn btn-primary btn-block" id="refund-save">保存退费</button>' +
      '</div>';
    mask.addEventListener('click', async function (e) {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'close' || e.target === mask) { root.removeChild(mask); return; }
      if (e.target.id === 'refund-save') {
        const amount = Number(mask.querySelector('#refund-amount').value);
        if (!(amount > 0)) { Utils.toast('请填写退费金额'); return; }
        const month = mask.querySelector('#refund-month').value;
        await store.addPayment({
          studentId, type: 'refund', month,
          items: [], receivable: 0, received: -amount, diffType: 'refund',
          note: mask.querySelector('#refund-note').value.trim()
        });
        root.removeChild(mask);
        Utils.toast('退费已登记，余额 ' + Utils.fmtMoney(store.balance(studentId)));
      }
    });
    root.appendChild(mask);
  }

  /* ---------- 历史账单 ---------- */
  function buildPayList(studentId) {
    const pays = store.studentPayments(studentId);
    if (pays.length === 0) return '<div class="hint">还没有收费记录</div>';
    return '<div class="table-wrap"><table class="list"><colgroup>' +
      '<col style="width:14%"><col style="width:10%"><col style="width:16%"><col style="width:16%"><col style="width:18%"><col style="width:16%"><col style="width:10%">' +
      '</colgroup><thead><tr><th>月份</th><th>类型</th><th>应收</th><th>实收</th><th>差额</th><th>备注</th><th></th></tr></thead><tbody>' +
      pays.map(p => {
        const diff = p.received - p.receivable;
        const diffTxt = p.diffType === 'waive'
          ? '<span class="chip chip-gray">抹零</span>'
          : p.diffType === 'prepay'
            ? '<span class="chip chip-warn">预收</span>'
            : p.diffType === 'refund'
              ? '<span class="chip chip-red">退费</span>'
              : diff === 0
                ? '<span class="chip">结清</span>'
                : diff > 0
                  ? '<span class="money money-pos">+ ' + Utils.fmtMoney(diff) + '</span>'
                  : '<span class="money money-neg">- ' + Utils.fmtMoney(-diff) + '</span>';
        return '<tr>' +
          '<td>' + (p.month ? Utils.monthShort(p.month) : '-') + '</td>' +
          '<td>' + (p.type === 'refund' ? '退费' : p.type === 'prepay' ? '预收' : '月结') + '</td>' +
          '<td class="money">' + Utils.fmtMoney(p.receivable) + '</td>' +
          '<td class="money ' + (p.received < 0 ? 'money-neg' : '') + '">' + (p.received < 0 ? '-' : '') + Utils.fmtMoney(Math.abs(p.received)) + '</td>' +
          '<td>' + diffTxt + '</td>' +
          '<td class="hint" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;">' + esc(p.note || '') + '</td>' +
          '<td><button type="button" class="btn btn-danger btn-sm" data-payid="' + p.id + '">删除</button></td>' +
        '</tr>';
      }).join('') +
    '</tbody></table></div>';
  }

  function bindPayList(el, student) {
    el.querySelectorAll('[data-payid]').forEach(btn => {
      btn.addEventListener('click', async function () {
        const ok = await Utils.confirmDialog('删除这条账单？', '删除后余额会重新计算。该操作不可恢复。', '删除');
        if (ok) {
          await store.removePayment(btn.dataset.payid);
          Utils.toast('账单已删除');
        }
      });
    });
  }

  return { renderList, renderDetail, name: '学生' };
})();
