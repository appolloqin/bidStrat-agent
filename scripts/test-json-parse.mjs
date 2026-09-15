import { parseDraftResponse } from '../apps/server/dist/common/llm-parsing.js';

// 模拟模型：content 内直接敲回车（非法 JSON）
const bare = `{"conclusion":"FULLY_MET","content":"**应答正文：**

我司完全满足本项资格要求。

2. 证明文件
- 营业执照"}`;

const r = parseDraftResponse(bare);
console.log({
  parsed: r.parsed,
  conclusion: r.conclusion,
  contentHead: r.content.slice(0, 60).replace(/\n/g, '|'),
});

const withThink = `<think>let me think</think>
{"conclusion":"FULLY_MET","content":"完全满足招标要求，无偏离。"}`;
console.log(parseDraftResponse(withThink));
