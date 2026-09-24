/* ============================================================
   课时记账 · 设置页
   学生管理 / 课程管理 / 报名管理（学生×课程+优惠单价）
   ============================================================ */
window.App = window.App || {};
App.pages = App.pages || {};
App.pages.settings = (function () {
  const store = App.store;
  let tab = 'students';

  function esc(s) { return Utils.escapeHtml(s); }

  function render(el) {
    el.innerHTML =
      '<div class="page-head"><div><h1 class="page-title">设置</h1><p class="page-sub">学生、班次、报名与假期</p></div></div>' +
      '<div class="card" style="padding:6px;display:flex;gap:4px;margin-bottom:14px;">' +
        ['students', 'courses', 'enrollments', 'vacations'].map(t =>
          '<button type="button" class="btn ' + (t === tab ? 'btn-primary' : 'btn-ghost') + '" style="flex:1;" data-tab="' + t + '">' +
          (t === 'students' ? '学生' : t === 'courses' ? '班次' : t === 'enrollments' ? '报名' : '假期') + '</button>'
        ).join('') +
      '</div>' +
      '<div id="set-body"></div>';

    el.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => { tab = btn.dataset.tab; render(el); });
    });
    const body = el.querySelector('#set-body');
    if (tab === 'students') renderStudents(body);
    else if (tab === 'courses') renderCourses(body);
    else if (tab === 'enrollments') renderEnrollments(body);
    else renderVacations(body);
  }

  /* ================= 学生 ================= */
  function renderStudents(el) {
    el.innerHTML =
      '<div class="card"><div class="card-title">学生档案 <button type="button" class="btn btn-primary btn-sm" data-act="add-student">添加学生</button></div>' +
      '<div class="set-list">' +
        (store.data.students.length === 0
          ? '<div class="empty" style="padding:24px;"><div class="big">还没有学生</div></div>'
          : store.data.students.sort((a, b) => a.name.localeCompare(b.name, 'zh')).map(s =>
            '<div class="item" data-sid="' + s.id + '">' +
              '<div class="grow"><div class="name">' + esc(s.name) +
                (s.status === 'active' ? ' <span class="chip">在读</span>' : ' <span class="chip chip-gray">停课</span>') +
              '</div>' +
              (s.note ? '<div class="sub">' + esc(s.note) + '</div>' : '') +
              '</div>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-act="toggle">' + (s.status === 'active' ? '停课' : '复课') + '</button>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-act="edit">编辑</button>' +
              '<button type="button" class="btn btn-danger btn-sm" data-act="del">删除</button>' +
            '</div>'
          ).join('')) +
      '</div></div>';
    el.querySelector('[data-act="add-student"]').addEventListener('click', () => openStudentModal());
    el.querySelectorAll('.item').forEach(item => {
      const sid = item.dataset.sid;
      item.querySelector('[data-act="toggle"]').addEventListener('click', async () => {
        const s = store.data.students.find(x => x.id === sid);
        await store.updateStudent(sid, { status: s.status === 'active' ? 'paused' : 'active' });
      });
      item.querySelector('[data-act="edit"]').addEventListener('click', () => openStudentModal(sid));
      item.querySelector('[data-act="del"]').addEventListener('click', async () => {
        const s = store.data.students.find(x => x.id === sid);
        const ok = await Utils.confirmDialog('删除学生「' + s.name + '」？', '将一并删除该生的报名、出勤和全部账单，不可恢复。', '删除');
        if (ok) await store.removeStudent(sid);
      });
    });
  }

  function openStudentModal(id) {
    const s = id ? store.data.students.find(x => x.id === id) : null;
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal">' +
        '<div class="modal-head"><h3 class="modal-title">' + (s ? '编辑学生' : '添加学生') + '</h3>' +
        '<button type="button" class="modal-close" data-act="close" aria-label="关闭">×</button></div>' +
        '<div class="field"><label>姓名</label><input class="input" id="st-name" value="' + (s ? esc(s.name) : '') + '" placeholder="学生姓名"></div>' +
        '<div class="field"><label>状态</label><select class="input" id="st-status">' +
          '<option value="active"' + (s && s.status === 'paused' ? '' : ' selected') + '>在读</option>' +
          '<option value="paused"' + (s && s.status === 'paused' ? ' selected' : '') + '>停课</option>' +
        '</select></div>' +
        '<div class="field"><label>备注（可选）</label><input class="input" id="st-note" value="' + (s ? esc(s.note) : '') + '" placeholder="家长电话、缴费约定等"></div>' +
        '<button type="button" class="btn btn-primary btn-block" id="st-save">保存</button>' +
      '</div>';
    mask.addEventListener('click', async function (e) {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'close' || e.target === mask) { root.removeChild(mask); return; }
      if (e.target.id === 'st-save') {
        const name = mask.querySelector('#st-name').value.trim();
        if (!name) { Utils.toast('请填写姓名'); return; }
        const status = mask.querySelector('#st-status').value;
        const note = mask.querySelector('#st-note').value.trim();
        if (s) await store.updateStudent(s.id, { name, status, note });
        else await store.addStudent(name, status, note);
        root.removeChild(mask);
      }
    });
    root.appendChild(mask);
  }

  /* ================= 班次（课程 + 排课） ================= */
  const WEEK_PICK = [1, 2, 3, 4, 5, 6, 0]; // 一~日（0=周日）
  function weekText(c) {
    if (c.workday) {
      const ex = [1, 2, 3, 4, 5].filter(w => (c.weekdays || []).indexOf(w) < 0);
      return ex.length ? '工作日（除' + ex.map(w => '周' + '日一二三四五六'[w]).join('、') + ' + 调休上班日）' : '工作日（周一~五 + 调休上班日）';
    }
    const wds = c.weekdays || [];
    if (!wds.length) return '未排课（手动登记）';
    const names = WEEK_PICK.filter(w => wds.indexOf(w) >= 0).map(w => '周' + '日一二三四五六'[w]);
    return names.join(' ');
  }
  function renderCourses(el) {
    el.innerHTML =
      '<div class="card"><div class="card-title">班次（课程 + 每周排课） <button type="button" class="btn btn-primary btn-sm" data-act="add-course">添加班次</button></div>' +
      '<p class="hint" style="margin-top:-6px;">选择每周上课日（可多选，如托管班勾 周一~周五），或选「工作日」= 周一~五 + 调休上班日照常上课（如国庆前周日补班）。法定节假日自动停课，寒暑假在「假期」里设置。</p>' +
      '<div class="set-list">' +
        (store.data.courses.length === 0
          ? '<div class="empty" style="padding:24px;"><div class="big">还没有班次</div></div>'
          : store.data.courses.map(c =>
            '<div class="item" data-cid="' + c.id + '">' +
              '<div class="grow"><div class="name">' + esc(c.name) +
                (c.period ? ' <span class="chip">' + esc(c.period) + '</span>' : '') +
                (c.active === false ? ' <span class="chip chip-gray">已停用</span>' : '') +
              '</div>' +
              '<div class="sub">' + esc(weekText(c)) +
                (c.billingMode === 'monthly'
                  ? ' · <span class="chip chip-warn">包月</span> 默认 ' + Utils.fmtMoney(c.monthlyFee) + ' 元/月' +
                    ((Number(c.leaveThreshold) || 0) > 0 ? ' · 请假≥' + Number(c.leaveThreshold) + '天提醒' : '')
                  : ' · 默认 ' + Utils.fmtMoney(c.defaultPrice) + ' 元/节') +
              '</div></div>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-act="exceptions">例外</button>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-act="toggle">' + (c.active === false ? '启用' : '停用') + '</button>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-act="edit">编辑</button>' +
              '<button type="button" class="btn btn-danger btn-sm" data-act="del">删除</button>' +
            '</div>'
          ).join('')) +
      '</div></div>';
    el.querySelector('[data-act="add-course"]').addEventListener('click', () => openCourseModal());
    el.querySelectorAll('.item').forEach(item => {
      const cid = item.dataset.cid;
      item.querySelector('[data-act="exceptions"]').addEventListener('click', () => openExceptionModal(cid));
      item.querySelector('[data-act="toggle"]').addEventListener('click', async () => {
        const c = store.data.courses.find(x => x.id === cid);
        await store.updateCourse(cid, { active: c.active === false });
      });
      item.querySelector('[data-act="edit"]').addEventListener('click', () => openCourseModal(cid));
      item.querySelector('[data-act="del"]').addEventListener('click', async () => {
        const c = store.data.courses.find(x => x.id === cid);
        if (store.courseInUse(cid)) {
          Utils.toast('「' + c.name + '」已有报名或出勤记录，不能删除，可编辑修改');
          return;
        }
        const ok = await Utils.confirmDialog('删除班次「' + c.name + '」？', '删除后不可恢复。', '删除');
        if (ok) await store.removeCourse(cid);
      });
    });
  }

  function openCourseModal(id) {
    const c = id ? store.data.courses.find(x => x.id === id) : null;
    const wds = c ? (c.weekdays || []) : [];
    const wdOn = !!(c && c.workday);
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal">' +
        '<div class="modal-head"><h3 class="modal-title">' + (c ? '编辑班次' : '添加班次') + '</h3>' +
        '<button type="button" class="modal-close" data-act="close" aria-label="关闭">×</button></div>' +
        '<div class="field"><label>班次名称</label><input class="input" id="co-name" value="' + (c ? esc(c.name) : '') + '" placeholder="如：托管班、数学提高班"></div>' +
        '<div class="field" style="margin-bottom:6px;"><label>每周上课日</label>' +
          '<label class="wd-workday"><input type="checkbox" id="co-workday"' + (wdOn ? ' checked' : '') + '> <b>工作日</b><span class="hint">（周一~五默认全上，点掉哪天=哪天不上；调休上班日照常上课）</span></label>' +
          '<div class="weekdays-pick">' +
            WEEK_PICK.map(w =>
              '<label class="wd"><input type="checkbox" value="' + w + '"' + (wds.indexOf(w) >= 0 ? ' checked' : '') + '>' + '日一二三四五六'[w] + '</label>'
            ).join('') +
          '</div>' +
        '</div>' +
        '<div class="field"><label>时段（可选，用于区分同名班次）</label><select class="input" id="co-period">' +
          ['', '上午', '下午', '晚上', '全天'].map(p =>
            '<option value="' + p + '"' + ((c ? c.period : '') === p ? ' selected' : '') + '>' + (p || '不指定') + '</option>'
          ).join('') +
        '</select></div>' +
        '<div class="field"><label>默认计费方式</label>' +
          '<div style="display:flex;gap:8px;">' +
            '<label class="billing-opt"><input type="radio" name="co-billing" value="perClass"' + (!(c && c.billingMode === 'monthly') ? ' checked' : '') + '> <span>按次<br><small>每节单价</small></span></label>' +
            '<label class="billing-opt"><input type="radio" name="co-billing" value="monthly"' + (c && c.billingMode === 'monthly' ? ' checked' : '') + '> <span>包月<br><small>每月固定费</small></span></label>' +
          '</div>' +
        '</div>' +
        '<div class="field" id="co-price-field"><label id="co-price-label">默认单价（元/节，报名的优惠价另行填写）</label><input class="input input-amount" id="co-price" type="number" step="0.01" min="0" value="' + (c ? c.defaultPrice : '') + '"></div>' +
        '<div class="field" id="co-month-field"' + (c && c.billingMode === 'monthly' ? '' : ' style="display:none;"') + '>' +
          '<label>默认包月费（元/月，报名的优惠价另行填写）</label><input class="input input-amount" id="co-month" type="number" step="0.01" min="0" value="' + (c && c.billingMode === 'monthly' ? c.monthlyFee : '') + '">' +
          '<label style="display:block;margin-top:10px;">请假退费提醒（天，0=不提醒）</label>' +
          '<p class="hint" style="margin:6px 0 0;">包月学生当月请假达到该天数时提示（只提示不自动算钱）。</p>' +
          '<input class="input input-amount" id="co-threshold" type="number" step="1" min="0" value="' + (c && c.billingMode === 'monthly' ? c.leaveThreshold : '') + '" style="margin-top:6px;">' +
        '</div>' +
        '<button type="button" class="btn btn-primary btn-block" id="co-save">保存</button>' +
      '</div>';
    // 工作日开关：选中 = 周一~五 默认全上可点掉排除、周六日锁定；取消 = 恢复自由勾选
    const wdBox = mask.querySelector('#co-workday');
    const wdInputs = Array.prototype.slice.call(mask.querySelectorAll('.weekdays-pick .wd input'));
    function applyWorkday() {
      const on = wdBox.checked;
      wdInputs.forEach(i => {
        const v = Number(i.value);
        if (on) {
          // 工作日模式：周一~五可点选（点掉=排除），周六日锁定不可选
          i.disabled = v >= 1 && v <= 5 ? false : true;
          if (v < 1 || v > 5) i.checked = false;
        } else {
          i.disabled = false;
        }
      });
    }
    wdBox.addEventListener('change', applyWorkday);
    applyWorkday();
    // 默认计费方式切换：按次 ↔ 包月（单价 / 包月费+阈值 互显）
    const billingRadios = Array.prototype.slice.call(mask.querySelectorAll('input[name="co-billing"]'));
    function applyBilling() {
      const monthly = mask.querySelector('input[name="co-billing"]:checked').value === 'monthly';
      mask.querySelector('#co-price-field').style.display = monthly ? 'none' : '';
      mask.querySelector('#co-month-field').style.display = monthly ? '' : 'none';
    }
    billingRadios.forEach(r => r.addEventListener('change', applyBilling));
    applyBilling();
    mask.addEventListener('click', async function (e) {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'close' || e.target === mask) { root.removeChild(mask); return; }
      if (e.target.id === 'co-save') {
        const name = mask.querySelector('#co-name').value.trim();
        const workday = wdBox.checked;
        let weekdays = Array.prototype.filter.call(mask.querySelectorAll('.weekdays-pick .wd input:checked'), i => i).map(i => Number(i.value));
        const period = mask.querySelector('#co-period').value;
        if (!name) { Utils.toast('请填写班次名称'); return; }
        if (!weekdays.length) { Utils.toast('请至少勾选一个上课日（或先不勾选=手动登记）'); return; }
        const billing = mask.querySelector('input[name="co-billing"]:checked').value;
        const monthly = billing === 'monthly';
        const price = monthly ? 0 : Number(mask.querySelector('#co-price').value);
        const monthlyFee = monthly ? Number(mask.querySelector('#co-month').value) : 0;
        const threshold = monthly ? Number(mask.querySelector('#co-threshold').value) : 0;
        if (monthly && !(monthlyFee > 0)) { Utils.toast('请填写默认包月费'); return; }
        if (c) await store.updateCourse(c.id, { name, weekdays, period, defaultPrice: price || 0, workday, billingMode: billing, monthlyFee, leaveThreshold: threshold });
        else await store.addCourse(name, weekdays, period, price || 0, workday, billing, monthlyFee, threshold);
        root.removeChild(mask);
      }
    });
    root.appendChild(mask);
  }

  /* ---- 例外管理（停课 / 加课） ---- */
  function openExceptionModal(cid) {
    const c = store.data.courses.find(x => x.id === cid);
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal" style="max-width:420px;">' +
        '<div class="modal-head"><h3 class="modal-title">例外管理 · ' + esc(c ? c.name : '') + '</h3>' +
        '<button type="button" class="modal-close" data-act="close" aria-label="关闭">×</button></div>' +
        '<p class="hint">停课：这天该班次不上课（如临时放假）；加课：这天额外上课（如补课/调课）。法定节假日自动停课，无需添加。</p>' +
        '<div class="row" style="display:flex;gap:8px;align-items:flex-end;">' +
          '<div class="field" style="flex:1;margin:0;"><label>日期</label><input class="input" type="date" id="ex-date"></div>' +
          '<div class="field" style="flex:1;margin:0;"><label>类型</label><select class="input" id="ex-type">' +
            '<option value="skip">停课</option><option value="extra">加课</option></select></div>' +
          '<button type="button" class="btn btn-primary" id="ex-add">添加</button>' +
        '</div>' +
        '<div class="set-list" style="margin-top:10px;" id="ex-list"></div>' +
      '</div>';
    function renderExList() {
      const all = store.data.exceptions.filter(x => x.courseId === cid).sort((a, b) => a.date.localeCompare(b.date));
      mask.querySelector('#ex-list').innerHTML = all.length === 0
        ? '<div class="empty" style="padding:14px;"><div class="big">还没有例外</div></div>'
        : all.map(x =>
            '<div class="item"><div class="grow"><div class="name">' + x.date +
              ' <span class="chip ' + (x.type === 'skip' ? 'chip-gray' : 'chip-warn') + '">' + (x.type === 'skip' ? '停课' : '加课') + '</span></div></div>' +
              '<button type="button" class="btn btn-danger btn-sm" data-del="' + x.id + '">删除</button></div>'
          ).join('');
      mask.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
          await store.removeException(btn.dataset.del);
          renderExList();
        });
      });
    }
    mask.querySelector('#ex-add').addEventListener('click', async () => {
      const date = mask.querySelector('#ex-date').value;
      const type = mask.querySelector('#ex-type').value;
      if (!date) { Utils.toast('请选择日期'); return; }
      await store.addException(cid, date, type);
      mask.querySelector('#ex-date').value = '';
      renderExList();
    });
    mask.addEventListener('click', function (e) {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'close' || e.target === mask) { root.removeChild(mask); }
    });
    root.appendChild(mask);
    renderExList();
  }

  /* ================= 假期（寒暑假等，全校停课） ================= */
  function renderVacations(el) {
    const list = store.data.vacations.slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
    el.innerHTML =
      '<div class="card"><div class="card-title">假期设置 <button type="button" class="btn btn-primary btn-sm" data-act="add-vac">添加假期</button></div>' +
      '<p class="hint" style="margin-top:-6px;">假期范围内的所有班次自动停课。法定节假日已内置（自动停课），这里只设寒暑假等自定义假期。2026 年秋学期以节假日和调休为准。</p>' +
      '<div class="set-list">' +
        (list.length === 0
          ? '<div class="empty" style="padding:24px;"><div class="big">还没有自定义假期</div></div>'
          : list.map(v =>
            '<div class="item" data-vid="' + v.id + '">' +
              '<div class="grow"><div class="name">' + esc(v.name) + '</div>' +
              '<div class="sub">' + v.startDate + ' 至 ' + v.endDate + '</div></div>' +
              '<button type="button" class="btn btn-danger btn-sm" data-act="del">删除</button>' +
            '</div>'
          ).join('')) +
      '</div></div>';
    el.querySelector('[data-act="add-vac"]').addEventListener('click', () => openVacationModal());
    el.querySelectorAll('.item').forEach(item => {
      item.querySelector('[data-act="del"]').addEventListener('click', async () => {
        const v = store.data.vacations.find(x => x.id === item.dataset.vid);
        const ok = await Utils.confirmDialog('删除假期「' + v.name + '」？', '删除后该日期范围内将恢复排课。', '删除');
        if (ok) await store.removeVacation(v.id);
      });
    });
  }

  function openVacationModal() {
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal" style="max-width:380px;">' +
        '<div class="modal-head"><h3 class="modal-title">添加假期</h3>' +
        '<button type="button" class="modal-close" data-act="close" aria-label="关闭">×</button></div>' +
        '<div class="field"><label>名称</label><input class="input" id="va-name" placeholder="如：2026 寒假、国庆停课"></div>' +
        '<div class="field"><label>开始日期</label><input class="input" type="date" id="va-start"></div>' +
        '<div class="field"><label>结束日期</label><input class="input" type="date" id="va-end"></div>' +
        '<button type="button" class="btn btn-primary btn-block" id="va-save">保存</button>' +
      '</div>';
    mask.addEventListener('click', async function (e) {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'close' || e.target === mask) { root.removeChild(mask); return; }
      if (e.target.id === 'va-save') {
        const name = mask.querySelector('#va-name').value.trim();
        const start = mask.querySelector('#va-start').value;
        const end = mask.querySelector('#va-end').value;
        if (!name) { Utils.toast('请填写假期名称'); return; }
        if (!start || !end) { Utils.toast('请选择起止日期'); return; }
        if (end < start) { Utils.toast('结束日期不能早于开始日期'); return; }
        await store.addVacation(name, start, end);
        root.removeChild(mask);
      }
    });
    root.appendChild(mask);
  }

  /* ================= 报名 ================= */
  function renderEnrollments(el) {
    const list = store.data.enrollments.map(e => ({
      e,
      s: store.studentById(e.studentId),
      c: store.courseById(e.courseId)
    })).sort((a, b) => a.s.name.localeCompare(b.s.name, 'zh'));

    el.innerHTML =
      '<div class="card"><div class="card-title">报名（学生 × 课程 × 优惠单价） <button type="button" class="btn btn-primary btn-sm" data-act="add-enr">添加报名</button></div>' +
      '<p class="hint" style="margin-top:-6px;">同一个课程对不同学生可以报不同价格；一个学生可报多门课。</p>' +
      '<div class="set-list">' +
        (list.length === 0
          ? '<div class="empty" style="padding:24px;"><div class="big">还没有报名</div>添加报名后，日历上就会出现可标记的学生</div>'
          : list.map(x =>
            '<div class="item" data-eid="' + x.e.id + '">' +
              '<div class="grow"><div class="name">' + esc(x.s ? x.s.name : '未知学生') + ' <span class="hint">→</span> ' + esc(x.c ? x.c.name : '未知课程') + '</div>' +
              '<div class="sub">' + (x.e.billingMode === 'monthly'
                ? '<span class="chip chip-warn">包月</span> ' + Utils.fmtMoney(x.e.monthlyFee) + ' 元/月'
                : Utils.fmtMoney(x.e.price) + ' 元/节') +
                (x.e.active ? '' : ' · 已停用') + '</div></div>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-act="toggle">' + (x.e.active ? '停用' : '启用') + '</button>' +
              '<button type="button" class="btn btn-danger btn-sm" data-act="del">删除</button>' +
            '</div>'
          ).join('')) +
      '</div></div>';

    el.querySelector('[data-act="add-enr"]').addEventListener('click', () => openEnrollmentModal());
    el.querySelectorAll('.item').forEach(item => {
      const eid = item.dataset.eid;
      item.querySelector('[data-act="toggle"]').addEventListener('click', async () => {
        const e = store.data.enrollments.find(x => x.id === eid);
        await store.setEnrollmentActive(eid, !e.active);
      });
      item.querySelector('[data-act="del"]').addEventListener('click', async () => {
        const e = store.data.enrollments.find(x => x.id === eid);
        const s = store.studentById(e.studentId), c = store.courseById(e.courseId);
        const ok = await Utils.confirmDialog('删除这条报名？', (s ? s.name : '') + ' 的「' + (c ? c.name : '') + '」将被移除，历史出勤记录保留。', '删除');
        if (ok) await store.removeEnrollment(eid);
      });
    });
  }

  function openEnrollmentModal() {
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    const studentsOpts = store.data.students.map(s =>
      '<option value="' + s.id + '">' + esc(s.name) + (s.status === 'active' ? '' : '（停课）') + '</option>').join('');
    const coursesOpts = store.data.courses.map(c =>
      '<option value="' + c.id + '" data-billing="' + (c.billingMode === 'monthly' ? 'monthly' : 'perClass') + '"' +
        ' data-price="' + c.defaultPrice + '" data-fee="' + (c.monthlyFee || 0) + '">' +
        esc(c.name) + '（默认 ' + (c.billingMode === 'monthly' ? Utils.fmtMoney(c.monthlyFee) + '/月' : Utils.fmtMoney(c.defaultPrice) + '/节') + '）</option>').join('');
    mask.innerHTML =
      '<div class="modal">' +
        '<div class="modal-head"><h3 class="modal-title">添加报名</h3>' +
        '<button type="button" class="modal-close" data-act="close" aria-label="关闭">×</button></div>' +
        '<div class="field"><label>学生</label>' +
          '<div class="spicker">' +
            '<input class="input" id="enr-stu-search" placeholder="输入姓名搜索，点击选中" autocomplete="off">' +
            '<div class="spicker-list" id="enr-stu-list" hidden></div>' +
          '</div>' +
          '<select id="enr-student" hidden>' + (studentsOpts || '<option value="">（先添加学生）</option>') + '</select>' +
        '</div>' +
        '<div class="field"><label>课程</label><select class="input" id="enr-course">' + (coursesOpts || '<option value="">（先添加课程）</option>') + '</select></div>' +
        '<div class="field"><label>计费方式</label>' +
          '<div style="display:flex;gap:8px;">' +
            '<label class="billing-opt"><input type="radio" name="enr-billing" value="perClass" checked> <span>按节<br><small>每节课单价</small></span></label>' +
            '<label class="billing-opt"><input type="radio" name="enr-billing" value="monthly"> <span>包月<br><small>每月固定费，缺勤退费手动登记</small></span></label>' +
          '</div>' +
        '</div>' +
        '<div class="field"><label id="enr-price-label">该生优惠单价（元/节）</label><input class="input input-amount" id="enr-price" type="number" step="0.01" min="0" placeholder="选课程后自动带出默认价"></div>' +
        '<button type="button" class="btn btn-primary btn-block" id="enr-save">保存报名</button>' +
      '</div>';
    // 计费方式切换：更新价格输入框语义
    mask.querySelectorAll('input[name="enr-billing"]').forEach(radio => {
      radio.addEventListener('change', function () {
        const monthly = this.value === 'monthly';
        const label = mask.querySelector('#enr-price-label');
        const input = mask.querySelector('#enr-price');
        label.textContent = monthly ? '包月费用（元/月）' : '该生优惠单价（元/节）';
        input.placeholder = monthly ? '如 2000（当月有出勤即收整月费）' : '选课程后自动带出默认价';
      });
    });
    // 按班次默认计费方式带出：选课程 = 自动切计费方式 + 预填默认金额（仍可手动改，支持按次/包月混存）
    function applyCourseDefault() {
      const sel = mask.querySelector('#enr-course');
      const opt = sel.options[sel.selectedIndex];
      if (!opt || opt.dataset.billing === undefined) return;
      const monthly = opt.dataset.billing === 'monthly';
      const radio = mask.querySelector('input[name="enr-billing"][value="' + (monthly ? 'monthly' : 'perClass') + '"]');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      mask.querySelector('#enr-price').value = monthly ? opt.dataset.fee : opt.dataset.price;
    }
    mask.querySelector('#enr-course').addEventListener('change', applyCourseDefault);
    const courseSel = mask.querySelector('#enr-course');
    if (courseSel.options.length) {
      // 首开即带出第一个课程的默认计费方式与默认金额（课程下拉默认选中第一项，change 不会自动触发）
      applyCourseDefault();
    }
    // 学生可搜索选择器：输入关键字实时过滤，点击选中（隐藏 select 只存 id）
    (function bindStudentPicker(mask) {
      const input = mask.querySelector('#enr-stu-search');
      const listEl = mask.querySelector('#enr-stu-list');
      const sel = mask.querySelector('#enr-student');
      const students = store.data.students.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      if (!students.length) {
        input.placeholder = '（先添加学生）';
        input.disabled = true;
        return;
      }
      function render(filter) {
        const kw = (filter || '').trim();
        const items = students.filter(s => !kw || s.name.indexOf(kw) >= 0);
        listEl.innerHTML = items.length === 0
          ? '<div class="sp-empty">没有匹配的学生</div>'
          : items.map(s => '<div class="sp-item" data-id="' + s.id + '">' + esc(s.name) +
              (s.status === 'active' ? '' : '<span class="chip chip-gray" style="margin-left:6px;">停课</span>') + '</div>').join('');
        listEl.hidden = false;
      }
      input.addEventListener('focus', function () { render(input.value); });
      input.addEventListener('input', function () { sel.value = ''; render(input.value); });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
      listEl.addEventListener('click', function (e) {
        const it = e.target.closest('.sp-item');
        if (!it) return;
        const s = store.studentById(it.dataset.id);
        sel.value = it.dataset.id;
        input.value = s ? s.name : '';
        listEl.hidden = true;
      });
      document.addEventListener('click', function (e) {
        if (!mask.contains(e.target) || !e.target.closest('.spicker')) listEl.hidden = true;
      });
    })(mask);

    mask.addEventListener('click', async function (e) {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'close' || e.target === mask) { root.removeChild(mask); return; }
      if (e.target.id === 'enr-save') {
        const studentId = mask.querySelector('#enr-student').value;
        const courseId = mask.querySelector('#enr-course').value;
        const billingMode = mask.querySelector('input[name="enr-billing"]:checked').value;
        const amount = Number(mask.querySelector('#enr-price').value);
        if (!studentId || !courseId) {
          const kw = mask.querySelector('#enr-stu-search').value.trim();
          Utils.toast(!studentId && kw ? '请从列表中选择学生' : '请选择学生和课程');
          return;
        }
        if (billingMode === 'perClass') {
          if (!(amount >= 0)) { Utils.toast('请填写该生单价'); return; }
        } else {
          if (!(amount > 0)) { Utils.toast('请填写包月费用'); return; }
        }
        const dup = store.data.enrollments.find(x => x.studentId === studentId && x.courseId === courseId && x.active);
        if (dup) { Utils.toast('该生已报名此课程，可先停用旧报名再添加'); return; }
        await store.addEnrollment(studentId, courseId, billingMode === 'monthly' ? 0 : amount, billingMode, billingMode === 'monthly' ? amount : 0);
        root.removeChild(mask);
      }
    });
    root.appendChild(mask);
  }

  return { render, name: '设置' };
})();
