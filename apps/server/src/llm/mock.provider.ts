interface Msg {
  role: string;
  content: string;
}

function lastUser(messages: Msg[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return '';
}

function pick(prompt: string, key: string): string {
  const m = prompt.match(new RegExp(`${key}[：:]\\s*([^\\n]+)`));
  return m ? m[1].trim() : '';
}

const DEFAULT_REQUIREMENTS = [
  { category: 'QUALIFICATION', content: '投标人须具备独立法人资格，注册资金不低于500万元', mandatory: true },
  { category: 'QUALIFICATION', content: '投标人须具备ISO9001质量管理体系认证且在有效期内', mandatory: true },
  { category: 'TECHNICAL', content: '提供完整的技术方案，包含总体架构、关键技术路线与实施计划', mandatory: true },
  { category: 'COMMERCIAL', content: '报价须包含全部费用，且不得超过项目预算上限', mandatory: true },
  { category: 'SCORING', content: '技术方案占评分权重40%，重点考察方案的先进性与可落地性', mandatory: false },
  { category: 'DELIVERY', content: '合同签订后90个自然日内完成交付并通过验收', mandatory: true },
  { category: 'DISQUALIFIER', content: '未按要求缴纳投标保证金或密封不符合规定的，按废标处理', mandatory: true },
];

function classifyCategory(text: string): string {
  if (/废标|保证金|密封|不予受理|否决|资格审查不通过/.test(text)) return 'DISQUALIFIER';
  if (/评分|得分|评审|权重|分值|加分/.test(text)) return 'SCORING';
  if (/资格|资质|认证|营业执照|注册资金|业绩|信誉|财务|纳税|社保|诚信/.test(text)) return 'QUALIFICATION';
  if (/报价|价格|费用|付款|税费|投标价|预算/.test(text)) return 'COMMERCIAL';
  if (/交付|工期|验收|进度|实施周期|质保|售后|服务期/.test(text)) return 'DELIVERY';
  return 'TECHNICAL';
}

/** 从用户提示中的「条款如下：」段落提取真实招标条款，生成与之对应的要点 */
function mockRequirements(prompt: string): string {
  const marker = prompt.indexOf('条款如下：');
  const body = marker >= 0 ? prompt.slice(marker + '条款如下：'.length) : '';
  const lines = body
    .split(/\r?\n+/)
    .map((line) => line.replace(/^【[^】]*】/, '').trim())
    .filter((line) => line.length >= 6 && !line.startsWith('（无条款'));
  const picked: { category: string; content: string; mandatory: boolean }[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const content = line.replace(/^\d+[.、)]\s*/, '').slice(0, 160);
    if (content.length < 6 || seen.has(content)) continue;
    seen.add(content);
    picked.push({
      category: classifyCategory(content),
      content,
      mandatory: /须|必须|应|不得|禁止|废标|不予|严禁/.test(content),
    });
    if (picked.length >= 12) break;
  }
  return JSON.stringify(picked.length ? picked : DEFAULT_REQUIREMENTS);
}

function mockResponse(prompt: string): string {
  const req = pick(prompt, '要点') || pick(prompt, '要求') || '招标文件相关要求';
  return JSON.stringify({
    conclusion: 'FULLY_MET',
    content: `完全响应。针对"${req.slice(0, 60)}"，我方郑重承诺完全满足该要求：\n1. 我方已具备相应的资质与履约能力，相关证明材料详见资格证明文件章节；\n2. 结合同类项目成功经验，制定了切实可行的落实措施与责任人安排；\n3. 如遇特殊情况，将第一时间与招标人沟通并提交书面说明，确保不影响项目整体进度。\n（本内容为离线演示 Mock 生成，配置 LLM_API_KEY 后可获得真实模型输出）`,
  });
}

function extractRequirementsFromSection(prompt: string): string[] {
  const block = prompt.split('招标要点：')[1]?.split('应答矩阵摘要：')[0] ?? '';
  return block
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('-'))
    .map((s) => s.replace(/^-\s*\[[^\]]*\]\s*/, '').trim())
    .filter((s) => s.length > 0)
    .slice(0, 6);
}

function mockSection(prompt: string): string {
  const title = pick(prompt, '章节') || pick(prompt, '标题') || '章节内容';
  const reqs = extractRequirementsFromSection(prompt);
  return [
    `${title}`,
    '',
    '一、总体思路',
    '本章围绕招标文件的核心要求展开，遵循"合规、先进、可落地"的编写原则，结合我方在同类项目中的成熟经验，形成系统性响应方案。所有表述均以事实材料为依据，关键指标均予以量化说明。',
    '',
    '二、对招标要求的逐条响应',
    ...(reqs.length
      ? reqs.map((r, i) => `${i + 1}. 针对"${r}"：我方完全响应，已制定明确措施与责任人，并提供可验证的支撑材料。`)
      : ['1. 我方对本项目全部招标要求均作出完全响应，详见对应章节说明。']),
    '',
    '三、方案要点',
    '1. 架构原则：采用分层解耦的总体架构，保证系统的可扩展性与可维护性，各模块职责清晰、接口标准化。',
    '2. 实施路径：按照"调研确认—方案设计—开发实施—联调测试—上线验收"五个阶段推进，每阶段设置明确的里程碑与交付物。',
    '3. 质量保障：建立覆盖全过程的质量控制体系，关键节点实行双人复核，确保交付质量满足验收标准。',
    '',
    '四、保障措施',
    '我方将组建由项目经理牵头的专职团队，配置充足的技术与商务资源；建立周例会与风险预警机制，确保问题及时发现、及时闭环。',
    '',
    '（本章节为离线演示 Mock 生成内容，配置 LLM_API_KEY 后将由真实模型结合企业知识库生成）',
  ].join('\n');
}

function mockRewrite(prompt: string): string {
  const instruction = pick(prompt, '指令') || '优化表达';
  return [
    `【已按指令重写：${instruction.slice(0, 40)}】`,
    '',
    '一、优化后的总体思路',
    `针对"${instruction.slice(0, 30)}"的修改要求，本章在保持合规要点全覆盖的前提下，重新组织了论述结构，突出了量化指标与落地路径，并强化了与我方既有业绩的呼应。`,
    '',
    '二、核心内容',
    '1. 以评分标准为导向组织素材，确保每一个得分点均有明确响应；',
    '2. 关键承诺均给出可验证的支撑材料索引；',
    '3. 语言风格统一为正式、客观、可审计的投标表述。',
    '',
    '（本章节为离线演示 Mock 重写内容）',
  ].join('\n');
}

function mockSelfReview(prompt: string): string {
  const base = 68 + (prompt.length % 18);
  const score = Math.min(96, base);
  return JSON.stringify({
    score,
    lostPoints:
      score < 80
        ? ['部分评分点缺少量化指标支撑', '与招标要点的逐条对应关系不够显式']
        : ['个别段落可进一步精简'],
    suggestions:
      score < 80
        ? ['补充量化数据（工期、人员、性能指标）', '在每个小节开头显式引用对应招标要点编号']
        : ['保持当前结构，微调措辞即可'],
  });
}

function mockEvolve(prompt: string): string {
  const action = pick(prompt, '修订类型') || 'MAJOR_EDIT';
  return JSON.stringify({
    scenario: '标书章节人工修订复盘',
    before: 'AI 初稿按通用模板生成，量化指标不足、风格偏泛化',
    after: `人工修订（${action}）后强化了量化表述与企业事实材料的引用`,
    rule: '编写标书章节时应优先引用知识库中的真实业绩与资质数据，关键承诺须量化，并在段首显式呼应对应招标要点',
    target: 'SEMANTIC_MEMORY',
  });
}

export function mockChat(messages: Msg[], task?: string): string {
  const prompt = lastUser(messages);
  switch (task) {
    case 'extract_requirements':
      return mockRequirements(prompt);
    case 'draft_response':
      return mockResponse(prompt);
    case 'write_section':
      return mockSection(prompt);
    case 'rewrite_section':
      return mockRewrite(prompt);
    case 'self_review':
      return mockSelfReview(prompt);
    case 'evolve':
      return mockEvolve(prompt);
    default:
      return `【Mock 回复】已收到请求，离线演示模式下返回占位内容。提示摘要：${prompt.slice(0, 80)}`;
  }
}
