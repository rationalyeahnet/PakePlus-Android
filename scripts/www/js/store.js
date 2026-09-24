/* ============================================================
   课时记账 · 业务存储层
   内存缓存 + IndexedDB 持久化 + 业务计算（应收 / 余额 / 应到）

   班次（courses）：name + weekdays(0=周日…6=周六 多选) + period + defaultPrice
   例外（exceptions）：{courseId, date, type: skip|extra, period}
   假期（vacations）：{name, startDate, endDate} —— 范围内全校停课（寒暑假等）
   节假日：App.holidays（内置法定节假日，放假停课；调休上班日不阻止排课）
   ============================================================ */
window.App = window.App || {};
App.store = (function () {
  const listeners = [];
  const data = {
    students: [], courses: [], enrollments: [], attendances: [], payments: [],
    exceptions: [], vacations: [], absences: []
  };

  /* ---------- 订阅 / 通知 ---------- */
  function onChange(fn) { listeners.push(fn); }
  function notify() { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }

  async function init() {
    await DB.open();
    data.students = await DB.getAll('students');
    data.courses = await DB.getAll('courses');
    data.enrollments = await DB.getAll('enrollments');
    data.attendances = await DB.getAll('attendances');
    data.payments = await DB.getAll('payments');
    data.exceptions = await DB.getAll('exceptions');
    data.vacations = await DB.getAll('vacations');
    data.absences = await DB.getAll('absences');
    notify();
  }

  /* ---------- 学生 ---------- */
  async function addStudent(name, status, note) {
    const s = { id: Utils.uid(), name: String(name || '').trim(), status: status || 'active', note: note || '', createdAt: Utils.todayKey() };
    await DB.put('students', s);
    data.students.push(s);
    notify();
    return s;
  }
  async function updateStudent(id, patch) {
    const s = data.students.find(x => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
    await DB.put('students', s);
    notify();
  }
  // 删除学生：级联删除其报名 / 出勤 / 账单 / 请假备注
  async function removeStudent(id) {
    data.enrollments.filter(e => e.studentId === id).forEach(e => DB.remove('enrollments', e.id));
    data.attendances.filter(a => a.studentId === id).forEach(a => DB.remove('attendances', a.id));
    data.payments.filter(p => p.studentId === id).forEach(p => DB.remove('payments', p.id));
    data.absences.filter(a => a.studentId === id).forEach(a => DB.remove('absences', a.id));
    await DB.remove('students', id);
    data.students = data.students.filter(s => s.id !== id);
    data.enrollments = data.enrollments.filter(e => e.studentId !== id);
    data.attendances = data.attendances.filter(a => a.studentId !== id);
    data.payments = data.payments.filter(p => p.studentId !== id);
    data.absences = data.absences.filter(a => a.studentId !== id);
    notify();
  }

  /* ---------- 班次（课程 = 班次：含每周排课与时段） ---------- */
  // weekdays: number[]，0=周日…6=周六；period: '上午'|'下午'|'晚上'|'全天'|''
  // workday: true = 工作日模式（周一~五上课，法定调休上班日照常上课；仍受假期/节假日/例外约束）
  // billingMode: 班次默认计费方式 'perClass'（按次，defaultPrice 为每节默认单价）| 'monthly'（包月，monthlyFee 为默认包月费）
  // leaveThreshold: 包月学生当月请假达 N 天时提醒（只提示不自动算钱，0=不提醒）
  async function addCourse(name, weekdays, period, defaultPrice, workday, billingMode, monthlyFee, leaveThreshold) {
    const isMonthly = billingMode === 'monthly';
    const c = {
      id: Utils.uid(), name: String(name || '').trim(),
      weekdays: Array.isArray(weekdays) ? weekdays.slice() : [],
      period: period || '',
      defaultPrice: Number(defaultPrice) || 0,
      workday: !!workday,
      billingMode: isMonthly ? 'monthly' : 'perClass',
      monthlyFee: isMonthly ? Number(monthlyFee) || 0 : 0,
      leaveThreshold: isMonthly ? Number(leaveThreshold) || 0 : 0,
      active: true, createdAt: Utils.todayKey()
    };
    await DB.put('courses', c);
    data.courses.push(c);
    notify();
    return c;
  }
  async function updateCourse(id, patch) {
    const c = data.courses.find(x => x.id === id);
    if (!c) return;
    Object.assign(c, patch);
    await DB.put('courses', c);
    notify();
  }
  // 有引用（报名 / 出勤 / 例外）的班次不允许删除
  function courseInUse(id) {
    return data.enrollments.some(e => e.courseId === id) ||
      data.attendances.some(a => a.courseId === id) ||
      data.exceptions.some(x => x.courseId === id);
  }
  async function removeCourse(id) {
    await DB.remove('courses', id);
    data.courses = data.courses.filter(c => c.id !== id);
    notify();
  }

  /* ---------- 报名（学生 × 班次，优惠单价挂在这里） ---------- */
  // billingMode: 'perClass'（按节，price 为每节单价）| 'monthly'（包月，monthlyFee 为每月固定费）
  async function addEnrollment(studentId, courseId, price, billingMode, monthlyFee) {
    const e = {
      id: Utils.uid(), studentId, courseId,
      price: Number(price),
      billingMode: billingMode === 'monthly' ? 'monthly' : 'perClass',
      monthlyFee: Number(monthlyFee) || 0,
      active: true, createdAt: Utils.todayKey()
    };
    await DB.put('enrollments', e);
    data.enrollments.push(e);
    notify();
    return e;
  }
  async function setEnrollmentActive(id, active) {
    const e = data.enrollments.find(x => x.id === id);
    if (!e) return;
    e.active = !!active;
    await DB.put('enrollments', e);
    notify();
  }
  async function removeEnrollment(id) {
    await DB.remove('enrollments', id);
    data.enrollments = data.enrollments.filter(e => e.id !== id);
    notify();
  }
  function activeEnrollments(studentId) {
    return data.enrollments.filter(e => e.studentId === studentId && e.active);
  }
  function enrollmentInfo(studentId, courseId) {
    return data.enrollments.find(x => x.studentId === studentId && x.courseId === courseId && x.active) || null;
  }
  function enrollmentPrice(studentId, courseId) {
    const e = enrollmentInfo(studentId, courseId);
    if (!e) return 0;
    return e.billingMode === 'monthly' ? 0 : Number(e.price) || 0;
  }

  /* ---------- 例外（停课 / 加课） ---------- */
  async function addException(courseId, date, type, period) {
    const x = {
      id: Utils.uid(), courseId, date,
      type: type === 'skip' ? 'skip' : 'extra',
      period: period || ''
    };
    await DB.put('exceptions', x);
    data.exceptions.push(x);
    notify();
    return x;
  }
  async function removeException(id) {
    await DB.remove('exceptions', id);
    data.exceptions = data.exceptions.filter(x => x.id !== id);
    notify();
  }
  function exceptionsFor(courseId, date) {
    return data.exceptions.filter(x => x.courseId === courseId && x.date === date);
  }

  /* ---------- 自定义假期（寒暑假等，范围内全校停课） ---------- */
  async function addVacation(name, startDate, endDate) {
    const v = { id: Utils.uid(), name: String(name || '').trim(), startDate, endDate };
    await DB.put('vacations', v);
    data.vacations.push(v);
    notify();
    return v;
  }
  async function removeVacation(id) {
    await DB.remove('vacations', id);
    data.vacations = data.vacations.filter(v => v.id !== id);
    notify();
  }
  function inVacation(dateKey) {
    return data.vacations.some(v => v.startDate <= dateKey && dateKey <= v.endDate);
  }

  /* ---------- 排课：某天有课的班次 ---------- */
  // 规则：班次排课日 且 非自定义假期 且 非法定节假日 且 非停课例外 → 有课
  //       加课例外 → 该天额外有课（即使假期/节假日）
  // 班次排课日（courseWeekdayOn）：
  //   - 工作日模式（c.workday=true）：勾选的周一~五上课（点掉哪天=哪天排除）或 法定调休上班日（如周日补班）→ 有课
  //   - 星期模式：勾选的星期匹配 → 有课（调休上班日不阻止，星期匹配照常有课）
  function courseWeekdayOn(c, dateKey) {
    const wd = Utils.weekdayOf(dateKey);
    if (c.workday) {
      if ((c.weekdays || []).indexOf(wd) >= 0) return true;
      return !!(App.holidays && App.holidays.isWorkday(dateKey));
    }
    return (c.weekdays || []).indexOf(wd) >= 0;
  }
  function sessionsForDate(dateKey) {
    const closed = inVacation(dateKey) || (App.holidays && App.holidays.isHoliday(dateKey));
    const out = [];
    data.courses.forEach(function (c) {
      if (c.active === false) return;
      const skip = data.exceptions.some(x => x.courseId === c.id && x.date === dateKey && x.type === 'skip');
      const hasExtra = data.exceptions.some(x => x.courseId === c.id && x.date === dateKey && x.type === 'extra');
      const normal = !skip && !closed && courseWeekdayOn(c, dateKey);
      if (normal) {
        out.push({ courseId: c.id, name: c.name, period: c.period || '', extra: false });
      } else if (hasExtra) {
        out.push({ courseId: c.id, name: c.name, period: c.period || '', extra: true });
      }
    });
    return out;
  }
  // 学生某天报名的有课班次
  function studentSessions(studentId, dateKey) {
    return sessionsForDate(dateKey).filter(function (s) {
      return !!enrollmentInfo(studentId, s.courseId);
    });
  }

  /* ---------- 出勤（一天可多节：同学生不同班次各记一条） ---------- */
  // 单学生切换（保留底层能力）：同学生同班次同天存在则移除，否则新增
  async function toggleAttendance(studentId, courseId, dateKey) {
    const exist = data.attendances.find(a => a.studentId === studentId && a.courseId === courseId && a.date === dateKey);
    if (exist) {
      await DB.remove('attendances', exist.id);
      data.attendances = data.attendances.filter(a => a.id !== exist.id);
      notify();
      return { ok: true, removed: true };
    }
    const enr = enrollmentInfo(studentId, courseId);
    if (!enr) return { ok: false, conflict: null };
    const isMonthly = enr.billingMode === 'monthly';
    // 单价/计费方式快照：涨价、改费不影响历史账单
    const a = {
      id: Utils.uid(), studentId, courseId, date: dateKey,
      billingMode: isMonthly ? 'monthly' : 'perClass',
      price: isMonthly ? 0 : Number(enr.price) || 0,
      fee: isMonthly ? Number(enr.monthlyFee) || 0 : 0,
      createdAt: new Date().toISOString()
    };
    await DB.put('attendances', a);
    data.attendances.push(a);
    notify();
    return { ok: true, added: a };
  }
  // 班次快照式登记：某班次某天 = 勾选的学生名单（全量覆盖）
  async function saveSessionAttendance(dateKey, courseId, attendedIds) {
    const old = data.attendances.filter(a => a.courseId === courseId && a.date === dateKey);
    for (const o of old) await DB.remove('attendances', o.id);
    data.attendances = data.attendances.filter(a => !(a.courseId === courseId && a.date === dateKey));
    const list = [];
    (attendedIds || []).forEach(function (sid) {
      const enr = enrollmentInfo(sid, courseId);
      if (!enr) return;
      const isMonthly = enr.billingMode === 'monthly';
      list.push({
        id: Utils.uid(), studentId: sid, courseId, date: dateKey,
        billingMode: isMonthly ? 'monthly' : 'perClass',
        price: isMonthly ? 0 : Number(enr.price) || 0,
        fee: isMonthly ? Number(enr.monthlyFee) || 0 : 0,
        createdAt: new Date().toISOString()
      });
    });
    if (list.length) await DB.bulkPut('attendances', list);
    data.attendances = data.attendances.concat(list);
    notify();
    return list.length;
  }
  function attendedIdsFor(dateKey, courseId) {
    return data.attendances.filter(a => a.courseId === courseId && a.date === dateKey).map(a => a.studentId);
  }
  // 批量写出勤（班次矩阵用）：changes=[{studentId, date, attend}]，attend=true 增 / false 删；一次 notify
  async function saveAttendanceBatch(courseId, changes) {
    const toRemove = [];
    const toAdd = [];
    for (const ch of changes || []) {
      const found = data.attendances.find(a =>
        a.courseId === courseId && a.studentId === ch.studentId && a.date === ch.date);
      if (ch.attend && !found) {
        const enr = enrollmentInfo(ch.studentId, courseId);
        if (!enr) continue;
        const isMonthly = enr.billingMode === 'monthly';
        toAdd.push({
          id: Utils.uid(), studentId: ch.studentId, courseId, date: ch.date,
          billingMode: isMonthly ? 'monthly' : 'perClass',
          price: isMonthly ? 0 : Number(enr.price) || 0,
          fee: isMonthly ? Number(enr.monthlyFee) || 0 : 0,
          createdAt: new Date().toISOString()
        });
      } else if (!ch.attend && found) {
        toRemove.push(found.id);
      }
    }
    for (const id of toRemove) await DB.remove('attendances', id);
    data.attendances = data.attendances.filter(a => toRemove.indexOf(a.id) < 0);
    if (toAdd.length) await DB.bulkPut('attendances', toAdd);
    data.attendances = data.attendances.concat(toAdd);
    notify();
    return { added: toAdd.length, removed: toRemove.length };
  }

  /* ---------- 请假备注（未到原因：病假 / 事假 / 请假等，不影响出勤统计） ---------- */
  async function addAbsence(studentId, courseId, dateKey, reason) {
    const exist = data.absences.find(a => a.studentId === studentId && a.courseId === courseId && a.date === dateKey);
    if (exist) {
      exist.reason = String(reason || '');
      await DB.put('absences', exist);
      notify();
      return exist;
    }
    const ab = { id: Utils.uid(), studentId, courseId, date: dateKey, reason: String(reason || ''), createdAt: new Date().toISOString() };
    await DB.put('absences', ab);
    data.absences.push(ab);
    notify();
    return ab;
  }
  async function removeAbsence(id) {
    await DB.remove('absences', id);
    data.absences = data.absences.filter(a => a.id !== id);
    notify();
  }
  // 某学生某天某班次的请假备注（无则 null）
  function absenceFor(studentId, courseId, dateKey) {
    return data.absences.find(a => a.studentId === studentId && a.courseId === courseId && a.date === dateKey) || null;
  }
  // 某学生某天的全部请假备注（按班次）
  function absencesForDate(studentId, dateKey) {
    return data.absences.filter(a => a.studentId === studentId && a.date === dateKey);
  }
  // 某学生某班次某月请假天数（date 前 7 位 = 月份）
  function absenceDaysInMonth(studentId, courseId, month) {
    return data.absences.filter(a =>
      a.studentId === studentId && a.courseId === courseId && a.date.slice(0, 7) === month
    ).length;
  }
  // 包月请假提醒：该生当月已请假 ≥ 班次阈值（leaveThreshold）的包月班次列表
  // 只提示不自动算钱；班次无阈值（0/未设）或非包月不参与
  function leaveAlerts(studentId, month) {
    const out = [];
    data.enrollments
      .filter(e => e.studentId === studentId && e.active && e.billingMode === 'monthly')
      .forEach(e => {
        const c = courseById(e.courseId);
        if (!c) return;
        const th = Number(c.leaveThreshold) || 0;
        if (th <= 0) return;
        const days = absenceDaysInMonth(studentId, e.courseId, month);
        if (days >= th) {
          out.push({ course: c, enrollment: e, days, threshold: th });
        }
      });
    return out;
  }

  /* ---------- 账单 / 收费 ---------- */
  // type: 'settle'（月结）| 'prepay'（预收）| 'refund'（退费，received 为负数）
  // diffType: 'exact' | 'waive'(抹零,核销) | 'credit'(多收) | 'debt'(欠费) | 'prepay' | 'refund'
  async function addPayment(p) {
    const pay = Object.assign({
      id: Utils.uid(), createdAt: new Date().toISOString(),
      items: [], receivable: 0, received: 0, diffType: 'exact', note: ''
    }, p);
    await DB.put('payments', pay);
    data.payments.push(pay);
    notify();
    return pay;
  }
  async function removePayment(id) {
    await DB.remove('payments', id);
    data.payments = data.payments.filter(p => p.id !== id);
    notify();
  }

  /* ---------- 计算 ---------- */
  // 学生某月出勤按班次分组：{ courseId: { count, price, billingMode, fee } }
  function monthlyItems(studentId, month) {
    const map = {};
    data.attendances
      .filter(a => a.studentId === studentId && a.date.slice(0, 7) === month)
      .forEach(a => {
        if (!map[a.courseId]) {
          map[a.courseId] = {
            count: 0,
            price: a.price || 0,
            billingMode: a.billingMode || 'perClass',
            fee: a.fee || 0
          };
        }
        map[a.courseId].count++;
      });
    return map;
  }
  // 应收：按节 = 节数×单价；包月 = 当月有出勤则收整月费（无出勤应收 0）
  function monthlyReceivable(studentId, month) {
    const items = monthlyItems(studentId, month);
    return Object.keys(items).reduce((sum, k) => {
      const it = items[k];
      return sum + (it.billingMode === 'monthly' ? it.fee : it.count * it.price);
    }, 0);
  }
  function monthlyCount(studentId, month) {
    const items = monthlyItems(studentId, month);
    return Object.keys(items).reduce((sum, k) => sum + items[k].count, 0);
  }
  // 应到：学生某月报名班次的有课日数（排除节假日/假期/停课，含加课；只统计到今天）
  function monthlyShouldAttend(studentId, month) {
    const p = month.split('-').map(Number);
    const days = new Date(p[0], p[1], 0).getDate();
    const today = Utils.todayKey();
    let n = 0;
    for (let d = 1; d <= days; d++) {
      const key = month + '-' + Utils.pad(d);
      if (key > today) break;
      if (studentSessions(studentId, key).length) n++;
    }
    return n;
  }
  // 班次维度统计：某班次某月各报名学生的 应到/实到/出勤率
  function sessionStats(courseId, month) {
    const p = month.split('-').map(Number);
    const days = new Date(p[0], p[1], 0).getDate();
    const today = Utils.todayKey();
    let shouldDays = 0;
    for (let d = 1; d <= days; d++) {
      const key = month + '-' + Utils.pad(d);
      if (key > today) break;
      if (sessionsForDate(key).some(s => s.courseId === courseId)) shouldDays++;
    }
    const rows = data.enrollments
      .filter(e => e.courseId === courseId && e.active)
      .map(e => {
        const stu = studentById(e.studentId);
        const attend = data.attendances.filter(a =>
          a.courseId === courseId && a.studentId === e.studentId && a.date.slice(0, 7) === month
        ).length;
        return { studentId: e.studentId, name: stu ? stu.name : '?', should: shouldDays, attend };
      });
    return { courseId, month, shouldDays, rows };
  }
  // 余额：Σ(实收 − 应收)，抹零(waive)核销不计
  function balance(studentId) {
    return data.payments
      .filter(p => p.studentId === studentId && p.diffType !== 'waive')
      .reduce((sum, p) => sum + (Number(p.received) - Number(p.receivable)), 0);
  }
  function studentPayments(studentId) {
    return data.payments
      .filter(p => p.studentId === studentId)
      .sort((a, b) => (b.month || b.createdAt).localeCompare(a.month || a.createdAt));
  }
  function allStudentsWithBalance() {
    return data.students
      .map(s => ({ student: s, balance: balance(s.id) }))
      .sort((a, b) => a.student.name.localeCompare(b.student.name, 'zh'));
  }
  function courseById(id) { return data.courses.find(c => c.id === id); }
  function studentById(id) { return data.students.find(s => s.id === id); }

  /* ---------- 导出 / 导入 / 清空 ---------- */
  function exportJSON() {
    return JSON.stringify({
      app: 'jizhang', version: 3, exportedAt: new Date().toISOString(),
      data: {
        students: data.students, courses: data.courses, enrollments: data.enrollments,
        attendances: data.attendances, payments: data.payments,
        exceptions: data.exceptions, vacations: data.vacations, absences: data.absences
      }
    }, null, 2);
  }
  function isValidBackup(obj) {
    return obj && obj.app === 'jizhang' && obj.data &&
      obj.data.students && obj.data.courses && obj.data.enrollments &&
      obj.data.attendances && obj.data.payments;
  }
  async function importJSON(text) {
    const obj = JSON.parse(text);
    if (!isValidBackup(obj)) throw new Error('不是有效的课时记账备份文件');
    for (const key of DB.STORES) {
      await DB.clear(key);
      const arr = obj.data[key] || [];
      if (arr.length) await DB.bulkPut(key, arr);
      data[key] = arr.slice();
    }
    notify();
  }
  async function clearAll() {
    for (const key of DB.STORES) {
      await DB.clear(key);
      data[key] = [];
    }
    notify();
  }

  return {
    data, init, onChange,
    addStudent, updateStudent, removeStudent,
    addCourse, updateCourse, removeCourse, courseInUse,
    addEnrollment, setEnrollmentActive, removeEnrollment, activeEnrollments, enrollmentInfo, enrollmentPrice,
    addException, removeException, exceptionsFor,
    addVacation, removeVacation, inVacation,
    sessionsForDate, studentSessions, courseWeekdayOn,
    toggleAttendance, saveSessionAttendance, saveAttendanceBatch, attendedIdsFor,
    addAbsence, removeAbsence, absenceFor, absencesForDate, absenceDaysInMonth, leaveAlerts,
    addPayment, removePayment,
    monthlyItems, monthlyReceivable, monthlyCount, monthlyShouldAttend, sessionStats,
    balance, studentPayments,
    allStudentsWithBalance, courseById, studentById,
    exportJSON, importJSON, clearAll
  };
})();
