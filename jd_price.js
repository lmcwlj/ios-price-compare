/*
 ===========================================================
  京东商品比价脚本
  功能：在京东App商品详情页底部显示价格信息
  兼容平台：Shadowrocket / Quantumult X / Surge / Loon
 ===========================================================

  使用方法：

  【Shadowrocket】
  [Script]
  # 清理 HTTPDNS（让请求走 MitM）
  http-response ^https?:\/\/api\.m\.jd\.com\/client\.action\?functionId=basicConfig requires-body=1,max-size=-1,script-path=https://raw.githubusercontent.com/lmcwlj/ios-price-compare/main/jd_price.js

  # 商品详情注入比价
  http-response ^https?:\/\/api\.m\.jd\.com\/client\.action\?functionId=wareBusiness requires-body=1,max-size=-1,script-path=https://raw.githubusercontent.com/lmcwlj/ios-price-compare/main/jd_price.js

  [MITM]
  hostname = api.m.jd.com

  【Quantumult X】
  [rewrite_local]
  ^https?:\/\/api\.m\.jd\.com\/client\.action\?functionId=basicConfig url script-response-body jd_price.js
  ^https?:\/\/api\.m\.jd\.com\/client\.action\?functionId=wareBusiness url script-response-body jd_price.js

  [mitm]
  hostname = api.m.jd.com

  ===========================================================
  ⚠️ 必须开启 MitM + 安装信任证书
  ⚠️ 配置后清空京东App后台再打开
  ===========================================================
*/

;(() => {
  const isSurge = typeof $httpClient !== 'undefined';
  const isQuanX = typeof $task !== 'undefined';
  const log = msg => console.log(`[JD] ${msg}`);

  const httpGet = (url, opts, cb) => {
    if (isQuanX) {
      $task.fetch(Object.assign({ url, method: 'GET' }, opts || {}))
        .then(r => cb(null, r, r.body), e => cb(e, null, null));
    } else {
      $httpClient.get(Object.assign({ url }, opts || {}), (e, r, b) => cb(e, r, b));
    }
  };

  const url = $request.url;
  const body = $response.body;
  if (!body) { $done({}); return; }

  // ---- basicConfig：清除 HTTPDNS，确保后续请求走 MitM ----
  if (url.indexOf('basicConfig') !== -1) {
    try {
      let obj = JSON.parse(body);
      if (obj.data && obj.data.JDHttpToolKit) {
        log('清除 httpdns');
        delete obj.data.JDHttpToolKit.httpdns;
        delete obj.data.JDHttpToolKit.dnsvipV6;
      }
      $done({ body: JSON.stringify(obj) });
    } catch (_) {
      $done({ body });
    }
    return;
  }

  // ---- wareBusiness：商品详情 ----
  if (url.indexOf('wareBusiness') === -1) {
    $done({ body });
    return;
  }

  try {
    let obj = JSON.parse(body);
    if (!obj.floors || !Array.isArray(obj.floors)) {
      $done({ body });
      return;
    }

    const floors = obj.floors;
    const last = floors[floors.length - 1];
    if (!last || !last.data || !last.data.property) {
      // 直接尝试从 obj 提取价格
      let currentPrice = null;
      if (obj.skuInfo && obj.skuInfo.price) currentPrice = obj.skuInfo.price;
      else if (obj.wareInfo && obj.wareInfo.price) currentPrice = obj.wareInfo.price;

      if (currentPrice) {
        const msg = `💰 当前价: ¥${parseFloat(currentPrice).toFixed(2)}`;
        floors.push({
          bId: 'eCustom_flo_199', cf: { bgc: '#ffffff', spl: 'empty' },
          data: { ad: { adword: msg, textColor: '#CC0000', color: '#f23030', newALContent: true, hasFold: true, class: 'com.jd.app.server.warecoresoa.domain.AdWordInfo.AdWordInfo', adLinkContent: '', adLink: '' } },
          mId: 'bpAdword', refId: 'eAdword_0000000028', sortId: 13
        });
      }
      $done({ body: JSON.stringify(obj) });
      return;
    }

    const shareUrl = last.data.property.shareUrl || '';
    const skuMatch = shareUrl.match(/product\/(\d+)/);
    const skuId = skuMatch ? skuMatch[1] : null;

    if (!skuId) { $done({ body }); return; }

    log(`skuId: ${skuId}`);

    // 用 p.3.cn 获取价格
    httpGet(`https://p.3.cn/prices/mgets?skuIds=J_${skuId}&type=1&pdtk=&pdbp=0`, {}, (err, resp, data) => {
      let price = null;
      if (!err && data) {
        try {
          let arr = JSON.parse(data);
          if (arr && arr[0] && arr[0].p) price = parseFloat(arr[0].p).toFixed(2);
        } catch (_) {}
      }

      if (!price) {
        // 从 body 提取
        if (obj.skuInfo && obj.skuInfo.price) price = parseFloat(obj.skuInfo.price).toFixed(2);
        else if (obj.wareInfo && obj.wareInfo.price) price = parseFloat(obj.wareInfo.price).toFixed(2);
      }

      const msg = price ? `💰 当前价: ¥${price}` : '💰 价格加载中...';
      log(msg);

      floors.push({
        bId: 'eCustom_flo_199', cf: { bgc: '#ffffff', spl: 'empty' },
        data: { ad: { adword: msg, textColor: '#CC0000', color: '#f23030', newALContent: true, hasFold: true, class: 'com.jd.app.server.warecoresoa.domain.AdWordInfo.AdWordInfo', adLinkContent: '', adLink: '' } },
        mId: 'bpAdword', refId: 'eAdword_0000000028', sortId: 13
      });

      $done({ body: JSON.stringify(obj) });
    });

  } catch (e) {
    log(`错误: ${e.message}`);
    $done({ body });
  }
})();
