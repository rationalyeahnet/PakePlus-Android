/* ============================================================
   课时记账 · 示例数据（相对当前月动态生成）
   仅在「数据」页手动载入，不会自动写入
   演示：班次排课（托管班 周一~五 + 英语班 周六）+
   按节（李明/王芳/赵磊）+ 包月（孙悦）+
   预收（王芳）+ 抹零（李明上月）+ 多收与退费（孙悦上月）+
   加课例外（中秋假期加课）+ 自定义假期（国庆后停课）
   ============================================================ */
window.App = window.App || {};
App.sample = (function () {
  async function loadSample() {
    const cur = Utils.currentMonth();
    const prev = Utils.shiftMonth(cur, -1);
    const s1 = { id: 's-demo-1', name: '李明', status: 'active', note: '', createdAt: Utils.todayKey() };
    const s2 = { id: 's-demo-2', name: '王芳', status: 'active', note: '', createdAt: Utils.todayKey() };
    const s3 = { id: 's-demo-3', name: '赵磊', status: 'active', note: '', createdAt: Utils.todayKey() };
    const s4 = { id: 's-demo-4', name: '孙悦', status: 'active', note: '包月客户', createdAt: Utils.todayKey() };
    // 班次：托管班（工作日模式：周一~五 + 调休上班日照常上课，如国庆前 9/20 周日补班）
    //       默认计费：包月 2000 元/月，当月请假 ≥3 天提醒（只提示，退费手动）
    //       + 英语兴趣班（周六 上午，默认按次）
    const c1 = { id: 'c-demo-1', name: '托管班', weekdays: [1, 2, 3, 4, 5], period: '下午', defaultPrice: 120, workday: true, billingMode: 'monthly', monthlyFee: 2000, leaveThreshold: 3, active: true, createdAt: Utils.todayKey() };
    const c2 = { id: 'c-demo-2', name: '英语兴趣班', weekdays: [6], period: '上午', defaultPrice: 100, billingMode: 'perClass', monthlyFee: 0, leaveThreshold: 0, active: true, createdAt: Utils.todayKey() };
    // 报名：李明 托管120/节+英语100/节；王芳 托管110/节；赵磊 英语100/节；孙悦 托管包月2000/月
    const e1 = { id: 'e-demo-1', studentId: s1.id, courseId: c1.id, price: 120, billingMode: 'perClass', monthlyFee: 0, active: true, createdAt: Utils.todayKey() };
    const e2 = { id: 'e-demo-2', studentId: s1.id, courseId: c2.id, price: 100, billingMode: 'perClass', monthlyFee: 0, active: true, createdAt: Utils.todayKey() };
    const e3 = { id: 'e-demo-3', studentId: s2.id, courseId: c1.id, price: 110, billingMode: 'perClass', monthlyFee: 0, active: true, createdAt: Utils.todayKey() };
    const e4 = { id: 'e-demo-4', studentId: s3.id, courseId: c2.id, price: 100, billingMode: 'perClass', monthlyFee: 0, active: true, createdAt: Utils.todayKey() };
    const e5 = { id: 'e-demo-5', studentId: s4.id, courseId: c1.id, price: 0, billingMode: 'monthly', monthlyFee: 2000, active: true, createdAt: Utils.todayKey() };
    const enrollments = [e1, e2, e3, e4, e5];
    function enrOf(sid, cid) {
      return enrollments.find(x => x.studentId === sid && x.courseId === cid && x.active) || null;
    }

    // 本月出勤计划：[日, 学生, 班次]（托管班与英语班可同日不同班次）
    const plan = [
      [1, s1.id, c1.id], [1, s2.id, c1.id],
      [2, s4.id, c1.id], [2, s3.id, c2.id],
      [3, s1.id, c1.id], [3, s2.id, c1.id],
      [5, s1.id, c2.id], [5, s3.id, c2.id],
      [8, s2.id, c1.id],
      [12, s1.id, c2.id], [12, s3.id, c2.id],
      [19, s3.id, c2.id]
    ];
    const att = plan.map(function (row, i) {
      const e = enrOf(row[1], row[2]);
      const isMonthly = e && e.billingMode === 'monthly';
      return {
        id: 'a-demo-' + (i + 1),
        studentId: row[1], courseId: row[2],
        date: cur + '-' + Utils.pad(row[0]),
        billingMode: isMonthly ? 'monthly' : 'perClass',
        price: isMonthly ? 0 : (e ? e.price : 0),
        fee: isMonthly ? (e ? e.monthlyFee : 0) : 0,
        createdAt: new Date().toISOString()
      };
    });

    // 例外：托管班 9月27日（周日，中秋假期）加课补课
    const ex1 = { id: 'x-demo-1', courseId: c1.id, date: cur + '-27', type: 'extra', period: '下午' };
    // 自定义假期：国庆节后机构停课（未来，演示假期设置）
    const va1 = { id: 'v-demo-1', name: '国庆后休整', startDate: Utils.shiftMonth(cur, 1) + '-08', endDate: Utils.shiftMonth(cur, 1) + '-09' };

    // 李明：上月按节结算，抹零 20
    const pay1 = {
      id: 'pay-demo-1', studentId: s1.id, type: 'settle', month: prev,
      items: [{ courseId: c1.id, count: 6, price: 120, fee: 0, billingMode: 'perClass' }, { courseId: c2.id, count: 4, price: 100, fee: 0, billingMode: 'perClass' }],
      receivable: 1120, received: 1100, diffType: 'waive', note: '上月抹零 20', createdAt: new Date().toISOString()
    };
    // 王芳：本月预收 900（信任老师提前交）
    const pay2 = {
      id: 'pay-demo-2', studentId: s2.id, type: 'prepay', month: cur,
      items: [], receivable: 0, received: 900, diffType: 'prepay', note: '信任老师，提前交一个月', createdAt: new Date().toISOString()
    };
    // 孙悦：上月包月 2000，实收多收 300 计入余额
    const pay3 = {
      id: 'pay-demo-3', studentId: s4.id, type: 'settle', month: prev,
      items: [{ courseId: c1.id, count: 4, price: 0, fee: 2000, billingMode: 'monthly' }],
      receivable: 2000, received: 2300, diffType: 'credit', note: '上月包月费 2000，多收 300 计入余额', createdAt: new Date().toISOString()
    };
    // 孙悦：上月缺勤较多，退费 300（从余额扣减，余额归零）
    const pay4 = {
      id: 'pay-demo-4', studentId: s4.id, type: 'refund', month: prev,
      items: [], receivable: 0, received: -300, diffType: 'refund', note: '缺勤较多，退费 300', createdAt: new Date().toISOString()
    };

    const seed = {
      students: [s1, s2, s3, s4],
      courses: [c1, c2],
      enrollments,
      attendances: att,
      payments: [pay1, pay2, pay3, pay4],
      exceptions: [ex1],
      vacations: [va1],
      absences: []
    };
    for (const key of DB.STORES) {
      await DB.clear(key);
      if (seed[key].length) await DB.bulkPut(key, seed[key]);
      App.store.data[key] = seed[key].slice();
    }
  }
  return { loadSample };
})();
