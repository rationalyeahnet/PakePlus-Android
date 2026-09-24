/* ============================================================
   课时记账 · 日历主视图（方框月历 + 排课 + 班次矩阵）
   单自然月默认（可开双月）· 周一为首列 ·
   学生下拉 + 月份切换刷新 · 有课日底色/完成度圆点/加课橙点/假期休标 ·
   点格子 → 当天班次登记面板（单生切换 + 整班勾选登记）·
   未来日期不可登记 · 底部月度汇总（含应到/实到）
   班次视图（矩阵）：行=排课日，列=学生；点格翻转、点行头=当天全勤、
   点列头=该生整月全勤、顶部按钮=本月全班全勤；批量保存 + 未保存三选
   ============================================================ */
window.App = window.App || {};
App.pages = App.pages || {};
App.pages.calendar = (function () {
  const store = App.store;
  let viewMonth = Utils.currentMonth();
  let dual = false;
  let studentId = null; // 'all'=全部学生；学生 id=只看该生；每次进入默认第一个在读学生
  let container = null;
  // 全局未保存标志：整班登记 / 结账面板 / 班次矩阵有未保存改动时置 true（供 beforeunload 兜底）
  let hasUnsaved = false;
  window.addEventListener('beforeunload', function (e) {
    if (hasUnsaved) { e.preventDefault(); e.returnValue = ''; }
  });

  // 视图：'student' 学生方框月历 | 'course' 班次矩阵
  let view = 'student';
  let matCourseId = null;
  let matDraft = new Map();   // key `sid|date` -> 目标状态
  let matChanged = new Set(); // 有改动的 key
  let matDays = [];           // [{date, future, extra, workday}]
  let matStudents = [];       // [{id, name, monthly}]

  // 班次 → 颜色（按 courses 数组顺序稳定分配）
  function colorOf(courseId) {
    const idx = store.data.courses.findIndex(c => c.id === courseId);
    return Utils.courseColor(idx < 0 ? 0 : idx);
  }

  // 有报名的在读学生（日历卡片）
  function rows() {
    return store.data.students
      .filter(s => s.status === 'active' && store.activeEnrollments(s.id).length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }

  function esc(s) { return Utils.escapeHtml(s); }

  function render(el) {
    container = el;
    if (view === 'course') { renderCourseView(el); return; }
    renderStudentView(el);
  }

  // 学生下拉：按班次分组（一个学生可出现在多个班次组；含「全部学生」）
  function studentOptsHtml(students) {
    const sel = id => studentId === id ? ' selected' : '';
    let html = '<option value="all"' + sel('all') + '>全部学生</option>';
    store.data.courses
      .filter(c => c.active !== false)
      .forEach(c => {
        const members = students.filter(s => store.enrollmentInfo(s.id, c.id));
        if (!members.length) return;
        html += '<optgroup label="' + esc(c.name + (c.period ? ' · ' + c.period : '')) + '">' +
          members.map(s => '<option value="' + s.id + '"' + sel(s.id) + '>' + esc(s.name) + '</option>').join('') +
          '</optgroup>';
      });
    return html;
  }

  // 学生视图：方框月历
  function renderStudentView(el) {
    const students = rows();
    // 默认选择第一个在读学生；选中项已失效（被停用/删除）时回落（'all' 由用户手动选择，不回落）
    if (studentId === null || (studentId !== 'all' && !students.some(s => s.id === studentId))) {
      studentId = students.length ? students[0].id : 'all';
    }
    const opts = studentOptsHtml(students);

    el.innerHTML =
      '<div class="page-head">' +
        '<div><h1 class="page-title">出勤日历</h1>' +
        '<p class="page-sub">浅绿=该生有课日，点格登记；空心圆=未到，实心圆=已到；右上红点=当天有课未登记完。法定节假日/假期自动停课（休）。</p></div>' +
        '<div class="view-switch">' +
          '<button type="button" class="btn btn-primary btn-sm" data-view="student">学生</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-view="course">班次</button>' +
        '</div>' +
      '</div>' +
      '<div class="card" style="padding:14px;">' +
        '<div class="cal-toolbar">' +
          '<select class="input cal-student-select" id="cal-student" aria-label="选择学生">' + opts + '</select>' +
          '<div class="cal-month-nav">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="prev" aria-label="上一月">‹</button>' +
            '<span class="month-label" id="cal-month-label"></span>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="next" aria-label="下一月">›</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="today">本月</button>' +
          '</div>' +
          '<div style="flex:1;"></div>' +
          '<label class="hint" style="display:flex;align-items:center;gap:6px;cursor:pointer;">' +
            '<input type="checkbox" id="cal-dual" ' + (dual ? 'checked' : '') + '> 显示下月' +
          '</label>' +
        '</div>' +
        '<div id="cal-stu-list" class="stu-list"></div>' +
        '<div id="cal-foot"></div>' +
      '</div>';

    el.querySelector('[data-view="course"]').addEventListener('click', () => { view = 'course'; render(el); });
    el.querySelector('#cal-student').addEventListener('change', e => { studentId = e.target.value; render(el); });
    el.querySelector('[data-act="prev"]').addEventListener('click', () => { viewMonth = Utils.shiftMonth(viewMonth, -1); render(el); });
    el.querySelector('[data-act="next"]').addEventListener('click', () => { viewMonth = Utils.shiftMonth(viewMonth, 1); render(el); });
    el.querySelector('[data-act="today"]').addEventListener('click', () => { viewMonth = Utils.currentMonth(); render(el); });
    el.querySelector('#cal-dual').addEventListener('change', e => { dual = e.target.checked; render(el); });

    if (students.length === 0) {
      el.querySelector('#cal-stu-list').innerHTML =
        '<div class="empty" style="width:100%;">' +
          '<div class="big">还没有可标记的学生</div>' +
          '先去「设置」添加学生、添加班次并给学生报名，这里就会出现该生的月历。' +
        '</div>';
      el.querySelector('#cal-foot').innerHTML = '';
      return;
    }

    // 只渲染选中学生的日历（'all' 时渲染全部）
    const visible = studentId === 'all' ? students : students.filter(s => s.id === studentId);

    const months = [viewMonth];
    if (dual) months.push(Utils.shiftMonth(viewMonth, 1));

    const list = el.querySelector('#cal-stu-list');
    const listEl = document.createDocumentFragment();
    visible.forEach(s => listEl.appendChild(buildStuCard(s, months)));
    list.appendChild(listEl);

    el.querySelector('#cal-month-label').textContent =
      Utils.monthLabel(viewMonth) + (dual ? ' · ' + Utils.monthShort(Utils.shiftMonth(viewMonth, 1)) : '');
    el.querySelector('#cal-foot').innerHTML = buildFoot(visible, viewMonth);
    bind(el);
  }

  // 单个学生的月历卡片：块头（姓名+价格徽标+应到实到+本月应收）+ 一个月或两个月历方框
  function buildStuCard(s, months) {
    const wrap = document.createElement('div');
    wrap.className = 'stu-card';
    wrap.dataset.sid = s.id;

    const enrs = store.activeEnrollments(s.id);
    const badges = enrs.map(e => {
      const c = store.courseById(e.courseId);
      const isMonthly = e.billingMode === 'monthly';
      return '<span class="chip">' +
        '<span class="course-dot" style="background:' + colorOf(e.courseId) + ';"></span>' +
        esc(c ? c.name : '未知') + ' ' +
        (isMonthly ? '<span class="chip chip-warn" style="margin-left:2px;">包月</span> ' + Utils.fmtMoney(e.monthlyFee) + '/月' : Utils.fmtMoney(e.price) + '/节') +
      '</span>';
    }).join('');
    const bal = store.balance(s.id);
    const receivable = store.monthlyReceivable(s.id, months[0]);
    const should = store.monthlyShouldAttend(s.id, months[0]);
    const actual = store.monthlyCount(s.id, months[0]);

    wrap.innerHTML =
      '<div class="stu-head">' +
        '<div style="display:flex;align-items:center;gap:8px;min-width:0;">' +
          '<span class="stu-name" data-act="settle">' + esc(s.name) + '</span>' +
          (bal !== 0
            ? '<span class="chip ' + (bal < 0 ? 'chip-red' : 'chip-gray') + '">' + (bal < 0 ? '欠' : '余') + '</span>'
            : '') +
        '</div>' +
        '<div class="stu-head-r">' + Utils.monthShort(months[0]) + '应收 <b class="money">' + Utils.fmtMoney(receivable) + '</b>' +
          '<button type="button" class="btn btn-primary btn-sm" data-act="settle" style="margin-left:8px;">结账</button>' +
        '</div>' +
      '</div>' +
      '<div class="stu-badges">' +
        (badges || '') +
        '<span class="chip chip-gray">本月应到 ' + should + ' · 实到 ' + actual + '</span>' +
      '</div>' +
      '<div class="stu-months' + (months.length > 1 ? ' two' : '') + '">' +
        months.map(m => buildMonthGrid(s, m, months.length > 1)).join('') +
      '</div>';

    // 块头姓名与结账按钮都打开结账面板
    wrap.querySelectorAll('[data-act="settle"]').forEach(elm => {
      elm.addEventListener('click', e => {
        e.stopPropagation();
        openSettle(s.id, months[0]);
      });
    });
    return wrap;
  }

  // 该生某天是否有报名班次被 假期/法定节假日 关闭（显示"休"）
  function closedByHoliday(s, dateKey) {
    return store.data.courses.some(c => {
      if (c.active === false) return false;
      if (!store.enrollmentInfo(s.id, c.id)) return false;
      if (!store.courseWeekdayOn(c, dateKey)) return false;
      const ex = store.data.exceptions.filter(x => x.courseId === c.id && x.date === dateKey);
      if (ex.some(x => x.type === 'skip')) return false;
      if (ex.some(x => x.type === 'extra')) return false;
      return store.inVacation(dateKey) || (App.holidays && App.holidays.isHoliday(dateKey));
    });
  }

  // 一个月历方框：周表头（一~日，周一为首列）+ 7 列方框格子
  function buildMonthGrid(s, month, withLabel) {
    const { cells } = Utils.buildMonthCells(month);
    const today = Utils.todayKey();
    const weekdays = ['一', '二', '三', '四', '五', '六', '日'].map(w =>
      '<span>' + w + '</span>').join('');
    const grid = cells.map(c => {
      if (!c.inMonth) return '<div class="stu-day off"></div>';
      const future = c.key > today;
      const sems = store.studentSessions(s.id, c.key);
      const atts = store.data.attendances.filter(a => a.studentId === s.id && a.date === c.key);
      const closed = !sems.length && closedByHoliday(s, c.key);

      let cls = 'stu-day';
      if (c.key === today) cls += ' today';
      if (future) cls += ' future';
      if (sems.length) cls += ' session';
      if (closed) cls += ' closed';

      let inner = '<span class="dnum">' + c.day + '</span>';
      // 完成度圆点：当天有应到班次且非未来
      if (sems.length && !future) {
        const done = sems.every(ses => atts.some(a => a.courseId === ses.courseId));
        inner += '<span class="done-dot ' + (done ? 'ok' : 'miss') + '" title="' + (done ? '全部登记' : '有课未登记') + '"></span>';
      }
      // 班次色点：已到实心 / 未到空心（加课例外橙边）
      if (sems.length) {
        inner += '<div class="sess-dots">' + sems.map(ses => {
          const on = atts.some(a => a.courseId === ses.courseId);
          const color = colorOf(ses.courseId);
          return '<span class="sess-dot' + (on ? ' on' : '') + (ses.extra ? ' extra' : '') + '"' +
            ' style="border-color:' + color + ';' + (on ? 'background:' + color + ';' : '') + '"' +
            ' title="' + esc(ses.name) + (ses.extra ? '（加课）' : '') + '"></span>';
        }).join('') + '</div>';
      }
      if (closed) inner += '<span class="flag-closed">休</span>';

      return '<div class="' + cls + '" data-student="' + s.id + '" data-date="' + c.key + '">' + inner + '</div>';
    }).join('');
    return '<div class="stu-month">' +
      (withLabel ? '<div class="stu-month-label">' + Utils.monthLabel(month) + '</div>' : '') +
      '<div class="stu-weekrow">' + weekdays + '</div>' +
      '<div class="stu-month-grid">' + grid + '</div>' +
    '</div>';
  }

  // 底部汇总表：学生 | 出勤(实到/应到) | 应收 | 本月已收 | 余额
  function buildFoot(students, month) {
    const rowsHtml = students.map(s => {
      const count = store.monthlyCount(s.id, month);
      const should = store.monthlyShouldAttend(s.id, month);
      const rec = store.monthlyReceivable(s.id, month);
      const paid = store.data.payments
        .filter(p => p.studentId === s.id && p.month === month && p.type === 'settle')
        .reduce((a, p) => a + Number(p.received), 0);
      const bal = store.balance(s.id);
      const balTxt = bal === 0
        ? '<span class="hint">结清</span>'
        : bal < 0
          ? '<span class="money money-neg">欠 ' + Utils.fmtMoney(-bal) + '</span>'
          : '<span class="money money-pos">余 ' + Utils.fmtMoney(bal) + '</span>';
      return '<tr class="row-link" data-sid="' + s.id + '">' +
        '<td style="font-weight:600;">' + esc(s.name) + '</td>' +
        '<td>' + count + '/' + should + '</td>' +
        '<td class="money">' + Utils.fmtMoney(rec) + '</td>' +
        '<td class="money">' + Utils.fmtMoney(paid) + '</td>' +
        '<td>' + balTxt + '</td>' +
      '</tr>';
    }).join('');
    return '<div class="card cal-foot-card">' +
      '<div class="card-title">' + Utils.monthLabel(month) + ' 汇总 <span class="hint" style="font-weight:400;">出勤=实到/应到，点行结账</span></div>' +
      '<div class="table-wrap"><table class="list">' +
        '<colgroup><col style="width:24%"><col style="width:14%"><col style="width:18%"><col style="width:20%"><col style="width:24%"></colgroup>' +
        '<thead><tr><th>学生</th><th>出勤</th><th>应收</th><th>本月已收</th><th>余额</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table></div>' +
    '</div>';
  }

  /* ---------- 交互 ---------- */
  function bind(el) {
    // 格子点击：进入当天登记面板（委托到列表）
    el.querySelector('#cal-stu-list').addEventListener('click', function (e) {
      const cell = e.target.closest('.stu-day');
      if (!cell || cell.classList.contains('off')) return;
      const sid = cell.dataset.student;
      const date = cell.dataset.date;
      const student = store.studentById(sid);
      if (!student) return;

      if (cell.classList.contains('future')) {
        Utils.toast('未来日期不可登记，差额通过结账时的余额调整');
        return;
      }
      if (cell.classList.contains('closed')) {
        Utils.toast('这天是假期/节假日自动停课；如需上课请在设置中添加「加课」例外');
        return;
      }
      openDayPanel(student, date);
    });

    // 汇总表行点击 → 结账
    el.querySelector('#cal-foot').addEventListener('click', function (e) {
      const tr = e.target.closest('tr[data-sid]');
      if (tr) openSettle(tr.dataset.sid, viewMonth);
    });
  }

  /* ================= 班次视图：月度登记矩阵 ================= */
  // 行=排课日（含加课/补班标），列=该班次报名学生；格子=到(✓)/未到
  // 点格翻转（未来行置灰不可点）；点行头=当天全班全勤；点列头=该生整月全勤；顶部按钮=本月全班全勤
  // 改动不落库，点「保存本月登记」一次写入；切换/离开前未保存三选
  function renderCourseView(el) {
    const courses = store.data.courses.filter(c => c.active !== false);
    if (matCourseId === null || !courses.some(c => c.id === matCourseId)) {
      matCourseId = courses.length ? courses[0].id : null;
    }
    matDraft = new Map();
    matChanged = new Set();
    const c = store.courseById(matCourseId);

    el.innerHTML =
      '<div class="page-head">' +
        '<div><h1 class="page-title">出勤日历</h1>' +
        '<p class="page-sub">班次视图：行=排课日，列=该班次学生，点格登记；点行头=当天全班全勤，点列头=该生整月全勤。法定节假日/假期自动停课。</p></div>' +
        '<div class="view-switch">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-view="student">学生</button>' +
          '<button type="button" class="btn btn-primary btn-sm" data-view="course">班次</button>' +
        '</div>' +
      '</div>' +
      '<div class="card" style="padding:14px;">' +
        '<div class="cal-toolbar">' +
          '<select class="input" id="mat-course" aria-label="选择班次">' +
            (courses.length === 0
              ? '<option value="">（还没有班次）</option>'
              : courses.map(x =>
                  '<option value="' + x.id + '"' + (x.id === matCourseId ? ' selected' : '') + '>' +
                  esc(x.name) + (x.period ? '（' + esc(x.period) + '）' : '') +
                  (x.workday ? ' · 工作日' : '') + '</option>'
                ).join('')) +
          '</select>' +
          '<div class="cal-month-nav">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="mprev" aria-label="上一月">‹</button>' +
            '<span class="month-label" id="mat-month-label"></span>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="mnext" aria-label="下一月">›</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="mtoday">本月</button>' +
          '</div>' +
          '<div style="flex:1;"></div>' +
          '<span class="dirty-badge" id="mat-dirty">● 未保存</span>' +
          '<button type="button" class="btn btn-primary" id="mat-save">保存本月登记</button>' +
        '</div>' +
        '<div id="mat-area"></div>' +
      '</div>';

    el.querySelector('[data-view="student"]').addEventListener('click', () => {
      guardLeave(() => { view = 'student'; render(el); });
    });
    el.querySelector('#mat-course').addEventListener('change', e => {
      guardLeave(() => { matCourseId = e.target.value; render(el); });
    });
    el.querySelector('[data-act="mprev"]').addEventListener('click', () => {
      guardLeave(() => { viewMonth = Utils.shiftMonth(viewMonth, -1); render(el); });
    });
    el.querySelector('[data-act="mnext"]').addEventListener('click', () => {
      guardLeave(() => { viewMonth = Utils.shiftMonth(viewMonth, 1); render(el); });
    });
    el.querySelector('[data-act="mtoday"]').addEventListener('click', () => {
      guardLeave(() => { viewMonth = Utils.currentMonth(); render(el); });
    });
    el.querySelector('#mat-save').addEventListener('click', async () => { await applyMatDraft(); });

    if (!c) {
      el.querySelector('#mat-area').innerHTML =
        '<div class="empty" style="padding:40px 16px;"><div class="big">还没有班次</div>' +
        '先在「设置」添加班次并给学生报名，这里就会出现月度登记矩阵。</div>';
      updateMatDirty();
      return;
    }
    buildMatrix();
    el.querySelector('#mat-area').innerHTML = matrixHtml();
    el.querySelector('#mat-month-label').textContent = Utils.monthLabel(viewMonth);
    bindMatrix(el);
    updateMatDirty();
  }

  // 构建矩阵数据：本月该班次排课日 + 报名学生 + 当前出勤状态
  function buildMatrix() {
    const month = viewMonth;
    const p = month.split('-').map(Number);
    const days = new Date(p[0], p[1], 0).getDate();
    const today = Utils.todayKey();
    const c = store.courseById(matCourseId);
    const isWorkdayMode = !!(c && c.workday);
    matDays = [];
    for (let d = 1; d <= days; d++) {
      const key = month + '-' + Utils.pad(d);
      const ses = store.sessionsForDate(key).find(s => s.courseId === matCourseId);
      if (!ses) continue;
      matDays.push({
        date: key,
        future: key > today,
        extra: !!ses.extra,
        // 补班标仅对「工作日」模式有意义：该班次借调休上班日上课；普通模式按固定周几排课，与调休无关
        workday: !!(isWorkdayMode && App.holidays && App.holidays.isWorkday(key))
      });
    }
    matStudents = store.data.enrollments
      .filter(e => e.courseId === matCourseId && e.active)
      .map(e => {
        const s = store.studentById(e.studentId);
        return s ? { id: s.id, name: s.name, monthly: e.billingMode === 'monthly' } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    matDraft = new Map();
    matChanged = new Set();
    store.data.attendances
      .filter(a => a.courseId === matCourseId)
      .forEach(a => matDraft.set(a.studentId + '|' + a.date, true));
  }

  function matrixHtml() {
    if (matStudents.length === 0) {
      return '<div class="empty" style="padding:30px 16px;"><div class="big">该班次还没有报名学生</div>' +
        '先去「设置 → 报名」添加学生。</div>';
    }
    const heads = matStudents.map(s =>
      '<th class="mat-stu" data-sid="' + s.id + '" title="点击=该生整月全勤">' +
        '<span class="stu-name">' + esc(s.name) + '</span>' +
        (s.monthly ? '<span class="chip chip-warn">包</span>' : '') +
      '</th>').join('');
    const rowsHtml = matDays.map(day => {
      const dateTxt = day.date.slice(5).replace('-', '/');
      const wdTxt = '日一二三四五六'[Utils.weekdayOf(day.date)];
      const cells = matStudents.map(s => {
        const key = s.id + '|' + day.date;
        const on = !!matDraft.get(key);
        return '<td><button type="button" class="mat-cell' + (on ? ' on' : '') + (day.future ? ' future' : '') + '"' +
          ' data-key="' + key + '"' + (day.future ? ' disabled' : '') +
          ' aria-label="' + esc(s.name) + ' ' + dateTxt + (on ? ' 已到' : ' 未到') + '"></button></td>';
      }).join('');
      return '<tr class="' + (day.future ? 'mat-future-row' : '') + '">' +
        '<td class="mat-date' + (day.future ? ' future' : '') + '" data-date="' + day.date + '"' +
          (day.future ? '' : ' title="点击=当天全班全勤"') + '>' +
          '<span class="mat-day">' + dateTxt + '</span><span class="mat-wd">' + wdTxt + '</span>' +
          (day.extra ? '<span class="mat-flag">加</span>' : '') +
          (day.workday ? '<span class="mat-flag">补</span>' : '') +
        '</td>' + cells + '</tr>';
    }).join('');
    const footCells = matStudents.map(s => {
      let should = 0, att = 0;
      matDays.forEach(day => {
        if (day.future) return;
        should++;
        if (matDraft.get(s.id + '|' + day.date)) att++;
      });
      const rate = should ? Math.round(att / should * 100) : 0;
      return '<td class="mat-foot' + (rate < 60 ? ' bad' : '') + '" data-sid="' + s.id + '">' +
        att + '/' + should + '<small>' + rate + '%</small></td>';
    }).join('');
    const colGroup = '<colgroup><col style="width:92px">' +
      matStudents.map(function () { return '<col style="width:52px">'; }).join('') + '</colgroup>';
    return '<div class="mat-wrap"><table class="mat">' + colGroup +
      '<thead><tr><th class="mat-date-col">日期</th>' + heads + '</tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
      '<tfoot><tr><td class="mat-date-col">实到/应到</td>' + footCells + '</tr></tfoot>' +
      '</table></div>' +
      '<div class="mat-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm" id="mat-all"' + (matDays.length === 0 ? ' disabled' : '') + '>本月全班全勤（到今天）</button>' +
        '<span class="hint">未来日期不可登记；改动后需点「保存本月登记」。</span>' +
      '</div>';
  }

  function bindMatrix(el) {
    el.querySelector('#mat-area').addEventListener('click', function (e) {
      const cell = e.target.closest('.mat-cell');
      if (cell) {
        if (cell.disabled) return;
        const key = cell.dataset.key;
        const next = !matDraft.get(key);
        matDraft.set(key, next);
        matChanged.add(key);
        cell.classList.toggle('on', next);
        const label = cell.getAttribute('aria-label').replace(/ 已到| 未到/, next ? ' 已到' : ' 未到');
        cell.setAttribute('aria-label', label);
        updateMatDirty();
        updateMatFoot();
        return;
      }
      // 点行头：当天全班全勤
      const dateTd = e.target.closest('.mat-date');
      if (dateTd && !dateTd.classList.contains('future') && matStudents.length) {
        matStudents.forEach(s => {
          const key = s.id + '|' + dateTd.dataset.date;
          if (!matDraft.get(key)) { matDraft.set(key, true); matChanged.add(key); }
        });
        Utils.toast(dateTd.dataset.date.slice(5).replace('-', '/') + ' 全班已标记到课（未保存）');
        updateMatAllCells();
        updateMatDirty();
        updateMatFoot();
        return;
      }
      // 点列头：该生整月全勤
      const th = e.target.closest('th.mat-stu');
      if (th) {
        const sid = th.dataset.sid;
        matDays.forEach(day => {
          if (day.future) return;
          const key = sid + '|' + day.date;
          if (!matDraft.get(key)) { matDraft.set(key, true); matChanged.add(key); }
        });
        Utils.toast('已将 ' + th.textContent.trim().replace(/\s+/g, ' ') + ' 本月排课日标记到课（未保存）');
        updateMatAllCells();
        updateMatDirty();
        updateMatFoot();
      }
    });
    const allBtn = el.querySelector('#mat-all');
    if (allBtn) allBtn.addEventListener('click', function () {
      matStudents.forEach(s => matDays.forEach(day => {
        if (day.future) return;
        const key = s.id + '|' + day.date;
        if (!matDraft.get(key)) { matDraft.set(key, true); matChanged.add(key); }
      }));
      Utils.toast('本月全部排课日已标记到课（未保存）');
      updateMatAllCells();
      updateMatDirty();
      updateMatFoot();
    });
  }

  function updateMatDirty() {
    hasUnsaved = matChanged.size > 0;
    const badge = document.getElementById('mat-dirty');
    if (badge) badge.classList.toggle('show', hasUnsaved);
    const save = document.getElementById('mat-save');
    if (save) save.disabled = matChanged.size === 0;
  }
  function updateMatFoot() {
    const foots = document.querySelectorAll('#mat-area tfoot td.mat-foot');
    matStudents.forEach(s => {
      let should = 0, att = 0;
      matDays.forEach(day => {
        if (day.future) return;
        should++;
        if (matDraft.get(s.id + '|' + day.date)) att++;
      });
      const rate = should ? Math.round(att / should * 100) : 0;
      const td = Array.prototype.find.call(foots, x => x.dataset.sid === s.id);
      if (td) {
        td.className = 'mat-foot' + (rate < 60 ? ' bad' : '');
        td.innerHTML = att + '/' + should + '<small>' + rate + '%</small>';
      }
    });
  }
  function updateMatAllCells() {
    document.querySelectorAll('#mat-area .mat-cell').forEach(cell => {
      cell.classList.toggle('on', !!matDraft.get(cell.dataset.key));
    });
  }

  async function applyMatDraft() {
    if (matChanged.size === 0) { Utils.toast('本月没有需要保存的改动'); return; }
    const changes = [];
    matChanged.forEach(key => {
      const idx = key.indexOf('|');
      changes.push({ studentId: key.slice(0, idx), date: key.slice(idx + 1), attend: !!matDraft.get(key) });
    });
    await store.saveAttendanceBatch(matCourseId, changes);
    hasUnsaved = false;
    matChanged = new Set();
    updateMatDirty();
    Utils.toast('本月登记已保存');
    // onChange 自动触发整页重渲染（矩阵从新数据重建）
  }
  function discardMatDraft() {
    hasUnsaved = false;
    matDraft = new Map();
    matChanged = new Set();
  }
  // 矩阵内切换（视图/班次/月份）前的未保存三选
  async function guardLeave(action) {
    if (matChanged.size === 0) { action(); return; }
    const choice = await Utils.choiceDialog(
      '本月出勤还没保存',
      '改动还没写入记录。保存后继续；放弃则本次勾选全部丢失。',
      [
        { key: 'save', text: '保存并继续', cls: 'btn-primary' },
        { key: 'stay', text: '返回\n继续登记' },
        { key: 'discard', text: '放弃改动', cls: 'btn-danger' }
      ]
    );
    if (choice === null || choice === 'stay') return;
    if (choice === 'save') { await applyMatDraft(); action(); return; }
    discardMatDraft();
    action();
  }
  // 导航离开（切 Tab）前的未保存确认；由 app.js 调用
  function confirmLeave() {
    if (view !== 'course' || matChanged.size === 0) return Promise.resolve(true);
    return Utils.choiceDialog(
      '本月出勤还没保存',
      '改动还没写入记录。保存后离开；放弃则本次勾选全部丢失。',
      [
        { key: 'save', text: '保存并离开', cls: 'btn-primary' },
        { key: 'stay', text: '返回\n继续登记' },
        { key: 'discard', text: '放弃改动', cls: 'btn-danger' }
      ]
    ).then(function (choice) {
      if (choice === null || choice === 'stay') return false;
      if (choice === 'save') { return applyMatDraft().then(function () { return true; }); }
      discardMatDraft();
      return true;
    });
  }

  // 当天登记面板：该生当天应到班次（可单生切换）+ 整班登记入口
  function openDayPanel(student, date) {
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    const sems = store.studentSessions(student.id, date);
    const atts = store.data.attendances.filter(a => a.studentId === student.id && a.date === date);
    const holidayName = App.holidays && App.holidays.holidayName(date);
    const vac = store.data.vacations.find(v => v.startDate <= date && date <= v.endDate);

    const rowsHtml = sems.length === 0
      ? '<div class="empty" style="padding:18px;"><div class="big">该生这天没有排课</div></div>'
      : sems.map(ses => {
          const c = store.courseById(ses.courseId);
          const on = atts.some(a => a.courseId === ses.courseId);
          const leave = store.absenceFor(student.id, ses.courseId, date);
          return '<div class="item" data-cid="' + ses.courseId + '">' +
            '<div class="grow"><div class="name" style="display:flex;align-items:center;gap:6px;">' +
              '<span class="course-dot" style="background:' + colorOf(ses.courseId) + ';"></span>' +
              esc(c ? c.name : '未知') +
              (ses.extra ? ' <span class="chip chip-warn" style="font-size:11px;">加</span>' : '') +
            '</div>' +
            '<div class="sub">' + (c && c.period ? esc(c.period) : '') +
              ' · <span class="' + (on ? 'money money-pos' : 'money-neg') + '">' + (on ? '已到' : '未到') + '</span>' +
              (leave ? ' <span class="chip chip-warn" style="font-size:11px;">请假' +
                (leave.reason ? '·' + esc(leave.reason) : '') + '</span>' : '') +
            '</div></div>' +
            (on
              ? '<button type="button" class="btn btn-ghost btn-sm" data-act="toggle">取消</button>'
              : '<button type="button" class="btn btn-ghost btn-sm" data-act="leave">' + (leave ? '改请假' : '请假') + '</button>' +
                '<button type="button" class="btn btn-primary btn-sm" data-act="toggle">签到</button>') +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="roll">整班登记</button>' +
          '</div>';
        }).join('');

    mask.innerHTML =
      '<div class="modal">' +
        '<div class="modal-head">' +
          '<h3 class="modal-title">' + esc(student.name) + ' · ' + date.replace(/-/g, '/') + '</h3>' +
          '<button type="button" class="modal-close" data-act="close" aria-label="关闭">×</button>' +
        '</div>' +
        (holidayName ? '<p class="hint" style="margin:0 0 10px;">法定节假日：' + esc(holidayName) + '（自动停课）</p>' : '') +
        (vac ? '<p class="hint" style="margin:0 0 10px;">自定义假期：' + esc(vac.name) + '（自动停课）</p>' : '') +
        '<p class="hint" style="margin:0 0 12px;">点击「签到/取消」切换该生出勤；「整班登记」一次勾选全班学生。</p>' +
        '<div class="set-list" style="margin-bottom:4px;">' + rowsHtml + '</div>' +
      '</div>';

    mask.addEventListener('click', async function (e) {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'close' || e.target === mask) { root.removeChild(mask); return; }
      const item = e.target.closest('.item[data-cid]');
      if (!item) return;
      const cid = item.dataset.cid;
      if (act === 'toggle') {
        await store.toggleAttendance(student.id, cid, date);
        openDayPanel(student, date);
        mask.remove(); // 旧面板移除（重建）
      } else if (act === 'leave') {
        root.removeChild(mask);
        openLeavePanel(student, cid, date);
      } else if (act === 'roll') {
        root.removeChild(mask);
        openRollPanel(date, cid, student.id);
      }
    });
    root.appendChild(mask);
  }

  // 请假备注面板：未到原因（病假 / 事假 / 家长请假 / 自定义），不影响出勤统计
  function openLeavePanel(student, courseId, date) {
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    const c = store.courseById(courseId);
    const leave = store.absenceFor(student.id, courseId, date);
    const PRESETS = ['病假', '事假', '家长请假'];
    const hasCustom = leave && PRESETS.indexOf(leave.reason) < 0 && leave.reason;

    mask.innerHTML =
      '<div class="modal">' +
        '<div class="modal-head">' +
          '<h3 class="modal-title">请假备注 · ' + esc(student.name) +
            '<span class="hint" style="font-weight:400;">' + date.replace(/-/g, '/') + ' ' + esc(c ? c.name : '') + '</span></h3>' +
          '<button type="button" class="modal-close" data-act="close" aria-label="关闭">×</button>' +
        '</div>' +
        '<p class="hint" style="margin:0 0 12px;">记下未到原因，退费/对账时好说明。请假不算到课，也不影响应收计算。</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' +
          PRESETS.map(r =>
            '<button type="button" class="btn btn-ghost btn-sm leave-preset" data-reason="' + esc(r) + '">' + esc(r) + '</button>'
          ).join('') +
          '<button type="button" class="btn btn-ghost btn-sm leave-preset" data-reason="__custom__">其他…</button>' +
        '</div>' +
        '<div class="field" id="leave-custom-field"' + (hasCustom ? '' : ' style="display:none;"') + '>' +
          '<label>自定义原因</label><input class="input" id="leave-custom" maxlength="20" placeholder="如：外出旅行"' +
            ' value="' + (hasCustom ? esc(leave.reason) : '') + '">' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
          (leave
            ? '<button type="button" class="btn btn-danger" style="flex:1;" data-act="delete">删除请假</button>'
            : '') +
          '<button type="button" class="btn btn-primary" style="flex:1;" data-act="save">保存</button>' +
          '<button type="button" class="btn btn-ghost" data-act="back">返回</button>' +
        '</div>' +
      '</div>';

    mask.querySelectorAll('.leave-preset').forEach(b => b.addEventListener('click', () => {
      const r = b.dataset.reason;
      const field = mask.querySelector('#leave-custom-field');
      if (r === '__custom__') { field.style.display = ''; mask.querySelector('#leave-custom').focus(); return; }
      field.style.display = 'none';
      saveLeave(r);
    }));

    function saveLeave(reason) {
      store.addAbsence(student.id, courseId, date, reason).then(() => {
        root.removeChild(mask);
        openDayPanel(student, date);
        let msg = '已记请假：' + (reason || '未填');
        // 包月请假阈值提醒：只提示不自动算钱（班次 leaveThreshold>0 且当月请假达线）
        const c = store.courseById(courseId);
        const th = Number(c && c.leaveThreshold) || 0;
        if (th > 0) {
          const days = store.absenceDaysInMonth(student.id, courseId, date.slice(0, 7));
          if (days >= th) {
            msg += '。' + (c ? c.name : '') + ' 本月已请假 ' + days + ' 天（≥' + th + ' 天提醒线），需退费请手动登记';
          }
        }
        Utils.toast(msg);
      });
    }

    mask.addEventListener('click', async function (e) {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'close' || e.target === mask) { root.removeChild(mask); openDayPanel(student, date); return; }
      if (act === 'back') { root.removeChild(mask); openDayPanel(student, date); return; }
      if (act === 'save') {
        const custom = mask.querySelector('#leave-custom');
        const visible = mask.querySelector('#leave-custom-field').style.display !== 'none';
        saveLeave(visible && custom ? custom.value.trim() : (leave ? leave.reason : ''));
        return;
      }
      if (act === 'delete') {
        await store.removeAbsence(leave.id);
        root.removeChild(mask);
        openDayPanel(student, date);
        Utils.toast('已删除请假记录');
      }
    });
    root.appendChild(mask);
  }

  // 整班登记面板：某班次某天的学生勾选（快照式保存，带未保存提示）
  function openRollPanel(date, courseId, backStudentId) {
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    const c = store.courseById(courseId);
    const attended = store.attendedIdsFor(date, courseId);
    const students = store.data.enrollments
      .filter(e => e.courseId === courseId && e.active)
      .map(e => store.studentById(e.studentId))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));

    mask.innerHTML =
      '<div class="modal">' +
        '<div class="modal-head">' +
          '<h3 class="modal-title">整班登记 · ' + esc(c ? c.name : '') +
            '<span class="dirty-badge" id="roll-dirty">● 未保存</span></h3>' +
          '<button type="button" class="modal-close" data-act="close" aria-label="关闭">×</button>' +
        '</div>' +
        '<p class="hint" style="margin:0 0 10px;">' + date.replace(/-/g, '/') + ' 到课学生（勾选=已到，保存覆盖当天该班次）</p>' +
        '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-act="all">全选到课</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-act="none">全体缺勤</button>' +
        '</div>' +
        '<div class="set-list" id="roll-list" style="max-height:46vh;overflow-y:auto;">' +
          (students.length === 0
            ? '<div class="empty" style="padding:18px;"><div class="big">该班次还没有报名学生</div></div>'
            : students.map(s =>
              '<label class="item roll-row">' +
                '<input type="checkbox" data-sid="' + s.id + '"' + (attended.indexOf(s.id) >= 0 ? ' checked' : '') + '>' +
                '<span class="grow name">' + esc(s.name) + '</span>' +
                '<span class="roll-state">' + (attended.indexOf(s.id) >= 0 ? '<span class="chip">已到</span>' : '') + '</span>' +
              '</label>'
            ).join('')) +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-top:12px;">' +
          '<span class="hint" id="roll-count" style="flex:1;"></span>' +
          '<button type="button" class="btn btn-ghost" data-act="back">返回</button>' +
          '<button type="button" class="btn btn-primary" data-act="save" ' + (students.length === 0 ? 'disabled' : '') + '>保存登记</button>' +
        '</div>' +
      '</div>';

    // 未保存判定：直接比对当前勾选与已保存记录（不依赖 dirty 标记，标记丢失也能发现）
    function rollChanged() {
      const cur = Array.prototype.filter.call(mask.querySelectorAll('#roll-list input:checked'), i => i.dataset.sid);
      if (attended.length !== cur.length) return true;
      return cur.some(i => attended.indexOf(i.dataset.sid) < 0);
    }
    function updateDirty() {
      const d = rollChanged();
      hasUnsaved = d;
      mask.querySelector('#roll-dirty').classList.toggle('show', d);
    }
    function refresh() {
      const checked = mask.querySelectorAll('#roll-list input:checked').length;
      const total = students.length;
      mask.querySelector('#roll-count').textContent = '已到 ' + checked + ' / ' + total;
      mask.querySelectorAll('.roll-state').forEach(el => {
        const sid = el.parentElement.querySelector('input').dataset.sid;
        el.innerHTML = el.parentElement.querySelector('input').checked ? '<span class="chip">已到</span>' : '';
      });
      updateDirty();
    }
    async function doSave() {
      const ids = Array.prototype.map.call(mask.querySelectorAll('#roll-list input:checked'), i => i.dataset.sid);
      await store.saveSessionAttendance(date, courseId, ids);
      hasUnsaved = false;
      root.removeChild(mask);
      Utils.toast('已保存 ' + date.replace(/-/g, '/') + ' ' + (c ? c.name : '') + ' 出勤');
      if (backStudentId) openDayPanel(store.studentById(backStudentId), date);
    }
    function finishClose(backToDay) {
      hasUnsaved = false;
      root.removeChild(mask);
      if (backToDay && backStudentId) openDayPanel(store.studentById(backStudentId), date);
    }
    // 关闭前的未保存三选：保存并关闭 / 返回继续登记 / 放弃本次登记
    async function tryCloseRoll(backToDay) {
      if (!rollChanged()) { finishClose(backToDay); return; }
      const choice = await Utils.choiceDialog(
        '出勤还没保存',
        '勾选还没写入记录。保存会覆盖当天该班次出勤；放弃则本次勾选全部丢失。',
        [
          { key: 'save', text: '保存并关闭', cls: 'btn-primary' },
          { key: 'stay', text: '返回\n继续登记' },
          { key: 'discard', text: '放弃\n本次登记', cls: 'btn-danger' }
        ]
      );
      if (choice === null || choice === 'stay') return; // 点遮罩/× 或"返回继续"→ 留在面板
      if (choice === 'save') { await doSave(); return; }
      if (choice === 'discard') finishClose(backToDay);
    }

    mask.querySelectorAll('#roll-list input').forEach(i => i.addEventListener('change', refresh));
    mask.querySelector('[data-act="all"]').addEventListener('click', () => {
      mask.querySelectorAll('#roll-list input').forEach(i => { i.checked = true; });
      refresh();
    });
    mask.querySelector('[data-act="none"]').addEventListener('click', () => {
      mask.querySelectorAll('#roll-list input').forEach(i => { i.checked = false; });
      refresh();
    });
    mask.addEventListener('click', function (e) {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'close' || e.target === mask) { tryCloseRoll(false); return; }
      if (act === 'back') { tryCloseRoll(true); return; }
      if (act === 'save') { doSave(); }
    });
    root.appendChild(mask);
    refresh();
  }

  /* ---------- 结账面板：应收明细 + 实收 + 差额判断 + 保存 ---------- */
  function openSettle(studentId, month) {
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    const student = store.studentById(studentId);
    if (!student) return;

    function bodyHtml(m) {
      const items = store.monthlyItems(studentId, m);
      const keys = Object.keys(items);
      const receivable = store.monthlyReceivable(studentId, m);
      if (keys.length === 0) {
        return '<p class="hint" style="margin:0 0 10px;">该月没有出勤记录，先去日历标记上课。</p>' +
          '<a class="btn btn-ghost btn-block" href="#/students/' + studentId + '">查看完整历史账单与预收</a>';
      }
      const rowsHtml = keys.map(k => {
        const c = store.courseById(k);
        const it = items[k];
        const isMonthly = it.billingMode === 'monthly';
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--line-soft);">' +
          '<span>' + esc(c ? c.name : '未知') +
            (isMonthly
              ? ' <span class="chip chip-warn">包月</span>（' + Utils.fmtMoney(it.fee) + '/月，有出勤）'
              : ' × ' + it.count + ' 节（' + Utils.fmtMoney(it.price) + '/节）') +
          '</span>' +
          '<b class="money">' + Utils.fmtMoney(isMonthly ? it.fee : it.count * it.price) + '</b></div>';
      }).join('');
      return rowsHtml +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0 12px;font-weight:600;">' +
          '<span>应收合计</span><span class="money" style="font-size:17px;">' + Utils.fmtMoney(receivable) + '</span></div>' +
        '<div class="field"><label for="s-received">实收金额（元）</label>' +
          '<input class="input input-amount" id="s-received" type="number" step="0.01" min="0" placeholder="手动填写，可抹零或多收；缺勤退费用「登记退费」"></div>' +
        '<div class="field"><label>差额处理</label><div id="s-diff-box" style="font-size:13px;color:var(--ink-2);padding:6px 2px;">填实收后自动判断</div></div>' +
        '<div class="field"><label>备注（可选）</label><input class="input" id="s-note" placeholder="如：9月课时费、抹零 5 元"></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button type="button" class="btn btn-primary" style="flex:1;" id="s-save" disabled>保存账单</button>' +
          '<a class="btn btn-ghost" href="#/students/' + studentId + '">历史</a>' +
        '</div>';
    }

    mask.innerHTML =
      '<div class="modal">' +
        '<div class="modal-head">' +
          '<h3 class="modal-title">' + esc(student.name) + ' · 结账' +
            '<span class="dirty-badge" id="settle-dirty">● 未保存</span></h3>' +
          '<button type="button" class="modal-close" data-act="close" aria-label="关闭">×</button>' +
        '</div>' +
        '<div class="field" style="margin-bottom:10px;"><label>结算月份</label>' +
          '<select class="input" id="s-month">' +
            [Utils.shiftMonth(month, -1), month, Utils.shiftMonth(month, 1)].map(m =>
              '<option value="' + m + '"' + (m === month ? ' selected' : '') + '>' + Utils.monthLabel(m) + '</option>'
            ).join('') +
          '</select></div>' +
        '<div id="s-body">' + bodyHtml(month) + '</div>' +
      '</div>';

    // 未保存判定：填了实收或备注即视为有改动
    function settleChanged() {
      const r = mask.querySelector('#s-received');
      if (!r) return false;
      if (r.value !== '') return true;
      const n = mask.querySelector('#s-note');
      return !!(n && n.value.trim() !== '');
    }
    function updateSettleDirty() {
      const d = settleChanged();
      hasUnsaved = d;
      const badge = mask.querySelector('#settle-dirty');
      if (badge) badge.classList.toggle('show', d);
    }
    async function doSettleSave() {
      const receivedInput = mask.querySelector('#s-received');
      if (!receivedInput) { hasUnsaved = false; root.removeChild(mask); return; }
      const m = mask.querySelector('#s-month').value;
      const receivable = store.monthlyReceivable(studentId, m);
      const received = Number(receivedInput.value);
      if (!(received >= 0)) { Utils.toast('请填写实收金额'); return; }
      let diffType = 'exact';
      const diff = received - receivable;
      if (diff > 0) diffType = 'credit';
      else if (diff < 0) {
        const sel = mask.querySelector('input[name="s-diff-kind"]:checked');
        diffType = sel ? sel.value : 'waive';
      }
      const items = Object.keys(store.monthlyItems(studentId, m)).map(k => {
        const it = store.monthlyItems(studentId, m)[k];
        return { courseId: k, count: it.count, price: it.price, fee: it.fee, billingMode: it.billingMode };
      });
      await store.addPayment({
        studentId, type: 'settle', month: m,
        items, receivable, received, diffType,
        note: mask.querySelector('#s-note').value.trim()
      });
      hasUnsaved = false;
      root.removeChild(mask);
      Utils.toast('账单已保存');
    }
    // 关闭前的未保存三选：保存并关闭 / 返回继续填写 / 放弃本次填写
    async function tryCloseSettle() {
      if (!settleChanged()) { hasUnsaved = false; root.removeChild(mask); return; }
      const choice = await Utils.choiceDialog(
        '账单还没保存',
        '实收金额还没写入账单。保存后可在学生详情查看账单记录；放弃则本次填写丢失。',
        [
          { key: 'save', text: '保存并关闭', cls: 'btn-primary' },
          { key: 'stay', text: '返回继续填写' },
          { key: 'discard', text: '放弃本次填写', cls: 'btn-danger' }
        ]
      );
      if (choice === null || choice === 'stay') return;
      if (choice === 'save') { await doSettleSave(); return; }
      if (choice === 'discard') { hasUnsaved = false; root.removeChild(mask); }
    }

    mask.querySelector('#s-month').addEventListener('change', function () {
      mask.querySelector('#s-body').innerHTML = bodyHtml(this.value);
      bindSettleForm(mask, studentId, this.value);
    });
    bindSettleForm(mask, studentId, month);
    mask.addEventListener('click', function (e) {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'close' || e.target === mask) { tryCloseSettle(); return; }
      if (e.target.id === 's-save') { doSettleSave(); }
    });
    root.appendChild(mask);
  }

  // 结账面板脏标记：填了实收或备注即显示"● 未保存"并置全局标志
  function updateSettleBadge(mask) {
    const r = mask.querySelector('#s-received');
    let d = false;
    if (r && r.value !== '') d = true;
    if (!d) {
      const n = mask.querySelector('#s-note');
      if (n && n.value.trim() !== '') d = true;
    }
    hasUnsaved = d;
    const badge = mask.querySelector('#settle-dirty');
    if (badge) badge.classList.toggle('show', d);
  }

  function bindSettleForm(mask, studentId, month) {
    const receivedInput = mask.querySelector('#s-received');
    if (!receivedInput) return;
    receivedInput.addEventListener('input', function () {
      const receivable = store.monthlyReceivable(studentId, month);
      const received = this.value;
      const diff = (received === '' ? 0 : Number(received)) - receivable;
      const box = mask.querySelector('#s-diff-box');
      const saveBtn = mask.querySelector('#s-save');
      if (received === '') {
        box.textContent = '填实收后自动判断';
        saveBtn.disabled = true;
        updateSettleBadge(mask);
        return;
      }
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
            '<label style="display:flex;gap:6px;align-items:center;"><input type="radio" name="s-diff-kind" value="waive" checked> 抹零（核销，不算欠费）</label>' +
            '<label style="display:flex;gap:6px;align-items:center;"><input type="radio" name="s-diff-kind" value="debt"> 欠费（记入余额，待催收）</label>' +
          '</div>';
      }
      updateSettleBadge(mask);
    });
    const noteInput = mask.querySelector('#s-note');
    if (noteInput) noteInput.addEventListener('input', function () { updateSettleBadge(mask); });
  }

  function resetStudent() { studentId = null; }
  return { render, confirmLeave, resetStudent, name: '日历' };
})();
