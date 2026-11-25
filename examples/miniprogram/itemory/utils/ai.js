/* Itemory 小程序 · AI 识图协议层
   对应 Itemory/services/ai-vision.ts（MIT，Copyright (c) 2026 StarYunLee）里的公开部分：
   接口地址规范化、模型列表、提示词拼装、识别结果解析与隐私过滤、请求重试策略。

   桌面版用 fetch + Keychain；小程序用 wx.request，密钥存本机（可选口令加密，
   见 utils/secret.js），能力上等价，但没有系统级 Keychain。 */

const { DEFAULT_PROMPT, OUTPUT_CONTRACT } = require('../data/prompts.js');
const { isValidYmd } = require('./format.js');
const { parseYuanToMinor } = require('./format.js');

const PROFILE_KEY = 'itemory.aiVision.v1';
const MAX_RESPONSE_CHARS = 512000;
const MAX_ATTEMPTS = 4;
const TOTAL_TIMEOUT_MS = 60000;

const EMPTY_PROFILE = {
  enabled: false,
  baseURL: '',
  endpointKind: 'chat_completions',
  model: '',
  models: [],
  modelsFetchedAt: null,
  reasoningEffort: 'medium',
  customPrompt: '',
  consentAt: null,
};

const EFFORT_OPTIONS = ['low', 'medium', 'high', 'xhigh', 'max'];

/* ---------- 配置读写（异步 storage） ---------- */

function getStorage(key) {
  return new Promise(resolve => {
    wx.getStorage({ key, success: res => resolve(res && res.data), fail: () => resolve(null) });
  });
}

function setStorage(key, data) {
  return new Promise((resolve, reject) => {
    wx.setStorage({ key, data, success: () => resolve(), fail: err => reject(new Error((err && err.errMsg) || '写入失败')) });
  });
}

function removeStorage(key) {
  return new Promise(resolve => {
    wx.removeStorage({ key, success: () => resolve(), fail: () => resolve() });
  });
}

function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object') return Object.assign({}, EMPTY_PROFILE);
  const models = Array.isArray(raw.models) ? raw.models.filter(m => typeof m === 'string') : [];
  return {
    enabled: Boolean(raw.enabled),
    baseURL: typeof raw.baseURL === 'string' ? raw.baseURL : '',
    endpointKind: raw.endpointKind === 'responses' ? 'responses' : 'chat_completions',
    model: typeof raw.model === 'string' ? raw.model : '',
    models,
    modelsFetchedAt: typeof raw.modelsFetchedAt === 'number' ? raw.modelsFetchedAt : null,
    reasoningEffort: EFFORT_OPTIONS.indexOf(raw.reasoningEffort) >= 0 ? raw.reasoningEffort : 'medium',
    customPrompt: typeof raw.customPrompt === 'string' ? raw.customPrompt : '',
    consentAt: typeof raw.consentAt === 'number' ? raw.consentAt : null,
  };
}

async function readProfile() {
  return normalizeProfile(await getStorage(PROFILE_KEY));
}

async function saveProfile(patch) {
  const current = await readProfile();
  const next = normalizeProfile(Object.assign({}, current, patch));
  await setStorage(PROFILE_KEY, next);
  return next;
}

async function clearProfile() {
  await removeStorage(PROFILE_KEY);
}

/* ---------- 接口地址与模型 ---------- */

function resolveRoot(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) throw new Error('请填写接口地址');
  let url;
  try { url = new URL(trimmed); } catch (e) { throw new Error('接口地址不是有效 URL'); }
  if (url.protocol !== 'https:') throw new Error('接口地址必须使用 HTTPS，以保护密钥与图片');
  if (/^https:\/\/[^/]*@/i.test(trimmed)) throw new Error('接口地址不能包含用户名或密码');
  if (/[?#]/.test(trimmed)) throw new Error('接口地址不能包含查询参数或片段');
  let path = url.pathname.replace(/\/+$/, '');
  path = path.replace(/\/(models|chat\/completions|responses)$/i, '');
  if (!path) path = '/v1';
  if (path.charAt(0) !== '/') path = `/${path}`;
  const host = url.port ? `${url.hostname}:${url.port}` : url.hostname;
  return `${url.protocol}//${host}${path}`;
}

function parseModelIds(payload) {
  const rows = Array.isArray(payload) ? payload
    : payload && typeof payload === 'object' && Array.isArray(payload.data) ? payload.data
      : null;
  if (!rows) throw new Error('模型列表不是 OpenAI 兼容格式');
  const ids = [];
  for (const row of rows) {
    const id = typeof row === 'string' ? row : (row && typeof row.id === 'string' ? row.id : '');
    if (id && ids.indexOf(id) < 0) ids.push(id);
  }
  if (!ids.length) throw new Error('模型列表为空');
  return ids.sort((a, b) => a.localeCompare(b));
}

function request(options) {
  return new Promise((resolve, reject) => {
    wx.request(Object.assign({}, options, {
      success: res => resolve(res),
      fail: err => reject(new Error((err && err.errMsg) || '网络请求失败')),
    }));
  });
}

function bodyText(res) {
  if (!res) return '';
  if (typeof res.data === 'string') return res.data;
  if (res.data !== undefined && res.data !== null) return JSON.stringify(res.data);
  return '';
}

function statusMessage(status) {
  if (status === 401 || status === 403) return '密钥无效或没有访问权限';
  if (status === 404) return '接口地址或路径不正确';
  if (status === 429) return '请求过于频繁，请稍后再试';
  return `服务器返回 HTTP ${status}`;
}

async function refreshModels(input) {
  const root = resolveRoot(input.baseURL);
  const apiKey = String(input.apiKey || '').trim();
  if (!apiKey) throw new Error('请填写 API Key');
  let res;
  try {
    res = await request({
      url: `${root}/models`,
      method: 'GET',
      header: { Authorization: `Bearer ${apiKey}` },
      timeout: 20000,
    });
  } catch (e) {
    throw new Error('无法连接到接口地址');
  }
  const text = bodyText(res);
  if (text.length > MAX_RESPONSE_CHARS) throw new Error('模型列表响应过大');
  if (res.statusCode < 200 || res.statusCode >= 300) throw new Error(statusMessage(res.statusCode));
  let payload;
  try { payload = JSON.parse(text); } catch (e) { throw new Error('模型列表不是 JSON'); }
  return parseModelIds(payload);
}

/* ---------- 提示词 ---------- */

function buildPrompt(candidateCategories, customPrompt) {
  const categoriesText = candidateCategories && candidateCategories.length
    ? candidateCategories.join(', ')
    : '"数码电子", "生活日用", "运动户外", "服装配饰", "办公设备"';
  const template = customPrompt && String(customPrompt).trim()
    ? String(customPrompt).trim()
    : DEFAULT_PROMPT;
  const context = template.indexOf('{{categories}}') >= 0
    ? template.split('{{categories}}').join(categoriesText)
    : `${template}\n\n[Candidate Categories in Itemory: ${categoriesText}]`;
  return `${context}\n\n${OUTPUT_CONTRACT}`;
}

/* ---------- 结果解析 ---------- */

/* 只做保守过滤：命中敏感行就丢掉，并提示用户核对，不宣称能识别全部个人信息 */
const SENSITIVE = /(?:订单(?:编号|号)|收件人|联系人|联系电话|手机(?:号码|号)?|收货地址|配送地址|身份证|运单号|快递单号|姓名)\s*[:：=]?|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:^|[^0-9])1[3-9][0-9]{9}(?![0-9])/i;

function filterNotes(notes) {
  if (!notes) return { notes: null, removed: false };
  let removed = false;
  const kept = String(notes)
    .split(/[\n；;]/)
    .filter(line => {
      if (SENSITIVE.test(line)) { removed = true; return false; }
      return true;
    })
    .join('；')
    .trim();
  return { notes: kept || null, removed };
}

function extractJsonObject(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('模型没有返回内容');
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : trimmed).trim();
  try { return JSON.parse(body); } catch (e) { /* 继续尝试截取 */ }
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(body.slice(start, end + 1)); } catch (e) { /* 放弃 */ }
  }
  throw new Error('模型返回的不是 JSON');
}

function contentFromPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('响应不是 JSON 对象');
  if (payload.error) throw new Error('模型返回错误，未生成物品信息');
  if (typeof payload.status === 'string' && payload.status !== 'completed') {
    throw new Error('模型响应未完整完成，请重试');
  }
  function blocks(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    let text = '';
    for (const entry of content) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.type === 'refusal' || entry.refusal) throw new Error('模型拒绝识别此图片，请更换图片');
      if ((entry.type === 'text' || entry.type === 'output_text') && typeof entry.text === 'string') {
        text += entry.text;
      }
    }
    return text;
  }
  if (Array.isArray(payload.output)) {
    const messages = payload.output.filter(x => x && typeof x === 'object' && x.type === 'message' &&
      (!x.role || x.role === 'assistant'));
    if (messages.length > 1) throw new Error('模型返回多个消息，无法确定单物品结果');
    if (messages.length === 1) {
      if (messages[0].status === 'incomplete' || messages[0].status === 'failed') {
        throw new Error('模型消息未完整完成，请重试');
      }
      const text = blocks(messages[0].content);
      if (text.trim()) return text;
    }
  }
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  if (Array.isArray(payload.choices) && payload.choices.length) {
    const choice = payload.choices[0] || {};
    if (choice.finish_reason === 'length') throw new Error('模型回复被截断，请重试');
    if (choice.finish_reason === 'content_filter') throw new Error('模型拒绝识别此图片，请更换图片');
    const message = choice.message || {};
    if (message.refusal) throw new Error('模型拒绝识别此图片，请更换图片');
    const text = blocks(message.content);
    if (text.trim()) return text;
  }
  throw new Error('响应中缺少模型文本');
}

function parseExtraction(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('识别结果不是有效的 JSON 对象');
  }
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!name) throw new Error('识别结果缺少物品名称');
  if (name.length > 300) throw new Error('识别结果的物品名称过长');
  const warnings = [];

  function optionalText(value, field, max) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') { warnings.push(`${field}格式无效，已忽略`); return null; }
    const text = value.trim();
    if (!text) return null;
    if (text.length > max) { warnings.push(`${field}过长，已忽略`); return null; }
    return text;
  }
  function optionalDate(value, field) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string' && isValidYmd(value)) return value;
    warnings.push(`${field}不是有效日历日期，已忽略`);
    return null;
  }

  const categoryHint = optionalText(payload.categoryHint, '分类建议', 200);
  let price = null;
  if (payload.price !== undefined && payload.price !== null) {
    if (typeof payload.price === 'number' && isFinite(payload.price) && payload.price >= 0) {
      try { parseYuanToMinor(String(payload.price)); price = payload.price; }
      catch (e) { warnings.push('金额精度或范围无效，已忽略'); }
    } else {
      warnings.push('金额格式或范围无效，已忽略');
    }
  }
  const acquiredOn = optionalDate(payload.acquiredOn, '购入日期');
  const channel = optionalText(payload.channel, '购买渠道', 200);
  let warrantyUntil = optionalDate(payload.warrantyUntil, '保修截止日期');
  if (warrantyUntil && acquiredOn && warrantyUntil < acquiredOn) {
    warnings.push('保修截止日期早于购入日期，已忽略');
    warrantyUntil = null;
  }

  let imageType = 'other';
  const rawType = payload.imageType || payload.classification;
  if (rawType === 'physical_item' || rawType === 'order_receipt' || rawType === 'mixed') {
    imageType = rawType;
  }

  const rawNotes = optionalText(payload.notes, '备注', 2000);
  const filtered = filterNotes(rawNotes);
  if (filtered.removed) warnings.push('备注中的常见个人信息或订单标识已移除，请核对');

  const targetStatus = payload.targetStatus === 'single' || payload.targetStatus === 'ambiguous'
    ? payload.targetStatus : 'unknown';
  const priceScope = payload.priceScope === 'item' || payload.priceScope === 'order'
    ? payload.priceScope : 'unknown';
  const itemCount = typeof payload.itemCount === 'number' && Number.isSafeInteger(payload.itemCount) && payload.itemCount > 0
    ? payload.itemCount : null;
  const rawCurrency = typeof payload.currency === 'string' ? payload.currency.trim().toUpperCase() : null;
  const currency = rawCurrency === 'RMB' || rawCurrency === '人民币' || rawCurrency === '元'
    ? 'CNY'
    : (rawCurrency && /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : null);

  if (targetStatus === 'ambiguous' || (itemCount !== null && itemCount > 1)) {
    throw new Error('图片中有多个候选物品，请选择单件截图后重试');
  }

  const legacyAmount = !['targetStatus', 'priceScope', 'currency', 'itemCount']
    .some(key => Object.prototype.hasOwnProperty.call(payload, key));
  const priceNeedsConfirmation = price !== null && legacyAmount;
  if (price !== null && !priceNeedsConfirmation &&
    (targetStatus !== 'single' || priceScope !== 'item' || currency !== 'CNY')) {
    warnings.push('金额归属或币种未明确为单件人民币，已留空，请人工确认');
    price = null;
  }
  if (priceNeedsConfirmation) warnings.push('旧格式未提供金额归属/币种，金额仅作待确认草稿');

  return {
    name,
    categoryHint,
    price,
    acquiredOn,
    channel,
    warrantyUntil,
    imageType,
    notes: filtered.notes,
    warnings,
    targetStatus,
    priceScope,
    currency,
    itemCount,
    priceNeedsConfirmation,
  };
}

/* ---------- 发起识别 ---------- */

function classifyUnsupportedParameter(status, text) {
  if (status !== 400 && status !== 422) return null;
  let error;
  try { error = JSON.parse(text).error; } catch (e) { return null; }
  if (!error || typeof error !== 'object') return null;
  const code = typeof error.code === 'string' ? error.code.toLowerCase() : '';
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  const param = typeof error.param === 'string' ? error.param.toLowerCase() : '';
  const unsupported = code === 'unsupported_parameter' || code === 'unsupported_value' ||
    /not supported|unsupported|does not support|not compatible/.test(message);
  if (!unsupported) return null;
  const clue = param || message;
  if (/reasoning(?:_effort)?|reasoning\.effort/.test(clue)) return 'reasoning';
  if (/temperature/.test(clue)) return 'temperature';
  if (/response_format|json_object|text(?:\.format|\.format\.type)/.test(clue)) return 'json';
  return null;
}

async function postOnce(url, apiKey, body) {
  const res = await request({
    url,
    method: 'POST',
    header: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    data: body,
    timeout: 45000,
  });
  const text = bodyText(res);
  if (text.length > MAX_RESPONSE_CHARS) throw new Error('模型响应过大，请使用单物品图片重试');
  return { status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, text };
}

/**
 * 识别一张图。图片用 data URL 传（和桌面版一致）。
 * 与桌面版相同的降级策略：服务端明确拒绝 response_format / reasoning / temperature
 * 时去掉该参数重试，最多 4 次。
 */
async function extractItemFromImage(input) {
  const root = resolveRoot(input.baseURL);
  const apiKey = String(input.apiKey || '').trim();
  const model = String(input.model || '').trim();
  const endpointKind = input.endpointKind === 'responses' ? 'responses' : 'chat_completions';
  if (!apiKey) throw new Error('请填写 API Key');
  if (!model) throw new Error('请选择模型');
  const rawImage = String(input.imageDataUrl || '').trim();
  if (!rawImage) throw new Error('请提供图片数据');
  const dataUrl = rawImage.indexOf('data:') === 0 ? rawImage : `data:image/jpeg;base64,${rawImage}`;

  const promptText = buildPrompt(input.candidateCategories || [], input.customPrompt);
  const effort = EFFORT_OPTIONS.indexOf(input.reasoningEffort) >= 0 ? input.reasoningEffort : 'medium';

  let usedJsonObject = true;
  let includeReasoning = true;
  let includeTemperature = true;

  function buildBody() {
    if (endpointKind === 'responses') {
      const body = {
        model,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: promptText },
            { type: 'input_image', image_url: dataUrl },
          ],
        }],
      };
      if (usedJsonObject) body.text = { format: { type: 'json_object' } };
      if (includeReasoning) body.reasoning = { effort };
      return body;
    }
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: promptText },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    }];
    const body = { model, messages };
    if (includeTemperature) body.temperature = 0;
    if (usedJsonObject) body.response_format = { type: 'json_object' };
    if (includeReasoning) body.reasoning_effort = effort;
    return body;
  }

  const url = endpointKind === 'responses' ? `${root}/responses` : `${root}/chat/completions`;
  const startedAt = Date.now();
  const attempts = [];
  let result = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (Date.now() - startedAt > TOTAL_TIMEOUT_MS) throw new Error('识图任务超时');
    try {
      result = await postOnce(url, apiKey, buildBody());
    } catch (e) {
      throw new Error('无法连接到接口地址，请检查网络或 HTTPS 配置');
    }
    const parameter = !result.ok ? classifyUnsupportedParameter(result.status, result.text) : null;
    const canRemove = parameter === 'json' ? usedJsonObject
      : parameter === 'reasoning' ? includeReasoning
        : parameter === 'temperature' ? includeTemperature && endpointKind === 'chat_completions'
          : false;
    const retry = canRemove && attempt < MAX_ATTEMPTS;
    attempts.push({ number: attempt, status: result.status, removed: retry ? parameter : null });
    if (!retry) break;
    if (parameter === 'json') usedJsonObject = false;
    else if (parameter === 'reasoning') includeReasoning = false;
    else includeTemperature = false;
  }

  const latencyMs = Date.now() - startedAt;
  if (!result.ok) throw new Error(statusMessage(result.status));

  let payload;
  try { payload = JSON.parse(result.text); } catch (e) { throw new Error('接口返回的不是 JSON'); }
  const text = contentFromPayload(payload);
  const extraction = parseExtraction(extractJsonObject(text));
  return {
    extraction,
    rawOutput: text,
    attempts,
    latencyMs,
    usedJsonObject,
    endpointKind,
    model,
  };
}

/* ---------- 分类匹配 ---------- */

function matchBestCategory(hint, categories) {
  if (!hint) return null;
  const cleanHint = String(hint).trim().toLowerCase();
  if (!cleanHint) return null;
  const exact = categories.filter(c =>
    String(c.name || '').trim().toLowerCase() === cleanHint ||
    String(c.normalizedName || '').trim().toLowerCase() === cleanHint);
  if (exact.length === 1) return exact[0];
  const inclusion = categories.filter(c => {
    const names = [c.name, c.normalizedName]
      .map(name => String(name || '').trim().toLowerCase())
      .filter(Boolean);
    return names.some(name => cleanHint.indexOf(name) >= 0 || name.indexOf(cleanHint) >= 0);
  });
  return inclusion.length === 1 ? inclusion[0] : null;
}

module.exports = {
  PROFILE_KEY,
  EMPTY_PROFILE,
  EFFORT_OPTIONS,
  MAX_RESPONSE_CHARS,
  readProfile,
  saveProfile,
  clearProfile,
  resolveRoot,
  parseModelIds,
  refreshModels,
  buildPrompt,
  extractJsonObject,
  contentFromPayload,
  parseExtraction,
  classifyUnsupportedParameter,
  extractItemFromImage,
  matchBestCategory,
  filterNotes,
};
