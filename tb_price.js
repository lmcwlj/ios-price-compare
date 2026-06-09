/*
 ===========================================================
  淘宝/天猫商品比价脚本
  功能：在淘宝App商品详情页展示比价信息
  兼容平台：Shadowrocket / Quantumult X / Surge / Loon
 ===========================================================

  使用方法：

  【Shadowrocket】
  [Script]
  # DNS劫持（让请求正确走 MitM）
  http-request ^http://.+/amdc/mobileDispatch requires-body=1,max-size=-1,script-path=https://raw.githubusercontent.com/lmcwlj/ios-price-compare/main/tb_price.js
  http-response ^http://.+/amdc/mobileDispatch requires-body=1,max-size=-1,script-path=https://raw.githubusercontent.com/lmcwlj/ios-price-compare/main/tb_price.js

  # 商品详情
  http-response ^https?://trade-acs\.m\.taobao\.com/gw/mtop\.taobao\.detail\.getdetail requires-body=1,max-size=-1,script-path=https://raw.githubusercontent.com/lmcwlj/ios-price-compare/main/tb_price.js

  [MITM]
  hostname = trade-acs.m.taobao.com

  【Quantumult X】
  [rewrite_local]
  ^http://.+/amdc/mobileDispatch url script-request-body tb_price.js
  ^http://.+/amdc/mobileDispatch url script-response-body tb_price.js
  ^https?://trade-acs\.m\.taobao\.com/gw/mtop\.taobao\.detail\.getdetail url script-response-body tb_price.js

  [mitm]
  hostname = trade-acs.m.taobao.com

  ===========================================================
  ⚠️ 必须开启 MitM + 安装信任证书
  ⚠️ 配置后清空淘宝App后台再打开
  ===========================================================
*/

;(() => {
  const isSurge = typeof $httpClient !== 'undefined';
  const isQuanX = typeof $task !== 'undefined';
  const log = msg => console.log(`[TB] ${msg}`);

  const httpGet = (url, opts, cb) => {
    if (isQuanX) {
      $task.fetch(Object.assign({ url, method: 'GET' }, opts || {}))
        .then(r => cb(null, r, r.body), e => cb(e, null, null));
    } else {
      $httpClient.get(Object.assign({ url }, opts || {}), (e, r, b) => cb(e, r, b));
    }
  };

  // Base64 工具（兼容无原生支持的环境）
  const base64 = {
    decode(s) {
      try { return atob(s); } catch(_) {}
      try { return Buffer.from(s, 'base64').toString(); } catch(_) {}
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let str = s.replace(/=+$/, ''), out = '', buf = 0, bits = 0;
      for (let c of str) {
        buf = (buf << 6) | chars.indexOf(c);
        bits += 6;
        if (bits >= 8) {
          out += String.fromCharCode((buf >> (bits - 8)) & 0xFF);
          bits -= 8;
        }
      }
      return out;
    },
    encode(s) {
      try { return btoa(s); } catch(_) {}
      try { return Buffer.from(s).toString('base64'); } catch(_) {}
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
      let out = '', buf = 0, bits = 0;
      for (let c of s) {
        buf = (buf << 8) | c.charCodeAt(0);
        bits += 8;
        while (bits >= 6) {
          out += chars[(buf >> (bits - 6)) & 0x3F];
          bits -= 6;
        }
      }
      if (bits) out += chars[(buf << (6 - bits)) & 0x3F];
      while (out.length % 4) out += '=';
      return out;
    }
  };

  const url = $request.url || '';

  // ============================================================
  //  处理 /amdc/mobileDispatch（HTTPDNS 劫持）
  // ============================================================
  if (url.indexOf('/amdc/mobileDispatch') !== -1) {
    if (typeof $response !== 'undefined' && $response.body) {
      // Response 阶段：清除 trade-acs DNS 记录
      try {
        let obj = JSON.parse(base64.decode($response.body));
        if (obj.dns && Array.isArray(obj.dns)) {
          for (let i = 0; i < obj.dns.length; i++) {
            if (obj.dns[i].host === 'trade-acs.m.taobao.com') {
              obj.dns[i].ips = [];
              log('DNS cleared');
            }
          }
        }
        $done({ body: base64.encode(JSON.stringify(obj)) });
      } catch (e) {
        log(`DNS error: ${e.message}`);
        $done({});
      }
      return;
    }

    if ($request && $request.body) {
      // Request 阶段：移除 domain 中的 trade-acs
      try {
        let body = $request.body;
        let params = body.split('&');
        let newParams = [];
        for (let p of params) {
          if (p.indexOf('domain=') === 0) {
            let val = decodeURIComponent(p.split('=').slice(1).join('='));
            let domains = val.split(' ').filter(d => d !== 'trade-acs.m.taobao.com');
            newParams.push('domain=' + encodeURIComponent(domains.join(' ')));
          } else {
            newParams.push(p);
          }
        }
        $done({ body: newParams.join('&') });
      } catch (e) {
        $done({ body: $request.body });
      }
      return;
    }
    $done({});
    return;
  }

  // ============================================================
  //  处理商品详情
  // ============================================================
  if (url.indexOf('mtop.taobao.detail.getdetail') !== -1) {
    const body = $response.body;
    if (!body) { $done({}); return; }

    try {
      let obj = JSON.parse(body);
      let item = obj.data && obj.data.item;
      let itemId = item && item.itemId;

      if (!itemId) { $done({ body }); return; }

      log(`itemId: ${itemId}`);

      // 查价格
      httpGet(`https://detailskip.taobao.com/json/item.htm?itemId=${itemId}&t=${Date.now()}`, 
        { headers: { 'Referer': 'https://item.taobao.com/', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } },
        (err, resp, data) => {

        let price = null;
        if (!err && data) {
          let m = data.match(/"tradePrice"\s*:\s*"([\d.]+)"/);
          if (!m) m = data.match(/"reservePrice"\s*:\s*"([\d.]+)"/);
          if (m) price = m[1];
        }

        const priceText = price ? `¥${price}` : '加载中...';
        const msg = `💰 ${priceText}`;
        log(msg);

        // 注入到 apiStack
        if (obj.data.apiStack) {
          try {
            let stack = obj.data.apiStack[0];
            let val = JSON.parse(stack.value);
            let target = val.global ? val.global.data : val;

            if (target.tradeConsumerProtection) {
              let svc = target.tradeConsumerProtection.tradeConsumerService;
              svc.service.items.unshift({ icon: '', iconColor: '', title: msg, subTitle: `⏰ ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`, link: '' });
            } else if (target.consumerProtection) {
              let bs = target.consumerProtection.serviceProtection.basicService;
              bs.services.unshift({ text: msg, type: 1, content: '' });
            }

            stack.value = JSON.stringify(val);
          } catch (e) {
            log(`注入失败: ${e.message}`);
          }
        }

        $done({ body: JSON.stringify(obj) });
      });

    } catch (e) {
      log(`错误: ${e.message}`);
      $done({ body });
    }
    return;
  }

  $done({ body: $response.body || '' });
})();
