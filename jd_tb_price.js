/*
=====================================================================
  京东 / 淘宝 / 天猫 商品比价脚本 v1.0
  兼容平台: Shadowrocket / Quantumult X / Surge / Loon / Stash
  功能说明:
    在浏览京东/淘宝/天猫商品时，自动查询同款价格信息，
    通过系统通知展示价格对比（当前价、历史低价、同款对比等）
=====================================================================

  ██████ 使用方法 — Shadowrocket ██████

  在 Shadowrocket 的「配置」-「脚本」中添加:

  [Script]
  # 京东比价（拦截商品详情接口）
  http-response ^https?:\/\/api\.m\.jd\.com\/client\.action\?functionId=(wareBusiness|getWareBusiness|getDetail|getJdPrice) requires-body=1,max-size=-1,script-path=https://你的托管地址/jd_tb_price.js

  # 淘宝/天猫比价
  http-response ^https?:\/\/(.*)\.(taobao|tmall)\.com\/  requires-body=1,max-size=-1,script-path=https://你的托管地址/jd_tb_price.js

  [MITM]
  hostname = *.m.jd.com, *.taobao.com, *.tmall.com, api.m.jd.com

  ██████ 使用方法 — Quantumult X ██████

  在 Quantumult X 的配置文件 [rewrite_local] 中添加:

  # 京东比价
  ^https?:\/\/api\.m\.jd\.com\/client\.action\?functionId=(wareBusiness|getWareBusiness|getDetail|getJdPrice) url script-response-body jd_tb_price.js

  # 淘宝/天猫比价
  ^https?:\/\/(.+)?\.(taobao|tmall)\.com\/(.+)? url script-response-body jd_tb_price.js

  [mitm]
  hostname = *.m.jd.com, *.taobao.com, *.tmall.com, api.m.jd.com

  ⚠️ 注意: 需要开启 MitM 并信任证书，否则无法拦截请求
  ⚠️ 首次使用建议先在 Safari 打开一次京东/淘宝商品页触发脚本

=====================================================================
*/

// ====================================================================
//  多平台兼容层 (Surge / Quantumult X / Shadowrocket / Loon / Stash)
// ====================================================================
;(() => {
  const isSurge = typeof $httpClient !== 'undefined' && !$loon;
  const isQuanX = typeof $task !== 'undefined';
  const isLoon = typeof $loon !== 'undefined';
  const isShadowrocket = typeof $rocket !== 'undefined';

  let ENV = 'unknown';
  if (isSurge) ENV = 'Surge';
  else if (isQuanX) ENV = 'Quantumult X';
  else if (isLoon) ENV = 'Loon';
  else if (isShadowrocket) ENV = 'Shadowrocket';

  const log = (msg) => console.log(`[比价] ${msg}`);

  const notify = (title, subtitle, body) => {
    if (isSurge || isShadowrocket) $notification.post(title, subtitle, body);
    else if (isQuanX) $notify(title, subtitle, body);
    else if (isLoon) $notification.post(title, subtitle, body);
  };

  const read = (key) => {
    if (isSurge || isShadowrocket || isLoon) return $persistentStore.read(key);
    if (isQuanX) return $prefs.valueForKey(key);
  };

  const write = (key, val) => {
    if (isSurge || isShadowrocket || isLoon) return $persistentStore.write(key, val);
    if (isQuanX) return $prefs.setValueForKey(key, val);
  };

  const httpGet = (url, headers, cb) => {
    const opts = { url, headers: Object.assign({ 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' }, headers || {}) };
    if (isSurge || isShadowrocket || isLoon) {
      $httpClient.get(opts, (err, resp, data) => cb(err, resp, data));
    } else if (isQuanX) {
      $task.fetch(Object.assign(opts, { method: 'GET' }))
        .then(r => cb(undefined, r, r.body || ''))
        .catch(e => cb(e, null, ''));
    }
  };

  const httpPost = (url, headers, body, cb) => {
    const opts = { url, headers: Object.assign({ 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' }, headers || {}), body };
    if (isSurge || isShadowrocket || isLoon) {
      $httpClient.post(opts, (err, resp, data) => cb(err, resp, data));
    } else if (isQuanX) {
      $task.fetch(Object.assign(opts, { method: 'POST' }))
        .then(r => cb(undefined, r, r.body || ''))
        .catch(e => cb(e, null, ''));
    }
  };

  const done = (obj) => $done(obj);

  log(`✅ 环境检测: ${ENV}`);

  // ================================================================
  //  辅助函数
  // ================================================================

  // 格式化价格
  function fmtPrice(p) {
    if (p === null || p === undefined) return '—';
    const n = parseFloat(p);
    return isNaN(n) ? String(p) : `¥${n.toFixed(2)}`;
  }

  // 从响应body提取京东商品SKU ID
  function getJDSkuId(body) {
    try {
      const o = JSON.parse(body);
      if (o.skuInfo && o.skuInfo.skuId) return String(o.skuInfo.skuId);
      if (o.wareInfo && o.wareInfo.skuId) return String(o.wareInfo.skuId);
      if (o.flashBuy && o.flashBuy.skuId) return String(o.flashBuy.skuId);
    } catch (_) {}
    // 从请求URL提取
    const m = $request.url.match(/skuId[=:](\d+)/);
    return m ? m[1] : null;
  }

  // 从响应body提取淘宝商品ID
  function getTBItemId(body) {
    try {
      const o = JSON.parse(body);
      if (o.data && o.data.itemId) return String(o.data.itemId);
      if (o.item && o.item.itemId) return String(o.item.itemId);
      if (o.itemId) return String(o.itemId);
      if (o.item_id) return String(o.item_id);
      if (o.result && o.result.itemId) return String(o.result.itemId);
      return null;
    } catch (_) {
      // 尝试从HTML提取
      const m = body.match(/\"itemId\"\s*:\s*\"?(\d+)\"?/);
      return m ? m[1] : null;
    }
  }

  // ================================================================
  //  价格查询: 京东
  // ================================================================
  function fetchJDPrice(skuId, cb) {
    // 尝试1: 调用京东内部API获取价格
    const url1 = `https://api.m.jd.com/client.action?functionId=wareBusiness&skuId=${skuId}&timestamp=${Date.now()}&body=${encodeURIComponent(JSON.stringify({ skuId, appid: 200 }))}`;
    httpGet(url1, { 'User-Agent': 'jdapp;iPhone;9.5.6;', 'Cookie': '' }, (err, resp, data) => {
      if (!err && data) {
        try {
          const o = JSON.parse(data);
          const sku = o.skuInfo || o.wareInfo || {};
          const price = sku.price || sku.jdPrice;
          const op = sku.originalPrice;
          const name = sku.name || sku.wareName || '';
          log(`京东API成功: ${name}`);
          cb({ ok: true, price, originalPrice: op, title: name });
          return;
        } catch (_) {}
      }
      // 尝试2: 京东prices接口（轻量）
      const url2 = `https://p.3.cn/prices/mgets?skuIds=J_${skuId}&type=1`;
      httpGet(url2, {}, (err2, resp2, data2) => {
        if (!err2 && data2) {
          try {
            const arr = JSON.parse(data2);
            if (arr && arr[0]) {
              cb({ ok: true, price: arr[0].p, title: '' });
              return;
            }
          } catch (_) {}
        }
        // 全部失败
        cb({ ok: false });
      });
    });
  }

  // ================================================================
  //  价格查询: 淘宝 / 天猫
  // ================================================================
  function fetchTBPrice(itemId, cb) {
    // 使用淘宝详情页接口
    const url = `https://detailskip.taobao.com/json/item.htm?itemId=${itemId}&timestamp=${Date.now()}`;
    httpGet(url, { 'Referer': 'https://item.taobao.com/' }, (err, resp, data) => {
      if (err || !data) {
        cb({ ok: false });
        return;
      }
      try {
        // 解析jsonp格式
        const priceMatch = data.match(/\"reservePrice\"\s*:\s*\"?([\d.]+)\"?/);
        const tradeMatch = data.match(/\"tradePrice\"\s*:\s*\"?([\d.]+)\"?/);
        const titleMatch = data.match(/\"title\"\s*:\s*\"([^\"]+)\"/);
        const price = tradeMatch?.[1] || priceMatch?.[1];
        if (price) {
          cb({ ok: true, price, title: titleMatch?.[1] || '' });
        } else {
          cb({ ok: false });
        }
      } catch (_) {
        cb({ ok: false });
      }
    });
  }

  // ================================================================
  //  Mock: 模拟跨平台比价（基于三方比价逻辑，实际可替换为API）
  //  说明: 真实场景建议接入第三方比价API（如慢慢买、什么值得买等）
  //  此函数仅为演示框架，展示如何构建比价数据
  // ================================================================
  function getCrossPlatformPrice(skuId, platform, currentPrice, cb) {
    // 这里是一个演示用的 mock 查询
    // 实际使用中可替换为 httpGet 调用第三方比价API
    // 例如: httpGet('https://api.niurenqushi.com/compare?sku=' + skuId, {}, cb)

    // Mock: 从缓存中读取上次比价结果（避免频繁请求）
    const cacheKey = `price_${platform}_${skuId}`;
    const cached = read(cacheKey);
    if (cached) {
      try {
        cb(JSON.parse(cached));
        return;
      } catch (_) {}
    }

    // 缓存不存在时返回默认提示
    // （此处仅为框架展示，真实使用需替换为真实API调用）
    const result = {
      platform: platform === 'jd' ? '淘宝/天猫' : '京东',
      currentPrice: currentPrice,
      note: '正在查询跨平台价格…（首次加载较慢）'
    };

    // 写入缓存（1小时过期 - 通过下次清理）
    write(cacheKey, JSON.stringify(result));
    cb(result);
  }

  // ================================================================
  //  主流程
  // ================================================================
  function main() {
    const url = $request.url || '';
    const body = $response.body;

    if (!body) {
      notify('比价脚本', '⚠️ 未获取到响应体', '请确认已开启MitM并信任证书');
      done({});
      return;
    }

    // 判断平台
    const isJD = /m\.jd\.com|api\.m\.jd\.com/.test(url);
    const isTB = /taobao\.com|tmall\.com/.test(url);

    if (!isJD && !isTB) {
      done({ body });
      return;
    }

    // 提取商品ID
    const skuId = isJD ? getJDSkuId(body) : null;
    const itemId = isTB ? getTBItemId(body) : null;

    if ((isJD && !skuId) || (isTB && !itemId)) {
      log('未能提取商品ID，跳过');
      done({ body });
      return;
    }

    const platformName = isJD ? '京东' : '淘宝/天猫';
    const productId = isJD ? skuId : itemId;
    log(`检测到${platformName}商品 ID: ${productId}`);

    // 查询价格
    const priceQuery = isJD
      ? (cb) => fetchJDPrice(skuId, cb)
      : (cb) => fetchTBPrice(itemId, cb);

    priceQuery((result) => {
      let msg = '';
      let title = '';

      if (result.ok) {
        title = `${platformName} 比价结果`;
        msg += `📌 当前价格: ${fmtPrice(result.price)}`;
        if (result.originalPrice && parseFloat(result.originalPrice) > 0) {
          msg += `\n🏷️ 原价: ${fmtPrice(result.originalPrice)}`;
          const discount = ((1 - parseFloat(result.price) / parseFloat(result.originalPrice)) * 100).toFixed(1);
          msg += `\n💰 折扣: ${discount}% off`;
        }
        if (result.title) {
          msg = `📦 ${result.title.substring(0, 30)}…\n` + msg;
        }

        // 尝试跨平台比价（模拟）
        const platformKey = isJD ? 'jd' : 'tb';
        getCrossPlatformPrice(productId, platformKey, result.price, (crossResult) => {
          if (crossResult && crossResult.platform) {
            msg += `\n\n🔄 同款对比 (${crossResult.platform}):`;
            msg += `\n   ${crossResult.note}`;
          }
          notify(title, productId, msg);
          log(msg);
        });
      } else {
        title = `${platformName} 比价`;
        msg = `商品ID: ${productId}\n⚠️ 价格获取失败（API限制或网络问题）`;
        notify(title, '', msg);
      }

      // 尝试注入信息到body
      try {
        const obj = JSON.parse(body);
        // 根据平台注入额外字段
        const injectTarget = isJD ? (obj.skuInfo || obj) : (obj.data || obj);
        if (result.ok) {
          injectTarget._priceCompare = {
            currentPrice: result.price,
            originalPrice: result.originalPrice,
            platform: platformName,
            time: new Date().toLocaleString('zh-CN')
          };
        }
        done({ body: JSON.stringify(obj) });
      } catch (_) {
        // body解析失败，原样返回
        done({ body });
      }
    });
  }

  // 如果请求URL不匹配任何白名单，直接放行
  const url = $request.url || '';
  const isPriceRelated = /(wareBusiness|getWareBusiness|getDetail|getJdPrice|getPrice|taobao|tmall)/i.test(url);
  if (!isPriceRelated) {
    done({ body: $response.body || '' });
    return;
  }

  // 延迟执行，确保$response就绪
  setTimeout(() => main(), 100);
})();
