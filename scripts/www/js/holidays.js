/* ============================================================
   法定节假日数据（内置，离线可用 + 可在线更新）
   内置来源：国务院办公厅《关于部分节假日安排的通知》（gov.cn）
   覆盖：2025、2026 年（2027 年安排一般于前一年 11 月发布，届时更新）
   在线更新：数据页「更新法定节假日」→ timor.tech 免费接口拉取当年+下一年，
            解析后存入 localStorage（jz_holiday_cache_v1），优先于内置数据生效
   ============================================================ */
window.App = window.App || {};
App.holidays = (function () {

  // 法定节假日（放假日期）
  var HOLIDAY = {
    /* ---------- 2025 ---------- */
    '2025-01-01': '元旦',
    '2025-01-28': '春节', '2025-01-29': '春节', '2025-01-30': '春节',
    '2025-01-31': '春节', '2025-02-01': '春节', '2025-02-02': '春节',
    '2025-02-03': '春节', '2025-02-04': '春节',
    '2025-04-04': '清明节', '2025-04-05': '清明节', '2025-04-06': '清明节',
    '2025-05-01': '劳动节', '2025-05-02': '劳动节', '2025-05-03': '劳动节',
    '2025-05-04': '劳动节', '2025-05-05': '劳动节',
    '2025-05-31': '端午节', '2025-06-01': '端午节', '2025-06-02': '端午节',
    '2025-10-01': '国庆节·中秋节', '2025-10-02': '国庆节·中秋节',
    '2025-10-03': '国庆节·中秋节', '2025-10-04': '国庆节·中秋节',
    '2025-10-05': '国庆节·中秋节', '2025-10-06': '国庆节·中秋节',
    '2025-10-07': '国庆节·中秋节', '2025-10-08': '国庆节·中秋节',

    /* ---------- 2026 ---------- */
    '2026-01-01': '元旦', '2026-01-02': '元旦', '2026-01-03': '元旦',
    '2026-02-15': '春节', '2026-02-16': '春节', '2026-02-17': '春节',
    '2026-02-18': '春节', '2026-02-19': '春节', '2026-02-20': '春节',
    '2026-02-21': '春节', '2026-02-22': '春节', '2026-02-23': '春节',
    '2026-04-04': '清明节', '2026-04-05': '清明节', '2026-04-06': '清明节',
    '2026-05-01': '劳动节', '2026-05-02': '劳动节', '2026-05-03': '劳动节',
    '2026-05-04': '劳动节', '2026-05-05': '劳动节',
    '2026-06-19': '端午节', '2026-06-20': '端午节', '2026-06-21': '端午节',
    '2026-09-25': '中秋节', '2026-09-26': '中秋节', '2026-09-27': '中秋节',
    '2026-10-01': '国庆节', '2026-10-02': '国庆节', '2026-10-03': '国庆节',
    '2026-10-04': '国庆节', '2026-10-05': '国庆节', '2026-10-06': '国庆节',
    '2026-10-07': '国庆节'
  };

  // 调休上班日（周末补班）
  var WORKDAY = {
    '2025-01-26': '春节调休上班', '2025-02-08': '春节调休上班',
    '2025-04-27': '劳动节调休上班',
    '2025-09-28': '国庆节调休上班', '2025-10-11': '国庆节调休上班',
    '2026-01-04': '元旦调休上班',
    '2026-02-14': '春节调休上班', '2026-02-28': '春节调休上班',
    '2026-05-09': '劳动节调休上班',
    '2026-09-20': '国庆节调休上班', '2026-10-10': '国庆节调休上班'
  };

  // 在线更新缓存（localStorage，优先于内置）
  var CACHE_KEY = 'jz_holiday_cache_v1';

  function has(map, key) { return Object.prototype.hasOwnProperty.call(map, key); }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || typeof c.holiday !== 'object' || typeof c.workday !== 'object') return null;
      return c;
    } catch (e) { return null; }
  }
  function holidayMap() { var c = readCache(); return c ? c.holiday : HOLIDAY; }
  function workdayMap() { var c = readCache(); return c ? c.workday : WORKDAY; }

  // 在线更新：拉取当年 + 下一年，两个年份都成功才整体写入
  // 返回 { years, updatedAt }；失败 throw Error
  function refreshFromApi() {
    var now = new Date();
    var years = [now.getFullYear(), now.getFullYear() + 1];
    var holiday = {}, workday = {};
    var pending = years.map(function (y) { return fetchYear(y); });
    return Promise.all(pending).then(function (results) {
      results.forEach(function (r) { parseHolidayData(r, holiday, workday); });
      var cache = {
        version: 'v1',
        years: years,
        holiday: holiday,
        workday: workday,
        updatedAt: formatTime(now)
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      return { years: years.slice(), updatedAt: cache.updatedAt };
    });
  }

  function parseHolidayData(rawMap, holiday, workday) {
    Object.keys(rawMap).forEach(function (mmdd) {
      var it = rawMap[mmdd];
      if (!it || typeof it !== 'object' || !it.date) return;
      var name = it.name || '';
      if (it.holiday === true) {
        // 排除普通周末（周六/周日），只保留真实法定节假日
        if (name !== '周六' && name !== '周日') holiday[it.date] = name;
      } else if (it.holiday === false) {
        workday[it.date] = name || '调休上班';
      }
    });
  }

  function fetchYear(y) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    var url = 'https://timor.tech/api/holiday/year/' + y + '?type=Y&week=Y';
    var opts = ctrl ? { signal: ctrl.signal } : undefined;
    return fetch(url, opts).then(function (res) {
      if (!res.ok) throw new Error('接口返回异常（HTTP ' + res.status + '）');
      return res.json();
    }).then(function (data) {
      if (!data || data.code !== 0 || !data.holiday) throw new Error('接口数据格式异常');
      return data.holiday;
    }).finally(function () { clearTimeout(timer); });
  }

  function formatTime(d) {
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  return {
    version: '2025-2026',
    source: '国务院办公厅放假安排通知（gov.cn）',
    holiday: HOLIDAY,
    workday: WORKDAY,
    isHoliday: function (key) { return has(holidayMap(), key); },
    holidayName: function (key) { return holidayMap()[key] || ''; },
    isWorkday: function (key) { return has(workdayMap(), key); },
    workdayName: function (key) { return workdayMap()[key] || ''; },
    cacheInfo: function () {
      var c = readCache();
      if (!c) return null;
      return { years: c.years || [], updatedAt: c.updatedAt || '' };
    },
    refreshFromApi: refreshFromApi,
    parseHolidayData: parseHolidayData
  };
})();
