import { App, Badge, Button, Card, Checkbox, Col, Descriptions, Empty, List, Progress, Row, Space, Statistic, Tabs, Tag, Timeline, Typography, Upload } from 'antd';
import {
  InboxOutlined,
  PlayCircleOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, http } from '../lib/http';
import { useAuthStore } from '../store/auth';
import { stageDict, statusDict, toolDict } from '../lib/dict';
import { ProjectStage, ProjectStatus } from '@bidstrat/shared';
import { RequirementsPanel } from './project/RequirementsPanel';
import { ResponsesPanel } from './project/ResponsesPanel';
import { SectionsPanel } from './project/SectionsPanel';

interface ProjectRow {
  id: string;
  tenderName: string;
  tenderNo: string | null;
  deadline: string | null;
  stage: ProjectStage;
  status: ProjectStatus;
  won: boolean | null;
  remark: string | null;
}

interface TenderDoc {
  id: string;
  projectId: string;
  fileName: string;
  parseStatus: 'PENDING' | 'PARSING' | 'PARSED' | 'FAILED';
  outline: unknown;
  createdAt: string;
}

interface RunEvent {
  type: string;
  message: string;
  stepId?: string;
  runId?: string;
  at: string;
  payload?: unknown;
}

interface AgentRun {
  id: string;
  projectId: string;
  status: 'PENDING' | 'RUNNING' | 'WAITING_HUMAN' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  currentStepId: string | null;
  plan?: { id: string; title: string; status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED' }[];
  totalTokens: number;
  startedAt: string;
  finishedAt: string | null;
}

interface AgentStepRow {
  id: string;
  stepId: string;
  tool: string;
  title: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';
  durationMs: number;
  tokens: number;
  createdAt: string;
}

const ACTIVE_STATUSES: AgentRun['status'][] = ['PENDING', 'RUNNING', 'WAITING_HUMAN'];

const STAGE_PLAN = [
  { key: 'parse', title: '解析招标文件', desc: toolDict.parse_document },
  { key: 'requirements', title: '提取招标要点', desc: toolDict.extract_requirements },
  { key: 'responses', title: '生成应答矩阵', desc: '检索素材并逐条应答' },
  { key: 'write_section', title: '撰写章节内容', desc: toolDict.write_section },
  { key: 'self_review', title: '自评与重写', desc: toolDict.self_review },
  { key: 'compliance', title: '合规与漏项检查', desc: toolDict.compliance_check },
  { key: 'export', title: '导出 Word', desc: toolDict.export_docx },
];

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const { message } = App.useApp();
  const token = useAuthStore((s) => s.token);
  const [activeTab, setActiveTab] = useState(initialTab || 'pipeline');
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [docs, setDocs] = useState<TenderDoc[]>([]);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [lastBeatAt, setLastBeatAt] = useState<number | null>(null);
  /** 默认勾选：在上传的招标源文件上插入应答；取消则新建独立应答文档 */
  const [annotateOnSource, setAnnotateOnSource] = useState(true);
  const esRef = useRef<EventSource | null>(null);
  // 流程序号：run() / loadActiveRun() 每次调用递增；过期 async 结果据此判定后丢弃，避免覆盖新事件流
  const flowSeqRef = useRef(0);
  // 当前跟踪的运行 ID：SSE 按项目名广播，需按 runId 隔离，避免旧 run（含僵尸 run 的迟到事件）污染当前进度显示
  const currentRunIdRef = useRef<string | null>(null);

  const load = async () => {
    if (!id) return;
    const [p, d] = await Promise.all([
      api<ProjectRow>('GET', `/projects/${id}`),
      api<TenderDoc[]>('GET', '/tender-docs', undefined, { params: { projectId: id } }),
    ]);
    setProject(p);
    setDocs(d);
    if (!initialTab) setActiveTab(d.length === 0 ? 'tender' : 'pipeline');
  };

  useEffect(() => {
    load();
  }, [id]);

  const upload = async (file: File) => {
    if (!id) return false;
    const form = new FormData();
    form.append('file', file);
    form.append('projectId', id);
    message.loading({ content: '上传中…', key: 'upload' });
    try {
      await api('POST', '/tender-docs/upload', form, {});
      message.success({ content: '上传成功，正在解析', key: 'upload' });
      setTimeout(load, 1500);
      setTimeout(load, 4000);
    } catch (e: unknown) {
      message.error({ content: e instanceof Error ? e.message : '上传失败', key: 'upload' });
    }
    return false;
  };

  const reparse = async (docId: string) => {
    message.loading({ content: '重新解析中…', key: 'reparse' });
    try {
      await api('POST', `/tender-docs/${docId}/reparse`);
      message.success({ content: '解析完成', key: 'reparse' });
      load();
    } catch (e: unknown) {
      message.error({ content: e instanceof Error ? e.message : '解析失败', key: 'reparse' });
    }
  };

  const closeSSE = () => {
    esRef.current?.close();
    esRef.current = null;
  };

  const connectSSE = () => {
    if (!id) return;
    closeSSE();
    const es = new EventSource(`/api/v1/projects/${id}/events?token=${encodeURIComponent(token || '')}`);
    esRef.current = es;
    es.addEventListener('message', (e) => {
      try {
        const ev = JSON.parse(e.data) as RunEvent;
        // 按 runId 隔离：忽略其它运行（如被 watchdog 标记失败但循环未终止的僵尸 run）的迟到事件；
        // 心跳/活动提示（runId 为空）不受影响
        if (ev.runId && currentRunIdRef.current && ev.runId !== currentRunIdRef.current) return;
        setEvents((prev) => (prev.some((x) => x.at === ev.at && x.message === ev.message) ? prev : [...prev, ev]));
        setLastBeatAt(Date.now());
        if (ev.type === 'run_end') {
          setRunning(false);
          closeSSE();
          load();
        }
      } catch {}
    });
    es.onerror = () => {
      closeSSE();
    };
  };

  /** 用指定 run（或项目最近一次）回放步骤；subscribe=true 时强制订阅 SSE（用于刚点击一键生成） */
  const hydrateRun = async (runId: string | null, opts?: { subscribe?: boolean }) => {
    if (!id) return;
    const mySeq = ++flowSeqRef.current;
    let targetId = runId;
    if (!targetId) {
      const runs = await api<AgentRun[]>('GET', '/agent-runs');
      if (mySeq !== flowSeqRef.current) return;
      const latest = runs
        .filter((r) => r.projectId === id)
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
      if (!latest) return;
      targetId = latest.id;
    }
    try {
      const detail = await api<AgentRun & { steps: AgentStepRow[] }>('GET', `/agent-runs/${targetId}`);
      if (mySeq !== flowSeqRef.current) return;
      currentRunIdRef.current = detail.id;

      const logs: RunEvent[] = detail.steps.map((s) => ({
        type: 'log',
        stepId: s.stepId,
        runId: detail.id,
        message: `${s.status === 'DONE' ? '完成' : s.status === 'FAILED' ? '失败' : '执行'}：${s.title}（${s.durationMs}ms · ${s.tokens}tok）`,
        at: s.createdAt,
      }));
      const seeds: RunEvent[] = (detail.plan ?? [])
        .filter((p) => p.status !== 'PENDING' && p.status !== 'SKIPPED')
        .map((p) => ({
          type: p.status === 'RUNNING' ? 'step_start' : 'step_end',
          stepId: p.id,
          runId: detail.id,
          message:
            p.status === 'FAILED'
              ? `失败：${p.title}`
              : p.status === 'RUNNING'
                ? `进行中：${p.title}`
                : `完成：${p.title}`,
          at: detail.startedAt,
        }));
      setEvents([...logs, ...seeds]);

      const shouldSubscribe = opts?.subscribe || ACTIVE_STATUSES.includes(detail.status);
      if (mySeq === flowSeqRef.current && shouldSubscribe) {
        setRunning(true);
        connectSSE();
      } else if (mySeq === flowSeqRef.current && !ACTIVE_STATUSES.includes(detail.status)) {
        setRunning(false);
      }
    } catch {
      if (mySeq === flowSeqRef.current && opts?.subscribe) {
        // 详情拉取失败时仍订阅，避免卡在「执行中 + 旧成功态」
        connectSSE();
      }
    }
  };

  /** 进入项目时回放最近一次运行 */
  const loadActiveRun = async () => {
    await hydrateRun(null);
  };

  const run = async () => {
    if (!id) return;
    // 立刻清掉上一轮成功/失败态，避免「执行中」却仍显示 7/7 已完成
    ++flowSeqRef.current;
    closeSSE();
    currentRunIdRef.current = null;
    setEvents([]);
    setLastBeatAt(null);
    setRunning(true);
    try {
      const res = await api<{ runId: string; status: string }>('POST', `/projects/${id}/run`, {
        annotateOnSource,
      });
      currentRunIdRef.current = res.runId;
      // 只回放「本次」run；强制订阅 SSE（即使瞬间状态抖动）
      await hydrateRun(res.runId, { subscribe: true });
    } catch (e: unknown) {
      setRunning(false);
      message.error(e instanceof Error ? e.message : '启动失败');
    }
  };

  useEffect(() => {
    load();
    loadActiveRun();
    return () => closeSSE();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const exportNow = async () => {
    if (!id) return;
    message.loading({
      content: annotateOnSource ? '正在源文件上插入应答并导出…' : '正在新建应答文档…',
      key: 'export',
    });
    try {
      await api('POST', `/projects/${id}/export`, { annotateOnSource });
      const resp = await http.get(`/projects/${id}/export/download`, { responseType: 'blob' });
      const blob = resp.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(project?.tenderName || '投标文件').replace(/[\\/:*?"<>|]/g, '_')}-${
        annotateOnSource ? '源文件应答' : '新建应答'
      }.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      message.success({ content: 'Word 文档已开始下载', key: 'export' });
      load();
    } catch (e: unknown) {
      message.error({ content: e instanceof Error ? e.message : '导出失败', key: 'export' });
    }
  };

  if (!project) return <Card loading />;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Typography.Title level={4} style={{ margin: 0 }}>{project.tenderName}</Typography.Title>
            <Space style={{ marginTop: 8 }}>
              <Tag color={stageDict[project.stage]?.color}>{stageDict[project.stage]?.text ?? project.stage}</Tag>
              <Tag color={statusDict[project.status]?.color}>{statusDict[project.status]?.text ?? project.status}</Tag>
              {project.won !== null && (
                <Tag color={project.won ? 'green' : 'red'}>{project.won ? '中标' : '未中标'}</Tag>
              )}
              <span className="muted">{project.tenderNo}</span>
            </Space>
          </Col>
          <Col>
            <Space>
              <Checkbox
                checked={annotateOnSource}
                onChange={(e) => setAnnotateOnSource(e.target.checked)}
                disabled={running}
              >
                在源文件上修改
              </Checkbox>
              <Button icon={<PlayCircleOutlined />} type="primary" loading={running} onClick={run}>
                一键生成
              </Button>
              <Button icon={<DownloadOutlined />} onClick={exportNow}>导出 Word</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'pipeline',
            label: '流水线',
            children: <PipelineTab events={events} running={running} lastBeatAt={lastBeatAt} />,
          },
          {
            key: 'tender',
            label: `招标文件${docs.length ? `(${docs.length})` : ''}`,
            children: (
              <Card title="招标文件（上传后自动解析为条款与要点）">
                <Upload.Dragger
                  multiple={false}
                  showUploadList={false}
                  accept=".pdf,.docx,.doc,.txt,.md"
                  beforeUpload={(file) => {
                    upload(file as unknown as File);
                    return false;
                  }}
                  style={{ marginBottom: 16 }}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">点击或拖拽招标文件到此区域上传</p>
                  <p className="ant-upload-hint">支持 PDF / Word / TXT / Markdown，单个文件最大 100MB</p>
                </Upload.Dragger>
                {docs.length === 0 ? (
                  <Empty description="尚未上传招标文件，请在上方上传" />
                ) : (
                  <List
                    dataSource={docs}
                    renderItem={(d) => (
                      <List.Item
                        actions={[
                          <Tag key="s" color={d.parseStatus === 'PARSED' ? 'green' : d.parseStatus === 'FAILED' ? 'red' : 'blue'}>
                            {d.parseStatus}
                          </Tag>,
                          <Button key="r" size="small" icon={<ReloadOutlined />} onClick={() => reparse(d.id)}>
                            重新解析
                          </Button>,
                        ]}
                      >
                        <List.Item.Meta title={d.fileName} description={`上传于 ${new Date(d.createdAt).toLocaleString()}`} />
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            ),
          },
          { key: 'requirements', label: '招标要点', children: <RequirementsPanel projectId={id!} /> },
          { key: 'responses', label: '应答矩阵', children: <ResponsesPanel projectId={id!} /> },
          { key: 'sections', label: '标书章节', children: <SectionsPanel projectId={id!} /> },
          {
            key: 'overview',
            label: '概览',
            children: (
              <Card>
                <Descriptions column={2} bordered>
                  <Descriptions.Item label="招标项目">{project.tenderName}</Descriptions.Item>
                  <Descriptions.Item label="招标编号">{project.tenderNo || '-'}</Descriptions.Item>
                  <Descriptions.Item label="投标截止">{project.deadline ? new Date(project.deadline).toLocaleString() : '-'}</Descriptions.Item>
                  <Descriptions.Item label="当前阶段">{project.stage}</Descriptions.Item>
                  <Descriptions.Item label="备注" span={2}>{project.remark || '-'}</Descriptions.Item>
                </Descriptions>
                <Typography.Title level={5} style={{ marginTop: 16 }}>项目闭环说明</Typography.Title>
                <Timeline
                  items={[
                    { color: 'green', children: '创建项目 → 上传招标文件 → 自动解析' },
                    { color: 'blue', children: '提取招标要点 → 人工确认 → 生成应答矩阵 → 人工确认' },
                    { color: 'purple', children: '撰写各章节 → 自评与重写 → 合规检查' },
                    { color: 'red', children: '人工定稿 → 保存即采集 diff → 项目归档复盘 → 经验卡审批生效' },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />
    </Space>
  );
}

function PipelineTab({ events, running, lastBeatAt }: { events: RunEvent[]; running: boolean; lastBeatAt: number | null }) {
  type StepState = 'done' | 'running' | 'failed' | 'skipped' | 'pending';
  // 后端计划步骤 id：parse / requirements / responses / write / compliance / export
  const raw: Record<string, StepState> = {};
  for (const id of ['parse', 'requirements', 'responses', 'write', 'compliance', 'export']) raw[id] = 'pending';
  for (const e of events) {
    if (e.type === 'step_start') raw[e.stepId ?? ''] = 'running';
    else if (e.type === 'step_end') {
      if (e.message.includes('失败')) raw[e.stepId ?? ''] = 'failed';
      else raw[e.stepId ?? ''] = 'done';
    }
  }
  // 低优先级信号：step_start 可能因 SSE 建连窗口丢失，但阶段内的活动日志（如“章节…完成”）仍在
  // 此时该阶段实际已在进行 → 把仍为 pending 的步骤点亮为 running（绝不高优先级覆盖 done/failed）
  for (const e of events) {
    if (e.type === 'log' && e.stepId && raw[e.stepId] === 'pending') raw[e.stepId] = 'running';
  }
  // 后端 write 阶段包含「撰写章节 + 自评重写」，映射为前端两个虚拟步骤：
  // write 进行中且已出现自评日志时，撰写视为完成、自评视为进行中
  const reviewing = raw.write === 'running' && events.some((e) => e.type === 'log' && e.stepId === 'write' && e.message.includes('自评'));
  const stepStatus: Record<string, StepState> = {
    parse: raw.parse,
    requirements: raw.requirements,
    responses: raw.responses,
    write_section: raw.write === 'failed' ? 'failed' : raw.write === 'done' ? 'done' : reviewing ? 'done' : raw.write,
    self_review: raw.write === 'done' ? 'done' : raw.write === 'failed' ? 'failed' : reviewing ? 'running' : 'pending',
    compliance: raw.compliance,
    export: raw.export,
  };
  const totalSteps = STAGE_PLAN.length;
  const doneCount = STAGE_PLAN.filter((s) => stepStatus[s.key] === 'done').length;
  const failedCount = STAGE_PLAN.filter((s) => stepStatus[s.key] === 'failed').length;
  const currentStep = STAGE_PLAN.find((s) => stepStatus[s.key] === 'running');
  const percent = Math.round((doneCount / totalSteps) * 100);

  const statusInfo: { color: string; text: string } = failedCount && !running
    ? { color: 'red', text: '失败' }
    : running
    ? { color: 'blue', text: '执行中' }
    : failedCount
    ? { color: 'red', text: '失败' }
    : doneCount === totalSteps
    ? { color: 'green', text: '已完成' }
    : { color: 'default', text: '待开始' };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Space>
                <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
                <span>
                  共 {totalSteps} 步，已完成 <b>{doneCount}</b>
                  {failedCount > 0 && <>，失败 <b style={{ color: '#f5222d' }}>{failedCount}</b></>}
                </span>
                {currentStep && (
                  <span className="muted">
                    当前：<b>{currentStep.title}</b>
                  </span>
                )}
              </Space>
              <Progress
                percent={running && doneCount === totalSteps ? Math.min(99, percent) : percent}
                status={failedCount && !running ? 'exception' : running ? 'active' : doneCount === totalSteps ? 'success' : 'normal'}
                showInfo
              />
            </Space>
          </Col>
          <Col>
            <Space size={24}>
              <Statistic title="总步骤" value={totalSteps} />
              <Statistic title="已完成" value={doneCount} valueStyle={{ color: '#52c41a' }} />
              {failedCount > 0 && <Statistic title="失败" value={failedCount} valueStyle={{ color: '#f5222d' }} />}
            </Space>
          </Col>
        </Row>
      </Card>
      <Row gutter={16}>
        <Col span={14}>
          <Card title="执行步骤">
            <div className="pipeline">
              {STAGE_PLAN.map((s, i) => {
                const st = stepStatus[s.key] ?? 'pending';
                const stateCls = st === 'done' ? 'done' : st === 'failed' ? 'failed' : st === 'running' ? 'running' : '';
                return (
                  <div key={s.key} className={`pipeline-step ${stateCls}`}>
                    <Badge
                      status={st === 'done' ? 'success' : st === 'failed' ? 'error' : st === 'running' ? 'processing' : 'default'}
                    />
                    <div style={{ fontWeight: 600, marginTop: 4 }}>
                      {i + 1}. {s.title}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {s.desc}
                    </div>
                    {st === 'running' && <Tag color="blue" style={{ marginTop: 4 }}>进行中</Tag>}
                    {st === 'done' && <Tag color="green" style={{ marginTop: 4 }}>已完成</Tag>}
                    {st === 'failed' && <Tag color="red" style={{ marginTop: 4 }}>失败</Tag>}
                  </div>
                );
              })}
            </div>
          </Card>
        </Col>
        <Col span={10}>
          <Card
              title={
                <Space>
                  <span>实时事件流</span>
                  <Tag color={lastBeatAt && Date.now() - lastBeatAt < 30_000 ? 'green' : 'default'}>
                    {lastBeatAt ? `连接正常 · 上次心跳 ${new Date(lastBeatAt).toLocaleTimeString()}` : '等待连接'}
                  </Tag>
                </Space>
              }
            >
              <div className="event-log">
                {events.length === 0 && <span style={{ color: '#6b7280' }}>等待运行...</span>}
                {events.map((e, i) =>
                  e.message === '__heartbeat__' ? (
                    <div key={i} style={{ color: '#6b7280' }}>
                      [{new Date(e.at).toLocaleTimeString()}] · 心跳 ·
                    </div>
                  ) : (
                    <div key={i}>
                      [{new Date(e.at).toLocaleTimeString()}] {e.type} {e.stepId ? `(${e.stepId})` : ''} — {e.message}
                    </div>
                  ),
                )}
              </div>
            </Card>
        </Col>
      </Row>
    </Space>
  );
}
