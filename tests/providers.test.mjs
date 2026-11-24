import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import { checkOfficial, providerFields, sendOfficial } from '../desktop/providers/index.mjs';
import { officialFetch } from '../desktop/providers/common.mjs';

const creds = {
  wechat: { appId: 'fixture-wechat-account', appSecret: 'fixture-wechat-secret' },
  bilibili: { clientId: 'fixture-client', clientSecret: 'fixture-bili-secret', openId: 'fixture-author', accessToken: 'fixture-bili-token' },
  kuaishou: { appId: 'fixture-ks-app', openId: 'fixture-ks-author', oauthGrant: JSON.stringify({ result: 1, open_id: 'fixture-ks-author', access_token: 'fixture-ks-token', scopes: ['user_video_publish', 'user_video_info'] }) },
  douyin: { openId: 'fixture-douyin-author', accessToken: 'fixture-douyin-token' },
  zhihu: { appKey: 'fixture-zhihu-author', appSecret: 'fixture-zhihu-secret' }
};

function transport() {
  const steps = [];
  const seen = [];
  const errors = [];
  return {
    seen,
    expect(path, answer, inspect, protocol = 'https:') { steps.push({ path, answer, inspect, protocol }); },
    async fetch(url, options) {
      const actual = new URL(url);
      seen.push(actual.pathname);
      try {
        const step = steps.shift();
        assert.ok(step, 'unexpected request ' + actual.pathname);
        assert.equal(actual.pathname, step.path);
        assert.equal(actual.protocol, step.protocol);
        assert.equal(options.redirect, 'error');
        await step.inspect?.(actual, options);
        if (step.answer instanceof Error) throw step.answer;
        return step.answer instanceof Response ? step.answer : Response.json(step.answer);
      } catch (err) {
        if (err instanceof assert.AssertionError) errors.push(err);
        throw err;
      }
    },
    done() { if (errors.length) throw errors[0]; assert.deepEqual(steps, []); }
  };
}

const rpc = (platform, m, content, options = {}) => sendOfficial({
  platform, mode: 'submit', credentials: creds[platform], fetchImpl: m.fetch, content, ...options
});
const query = (platform, m, receipt, options = {}) => checkOfficial({
  platform, credentials: creds[platform], fetchImpl: m.fetch, receipt, ...options
});

let dir, cover, pic, video, big;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'creator-providers-'));
  cover = join(dir, 'cover.jpg'); pic = join(dir, 'image.png'); video = join(dir, 'movie.mp4'); big = join(dir, 'big.mp4');
  await Promise.all([writeFile(cover, 'jpeg-fixture'), writeFile(pic, 'png-fixture'), writeFile(video, 'video-fixture'), writeFile(big, 'vid')]);
  await truncate(big, 101 * 1024 * 1024 + 31);
});
after(async () => { await rm(dir, { recursive: true, force: true }); });

describe('平台授权与提交边界', () => {
  it('凭据字段按账号渠道暴露，四个无远端草稿通道预览时零网络操作', async () => {
    assert.deepEqual(Object.keys(providerFields).sort(), Object.keys(creds).sort());
    const m = transport();
    for (const [platform, type] of [['bilibili', 'article'], ['zhihu', 'pin'], ['kuaishou', 'video'], ['douyin', 'video']]) {
      const result = await rpc(platform, m, { type }, { mode: 'review', credentials: {} });
      assert.equal(result.status, 'needs_action');
      assert.match(result.detail, /本地预览/);
    }
    m.done();
  });
  it('拒绝不支持的平台、方式和内容', async () => {
    const m = transport();
    assert.equal((await rpc('invalid', m, { type: 'video' })).status, 'needs_action');
    assert.equal((await rpc('douyin', m, { type: 'video' }, { mode: 'other' })).status, 'needs_action');
    assert.equal((await rpc('zhihu', m, { type: 'video' })).status, 'needs_action');
    m.done();
  });
  it('缺少凭据的五个平台不会访问网络', async () => {
    const m = transport();
    for (const [platform, content] of [
      ['bilibili', biliVideo(video)], ['wechat', wxContent()], ['douyin', { type: 'video', video }],
      ['kuaishou', ksContent(video)], ['zhihu', { type: 'pin', body: '正文' }]
    ]) {
      assert.equal((await rpc(platform, m, content, { credentials: {} })).status, 'needs_action');
    }
    m.done();
  });
});

const wxToken = m => m.expect('/cgi-bin/stable_token', { access_token: 'fixture-wx-access' }, (_url, o) => {
  assert.deepEqual(JSON.parse(o.body), { grant_type: 'client_credential', appid: creds.wechat.appId, secret: creds.wechat.appSecret, force_refresh: false });
});
const wxDraft = m => {
  wxToken(m);
  m.expect('/cgi-bin/material/add_material', { media_id: 'permanent-image' }, (u, o) => {
    assert.equal(u.searchParams.get('type'), 'image');
    assert.equal(o.body.get('media').name, 'cover.jpg');
  });
  m.expect('/cgi-bin/media/uploadimg', { url: 'http://mmbiz.qpic.cn/example?a=x&b=y' });
  m.expect('/cgi-bin/draft/add', { media_id: 'draft-with-cover' }, (_u, o) => {
    const art = JSON.parse(o.body).articles[0];
    assert.equal(art.thumb_media_id, 'permanent-image');
    assert.match(art.content, /&lt;示例&gt;/);
    assert.match(art.content, /a=x&amp;b=y/);
    assert.equal(art.content.includes(dir), false);
  });
};
const wxContent = () => ({ type: 'article', title: '示例', body: '<示例>', cover, images: [pic] });

describe('微信公众号', () => {
  it('写远端草稿，按原 media_id 提交，按 publish_id 回查发布链接', async () => {
    const m = transport();
    wxDraft(m);
    const draft = await rpc('wechat', m, wxContent(), { mode: 'review' });
    assert.equal(draft.status, 'draft');
    wxToken(m);
    m.expect('/cgi-bin/draft/get', { news_item: [{ url: 'https://mp.weixin.qq.com/draft' }] });
    assert.equal((await query('wechat', m, draft)).status, 'draft');
    wxToken(m);
    m.expect('/cgi-bin/freepublish/submit', { errcode: 0, publish_id: 'task-id' }, (_u, o) => assert.deepEqual(JSON.parse(o.body), { media_id: 'draft-with-cover' }));
    const submitted = await rpc('wechat', m, wxContent(), { receipt: draft });
    assert.equal(submitted.status, 'submitted');
    wxToken(m);
    m.expect('/cgi-bin/freepublish/get', { publish_id: 'task-id', publish_status: 0, article_detail: { item: [{ article_url: 'https://mp.weixin.qq.com/s/published' }] } });
    const published = await query('wechat', m, submitted);
    assert.equal(published.status, 'published');
    assert.equal(published.url, 'https://mp.weixin.qq.com/s/published');
    assert.ok(!JSON.stringify(published).includes(creds.wechat.appSecret));
    m.done();
  });
  it('48001 保留草稿，未知提交不重发，跨账号和已变更稿件均不能复用', async () => {
    const m = transport();
    wxDraft(m);
    m.expect('/cgi-bin/freepublish/submit', { errcode: 48001 });
    const draft = await rpc('wechat', m, wxContent());
    assert.equal(draft.status, 'draft');
    assert.match(draft.detail, /48001/);
    const wrong = await rpc('wechat', m, wxContent(), { receipt: draft, credentials: { ...creds.wechat, appId: 'other' } });
    assert.equal(wrong.status, 'needs_action');
    assert.equal((await rpc('wechat', m, { ...wxContent(), body: 'changed' }, { receipt: draft })).status, 'needs_action');
    wxToken(m);
    m.expect('/cgi-bin/freepublish/submit', new Error('test connection closed'));
    const result = await rpc('wechat', m, wxContent(), { receipt: draft });
    assert.equal(result.status, 'unknown');
    assert.equal(result.draftId, draft.remoteId);
    assert.equal((await query('wechat', m, result)).status, 'unknown');
    assert.equal((await rpc('wechat', m, wxContent(), { receipt: result })).status, 'needs_action');
    m.done();
  });
  it('原生图片消息使用永久素材列表', async () => {
    const m = transport();
    wxToken(m);
    m.expect('/cgi-bin/material/add_material', { media_id: 'pic-id' });
    m.expect('/cgi-bin/draft/add', { media_id: 'native-cards' }, (_u, o) => {
      assert.deepEqual(JSON.parse(o.body).articles[0], { title: '图卡', article_type: 'newspic', content: '说明', image_info: { image_list: [{ image_media_id: 'pic-id' }] } });
    });
    assert.equal((await rpc('wechat', m, { type: 'cards', title: '图卡', body: '说明', images: [pic] }, { mode: 'review' })).status, 'draft');
    m.done();
  });
  it('微信回查区分普通审核失败、用户撤回与系统封禁，原样保留大整数编号', async () => {
    const m = transport();
    wxDraft(m);
    m.expect('/cgi-bin/freepublish/submit', new Response('{"errcode":0,"publish_id":9223372036854775807}'));
    const sent = await rpc('wechat', m, wxContent());
    assert.equal(sent.remoteId, '9223372036854775807');
    for (const [code, status, withdrawn] of [
      [1, 'reviewing', undefined], [2, 'failed', undefined], [4, 'failed', undefined], [5, 'failed', true], [6, 'failed', true],
      [999, 'unknown', undefined], ['0', 'unknown', undefined]
    ]) {
      wxToken(m);
      m.expect('/cgi-bin/freepublish/get', { publish_id: sent.remoteId, publish_status: code, fail_idx: [1] }, (_u, o) => assert.equal(JSON.parse(o.body).publish_id, sent.remoteId));
      const r = await query('wechat', m, sent);
      assert.equal(r.status, status);
      assert.equal(r.withdrawn, withdrawn);
    }
    m.done();
  });
});

function biliSig(_u, o) {
  const h = o.headers;
  const canonical = Object.keys(h).filter(k => k.startsWith('x-bili-')).sort().map(k => k + ':' + h[k]).join('\n');
  assert.equal(h.authorization, createHmac('sha256', creds.bilibili.clientSecret).update(canonical).digest('hex'));
  assert.equal(h['x-bili-content-md5'], createHash('md5').update(typeof o.body === 'string' ? o.body : '').digest('hex'));
  assert.equal(h['access-token'], creds.bilibili.accessToken);
}
const ba = '/arcopen/fn/';
const biliOk = data => ({ code: 0, data });
const biliAccount = (m, openid = creds.bilibili.openId) => m.expect(ba + 'user/account/info', biliOk({ openid }), biliSig);
const biliVideo = file => ({ type: 'video', title: '标题', body: '简介', video: file, biliTid: '17', biliTag: '测试,工具', biliCopyright: '1' });

describe('B站', () => {
  it('核验授权用户、签名及小文件原始字节，准确回查审核中的视频', async () => {
    const m = transport();
    biliAccount(m);
    m.expect(ba + 'archive/video/init', biliOk({ upload_token: 'u' }), (u, o) => { biliSig(u, o); assert.deepEqual(JSON.parse(o.body), { name: 'movie.mp4', utype: '1' }); });
    m.expect('/video/v2/upload', biliOk(), async (u, o) => { assert.equal(u.searchParams.get('upload_token'), 'u'); assert.equal(await o.body.text(), 'video-fixture'); assert.equal(o.headers['access-token'], undefined); });
    m.expect(ba + 'archive/cover/upload', biliOk({ url: 'https://archive.biliimg.com/cover.jpg' }), (u, o) => { biliSig(u, o); assert.equal(o.body.get('file').name, 'cover.jpg'); });
    m.expect(ba + 'archive/add-by-utoken', biliOk({ resource_id: 'BVfixture' }), (u, o) => { biliSig(u, o); assert.equal(u.searchParams.get('upload_token'), 'u'); assert.equal(JSON.parse(o.body).tid, 17); });
    const result = await rpc('bilibili', m, { ...biliVideo(video), cover });
    assert.equal(result.status, 'submitted');
    biliAccount(m);
    m.expect(ba + 'archive/view', biliOk({ resource_id: 'BVfixture', addit_info: { state: -1, state_desc: '审核中' } }), (u, o) => { biliSig(u, o); assert.equal(u.searchParams.get('resource_id'), 'BVfixture'); });
    assert.equal((await query('bilibili', m, result)).status, 'reviewing');
    m.done();
  });
  it('大视频的分片连续、裸传，合并被拒不会再投稿', async () => {
    const m = transport();
    const size = 101 * 1024 * 1024 + 31;
    biliAccount(m);
    m.expect(ba + 'archive/video/init', biliOk({ upload_token: 'u' }));
    for (let i = 0; i < 11; i++) m.expect('/video/v2/part/upload', biliOk(), (u, o) => {
      assert.equal(u.searchParams.get('part_number'), String(i + 1));
      assert.equal(o.body.size, Math.min(10 * 1024 * 1024, size - i * 10 * 1024 * 1024));
    });
    m.expect(ba + 'archive/video/complete', { code: 4002 }, biliSig);
    assert.equal((await rpc('bilibili', m, biliVideo(big))).status, 'needs_action');
    m.done();
  });
  it('凭据与目标 OpenID 不符时停止上传', async () => {
    const m = transport();
    biliAccount(m, 'different-author');
    const result = await rpc('bilibili', m, biliVideo(video));
    assert.equal(result.status, 'needs_action');
    assert.match(result.detail, /OpenID/);
    m.done();
  });
  it('专栏发表和 GET multipart 详情回查', async () => {
    const m = transport();
    biliAccount(m);
    m.expect(ba + 'article/upload/image', biliOk({ url: 'https://article.biliimg.com/image.png' }));
    m.expect(ba + 'article/add', biliOk({ id: 778 }), (u, o) => {
      biliSig(u, o); assert.equal(o.body.get('category'), '3');
      assert.equal(o.body.get('summary').length, 200);
      assert.match(o.body.get('content'), /<figure class="img-box"/);
    });
    const sent = await rpc('bilibili', m, { type: 'article', title: '示例', body: '文'.repeat(230), images: [pic], biliCategory: '3' });
    assert.equal(sent.status, 'submitted');
    biliAccount(m);
    m.expect(ba + 'article/detail', biliOk({ id: 778, state: 0 }), (u, o) => { biliSig(u, o); assert.equal(o.method, 'GET'); assert.equal(o.body.get('id'), '778'); });
    const result = await query('bilibili', m, sent);
    assert.equal(result.status, 'published');
    assert.equal(result.url, 'https://www.bilibili.com/read/cv778');
    m.done();
  });
  it('原生 HTTPS 详情请求保留 GET、multipart 边界、长度和字段', async t => {
    const form = new FormData();
    form.set('id', '778');
    let wire;
    t.mock.method(https, 'request', (url, options, onResponse) => {
      assert.equal(String(url), 'https://member.bilibili.com/arcopen/fn/article/detail');
      const req = new EventEmitter();
      req.end = body => {
        wire = { body, ...options };
        const res = new PassThrough();
        res.statusCode = 200;
        onResponse(res);
        res.end('{"code":0,"data":{"id":778}}');
      };
      return req;
    });
    const response = await officialFetch('https://member.bilibili.com/arcopen/fn/article/detail', { method: 'GET', headers: { accept: 'application/json' }, body: form });
    assert.equal((await response.json()).data.id, 778);
    assert.equal(wire.method, 'GET');
    assert.equal(wire.headers['content-length'], String(wire.body.byteLength));
    const decoded = await new Response(wire.body, { headers: wire.headers }).formData();
    assert.equal(decoded.get('id'), '778');
  });
});

const ks = '/openapi/photo/';
const ksStart = m => m.expect(ks + 'start_upload', { result: 1, endpoint: 'up.gifshow.com', upload_token: 'fixture-upload' }, (u, o) => {
  assert.equal(o.method, 'POST');
  assert.equal(u.searchParams.get('access_token'), 'fixture-ks-token');
});
const ksContent = file => ({ type: 'video', title: '测试', body: '说明', video: file, cover });

describe('快手', () => {
  it('小视频直接上传，异步提交须按 photo_id 回查', async () => {
    const m = transport();
    ksStart(m);
    m.expect('/api/upload', { result: 1 }, async (u, o) => {
      assert.equal(u.hostname, 'up.gifshow.com');
      assert.equal(u.searchParams.get('access_token'), null);
      assert.equal(u.searchParams.get('upload_token'), 'fixture-upload');
      assert.equal(await o.body.text(), 'video-fixture');
    });
    m.expect(ks + 'publish', { result: 1, video_info: { photo_id: 'p123', pending: false } }, (_u, o) => {
      assert.equal(o.body.get('cover').name, 'cover.jpg');
      assert.equal(o.body.get('caption'), '测试\n说明');
    });
    const sent = await rpc('kuaishou', m, ksContent(video));
    assert.equal(sent.status, 'submitted');
    m.expect(ks + 'info', { result: 120001 });
    assert.equal((await query('kuaishou', m, sent)).status, 'unknown');
    m.expect(ks + 'info', { result: 1, video_info: { photo_id: 'p123', pending: false } }, u => assert.equal(u.searchParams.get('photo_id'), 'p123'));
    assert.equal((await query('kuaishou', m, sent)).status, 'published');
    assert.equal((await query('kuaishou', m, sent, { credentials: { ...creds.kuaishou, openId: 'wrong' } })).checkStatus, 'needs_action');
    m.done();
  });
  it('按零起始分片上传，大文件合并后只发送一次发布请求', async () => {
    const m = transport();
    ksStart(m);
    for (let i = 0; i < 13; i++) m.expect('/api/upload/fragment', { result: 1 }, (u, o) => {
      assert.equal(u.searchParams.get('fragment_id'), String(i));
      assert.ok(o.body.size <= 8 * 1024 * 1024);
    });
    m.expect('/api/upload/complete', { result: 1 }, u => assert.equal(u.searchParams.get('fragment_count'), '13'));
    m.expect(ks + 'publish', new Response('gateway', { status: 502 }));
    assert.equal((await rpc('kuaishou', m, ksContent(big))).status, 'unknown');
    assert.equal(m.seen.filter(p => p.endsWith('/publish')).length, 1);
    m.done();
  });
  it('误配授权和外部地址在传输前拦住', async () => {
    const m = transport();
    assert.equal((await rpc('kuaishou', m, ksContent(video), { credentials: { ...creds.kuaishou, openId: 'other' } })).status, 'needs_action');
    m.expect(ks + 'start_upload', { result: 1, endpoint: 'not-kuaishou.example.com', upload_token: 'fake' });
    assert.equal((await rpc('kuaishou', m, ksContent(video))).status, 'needs_action');
    m.done();
  });
  it('用户授予的 scope 缺失时零请求，明确选择 HTTP 只用于临时文件上传令牌', async () => {
    const m = transport(), account = creds.kuaishou;
    const unauthorized = { ...account, oauthGrant: JSON.stringify({ ...JSON.parse(account.oauthGrant), scopes: ['user_info'] }) };
    assert.equal((await rpc('kuaishou', m, ksContent(video), { credentials: unauthorized })).status, 'needs_action');
    ksStart(m);
    m.expect('/api/upload', { result: 1 }, u => {
      assert.deepEqual([...u.searchParams.keys()], ['upload_token']);
      assert.equal(u.hostname, 'up.gifshow.com');
    }, 'http:');
    m.expect(ks + 'publish', { result: 1, video_info: { photo_id: 'p123' } });
    assert.equal((await rpc('kuaishou', m, ksContent(video), { credentials: { ...account, uploadProtocol: 'HTTP' } })).status, 'submitted');
    m.done();
  });
});

const dy = '/api/douyin/v1/video/';
const dyOk = fields => ({ data: { error_code: 0, ...fields }, extra: { error_code: 0 } });

describe('抖音', () => {
  it('新版上传与发稿接口按 OpenID 发送，缺少审核状态时保留未知', async () => {
    const m = transport();
    m.expect(dy + 'upload_video/', dyOk({ video: { video_id: '@video' } }), (u, o) => {
      assert.equal(u.searchParams.get('open_id'), creds.douyin.openId);
      assert.equal(o.headers['access-token'], creds.douyin.accessToken);
      assert.equal(o.body.get('video').name, 'movie.mp4');
    });
    m.expect(dy + 'upload_image/', dyOk({ image: { image_id: '@cover' } }));
    m.expect(dy + 'create_video/', dyOk({ item_id: '@result' }), (_u, o) => {
      assert.deepEqual(JSON.parse(o.body), { video_id: '@video', text: '标题\n简介', custom_cover_image_url: '@cover' });
    });
    const sent = await rpc('douyin', m, { type: 'video', video, cover, title: '标题', body: '简介' });
    assert.equal(sent.status, 'submitted');
    m.expect(dy + 'video_basic_info/', dyOk({ list: [{ item_id: '@result', title: '仍无可见状态' }] }), (_u, o) => assert.deepEqual(JSON.parse(o.body), { item_ids: ['@result'] }));
    assert.equal((await query('douyin', m, sent)).status, 'unknown');
    m.expect(dy + 'video_basic_info/', { data: { error_code: 28001018 } });
    const noPermission = await query('douyin', m, sent);
    assert.equal(noPermission.status, 'submitted');
    assert.equal(noPermission.checkStatus, 'needs_action');
    m.done();
  });
  it('大文件分片全部在有效范围，成功码缺失不能确认投稿成功', async () => {
    const m = transport();
    m.expect(dy + 'init_video_part_upload/', dyOk({ upload_id: '@parts' }));
    let bytes = 0;
    for (let i = 1; i <= 6; i++) m.expect(dy + 'upload_video_part/', dyOk({}), (u, o) => {
      assert.equal(u.searchParams.get('part_number'), String(i));
      assert.equal(u.searchParams.get('upload_id'), '@parts');
      const length = o.body.get('video').size;
      assert.ok(length >= 5 * 1024 * 1024 && length <= 20 * 1024 * 1024);
      bytes += length;
    });
    m.expect(dy + 'complete_video_part_upload/', dyOk({ video: { video_id: '@big' } }));
    m.expect(dy + 'create_video/', { data: { item_id: 'no-business-code' } });
    assert.equal((await rpc('douyin', m, { type: 'video', video: big, title: '标题' })).status, 'unknown');
    assert.equal(bytes, 101 * 1024 * 1024 + 31);
    m.done();
  });
});

function testMedia(calls) {
  return async credentials => ({
    async callTool({ name, arguments: args }) {
      assert.equal(name, 'upload_image');
      assert.equal(credentials.appKey, creds.zhihu.appKey);
      calls.push(args);
      return { content: [{ type: 'text', text: JSON.stringify({
        success: true, media_type: 'image', upload_result: 'UPLOAD_SUCCESS', media_key: 'fixture-image-key',
        media_url: { primary: 'https://pic1.zhimg.com/original.png' }, media_meta: { width: 400, height: 300 },
        extra: { watermark_image_url: { primary: 'https://pic-private.zhihu.com/watermark.png?a=1&b=2' } }
      }) }] };
    }, async close() {}
  });
}

describe('知乎同步助手', () => {
  for (const type of ['article', 'pin']) it('按官方签名、配图和用户创作声明发表' + type, async () => {
    const m = transport(), media = [];
    const url = type === 'article' ? 'https://zhuanlan.zhihu.com/p/123' : 'https://www.zhihu.com/pin/123';
    m.expect('/openapi/publish', { status: 0, data: { type, content_token: '123', url } }, (u, o) => {
      assert.equal(u.hostname, 'openapi.zhihu.com');
      const h = o.headers;
      assert.equal(h['x-extra-info'], '');
      const signed = 'app_key:' + h['x-app-key'] + '|ts:' + h['x-timestamp'] + '|logid:' + h['x-log-id'] + '|extra_info:';
      assert.equal(h['x-sign'], createHmac('sha256', creds.zhihu.appSecret).update(signed).digest('base64'));
      const body = JSON.parse(o.body);
      assert.equal(body.confirmed, true);
      assert.equal(body.content.creation_statement, 'ai_creation');
      assert.equal(body.content.comment_permission, 'nobody');
      assert.match(body.content.html, /&lt;演示&gt;/);
      if (type === 'pin') {
        assert.deepEqual(body.content.images, [{ url: 'https://pic-private.zhihu.com/watermark.png?a=1&b=2' }]);
        assert.equal(body.content.table_of_contents_enabled, undefined);
      } else {
        assert.equal(body.content.table_of_contents_enabled, true);
        assert.match(body.content.html, /data-rawwidth="400"/);
        assert.equal(body.content.images, undefined);
      }
    });
    const sent = await rpc('zhihu', m, { type, title: '标题', body: '一篇用于回执测试的<演示>', images: [pic], zhihuComment: 'nobody', zhihuStatement: 'ai_creation', zhihuToc: true }, { createMediaClient: testMedia(media) });
    assert.deepEqual(media, [{ scene_name: type, file_path: pic }]);
    assert.equal(sent.status, 'published');
    assert.equal(sent.url, url);
    assert.equal((await query('zhihu', m, sent)).status, 'published');
    m.done();
  });
  it('内容带视频、定向权限不足和缺失回执分别处理', async () => {
    const m = transport();
    const content = { type: 'article', title: '标题', body: '一篇用于测试回执的文章。' };
    assert.equal((await rpc('zhihu', m, { ...content, body: '过短' })).status, 'needs_action');
    assert.equal((await rpc('zhihu', m, { ...content, video })).status, 'needs_action');
    m.expect('/openapi/publish', { status: 1, msg: 'authorization text with ' + creds.zhihu.appSecret });
    const denied = await rpc('zhihu', m, content);
    assert.equal(denied.status, 'needs_action');
    assert.ok(!JSON.stringify(denied).includes(creds.zhihu.appSecret));
    m.expect('/openapi/publish', new Response('not JSON'));
    assert.equal((await rpc('zhihu', m, content)).status, 'unknown');
    m.done();
  });
});
